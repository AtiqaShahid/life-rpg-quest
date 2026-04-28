-- =========================================================
-- ADAPTIVE BEHAVIOR ENGINE
-- Closed-loop: tracks behavior -> interprets -> adapts (subtle, auto)
-- =========================================================

-- 1. BEHAVIOR MEMORY (personalization layer)
CREATE TABLE IF NOT EXISTS public.behavior_memory (
  user_id UUID PRIMARY KEY,
  preferred_types JSONB NOT NULL DEFAULT '{}'::jsonb,        -- { type_id: weight }
  peak_hours JSONB NOT NULL DEFAULT '[]'::jsonb,             -- [hour,...]
  failure_triggers JSONB NOT NULL DEFAULT '{}'::jsonb,       -- { reason: count }
  recovery_pattern JSONB NOT NULL DEFAULT '{}'::jsonb,       -- { avg_recovery_hours, best_type }
  reward_responsiveness NUMERIC NOT NULL DEFAULT 0.5,        -- 0..1
  avoidance JSONB NOT NULL DEFAULT '{}'::jsonb,              -- { difficulty_band: count }
  last_session_minutes NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.behavior_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Memory readable by owner" ON public.behavior_memory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Memory upsertable by owner" ON public.behavior_memory
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Memory updatable by owner" ON public.behavior_memory
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 2. ADAPTIVE STATE (current closed-loop snapshot)
CREATE TABLE IF NOT EXISTS public.adaptive_state (
  user_id UUID PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'stable',                       -- recovery|stable|momentum|intervention
  difficulty_bias NUMERIC NOT NULL DEFAULT 0,                -- -1..+1 subtle
  xp_bias NUMERIC NOT NULL DEFAULT 1.0,                      -- 0.85..1.20 subtle
  reward_bias NUMERIC NOT NULL DEFAULT 1.0,
  risk_burnout NUMERIC NOT NULL DEFAULT 0,                   -- 0..1
  risk_streak_break NUMERIC NOT NULL DEFAULT 0,
  risk_dropoff NUMERIC NOT NULL DEFAULT 0,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT NOT NULL DEFAULT '',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.adaptive_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Adaptive state readable by owner" ON public.adaptive_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Adaptive state upsertable by owner" ON public.adaptive_state
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Adaptive state updatable by owner" ON public.adaptive_state
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 3. ADAPTIVE EVENTS (auto-triggered, with cooldown)
CREATE TABLE IF NOT EXISTS public.adaptive_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,           -- recovery|momentum|intervention|seasonal_tune
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.adaptive_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Adaptive events readable by owner" ON public.adaptive_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_events_user_created
  ON public.adaptive_events(user_id, created_at DESC);

-- =========================================================
-- 4. CORE: compute_adaptive_state
-- Closed loop: depth + activity history + quest completion -> mode + biases
-- Subtle adaptation (per user preference): xp_bias clamped 0.85..1.20
-- =========================================================
CREATE OR REPLACE FUNCTION public.compute_adaptive_state(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_energy NUMERIC := 70;
  v_burnout NUMERIC := 10;
  v_consistency NUMERIC := 50;
  v_friction NUMERIC := 1.0;
  v_streak_state TEXT := 'stable';
  v_acts_7 INT := 0;
  v_acts_3 INT := 0;
  v_acts_1 INT := 0;
  v_acts_prev_7 INT := 0;
  v_quests_done_7 INT := 0;
  v_quests_total_7 INT := 0;
  v_avg_xp_7 NUMERIC := 0;
  v_avg_xp_30 NUMERIC := 0;
  v_hours_since_last NUMERIC := 999;
  v_hard_share NUMERIC := 0;
  v_easy_share NUMERIC := 0;
  v_decline_pct NUMERIC := 0;
  v_completion_rate NUMERIC := 0;
  v_risk_burnout NUMERIC := 0;
  v_risk_streak NUMERIC := 0;
  v_risk_dropoff NUMERIC := 0;
  v_mode TEXT := 'stable';
  v_diff_bias NUMERIC := 0;
  v_xp_bias NUMERIC := 1.0;
  v_reward_bias NUMERIC := 1.0;
  v_rationale TEXT := '';
  v_signals JSONB := '{}'::jsonb;
  v_last_evt_kind TEXT;
  v_last_evt_age_h NUMERIC := 999;
  v_pref_types JSONB := '{}'::jsonb;
  v_peak_hours JSONB := '[]'::jsonb;
  v_emit_event BOOLEAN := FALSE;
  v_event_kind TEXT;
  v_event_msg TEXT;
BEGIN
  -- Pull depth state
  SELECT energy, burnout, consistency, friction_multiplier, streak_state
    INTO v_energy, v_burnout, v_consistency, v_friction, v_streak_state
  FROM public.depth_state WHERE user_id = p_user;

  IF v_energy IS NULL THEN
    -- bootstrap depth first
    PERFORM public.recompute_depth_state(p_user);
    SELECT energy, burnout, consistency, friction_multiplier, streak_state
      INTO v_energy, v_burnout, v_consistency, v_friction, v_streak_state
    FROM public.depth_state WHERE user_id = p_user;
  END IF;
  v_energy := COALESCE(v_energy, 70);
  v_burnout := COALESCE(v_burnout, 10);
  v_consistency := COALESCE(v_consistency, 50);
  v_friction := COALESCE(v_friction, 1.0);

  -- Activity windows
  SELECT COUNT(*) INTO v_acts_7 FROM public.activities
    WHERE user_id = p_user AND created_at >= now() - INTERVAL '7 days';
  SELECT COUNT(*) INTO v_acts_3 FROM public.activities
    WHERE user_id = p_user AND created_at >= now() - INTERVAL '3 days';
  SELECT COUNT(*) INTO v_acts_1 FROM public.activities
    WHERE user_id = p_user AND created_at >= now() - INTERVAL '24 hours';
  SELECT COUNT(*) INTO v_acts_prev_7 FROM public.activities
    WHERE user_id = p_user
      AND created_at >= now() - INTERVAL '14 days'
      AND created_at <  now() - INTERVAL '7 days';

  SELECT COALESCE(AVG(xp_gained),0) INTO v_avg_xp_7 FROM public.activities
    WHERE user_id = p_user AND created_at >= now() - INTERVAL '7 days';
  SELECT COALESCE(AVG(xp_gained),0) INTO v_avg_xp_30 FROM public.activities
    WHERE user_id = p_user AND created_at >= now() - INTERVAL '30 days';

  SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MAX(created_at)))/3600.0, 999)
    INTO v_hours_since_last
  FROM public.activities WHERE user_id = p_user;

  -- Difficulty mix (last 14d)
  WITH d AS (
    SELECT difficulty FROM public.activities
    WHERE user_id = p_user AND created_at >= now() - INTERVAL '14 days'
  )
  SELECT
    CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(CASE WHEN difficulty='hard' THEN 1 ELSE 0 END)::NUMERIC/COUNT(*) END,
    CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(CASE WHEN difficulty='easy' THEN 1 ELSE 0 END)::NUMERIC/COUNT(*) END
  INTO v_hard_share, v_easy_share FROM d;

  -- Quest completion (last 7d)
  SELECT COUNT(*) FILTER (WHERE completed = true), COUNT(*)
    INTO v_quests_done_7, v_quests_total_7
  FROM public.quests
  WHERE user_id = p_user AND created_at >= now() - INTERVAL '7 days';
  v_completion_rate := CASE WHEN v_quests_total_7 = 0 THEN 0.5
                            ELSE v_quests_done_7::NUMERIC / v_quests_total_7 END;

  -- Performance decline
  IF v_avg_xp_30 > 0 THEN
    v_decline_pct := GREATEST(0, (v_avg_xp_30 - v_avg_xp_7) / v_avg_xp_30);
  END IF;

  -- Preferred types (top 3 by frequency in last 30d)
  SELECT COALESCE(jsonb_object_agg(type_id, c), '{}'::jsonb) INTO v_pref_types
  FROM (
    SELECT type_id, COUNT(*) AS c
    FROM public.activities
    WHERE user_id = p_user AND created_at >= now() - INTERVAL '30 days'
    GROUP BY type_id ORDER BY c DESC LIMIT 5
  ) t;

  -- Peak hours (top 3)
  SELECT COALESCE(jsonb_agg(h ORDER BY c DESC), '[]'::jsonb) INTO v_peak_hours
  FROM (
    SELECT EXTRACT(HOUR FROM created_at)::INT AS h, COUNT(*) AS c
    FROM public.activities
    WHERE user_id = p_user AND created_at >= now() - INTERVAL '30 days'
    GROUP BY 1 ORDER BY c DESC LIMIT 3
  ) t;

  -- ============ PREDICTIONS ============
  -- Burnout risk: high burnout + high recent volume + declining xp
  v_risk_burnout := LEAST(1, GREATEST(0,
      (v_burnout/100.0) * 0.55
    + LEAST(1, v_acts_3 / 12.0) * 0.20
    + v_decline_pct * 0.25
  ));

  -- Streak break risk: hours since last + low consistency + unstable streak
  v_risk_streak := LEAST(1, GREATEST(0,
      LEAST(1, v_hours_since_last / 36.0) * 0.55
    + (1 - v_consistency/100.0) * 0.30
    + CASE WHEN v_streak_state IN ('unstable','broken') THEN 0.15 ELSE 0 END
  ));

  -- Drop-off risk: declining volume vs prev week + low completion
  v_risk_dropoff := LEAST(1, GREATEST(0,
      CASE WHEN v_acts_prev_7 = 0 THEN 0
           ELSE GREATEST(0, (v_acts_prev_7 - v_acts_7)::NUMERIC / GREATEST(v_acts_prev_7,1)) END * 0.6
    + (1 - v_completion_rate) * 0.4
  ));

  -- ============ MODE DECISION (subtle) ============
  -- Recovery: missed tasks / burnout rising
  IF v_risk_burnout >= 0.6 OR (v_streak_state IN ('unstable','broken') AND v_burnout >= 35) THEN
    v_mode := 'recovery';
    v_diff_bias := -0.6;
    v_xp_bias := 1.18;     -- bonus on small wins (subtle cap)
    v_reward_bias := 1.15;
    v_rationale := 'Burnout pressure detected — softening load and amplifying small wins.';
  -- Intervention: predicted failure BEFORE it happens
  ELSIF v_risk_burnout >= 0.45 OR v_risk_streak >= 0.6 OR v_risk_dropoff >= 0.55 THEN
    v_mode := 'intervention';
    v_diff_bias := -0.3;
    v_xp_bias := 1.10;
    v_reward_bias := 1.05;
    v_rationale := 'Stability warning — pre-emptively easing intensity.';
  -- Momentum: high consistency, low burnout, healthy completion
  ELSIF v_consistency >= 70 AND v_burnout < 35 AND v_completion_rate >= 0.6 AND v_acts_7 >= 5 THEN
    v_mode := 'momentum';
    v_diff_bias := 0.5;
    v_xp_bias := 1.12;
    v_reward_bias := 1.10;
    v_rationale := 'Momentum surge — quietly raising challenge and rewards.';
  ELSE
    v_mode := 'stable';
    v_diff_bias := 0.0;
    v_xp_bias := 1.0;
    v_reward_bias := 1.0;
    v_rationale := 'Stable — maintaining variety.';
  END IF;

  -- Subtle clamp (per user preference: subtle aggressiveness)
  v_xp_bias := LEAST(1.20, GREATEST(0.85, v_xp_bias));
  v_diff_bias := LEAST(1.0, GREATEST(-1.0, v_diff_bias));

  v_signals := jsonb_build_object(
    'energy', v_energy,
    'burnout', v_burnout,
    'consistency', v_consistency,
    'friction', v_friction,
    'streak_state', v_streak_state,
    'acts_7', v_acts_7,
    'acts_3', v_acts_3,
    'acts_prev_7', v_acts_prev_7,
    'hours_since_last', round(v_hours_since_last::NUMERIC, 1),
    'hard_share', round(v_hard_share, 2),
    'easy_share', round(v_easy_share, 2),
    'decline_pct', round(v_decline_pct, 2),
    'completion_rate', round(v_completion_rate, 2),
    'avg_xp_7', round(v_avg_xp_7, 1),
    'avg_xp_30', round(v_avg_xp_30, 1)
  );

  -- Upsert state
  INSERT INTO public.adaptive_state(user_id, mode, difficulty_bias, xp_bias, reward_bias,
                                    risk_burnout, risk_streak_break, risk_dropoff,
                                    signals, rationale, computed_at)
  VALUES (p_user, v_mode, v_diff_bias, v_xp_bias, v_reward_bias,
          v_risk_burnout, v_risk_streak, v_risk_dropoff, v_signals, v_rationale, now())
  ON CONFLICT (user_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    difficulty_bias = EXCLUDED.difficulty_bias,
    xp_bias = EXCLUDED.xp_bias,
    reward_bias = EXCLUDED.reward_bias,
    risk_burnout = EXCLUDED.risk_burnout,
    risk_streak_break = EXCLUDED.risk_streak_break,
    risk_dropoff = EXCLUDED.risk_dropoff,
    signals = EXCLUDED.signals,
    rationale = EXCLUDED.rationale,
    computed_at = now();

  -- Update behavior memory
  INSERT INTO public.behavior_memory(user_id, preferred_types, peak_hours,
                                     reward_responsiveness, last_session_minutes, updated_at)
  VALUES (p_user, v_pref_types, v_peak_hours,
          LEAST(1.0, GREATEST(0.0, v_completion_rate)), 0, now())
  ON CONFLICT (user_id) DO UPDATE SET
    preferred_types = EXCLUDED.preferred_types,
    peak_hours = EXCLUDED.peak_hours,
    reward_responsiveness = (public.behavior_memory.reward_responsiveness * 0.7
                             + EXCLUDED.reward_responsiveness * 0.3),
    updated_at = now();

  -- Emit adaptive event with cooldown (don't spam)
  SELECT kind, EXTRACT(EPOCH FROM (now() - created_at))/3600.0
    INTO v_last_evt_kind, v_last_evt_age_h
  FROM public.adaptive_events
  WHERE user_id = p_user
  ORDER BY created_at DESC LIMIT 1;
  v_last_evt_age_h := COALESCE(v_last_evt_age_h, 999);

  IF v_mode = 'recovery' AND (v_last_evt_kind IS DISTINCT FROM 'recovery' OR v_last_evt_age_h > 18) THEN
    v_emit_event := TRUE;
    v_event_kind := 'recovery';
    v_event_msg := 'Recovery Mode: lighter quests, bonus XP on small wins.';
  ELSIF v_mode = 'momentum' AND (v_last_evt_kind IS DISTINCT FROM 'momentum' OR v_last_evt_age_h > 24) THEN
    v_emit_event := TRUE;
    v_event_kind := 'momentum';
    v_event_msg := 'Momentum Surge: harder quests unlocked, higher XP yield.';
  ELSIF v_mode = 'intervention' AND (v_last_evt_kind IS DISTINCT FROM 'intervention' OR v_last_evt_age_h > 12) THEN
    v_emit_event := TRUE;
    v_event_kind := 'intervention';
    v_event_msg := 'Stability Warning: easing intensity to protect your streak.';
  END IF;

  IF v_emit_event THEN
    INSERT INTO public.adaptive_events(user_id, kind, message, payload)
    VALUES (p_user, v_event_kind, v_event_msg, jsonb_build_object(
      'mode', v_mode, 'xp_bias', v_xp_bias, 'difficulty_bias', v_diff_bias,
      'risk_burnout', v_risk_burnout, 'risk_streak', v_risk_streak,
      'risk_dropoff', v_risk_dropoff
    ));
  END IF;

  RETURN jsonb_build_object(
    'mode', v_mode,
    'difficulty_bias', v_diff_bias,
    'xp_bias', v_xp_bias,
    'reward_bias', v_reward_bias,
    'risk_burnout', round(v_risk_burnout, 2),
    'risk_streak_break', round(v_risk_streak, 2),
    'risk_dropoff', round(v_risk_dropoff, 2),
    'signals', v_signals,
    'rationale', v_rationale
  );
END;
$$;

-- =========================================================
-- 5. Apply adaptive xp_bias on every activity insert
-- We modify apply_depth_to_activity to also fold in xp_bias.
-- =========================================================
CREATE OR REPLACE FUNCTION public.apply_depth_to_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap JSONB;
  v_mult NUMERIC := 1.0;
  v_xp_bias NUMERIC := 1.0;
  v_base INT;
BEGIN
  -- Pull depth multiplier (recompute lazily)
  v_snap := public.recompute_depth_state(NEW.user_id);
  v_mult := COALESCE((v_snap->>'xp_multiplier')::NUMERIC, 1.0);

  -- Adaptive xp bias (silent)
  SELECT xp_bias INTO v_xp_bias FROM public.adaptive_state WHERE user_id = NEW.user_id;
  v_xp_bias := COALESCE(v_xp_bias, 1.0);

  v_base := COALESCE(NEW.base_xp, NEW.xp_gained);
  IF v_base IS NULL OR v_base <= 0 THEN
    RETURN NEW;
  END IF;
  NEW.base_xp := v_base;
  NEW.xp_gained := GREATEST(1, ROUND(v_base * v_mult * v_xp_bias));
  NEW.multiplier_breakdown := COALESCE(NEW.multiplier_breakdown, '{}'::jsonb)
    || jsonb_build_object(
        'depth_multiplier', round(v_mult, 3),
        'adaptive_xp_bias', round(v_xp_bias, 3),
        'final_multiplier', round(v_mult * v_xp_bias, 3)
      );
  RETURN NEW;
END;
$$;

-- Recompute adaptive state AFTER activity insert (silent loop)
CREATE OR REPLACE FUNCTION public.refresh_adaptive_after_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.compute_adaptive_state(NEW.user_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS refresh_adaptive_after_activity_trg ON public.activities;
CREATE TRIGGER refresh_adaptive_after_activity_trg
  AFTER INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.refresh_adaptive_after_activity();

-- =========================================================
-- 6. Adaptive quest pick — used by quest generator
-- Returns recommended difficulty band + preferred type pool
-- =========================================================
CREATE OR REPLACE FUNCTION public.adaptive_quest_pick(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.adaptive_state%ROWTYPE;
  v_mem public.behavior_memory%ROWTYPE;
  v_diff_min INT := 2;
  v_diff_max INT := 4;
  v_band TEXT := 'medium';
BEGIN
  SELECT * INTO v_state FROM public.adaptive_state WHERE user_id = p_user;
  SELECT * INTO v_mem   FROM public.behavior_memory WHERE user_id = p_user;

  IF v_state.user_id IS NULL THEN
    PERFORM public.compute_adaptive_state(p_user);
    SELECT * INTO v_state FROM public.adaptive_state WHERE user_id = p_user;
    SELECT * INTO v_mem   FROM public.behavior_memory WHERE user_id = p_user;
  END IF;

  -- Map difficulty_bias (-1..1) to a quest difficulty band 1..5
  IF v_state.difficulty_bias <= -0.4 THEN
    v_diff_min := 1; v_diff_max := 2; v_band := 'easy';
  ELSIF v_state.difficulty_bias < 0.3 THEN
    v_diff_min := 2; v_diff_max := 3; v_band := 'medium';
  ELSE
    v_diff_min := 3; v_diff_max := 5; v_band := 'hard';
  END IF;

  RETURN jsonb_build_object(
    'mode', COALESCE(v_state.mode, 'stable'),
    'difficulty_band', v_band,
    'difficulty_min', v_diff_min,
    'difficulty_max', v_diff_max,
    'xp_bias', COALESCE(v_state.xp_bias, 1.0),
    'reward_bias', COALESCE(v_state.reward_bias, 1.0),
    'preferred_types', COALESCE(v_mem.preferred_types, '{}'::jsonb),
    'peak_hours', COALESCE(v_mem.peak_hours, '[]'::jsonb),
    'risk_burnout', COALESCE(v_state.risk_burnout, 0),
    'risk_streak_break', COALESCE(v_state.risk_streak_break, 0),
    'risk_dropoff', COALESCE(v_state.risk_dropoff, 0)
  );
END;
$$;

-- =========================================================
-- 7. Dashboard RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_adaptive_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_state JSONB;
  v_events JSONB;
  v_mem JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_state := public.compute_adaptive_state(v_user);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'kind', kind, 'message', message,
    'payload', payload, 'created_at', created_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_events
  FROM (SELECT * FROM public.adaptive_events WHERE user_id = v_user
        ORDER BY created_at DESC LIMIT 10) t;
  SELECT to_jsonb(b) INTO v_mem FROM public.behavior_memory b WHERE user_id = v_user;
  RETURN jsonb_build_object(
    'state', v_state,
    'events', v_events,
    'memory', COALESCE(v_mem, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_adaptive_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adaptive_quest_pick(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_adaptive_dashboard() TO authenticated;