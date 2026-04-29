-- Search users by username prefix (case-insensitive), excluding self.
-- Returns friendship status with current user so UI can show appropriate action.
CREATE OR REPLACE FUNCTION public.search_users(p_query text, p_limit int DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  level int,
  friendship_status text  -- 'none' | 'friend' | 'pending_outgoing' | 'pending_incoming' | 'blocked'
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q text := lower(coalesce(trim(p_query), ''));
BEGIN
  IF v_uid IS NULL OR length(v_q) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.username,
    p.avatar_url,
    p.level,
    COALESCE(
      (
        SELECT CASE
          WHEN f.status = 'accepted' THEN 'friend'
          WHEN f.status = 'blocked' THEN 'blocked'
          WHEN f.status = 'pending' AND f.requester_id = v_uid THEN 'pending_outgoing'
          WHEN f.status = 'pending' AND f.addressee_id = v_uid THEN 'pending_incoming'
          ELSE 'none'
        END
        FROM public.friendships f
        WHERE (f.requester_id = v_uid AND f.addressee_id = p.user_id)
           OR (f.addressee_id = v_uid AND f.requester_id = p.user_id)
        LIMIT 1
      ),
      'none'
    ) AS friendship_status
  FROM public.profiles p
  WHERE p.user_id <> v_uid
    AND lower(p.username) LIKE v_q || '%'
  ORDER BY length(p.username), p.username
  LIMIT LEAST(GREATEST(p_limit, 1), 25);
END;
$$;

REVOKE ALL ON FUNCTION public.search_users(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_users(text, int) TO authenticated;

-- Helpful index for prefix search
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (lower(username) text_pattern_ops);