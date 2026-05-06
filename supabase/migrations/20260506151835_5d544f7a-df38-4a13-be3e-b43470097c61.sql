REVOKE EXECUTE ON FUNCTION public.seed_compulsory_quests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_compulsory_quests() FROM anon;
GRANT EXECUTE ON FUNCTION public.seed_compulsory_quests() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reset_daily_quests(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_daily_quests(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_daily_quests(uuid) TO authenticated;