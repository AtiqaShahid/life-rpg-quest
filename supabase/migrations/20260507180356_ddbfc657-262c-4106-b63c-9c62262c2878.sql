-- Fix stuck quest board: deterministic daily seeding, missing-slot recovery, and weekly dedupe.

CREATE OR REPLACE FUNCTION public._seed_three_daily_quests(p_user uuid, p_local_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_xp jsonb;
  v_seed int := (p_local_date - DATE '1970-01-01')::int;
  v_idx int;
  v_quest_id uuid;
  v_categories text[];
  v_cat text;
  v_pick jsonb;
  v_min_dur int;
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
BEGIN
  v_categories := CASE (v_seed % 7)
    WHEN 0 THEN ARRAY['focus','health','learning']::text[]
    WHEN 1 THEN ARRAY['focus','health','discipline']::text[]
    WHEN 2 THEN ARRAY['focus','learning','social']::text[]
    WHEN 3 THEN ARRAY['health','learning','discipline']::text[]
    WHEN 4 THEN ARRAY['focus','health','social']::text[]
    WHEN 5 THEN ARRAY['learning','discipline','social']::text[]
    ELSE ARRAY['health','discipline','social']::text[]
  END;

  FOR v_idx IN 1..3 LOOP
    v_cat := v_categories[v_idx];
    v_pick := (v_pools->v_cat) -> ((v_seed + v_idx * 3) % jsonb_array_length(v_pools->v_cat));
    v_min_dur := (v_pick->>'min_dur')::int;
    v_xp := public.compute_quest_xp(p_user, (v_pick->>'diff')::int, 'daily'::public.quest_type);

    INSERT INTO public.quests (
      user_id, title, description, quest_type, difficulty, linked_stats, energy,
      criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key,
      is_compulsory, slot_index, completed
    ) VALUES (
      p_user, v_pick->>'title', v_pick->>'desc', 'daily',
      (v_pick->>'diff')::int,
      ARRAY(SELECT jsonb_array_elements_text(v_pick->'stats'))::text[],
      ((v_pick->>'energy')::text)::public.quest_energy,
      jsonb_strip_nulls(jsonb_build_object(
        'type_id', v_pick->>'type_id',
        'min_duration', NULLIF(v_min_dur, 0),
        'category', v_cat
      )),
      'active'::public.quest_status,
      CASE WHEN v_min_dur = 0 THEN GREATEST(5, ((v_xp->>'final')::int / 2)) ELSE (v_xp->>'final')::int END,
      true,
      (p_local_date + 1)::timestamptz,
      'daily_diverse_v1',
      'daily_' || v_cat || '_' || v_idx,
      true,
      v_idx,
      false
    ) RETURNING id INTO v_quest_id;

    INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
    VALUES (v_quest_id, p_user, 0, 1, 'count');
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._seed_three_daily_quests(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._seed_three_daily_quests(uuid, date) TO authenticated;

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
  v_daily_count int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_local_date IS NULL THEN p_local_date := CURRENT_DATE; END IF;

  SELECT last_daily_reset INTO v_last FROM public.profiles WHERE user_id = v_user;
  SELECT count(*) INTO v_daily_count
  FROM public.quests
  WHERE user_id = v_user AND quest_type = 'daily' AND is_daily = true;

  IF v_last IS NOT NULL AND v_last >= p_local_date AND v_daily_count = 3 THEN
    RETURN jsonb_build_object('ok', true, 'reset', false, 'reason', 'already_reset_today');
  END IF;

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

  DELETE FROM public.quest_progress qp
  USING public.quests q
  WHERE qp.quest_id = q.id AND q.user_id = v_user AND q.is_daily = true;

  DELETE FROM public.quests
  WHERE user_id = v_user AND is_daily = true;

  PERFORM public._seed_three_daily_quests(v_user, p_local_date);

  UPDATE public.profiles SET last_daily_reset = p_local_date, updated_at = now()
  WHERE user_id = v_user;

  RETURN jsonb_build_object('ok', true, 'reset', true, 'archived', v_archived, 'date', p_local_date);
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
  v_weekly_count int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_local_week_start IS NULL THEN p_local_week_start := date_trunc('week', CURRENT_DATE)::date; END IF;

  SELECT last_weekly_reset INTO v_last FROM public.profiles WHERE user_id = v_user;
  SELECT count(DISTINCT slot_index) INTO v_weekly_count
  FROM public.quests
  WHERE user_id = v_user AND quest_type = 'weekly' AND slot_index BETWEEN 1 AND 3;

  IF v_last IS NOT NULL AND v_last >= p_local_week_start AND v_weekly_count = 3 THEN
    -- Remove accidental duplicates from prior parallel reset attempts while keeping one per slot.
    WITH ranked AS (
      SELECT id, row_number() OVER (PARTITION BY user_id, quest_type, slot_index ORDER BY completed DESC, created_at DESC, id DESC) AS rn
      FROM public.quests
      WHERE user_id = v_user AND quest_type = 'weekly' AND slot_index BETWEEN 1 AND 3
    ), doomed AS (
      SELECT id FROM ranked WHERE rn > 1
    )
    DELETE FROM public.quests q USING doomed d WHERE q.id = d.id;

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

-- Clean existing duplicate weekly missions created by overlapping reset calls.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, quest_type, slot_index ORDER BY completed DESC, created_at DESC, id DESC) AS rn
  FROM public.quests
  WHERE quest_type = 'weekly' AND slot_index BETWEEN 1 AND 3
), doomed AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM public.quests q USING doomed d WHERE q.id = d.id;

-- Force the next authenticated client reset to reseed missing daily boards immediately.
UPDATE public.profiles p
SET last_daily_reset = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.quests q
  WHERE q.user_id = p.user_id AND q.quest_type = 'daily' AND q.is_daily = true
);