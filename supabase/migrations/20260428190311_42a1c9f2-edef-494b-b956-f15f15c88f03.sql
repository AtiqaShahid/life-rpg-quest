
CREATE OR REPLACE FUNCTION public.join_seasonal_template(p_template text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_t RECORD;
  v_event_id UUID;
  v_target INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_t FROM public.event_templates WHERE id = p_template AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'template_not_found'; END IF;
  IF v_t.scope <> 'seasonal' THEN RAISE EXCEPTION 'not_seasonal'; END IF;

  -- Reuse existing active instance for this user/template if any
  SELECT id INTO v_event_id FROM public.events
   WHERE user_id = v_user AND template_id = v_t.id AND status = 'active'
   ORDER BY created_at DESC LIMIT 1;

  v_target := COALESCE((v_t.criteria->>'target')::int, 1);

  IF v_event_id IS NULL THEN
    INSERT INTO public.events (
      template_id, user_id, scope, status, title, tagline, flavor, category,
      criteria, multiplier, difficulty, reward_xp, reward_coins, reward_tokens,
      reward_item_ids, global_target, starts_at, ends_at
    ) VALUES (
      v_t.id, v_user, 'seasonal', 'active', v_t.title, v_t.tagline, v_t.flavor, v_t.category,
      v_t.criteria, v_t.multiplier, 3, v_t.base_xp, v_t.base_coins, v_t.base_tokens,
      v_t.reward_item_ids, v_target, now(), now() + (v_t.duration_hours || ' hours')::interval
    ) RETURNING id INTO v_event_id;
  END IF;

  INSERT INTO public.event_participation (event_id, user_id, status, progress, target)
  VALUES (v_event_id, v_user, 'active', 0, v_target)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET status = CASE WHEN public.event_participation.status IN ('not_joined','expired')
                      THEN 'active' ELSE public.event_participation.status END;

  RETURN jsonb_build_object('joined', true, 'event_id', v_event_id);
END $$;

GRANT EXECUTE ON FUNCTION public.join_seasonal_template(text) TO authenticated;
