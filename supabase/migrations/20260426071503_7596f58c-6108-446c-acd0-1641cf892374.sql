-- =========================================================
-- 1) PROFILES: skill_points
-- =========================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skill_points INTEGER NOT NULL DEFAULT 0;

-- =========================================================
-- 2) ACTIVITIES: difficulty + breakdown
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.activity_difficulty AS ENUM ('easy','medium','hard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS difficulty public.activity_difficulty NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS base_xp INTEGER,
  ADD COLUMN IF NOT EXISTS multiplier_breakdown JSONB;

-- =========================================================
-- 3) SKILL CATALOG (reference, public-read)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.skill_catalog (
  id           TEXT PRIMARY KEY,
  stat         TEXT NOT NULL,           -- 'intelligence' | 'strength' | 'discipline' | 'charisma'
  label        TEXT NOT NULL,
  description  TEXT NOT NULL,
  parent_id    TEXT REFERENCES public.skill_catalog(id),
  max_level    INTEGER NOT NULL DEFAULT 5,
  cost_per_level INTEGER NOT NULL DEFAULT 1,
  -- effect contract: { kind: 'xp_multiplier' | 'streak_multiplier' | 'penalty_reduction', target?: text, per_level: number }
  effect       JSONB NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.skill_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Skill catalog readable by everyone" ON public.skill_catalog;
CREATE POLICY "Skill catalog readable by everyone"
  ON public.skill_catalog FOR SELECT USING (true);

-- Seed catalog (idempotent)
INSERT INTO public.skill_catalog (id, stat, label, description, parent_id, max_level, cost_per_level, effect, sort_order) VALUES
  -- INTELLIGENCE
  ('int_root',          'intelligence', 'Mental Acuity',   'Foundation of the mind.',                                    NULL,         1, 1, '{"kind":"none"}'::jsonb,                                              1),
  ('learning_speed',    'intelligence', 'Learning Speed',  '+5% XP per level on Study activities.',                      'int_root',   5, 1, '{"kind":"xp_multiplier","target":"study","per_level":0.05}'::jsonb,   2),
  ('focus',             'intelligence', 'Focus',           'Reduces XP penalty from missed days by 5% per level.',       'int_root',   5, 1, '{"kind":"penalty_reduction","target":"missed","per_level":0.05}'::jsonb, 3),
  ('memory',            'intelligence', 'Memory',          'Boosts streak bonus efficiency by 5% per level.',            'int_root',   5, 1, '{"kind":"streak_multiplier","per_level":0.05}'::jsonb,                4),

  -- STRENGTH
  ('str_root',          'strength', 'Vitality',          'Foundation of the body.',                                       NULL,         1, 1, '{"kind":"none"}'::jsonb,                                              1),
  ('endurance',         'strength', 'Endurance',         'Reduces energy drain per task by 5% per level.',                'str_root',   5, 1, '{"kind":"penalty_reduction","target":"energy","per_level":0.05}'::jsonb, 2),
  ('power',             'strength', 'Power',             '+5% XP per level on Workout & Cardio.',                         'str_root',   5, 1, '{"kind":"xp_multiplier","target":"workout,cardio","per_level":0.05}'::jsonb, 3),

  -- DISCIPLINE
  ('dis_root',          'discipline', 'Resolve',          'Foundation of discipline.',                                    NULL,         1, 1, '{"kind":"none"}'::jsonb,                                              1),
  ('consistency_mult',  'discipline', 'Consistency',      'Boosts streak multiplier by 5% per level.',                    'dis_root',   5, 1, '{"kind":"streak_multiplier","per_level":0.05}'::jsonb,                2),
  ('recovery',          'discipline', 'Recovery',         'Reduces inactivity penalty by 5% per level.',                  'dis_root',   5, 1, '{"kind":"penalty_reduction","target":"inactivity","per_level":0.05}'::jsonb, 3),

  -- CHARISMA
  ('cha_root',          'charisma', 'Presence',          'Foundation of social power.',                                   NULL,         1, 1, '{"kind":"none"}'::jsonb,                                              1),
  ('persuasion',        'charisma', 'Persuasion',        '+5% XP per level on Public Speaking.',                          'cha_root',   5, 1, '{"kind":"xp_multiplier","target":"public_speaking","per_level":0.05}'::jsonb, 2),
  ('empathy',           'charisma', 'Empathy',           '+5% XP per level on Socializing.',                              'cha_root',   5, 1, '{"kind":"xp_multiplier","target":"socializing","per_level":0.05}'::jsonb, 3)
ON CONFLICT (id) DO UPDATE SET
  stat = EXCLUDED.stat,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  parent_id = EXCLUDED.parent_id,
  max_level = EXCLUDED.max_level,
  cost_per_level = EXCLUDED.cost_per_level,
  effect = EXCLUDED.effect,
  sort_order = EXCLUDED.sort_order;

-- =========================================================
-- 4) SKILL NODES (per-user level)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.skill_nodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  skill_id    TEXT NOT NULL REFERENCES public.skill_catalog(id) ON DELETE CASCADE,
  level       INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_id)
);

ALTER TABLE public.skill_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Skill nodes viewable by owner" ON public.skill_nodes;
CREATE POLICY "Skill nodes viewable by owner"
  ON public.skill_nodes FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Skill nodes insertable by owner" ON public.skill_nodes;
CREATE POLICY "Skill nodes insertable by owner"
  ON public.skill_nodes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Skill nodes updatable by owner" ON public.skill_nodes;
CREATE POLICY "Skill nodes updatable by owner"
  ON public.skill_nodes FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_skill_nodes_user ON public.skill_nodes(user_id);

-- =========================================================
-- 5) STAT MULTIPLIER HELPER (per activity type)
-- Sums per_level * level for matching xp_multiplier skills.
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_stat_xp_multiplier(p_user UUID, p_type TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus NUMERIC := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT sc.effect, sn.level
    FROM public.skill_nodes sn
    JOIN public.skill_catalog sc ON sc.id = sn.skill_id
    WHERE sn.user_id = p_user
      AND sn.level > 0
      AND sc.effect->>'kind' = 'xp_multiplier'
  LOOP
    -- target may be 'study' or comma-separated 'workout,cardio'
    IF rec.effect->>'target' IS NULL
       OR p_type = rec.effect->>'target'
       OR p_type = ANY(string_to_array(rec.effect->>'target', ','))
    THEN
      v_bonus := v_bonus + (rec.level * (rec.effect->>'per_level')::numeric);
    END IF;
  END LOOP;
  RETURN 1.0 + v_bonus;
END; $$;

-- Streak skill bonus (extra +x per level on streak multiplier)
CREATE OR REPLACE FUNCTION public.get_streak_skill_bonus(p_user UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus NUMERIC := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT sc.effect, sn.level
    FROM public.skill_nodes sn
    JOIN public.skill_catalog sc ON sc.id = sn.skill_id
    WHERE sn.user_id = p_user
      AND sn.level > 0
      AND sc.effect->>'kind' = 'streak_multiplier'
  LOOP
    v_bonus := v_bonus + (rec.level * (rec.effect->>'per_level')::numeric);
  END LOOP;
  RETURN v_bonus;
END; $$;

-- =========================================================
-- 6) NEW XP COMPUTE — base, then full multiplier stack server-side
-- =========================================================
-- Base XP (same tiers as before, used as starting point).
CREATE OR REPLACE FUNCTION public.compute_activity_xp(p_type text, p_subtype text, p_duration integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE d INTEGER := COALESCE(p_duration, 0);
BEGIN
  IF p_type = 'workout' THEN
    IF d >= 60 THEN RETURN 50; ELSIF d >= 45 THEN RETURN 40;
    ELSIF d >= 30 THEN RETURN 25; ELSIF d >= 10 THEN RETURN 10;
    ELSE RETURN 0; END IF;
  ELSIF p_type = 'study' THEN
    IF d >= 60 THEN RETURN 50; ELSIF d >= 30 THEN RETURN 25;
    ELSIF d >= 10 THEN RETURN 10; ELSE RETURN 0; END IF;
  ELSIF p_type = 'public_speaking' THEN
    IF d >= 60 THEN RETURN 50; ELSIF d >= 30 THEN RETURN 30;
    ELSIF d >= 10 THEN RETURN 15; ELSE RETURN 0; END IF;
  ELSIF p_type = 'cardio' THEN
    IF d >= 45 THEN RETURN 50; ELSIF d >= 30 THEN RETURN 30;
    ELSIF d >= 10 THEN RETURN 10; ELSE RETURN 0; END IF;
  ELSIF p_type = 'socializing' THEN
    IF d >= 60 THEN RETURN 35; ELSIF d >= 30 THEN RETURN 20;
    ELSIF d >= 10 THEN RETURN 8; ELSE RETURN 0; END IF;
  ELSIF p_type = 'meditation' THEN
    IF d >= 30 THEN RETURN 30; ELSIF d >= 20 THEN RETURN 20;
    ELSIF d >= 10 THEN RETURN 10; ELSE RETURN 0; END IF;
  END IF;
  RETURN 0;
END; $function$;

-- =========================================================
-- 7) UPDATED log_activity — applies full multiplier stack
-- =========================================================
CREATE OR REPLACE FUNCTION public.log_activity(
  p_type text,
  p_subtype text,
  p_duration integer,
  p_note text DEFAULT NULL::text,
  p_difficulty text DEFAULT 'medium'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_base INTEGER;
  v_existing UUID;
  v_row public.activities;

  -- Profile/streak snapshots
  v_level INTEGER;
  v_xp_now INTEGER;
  v_skill_points INTEGER;
  v_streak_current INTEGER;
  v_streak_last DATE;

  -- Multipliers
  v_diff NUMERIC;
  v_streak_mult NUMERIC;
  v_streak_skill_bonus NUMERIC;
  v_time_bonus NUMERIC;
  v_stat_mult NUMERIC;
  v_diminish NUMERIC := 1.0;

  v_final_xp INTEGER;
  v_breakdown JSONB;

  -- Hour for time-of-day
  v_hour INTEGER := EXTRACT(HOUR FROM now())::int;

  -- Level math
  v_carry INTEGER;
  v_levels_gained INTEGER := 0;
  v_threshold INTEGER;
  v_new_level INTEGER;
  v_new_xp INTEGER;
  v_difficulty_enum public.activity_difficulty;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activity_types WHERE id = p_type) THEN
    RAISE EXCEPTION 'invalid_activity_type';
  END IF;

  v_base := public.compute_activity_xp(p_type, p_subtype, p_duration);
  IF v_base <= 0 THEN RAISE EXCEPTION 'invalid_duration'; END IF;

  -- Duplicate guard
  SELECT id INTO v_existing FROM public.activities
  WHERE user_id = v_user AND type_id = p_type
    AND COALESCE(subtype,'') = COALESCE(p_subtype,'')
    AND activity_date = CURRENT_DATE
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed_today');
  END IF;

  -- Validate / coerce difficulty
  v_difficulty_enum := COALESCE(NULLIF(p_difficulty,'')::public.activity_difficulty, 'medium'::public.activity_difficulty);

  -- Snapshot profile + streak
  SELECT level, xp, skill_points INTO v_level, v_xp_now, v_skill_points
    FROM public.profiles WHERE user_id = v_user;
  SELECT current_streak, last_active_date INTO v_streak_current, v_streak_last
    FROM public.streaks WHERE user_id = v_user;

  -- ---- Multipliers ----
  -- Difficulty
  v_diff := CASE v_difficulty_enum
              WHEN 'easy' THEN 1.0
              WHEN 'medium' THEN 1.5
              WHEN 'hard' THEN 2.0
            END;

  -- Streak: compute what the streak WILL be after this activity
  DECLARE v_proj_streak INTEGER;
  BEGIN
    IF v_streak_last = CURRENT_DATE THEN
      v_proj_streak := COALESCE(v_streak_current, 1);
    ELSIF v_streak_last = CURRENT_DATE - 1 THEN
      v_proj_streak := COALESCE(v_streak_current, 0) + 1;
    ELSE
      v_proj_streak := 1;
    END IF;
    v_streak_skill_bonus := public.get_streak_skill_bonus(v_user);
    -- 1.0 base, +0.1 per consecutive day, hard cap 2.0
    v_streak_mult := LEAST(2.0, 1.0 + (GREATEST(v_proj_streak,1) - 1) * (0.1 + v_streak_skill_bonus));
  END;

  -- Time-of-day bonus
  IF v_hour >= 5 AND v_hour < 10 THEN v_time_bonus := 1.20;
  ELSIF v_hour >= 22 OR v_hour < 2 THEN v_time_bonus := 1.10;
  ELSE v_time_bonus := 1.0; END IF;

  -- Stat multiplier from skill tree
  v_stat_mult := public.get_stat_xp_multiplier(v_user, p_type);

  -- Soft cap: -1% per level above 10, floor at 0.5
  IF v_level > 10 THEN
    v_diminish := GREATEST(0.5, 1.0 - (v_level - 10) * 0.01);
  END IF;

  v_final_xp := GREATEST(1, ROUND(v_base * v_diff * v_streak_mult * v_time_bonus * v_stat_mult * v_diminish));

  v_breakdown := jsonb_build_object(
    'base', v_base,
    'difficulty', v_diff,
    'streak', v_streak_mult,
    'streak_days_projected', GREATEST(1, v_proj_streak),
    'time_of_day', v_time_bonus,
    'stat', v_stat_mult,
    'diminish', v_diminish,
    'final', v_final_xp
  );

  -- Insert activity (XP + breakdown stored)
  INSERT INTO public.activities
    (user_id, type_id, subtype, duration_minutes, xp_gained, base_xp, difficulty, multiplier_breakdown, note, activity_date)
  VALUES
    (v_user, p_type, NULLIF(p_subtype,''), p_duration, v_final_xp, v_base, v_difficulty_enum, v_breakdown, NULLIF(p_note,''), CURRENT_DATE)
  RETURNING * INTO v_row;

  -- Apply XP / level math (carry overflow forward, +3 SP per level)
  v_new_level := v_level;
  v_new_xp := v_xp_now + v_final_xp;
  LOOP
    v_threshold := FLOOR(100 * POWER(v_new_level, 1.5))::int;
    EXIT WHEN v_new_xp < v_threshold;
    v_new_xp := v_new_xp - v_threshold;
    v_new_level := v_new_level + 1;
    v_levels_gained := v_levels_gained + 1;
  END LOOP;

  UPDATE public.profiles
    SET level = v_new_level,
        xp = v_new_xp,
        skill_points = v_skill_points + (v_levels_gained * 3),
        updated_at = now()
    WHERE user_id = v_user;

  -- Update streak server-side too (single source of truth)
  IF v_streak_last IS DISTINCT FROM CURRENT_DATE THEN
    UPDATE public.streaks
      SET current_streak = CASE
            WHEN v_streak_last = CURRENT_DATE - 1 THEN COALESCE(current_streak,0) + 1
            ELSE 1
          END,
          longest_streak = GREATEST(longest_streak, CASE
            WHEN v_streak_last = CURRENT_DATE - 1 THEN COALESCE(current_streak,0) + 1
            ELSE 1
          END),
          last_active_date = CURRENT_DATE,
          updated_at = now()
      WHERE user_id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'activity', to_jsonb(v_row),
    'xp_gained', v_final_xp,
    'breakdown', v_breakdown,
    'levels_gained', v_levels_gained,
    'new_level', v_new_level,
    'new_xp', v_new_xp,
    'skill_points_awarded', v_levels_gained * 3
  );
END; $$;

-- =========================================================
-- 8) UPGRADE SKILL — spend skill points
-- =========================================================
CREATE OR REPLACE FUNCTION public.upgrade_skill(p_skill_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_skill RECORD;
  v_node_level INTEGER;
  v_parent_level INTEGER := 1;
  v_sp INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_skill FROM public.skill_catalog WHERE id = p_skill_id;
  IF v_skill IS NULL THEN RAISE EXCEPTION 'unknown_skill'; END IF;

  -- Parent must have at least level 1 (root nodes are auto level 1 or have NULL parent)
  IF v_skill.parent_id IS NOT NULL THEN
    SELECT COALESCE(level,0) INTO v_parent_level
      FROM public.skill_nodes
      WHERE user_id = v_user AND skill_id = v_skill.parent_id;
    IF COALESCE(v_parent_level,0) < 1 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'parent_locked');
    END IF;
  END IF;

  SELECT COALESCE(level,0) INTO v_node_level
    FROM public.skill_nodes
    WHERE user_id = v_user AND skill_id = p_skill_id;
  v_node_level := COALESCE(v_node_level, 0);

  IF v_node_level >= v_skill.max_level THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'max_level');
  END IF;

  SELECT skill_points INTO v_sp FROM public.profiles WHERE user_id = v_user;
  IF COALESCE(v_sp,0) < v_skill.cost_per_level THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_points');
  END IF;

  INSERT INTO public.skill_nodes (user_id, skill_id, level)
  VALUES (v_user, p_skill_id, v_node_level + 1)
  ON CONFLICT (user_id, skill_id) DO UPDATE
    SET level = EXCLUDED.level, updated_at = now();

  UPDATE public.profiles
    SET skill_points = skill_points - v_skill.cost_per_level,
        updated_at = now()
    WHERE user_id = v_user;

  RETURN jsonb_build_object(
    'ok', true,
    'skill_id', p_skill_id,
    'new_level', v_node_level + 1,
    'remaining_points', COALESCE(v_sp,0) - v_skill.cost_per_level
  );
END; $$;