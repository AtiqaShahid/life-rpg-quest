
CREATE OR REPLACE FUNCTION public.tick_event_lifecycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expired INT := 0;
  v_global_added INT := 0;
  ev RECORD;
  tmpl RECORD;
BEGIN
  FOR ev IN
    SELECT * FROM public.events WHERE status = 'active' AND ends_at <= v_now
  LOOP
    UPDATE public.events SET status = (CASE
      WHEN scope = 'global' AND global_target IS NOT NULL AND global_progress >= global_target THEN 'completed'
      ELSE 'expired'
    END)::event_status WHERE id = ev.id;

    INSERT INTO public.event_history (
      user_id, event_id, template_id, title, scope, outcome,
      progress, target, awarded_xp, awarded_coins, awarded_tokens, awarded_items, ended_at
    )
    SELECT
      p.user_id, ev.id, ev.template_id, ev.title, ev.scope,
      (CASE WHEN p.status = 'claimed' THEN 'claimed'
            WHEN p.status = 'completed' THEN 'completed'
            ELSE 'expired' END)::participation_status,
      p.progress, p.target, 0, 0, 0, p.awarded_items, v_now
    FROM public.event_participation p
    WHERE p.event_id = ev.id
      AND NOT EXISTS (SELECT 1 FROM public.event_history h WHERE h.event_id = ev.id AND h.user_id = p.user_id);

    UPDATE public.event_participation
      SET status = (CASE WHEN status IN ('claimed','completed') THEN status::text ELSE 'expired' END)::participation_status
      WHERE event_id = ev.id;

    v_expired := v_expired + 1;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.events WHERE scope = 'global' AND status = 'active' AND ends_at > v_now) THEN
    SELECT * INTO tmpl FROM public.event_templates
      WHERE scope = 'global' AND active ORDER BY random() * weight DESC LIMIT 1;
    IF FOUND THEN
      INSERT INTO public.events (
        template_id, user_id, scope, status, title, tagline, flavor, category,
        criteria, multiplier, difficulty, reward_xp, reward_coins, reward_tokens,
        reward_item_ids, global_target, starts_at, ends_at
      ) VALUES (
        tmpl.id, NULL, 'global'::event_scope, 'active'::event_status,
        tmpl.title, tmpl.tagline, tmpl.flavor, tmpl.category,
        tmpl.criteria, tmpl.multiplier, 3, tmpl.base_xp, tmpl.base_coins, tmpl.base_tokens,
        tmpl.reward_item_ids,
        COALESCE((tmpl.criteria->>'target')::int, 10000),
        v_now, v_now + (tmpl.duration_hours || ' hours')::interval
      );
      v_global_added := 1;
    END IF;
  END IF;

  RETURN jsonb_build_object('expired', v_expired, 'global_added', v_global_added);
END $function$;
