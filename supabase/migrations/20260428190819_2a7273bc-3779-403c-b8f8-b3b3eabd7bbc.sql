
-- ============================================================
-- DEPTH ENGINE: graph stats + friction-based failure
-- ============================================================

CREATE TABLE IF NOT EXISTS public.depth_state (
  user_id UUID PRIMARY KEY,
  -- graph node values (0..100 scale, except burnout 0..100 negative modifier)
  energy NUMERIC NOT NULL DEFAULT 70,
  burnout NUMERIC NOT NULL DEFAULT 10,
  consistency NUMERIC NOT NULL DEFAULT 50,
  -- derived/cached
  intensity_recent NUMERIC NOT NULL DEFAULT 0,    -- avg intensity last 7d
  rest_gap_days INT NOT NULL DEFAULT 0,           -- days since last rest day
  -- friction state
  friction_multiplier NUMERIC NOT NULL DEFAULT 1.0, -- applied to XP (0.75..1.15)
  friction_expires_at TIMESTAMPTZ,
  comeback_window_until TIMESTAMPTZ,              -- if set & user acts, +bonus
  -- streak quality
  streak_state TEXT NOT NULL DEFAULT 'stable'     -- stable | unstable | broken
    CHECK (streak_state IN ('stable','unstable','broken')),
  unstable_since DATE,
  -- snapshot for UI
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.depth_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Depth state readable by owner" ON public.depth_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Depth state insertable by owner" ON public.depth_state
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Depth state updatable by owner" ON public.depth_state
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.depth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,  -- missed_day | friction_applied | recovery | comeback_bonus | burnout_spike | stabilized | unstable
  delta JSONB NOT NULL DEFAULT '{}'::jsonb,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.depth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Depth events readable by owner" ON public.depth_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS depth_events_user_time_idx
  ON public.depth_events (user_id, created_at DESC);

-- ============================================================
-- Pure helpers
-- ============================================================

-- soft cap: x in [0,100], output asymptotic to 1.0 with diminishing returns
CREATE OR REPLACE FUNCTION public.depth_softcap(x numeric, k numeric DEFAULT 60)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT GREATEST(0, LEAST(1.0, (x / NULLIF(x + k, 0))))
$$;

-- ============================================================
-- Recompute engine: pulls 14d activity, derives node values,
-- evaluates graph edges, writes snapshot + friction multiplier.
-- ============================================================
CREATE OR REPLACE FUNCTION public.recompute_depth_state(p_user UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := COALESCE(p_user, auth.uid());
  v_now TIMESTAMPTZ := now();
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;

  v_acts_7  INT := 0;
  v_acts_14 INT := 0;
  v_hard_7  INT := 0;
  v_active_days_14 INT := 0;
  v_late_acts_7 INT := 0;        -- after 22:00 local approx (UTC 22-04)
  v_minutes_7 INT := 0;
  v_last_active DATE;
  v_streak_curr INT := 0;
  v_rest_gap INT := 0;
  v_missed_yesterday BOOLEAN := false;

  -- node values
  v_discipline NUMERIC;
  v_consistency NUMERIC;
  v_energy NUMERIC;
  v_burnout NUMERIC;
  v_intelligence NUMERIC;

  -- existing state
  v_prev RECORD;

  -- friction
  v_friction NUMERIC := 1.0;
  v_friction_until TIMESTAMPTZ;
  v_streak_state TEXT := 'stable';
  v_unstable_since DATE;
  v_comeback_until TIMESTAMPTZ;

  -- xp gain estimate
  v_xp_mult NUMERIC;
  v_burnout_risk_days INT;
  v_insights JSONB := '[]'::jsonb;
  v_predictions JSONB := '[]'::jsonb;
  v_recs JSONB := '[]'::jsonb;
  v_snapshot JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- pull existing
  SELECT * INTO v_prev FROM public.depth_state WHERE user_id = v_user;

  -- behavior aggregates (last 7/14 days)
  SELECT
    COUNT(*) FILTER (WHERE created_at >= v_now - interval '7 days'),
    COUNT(*) FILTER (WHERE created_at >= v_now - interval '14 days'),
    COUNT(*) FILTER (WHERE created_at >= v_now - interval '7 days' AND difficulty = 'hard'),
    COUNT(DISTINCT activity_date) FILTER (WHERE activity_date >= v_today - 13),
    COUNT(*) FILTER (WHERE created_at >= v_now - interval '7 days'
                       AND (EXTRACT(hour FROM created_at) >= 22 OR EXTRACT(hour FROM created_at) < 4)),
    COALESCE(SUM(duration_minutes) FILTER (WHERE created_at >= v_now - interval '7 days'), 0),
    MAX(activity_date)
  INTO v_acts_7, v_acts_14, v_hard_7, v_active_days_14, v_late_acts_7, v_minutes_7, v_last_active
  FROM public.activities WHERE user_id = v_user;

  SELECT current_streak INTO v_streak_curr FROM public.streaks WHERE user_id = v_user;
  v_streak_curr := COALESCE(v_streak_curr, 0);

  -- rest gap: days since last full no-activity day in last 14
  WITH days AS (
    SELECT generate_series(v_today - 13, v_today, interval '1 day')::date d
  ),
  acts AS (
    SELECT activity_date, COUNT(*) c FROM public.activities
    WHERE user_id = v_user AND activity_date >= v_today - 13
    GROUP BY activity_date
  ),
  joined AS (
    SELECT d.d, COALESCE(a.c, 0) c FROM days d LEFT JOIN acts a ON a.activity_date = d.d
  )
  SELECT COALESCE((v_today - MAX(d)), 14) INTO v_rest_gap
  FROM joined WHERE c = 0;

  v_missed_yesterday := (v_last_active IS NULL OR v_last_active < v_today - 1);

  -- ===== node values =====
  -- consistency: % active days last 14 (smoothed)
  v_consistency := LEAST(100, ROUND((v_active_days_14::numeric / 14.0) * 100));
  -- discipline: blend of completed quests last 14d + consistency
  v_discipline := LEAST(100,
    50 * (SELECT depth_softcap(COUNT(*)::numeric, 14) FROM public.quests
          WHERE user_id = v_user AND completed = true AND COALESCE(completed_at, created_at) >= v_now - interval '14 days')
    + 0.5 * v_consistency
  );
  -- intelligence: hard activities + study-tagged activities last 14d
  v_intelligence := LEAST(100,
    40 * (SELECT depth_softcap(COUNT(*)::numeric, 8) FROM public.activities
          WHERE user_id = v_user AND difficulty='hard' AND created_at >= v_now - interval '14 days')
    + 60 * (SELECT depth_softcap(COUNT(*)::numeric, 12) FROM public.activities a
            JOIN public.activity_types t ON t.id = a.type_id
            WHERE a.user_id = v_user AND t.stat='intelligence' AND a.created_at >= v_now - interval '14 days')
  );

  -- burnout: rises with high volume + no rest + late nights + high intensity
  v_burnout := LEAST(100, GREATEST(0,
      30 * depth_softcap(v_acts_7::numeric, 14)            -- volume
    + 25 * depth_softcap(v_hard_7::numeric, 5)             -- intensity
    + 20 * depth_softcap(GREATEST(v_rest_gap - 5, 0)::numeric, 5) -- no rest
    + 15 * depth_softcap(v_late_acts_7::numeric, 5)        -- late nights
    + 10 * depth_softcap(v_minutes_7::numeric / 30.0, 12)  -- duration load
    - 0.3 * v_consistency * 0.2                            -- consistency cushions
  ));

  -- energy: high baseline, drained by burnout & late nights, restored by rest & moderate consistency
  v_energy := LEAST(100, GREATEST(0,
      80
    - 0.6 * v_burnout
    - 8  * depth_softcap(v_late_acts_7::numeric, 5)
    + 10 * depth_softcap(v_consistency, 60)
    + (CASE WHEN v_rest_gap BETWEEN 1 AND 3 THEN 8 ELSE 0 END)
  ));

  -- ===== friction (failure system) =====
  -- carry previous friction, decay toward 1.0 over time
  IF v_prev IS NOT NULL THEN
    IF v_prev.friction_expires_at IS NOT NULL AND v_prev.friction_expires_at > v_now THEN
      v_friction := v_prev.friction_multiplier;
      v_friction_until := v_prev.friction_expires_at;
    END IF;
    v_streak_state := v_prev.streak_state;
    v_unstable_since := v_prev.unstable_since;
    v_comeback_until := v_prev.comeback_window_until;
  END IF;

  -- missed yesterday → apply soft friction & weaken streak
  IF v_missed_yesterday AND v_streak_curr >= 3 THEN
    v_friction := LEAST(v_friction, 0.85);  -- -15%
    v_friction_until := GREATEST(COALESCE(v_friction_until, v_now), v_now + interval '36 hours');
    IF v_streak_state = 'stable' THEN
      v_streak_state := 'unstable';
      v_unstable_since := v_today;
      v_comeback_until := v_now + interval '36 hours';
      INSERT INTO public.depth_events(user_id, kind, delta, message)
      VALUES (v_user, 'unstable',
        jsonb_build_object('friction', v_friction, 'streak', v_streak_curr),
        'Streak weakened — comeback window 36h to stabilize.');
    END IF;
  END IF;

  -- burnout spike → harsher friction
  IF v_burnout >= 70 THEN
    v_friction := LEAST(v_friction, 0.80);
    v_friction_until := GREATEST(COALESCE(v_friction_until, v_now), v_now + interval '24 hours');
    IF v_prev IS NULL OR v_prev.burnout < 70 THEN
      INSERT INTO public.depth_events(user_id, kind, delta, message)
      VALUES (v_user, 'burnout_spike',
        jsonb_build_object('burnout', v_burnout),
        'Burnout high — XP throttled until you take a rest.');
    END IF;
  END IF;

  -- recovery: if user is active today and was in unstable, stabilize gradually
  IF NOT v_missed_yesterday AND v_acts_7 > 0 THEN
    IF v_streak_state = 'unstable' AND v_streak_curr >= 3 THEN
      -- decay friction back toward 1.0 by 5% per call when active
      v_friction := LEAST(1.0, v_friction + 0.05);
      IF v_friction >= 0.99 THEN
        v_friction := 1.0;
        v_friction_until := NULL;
        v_streak_state := 'stable';
        v_unstable_since := NULL;
        INSERT INTO public.depth_events(user_id, kind, delta, message)
        VALUES (v_user, 'stabilized', jsonb_build_object('friction', 1.0),
                'Stability restored. Multipliers back to full.');
      END IF;
    END IF;
  END IF;

  -- comeback bonus: if user acts inside comeback window
  IF v_comeback_until IS NOT NULL AND v_now <= v_comeback_until AND v_acts_7 > 0 AND NOT v_missed_yesterday THEN
    v_friction := LEAST(1.15, GREATEST(v_friction, 1.10));
    v_friction_until := v_now + interval '6 hours';
    v_comeback_until := NULL;
    INSERT INTO public.depth_events(user_id, kind, delta, message)
    VALUES (v_user, 'comeback_bonus',
      jsonb_build_object('friction', v_friction),
      '+10% XP comeback bonus active for 6h. Welcome back.');
  END IF;

  -- ===== XP multiplier from graph (continuous, stackable, soft-capped) =====
  v_xp_mult :=
      (1.0 + 0.40 * depth_softcap(v_discipline, 50))           -- Discipline ↑ → XP ↑
    * (0.60 + 0.40 * depth_softcap(v_energy, 40))              -- Energy ↓ → efficiency ↓
    * (1.0 - 0.50 * depth_softcap(v_burnout, 50))              -- Burnout ↑ → output ↓
    * v_friction;                                              -- failure friction
  v_xp_mult := ROUND(GREATEST(0.30, LEAST(1.80, v_xp_mult))::numeric, 3);

  -- ===== insights / predictions / recommendations =====
  IF v_burnout >= 60 THEN
    v_insights := v_insights || to_jsonb(('Burnout climbing (' || ROUND(v_burnout) || '/100) — output reduced across the board.')::text);
  END IF;
  IF v_late_acts_7 >= 3 THEN
    v_insights := v_insights || to_jsonb(('Energy drops after late-night sessions — ' || v_late_acts_7 || ' in last 7d.')::text);
  END IF;
  IF v_consistency >= 70 AND v_burnout < 40 THEN
    v_insights := v_insights || to_jsonb(('You perform best in steady, low-intensity streaks.')::text);
  END IF;
  IF v_rest_gap >= 7 THEN
    v_insights := v_insights || to_jsonb(('No rest day in ' || v_rest_gap || ' days — burnout will accelerate.')::text);
  END IF;

  v_burnout_risk_days := CASE
    WHEN v_burnout >= 70 THEN 0
    WHEN v_burnout >= 55 THEN 2
    WHEN v_burnout >= 40 AND v_rest_gap >= 5 THEN 3
    ELSE NULL END;
  IF v_burnout_risk_days IS NOT NULL THEN
    v_predictions := v_predictions || to_jsonb(('At current trend, burnout risk in ' || v_burnout_risk_days || ' day' || (CASE WHEN v_burnout_risk_days=1 THEN '' ELSE 's' END) || '.')::text);
  END IF;
  IF v_streak_state = 'unstable' THEN
    v_predictions := v_predictions || to_jsonb(('Streak unstable — one more miss will fully break it.')::text);
  END IF;

  IF v_burnout >= 55 OR v_rest_gap >= 7 THEN
    v_recs := v_recs || jsonb_build_object('action','rest_day','label','Take a rest day','reason','High burnout risk');
  END IF;
  IF v_energy < 50 THEN
    v_recs := v_recs || jsonb_build_object('action','easy_quest','label','Pick a light quest','reason','Energy low');
  END IF;
  IF v_friction < 1.0 THEN
    v_recs := v_recs || jsonb_build_object('action','recover','label','Log activity to restore multiplier','reason','Friction active');
  END IF;

  -- snapshot (graph payload for UI)
  v_snapshot := jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object('id','discipline','label','Discipline','value', ROUND(v_discipline)),
      jsonb_build_object('id','energy','label','Energy','value', ROUND(v_energy)),
      jsonb_build_object('id','intelligence','label','Intelligence','value', ROUND(v_intelligence)),
      jsonb_build_object('id','consistency','label','Consistency','value', ROUND(v_consistency)),
      jsonb_build_object('id','burnout','label','Burnout','value', ROUND(v_burnout), 'negative', true)
    ),
    'edges', jsonb_build_array(
      jsonb_build_object('from','discipline','to','xp','weight', 0.4, 'kind','positive','label','XP gain'),
      jsonb_build_object('from','energy','to','efficiency','weight', 0.4,'kind','positive','label','Task efficiency'),
      jsonb_build_object('from','energy','to','intelligence','weight', 0.3,'kind','positive','label','Effective intelligence'),
      jsonb_build_object('from','burnout','to','xp','weight', -0.5,'kind','negative','label','Throttles output'),
      jsonb_build_object('from','consistency','to','burnout','weight', -0.3,'kind','negative','label','Cushions burnout'),
      jsonb_build_object('from','intelligence','to','xp','weight', 0.25,'kind','positive','label','High-value rewards')
    ),
    'xp_multiplier', v_xp_mult,
    'friction', jsonb_build_object(
      'value', v_friction,
      'expires_at', v_friction_until,
      'streak_state', v_streak_state,
      'comeback_until', v_comeback_until
    ),
    'insights', v_insights,
    'predictions', v_predictions,
    'recommendations', v_recs,
    'inputs', jsonb_build_object(
      'acts_7', v_acts_7, 'acts_14', v_acts_14, 'hard_7', v_hard_7,
      'active_days_14', v_active_days_14, 'late_acts_7', v_late_acts_7,
      'minutes_7', v_minutes_7, 'rest_gap_days', v_rest_gap,
      'streak_curr', v_streak_curr
    )
  );

  -- upsert
  INSERT INTO public.depth_state (
    user_id, energy, burnout, consistency, intensity_recent, rest_gap_days,
    friction_multiplier, friction_expires_at, comeback_window_until,
    streak_state, unstable_since, snapshot, computed_at, updated_at
  ) VALUES (
    v_user, v_energy, v_burnout, v_consistency,
    depth_softcap(v_hard_7::numeric, 5) * 100, v_rest_gap,
    v_friction, v_friction_until, v_comeback_until,
    v_streak_state, v_unstable_since, v_snapshot, v_now, v_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    energy = EXCLUDED.energy,
    burnout = EXCLUDED.burnout,
    consistency = EXCLUDED.consistency,
    intensity_recent = EXCLUDED.intensity_recent,
    rest_gap_days = EXCLUDED.rest_gap_days,
    friction_multiplier = EXCLUDED.friction_multiplier,
    friction_expires_at = EXCLUDED.friction_expires_at,
    comeback_window_until = EXCLUDED.comeback_window_until,
    streak_state = EXCLUDED.streak_state,
    unstable_since = EXCLUDED.unstable_since,
    snapshot = EXCLUDED.snapshot,
    computed_at = EXCLUDED.computed_at,
    updated_at = EXCLUDED.updated_at;

  RETURN v_snapshot;
END $$;

-- ============================================================
-- Lightweight read used by activity insert: returns just the multiplier
-- ============================================================
CREATE OR REPLACE FUNCTION public.depth_xp_multiplier(p_user UUID)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_m numeric;
BEGIN
  SELECT (snapshot->>'xp_multiplier')::numeric INTO v_m
  FROM public.depth_state WHERE user_id = COALESCE(p_user, auth.uid());
  RETURN COALESCE(v_m, 1.0);
END $$;

-- ============================================================
-- Dashboard read: returns snapshot + recent timeline
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_depth_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_snap JSONB;
  v_state RECORD;
  v_events JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- recompute on read so the engine feels alive
  v_snap := public.recompute_depth_state(v_user);

  SELECT * INTO v_state FROM public.depth_state WHERE user_id = v_user;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'kind', e.kind, 'message', e.message,
    'delta', e.delta, 'created_at', e.created_at
  ) ORDER BY e.created_at DESC), '[]'::jsonb) INTO v_events
  FROM (
    SELECT * FROM public.depth_events
    WHERE user_id = v_user ORDER BY created_at DESC LIMIT 25
  ) e;

  RETURN jsonb_build_object(
    'snapshot', v_snap,
    'state', jsonb_build_object(
      'energy', v_state.energy,
      'burnout', v_state.burnout,
      'consistency', v_state.consistency,
      'friction_multiplier', v_state.friction_multiplier,
      'friction_expires_at', v_state.friction_expires_at,
      'streak_state', v_state.streak_state,
      'comeback_until', v_state.comeback_window_until,
      'computed_at', v_state.computed_at
    ),
    'events', v_events
  );
END $$;

-- ============================================================
-- Hook depth multiplier into activities on insert
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_depth_to_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mult numeric;
  v_orig int;
  v_breakdown jsonb;
BEGIN
  -- only adjust on initial insert
  v_mult := public.depth_xp_multiplier(NEW.user_id);
  IF v_mult IS NULL OR v_mult = 1.0 THEN
    RETURN NEW;
  END IF;
  v_orig := NEW.xp_gained;
  NEW.xp_gained := GREATEST(1, ROUND(NEW.xp_gained * v_mult));
  v_breakdown := COALESCE(NEW.multiplier_breakdown, '{}'::jsonb)
                 || jsonb_build_object('depth_engine', v_mult, 'pre_depth_xp', v_orig);
  NEW.multiplier_breakdown := v_breakdown;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS apply_depth_to_activity_trg ON public.activities;
CREATE TRIGGER apply_depth_to_activity_trg
  BEFORE INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.apply_depth_to_activity();

-- After insert, trigger an async-style refresh so next activity sees fresh state
CREATE OR REPLACE FUNCTION public.refresh_depth_after_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_depth_state(NEW.user_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS refresh_depth_after_activity_trg ON public.activities;
CREATE TRIGGER refresh_depth_after_activity_trg
  AFTER INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.refresh_depth_after_activity();

GRANT EXECUTE ON FUNCTION public.recompute_depth_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.depth_xp_multiplier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_depth_dashboard() TO authenticated;
