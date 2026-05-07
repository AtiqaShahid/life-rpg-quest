-- INTELLIGENT QUEST SYSTEM: diverse 3-per-day, 3-per-week, anti-farming XP.

-- Helper: deterministic daily rotation pool of (category, title, type_id, min_dur, difficulty, linked_stats, energy)
-- Picks one per category per day so set is always diverse.

CREATE OR REPLACE FUNCTION public._seed_three_daily_quests(p_user uuid, p_local_date date)
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
  rec record;

  -- Pool definition: groups ordered as Focus, Health, Learning, Discipline, Social.
  -- Each row: category, title, description, type_id, min_dur (0=instant), difficulty, linked_stats text[], energy
  v_pools jsonb := jsonb_build_object(
    'focus', jsonb_build_array(
      jsonb_build_object('title','Deep work block','desc','25 minutes of focused, distraction-free work.','type_id','study','min_dur',25,'diff',4,'stats',jsonb_build_array('intelligence','discipline'),'energy','high'),
      jsonb_build_object('title','Single-task sprint','desc','20 minutes on one task. No phone.','type_id','study','min_dur',20,'diff',3,'stats',jsonb_build_array('intelligence','discipline'),'energy','medium'),
      jsonb_build_object('title','Mindful reset','desc','10 minutes of meditation or breathwork.','type_id','meditation','min_dur',10,'diff',2,'stats',jsonb_build_array('discipline'),'energy','low')
    ),
    'health', jsonb_build_array(
      jsonb_build_object('title','Workout session','desc','20 minutes of strength or HIIT.','type_id','workout','min_dur',20,'diff',4,'stats',jsonb_build_array('strength','discipline'),'energy','high'),
      jsonb_build_object('title','Walk 30 minutes','desc','30 minutes of brisk walking.','type_id','cardio','min_dur',30,'diff',3,'stats',jsonb_build_array('strength'),'energy','medium'),
      jsonb_build_object('title','Hydrate now','desc','Drink a full glass of water.','type_id','meditation','min_dur',0,'diff',1,'stats',jsonb_build_array('discipline'),'energy','low')
    ),
    'learning', jsonb_build_array(
      jsonb_build_object('title','Study 20 minutes','desc','Read or study a new topic for 20 minutes.','type_id','study','min_dur',20,'diff',3,'stats',jsonb_build_array('intelligence'),'energy','medium'),
      jsonb_build_object('title','Read a chapter','desc','15 minutes of focused reading.','type_id','study','min_dur',15,'diff',2,'stats',jsonb_build_array('intelligence'),'energy','low'),
      jsonb_build_object('title','Practice a skill','desc','30 minutes practicing a skill you''re building.','type_id','study','min_dur',30,'diff',4,'stats',jsonb_build_array('intelligence','discipline'),'energy','high')
    ),
    'discipline', jsonb_build_array(
      jsonb_build_object('title','Plan tomorrow','desc','Write tomorrow''s top 3 priorities.','type_id','meditation','min_dur',0,'diff',1,'stats',jsonb_build_array('discipline'),'energy','low'),
      jsonb_build_object('title','Gratitude note','desc','Write down 3 things you''re grateful for.','type_id','meditation','min_dur',0,'diff',1,'stats',jsonb_build_array('discipline','charisma'),'energy','low'),
      jsonb_build_object('title','Tidy your space','desc','5 minutes organizing your workspace.','type_id','meditation','min_dur',0,'diff',1,'stats',jsonb_build_array('discipline'),'energy','low')
    ),
    'social', jsonb_build_array(
      jsonb_build_object('title','Reach out to a friend','desc','Send a message to someone you care about.','type_id','socializing','min_dur',0,'diff',1,'stats',jsonb_build_array('charisma'),'energy','low'),
      jsonb_build_object('title','Compliment someone','desc','Give an honest compliment to someone today.','type_id','socializing','min_dur',0,'diff',1,'stats',jsonb_build_array('charisma'),'energy','low'),
      jsonb_build_object('title','Conversation','desc','Have a 10-minute meaningful conversation.','type_id','socializing','min_dur',10,'diff',2,'stats',jsonb_build_array('charisma'),'energy','medium')
    )
  );

  -- Picked categories per day: rotate {focus,health,learning} | {focus,health,discipline} | {focus,learning,social} | {health,learning,discipline} | {focus,health,social} | {learning,discipline,social} | {health,discipline,social}
  v_day_combos text[][] := ARRAY[
    ARRAY['focus','health','learning'],
    ARRAY['focus','health','discipline'],
    ARRAY['focus','learning','social'],
    ARRAY['health','learning','discipline'],
    ARRAY['focus','health','social'],
    ARRAY['learning','discipline','social'],
    ARRAY['health','discipline','social']
  ];
  v_combo text[];
  v_cat text;
  v_pool jsonb;
  v_pool_size int;
  v_pick jsonb;
BEGIN
  v_seed := (extract(epoch from p_local_date)::bigint / 86400)::int;
  v_combo := v_day_combos[(v_seed % 7) + 1];

  FOR v_idx IN 1..3 LOOP
    v_cat := v_combo[v_idx];
    v_pool := v_pools->v_cat;
    v_pool_size := jsonb_array_length(v_pool);
    -- Rotate within category by week so titles change daily but stay diverse.
    v_pick := v_pool -> ((v_seed + v_idx * 3) % v_pool_size);

    rec := ROW(
      (v_pick->>'title')::text,
      (v_pick->>'desc')::text,
      (v_pick->>'type_id')::text,
      (v_pick->>'min_dur')::int,
      (v_pick->>'diff')::int,
      ARRAY(SELECT jsonb_array_elements_text(v_pick->'stats'))::text[],
      (v_pick->>'energy')::text,
      v_cat
    );

    v_xp := public.compute_quest_xp(p_user, (v_pick->>'diff')::int, 'daily'::public.quest_type);

    INSERT INTO public.quests (
      user_id, title, description, quest_type, difficulty, linked_stats, energy,
      criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key,
      is_compulsory, slot_index, completed
    ) VALUES (
      p_user, (v_pick->>'title'), (v_pick->>'desc'), 'daily',
      (v_pick->>'diff')::int,
      ARRAY(SELECT jsonb_array_elements_text(v_pick->'stats'))::text[],
      ((v_pick->>'energy')::text)::public.quest_energy,
      jsonb_strip_nulls(jsonb_build_object(
        'type_id', (v_pick->>'type_id'),
        'min_duration', NULLIF((v_pick->>'min_dur')::int, 0),
        'category', v_cat
      )),
      'active',
      -- Anti-farming: instant tasks (min_dur=0) get reduced XP (50%).
      CASE WHEN (v_pick->>'min_dur')::int = 0
           THEN GREATEST(5, ((v_xp->>'final')::int / 2))
           ELSE (v_xp->>'final')::int END,
      true, NULL, 'daily_diverse_v1', 'daily_' || v_cat || '_' || v_idx,
      true, v_idx, false
    ) RETURNING id INTO v_quest_id;

    INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
    VALUES (v_quest_id, p_user, 0, 1, 'count');
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._seed_three_daily_quests(uuid, date) FROM PUBLIC, anon;

-- Replace hard_daily_reset to use the new diverse seeder instead of compulsory anchors.
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
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_local_date IS NULL THEN p_local_date := CURRENT_DATE; END IF;

  SELECT last_daily_reset INTO v_last
  FROM public.profiles WHERE user_id = v_user;

  IF v_last IS NOT NULL AND v_last >= p_local_date THEN
    RETURN jsonb_build_object('ok', true, 'reset', false, 'reason', 'already_reset_today');
  END IF;

  -- Archive existing daily quests.
  WITH ins AS (
    INSERT INTO public.quest_archive (user_id, archive_date, quest_type, title, template_key, is_compulsory, completed, xp_earned, payload)
    SELECT q.user_id, COALESCE(v_last, p_local_date - 1), q.quest_type::text, q.title, q.template_key, q.is_compulsory, q.completed,
           CASE WHEN q.completed THEN q.reward_xp ELSE 0 END,
           jsonb_build_object('difficulty', q.difficulty, 'criteria', q.criteria, 'completed_at', q.completed_at)
    FROM public.quests q
    WHERE q.user_id = v_user AND q.is_daily = true
    RETURNING 1
  )
  SELECT count(*) INTO v_archived FROM ins;

  -- Wipe ALL daily quests + their progress.
  DELETE FROM public.quest_progress qp
  USING public.quests q
  WHERE qp.quest_id = q.id AND q.user_id = v_user AND q.is_daily = true;

  DELETE FROM public.quests
  WHERE user_id = v_user AND is_daily = true;

  -- Seed exactly 3 fresh diverse daily quests.
  PERFORM public._seed_three_daily_quests(v_user, p_local_date);

  UPDATE public.profiles SET last_daily_reset = p_local_date, updated_at = now()
  WHERE user_id = v_user;

  RETURN jsonb_build_object('ok', true, 'reset', true, 'archived', v_archived, 'date', p_local_date);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hard_daily_reset(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_daily_reset(date) TO authenticated;

-- Weekly seeder: 3 fixed strategic missions, rotated by week.
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
    jsonb_build_object('title','Deep work marathon','desc','Accumulate 5 hours of deep work this week.','type_id','study','min_dur',60,'diff',5,'stats',jsonb_build_array('intelligence','discipline'),'energy','high','target',5),
    jsonb_build_object('title','Train 4 sessions','desc','Complete 4 workout sessions this week.','type_id','workout','min_dur',30,'diff',5,'stats',jsonb_build_array('strength','discipline'),'energy','high','target',4),
    jsonb_build_object('title','Read 3 hours','desc','Read or study for a total of 3 hours this week.','type_id','study','min_dur',30,'diff',4,'stats',jsonb_build_array('intelligence'),'energy','medium','target',3),
    jsonb_build_object('title','Meditate 5 days','desc','Meditate at least 10 minutes on 5 different days.','type_id','meditation','min_dur',10,'diff',4,'stats',jsonb_build_array('discipline'),'energy','low','target',5),
    jsonb_build_object('title','Active week','desc','Walk or do cardio on 5 different days.','type_id','cardio','min_dur',20,'diff',4,'stats',jsonb_build_array('strength'),'energy','medium','target',5),
    jsonb_build_object('title','Skill builder','desc','Practice a chosen skill 4 times this week.','type_id','study','min_dur',30,'diff',5,'stats',jsonb_build_array('intelligence','discipline'),'energy','high','target',4),
    jsonb_build_object('title','Connection week','desc','Have 3 meaningful conversations this week.','type_id','socializing','min_dur',15,'diff',3,'stats',jsonb_build_array('charisma'),'energy','medium','target',3)
  );
  v_pool_size int := jsonb_array_length(v_pool);
  v_pick jsonb;
BEGIN
  v_seed := (extract(epoch from p_week_start)::bigint / 604800)::int;

  FOR v_idx IN 0..2 LOOP
    v_pick := v_pool -> ((v_seed + v_idx * 2) % v_pool_size);
    v_xp := public.compute_quest_xp(p_user, (v_pick->>'diff')::int, 'weekly'::public.quest_type);

    INSERT INTO public.quests (
      user_id, title, description, quest_type, difficulty, linked_stats, energy,
      criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key,
      is_compulsory, slot_index, completed
    ) VALUES (
      p_user, (v_pick->>'title'), (v_pick->>'desc'), 'weekly',
      (v_pick->>'diff')::int,
      ARRAY(SELECT jsonb_array_elements_text(v_pick->'stats'))::text[],
      ((v_pick->>'energy')::text)::public.quest_energy,
      jsonb_strip_nulls(jsonb_build_object(
        'type_id', (v_pick->>'type_id'),
        'min_duration', (v_pick->>'min_dur')::int
      )),
      'active', (v_xp->>'final')::int,
      false, (p_week_start + 7)::timestamptz, 'weekly_diverse_v1',
      'weekly_v1_' || v_idx, false, v_idx + 1, false
    ) RETURNING id INTO v_quest_id;

    INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
    VALUES (v_quest_id, p_user, 0, GREATEST(1, (v_pick->>'target')::int), 'count');
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._seed_three_weekly_quests(uuid, date) FROM PUBLIC, anon;

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
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_local_week_start IS NULL THEN p_local_week_start := date_trunc('week', CURRENT_DATE)::date; END IF;

  SELECT last_weekly_reset INTO v_last
  FROM public.profiles WHERE user_id = v_user;

  IF v_last IS NOT NULL AND v_last >= p_local_week_start THEN
    RETURN jsonb_build_object('ok', true, 'reset', false, 'reason', 'already_reset_this_week');
  END IF;

  WITH ins AS (
    INSERT INTO public.quest_archive (user_id, archive_date, quest_type, title, template_key, is_compulsory, completed, xp_earned, payload)
    SELECT q.user_id, COALESCE(v_last, p_local_week_start - 7), q.quest_type::text, q.title, q.template_key, q.is_compulsory, q.completed,
           CASE WHEN q.completed THEN q.reward_xp ELSE 0 END,
           jsonb_build_object('difficulty', q.difficulty, 'criteria', q.criteria, 'completed_at', q.completed_at)
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

  RETURN jsonb_build_object('ok', true, 'reset', true, 'archived', v_archived, 'week_start', p_local_week_start);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hard_weekly_reset(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_weekly_reset(date) TO authenticated;