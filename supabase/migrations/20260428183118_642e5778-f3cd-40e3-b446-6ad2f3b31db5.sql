CREATE OR REPLACE FUNCTION public.refresh_leaderboard_entry(p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := COALESCE(p_user, auth.uid());
  v_week date := date_trunc('week', now())::date;
  v_username text;
  v_total_xp int := 0;
  v_weekly_xp int := 0;
  v_weekly_quests int := 0;
  v_study_xp int := 0;
  v_fitness_xp int := 0;
  v_streak int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_user THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT username, xp INTO v_username, v_total_xp
  FROM public.profiles
  WHERE user_id = v_user;

  SELECT COALESCE(SUM(xp_gained) FILTER (WHERE created_at >= v_week), 0),
         COALESCE(SUM(xp_gained) FILTER (WHERE type_id = 'study'), 0),
         COALESCE(SUM(xp_gained) FILTER (WHERE type_id IN ('workout', 'cardio')), 0)
    INTO v_weekly_xp, v_study_xp, v_fitness_xp
  FROM public.activities
  WHERE user_id = v_user;

  SELECT COALESCE(COUNT(*), 0)
    INTO v_weekly_quests
  FROM public.quests
  WHERE user_id = v_user AND completed = true AND completed_at >= v_week;

  SELECT COALESCE(current_streak, 0)
    INTO v_streak
  FROM public.streaks
  WHERE user_id = v_user;

  INSERT INTO public.leaderboard_entries (
    user_id, username, total_xp, weekly_xp, weekly_quests,
    study_xp, fitness_xp, discipline_score, current_streak, week_start
  ) VALUES (
    v_user, COALESCE(v_username, 'Player'), COALESCE(v_total_xp, 0), v_weekly_xp, v_weekly_quests,
    v_study_xp, v_fitness_xp, v_streak, v_streak, v_week
  )
  ON CONFLICT (user_id) DO UPDATE SET
    username = EXCLUDED.username,
    total_xp = EXCLUDED.total_xp,
    weekly_xp = EXCLUDED.weekly_xp,
    weekly_quests = EXCLUDED.weekly_quests,
    study_xp = EXCLUDED.study_xp,
    fitness_xp = EXCLUDED.fitness_xp,
    discipline_score = EXCLUDED.discipline_score,
    current_streak = EXCLUDED.current_streak,
    week_start = EXCLUDED.week_start,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.select_character_class(
  p_class public.character_class,
  p_pay_to_skip boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  IF v_current IS NULL THEN
    UPDATE public.profiles
      SET class_type = p_class, class_changed_at = now(), updated_at = now()
      WHERE user_id = v_user;
    PERFORM public.refresh_leaderboard_entry(v_user);
    RETURN jsonb_build_object('ok', true, 'class', p_class, 'first_time', true);
  END IF;

  IF v_current = p_class THEN
    PERFORM public.refresh_leaderboard_entry(v_user);
    RETURN jsonb_build_object('ok', true, 'class', p_class, 'same_class', true);
  END IF;

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
      PERFORM public.refresh_leaderboard_entry(v_user);
      RETURN jsonb_build_object('ok', true, 'class', p_class, 'paid', v_skip_cost);
    ELSE
      v_days_left := EXTRACT(EPOCH FROM ((v_changed + (v_cooldown_days || ' days')::interval) - now())) / 86400;
      RETURN jsonb_build_object('ok', false, 'reason', 'cooldown', 'days_remaining', ROUND(v_days_left, 2), 'skip_cost', v_skip_cost);
    END IF;
  END IF;

  UPDATE public.profiles
    SET class_type = p_class, class_changed_at = now(), updated_at = now()
    WHERE user_id = v_user;
  PERFORM public.refresh_leaderboard_entry(v_user);
  RETURN jsonb_build_object('ok', true, 'class', p_class);
END;
$$;