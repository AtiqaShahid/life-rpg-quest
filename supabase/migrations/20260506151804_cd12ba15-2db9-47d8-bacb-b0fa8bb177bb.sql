CREATE OR REPLACE FUNCTION public.seed_compulsory_quests()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_count int := 0;
  v_quest_id uuid;
  v_completed boolean;
  v_completed_at timestamptz;
  v_should_reset boolean;
  v_xp jsonb;
  rec record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  DELETE FROM public.quest_progress qp
  USING public.quests q
  WHERE qp.quest_id = q.id
    AND q.user_id = v_user
    AND q.is_compulsory = true
    AND COALESCE(q.template_key, '') NOT IN ('anchor_hydration', 'anchor_study', 'anchor_movement');

  DELETE FROM public.quests
  WHERE user_id = v_user
    AND is_compulsory = true
    AND COALESCE(template_key, '') NOT IN ('anchor_hydration', 'anchor_study', 'anchor_movement');

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY template_key ORDER BY created_at ASC) AS rn
    FROM public.quests
    WHERE user_id = v_user
      AND is_compulsory = true
      AND template_key IN ('anchor_hydration', 'anchor_study', 'anchor_movement')
  )
  DELETE FROM public.quest_progress qp
  USING ranked r
  WHERE qp.quest_id = r.id
    AND r.rn > 1;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY template_key ORDER BY created_at ASC) AS rn
    FROM public.quests
    WHERE user_id = v_user
      AND is_compulsory = true
      AND template_key IN ('anchor_hydration', 'anchor_study', 'anchor_movement')
  )
  DELETE FROM public.quests q
  USING ranked r
  WHERE q.id = r.id
    AND r.rn > 1;

  FOR rec IN
    SELECT * FROM (VALUES
      ('anchor_hydration', 'Hydrate',        'Drink a full glass of water now.',                2, 'low',    ARRAY['discipline']::text[],                'meditation', 1,  'count'),
      ('anchor_study',     'Daily learning', 'Study or read for at least 15 minutes.',          3, 'medium', ARRAY['intelligence','discipline']::text[], 'study',      15, 'count'),
      ('anchor_movement',  'Move your body', '10+ minutes of movement (walk/cardio/workout).',  3, 'medium', ARRAY['strength','discipline']::text[],     'cardio',     10, 'count')
    ) AS t(template_key, title, description, difficulty, energy, linked_stats, type_id, min_dur, unit)
  LOOP
    v_xp := public.compute_quest_xp(v_user, rec.difficulty, 'daily'::public.quest_type);
    v_quest_id := NULL;
    v_completed := false;
    v_completed_at := NULL;

    SELECT id, completed, completed_at
      INTO v_quest_id, v_completed, v_completed_at
    FROM public.quests
    WHERE user_id = v_user
      AND template_key = rec.template_key
      AND is_compulsory = true
    ORDER BY created_at ASC
    LIMIT 1;

    v_should_reset := v_quest_id IS NULL OR v_completed_at IS NULL OR v_completed_at::date < CURRENT_DATE OR COALESCE(v_completed, false) = false;

    IF v_quest_id IS NULL THEN
      INSERT INTO public.quests (
        user_id, title, description, quest_type, difficulty, linked_stats, energy,
        criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key,
        is_compulsory, slot_index, completed, completed_at,
        started_at, ends_at, paused_at, duration_minutes, pauses_used, total_paused_ms, timer_penalty
      ) VALUES (
        v_user, rec.title, rec.description, 'daily', rec.difficulty,
        rec.linked_stats, rec.energy::public.quest_energy,
        jsonb_strip_nulls(jsonb_build_object('type_id', rec.type_id, 'min_duration', rec.min_dur)),
        'active', (v_xp->>'final')::int, true, NULL, 'compulsory_anchor', rec.template_key,
        true, NULL, false, NULL,
        NULL, NULL, NULL, NULL, 0, 0, 0
      ) RETURNING id INTO v_quest_id;

      INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
      SELECT v_quest_id, v_user, 0, 1, rec.unit
      WHERE NOT EXISTS (
        SELECT 1 FROM public.quest_progress WHERE quest_id = v_quest_id AND user_id = v_user
      );

      v_count := v_count + 1;
    ELSE
      UPDATE public.quests
      SET title = rec.title,
          description = rec.description,
          quest_type = 'daily',
          difficulty = rec.difficulty,
          linked_stats = rec.linked_stats,
          energy = rec.energy::public.quest_energy,
          criteria = jsonb_strip_nulls(jsonb_build_object('type_id', rec.type_id, 'min_duration', rec.min_dur)),
          status = CASE WHEN v_completed = true AND v_completed_at::date = CURRENT_DATE THEN 'completed'::public.quest_status ELSE 'active'::public.quest_status END,
          reward_xp = (v_xp->>'final')::int,
          is_daily = true,
          expires_at = NULL,
          generation_reason = 'compulsory_anchor',
          template_key = rec.template_key,
          is_compulsory = true,
          slot_index = NULL,
          completed = CASE WHEN v_completed = true AND v_completed_at::date = CURRENT_DATE THEN true ELSE false END,
          completed_at = CASE WHEN v_completed = true AND v_completed_at::date = CURRENT_DATE THEN v_completed_at ELSE NULL END,
          started_at = NULL,
          ends_at = NULL,
          paused_at = NULL,
          duration_minutes = NULL,
          pauses_used = 0,
          total_paused_ms = 0,
          timer_penalty = 0,
          updated_at = now()
      WHERE id = v_quest_id;

      INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
      SELECT v_quest_id, v_user, 0, 1, rec.unit
      WHERE NOT EXISTS (
        SELECT 1 FROM public.quest_progress WHERE quest_id = v_quest_id AND user_id = v_user
      );
    END IF;

    IF v_should_reset THEN
      UPDATE public.quest_progress
      SET current = 0,
          target = 1,
          unit = rec.unit,
          updated_at = now()
      WHERE quest_id = v_quest_id
        AND user_id = v_user;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'seeded', v_count, 'ensured', 3);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_daily_quests(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() <> p_user THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.quests
  SET completed = false,
      completed_at = NULL,
      status = CASE WHEN status = 'completed' THEN 'active'::public.quest_status ELSE status END,
      started_at = NULL,
      ends_at = NULL,
      paused_at = NULL,
      duration_minutes = NULL,
      pauses_used = 0,
      total_paused_ms = 0,
      timer_penalty = 0,
      updated_at = now()
  WHERE user_id = p_user
    AND is_daily = true
    AND completed_at IS NOT NULL
    AND completed_at::date < CURRENT_DATE;

  PERFORM public.seed_compulsory_quests();
END;
$function$;