-- ============================================================
-- Quest System: extend quests + add progress + generator/complete RPCs
-- ============================================================

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE public.quest_type AS ENUM ('daily','weekly','epic','dynamic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.quest_status AS ENUM ('active','completed','failed','paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.quest_energy AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend quests table (additive only)
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS description     TEXT,
  ADD COLUMN IF NOT EXISTS quest_type      public.quest_type   NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS difficulty      INTEGER             NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS linked_stats    TEXT[]              NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS energy          public.quest_energy NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS criteria        JSONB               NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status          public.quest_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expires_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generation_reason TEXT,
  ADD COLUMN IF NOT EXISTS template_key    TEXT;

ALTER TABLE public.quests
  DROP CONSTRAINT IF EXISTS quests_difficulty_range;
ALTER TABLE public.quests
  ADD CONSTRAINT quests_difficulty_range CHECK (difficulty BETWEEN 1 AND 10);

CREATE INDEX IF NOT EXISTS idx_quests_user_status ON public.quests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_quests_user_type   ON public.quests(user_id, quest_type);
CREATE INDEX IF NOT EXISTS idx_quests_user_template_active
  ON public.quests(user_id, template_key)
  WHERE status = 'active';

-- 3) Quest progress table (multi-step tracking)
CREATE TABLE IF NOT EXISTS public.quest_progress (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id     UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  current      INTEGER NOT NULL DEFAULT 0,
  target       INTEGER NOT NULL DEFAULT 1,
  unit         TEXT NOT NULL DEFAULT 'count',  -- count | minutes | xp
  last_event_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quest_id)
);
ALTER TABLE public.quest_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Quest progress viewable by owner" ON public.quest_progress;
CREATE POLICY "Quest progress viewable by owner"
  ON public.quest_progress FOR SELECT TO public USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Quest progress insertable by owner" ON public.quest_progress;
CREATE POLICY "Quest progress insertable by owner"
  ON public.quest_progress FOR INSERT TO public WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Quest progress updatable by owner" ON public.quest_progress;
CREATE POLICY "Quest progress updatable by owner"
  ON public.quest_progress FOR UPDATE TO public USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Quest progress deletable by owner" ON public.quest_progress;
CREATE POLICY "Quest progress deletable by owner"
  ON public.quest_progress FOR DELETE TO public USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_quest_progress_updated_at ON public.quest_progress;
CREATE TRIGGER trg_quest_progress_updated_at
  BEFORE UPDATE ON public.quest_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Internal: quest XP multiplier (mirrors log_activity stack but for quests)
CREATE OR REPLACE FUNCTION public.compute_quest_xp(
  p_user UUID, p_difficulty INTEGER, p_type public.quest_type
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_base INTEGER;
  v_level INTEGER;
  v_streak_current INTEGER;
  v_streak_last DATE;
  v_proj_streak INTEGER;
  v_streak_skill_bonus NUMERIC;
  v_streak_mult NUMERIC;
  v_time_bonus NUMERIC;
  v_diminish NUMERIC := 1.0;
  v_type_mult NUMERIC;
  v_hour INTEGER := EXTRACT(HOUR FROM now())::int;
  v_final INTEGER;
BEGIN
  -- Base XP from difficulty (1..10) — non-linear curve
  v_base := GREATEST(10, ROUND(15 * POWER(p_difficulty, 1.25)));

  -- Quest-type weight
  v_type_mult := CASE p_type
    WHEN 'daily'   THEN 1.00
    WHEN 'weekly'  THEN 1.50
    WHEN 'epic'    THEN 2.25
    WHEN 'dynamic' THEN 1.20
  END;

  SELECT level INTO v_level FROM public.profiles WHERE user_id = p_user;
  SELECT current_streak, last_active_date INTO v_streak_current, v_streak_last
    FROM public.streaks WHERE user_id = p_user;

  IF v_streak_last = CURRENT_DATE THEN
    v_proj_streak := COALESCE(v_streak_current, 1);
  ELSIF v_streak_last = CURRENT_DATE - 1 THEN
    v_proj_streak := COALESCE(v_streak_current, 0) + 1;
  ELSE
    v_proj_streak := 1;
  END IF;

  v_streak_skill_bonus := public.get_streak_skill_bonus(p_user);
  v_streak_mult := LEAST(2.0, 1.0 + (GREATEST(v_proj_streak,1) - 1) * (0.1 + v_streak_skill_bonus));

  IF v_hour >= 5 AND v_hour < 10 THEN v_time_bonus := 1.20;
  ELSIF v_hour >= 22 OR v_hour < 2 THEN v_time_bonus := 1.10;
  ELSE v_time_bonus := 1.0; END IF;

  IF v_level > 10 THEN v_diminish := GREATEST(0.5, 1.0 - (v_level - 10) * 0.01); END IF;

  v_final := GREATEST(1, ROUND(v_base * v_type_mult * v_streak_mult * v_time_bonus * v_diminish));

  RETURN jsonb_build_object(
    'base', v_base, 'type_mult', v_type_mult,
    'streak', v_streak_mult, 'time_of_day', v_time_bonus, 'diminish', v_diminish,
    'final', v_final
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.compute_quest_xp(UUID, INTEGER, public.quest_type) TO authenticated;

-- 5) complete_quest RPC
CREATE OR REPLACE FUNCTION public.complete_quest(p_quest_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_quest public.quests;
  v_xp_calc jsonb;
  v_xp INTEGER;
  v_level INTEGER; v_xp_now INTEGER; v_skill_points INTEGER;
  v_new_level INTEGER; v_new_xp INTEGER; v_threshold INTEGER; v_levels_gained INTEGER := 0;
  v_stat TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id AND user_id = v_user;
  IF v_quest.id IS NULL THEN RAISE EXCEPTION 'quest_not_found'; END IF;
  IF v_quest.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed');
  END IF;

  v_xp_calc := public.compute_quest_xp(v_user, v_quest.difficulty, v_quest.quest_type);
  v_xp := (v_xp_calc->>'final')::int;

  -- Mark quest completed
  UPDATE public.quests
    SET status = 'completed', completed = true, completed_at = now(), reward_xp = v_xp
    WHERE id = p_quest_id;

  -- Apply XP + level math
  SELECT level, xp, skill_points INTO v_level, v_xp_now, v_skill_points
    FROM public.profiles WHERE user_id = v_user;
  v_new_level := v_level;
  v_new_xp := v_xp_now + v_xp;
  LOOP
    v_threshold := FLOOR(100 * POWER(v_new_level, 1.5))::int;
    EXIT WHEN v_new_xp < v_threshold;
    v_new_xp := v_new_xp - v_threshold;
    v_new_level := v_new_level + 1;
    v_levels_gained := v_levels_gained + 1;
  END LOOP;

  UPDATE public.profiles
    SET level = v_new_level, xp = v_new_xp,
        skill_points = v_skill_points + (v_levels_gained * 3),
        updated_at = now()
    WHERE user_id = v_user;

  -- Bump linked stats by +1 each (capped per quest)
  IF array_length(v_quest.linked_stats, 1) IS NOT NULL THEN
    FOREACH v_stat IN ARRAY v_quest.linked_stats LOOP
      IF v_stat IN ('intelligence','strength','discipline','charisma') THEN
        EXECUTE format('UPDATE public.stats SET %I = %I + 1, updated_at = now() WHERE user_id = $1', v_stat, v_stat)
          USING v_user;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'xp_gained', v_xp,
    'breakdown', v_xp_calc,
    'levels_gained', v_levels_gained,
    'new_level', v_new_level,
    'new_xp', v_new_xp,
    'skill_points_awarded', v_levels_gained * 3
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.complete_quest(UUID) TO authenticated;

-- 6) Auto-progress trigger when activities are logged
CREATE OR REPLACE FUNCTION public.tick_quest_progress()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  qp RECORD;
  v_match BOOLEAN;
  v_increment INTEGER;
  v_target INTEGER;
  v_done BOOLEAN;
BEGIN
  -- Iterate active progress rows for the user
  FOR qp IN
    SELECT q.id AS quest_id, q.criteria, q.quest_type, q.linked_stats,
           p.id AS progress_id, p.current, p.target, p.unit
    FROM public.quests q
    JOIN public.quest_progress p ON p.quest_id = q.id
    WHERE q.user_id = NEW.user_id AND q.status = 'active'
  LOOP
    v_match := TRUE;
    -- criteria.type_id (single string OR array) must match
    IF qp.criteria ? 'type_id' THEN
      IF jsonb_typeof(qp.criteria->'type_id') = 'array' THEN
        v_match := v_match AND (NEW.type_id = ANY(ARRAY(SELECT jsonb_array_elements_text(qp.criteria->'type_id'))));
      ELSE
        v_match := v_match AND (NEW.type_id = (qp.criteria->>'type_id'));
      END IF;
    END IF;
    -- criteria.min_duration
    IF qp.criteria ? 'min_duration' THEN
      v_match := v_match AND (COALESCE(NEW.duration_minutes,0) >= (qp.criteria->>'min_duration')::int);
    END IF;
    -- criteria.difficulty (only credit if at least this difficulty)
    IF qp.criteria ? 'min_difficulty' THEN
      v_match := v_match AND (NEW.difficulty::text >= (qp.criteria->>'min_difficulty'));
    END IF;

    IF NOT v_match THEN CONTINUE; END IF;

    v_increment := CASE qp.unit
      WHEN 'minutes' THEN COALESCE(NEW.duration_minutes, 0)
      WHEN 'xp'      THEN COALESCE(NEW.xp_gained, 0)
      ELSE 1
    END;
    IF v_increment <= 0 THEN CONTINUE; END IF;

    UPDATE public.quest_progress
      SET current = LEAST(target, current + v_increment),
          last_event_at = now(),
          updated_at = now()
      WHERE id = qp.progress_id
      RETURNING (current >= target) INTO v_done;

    IF v_done THEN
      -- Auto-complete the quest server-side
      PERFORM public.complete_quest(qp.quest_id);
    END IF;
  END LOOP;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_tick_quest_progress ON public.activities;
CREATE TRIGGER trg_tick_quest_progress
  AFTER INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.tick_quest_progress();

-- 7) generate_quests RPC — template pool driven by behavior profile
CREATE OR REPLACE FUNCTION public.generate_quests(p_force BOOLEAN DEFAULT FALSE)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_active_count INTEGER;

  v_profile JSONB;
  v_consistency NUMERIC;
  v_burnout NUMERIC;
  v_status TEXT;

  v_target_count INTEGER;
  v_diff_offset INTEGER := 0;
  v_recovery BOOLEAN := FALSE;

  v_inserted JSONB := '[]'::jsonb;
  v_quest RECORD;
  v_template RECORD;
  v_diff INTEGER;
  v_xp_calc JSONB;
  v_reason TEXT;
  v_dedup_key TEXT;
  v_target_value INTEGER;
  v_unit TEXT;
  v_existing_keys TEXT[];
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- If we already have plenty of active quests today, exit (unless forced)
  SELECT COUNT(*) INTO v_active_count
  FROM public.quests
  WHERE user_id = v_user AND status = 'active'
    AND quest_type IN ('daily','weekly','epic')
    AND (expires_at IS NULL OR expires_at > now());
  IF v_active_count >= 5 AND NOT p_force THEN
    RETURN jsonb_build_object('ok', true, 'generated', 0, 'reason', 'enough_active_quests');
  END IF;

  -- Pull behavior profile (best-effort)
  BEGIN
    v_profile := public.get_behavior_profile();
  EXCEPTION WHEN OTHERS THEN
    v_profile := '{}'::jsonb;
  END;
  v_consistency := COALESCE((v_profile->>'consistency_score')::numeric, 50);
  v_burnout     := COALESCE((v_profile->>'burnout_score')::numeric, 0);
  v_status      := COALESCE(v_profile->>'status', 'normal');

  -- Adaptive shaping
  IF v_status IN ('burnout','inactive') THEN
    v_recovery := TRUE; v_target_count := 3; v_diff_offset := -2;
  ELSIF v_consistency >= 80 AND v_burnout < 30 THEN
    v_target_count := 6; v_diff_offset := 1;
  ELSIF v_consistency < 40 THEN
    v_target_count := 4; v_diff_offset := -1;
  ELSE
    v_target_count := 5;
  END IF;

  v_target_count := GREATEST(0, v_target_count - v_active_count);
  IF v_target_count <= 0 AND NOT p_force THEN
    RETURN jsonb_build_object('ok', true, 'generated', 0, 'reason', 'enough_active_quests');
  END IF;
  IF p_force AND v_target_count <= 0 THEN v_target_count := 3; END IF;

  -- Existing template keys still active → avoid repetition
  SELECT COALESCE(array_agg(template_key), '{}') INTO v_existing_keys
  FROM public.quests
  WHERE user_id = v_user AND status = 'active' AND template_key IS NOT NULL;

  -- Curated template pool
  CREATE TEMP TABLE _tpl (
    key TEXT, qtype public.quest_type, base_diff INT, energy public.quest_energy,
    title TEXT, description TEXT, type_id TEXT, min_duration INT,
    target_value INT, unit TEXT, linked_stats TEXT[], recovery_ok BOOLEAN
  ) ON COMMIT DROP;

  INSERT INTO _tpl VALUES
   -- DAILY
   ('daily_workout_30',   'daily', 4, 'medium', 'Train your body', 'Complete a workout of at least 30 min.', 'workout', 30, 1, 'count', ARRAY['strength','discipline'], FALSE),
   ('daily_cardio_20',    'daily', 3, 'medium', 'Get the heart up', 'Cardio session 20+ min.', 'cardio', 20, 1, 'count', ARRAY['strength','discipline'], FALSE),
   ('daily_study_30',     'daily', 4, 'medium', 'Sharpen the mind', 'Study for at least 30 min.', 'study', 30, 1, 'count', ARRAY['intelligence','discipline'], FALSE),
   ('daily_meditate_10',  'daily', 2, 'low',    'Breathe & reset', 'Meditate for 10+ min.', 'meditation', 10, 1, 'count', ARRAY['discipline'], TRUE),
   ('daily_social_30',    'daily', 3, 'low',    'Stay connected', 'A 30 min meaningful social interaction.', 'socializing', 30, 1, 'count', ARRAY['charisma'], TRUE),
   ('daily_speak_10',     'daily', 5, 'high',   'Speak up', 'Public speaking practice 10+ min.', 'public_speaking', 10, 1, 'count', ARRAY['charisma','discipline'], FALSE),
   -- WEEKLY
   ('weekly_workouts_5',  'weekly', 6, 'high',  'Iron Discipline', 'Complete 5 workouts this week.', 'workout', 20, 5, 'count', ARRAY['strength','discipline'], FALSE),
   ('weekly_study_300',   'weekly', 6, 'medium','Scholar''s Pact', 'Accumulate 300 min of study this week.', 'study', NULL, 300, 'minutes', ARRAY['intelligence'], FALSE),
   ('weekly_cardio_120',  'weekly', 5, 'medium','Endurance Run',  'Accumulate 120 min of cardio this week.', 'cardio', NULL, 120, 'minutes', ARRAY['strength'], FALSE),
   ('weekly_recovery_5',  'weekly', 3, 'low',   'Mind Garden',    '5 meditations this week.', 'meditation', 10, 5, 'count', ARRAY['discipline'], TRUE),
   -- EPIC
   ('epic_30day_disc',    'epic', 8, 'high',   '30-Day Discipline','Train OR study 25 days in the next 30.', NULL, NULL, 25, 'count', ARRAY['discipline'], FALSE),
   ('epic_xp_2000',       'epic', 7, 'medium', 'XP Marathon',     'Earn 2000 XP across all activities.', NULL, NULL, 2000, 'xp', ARRAY['discipline'], FALSE);

  -- Pick templates: filter by recovery mode + difficulty band, skip dupes
  FOR v_template IN
    SELECT * FROM _tpl
    WHERE (NOT v_recovery OR recovery_ok = TRUE)
      AND key <> ALL(v_existing_keys)
    ORDER BY random()
    LIMIT v_target_count
  LOOP
    v_diff := GREATEST(1, LEAST(10, v_template.base_diff + v_diff_offset));
    v_xp_calc := public.compute_quest_xp(v_user, v_diff, v_template.qtype);

    v_target_value := v_template.target_value;
    v_unit := v_template.unit;
    v_dedup_key := v_template.key;
    v_reason := format(
      'consistency=%s burnout=%s status=%s offset=%s recovery=%s',
      ROUND(v_consistency)::text, ROUND(v_burnout)::text, v_status,
      v_diff_offset::text, v_recovery::text
    );

    INSERT INTO public.quests (
      user_id, title, description, quest_type, difficulty, linked_stats, energy,
      criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key
    ) VALUES (
      v_user, v_template.title, v_template.description, v_template.qtype, v_diff,
      v_template.linked_stats, v_template.energy,
      jsonb_strip_nulls(jsonb_build_object(
        'type_id', v_template.type_id,
        'min_duration', v_template.min_duration
      )),
      'active',
      (v_xp_calc->>'final')::int,
      (v_template.qtype = 'daily'),
      CASE v_template.qtype
        WHEN 'daily'  THEN (v_today + 1)::timestamptz
        WHEN 'weekly' THEN now() + INTERVAL '7 days'
        WHEN 'epic'   THEN now() + INTERVAL '30 days'
        ELSE NULL
      END,
      v_reason,
      v_dedup_key
    ) RETURNING * INTO v_quest;

    -- Progress row (target depends on template)
    INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
    VALUES (v_quest.id, v_user, 0, v_target_value, v_unit);

    v_inserted := v_inserted || jsonb_build_object(
      'id', v_quest.id, 'title', v_quest.title, 'type', v_quest.quest_type,
      'difficulty', v_quest.difficulty, 'reward_xp', v_quest.reward_xp,
      'reason', v_reason
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'generated', jsonb_array_length(v_inserted),
    'quests', v_inserted,
    'shaping', jsonb_build_object(
      'target_count', v_target_count, 'diff_offset', v_diff_offset, 'recovery', v_recovery,
      'consistency', v_consistency, 'burnout', v_burnout, 'status', v_status
    )
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.generate_quests(BOOLEAN) TO authenticated;

-- 8) Internal helper used by edge function: insert a single dynamic quest
CREATE OR REPLACE FUNCTION public.insert_dynamic_quest(
  p_title TEXT,
  p_description TEXT,
  p_difficulty INTEGER,
  p_energy public.quest_energy,
  p_linked_stats TEXT[],
  p_criteria JSONB,
  p_target INTEGER,
  p_unit TEXT,
  p_reason TEXT
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_quest public.quests;
  v_xp_calc JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_difficulty < 1 OR p_difficulty > 10 THEN RAISE EXCEPTION 'invalid_difficulty'; END IF;

  v_xp_calc := public.compute_quest_xp(v_user, p_difficulty, 'dynamic');

  INSERT INTO public.quests (
    user_id, title, description, quest_type, difficulty, linked_stats, energy,
    criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key
  ) VALUES (
    v_user, p_title, p_description, 'dynamic', p_difficulty,
    COALESCE(p_linked_stats, '{}'::text[]), COALESCE(p_energy,'medium'),
    COALESCE(p_criteria, '{}'::jsonb), 'active',
    (v_xp_calc->>'final')::int, FALSE,
    now() + INTERVAL '2 days', p_reason,
    'dynamic_ai'
  ) RETURNING * INTO v_quest;

  INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
  VALUES (v_quest.id, v_user, 0, GREATEST(1, COALESCE(p_target,1)), COALESCE(p_unit,'count'));

  RETURN jsonb_build_object('ok', true, 'quest', to_jsonb(v_quest), 'xp', v_xp_calc);
END; $$;

GRANT EXECUTE ON FUNCTION public.insert_dynamic_quest(TEXT, TEXT, INTEGER, public.quest_energy, TEXT[], JSONB, INTEGER, TEXT, TEXT) TO authenticated;