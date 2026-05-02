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
  v_time_bonus NUMERIC;
  v_stat_mult NUMERIC;
  v_diminish NUMERIC;
  v_class_mult NUMERIC;
  v_status_mult NUMERIC;
  v_final_xp INTEGER;
  v_breakdown JSONB;

  v_streak_days_proj INTEGER;
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - 1;

  v_new_xp INTEGER;
  v_new_level INTEGER;
  v_levels_gained INTEGER := 0;
  v_xp_to_next INTEGER;
  v_exhaustion_added INTEGER;
  v_stat_col TEXT;
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
    AND activity_date = v_today
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed_today');
  END IF;

  -- multipliers
  v_diff := CASE p_difficulty WHEN 'easy' THEN 1.0 WHEN 'hard' THEN 2.0 ELSE 1.5 END;

  SELECT current_streak, last_active_date INTO v_streak_current, v_streak_last
  FROM public.streaks WHERE user_id = v_user;
  IF v_streak_current IS NULL THEN v_streak_current := 0; v_streak_last := NULL; END IF;

  IF v_streak_last = v_today THEN v_streak_days_proj := GREATEST(1, v_streak_current);
  ELSIF v_streak_last = v_yesterday THEN v_streak_days_proj := GREATEST(1, v_streak_current) + 1;
  ELSE v_streak_days_proj := 1; END IF;

  v_streak_mult := LEAST(2.0, 1 + (v_streak_days_proj - 1) * 0.1);
  v_time_bonus := CASE
    WHEN EXTRACT(HOUR FROM now()) BETWEEN 5 AND 9 THEN 1.20
    WHEN EXTRACT(HOUR FROM now()) >= 22 OR EXTRACT(HOUR FROM now()) < 2 THEN 1.10
    ELSE 1.0 END;

  v_stat_mult := public.get_stat_xp_multiplier(v_user, p_type);
  v_class_mult := public.get_class_xp_multiplier(v_user, p_type);
  v_status_mult := public.get_status_xp_multiplier(v_user);

  SELECT level, xp, COALESCE(skill_points,0), COALESCE(coins,0), COALESCE(exhaustion,0)
    INTO v_level, v_xp_now, v_skill_points, v_coins_now, v_exhaustion
  FROM public.profiles WHERE user_id = v_user;
  IF v_level IS NULL THEN v_level := 1; v_xp_now := 0; v_skill_points := 0; v_coins_now := 0; v_exhaustion := 0; END IF;

  v_diminish := CASE WHEN v_level <= 10 THEN 1.0 ELSE GREATEST(0.5, 1 - (v_level - 10) * 0.01) END;

  v_final_xp := GREATEST(1, ROUND(
    v_base * v_diff * v_streak_mult * v_time_bonus * v_stat_mult * v_diminish
          * v_class_mult * v_status_mult
  ));

  v_breakdown := jsonb_build_object(
    'base', v_base, 'difficulty', v_diff, 'streak', v_streak_mult,
    'streak_days_projected', v_streak_days_proj,
    'time_of_day', v_time_bonus, 'stat', v_stat_mult, 'diminish', v_diminish,
    'class', v_class_mult, 'status', v_status_mult,
    'final', v_final_xp
  );

  INSERT INTO public.activities (user_id, type_id, subtype, duration_minutes, xp_gained, base_xp, difficulty, multiplier_breakdown, note, activity_date)
  VALUES (v_user, p_type, NULLIF(p_subtype,''), p_duration, v_final_xp, v_base, p_difficulty::activity_difficulty, v_breakdown, NULLIF(p_note,''), v_today)
  RETURNING * INTO v_row;

  -- Apply XP & level-up
  v_new_xp := v_xp_now + v_final_xp;
  v_new_level := v_level;
  LOOP
    v_xp_to_next := ROUND(100 * POWER(v_new_level + 1, 1.5));
    EXIT WHEN v_new_xp < v_xp_to_next;
    v_new_xp := v_new_xp - v_xp_to_next;
    v_new_level := v_new_level + 1;
    v_levels_gained := v_levels_gained + 1;
  END LOOP;

  v_exhaustion_added := GREATEST(1, ROUND(p_duration / 10.0));

  UPDATE public.profiles
     SET level = v_new_level,
         xp = v_new_xp,
         skill_points = v_skill_points + v_levels_gained * 3,
         exhaustion = LEAST(100, v_exhaustion + v_exhaustion_added),
         exhaustion_updated_at = now(),
         updated_at = now()
   WHERE user_id = v_user;

  -- Update streaks
  IF v_streak_last IS DISTINCT FROM v_today THEN
    UPDATE public.streaks
       SET current_streak = v_streak_days_proj,
           longest_streak = GREATEST(longest_streak, v_streak_days_proj),
           last_active_date = v_today,
           updated_at = now()
     WHERE user_id = v_user;
  END IF;

  -- NEW: bump core stat (+1 per activity, matching client mirror)
  SELECT stat::text INTO v_stat_col FROM public.activity_types WHERE id = p_type;
  IF v_stat_col IN ('intelligence','strength','discipline','charisma') THEN
    INSERT INTO public.stats (user_id, intelligence, strength, discipline, charisma)
    VALUES (v_user, 10, 10, 10, 10)
    ON CONFLICT (user_id) DO NOTHING;

    EXECUTE format('UPDATE public.stats SET %I = %I + 1, updated_at = now() WHERE user_id = $1', v_stat_col, v_stat_col)
    USING v_user;
  END IF;

  PERFORM public.evaluate_status_effects(v_user);

  RETURN jsonb_build_object(
    'ok', true,
    'activity', to_jsonb(v_row),
    'xp_gained', v_final_xp,
    'breakdown', v_breakdown,
    'leveled_up', v_levels_gained > 0,
    'levels_gained', v_levels_gained,
    'new_level', v_new_level,
    'new_xp', v_new_xp,
    'skill_points_awarded', v_levels_gained * 3,
    'exhaustion', LEAST(100, COALESCE(v_exhaustion,0) + v_exhaustion_added),
    'class_multiplier', v_class_mult,
    'status_multiplier', v_status_mult,
    'stat_increased', v_stat_col
  );
END; $function$;