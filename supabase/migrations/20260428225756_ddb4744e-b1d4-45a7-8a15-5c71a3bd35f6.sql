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
  v_profile_xp int := 0;
  v_activity_total_xp int := 0;
  v_quest_total_xp int := 0;
  v_weekly_activity_xp int := 0;
  v_weekly_quest_xp int := 0;
  v_weekly_quests int := 0;
  v_study_xp int := 0;
  v_fitness_xp int := 0;
  v_streak int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_user THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT username, xp INTO v_username, v_profile_xp
  FROM public.profiles
  WHERE user_id = v_user;

  SELECT COALESCE(SUM(xp_gained), 0),
         COALESCE(SUM(xp_gained) FILTER (WHERE created_at >= v_week), 0),
         COALESCE(SUM(xp_gained) FILTER (WHERE type_id = 'study'), 0),
         COALESCE(SUM(xp_gained) FILTER (WHERE type_id IN ('workout', 'cardio')), 0)
    INTO v_activity_total_xp, v_weekly_activity_xp, v_study_xp, v_fitness_xp
  FROM public.activities
  WHERE user_id = v_user;

  SELECT COALESCE(SUM(reward_xp), 0),
         COALESCE(SUM(reward_xp) FILTER (WHERE completed_at >= v_week), 0),
         COALESCE(COUNT(*) FILTER (WHERE completed_at >= v_week), 0)
    INTO v_quest_total_xp, v_weekly_quest_xp, v_weekly_quests
  FROM public.quests
  WHERE user_id = v_user AND completed = true;

  SELECT COALESCE(current_streak, 0)
    INTO v_streak
  FROM public.streaks
  WHERE user_id = v_user;

  INSERT INTO public.leaderboard_entries (
    user_id, username, total_xp, weekly_xp, weekly_quests,
    study_xp, fitness_xp, discipline_score, current_streak, week_start
  ) VALUES (
    v_user,
    COALESCE(v_username, 'Player'),
    GREATEST(COALESCE(v_profile_xp, 0), v_activity_total_xp + v_quest_total_xp),
    v_weekly_activity_xp + v_weekly_quest_xp,
    v_weekly_quests,
    v_study_xp,
    v_fitness_xp,
    v_streak,
    v_streak,
    v_week
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

CREATE OR REPLACE FUNCTION public.sync_leaderboard_on_quest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party uuid;
BEGIN
  IF (NEW.completed = true AND COALESCE(OLD.completed, false) = false) THEN
    PERFORM public.refresh_leaderboard_entry(NEW.user_id);

    SELECT party_id INTO v_party FROM public.party_members WHERE user_id = NEW.user_id;
    IF v_party IS NOT NULL THEN
      INSERT INTO public.party_activity_log (party_id, user_id, activity_date, xp_contributed, quests_completed)
      VALUES (v_party, NEW.user_id, CURRENT_DATE, COALESCE(NEW.reward_xp, 0), 1)
      ON CONFLICT (party_id, user_id, activity_date) DO UPDATE
        SET xp_contributed = public.party_activity_log.xp_contributed + EXCLUDED.xp_contributed,
            quests_completed = public.party_activity_log.quests_completed + EXCLUDED.quests_completed;

      UPDATE public.parties
        SET xp_pool = xp_pool + COALESCE(NEW.reward_xp, 0), updated_at = now()
        WHERE id = v_party;

      UPDATE public.party_goals
        SET current = LEAST(target, current + 1),
            completed = (current + 1 >= target),
            updated_at = now()
        WHERE party_id = v_party AND metric = 'quests' AND completed = false
          AND (expires_at IS NULL OR expires_at > now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_quest(p_quest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_quest public.quests;
  v_xp_calc jsonb;
  v_xp integer;
  v_coins integer;
  v_tokens integer := 0;
  v_level integer;
  v_xp_now integer;
  v_skill_points integer;
  v_new_level integer;
  v_new_xp integer;
  v_threshold integer;
  v_levels_gained integer := 0;
  v_stat text;
  v_boost_mult numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id AND user_id = v_user;
  IF v_quest.id IS NULL THEN RAISE EXCEPTION 'quest_not_found'; END IF;
  IF v_quest.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed');
  END IF;
  IF v_quest.status NOT IN ('active','locked') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_completable');
  END IF;

  v_xp_calc := public.compute_quest_xp(v_user, v_quest.difficulty, v_quest.quest_type);
  v_boost_mult := public.get_active_xp_multiplier(v_user);
  v_xp := GREATEST(1, ROUND((v_xp_calc->>'final')::int * v_boost_mult));

  v_coins := GREATEST(1, FLOOR(v_xp::numeric / 8)::int);
  IF v_quest.quest_type = 'weekly' THEN v_tokens := 1;
  ELSIF v_quest.quest_type = 'epic' THEN v_tokens := 3;
  END IF;

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
    SET level = v_new_level,
        xp = v_new_xp,
        skill_points = v_skill_points + (v_levels_gained * 3),
        coins = coins + v_coins,
        tokens = tokens + v_tokens,
        updated_at = now()
    WHERE user_id = v_user;

  UPDATE public.quests
    SET status = 'completed', completed = true, completed_at = now(), reward_xp = v_xp
    WHERE id = p_quest_id;

  IF array_length(v_quest.linked_stats, 1) IS NOT NULL THEN
    FOREACH v_stat IN ARRAY v_quest.linked_stats LOOP
      IF v_stat IN ('intelligence','strength','discipline','charisma') THEN
        EXECUTE format('UPDATE public.stats SET %I = %I + 1, updated_at = now() WHERE user_id = $1', v_stat, v_stat)
          USING v_user;
      END IF;
    END LOOP;
  END IF;

  PERFORM public.refresh_leaderboard_entry(v_user);

  RETURN jsonb_build_object(
    'ok', true,
    'xp_gained', v_xp,
    'coins_gained', v_coins,
    'tokens_gained', v_tokens,
    'breakdown', v_xp_calc,
    'levels_gained', v_levels_gained,
    'new_level', v_new_level,
    'new_xp', v_new_xp,
    'skill_points_awarded', v_levels_gained * 3
  );
END;
$$;