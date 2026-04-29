-- Message type enum
DO $$ BEGIN
  CREATE TYPE public.dm_type AS ENUM ('text', 'image');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Direct messages table
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  content text NOT NULL,
  type public.dm_type NOT NULL DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_dm_pair_time
  ON public.direct_messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_receiver_time
  ON public.direct_messages (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_expires
  ON public.direct_messages (expires_at);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Helper: are two users mutual friends?
CREATE OR REPLACE FUNCTION public.are_friends(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = _a AND f.addressee_id = _b)
        OR (f.requester_id = _b AND f.addressee_id = _a))
  );
$$;
REVOKE ALL ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated;

-- RLS: read own (sent or received), unexpired
CREATE POLICY "DM readable by participants (unexpired)"
  ON public.direct_messages FOR SELECT TO authenticated
  USING (
    expires_at > now()
    AND (auth.uid() = sender_id OR auth.uid() = receiver_id)
  );

-- RLS: insert only if sender is auth.uid AND friends with receiver
CREATE POLICY "DM insert by sender to friend"
  ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND sender_id <> receiver_id
    AND public.are_friends(sender_id, receiver_id)
  );

-- RLS: senders can delete their own messages (optional)
CREATE POLICY "DM delete by sender"
  ON public.direct_messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- Send message RPC (validates friendship + expiry)
CREATE OR REPLACE FUNCTION public.send_direct_message(
  p_receiver uuid,
  p_content text,
  p_type public.dm_type DEFAULT 'text'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg public.direct_messages;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF p_receiver = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cannot_message_self');
  END IF;
  IF coalesce(trim(p_content), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty');
  END IF;
  IF NOT public.are_friends(v_uid, p_receiver) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_friends');
  END IF;

  INSERT INTO public.direct_messages (sender_id, receiver_id, content, type)
  VALUES (v_uid, p_receiver, p_content, p_type)
  RETURNING * INTO v_msg;

  RETURN jsonb_build_object('ok', true, 'id', v_msg.id, 'created_at', v_msg.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.send_direct_message(uuid, text, public.dm_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_direct_message(uuid, text, public.dm_type) TO authenticated;

-- Fetch conversation with a friend
CREATE OR REPLACE FUNCTION public.get_conversation(p_other uuid, p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid,
  sender_id uuid,
  receiver_id uuid,
  content text,
  type public.dm_type,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  IF NOT public.are_friends(v_uid, p_other) THEN RETURN; END IF;

  RETURN QUERY
  SELECT m.id, m.sender_id, m.receiver_id, m.content, m.type, m.created_at, m.expires_at
  FROM public.direct_messages m
  WHERE m.expires_at > now()
    AND (
      (m.sender_id = v_uid AND m.receiver_id = p_other) OR
      (m.sender_id = p_other AND m.receiver_id = v_uid)
    )
  ORDER BY m.created_at ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;
REVOKE ALL ON FUNCTION public.get_conversation(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversation(uuid, int) TO authenticated;

-- Cleanup expired messages
CREATE OR REPLACE FUNCTION public.cleanup_expired_messages()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  DELETE FROM public.direct_messages WHERE expires_at <= now();
$$;
REVOKE ALL ON FUNCTION public.cleanup_expired_messages() FROM PUBLIC;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;

-- Storage bucket for chat images (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: anyone can read chat images
CREATE POLICY "Chat images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-images');

-- Users can upload to their own folder
CREATE POLICY "Chat images upload own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own uploads
CREATE POLICY "Chat images delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Schedule cleanup every 10 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'dm-cleanup-expired',
  '*/10 * * * *',
  $$ SELECT public.cleanup_expired_messages(); $$
);