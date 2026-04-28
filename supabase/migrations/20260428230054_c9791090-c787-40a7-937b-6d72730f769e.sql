REVOKE EXECUTE ON FUNCTION public.complete_quest(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_quest(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.refresh_leaderboard_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_leaderboard_entry(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_leaderboard_on_quest() FROM PUBLIC, anon, authenticated;