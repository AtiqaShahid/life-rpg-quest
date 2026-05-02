
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_paused_ms bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pauses_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timer_penalty numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS quests_user_in_progress_idx
  ON public.quests (user_id) WHERE status IN ('in_progress','paused');

CREATE OR REPLACE FUNCTION public.start_quest(p_quest_id uuid, p_duration_minutes integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_quest public.quests;
  v_dur integer;
  v_other uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id AND user_id = v_user;
  IF v_quest.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF v_quest.status NOT IN ('active','locked') THEN
    RETURN jsonb_build_object('ok',false,'reason','not_startable','status',v_quest.status);
  END IF;
  IF v_quest.completed THEN RETURN jsonb_build_object('ok',false,'reason','already_completed'); END IF;
  SELECT id INTO v_other FROM public.quests
    WHERE user_id = v_user AND status IN ('in_progress','paused') AND id <> p_quest_id LIMIT 1;
  IF v_other IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','another_quest_active','active_quest_id',v_other);
  END IF;
  v_dur := COALESCE(
    p_duration_minutes,
    NULLIF((v_quest.criteria->>'min_duration')::int, 0),
    GREATEST(5, v_quest.difficulty * 5)
  );
  IF v_dur < 1 OR v_dur > 240 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_duration');
  END IF;
  UPDATE public.quests
    SET status = 'in_progress', duration_minutes = v_dur,
        started_at = now(), ends_at = now() + make_interval(mins => v_dur),
        paused_at = NULL, total_paused_ms = 0, pauses_used = 0, timer_penalty = 0
    WHERE id = p_quest_id;
  RETURN jsonb_build_object('ok', true, 'quest_id', p_quest_id,
    'duration_minutes', v_dur, 'started_at', now(), 'ends_at', now() + make_interval(mins => v_dur));
END; $$;

CREATE OR REPLACE FUNCTION public.pause_quest(p_quest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user uuid := auth.uid(); v_quest public.quests;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id AND user_id = v_user;
  IF v_quest.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF v_quest.status <> 'in_progress' THEN RETURN jsonb_build_object('ok',false,'reason','not_running'); END IF;
  IF v_quest.pauses_used >= 2 THEN RETURN jsonb_build_object('ok',false,'reason','pause_limit'); END IF;
  UPDATE public.quests SET status = 'paused', paused_at = now() WHERE id = p_quest_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.resume_quest(p_quest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user uuid := auth.uid(); v_quest public.quests; v_paused_ms bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id AND user_id = v_user;
  IF v_quest.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF v_quest.status <> 'paused' OR v_quest.paused_at IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','not_paused');
  END IF;
  v_paused_ms := EXTRACT(EPOCH FROM (now() - v_quest.paused_at))::bigint * 1000;
  UPDATE public.quests
    SET status = 'in_progress',
        ends_at = ends_at + (now() - paused_at),
        total_paused_ms = total_paused_ms + v_paused_ms,
        pauses_used = pauses_used + 1,
        timer_penalty = LEAST(0.5, timer_penalty + 0.1),
        paused_at = NULL
    WHERE id = p_quest_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.abandon_quest(p_quest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user uuid := auth.uid(); v_quest public.quests;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id AND user_id = v_user;
  IF v_quest.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF v_quest.status NOT IN ('in_progress','paused') THEN
    RETURN jsonb_build_object('ok',false,'reason','not_running');
  END IF;
  UPDATE public.quests SET status = 'failed', paused_at = NULL WHERE id = p_quest_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.complete_quest(p_quest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_quest public.quests;
  v_xp_calc jsonb;
  v_xp integer; v_coins integer; v_tokens integer := 0;
  v_level integer; v_xp_now integer; v_skill_points integer;
  v_new_level integer; v_new_xp integer; v_threshold integer;
  v_levels_gained integer := 0;
  v_stat text; v_boost_mult numeric; v_penalty numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id AND user_id = v_user;
  IF v_quest.id IS NULL THEN RAISE EXCEPTION 'quest_not_found'; END IF;
  IF v_quest.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed');
  END IF;
  IF v_quest.duration_minutes IS NOT NULL THEN
    IF v_quest.status <> 'in_progress' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'timer_not_running');
    END IF;
    IF v_quest.ends_at IS NULL OR now() < v_quest.ends_at THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'timer_not_done',
        'ends_at', v_quest.ends_at,
        'remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (v_quest.ends_at - now()))::int));
    END IF;
  ELSIF v_quest.status NOT IN ('active','locked') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_completable');
  END IF;

  v_xp_calc := public.compute_quest_xp(v_user, v_quest.difficulty, v_quest.quest_type);
  v_boost_mult := public.get_active_xp_multiplier(v_user);
  v_penalty := COALESCE(v_quest.timer_penalty, 0);
  v_xp := GREATEST(1, ROUND((v_xp_calc->>'final')::int * v_boost_mult * (1 - v_penalty)));
  v_coins := GREATEST(1, FLOOR(v_xp::numeric / 8)::int);
  IF v_quest.quest_type = 'weekly' THEN v_tokens := 1;
  ELSIF v_quest.quest_type = 'epic' THEN v_tokens := 3; END IF;

  SELECT level, xp, skill_points INTO v_level, v_xp_now, v_skill_points
    FROM public.profiles WHERE user_id = v_user;
  v_new_level := v_level; v_new_xp := v_xp_now + v_xp;
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
        coins = coins + v_coins, tokens = tokens + v_tokens, updated_at = now()
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

  RETURN jsonb_build_object('ok', true,
    'xp_gained', v_xp, 'coins_gained', v_coins, 'tokens_gained', v_tokens,
    'levels_gained', v_levels_gained, 'new_level', v_new_level, 'new_xp', v_new_xp,
    'skill_points_awarded', v_levels_gained * 3, 'penalty_applied', v_penalty);
END; $$;
