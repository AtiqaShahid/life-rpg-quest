-- ============================================================
-- CHARACTER SYSTEM: Classes + Status Effects
-- ============================================================

-- 1. Class enum + profile columns
CREATE TYPE public.character_class AS ENUM ('scholar', 'warrior', 'creator', 'leader');

ALTER TABLE public.profiles
  ADD COLUMN class_type public.character_class,
  ADD COLUMN class_changed_at timestamptz;

-- 2. Status effects table
CREATE TYPE public.status_effect_kind AS ENUM ('burnout', 'flow_state', 'fatigue');

CREATE TABLE public.user_status_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.status_effect_kind NOT NULL,
  multiplier numeric NOT NULL DEFAULT 1.0,
  difficulty_modifier numeric NOT NULL DEFAULT 0,
  reason text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_status_effects_user_active
  ON public.user_status_effects(user_id, active, expires_at);

ALTER TABLE public.user_status_effects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Status effects viewable by owner"
  ON public.user_status_effects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Status effects insertable by owner"
  ON public.user_status_effects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Status effects updatable by owner"
  ON public.user_status_effects FOR UPDATE
  USING (auth.uid() = user_id);

-- 3. Class config table (read-only catalog)
CREATE TABLE public.class_catalog (
  id public.character_class PRIMARY KEY,
  name text NOT NULL,
  tagline text NOT NULL,
  description text NOT NULL,
  strengths text[] NOT NULL DEFAULT '{}',
  weaknesses text[] NOT NULL DEFAULT '{}',
  icon text NOT NULL DEFAULT '⭐',
  color text NOT NULL DEFAULT 'primary',
  -- xp_modifiers: { "<type_id>": 1.2, "all": 1.0, "party": 1.0 }
  xp_modifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.class_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Class catalog readable by everyone"
  ON public.class_catalog FOR SELECT USING (true);

INSERT INTO public.class_catalog (id, name, tagline, description, strengths, weaknesses, icon, color, xp_modifiers, meta) VALUES
  ('scholar', 'Scholar', 'The Mind Forged in Knowledge',
   'Masters of focused study and deep thought. Scholars convert hours of learning into raw cognitive power.',
   ARRAY['+20% XP on study quests', 'Faster intelligence growth'],
   ARRAY['No bonus on physical tasks', 'No bonus on social tasks'],
   '📚', 'secondary',
   '{"study": 1.20, "all": 1.0}'::jsonb,
   '{"primary_stat": "intelligence"}'::jsonb),
  ('warrior', 'Warrior', 'Iron Will, Iron Body',
   'Disciplined and relentless. Warriors thrive on consistency — their streaks bend rather than break.',
   ARRAY['+15% XP on fitness/cardio', 'Streaks decay slower (1-day grace)'],
   ARRAY['No bonus on study tasks'],
   '⚔️', 'accent',
   '{"workout": 1.15, "cardio": 1.15, "all": 1.0, "streak_grace_days": 1}'::jsonb,
   '{"primary_stat": "strength"}'::jsonb),
  ('creator', 'Creator', 'Build, Ship, Repeat',
   'Output-focused makers. Creators earn the most from finishing things — writing, building, producing.',
   ARRAY['+25% XP on completed quests', '+15% XP on study'],
   ARRAY['No bonus on passive activities'],
   '🎨', 'primary',
   '{"study": 1.15, "all": 1.0, "quest_completion": 1.25}'::jsonb,
   '{"primary_stat": "intelligence"}'::jsonb),
  ('leader', 'Leader', 'Rise Together',
   'Charismatic generalists. Leaders gain a steady bonus everywhere and earn extra XP from party contributions.',
   ARRAY['+10% XP on all tasks', '+20% XP from party activity'],
   ARRAY['No specialization peak'],
   '👑', 'primary',
   '{"all": 1.10, "party": 1.20}'::jsonb,
   '{"primary_stat": "charisma"}'::jsonb);

-- 4. Rename fatigue -> exhaustion in profiles for clarity
ALTER TABLE public.profiles RENAME COLUMN fatigue TO exhaustion;
ALTER TABLE public.profiles RENAME COLUMN fatigue_updated_at TO exhaustion_updated_at;

-- Update legacy functions that referenced fatigue
CREATE OR REPLACE FUNCTION public.get_fatigue_multiplier(p_fatigue integer)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(0.5, 1.0 - (COALESCE(p_fatigue, 0)::numeric / 200));
$$;

CREATE OR REPLACE FUNCTION public.recover_fatigue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_ex INT;
  v_last TIMESTAMPTZ;
  v_minutes INT;
  v_recovered INT;
  v_new INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT exhaustion, exhaustion_updated_at INTO v_ex, v_last
    FROM public.profiles WHERE user_id = v_user;
  v_minutes := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_last))::int / 60);
  v_recovered := v_minutes / 10;
  IF v_recovered <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'exhaustion', v_ex);
  END IF;
  v_new := GREATEST(0, COALESCE(v_ex,0) - v_recovered);
  UPDATE public.profiles SET exhaustion = v_new, exhaustion_updated_at = now(), updated_at = now()
    WHERE user_id = v_user;
  RETURN jsonb_build_object('ok', true, 'exhaustion', v_new, 'recovered', v_recovered);
END $function$;

-- 5. Get active class multiplier for an activity type
CREATE OR REPLACE FUNCTION public.get_class_xp_multiplier(p_user uuid, p_type text)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_class public.character_class;
  v_mods jsonb;
  v_mult numeric := 1.0;
  v_type_mult numeric;
  v_all_mult numeric;
BEGIN
  SELECT class_type INTO v_class FROM public.profiles WHERE user_id = p_user;
  IF v_class IS NULL THEN RETURN 1.0; END IF;

  SELECT xp_modifiers INTO v_mods FROM public.class_catalog WHERE id = v_class;
  IF v_mods IS NULL THEN RETURN 1.0; END IF;

  v_type_mult := COALESCE((v_mods->>p_type)::numeric, 1.0);
  v_all_mult  := COALESCE((v_mods->>'all')::numeric, 1.0);

  -- Use the larger of type-specific or "all" (don't stack — pick best)
  v_mult := GREATEST(v_type_mult, v_all_mult);
  RETURN v_mult;
END; $$;

-- 6. Get active status effect XP multiplier (combined)
CREATE OR REPLACE FUNCTION public.get_status_xp_multiplier(p_user uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_mult numeric := 1.0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT multiplier FROM public.user_status_effects
    WHERE user_id = p_user AND active = true AND expires_at > now()
  LOOP
    v_mult := v_mult * rec.multiplier;
  END LOOP;
  -- Cap combined modifier between 0.5 and 2.0
  RETURN GREATEST(0.5, LEAST(2.0, v_mult));
END; $$;

-- 7. Get status difficulty modifier (sum, for fatigue auto-lowering quest difficulty)
CREATE OR REPLACE FUNCTION public.get_status_difficulty_modifier(p_user uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(difficulty_modifier), 0)
  FROM public.user_status_effects
  WHERE user_id = p_user AND active = true AND expires_at > now();
$$;

-- 8. Select / change class
CREATE OR REPLACE FUNCTION public.select_character_class(
  p_class public.character_class,
  p_pay_to_skip boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_current public.character_class;
  v_changed timestamptz;
  v_coins int;
  v_cooldown_days int := 7;
  v_skip_cost int := 500;
  v_days_left numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.class_catalog WHERE id = p_class) THEN
    RAISE EXCEPTION 'invalid_class';
  END IF;

  SELECT class_type, class_changed_at, coins
    INTO v_current, v_changed, v_coins
  FROM public.profiles WHERE user_id = v_user;

  -- First-time selection: free, no cooldown
  IF v_current IS NULL THEN
    UPDATE public.profiles
      SET class_type = p_class, class_changed_at = now(), updated_at = now()
      WHERE user_id = v_user;
    RETURN jsonb_build_object('ok', true, 'class', p_class, 'first_time', true);
  END IF;

  IF v_current = p_class THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'same_class');
  END IF;

  -- Cooldown check
  IF v_changed IS NOT NULL AND v_changed > now() - (v_cooldown_days || ' days')::interval THEN
    IF p_pay_to_skip THEN
      IF COALESCE(v_coins, 0) < v_skip_cost THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_coins', 'cost', v_skip_cost);
      END IF;
      UPDATE public.profiles
        SET coins = coins - v_skip_cost,
            class_type = p_class,
            class_changed_at = now(),
            updated_at = now()
        WHERE user_id = v_user;
      RETURN jsonb_build_object('ok', true, 'class', p_class, 'paid', v_skip_cost);
    ELSE
      v_days_left := EXTRACT(EPOCH FROM ((v_changed + (v_cooldown_days || ' days')::interval) - now())) / 86400;
      RETURN jsonb_build_object('ok', false, 'reason', 'cooldown', 'days_remaining', ROUND(v_days_left, 2), 'skip_cost', v_skip_cost);
    END IF;
  END IF;

  UPDATE public.profiles
    SET class_type = p_class, class_changed_at = now(), updated_at = now()
    WHERE user_id = v_user;
  RETURN jsonb_build_object('ok', true, 'class', p_class);
END; $$;

-- 9. Status effect evaluator — analyzes behavior, applies/removes effects
CREATE OR REPLACE FUNCTION public.evaluate_status_effects(p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := COALESCE(p_user, auth.uid());
  v_today date := CURRENT_DATE;
  v_active_days_7 int;
  v_active_days_3 int;
  v_active_days_prev3 int;
  v_completion_rate numeric;
  v_recent_xp int;
  v_prev_xp int;
  v_decline numeric := 0;
  v_streak int;
  v_exhaustion int;
  v_applied jsonb := '[]'::jsonb;
  v_removed int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Expire stale effects
  WITH ex AS (
    UPDATE public.user_status_effects SET active = false
    WHERE user_id = v_user AND active = true AND expires_at <= now()
    RETURNING id
  ) SELECT COUNT(*) INTO v_removed FROM ex;

  -- Activity in last 7 / 3 days
  SELECT COUNT(DISTINCT activity_date) INTO v_active_days_7
    FROM public.activities WHERE user_id = v_user AND activity_date >= v_today - 6;
  SELECT COUNT(DISTINCT activity_date) INTO v_active_days_3
    FROM public.activities WHERE user_id = v_user AND activity_date >= v_today - 2;
  SELECT COUNT(DISTINCT activity_date) INTO v_active_days_prev3
    FROM public.activities WHERE user_id = v_user
      AND activity_date BETWEEN v_today - 5 AND v_today - 3;

  -- XP recent vs prior 3 days
  SELECT COALESCE(SUM(xp_gained),0) INTO v_recent_xp
    FROM public.activities WHERE user_id = v_user AND activity_date >= v_today - 2;
  SELECT COALESCE(SUM(xp_gained),0) INTO v_prev_xp
    FROM public.activities WHERE user_id = v_user
      AND activity_date BETWEEN v_today - 5 AND v_today - 3;
  IF v_prev_xp > 0 THEN
    v_decline := GREATEST(0, (v_prev_xp - v_recent_xp)::numeric / v_prev_xp);
  END IF;

  -- Quest completion rate (last 7 days)
  SELECT CASE WHEN COUNT(*) = 0 THEN 0
              ELSE SUM(CASE WHEN completed THEN 1 ELSE 0 END)::numeric / COUNT(*)
         END
    INTO v_completion_rate
  FROM public.quests
  WHERE user_id = v_user AND created_at >= now() - interval '7 days';

  SELECT current_streak INTO v_streak FROM public.streaks WHERE user_id = v_user;
  SELECT exhaustion INTO v_exhaustion FROM public.profiles WHERE user_id = v_user;

  -- Clear today's auto-evaluated effects so we can re-apply with fresh state
  UPDATE public.user_status_effects SET active = false
  WHERE user_id = v_user AND active = true
    AND reason LIKE 'auto:%';

  -- BURNOUT: high prior activity + sudden drop OR high exhaustion + low completion
  IF (v_active_days_prev3 >= 3 AND v_decline >= 0.5)
     OR (COALESCE(v_exhaustion,0) >= 70 AND v_completion_rate < 0.4) THEN
    INSERT INTO public.user_status_effects (user_id, kind, multiplier, reason, expires_at)
    VALUES (v_user, 'burnout', 0.80,
            'auto: high intensity followed by sharp drop — rest is needed',
            now() + interval '48 hours');
    v_applied := v_applied || jsonb_build_object('kind', 'burnout');

  -- FLOW STATE: 5+ active days in last 7, completion >= 80%, streak >= 3
  ELSIF v_active_days_7 >= 5 AND v_completion_rate >= 0.8 AND COALESCE(v_streak,0) >= 3 THEN
    INSERT INTO public.user_status_effects (user_id, kind, multiplier, reason, expires_at)
    VALUES (v_user, 'flow_state', 1.25,
            'auto: consistent execution + high completion — you are in the zone',
            now() + interval '24 hours');
    v_applied := v_applied || jsonb_build_object('kind', 'flow_state');

  -- FATIGUE (status): inconsistent (1-2 active days in last 3) + low completion → ease difficulty
  ELSIF v_active_days_3 <= 1 AND v_completion_rate < 0.5 THEN
    INSERT INTO public.user_status_effects (user_id, kind, multiplier, difficulty_modifier, reason, expires_at)
    VALUES (v_user, 'fatigue', 1.0, -1,
            'auto: inconsistent activity — quest difficulty eased to help you re-engage',
            now() + interval '72 hours');
    v_applied := v_applied || jsonb_build_object('kind', 'fatigue');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'applied', v_applied,
    'expired', v_removed,
    'signals', jsonb_build_object(
      'active_days_7', v_active_days_7,
      'active_days_3', v_active_days_3,
      'completion_rate', ROUND(COALESCE(v_completion_rate,0)*100, 1),
      'xp_decline_pct', ROUND(v_decline*100, 1),
      'streak', v_streak,
      'exhaustion', v_exhaustion
    )
  );
END; $$;

-- 10. Patch log_activity to apply class + status modifiers
CREATE OR REPLACE FUNCTION public.log_activity(p_type text, p_subtype text, p_duration integer, p_note text DEFAULT NULL::text, p_difficulty text DEFAULT 'medium'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_base INTEGER;
  v_existing UUID;
  v_row public.activities;

  v_level INTEGER;
  v_xp_now INTEGER;
  v_skill_points INTEGER;
  v_coins_now INTEGER;
  v_exhaustion INTEGER;
  v_streak_current INTEGER;
  v_streak_last DATE;

  v_diff NUMERIC;
  v_streak_mult NUMERIC;
  v_streak_skill_bonus NUMERIC;
  v_time_bonus NUMERIC;
  v_stat_mult NUMERIC;
  v_diminish NUMERIC := 1.0;
  v_repeat_mult NUMERIC;
  v_boost_mult NUMERIC;
  v_fatigue_mult NUMERIC;
  v_class_mult NUMERIC;
  v_status_mult NUMERIC;
  v_exhaustion_added INT;

  v_final_xp INTEGER;
  v_coins_earned INTEGER;
  v_breakdown JSONB;

  v_hour INTEGER := EXTRACT(HOUR FROM now())::int;
  v_levels_gained INTEGER := 0;
  v_threshold INTEGER;
  v_new_level INTEGER;
  v_new_xp INTEGER;
  v_difficulty_enum public.activity_difficulty;
  v_proj_streak INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activity_types WHERE id = p_type) THEN
    RAISE EXCEPTION 'invalid_activity_type';
  END IF;

  v_base := public.compute_activity_xp(p_type, p_subtype, p_duration);
  IF v_base <= 0 THEN RAISE EXCEPTION 'invalid_duration'; END IF;

  SELECT id INTO v_existing FROM public.activities
  WHERE user_id = v_user AND type_id = p_type
    AND COALESCE(subtype,'') = COALESCE(p_subtype,'')
    AND activity_date = CURRENT_DATE
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed_today');
  END IF;

  v_difficulty_enum := COALESCE(NULLIF(p_difficulty,'')::public.activity_difficulty, 'medium'::public.activity_difficulty);

  SELECT level, xp, skill_points, coins, exhaustion
    INTO v_level, v_xp_now, v_skill_points, v_coins_now, v_exhaustion
    FROM public.profiles WHERE user_id = v_user;
  SELECT current_streak, last_active_date INTO v_streak_current, v_streak_last
    FROM public.streaks WHERE user_id = v_user;

  v_diff := CASE v_difficulty_enum WHEN 'easy' THEN 1.0 WHEN 'medium' THEN 1.5 WHEN 'hard' THEN 2.0 END;

  IF v_streak_last = CURRENT_DATE THEN v_proj_streak := COALESCE(v_streak_current, 1);
  ELSIF v_streak_last = CURRENT_DATE - 1 THEN v_proj_streak := COALESCE(v_streak_current, 0) + 1;
  ELSE v_proj_streak := 1; END IF;
  v_streak_skill_bonus := public.get_streak_skill_bonus(v_user);
  v_streak_mult := LEAST(2.0, 1.0 + (GREATEST(v_proj_streak,1) - 1) * (0.1 + v_streak_skill_bonus));

  IF v_hour >= 5 AND v_hour < 10 THEN v_time_bonus := 1.20;
  ELSIF v_hour >= 22 OR v_hour < 2 THEN v_time_bonus := 1.10;
  ELSE v_time_bonus := 1.0; END IF;

  v_stat_mult := public.get_stat_xp_multiplier(v_user, p_type);
  IF v_level > 10 THEN v_diminish := GREATEST(0.5, 1.0 - (v_level - 10) * 0.01); END IF;

  v_repeat_mult  := public.get_repeat_multiplier(v_user, p_type, p_subtype);
  v_boost_mult   := public.get_active_xp_multiplier(v_user);
  v_fatigue_mult := public.get_fatigue_multiplier(v_exhaustion);
  v_class_mult   := public.get_class_xp_multiplier(v_user, p_type);
  v_status_mult  := public.get_status_xp_multiplier(v_user);

  v_final_xp := GREATEST(1, ROUND(
    v_base * v_diff * v_streak_mult * v_time_bonus * v_stat_mult * v_diminish
          * v_repeat_mult * v_boost_mult * v_fatigue_mult
          * v_class_mult * v_status_mult
  ));
  v_coins_earned := GREATEST(1, FLOOR(v_final_xp::numeric / 10)::int);

  v_exhaustion_added := CASE v_difficulty_enum WHEN 'hard' THEN 12 WHEN 'medium' THEN 6 ELSE 2 END;

  v_breakdown := jsonb_build_object(
    'base', v_base, 'difficulty', v_diff,
    'streak', v_streak_mult, 'streak_days_projected', GREATEST(1, v_proj_streak),
    'time_of_day', v_time_bonus, 'stat', v_stat_mult, 'diminish', v_diminish,
    'repeat', v_repeat_mult, 'boost', v_boost_mult, 'exhaustion', v_fatigue_mult,
    'class', v_class_mult, 'status', v_status_mult,
    'final', v_final_xp, 'coins', v_coins_earned
  );

  INSERT INTO public.activities
    (user_id, type_id, subtype, duration_minutes, xp_gained, base_xp, difficulty, multiplier_breakdown, note, activity_date)
  VALUES
    (v_user, p_type, NULLIF(p_subtype,''), p_duration, v_final_xp, v_base, v_difficulty_enum, v_breakdown, NULLIF(p_note,''), CURRENT_DATE)
  RETURNING * INTO v_row;

  INSERT INTO public.activity_repeats (user_id, type_id, subtype) VALUES (v_user, p_type, COALESCE(p_subtype,''));

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
        coins = v_coins_now + v_coins_earned,
        exhaustion = LEAST(100, COALESCE(v_exhaustion,0) + v_exhaustion_added),
        exhaustion_updated_at = now(),
        updated_at = now()
    WHERE user_id = v_user;

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

  -- Re-evaluate status effects after each activity (cheap, idempotent)
  PERFORM public.evaluate_status_effects(v_user);

  RETURN jsonb_build_object(
    'ok', true,
    'activity', to_jsonb(v_row),
    'xp_gained', v_final_xp,
    'coins_gained', v_coins_earned,
    'breakdown', v_breakdown,
    'levels_gained', v_levels_gained,
    'new_level', v_new_level,
    'new_xp', v_new_xp,
    'skill_points_awarded', v_levels_gained * 3,
    'exhaustion', LEAST(100, COALESCE(v_exhaustion,0) + v_exhaustion_added),
    'class_multiplier', v_class_mult,
    'status_multiplier', v_status_mult
  );
END; $function$;
