-- Stabilize quest reset/repair behavior and timer start defaults.

CREATE OR REPLACE FUNCTION public.start_quest(p_quest_id uuid, p_duration_minutes integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_quest public.quests;
  v_dur integer;
  v_other uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id AND user_id = v_user;
  IF v_quest.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_quest.status NOT IN ('active', 'locked') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_startable', 'status', v_quest.status);
  END IF;
  IF v_quest.completed THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_completed'); END IF;

  SELECT id INTO v_other
  FROM public.quests
  WHERE user_id = v_user AND status IN ('in_progress', 'paused') AND id <> p_quest_id
  LIMIT 1;
  IF v_other IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'another_quest_active', 'active_quest_id', v_other);
  END IF;

  v_dur := COALESCE(
    p_duration_minutes,
    NULLIF(v_quest.duration_minutes, 0),
    NULLIF((v_quest.criteria->>'min_duration')::int, 0),
    GREATEST(10, v_quest.difficulty * 5)
  );
  v_dur := LEAST(30, GREATEST(1, v_dur));

  UPDATE public.quests
  SET status = 'in_progress',
      duration_minutes = v_dur,
      started_at = now(),
      ends_at = now() + make_interval(mins => v_dur),
      paused_at = NULL,
      total_paused_ms = 0,
      pauses_used = 0,
      timer_penalty = 0
  WHERE id = p_quest_id;

  RETURN jsonb_build_object(
    'ok', true,
    'quest_id', p_quest_id,
    'duration_minutes', v_dur,
    'started_at', now(),
    'ends_at', now() + make_interval(mins => v_dur)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_quest(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_quest(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public._seed_three_weekly_quests(p_user uuid, p_week_start date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_xp jsonb;
  v_seed int;
  v_idx int;
  v_quest_id uuid;
  v_pool jsonb := jsonb_build_array(
    jsonb_build_object('title','Deep work marathon','desc','Complete 5 focused work blocks this week.','type_id','study','min_dur',30,'diff',5,'stats',jsonb_build_array('intelligence','discipline'),'energy','high','target',5),
    jsonb_build_object('title','Train 4 sessions','desc','Complete 4 workout sessions this week.','type_id','workout','min_dur',30,'diff',5,'stats',jsonb_build_array('strength','discipline'),'energy','high','target',4),
    jsonb_build_object('title','Read 3 sessions','desc','Complete 3 focused reading sessions this week.','type_id','study','min_dur',20,'diff',4,'stats',jsonb_build_array('intelligence'),'energy','medium','target',3),
    jsonb_build_object('title','Meditate 5 days','desc','Meditate at least 10 minutes on 5 different days.','type_id','meditation','min_dur',10,'diff',4,'stats',jsonb_build_array('discipline'),'energy','low','target',5),
    jsonb_build_object('title','Active week','desc','Walk or do cardio on 5 different days.','type_id','cardio','min_dur',20,'diff',4,'stats',jsonb_build_array('strength'),'energy','medium','target',5),
    jsonb_build_object('title','Skill builder','desc','Practice a chosen skill 4 times this week.','type_id','study','min_dur',30,'diff',5,'stats',jsonb_build_array('intelligence','discipline'),'energy','high','target',4),
    jsonb_build_object('title','Connection week','desc','Have 3 meaningful conversations this week.','type_id','socializing','min_dur',10,'diff',3,'stats',jsonb_build_array('charisma'),'energy','medium','target',3)
  );
  v_pool_size int := jsonb_array_length(v_pool);
  v_pick jsonb;
BEGIN
  v_seed := (p_week_start - DATE '1970-01-05')::int / 7;

  FOR v_idx IN 0..2 LOOP
    v_pick := v_pool -> ((v_seed + v_idx * 2) % v_pool_size);
    v_xp := public.compute_quest_xp(p_user, (v_pick->>'diff')::int, 'weekly'::public.quest_type);

    INSERT INTO public.quests (
      user_id, title, description, quest_type, difficulty, linked_stats, energy,
      criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key,
      is_compulsory, slot_index, completed, duration_minutes
    ) VALUES (
      p_user, v_pick->>'title', v_pick->>'desc', 'weekly',
      (v_pick->>'diff')::int,
      ARRAY(SELECT jsonb_array_elements_text(v_pick->'stats'))::text[],
      ((v_pick->>'energy')::text)::public.quest_energy,
      jsonb_strip_nulls(jsonb_build_object(
        'type_id', v_pick->>'type_id',
        'min_duration', (v_pick->>'min_dur')::int
      )),
      'active'::public.quest_status,
      (v_xp->>'final')::int,
      false,
      (p_week_start + 7)::timestamptz,
      'weekly_diverse_v2',
      'weekly_v2_' || v_idx,
      false,
      v_idx + 1,
      false,
      LEAST(30, GREATEST(10, (v_pick->>'min_dur')::int))
    ) RETURNING id INTO v_quest_id;

    INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
    VALUES (v_quest_id, p_user, 0, GREATEST(1, (v_pick->>'target')::int), 'count');
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._seed_three_weekly_quests(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._seed_three_weekly_quests(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.hard_daily_reset(p_local_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_last date;
  v_archived int := 0;
  v_daily_slots int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_local_date IS NULL THEN p_local_date := CURRENT_DATE; END IF;

  SELECT last_daily_reset INTO v_last FROM public.profiles WHERE user_id = v_user;

  SELECT count(DISTINCT slot_index) INTO v_daily_slots
  FROM public.quests
  WHERE user_id = v_user
    AND quest_type = 'daily'
    AND is_daily = true
    AND slot_index BETWEEN 1 AND 3
    AND status IN ('active', 'locked', 'in_progress', 'paused', 'completed');

  IF v_last IS NOT NULL AND v_last >= p_local_date AND v_daily_slots = 3 THEN
    WITH ranked AS (
      SELECT id,
             row_number() OVER (PARTITION BY user_id, quest_type, slot_index ORDER BY completed DESC, created_at DESC, id DESC) AS rn
      FROM public.quests
      WHERE user_id = v_user AND quest_type = 'daily' AND is_daily = true AND slot_index BETWEEN 1 AND 3
    ), doomed AS (
      SELECT id FROM ranked WHERE rn > 1
    )
    DELETE FROM public.quests q USING doomed d WHERE q.id = d.id;

    RETURN jsonb_build_object('ok', true, 'reset', false, 'reason', 'already_reset_today', 'slots', v_daily_slots);
  END IF;

  WITH ins AS (
    INSERT INTO public.quest_archive (user_id, archive_date, quest_type, title, template_key, is_compulsory, completed, xp_earned, payload)
    SELECT q.user_id, COALESCE(v_last, p_local_date - 1), q.quest_type::text, q.title, q.template_key, q.is_compulsory, q.completed,
           CASE WHEN q.completed THEN q.reward_xp ELSE 0 END,
           jsonb_build_object('difficulty', q.difficulty, 'criteria', q.criteria, 'completed_at', q.completed_at, 'repair_reason', CASE WHEN v_last >= p_local_date THEN 'missing_daily_slots' ELSE 'date_changed' END)
    FROM public.quests q
    WHERE q.user_id = v_user AND q.is_daily = true
    RETURNING 1
  )
  SELECT count(*) INTO v_archived FROM ins;

  DELETE FROM public.quest_progress qp
  USING public.quests q
  WHERE qp.quest_id = q.id AND q.user_id = v_user AND q.is_daily = true;

  DELETE FROM public.quests
  WHERE user_id = v_user AND is_daily = true;

  PERFORM public._seed_three_daily_quests(v_user, p_local_date);

  UPDATE public.profiles SET last_daily_reset = p_local_date, updated_at = now()
  WHERE user_id = v_user;

  RETURN jsonb_build_object('ok', true, 'reset', true, 'archived', v_archived, 'date', p_local_date, 'slots', 3);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hard_daily_reset(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_daily_reset(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.hard_weekly_reset(p_local_week_start date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_last date;
  v_archived int := 0;
  v_weekly_slots int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_local_week_start IS NULL THEN p_local_week_start := date_trunc('week', CURRENT_DATE)::date; END IF;

  SELECT last_weekly_reset INTO v_last FROM public.profiles WHERE user_id = v_user;

  SELECT count(DISTINCT slot_index) INTO v_weekly_slots
  FROM public.quests
  WHERE user_id = v_user
    AND quest_type = 'weekly'
    AND slot_index BETWEEN 1 AND 3
    AND status IN ('active', 'locked', 'in_progress', 'paused', 'completed');

  IF v_last IS NOT NULL AND v_last >= p_local_week_start AND v_weekly_slots = 3 THEN
    WITH ranked AS (
      SELECT id,
             row_number() OVER (PARTITION BY user_id, quest_type, slot_index ORDER BY completed DESC, created_at DESC, id DESC) AS rn
      FROM public.quests
      WHERE user_id = v_user AND quest_type = 'weekly' AND slot_index BETWEEN 1 AND 3
    ), doomed AS (
      SELECT id FROM ranked WHERE rn > 1
    )
    DELETE FROM public.quests q USING doomed d WHERE q.id = d.id;

    RETURN jsonb_build_object('ok', true, 'reset', false, 'reason', 'already_reset_this_week', 'slots', v_weekly_slots);
  END IF;

  WITH ins AS (
    INSERT INTO public.quest_archive (user_id, archive_date, quest_type, title, template_key, is_compulsory, completed, xp_earned, payload)
    SELECT q.user_id, COALESCE(v_last, p_local_week_start - 7), q.quest_type::text, q.title, q.template_key, q.is_compulsory, q.completed,
           CASE WHEN q.completed THEN q.reward_xp ELSE 0 END,
           jsonb_build_object('difficulty', q.difficulty, 'criteria', q.criteria, 'completed_at', q.completed_at, 'repair_reason', CASE WHEN v_last >= p_local_week_start THEN 'missing_weekly_slots' ELSE 'week_changed' END)
    FROM public.quests q
    WHERE q.user_id = v_user AND q.quest_type = 'weekly'
    RETURNING 1
  )
  SELECT count(*) INTO v_archived FROM ins;

  DELETE FROM public.quest_progress qp
  USING public.quests q
  WHERE qp.quest_id = q.id AND q.user_id = v_user AND q.quest_type = 'weekly';

  DELETE FROM public.quests
  WHERE user_id = v_user AND quest_type = 'weekly';

  PERFORM public._seed_three_weekly_quests(v_user, p_local_week_start);

  UPDATE public.profiles SET last_weekly_reset = p_local_week_start, updated_at = now()
  WHERE user_id = v_user;

  RETURN jsonb_build_object('ok', true, 'reset', true, 'archived', v_archived, 'week_start', p_local_week_start, 'slots', 3);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hard_weekly_reset(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_weekly_reset(date) TO authenticated;