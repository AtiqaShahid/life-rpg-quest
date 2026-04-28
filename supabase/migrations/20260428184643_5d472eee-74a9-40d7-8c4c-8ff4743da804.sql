CREATE OR REPLACE FUNCTION public.get_life_score()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_now TIMESTAMPTZ := now();

  v_total_acts INT := 0;
  v_hard_acts INT := 0;
  v_med_acts INT := 0;
  v_easy_acts INT := 0;
  v_discipline NUMERIC := 0;

  v_active_days INT := 0;
  v_max_gap INT := 0;
  v_consistency NUMERIC := 0;

  v_quests_total INT := 0;
  v_quests_done INT := 0;
  v_completion NUMERIC := 0;

  v_hour_stddev NUMERIC;
  v_energy NUMERIC := 0;

  v_acts_recent7 INT := 0;
  v_acts_prev7 INT := 0;
  v_completion_recent NUMERIC := 0;
  v_completion_prev NUMERIC := 0;
  v_xp_recent NUMERIC := 0;
  v_xp_prev NUMERIC := 0;
  v_streak INT := 0;
  v_longest INT := 0;
  v_last_active DATE;
  v_inactive_days INT := 0;

  v_life_score NUMERIC := 0;
  v_trends JSONB := '[]'::jsonb;
  v_predictions JSONB := '[]'::jsonb;
  v_recommendations JSONB := '[]'::jsonb;
  v_daily_series JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE difficulty = 'hard'),
    COUNT(*) FILTER (WHERE difficulty = 'medium'),
    COUNT(*) FILTER (WHERE difficulty = 'easy')
  INTO v_total_acts, v_hard_acts, v_med_acts, v_easy_acts
  FROM public.activities
  WHERE user_id = v_user AND activity_date >= v_today - 13;

  IF v_total_acts = 0 THEN
    v_discipline := 0;
  ELSE
    v_discipline := LEAST(100,
      ROUND(((v_hard_acts * 1.0 + v_med_acts * 0.6 + v_easy_acts * 0.3) / GREATEST(v_total_acts, 1)) * 100)
      + LEAST(20, v_hard_acts * 2)
    );
    v_discipline := LEAST(100, v_discipline);
  END IF;

  SELECT COUNT(DISTINCT activity_date) INTO v_active_days
  FROM public.activities
  WHERE user_id = v_user AND activity_date >= v_today - 13;

  WITH days AS (
    SELECT generate_series(v_today - 13, v_today, INTERVAL '1 day')::date AS d
  ),
  marked AS (
    SELECT d, EXISTS(
      SELECT 1 FROM public.activities a
      WHERE a.user_id = v_user AND a.activity_date = d
    ) AS active
    FROM days
  ),
  groups AS (
    SELECT d, active,
           SUM(CASE WHEN active THEN 1 ELSE 0 END) OVER (ORDER BY d) AS grp
    FROM marked
  )
  SELECT COALESCE(MAX(streak), 0) INTO v_max_gap FROM (
    SELECT COUNT(*) AS streak FROM groups WHERE NOT active GROUP BY grp
  ) s;

  v_consistency := GREATEST(0,
    ROUND((v_active_days::numeric / 14) * 100) - (v_max_gap * 8)
  );
  v_consistency := LEAST(100, GREATEST(0, v_consistency));

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE completed)
  INTO v_quests_total, v_quests_done
  FROM public.quests
  WHERE user_id = v_user AND created_at >= v_now - INTERVAL '14 days';

  IF v_quests_total = 0 THEN
    v_completion := 0;
  ELSE
    v_completion := LEAST(100, ROUND((v_quests_done::numeric / v_quests_total) * 100));
  END IF;

  SELECT STDDEV_POP(EXTRACT(HOUR FROM created_at)::numeric) INTO v_hour_stddev
  FROM public.activities
  WHERE user_id = v_user AND created_at >= v_now - INTERVAL '14 days';

  IF v_hour_stddev IS NULL THEN
    v_energy := 0;
  ELSE
    v_energy := GREATEST(0, LEAST(100, ROUND(100 - (v_hour_stddev * 16.6))));
  END IF;

  v_life_score := ROUND(
    v_discipline  * 0.40 +
    v_consistency * 0.25 +
    v_completion  * 0.20 +
    v_energy      * 0.15
  );

  SELECT COUNT(*), COALESCE(SUM(xp_gained),0)
  INTO v_acts_recent7, v_xp_recent
  FROM public.activities
  WHERE user_id = v_user AND activity_date >= v_today - 6;

  SELECT COUNT(*), COALESCE(SUM(xp_gained),0)
  INTO v_acts_prev7, v_xp_prev
  FROM public.activities
  WHERE user_id = v_user AND activity_date BETWEEN v_today - 13 AND v_today - 7;

  SELECT
    CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE completed))::numeric / COUNT(*) * 100 ELSE 0 END
  INTO v_completion_recent
  FROM public.quests
  WHERE user_id = v_user AND created_at >= v_now - INTERVAL '7 days';

  SELECT
    CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE completed))::numeric / COUNT(*) * 100 ELSE 0 END
  INTO v_completion_prev
  FROM public.quests
  WHERE user_id = v_user AND created_at BETWEEN v_now - INTERVAL '14 days' AND v_now - INTERVAL '7 days';

  SELECT current_streak, longest_streak, last_active_date
  INTO v_streak, v_longest, v_last_active
  FROM public.streaks WHERE user_id = v_user;

  v_inactive_days := COALESCE((v_today - v_last_active), 999);

  IF v_acts_prev7 > 0 AND v_acts_recent7 < v_acts_prev7 THEN
    v_trends := v_trends || to_jsonb(
      ('Activity volume down ' || ROUND((1 - v_acts_recent7::numeric / v_acts_prev7) * 100) ||
      '% week-over-week (' || v_acts_prev7 || ' → ' || v_acts_recent7 || ').')::text
    );
  ELSIF v_acts_prev7 > 0 AND v_acts_recent7 > v_acts_prev7 THEN
    v_trends := v_trends || to_jsonb(
      ('Activity volume up ' || ROUND((v_acts_recent7::numeric / v_acts_prev7 - 1) * 100) ||
      '% week-over-week (' || v_acts_prev7 || ' → ' || v_acts_recent7 || ').')::text
    );
  END IF;

  IF v_completion_prev > 0 AND v_completion_recent < v_completion_prev - 10 THEN
    v_trends := v_trends || to_jsonb(
      ('Quest completion dropped ' || ROUND(v_completion_prev - v_completion_recent) ||
      ' pts vs prior week (' || ROUND(v_completion_prev) || '% → ' || ROUND(v_completion_recent) || '%).')::text
    );
  END IF;

  IF v_max_gap >= 2 THEN
    v_trends := v_trends || to_jsonb(
      ('Longest inactivity gap in last 14d: ' || v_max_gap || ' consecutive days.')::text
    );
  END IF;

  IF v_hard_acts >= 5 AND v_xp_prev > 0 AND v_xp_recent < v_xp_prev * 0.7 THEN
    v_trends := v_trends || to_jsonb(
      ('High hard-task load (' || v_hard_acts || ' in 14d) followed by ' ||
      ROUND((1 - v_xp_recent::numeric / v_xp_prev) * 100) || '% XP drop — burnout signature.')::text
    );
  END IF;

  IF v_hour_stddev IS NOT NULL AND v_hour_stddev > 4 THEN
    v_trends := v_trends || to_jsonb(
      ('Activity timing erratic (hour σ=' || ROUND(v_hour_stddev, 1) || ') — energy windows unstable.')::text
    );
  END IF;

  IF v_streak > 0 AND v_inactive_days >= 1 THEN
    v_predictions := v_predictions || to_jsonb(
      ('Streak (' || v_streak || ' days) at risk — break likely within ' ||
      GREATEST(1, 2 - v_inactive_days) || ' day(s) without activity.')::text
    );
  END IF;

  IF v_consistency < 50 AND v_acts_recent7 < v_acts_prev7 THEN
    v_predictions := v_predictions || to_jsonb(
      ('At current decline, streak break probable in 3–4 days.')::text
    );
  END IF;

  IF v_hard_acts >= 5 AND v_completion_recent < 50 THEN
    v_predictions := v_predictions || to_jsonb(
      ('Burnout risk zone within ~5 days: difficulty load high, completion ' ||
      ROUND(v_completion_recent) || '%.')::text
    );
  END IF;

  IF v_consistency >= 70 AND v_discipline >= 60 AND v_acts_recent7 >= v_acts_prev7 THEN
    v_predictions := v_predictions || to_jsonb(
      ('Trajectory: level-up likely within ~1 week if pace holds.')::text
    );
  END IF;

  IF v_inactive_days >= 3 THEN
    v_predictions := v_predictions || to_jsonb(
      ('Inactive ' || v_inactive_days || ' days — re-entry friction grows after day 5.')::text
    );
  END IF;

  IF v_hard_acts >= 5 AND v_completion_recent < 50 THEN
    v_recommendations := v_recommendations || to_jsonb(
      ('Reduce task difficulty by ~20% for the next 3 days to recover throughput.')::text
    );
  END IF;

  IF v_consistency < 50 THEN
    v_recommendations := v_recommendations || to_jsonb(
      ('Switch to shorter (≤15 min) tasks to rebuild streak momentum.')::text
    );
  END IF;

  IF v_consistency >= 70 AND v_discipline >= 60 THEN
    v_recommendations := v_recommendations || to_jsonb(
      ('Increase challenge ~10%: add one hard-difficulty task to your daily set.')::text
    );
  END IF;

  IF v_hour_stddev IS NOT NULL AND v_hour_stddev > 4 THEN
    v_recommendations := v_recommendations || to_jsonb(
      ('Anchor a fixed daily window (±1h) — stable timing compounds output.')::text
    );
  END IF;

  IF v_inactive_days >= 2 THEN
    v_recommendations := v_recommendations || to_jsonb(
      ('Log one easy activity today to interrupt the inactivity slope.')::text
    );
  END IF;

  WITH days AS (
    SELECT generate_series(v_today - 13, v_today, INTERVAL '1 day')::date AS d
  ),
  agg AS (
    SELECT activity_date AS d, COALESCE(SUM(xp_gained),0)::int AS xp, COUNT(*)::int AS n
    FROM public.activities WHERE user_id = v_user AND activity_date >= v_today - 13
    GROUP BY activity_date
  )
  SELECT jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'), 'xp', COALESCE(a.xp,0), 'count', COALESCE(a.n,0)) ORDER BY d)
  INTO v_daily_series
  FROM days LEFT JOIN agg a USING (d);

  RETURN jsonb_build_object(
    'life_score', v_life_score,
    'breakdown', jsonb_build_object(
      'discipline',  v_discipline,
      'consistency', v_consistency,
      'completion',  v_completion,
      'energy',      v_energy
    ),
    'signals', jsonb_build_object(
      'total_activities_14d', v_total_acts,
      'hard_activities_14d',  v_hard_acts,
      'medium_activities_14d', v_med_acts,
      'easy_activities_14d',  v_easy_acts,
      'active_days_14d',      v_active_days,
      'max_gap_days',         v_max_gap,
      'quests_total_14d',     v_quests_total,
      'quests_done_14d',      v_quests_done,
      'completion_recent_pct', ROUND(v_completion_recent),
      'completion_prev_pct',   ROUND(v_completion_prev),
      'acts_recent_7d',       v_acts_recent7,
      'acts_prev_7d',         v_acts_prev7,
      'xp_recent_7d',         v_xp_recent,
      'xp_prev_7d',           v_xp_prev,
      'hour_stddev',          ROUND(COALESCE(v_hour_stddev, 0), 2),
      'current_streak',       COALESCE(v_streak, 0),
      'longest_streak',       COALESCE(v_longest, 0),
      'inactive_days',        v_inactive_days
    ),
    'trends', v_trends,
    'predictions', v_predictions,
    'recommendations', v_recommendations,
    'daily_series_14d', v_daily_series,
    'computed_at', v_now
  );
END;
$$;