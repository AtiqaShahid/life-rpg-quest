REVOKE EXECUTE ON FUNCTION public.refresh_leaderboard_entry(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.select_character_class(public.character_class, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_leaderboard_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_character_class(public.character_class, boolean) TO authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT user_id FROM public.profiles WHERE class_type IS NOT NULL LOOP
    PERFORM public.refresh_leaderboard_entry(r.user_id);
  END LOOP;
END $$;