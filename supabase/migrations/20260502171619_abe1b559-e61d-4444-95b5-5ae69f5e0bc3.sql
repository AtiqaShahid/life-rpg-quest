
-- ============================================================
-- WEEKLY LEADERBOARD: timer-validated XP + tiered rewards
-- ============================================================

-- 1) Helper: did this completed quest pass timer validation?
--    - non-timed quests (duration_minutes IS NULL) => valid
--    - timed quests => started_at present AND completed_at within
--      (ends_at - 10s) tolerance OR after ends_at
CREATE OR REPLACE FUNCTION public.is_quest_timer_valid(
  p_started_at timestamptz,
  p_ends_at timestamptz,
  p_completed_at timestamptz,
  p_duration_minutes int
) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_duration_minutes IS NULL THEN TRUE
    WHEN p_started_at IS NULL OR p_completed_at IS NULL THEN FALSE
    WHEN p_ends_at IS NOT NULL THEN p_completed_at >= (p_ends_at - interval '10 seconds')
    ELSE p_completed_at >= (p_started_at + (p_duration_minutes * interval '1 minute') - interval '10 seconds')
  END;
$$;

-- 2) Rewrite refresh_leaderboard_entry: weekly_xp counts ONLY
--    valid completed quests + activities (capped per day to curb grinding).
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
  v_weekly_quest_xp int := 0;     -- valid (timer-passed) quests this week
  v_weekly_activity_xp int := 0;  -- daily-soft-capped activities this week
  v_weekly_quests int := 0;
  v_study_xp int := 0;
  v_fitness_xp int := 0;
  v_streak int := 0;
  v_daily_cap int := 600;         -- soft cap per day per source
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_user THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT username, xp INTO v_username, v_profile_xp
  FROM public.profiles WHERE user_id = v_user;

  -- Activities all-time + per-stat
  SELECT COALESCE(SUM(xp_gained), 0),
         COALESCE(SUM(xp_gained) FILTER (WHERE type_id = 'study'), 0),
         COALESCE(SUM(xp_gained) FILTER (WHERE type_id IN ('workout', 'cardio')), 0)
    INTO v_activity_total_xp, v_study_xp, v_fitness_xp
  FROM public.activities WHERE user_id = v_user;

  -- Activities this week, soft-capped per day
  SELECT COALESCE(SUM(LEAST(daily_xp, v_daily_cap)), 0) INTO v_weekly_activity_xp
  FROM (
    SELECT activity_date, SUM(xp_gained)::int AS daily_xp
    FROM public.activities
    WHERE user_id = v_user AND created_at >= v_week
    GROUP BY activity_date
  ) d;

  -- Quests all-time
  SELECT COALESCE(SUM(reward_xp), 0)
    INTO v_quest_total_xp
  FROM public.quests
  WHERE user_id = v_user AND completed = true;

  -- Quests this week: ONLY timer-validated count for weekly score
  SELECT COALESCE(SUM(LEAST(daily_xp, v_daily_cap)), 0),
         COALESCE(SUM(cnt), 0)
    INTO v_weekly_quest_xp, v_weekly_quests
  FROM (
    SELECT (completed_at AT TIME ZONE 'UTC')::date AS d,
           SUM(reward_xp)::int AS daily_xp,
           COUNT(*)::int AS cnt
    FROM public.quests
    WHERE user_id = v_user
      AND completed = true
      AND completed_at >= v_week
      AND public.is_quest_timer_valid(started_at, ends_at, completed_at, duration_minutes)
    GROUP BY (completed_at AT TIME ZONE 'UTC')::date
  ) q;

  SELECT COALESCE(current_streak, 0) INTO v_streak
  FROM public.streaks WHERE user_id = v_user;

  INSERT INTO public.leaderboard_entries (
    user_id, username, total_xp, weekly_xp, weekly_quests,
    study_xp, fitness_xp, discipline_score, current_streak, week_start
  ) VALUES (
    v_user, COALESCE(v_username, 'Player'),
    GREATEST(COALESCE(v_profile_xp, 0), v_activity_total_xp + v_quest_total_xp),
    v_weekly_activity_xp + v_weekly_quest_xp,
    v_weekly_quests,
    v_study_xp, v_fitness_xp,
    v_streak, v_streak, v_week
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

-- 3) Replace reset_weekly_leaderboard with TIERED rewards:
--    Top 3 (Elite) / Top 10 (Advanced) / Top 20 (Active) / participation.
CREATE OR REPLACE FUNCTION public.reset_weekly_leaderboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  v_rank int := 0;
  v_new_week date := date_trunc('week', now())::date;
  v_coins int;
  v_xp int;
  v_rewarded int := 0;
BEGIN
  FOR rec IN
    SELECT user_id, weekly_xp, week_start
      FROM public.leaderboard_entries
     WHERE week_start < v_new_week AND weekly_xp > 0
     ORDER BY weekly_xp DESC
  LOOP
    v_rank := v_rank + 1;

    -- Tier payouts
    IF v_rank <= 3 THEN          -- Elite
      v_coins := CASE v_rank WHEN 1 THEN 500 WHEN 2 THEN 300 ELSE 200 END;
      v_xp    := CASE v_rank WHEN 1 THEN 500 WHEN 2 THEN 300 ELSE 200 END;
    ELSIF v_rank <= 10 THEN      -- Advanced
      v_coins := 100;
      v_xp    := 100;
    ELSIF v_rank <= 20 THEN      -- Active
      v_coins := 40;
      v_xp    := 40;
    ELSE                         -- Participation
      v_coins := 10;
      v_xp    := 0;
    END IF;

    INSERT INTO public.weekly_leaderboard_rewards
      (user_id, week_start, rank, coins_awarded, xp_awarded)
    VALUES (rec.user_id, rec.week_start, v_rank, v_coins, v_xp)
    ON CONFLICT (user_id, week_start) DO NOTHING;

    UPDATE public.profiles
       SET coins = coins + v_coins,
           xp    = xp    + v_xp,
           updated_at = now()
     WHERE user_id = rec.user_id;

    v_rewarded := v_rewarded + 1;
  END LOOP;

  -- Reset weekly counters for everyone
  UPDATE public.leaderboard_entries
     SET weekly_xp = 0, weekly_quests = 0, week_start = v_new_week, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'rewarded', v_rewarded);
END $$;

-- 4) Recompute everyone's weekly_xp now under the new (timer-validated) rule
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT user_id FROM public.leaderboard_entries LOOP
    PERFORM public.refresh_leaderboard_entry(r.user_id);
  END LOOP;
END $$;
