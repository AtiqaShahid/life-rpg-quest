-- HARD DAILY/WEEKLY RESET SYSTEM
-- Track last reset date in user's local timezone (passed by client).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_daily_reset date,
  ADD COLUMN IF NOT EXISTS last_weekly_reset date;

-- Optional archive table for completed/incomplete previous-day quests.
CREATE TABLE IF NOT EXISTS public.quest_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archive_date date NOT NULL,
  quest_type text NOT NULL,
  title text NOT NULL,
  template_key text,
  is_compulsory boolean NOT NULL DEFAULT false,
  completed boolean NOT NULL DEFAULT false,
  xp_earned integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.quest_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Quest archive readable by owner" ON public.quest_archive;
CREATE POLICY "Quest archive readable by owner"
  ON public.quest_archive FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_quest_archive_user_date
  ON public.quest_archive(user_id, archive_date DESC);

-- Hard daily reset: wipe ALL daily quests, archive snapshot, re-seed 3 fresh anchors.
CREATE OR REPLACE FUNCTION public.hard_daily_reset(p_local_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_last date;
  v_archived int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_local_date IS NULL THEN p_local_date := CURRENT_DATE; END IF;

  SELECT last_daily_reset INTO v_last
  FROM public.profiles WHERE user_id = v_user;

  IF v_last IS NOT NULL AND v_last >= p_local_date THEN
    RETURN jsonb_build_object('ok', true, 'reset', false, 'reason', 'already_reset_today');
  END IF;

  -- Archive existing daily quests before wiping.
  WITH ins AS (
    INSERT INTO public.quest_archive (user_id, archive_date, quest_type, title, template_key, is_compulsory, completed, xp_earned, payload)
    SELECT q.user_id, COALESCE(v_last, p_local_date - 1), q.quest_type::text, q.title, q.template_key, q.is_compulsory, q.completed,
           CASE WHEN q.completed THEN q.reward_xp ELSE 0 END,
           jsonb_build_object('difficulty', q.difficulty, 'criteria', q.criteria, 'completed_at', q.completed_at)
    FROM public.quests q
    WHERE q.user_id = v_user AND q.is_daily = true
    RETURNING 1
  )
  SELECT count(*) INTO v_archived FROM ins;

  -- Wipe daily progress + daily quests.
  DELETE FROM public.quest_progress qp
  USING public.quests q
  WHERE qp.quest_id = q.id AND q.user_id = v_user AND q.is_daily = true;

  DELETE FROM public.quests
  WHERE user_id = v_user AND is_daily = true;

  -- Re-seed exactly 3 fresh compulsory anchors (the new 3 daily quests).
  PERFORM public.seed_compulsory_quests();

  -- Mark reset date.
  UPDATE public.profiles SET last_daily_reset = p_local_date, updated_at = now()
  WHERE user_id = v_user;

  RETURN jsonb_build_object('ok', true, 'reset', true, 'archived', v_archived, 'date', p_local_date);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hard_daily_reset(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_daily_reset(date) TO authenticated;

-- Hard weekly reset: wipe ALL weekly quests (archive), regenerate via generate_quests.
CREATE OR REPLACE FUNCTION public.hard_weekly_reset(p_local_week_start date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_last date;
  v_archived int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_local_week_start IS NULL THEN p_local_week_start := date_trunc('week', CURRENT_DATE)::date; END IF;

  SELECT last_weekly_reset INTO v_last
  FROM public.profiles WHERE user_id = v_user;

  IF v_last IS NOT NULL AND v_last >= p_local_week_start THEN
    RETURN jsonb_build_object('ok', true, 'reset', false, 'reason', 'already_reset_this_week');
  END IF;

  WITH ins AS (
    INSERT INTO public.quest_archive (user_id, archive_date, quest_type, title, template_key, is_compulsory, completed, xp_earned, payload)
    SELECT q.user_id, COALESCE(v_last, p_local_week_start - 7), q.quest_type::text, q.title, q.template_key, q.is_compulsory, q.completed,
           CASE WHEN q.completed THEN q.reward_xp ELSE 0 END,
           jsonb_build_object('difficulty', q.difficulty, 'criteria', q.criteria, 'completed_at', q.completed_at)
    FROM public.quests q
    WHERE q.user_id = v_user AND q.quest_type = 'weekly'
    RETURNING 1
  )
  SELECT count(*) INTO v_archived FROM ins;

  DELETE FROM public.quest_progress qp
  USING public.quests q
  WHERE qp.quest_id = q.id AND q.user_id = v_user AND q.quest_type = 'weekly';

  DELETE FROM public.quests
  WHERE user_id = v_user AND quest_type = 'weekly';

  UPDATE public.profiles SET last_weekly_reset = p_local_week_start, updated_at = now()
  WHERE user_id = v_user;

  RETURN jsonb_build_object('ok', true, 'reset', true, 'archived', v_archived, 'week_start', p_local_week_start);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hard_weekly_reset(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_weekly_reset(date) TO authenticated;