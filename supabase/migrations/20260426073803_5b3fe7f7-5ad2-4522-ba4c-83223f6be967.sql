-- Behavior Intelligence Engine: live profile computed from activities
CREATE OR REPLACE FUNCTION public.get_behavior_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_today DATE := CURRENT_DATE;

  v_total_30d INTEGER;
  v_active_days_14 INTEGER;
  v_consistency NUMERIC;            -- 0..100
  v_burnout NUMERIC := 0;           -- 0..100
  v_status TEXT := 'normal';

  v_peak_hours JSONB;
  v_per_activity JSONB;
  v_last7 JSONB;

  v_last_recent_avg NUMERIC;
  v_prev_recent_avg NUMERIC;
  v_decline NUMERIC := 0;

  v_hard_share NUMERIC := 0;        -- 0..1
  v_recent_count INTEGER;

  v_inactive_days INTEGER;
  v_last_active DATE;

  v_rec_difficulty TEXT;
  v_rec_hour INTEGER;
  v_rec_type TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- ---------- Last 7-day XP series ----------
  WITH days AS (
    SELECT generate_series(v_today - 6, v_today, INTERVAL '1 day')::date AS d
  ),
  agg AS (
    SELECT activity_date AS d, SUM(xp_gained)::int AS xp, COUNT(*)::int AS n
    FROM public.activities
    WHERE user_id = v_user AND activity_date >= v_today - 6
    GROUP BY activity_date
  )
  SELECT jsonb_agg(jsonb_build_object(
    'date', to_char(d, 'YYYY-MM-DD'),
    'xp', COALESCE(a.xp, 0),
    'count', COALESCE(a.n, 0)
  ) ORDER BY d)
  INTO v_last7
  FROM days LEFT JOIN agg a USING (d);

  -- ---------- Consistency: % of last 14 days with at least one activity ----------
  SELECT COUNT(DISTINCT activity_date) INTO v_active_days_14
  FROM public.activities
  WHERE user_id = v_user AND activity_date >= v_today - 13;
  v_consistency := ROUND((COALESCE(v_active_days_14,0)::numeric / 14) * 100);

  -- ---------- Last active date / inactive streak ----------
  SELECT MAX(activity_date) INTO v_last_active
  FROM public.activities WHERE user_id = v_user;
  v_inactive_days := COALESCE((v_today - v_last_active), 999);

  -- ---------- Peak productivity hours (avg XP per hour over last 30d) ----------
  WITH by_hour AS (
    SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
           AVG(xp_gained)::numeric AS avg_xp,
           COUNT(*)::int AS n
    FROM public.activities
    WHERE user_id = v_user AND created_at >= v_now - INTERVAL '30 days'
    GROUP BY 1
    HAVING COUNT(*) >= 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'hour', hour, 'avg_xp', ROUND(avg_xp, 1), 'count', n
  ) ORDER BY avg_xp DESC, n DESC)
  INTO v_peak_hours
  FROM (SELECT * FROM by_hour ORDER BY avg_xp DESC, n DESC LIMIT 3) h;

  -- ---------- Per-activity performance trend ----------
  WITH recent AS (
    SELECT type_id, xp_gained, created_at,
           ROW_NUMBER() OVER (PARTITION BY type_id ORDER BY created_at DESC) AS rn
    FROM public.activities
    WHERE user_id = v_user AND created_at >= v_now - INTERVAL '30 days'
  ),
  split AS (
    SELECT type_id,
           AVG(CASE WHEN rn <= 3 THEN xp_gained END)::numeric AS avg_recent,
           AVG(CASE WHEN rn BETWEEN 4 AND 8 THEN xp_gained END)::numeric AS avg_prev,
           COUNT(*)::int AS n
    FROM recent
    GROUP BY type_id
    HAVING COUNT(*) >= 4
  )
  SELECT jsonb_agg(jsonb_build_object(
    'type_id', type_id,
    'count', n,
    'avg_recent', ROUND(COALESCE(avg_recent,0),1),
    'avg_prev', ROUND(COALESCE(avg_prev,0),1),
    'trend', CASE
      WHEN avg_prev IS NULL OR avg_prev = 0 THEN 'steady'
      WHEN avg_recent >= avg_prev * 1.1 THEN 'improving'
      WHEN avg_recent <= avg_prev * 0.85 THEN 'declining'
      ELSE 'steady'
    END,
    'efficiency_score', LEAST(100, GREATEST(0, ROUND((COALESCE(avg_recent,0) / NULLIF(GREATEST(avg_prev, avg_recent),0)) * 100)))
  ))
  INTO v_per_activity
  FROM split;

  -- ---------- Burnout signals ----------
  -- 1) Declining XP across last 5 vs previous 5
  SELECT COUNT(*) INTO v_recent_count
  FROM public.activities WHERE user_id = v_user AND created_at >= v_now - INTERVAL '30 days';

  IF v_recent_count >= 6 THEN
    SELECT AVG(xp_gained)::numeric INTO v_last_recent_avg FROM (
      SELECT xp_gained FROM public.activities
      WHERE user_id = v_user ORDER BY created_at DESC LIMIT 5
    ) a;
    SELECT AVG(xp_gained)::numeric INTO v_prev_recent_avg FROM (
      SELECT xp_gained FROM public.activities
      WHERE user_id = v_user ORDER BY created_at DESC OFFSET 5 LIMIT 5
    ) b;
    IF COALESCE(v_prev_recent_avg,0) > 0 THEN
      v_decline := GREATEST(0, (v_prev_recent_avg - v_last_recent_avg) / v_prev_recent_avg);
    END IF;
  END IF;

  -- 2) Hard-task overload — share of "hard" in last 7d
  SELECT COALESCE(AVG(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END), 0)
  INTO v_hard_share
  FROM public.activities
  WHERE user_id = v_user AND created_at >= v_now - INTERVAL '7 days';

  -- Compose burnout score (0..100): decline weight 60, overload 25, inactivity 15
  v_burnout := LEAST(100, ROUND(
      v_decline * 60
    + LEAST(1.0, GREATEST(0, (v_hard_share - 0.5) / 0.5)) * 25
    + LEAST(1.0, v_inactive_days::numeric / 5) * 15
  ));

  -- ---------- Status ----------
  IF v_inactive_days >= 3 THEN
    v_status := 'inactive';
  ELSIF v_burnout >= 65 THEN
    v_status := 'burnout';
  ELSIF v_burnout >= 40 OR v_consistency < 35 THEN
    v_status := 'warning';
  ELSE
    v_status := 'normal';
  END IF;

  -- ---------- Adaptive recommendation ----------
  IF v_status IN ('burnout','inactive') THEN
    v_rec_difficulty := 'easy';
  ELSIF v_consistency >= 80 AND v_burnout < 30 THEN
    v_rec_difficulty := 'hard';
  ELSIF v_consistency < 40 THEN
    v_rec_difficulty := 'easy';
  ELSE
    v_rec_difficulty := 'medium';
  END IF;

  SELECT (v_peak_hours->0->>'hour')::int INTO v_rec_hour;

  -- Recommend the activity type with the strongest recent trend, fallback to most-frequent
  SELECT type_id INTO v_rec_type FROM (
    SELECT type_id, COUNT(*) AS n
    FROM public.activities
    WHERE user_id = v_user AND created_at >= v_now - INTERVAL '14 days'
    GROUP BY type_id ORDER BY n DESC LIMIT 1
  ) t;

  RETURN jsonb_build_object(
    'computed_at', v_now,
    'status', v_status,
    'consistency_score', COALESCE(v_consistency, 0),
    'burnout_score', COALESCE(v_burnout, 0),
    'inactive_days', v_inactive_days,
    'last_active_date', v_last_active,
    'peak_hours', COALESCE(v_peak_hours, '[]'::jsonb),
    'last_7_day_performance', COALESCE(v_last7, '[]'::jsonb),
    'activity_insights', COALESCE(v_per_activity, '[]'::jsonb),
    'recommendation', jsonb_build_object(
      'difficulty', v_rec_difficulty,
      'hour', v_rec_hour,
      'type_id', v_rec_type,
      'recovery_mode', v_status IN ('burnout','inactive')
    ),
    'signals', jsonb_build_object(
      'performance_decline_pct', ROUND(v_decline * 100, 1),
      'hard_task_share', ROUND(v_hard_share * 100, 1),
      'active_days_last_14', COALESCE(v_active_days_14, 0)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_behavior_profile() TO authenticated;