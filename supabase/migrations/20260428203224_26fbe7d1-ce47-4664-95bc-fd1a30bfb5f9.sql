CREATE OR REPLACE FUNCTION public.record_event_progress_for_user(p_user uuid, p_event_kind text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ev RECORD;
  cri JSONB;
  metric TEXT;
  v_target INT;
  filt JSONB;
  delta INT;
  matches BOOLEAN;
  pr RECORD;
  hour_of INT;
  total_xp INT;
  per RECORD;
  new_progress INT;
BEGIN
  hour_of := COALESCE((p_payload->>'hour')::int, EXTRACT(HOUR FROM now())::int);

  FOR ev IN
    SELECT e.* FROM public.events e
    LEFT JOIN public.event_participation p
      ON p.event_id = e.id AND p.user_id = p_user
    WHERE e.status = 'active'
      AND e.ends_at > now()
      AND (
        e.user_id = p_user
        OR (e.user_id IS NULL AND COALESCE(p.status,'active'::participation_status) IN ('active','completed','claimed'))
      )
  LOOP
    cri := ev.criteria;
    metric := COALESCE(cri->>'metric','activities');
    filt := COALESCE(cri->'filter','{}'::jsonb);
    delta := 0;
    matches := TRUE;

    IF filt ? 'before_hour' AND hour_of >= (filt->>'before_hour')::int THEN matches := FALSE; END IF;
    IF filt ? 'after_hour'  AND hour_of <  (filt->>'after_hour')::int  THEN matches := FALSE; END IF;
    IF filt ? 'category' THEN
      IF lower(COALESCE(p_payload->>'category','')) <> lower(filt->>'category') THEN matches := FALSE; END IF;
    END IF;

    IF NOT matches THEN CONTINUE; END IF;

    IF p_event_kind = 'activity' THEN
      IF metric = 'activities' THEN delta := 1;
      ELSIF metric = 'hard_activities'   AND p_payload->>'difficulty' = 'hard'   THEN delta := 1;
      ELSIF metric = 'medium_activities' AND p_payload->>'difficulty' = 'medium' THEN delta := 1;
      ELSIF metric = 'easy_activities'   AND p_payload->>'difficulty' = 'easy'   THEN delta := 1;
      ELSIF metric = 'duration_minutes' THEN delta := COALESCE((p_payload->>'duration_minutes')::int, 0);
      ELSIF metric = 'xp_total'         THEN delta := COALESCE((p_payload->>'xp_gained')::int, 0);
      ELSIF metric = 'active_days' THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.event_participation
          WHERE event_id = ev.id AND user_id = p_user
            AND (meta->>'last_active_date')::date = CURRENT_DATE
        ) THEN delta := 1; END IF;
      ELSIF metric = 'distinct_categories' THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.event_participation p2
          WHERE p2.event_id = ev.id AND p2.user_id = p_user
            AND p2.meta -> 'cats' ? COALESCE(p_payload->>'category','')
        ) THEN delta := 1; END IF;
      ELSIF metric = 'streak_days' THEN
        delta := 0;
      ELSIF metric = 'global_quests' THEN
        delta := 0;
      ELSIF metric = 'participation' THEN delta := 1;
      END IF;
    ELSIF p_event_kind = 'quest' THEN
      IF metric = 'quests' THEN delta := 1;
      ELSIF metric = 'global_quests' THEN delta := 1;
      ELSIF metric = 'participation' THEN delta := 1;
      END IF;
    END IF;

    IF delta <= 0 THEN CONTINUE; END IF;

    v_target := COALESCE(ev.global_target, (ev.criteria->>'target')::int, 1);

    INSERT INTO public.event_participation (event_id, user_id, status, progress, target, meta)
    VALUES (
      ev.id, p_user, 'active', 0, v_target,
      jsonb_build_object('cats', '[]'::jsonb)
    )
    ON CONFLICT (event_id, user_id) DO NOTHING;

    SELECT * INTO per FROM public.event_participation
      WHERE event_id = ev.id AND user_id = p_user FOR UPDATE;

    IF per.status NOT IN ('active') THEN CONTINUE; END IF;

    new_progress := LEAST(per.target, per.progress + delta);

    UPDATE public.event_participation ep SET
      progress = new_progress,
      meta = CASE
        WHEN metric = 'distinct_categories' THEN
          jsonb_set(COALESCE(ep.meta, '{}'::jsonb), '{cats}',
            COALESCE(ep.meta->'cats','[]'::jsonb) || to_jsonb(COALESCE(p_payload->>'category','')))
        WHEN metric = 'active_days' THEN
          jsonb_set(COALESCE(ep.meta, '{}'::jsonb), '{last_active_date}', to_jsonb(CURRENT_DATE::text))
        ELSE ep.meta
      END,
      status = CASE WHEN new_progress >= ep.target THEN 'completed'::participation_status ELSE ep.status END,
      completed_at = CASE WHEN new_progress >= ep.target AND ep.completed_at IS NULL THEN now() ELSE ep.completed_at END
    WHERE ep.id = per.id;

    IF ev.user_id IS NULL THEN
      UPDATE public.events
        SET global_progress = LEAST(COALESCE(global_target, 9999999), global_progress + delta)
        WHERE id = ev.id;
    END IF;
  END LOOP;
END $function$;