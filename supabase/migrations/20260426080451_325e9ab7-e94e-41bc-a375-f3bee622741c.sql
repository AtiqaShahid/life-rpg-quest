-- ---------- Helpers ----------

-- Hard-cleanup of dynamic daily slots that aren't locked.
CREATE OR REPLACE FUNCTION public._discard_daily_dynamic_slot(p_user UUID, p_slot INT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Drop progress + quest for any active/candidate dynamic slot quest at this index.
  DELETE FROM public.quest_progress qp
  USING public.quests q
  WHERE qp.quest_id = q.id
    AND q.user_id = p_user
    AND q.quest_type = 'daily'
    AND q.is_compulsory = FALSE
    AND q.slot_index = p_slot
    AND q.status IN ('active','candidate');

  DELETE FROM public.quests
  WHERE user_id = p_user
    AND quest_type = 'daily'
    AND is_compulsory = FALSE
    AND slot_index = p_slot
    AND status IN ('active','candidate');
END; $$;

-- ---------- Compulsory anchors ----------

CREATE OR REPLACE FUNCTION public.seed_compulsory_quests()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
      ('anchor_hydration',  'Hydrate',           'Drink a full glass of water now.',           2, 'low',    ARRAY['discipline']::text[],                'meditation', 1, 'count'),
      ('anchor_study',      'Daily learning',    'Study or read for at least 15 minutes.',     3, 'medium', ARRAY['intelligence','discipline']::text[], 'study',     15, 'count'),
      ('anchor_movement',   'Move your body',    '10+ minutes of movement (walk/cardio/workout).', 3, 'medium', ARRAY['strength','discipline']::text[],  'cardio',    10, 'count'),
      ('anchor_reflection', 'Reflect & reset',   'Take 5 minutes to reflect on your day.',     2, 'low',    ARRAY['discipline','charisma']::text[],     'meditation', 5, 'count')
    ) AS t(template_key, title, description, difficulty, energy, linked_stats, type_id, min_dur, unit)
  LOOP
    -- Skip if already seeded for this user.
    IF EXISTS (
      SELECT 1 FROM public.quests
      WHERE user_id = v_user AND template_key = rec.template_key AND is_compulsory = TRUE
        AND (status IN ('active','locked','completed','candidate'))
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
END; $$;

-- ---------- Daily dynamic slot regeneration ----------

-- Picks a single template (skipping locked ones and duplicates of any active/locked daily).
CREATE OR REPLACE FUNCTION public._pick_daily_template(p_user UUID, p_recovery BOOLEAN)
RETURNS RECORD
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_locked_keys TEXT[];
  v_active_stats TEXT[];
  v_row RECORD;
BEGIN
  SELECT COALESCE(array_agg(template_key), '{}') INTO v_locked_keys
  FROM public.quests
  WHERE user_id = p_user AND quest_type = 'daily'
    AND status IN ('locked','active','completed') AND template_key IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT s), '{}') INTO v_active_stats
  FROM public.quests q, unnest(q.linked_stats) s
  WHERE q.user_id = p_user AND q.quest_type = 'daily'
    AND q.status IN ('locked','active') AND q.is_compulsory = FALSE;

  CREATE TEMP TABLE IF NOT EXISTS _tpl_d (
    key TEXT, base_diff INT, energy public.quest_energy,
    title TEXT, description TEXT, type_id TEXT, min_duration INT,
    target_value INT, unit TEXT, linked_stats TEXT[], recovery_ok BOOLEAN
  ) ON COMMIT DROP;
  TRUNCATE _tpl_d;
  INSERT INTO _tpl_d VALUES
   ('daily_workout_30',  4, 'medium', 'Train your body',  'Complete a workout of at least 30 min.', 'workout',         30, 1, 'count', ARRAY['strength','discipline'], FALSE),
   ('daily_cardio_20',   3, 'medium', 'Get the heart up', 'Cardio session 20+ min.',                'cardio',          20, 1, 'count', ARRAY['strength','discipline'], FALSE),
   ('daily_study_30',    4, 'medium', 'Sharpen the mind', 'Study for at least 30 min.',             'study',           30, 1, 'count', ARRAY['intelligence','discipline'], FALSE),
   ('daily_meditate_15', 2, 'low',    'Deep breath work', 'Meditate for 15+ min.',                  'meditation',      15, 1, 'count', ARRAY['discipline'], TRUE),
   ('daily_social_30',   3, 'low',    'Stay connected',   'A 30 min meaningful social interaction.','socializing',     30, 1, 'count', ARRAY['charisma'], TRUE),
   ('daily_speak_10',    5, 'high',   'Speak up',         'Public speaking practice 10+ min.',      'public_speaking', 10, 1, 'count', ARRAY['charisma','discipline'], FALSE);

  SELECT * INTO v_row FROM _tpl_d
  WHERE (NOT p_recovery OR recovery_ok = TRUE)
    AND key <> ALL(v_locked_keys)
    AND NOT (linked_stats <@ v_active_stats AND array_length(v_active_stats,1) >= 2)
  ORDER BY random()
  LIMIT 1;

  IF v_row IS NULL THEN
    -- fall back without stat-diversity constraint
    SELECT * INTO v_row FROM _tpl_d
    WHERE (NOT p_recovery OR recovery_ok = TRUE)
      AND key <> ALL(v_locked_keys)
    ORDER BY random() LIMIT 1;
  END IF;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.regenerate_daily_slot(p_slot INT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_locked BOOLEAN;
  v_profile JSONB;
  v_recovery BOOLEAN := FALSE;
  v_diff_offset INT := 0;
  v_tpl RECORD;
  v_diff INT;
  v_xp JSONB;
  v_quest public.quests;
  v_target_diff INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_slot NOT IN (1,2,3) THEN RAISE EXCEPTION 'invalid_slot'; END IF;

  -- Don't replace a locked slot
  SELECT EXISTS (
    SELECT 1 FROM public.quests
    WHERE user_id = v_user AND quest_type = 'daily' AND is_compulsory = FALSE
      AND slot_index = p_slot AND status = 'locked'
  ) INTO v_locked;
  IF v_locked THEN RETURN jsonb_build_object('ok', false, 'reason', 'slot_locked'); END IF;

  BEGIN v_profile := public.get_behavior_profile(); EXCEPTION WHEN OTHERS THEN v_profile := '{}'::jsonb; END;
  IF COALESCE(v_profile->>'status','normal') IN ('burnout','inactive') THEN
    v_recovery := TRUE; v_diff_offset := -2;
  ELSIF COALESCE((v_profile->>'consistency_score')::numeric, 50) >= 80
    AND COALESCE((v_profile->>'burnout_score')::numeric, 0) < 30 THEN
    v_diff_offset := 1;
  ELSIF COALESCE((v_profile->>'consistency_score')::numeric, 50) < 40 THEN
    v_diff_offset := -1;
  END IF;

  -- Discard whatever was in this slot
  PERFORM public._discard_daily_dynamic_slot(v_user, p_slot);

  -- Bias difficulty by slot for balance: 1=easy, 2=medium, 3=hard
  v_target_diff := CASE p_slot WHEN 1 THEN -1 WHEN 2 THEN 0 ELSE 1 END;

  SELECT * INTO v_tpl FROM public._pick_daily_template(v_user, v_recovery) AS x(
    key TEXT, base_diff INT, energy public.quest_energy,
    title TEXT, description TEXT, type_id TEXT, min_duration INT,
    target_value INT, unit TEXT, linked_stats TEXT[], recovery_ok BOOLEAN
  );
  IF v_tpl IS NULL OR v_tpl.key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_template_available');
  END IF;

  v_diff := GREATEST(1, LEAST(10, v_tpl.base_diff + v_diff_offset + v_target_diff));
  v_xp := public.compute_quest_xp(v_user, v_diff, 'daily');

  INSERT INTO public.quests (
    user_id, title, description, quest_type, difficulty, linked_stats, energy,
    criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key,
    is_compulsory, slot_index
  ) VALUES (
    v_user, v_tpl.title, v_tpl.description, 'daily', v_diff,
    v_tpl.linked_stats, v_tpl.energy,
    jsonb_strip_nulls(jsonb_build_object('type_id', v_tpl.type_id, 'min_duration', v_tpl.min_duration)),
    'active', (v_xp->>'final')::int, TRUE,
    (CURRENT_DATE + 1)::timestamptz,
    format('slot=%s recovery=%s diff_offset=%s', p_slot, v_recovery, v_diff_offset),
    v_tpl.key, FALSE, p_slot
  ) RETURNING * INTO v_quest;

  INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
  VALUES (v_quest.id, v_user, 0, GREATEST(1, v_tpl.target_value), v_tpl.unit);

  RETURN jsonb_build_object('ok', true, 'quest_id', v_quest.id, 'slot', p_slot);
END; $$;

CREATE OR REPLACE FUNCTION public.regenerate_daily_slots_all()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_results JSONB := '[]'::jsonb;
  v_slot INT;
  v_locked BOOLEAN;
  v_res JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
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
END; $$;

-- ---------- Lock / Unlock ----------

CREATE OR REPLACE FUNCTION public.lock_quest(p_quest_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.quests SET status = 'locked'
  WHERE id = p_quest_id AND user_id = v_user AND status IN ('active','candidate');
  RETURN jsonb_build_object('ok', FOUND);
END; $$;

CREATE OR REPLACE FUNCTION public.unlock_quest(p_quest_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.quests SET status = 'active'
  WHERE id = p_quest_id AND user_id = v_user AND status = 'locked';
  RETURN jsonb_build_object('ok', FOUND);
END; $$;

-- ---------- Weekly / Epic option generators ----------

CREATE OR REPLACE FUNCTION public._has_active_selection(p_user UUID, p_type public.quest_type)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quests
    WHERE user_id = p_user AND quest_type = p_type
      AND status IN ('active','locked')
  );
$$;

CREATE OR REPLACE FUNCTION public.generate_weekly_options()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_group UUID := gen_random_uuid();
  v_quest public.quests;
  v_xp JSONB;
  v_inserted JSONB := '[]'::jsonb;
  rec RECORD;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Discard previous candidates for weekly
  DELETE FROM public.quest_progress qp USING public.quests q
   WHERE qp.quest_id = q.id AND q.user_id = v_user AND q.quest_type='weekly' AND q.status='candidate';
  DELETE FROM public.quests
   WHERE user_id = v_user AND quest_type='weekly' AND status='candidate';

  IF public._has_active_selection(v_user, 'weekly') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'weekly_already_selected');
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
END; $$;

CREATE OR REPLACE FUNCTION public.generate_epic_options()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_group UUID := gen_random_uuid();
  v_quest public.quests;
  v_xp JSONB;
  v_inserted JSONB := '[]'::jsonb;
  rec RECORD;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  DELETE FROM public.quest_progress qp USING public.quests q
   WHERE qp.quest_id = q.id AND q.user_id = v_user AND q.quest_type='epic' AND q.status='candidate';
  DELETE FROM public.quests
   WHERE user_id = v_user AND quest_type='epic' AND status='candidate';

  IF public._has_active_selection(v_user, 'epic') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'epic_already_selected');
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('epic_30day_disc', 8, 'high',   '30-Day Discipline', 'Train OR study 25 days in the next 30.',   NULL,        NULL, 25,   'count', ARRAY['discipline']),
      ('epic_xp_2000',    7, 'medium', 'XP Marathon',       'Earn 2000 XP across all activities.',      NULL,        NULL, 2000, 'xp',    ARRAY['discipline']),
      ('epic_study_1500', 8, 'medium', 'Knowledge Forge',   'Study 1500 minutes in 30 days.',           'study',     NULL, 1500, 'minutes', ARRAY['intelligence']),
      ('epic_workouts_20',8, 'high',   'Body Crucible',     'Complete 20 workouts in 30 days.',         'workout',   20,   20,   'count', ARRAY['strength']),
      ('epic_speak_10',   9, 'high',   'Voice of Authority','10 public speaking sessions in 30 days.',  'public_speaking', 10, 10, 'count', ARRAY['charisma','discipline'])
    ) AS t(template_key, difficulty, energy, title, description, type_id, min_dur, target_v, unit, linked)
    ORDER BY random() LIMIT 3
  LOOP
    v_xp := public.compute_quest_xp(v_user, rec.difficulty, 'epic');
    INSERT INTO public.quests (
      user_id, title, description, quest_type, difficulty, linked_stats, energy,
      criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key,
      selection_group
    ) VALUES (
      v_user, rec.title, rec.description, 'epic', rec.difficulty,
      rec.linked, rec.energy::public.quest_energy,
      jsonb_strip_nulls(jsonb_build_object('type_id', rec.type_id, 'min_duration', rec.min_dur)),
      'candidate', (v_xp->>'final')::int, FALSE,
      now() + INTERVAL '30 days', 'epic_option', rec.template_key,
      v_group
    ) RETURNING * INTO v_quest;

    INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
    VALUES (v_quest.id, v_user, 0, GREATEST(1, rec.target_v), rec.unit);

    v_inserted := v_inserted || jsonb_build_object('id', v_quest.id, 'title', v_quest.title);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'group', v_group, 'options', v_inserted);
END; $$;

-- ---------- Selection ----------

CREATE OR REPLACE FUNCTION public.select_quest_option(p_quest_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_quest public.quests;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_quest FROM public.quests
  WHERE id = p_quest_id AND user_id = v_user AND status = 'candidate';
  IF v_quest.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_candidate');
  END IF;

  -- Lock this one
  UPDATE public.quests SET status = 'locked' WHERE id = v_quest.id;

  -- Discard siblings in the same selection group
  IF v_quest.selection_group IS NOT NULL THEN
    DELETE FROM public.quest_progress qp USING public.quests q
     WHERE qp.quest_id = q.id AND q.user_id = v_user
       AND q.selection_group = v_quest.selection_group AND q.id <> v_quest.id;
    DELETE FROM public.quests
     WHERE user_id = v_user AND selection_group = v_quest.selection_group AND id <> v_quest.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quest_id', v_quest.id);
END; $$;

-- ---------- Update tick to include locked ----------

CREATE OR REPLACE FUNCTION public.tick_quest_progress()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  qp RECORD;
  v_match BOOLEAN;
  v_increment INTEGER;
  v_done BOOLEAN;
BEGIN
  FOR qp IN
    SELECT q.id AS quest_id, q.criteria, q.quest_type, q.linked_stats,
           p.id AS progress_id, p.current, p.target, p.unit
    FROM public.quests q
    JOIN public.quest_progress p ON p.quest_id = q.id
    WHERE q.user_id = NEW.user_id AND q.status IN ('active','locked')
  LOOP
    v_match := TRUE;
    IF qp.criteria ? 'type_id' THEN
      IF jsonb_typeof(qp.criteria->'type_id') = 'array' THEN
        v_match := v_match AND (NEW.type_id = ANY(ARRAY(SELECT jsonb_array_elements_text(qp.criteria->'type_id'))));
      ELSE
        v_match := v_match AND (NEW.type_id = (qp.criteria->>'type_id'));
      END IF;
    END IF;
    IF qp.criteria ? 'min_duration' THEN
      v_match := v_match AND (COALESCE(NEW.duration_minutes,0) >= (qp.criteria->>'min_duration')::int);
    END IF;
    IF qp.criteria ? 'min_difficulty' THEN
      v_match := v_match AND (NEW.difficulty::text >= (qp.criteria->>'min_difficulty'));
    END IF;
    IF NOT v_match THEN CONTINUE; END IF;

    v_increment := CASE qp.unit
      WHEN 'minutes' THEN COALESCE(NEW.duration_minutes, 0)
      WHEN 'xp'      THEN COALESCE(NEW.xp_gained, 0)
      ELSE 1
    END;
    IF v_increment <= 0 THEN CONTINUE; END IF;

    UPDATE public.quest_progress
      SET current = LEAST(target, current + v_increment),
          last_event_at = now(),
          updated_at = now()
      WHERE id = qp.progress_id
      RETURNING (current >= target) INTO v_done;

    IF v_done THEN
      PERFORM public.complete_quest(qp.quest_id);
    END IF;
  END LOOP;

  RETURN NEW;
END; $$;

-- ---------- complete_quest: allow locked too ----------
CREATE OR REPLACE FUNCTION public.complete_quest(p_quest_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_quest public.quests;
  v_xp_calc jsonb;
  v_xp INTEGER;
  v_level INTEGER; v_xp_now INTEGER; v_skill_points INTEGER;
  v_new_level INTEGER; v_new_xp INTEGER; v_threshold INTEGER; v_levels_gained INTEGER := 0;
  v_stat TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id AND user_id = v_user;
  IF v_quest.id IS NULL THEN RAISE EXCEPTION 'quest_not_found'; END IF;
  IF v_quest.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed');
  END IF;
  IF v_quest.status NOT IN ('active','locked') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_completable');
  END IF;

  v_xp_calc := public.compute_quest_xp(v_user, v_quest.difficulty, v_quest.quest_type);
  v_xp := (v_xp_calc->>'final')::int;

  UPDATE public.quests
    SET status = 'completed', completed = true, completed_at = now(), reward_xp = v_xp
    WHERE id = p_quest_id;

  SELECT level, xp, skill_points INTO v_level, v_xp_now, v_skill_points
    FROM public.profiles WHERE user_id = v_user;
  v_new_level := v_level;
  v_new_xp := v_xp_now + v_xp;
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
        updated_at = now()
    WHERE user_id = v_user;

  IF array_length(v_quest.linked_stats, 1) IS NOT NULL THEN
    FOREACH v_stat IN ARRAY v_quest.linked_stats LOOP
      IF v_stat IN ('intelligence','strength','discipline','charisma') THEN
        EXECUTE format('UPDATE public.stats SET %I = %I + 1, updated_at = now() WHERE user_id = $1', v_stat, v_stat)
          USING v_user;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'xp_gained', v_xp, 'breakdown', v_xp_calc,
    'levels_gained', v_levels_gained, 'new_level', v_new_level,
    'new_xp', v_new_xp, 'skill_points_awarded', v_levels_gained * 3
  );
END; $$;

-- ---------- AI dynamic quest insert: default to candidate so user must pick ----------
CREATE OR REPLACE FUNCTION public.insert_dynamic_quest(p_title text, p_description text, p_difficulty integer, p_energy quest_energy, p_linked_stats text[], p_criteria jsonb, p_target integer, p_unit text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_quest public.quests;
  v_xp_calc JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_difficulty < 1 OR p_difficulty > 10 THEN RAISE EXCEPTION 'invalid_difficulty'; END IF;

  v_xp_calc := public.compute_quest_xp(v_user, p_difficulty, 'dynamic');

  INSERT INTO public.quests (
    user_id, title, description, quest_type, difficulty, linked_stats, energy,
    criteria, status, reward_xp, is_daily, expires_at, generation_reason, template_key
  ) VALUES (
    v_user, p_title, p_description, 'dynamic', p_difficulty,
    COALESCE(p_linked_stats, '{}'::text[]), COALESCE(p_energy,'medium'),
    COALESCE(p_criteria, '{}'::jsonb), 'candidate',
    (v_xp_calc->>'final')::int, FALSE,
    now() + INTERVAL '2 days', p_reason,
    'dynamic_ai'
  ) RETURNING * INTO v_quest;

  INSERT INTO public.quest_progress (quest_id, user_id, current, target, unit)
  VALUES (v_quest.id, v_user, 0, GREATEST(1, COALESCE(p_target,1)), COALESCE(p_unit,'count'));

  RETURN jsonb_build_object('ok', true, 'quest', to_jsonb(v_quest), 'xp', v_xp_calc);
END; $$;
