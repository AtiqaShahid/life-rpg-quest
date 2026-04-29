DO $$ BEGIN
  CREATE TYPE public.dm_status AS ENUM ('sent', 'delivered', 'seen');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS status public.dm_status NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS seen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_dm_receiver_status
  ON public.direct_messages (receiver_id, status);

-- RLS: allow receiver to update status/timestamps on their incoming messages
DROP POLICY IF EXISTS "DM update receipts by receiver" ON public.direct_messages;
CREATE POLICY "DM update receipts by receiver"
  ON public.direct_messages FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

CREATE OR REPLACE FUNCTION public.mark_messages_delivered(p_sender uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_count int;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  UPDATE public.direct_messages
    SET status = 'delivered', delivered_at = COALESCE(delivered_at, now())
    WHERE receiver_id = v_uid AND sender_id = p_sender
      AND status = 'sent' AND expires_at > now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_messages_delivered(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_messages_delivered(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_messages_seen(p_sender uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_count int;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  UPDATE public.direct_messages
    SET status = 'seen',
        delivered_at = COALESCE(delivered_at, now()),
        seen_at = COALESCE(seen_at, now())
    WHERE receiver_id = v_uid AND sender_id = p_sender
      AND status <> 'seen' AND expires_at > now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_messages_seen(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_messages_seen(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_conversation(uuid, int);
CREATE FUNCTION public.get_conversation(p_other uuid, p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid, sender_id uuid, receiver_id uuid, content text,
  type public.dm_type, status public.dm_status,
  delivered_at timestamptz, seen_at timestamptz,
  created_at timestamptz, expires_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  IF NOT public.are_friends(v_uid, p_other) THEN RETURN; END IF;
  RETURN QUERY
  SELECT m.id, m.sender_id, m.receiver_id, m.content, m.type,
         m.status, m.delivered_at, m.seen_at, m.created_at, m.expires_at
  FROM public.direct_messages m
  WHERE m.expires_at > now()
    AND ((m.sender_id = v_uid AND m.receiver_id = p_other)
      OR (m.sender_id = p_other AND m.receiver_id = v_uid))
  ORDER BY m.created_at ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;
REVOKE ALL ON FUNCTION public.get_conversation(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversation(uuid, int) TO authenticated;