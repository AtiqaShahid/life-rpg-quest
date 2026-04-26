-- =========================================================
-- QUEST SYSTEM BUG FIXES + LOGIC CORRECTIONS
-- =========================================================
-- 1) Hard-cap compulsory anchors at 3 (drop 'reflect & reset')
-- 2) Dedupe legacy duplicate anchors and clear orphan dynamic dailies
-- 3) Custom-quest creator that requires category & rejects duplicates
-- 4) Weekly: up to 3 selectable, options never auto-add, multi-select supported
-- 5) Reset/cleanup helper called from regenerate_daily_slots_all
-- =========================================================

-- ---------- 1. Cleanup current bad state ----------

-- 1a) Remove reflection anchor entirely (we now keep 3 anchors only)
DELETE FROM public.quest_progress qp USING public.quests q
 WHERE qp.quest_id = q.id
   AND q.is_compulsory = TRUE
   AND q.template_key = 'anchor_reflection';
DELETE FROM public.quests
 WHERE is_compulsory = TRUE AND template_key = 'anchor_reflection';

-- 1b) Dedupe duplicate anchors per (user, template_key) — keep oldest
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, template_key ORDER BY created_at ASC) AS rn
  FROM public.quests
  WHERE is_compulsory = TRUE AND template_key IS NOT NULL
)
DELETE FROM public.quest_progress qp USING ranked r
 WHERE qp.quest_id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, template_key ORDER BY created_at ASC) AS rn
  FROM public.quests
  WHERE is_compulsory = TRUE AND template_key IS NOT NULL
)
DELETE FROM public.quests q USING ranked r
 WHERE q.id = r.id AND r.rn > 1;

-- 1c) Clear orphan dynamic-daily quests (slot_index NULL, not compulsory) — these are
--     leftovers from legacy generators bloating the daily list.
DELETE FROM public.quest_progress qp USING public.quests q
 WHERE qp.quest_id = q.id
   AND q.quest_type = 'daily'
   AND q.is_compulsory = FALSE
   AND q.slot_index IS NULL
   AND q.status IN ('active','candidate');

DELETE FROM public.quests
 WHERE quest_type = 'daily'
   AND is_compulsory = FALSE
   AND slot_index IS NULL
   AND status IN ('active','candidate');

-- ---------- 2. Recreate seed_compulsory_quests with only 3 anchors ----------

CREATE OR REPLACE FUNCTION public.seed_compulsory_quests()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_count INT := 0;
  v_quest public.quests;
  v_xp JSONB;
  rec RECORD;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('anchor_hydration', 'Hydrate',         'Drink a full glass of water now.',                2, 'low',    ARRAY['discipline']::text[],                'meditation', 1, 'count'),
      ('anchor_study',     'Daily learning',  'Study or read for at least 15 minutes.',          3, 'medium', ARRAY['intelligence','discipline']::text[], 'study',     15, 'count'),
      ('anchor_movement',  'Move your body',  '10+ minutes of movement (walk/cardio/workout).',  3, 'medium', ARRAY['strength','discipline']::text[],     'cardio',    10, 'count')
    ) AS t(template_key, title, description, difficulty, energy, linked_stats, type_id, min_dur, unit)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.quests
      WHERE user_id = v_user AND template_key = rec.template_key AND is_compulsory = TRUE
    ) THEN CONTINUE; END IF;

    v_xp := public.compute_quest_xp(v_user, rec.difficulty, 'daily'::public.quest_type);

    INSERT INTO public.quests (
      user_id, title, description, quest_type, difficulty, linked_stats, energy,
      criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key,
      is_compulsory, slot_index
    ) VALUES (
      v_user, rec.title, rec.description, 'daily', rec.difficulty,
      rec.linked_stats, rec.energy::public.quest_energy,
      jsonb_strip_nulls(jsonb_build_object('type_id', rec.type_id, 'min_duration', rec.min_dur)),
      'active', (v_xp->>'final')::int, TRUE, NULL, 'compulsory_anchor', rec.template_key,
      TRUE, NULL
    ) RETURNING * INTO v_quest;

    INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
    VALUES (v_quest.id, v_user, 0, 1, rec.unit);

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'seeded', v_count);
END;
$function$;

-- ---------- 3. Allow up to 3 weekly active selections ----------

CREATE OR REPLACE FUNCTION public.generate_weekly_options()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_group UUID := gen_random_uuid();
  v_quest public.quests;
  v_xp JSONB;
  v_inserted JSONB := '[]'::jsonb;
  v_existing_count INT;
  rec RECORD;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Always discard previous unselected candidates first
  DELETE FROM public.quest_progress qp USING public.quests q
   WHERE qp.quest_id = q.id AND q.user_id = v_user AND q.quest_type='weekly' AND q.status='candidate';
  DELETE FROM public.quests
   WHERE user_id = v_user AND quest_type='weekly' AND status='candidate';

  -- Block when 3 active/locked weekly already exist
  SELECT COUNT(*) INTO v_existing_count
    FROM public.quests
   WHERE user_id = v_user AND quest_type='weekly' AND status IN ('active','locked');
  IF v_existing_count >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'weekly_full');
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('weekly_workouts_5', 6, 'high',   'Iron Discipline', 'Complete 5 workouts this week.',          'workout', 20, 5,   'count',   ARRAY['strength','discipline']),
      ('weekly_study_300',  6, 'medium', 'Scholar''s Pact', 'Accumulate 300 min of study this week.',  'study',   NULL, 300, 'minutes', ARRAY['intelligence']),
      ('weekly_cardio_120', 5, 'medium', 'Endurance Run',   'Accumulate 120 min of cardio this week.', 'cardio',  NULL, 120, 'minutes', ARRAY['strength']),
      ('weekly_recovery_5', 3, 'low',    'Mind Garden',     '5 meditations this week.',                'meditation', 10, 5,'count',   ARRAY['discipline']),
      ('weekly_social_3',   4, 'low',    'Social Circle',   '3 meaningful social sessions this week.', 'socializing', 30, 3,'count',  ARRAY['charisma'])
    ) AS t(template_key, difficulty, energy, title, description, type_id, min_dur, target_v, unit, linked)
    ORDER BY random() LIMIT 3
  LOOP
    v_xp := public.compute_quest_xp(v_user, rec.difficulty, 'weekly');
    INSERT INTO public.quests (
      user_id, title, description, quest_type, difficulty, linked_stats, energy,
      criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key,
      selection_group
    ) VALUES (
      v_user, rec.title, rec.description, 'weekly', rec.difficulty,
      rec.linked, rec.energy::public.quest_energy,
      jsonb_strip_nulls(jsonb_build_object('type_id', rec.type_id, 'min_duration', rec.min_dur)),
      'candidate', (v_xp->>'final')::int, FALSE,
      now() + INTERVAL '7 days', 'weekly_option', rec.template_key,
      v_group
    ) RETURNING * INTO v_quest;

    INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
    VALUES (v_quest.id, v_user, 0, GREATEST(1, rec.target_v), rec.unit);

    v_inserted := v_inserted || jsonb_build_object('id', v_quest.id, 'title', v_quest.title);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'group', v_group, 'options', v_inserted);
END;
$function$;

-- Replace select_quest_option: do NOT delete siblings (multi-select supported).
-- For weekly, the 3-cap is enforced; siblings remain candidates so user can pick more.
CREATE OR REPLACE FUNCTION public.select_quest_option(p_quest_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_quest public.quests;
  v_active_count INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_quest FROM public.quests
   WHERE id = p_quest_id AND user_id = v_user AND status = 'candidate';
  IF v_quest.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_candidate');
  END IF;

  -- Caps per category
  IF v_quest.quest_type = 'weekly' THEN
    SELECT COUNT(*) INTO v_active_count FROM public.quests
     WHERE user_id = v_user AND quest_type='weekly' AND status IN ('active','locked');
    IF v_active_count >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'weekly_full');
    END IF;
    UPDATE public.quests SET status = 'active' WHERE id = v_quest.id;
  ELSIF v_quest.quest_type = 'epic' THEN
    SELECT COUNT(*) INTO v_active_count FROM public.quests
     WHERE user_id = v_user AND quest_type='epic' AND status IN ('active','locked');
    IF v_active_count >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'epic_full');
    END IF;
    UPDATE public.quests SET status = 'locked' WHERE id = v_quest.id;
    -- For epic (single choice), discard siblings
    IF v_quest.selection_group IS NOT NULL THEN
      DELETE FROM public.quest_progress qp USING public.quests q
       WHERE qp.quest_id = q.id AND q.user_id = v_user
         AND q.selection_group = v_quest.selection_group AND q.id <> v_quest.id;
      DELETE FROM public.quests
       WHERE user_id = v_user AND selection_group = v_quest.selection_group AND id <> v_quest.id;
    END IF;
  ELSE
    -- dynamic / daily / other: just lock it
    UPDATE public.quests SET status = 'locked' WHERE id = v_quest.id;
    IF v_quest.selection_group IS NOT NULL THEN
      DELETE FROM public.quest_progress qp USING public.quests q
       WHERE qp.quest_id = q.id AND q.user_id = v_user
         AND q.selection_group = v_quest.selection_group AND q.id <> v_quest.id;
      DELETE FROM public.quests
       WHERE user_id = v_user AND selection_group = v_quest.selection_group AND id <> v_quest.id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quest_id', v_quest.id);
END;
$function$;

-- ---------- 4. Custom quest creator with category + duplicate guard ----------

CREATE OR REPLACE FUNCTION public.add_custom_quest(
  p_title text,
  p_quest_type public.quest_type,
  p_difficulty integer DEFAULT 3,
  p_description text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_quest public.quests;
  v_xp JSONB;
  v_diff INT;
  v_norm_title TEXT;
  v_existing_count INT;
  v_expires TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_norm_title := btrim(COALESCE(p_title,''));
  IF v_norm_title = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_title');
  END IF;
  IF p_quest_type NOT IN ('daily','weekly','epic') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_category');
  END IF;
  v_diff := GREATEST(1, LEAST(10, COALESCE(p_difficulty, 3)));

  -- Reject duplicates within same category for this user (case-insensitive)
  IF EXISTS (
    SELECT 1 FROM public.quests
     WHERE user_id = v_user
       AND quest_type = p_quest_type
       AND status IN ('active','locked','candidate')
       AND lower(btrim(title)) = lower(v_norm_title)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_title');
  END IF;

  -- Cap weekly to 3 active
  IF p_quest_type = 'weekly' THEN
    SELECT COUNT(*) INTO v_existing_count FROM public.quests
     WHERE user_id = v_user AND quest_type='weekly' AND status IN ('active','locked');
    IF v_existing_count >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'weekly_full');
    END IF;
  ELSIF p_quest_type = 'epic' THEN
    SELECT COUNT(*) INTO v_existing_count FROM public.quests
     WHERE user_id = v_user AND quest_type='epic' AND status IN ('active','locked');
    IF v_existing_count >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'epic_full');
    END IF;
  END IF;

  v_expires := CASE p_quest_type
    WHEN 'daily'  THEN (CURRENT_DATE + 1)::timestamptz
    WHEN 'weekly' THEN now() + INTERVAL '7 days'
    WHEN 'epic'   THEN now() + INTERVAL '30 days'
  END;

  v_xp := public.compute_quest_xp(v_user, v_diff, p_quest_type);

  INSERT INTO public.quests (
    user_id, title, description, quest_type, difficulty, linked_stats, energy,
    criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key,
    is_compulsory, slot_index
  ) VALUES (
    v_user, v_norm_title, NULLIF(btrim(COALESCE(p_description,'')),''), p_quest_type, v_diff,
    '{}'::text[], 'medium'::public.quest_energy,
    '{}'::jsonb,
    'active', (v_xp->>'final')::int,
    (p_quest_type = 'daily'),
    v_expires, 'custom_user', NULL,
    FALSE, NULL
  ) RETURNING * INTO v_quest;

  INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
  VALUES (v_quest.id, v_user, 0, 1, 'count');

  RETURN jsonb_build_object('ok', true, 'quest', to_jsonb(v_quest));
END;
$function$;

-- ---------- 5. Reset / cleanup orphans helper ----------

CREATE OR REPLACE FUNCTION public.cleanup_orphan_quests()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_removed INT := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Drop legacy daily dynamic quests with no slot_index (orphans from old generators)
  WITH del AS (
    DELETE FROM public.quests
     WHERE user_id = v_user
       AND quest_type='daily'
       AND is_compulsory = FALSE
       AND slot_index IS NULL
       AND template_key NOT LIKE 'custom_%'   -- never auto-delete user-made
       AND generation_reason <> 'custom_user'
       AND status IN ('active','candidate')
     RETURNING id
  )
  SELECT COUNT(*) INTO v_removed FROM del;

  -- Also clean unselected weekly/epic candidates older than 30 minutes
  DELETE FROM public.quest_progress qp USING public.quests q
   WHERE qp.quest_id = q.id AND q.user_id = v_user
     AND q.status = 'candidate'
     AND q.created_at < now() - INTERVAL '30 minutes';
  DELETE FROM public.quests
   WHERE user_id = v_user AND status = 'candidate'
     AND created_at < now() - INTERVAL '30 minutes';

  RETURN jsonb_build_object('ok', true, 'removed_orphans', v_removed);
END;
$function$;

-- Update regenerate_daily_slots_all to clean orphans first
CREATE OR REPLACE FUNCTION public.regenerate_daily_slots_all()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_results JSONB := '[]'::jsonb;
  v_slot INT;
  v_locked BOOLEAN;
  v_res JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM public.cleanup_orphan_quests();
  PERFORM public.seed_compulsory_quests();
  FOR v_slot IN 1..3 LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.quests
      WHERE user_id = v_user AND quest_type = 'daily' AND is_compulsory = FALSE
        AND slot_index = v_slot AND status = 'locked'
    ) INTO v_locked;
    IF v_locked THEN
      v_results := v_results || jsonb_build_object('slot', v_slot, 'skipped', 'locked');
      CONTINUE;
    END IF;
    v_res := public.regenerate_daily_slot(v_slot);
    v_results := v_results || jsonb_build_object('slot', v_slot, 'result', v_res);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'results', v_results);
END;
$function$;