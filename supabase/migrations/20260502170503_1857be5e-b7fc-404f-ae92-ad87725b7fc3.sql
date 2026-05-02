
CREATE OR REPLACE FUNCTION public.get_event_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_active JSONB;
  v_seasonal JSONB;
  v_global JSONB;
  v_history JSONB;
  v_inventory JSONB;
  v_mult NUMERIC;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  PERFORM public.tick_event_lifecycle();
  PERFORM public.roll_weekly_events_for_user(v_user);

  -- Per-user active (weekly)
  WITH e AS (
    SELECT
      e.id, e.template_id, e.scope, e.status, e.title, e.tagline, e.flavor, e.category,
      e.multiplier, e.reward_xp, e.reward_coins, e.reward_tokens, e.reward_item_ids,
      e.global_target, e.global_progress, e.starts_at, e.ends_at,
      COALESCE(p.progress, 0) AS progress,
      COALESCE(p.target, 1) AS target,
      COALESCE(p.status::text, 'active') AS part_status,
      p.claimed_at
    FROM public.events e
    LEFT JOIN public.event_participation p
      ON p.event_id = e.id AND p.user_id = v_user
    WHERE e.user_id = v_user AND e.status = 'active' AND e.ends_at > now()
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.ends_at), '[]'::jsonb) INTO v_active FROM e;

  -- Seasonal (existing per-user instances + available templates not yet instantiated)
  WITH s AS (
    SELECT
      e.id, e.template_id, e.scope, e.status, e.title, e.tagline, e.flavor, e.category,
      e.multiplier, e.reward_xp, e.reward_coins, e.reward_tokens, e.reward_item_ids,
      e.global_target, e.global_progress, e.starts_at, e.ends_at,
      COALESCE(p.progress, 0) AS progress,
      COALESCE(p.target, 1) AS target,
      COALESCE(p.status::text, 'not_joined') AS part_status,
      p.claimed_at
    FROM public.events e
    LEFT JOIN public.event_participation p
      ON p.event_id = e.id AND p.user_id = v_user
    WHERE e.user_id = v_user AND e.scope = 'seasonal'
      AND e.status = 'active' AND e.ends_at > now()
    UNION ALL
    SELECT
      gen_random_uuid()                                AS id,
      t.id                                              AS template_id,
      'seasonal'::event_scope                           AS scope,
      'upcoming'::event_status                          AS status,
      t.title, t.tagline, t.flavor, t.category,
      t.multiplier,
      t.base_xp                                         AS reward_xp,
      t.base_coins                                      AS reward_coins,
      t.base_tokens                                     AS reward_tokens,
      t.reward_item_ids,
      COALESCE((t.criteria->>'target')::int, 1)         AS global_target,
      0                                                 AS global_progress,
      now()                                             AS starts_at,
      now() + (t.duration_hours || ' hours')::interval  AS ends_at,
      0                                                 AS progress,
      COALESCE((t.criteria->>'target')::int, 1)         AS target,
      'not_joined'::text                                AS part_status,
      NULL::timestamptz                                 AS claimed_at
    FROM public.event_templates t
    WHERE t.scope = 'seasonal' AND t.active
      AND NOT EXISTS (
        SELECT 1 FROM public.events e2
        WHERE e2.user_id = v_user AND e2.template_id = t.id AND e2.status = 'active'
      )
    LIMIT 3
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_seasonal FROM s;

  -- Global active
  WITH g AS (
    SELECT
      e.id, e.template_id, e.scope, e.status, e.title, e.tagline, e.flavor, e.category,
      e.multiplier, e.reward_xp, e.reward_coins, e.reward_tokens, e.reward_item_ids,
      e.global_target, e.global_progress, e.starts_at, e.ends_at,
      COALESCE(p.progress, 0) AS progress,
      COALESCE(p.target, 1) AS target,
      COALESCE(p.status::text, 'active') AS part_status,
      p.claimed_at
    FROM public.events e
    LEFT JOIN public.event_participation p
      ON p.event_id = e.id AND p.user_id = v_user
    WHERE e.user_id IS NULL AND e.status = 'active' AND e.ends_at > now()
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.ends_at), '[]'::jsonb) INTO v_global FROM g;

  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.ended_at DESC), '[]'::jsonb) INTO v_history
  FROM (
    SELECT * FROM public.event_history WHERE user_id = v_user ORDER BY ended_at DESC LIMIT 20
  ) h;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reward_id', i.reward_id, 'acquired_at', i.acquired_at,
    'name', r.name, 'description', r.description, 'icon', r.icon,
    'kind', r.kind, 'rarity', r.rarity, 'effect', r.effect
  ) ORDER BY i.acquired_at DESC), '[]'::jsonb) INTO v_inventory
  FROM public.user_event_inventory i
  JOIN public.event_rewards_catalog r ON r.id = i.reward_id
  WHERE i.user_id = v_user;

  SELECT COALESCE(MAX(e.multiplier), 1.0) INTO v_mult FROM public.events e
   LEFT JOIN public.event_participation p ON p.event_id = e.id AND p.user_id = v_user
   WHERE e.status='active' AND e.ends_at > now()
     AND (e.user_id = v_user OR (e.user_id IS NULL AND COALESCE(p.status::text,'active') IN ('active','completed','claimed')));

  RETURN jsonb_build_object(
    'active', v_active,
    'seasonal', v_seasonal,
    'global', v_global,
    'history', v_history,
    'inventory', v_inventory,
    'aggregate_multiplier', COALESCE(v_mult, 1.0),
    'computed_at', now()
  );
END $function$;
