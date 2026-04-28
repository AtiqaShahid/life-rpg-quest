-- ============================================================
-- SOCIAL LAYER: parties, friends, leaderboards, accountability
-- ============================================================

-- Enable scheduling extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.party_role AS ENUM ('leader','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.friendship_status AS ENUM ('pending','accepted','blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- PARTIES ----------
CREATE TABLE IF NOT EXISTS public.parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  leader_id UUID NOT NULL,
  xp_pool INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  shared_streak INTEGER NOT NULL DEFAULT 0,
  longest_shared_streak INTEGER NOT NULL DEFAULT 0,
  last_streak_date DATE,
  accountability_mode BOOLEAN NOT NULL DEFAULT FALSE,
  grace_used_week DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.party_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.party_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_date DATE,
  UNIQUE(party_id, user_id),
  UNIQUE(user_id) -- a user is in at most one party at a time
);
CREATE INDEX IF NOT EXISTS idx_party_members_party ON public.party_members(party_id);

CREATE TABLE IF NOT EXISTS public.party_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  metric TEXT NOT NULL DEFAULT 'quests', -- 'quests' | 'xp' | 'streak'
  target INTEGER NOT NULL DEFAULT 1,
  current INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'weekly', -- 'weekly' | 'daily'
  expires_at TIMESTAMPTZ,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_party_goals_party ON public.party_goals(party_id);

CREATE TABLE IF NOT EXISTS public.party_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  xp_contributed INTEGER NOT NULL DEFAULT 0,
  quests_completed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(party_id, user_id, activity_date)
);
CREATE INDEX IF NOT EXISTS idx_party_log_party_date ON public.party_activity_log(party_id, activity_date);

-- ---------- FRIENDSHIPS ----------
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL,
  addressee_id UUID NOT NULL,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id),
  UNIQUE(requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON public.friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON public.friendships(requester_id);

-- ---------- LEADERBOARDS ----------
CREATE TABLE IF NOT EXISTS public.leaderboard_entries (
  user_id UUID PRIMARY KEY,
  username TEXT NOT NULL,
  total_xp INTEGER NOT NULL DEFAULT 0,
  weekly_xp INTEGER NOT NULL DEFAULT 0,
  weekly_quests INTEGER NOT NULL DEFAULT 0,
  study_xp INTEGER NOT NULL DEFAULT 0,
  fitness_xp INTEGER NOT NULL DEFAULT 0,
  discipline_score INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  week_start DATE NOT NULL DEFAULT (date_trunc('week', now())::date),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lb_weekly_xp ON public.leaderboard_entries(weekly_xp DESC);
CREATE INDEX IF NOT EXISTS idx_lb_total_xp ON public.leaderboard_entries(total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_lb_study ON public.leaderboard_entries(study_xp DESC);
CREATE INDEX IF NOT EXISTS idx_lb_fitness ON public.leaderboard_entries(fitness_xp DESC);
CREATE INDEX IF NOT EXISTS idx_lb_discipline ON public.leaderboard_entries(discipline_score DESC);

CREATE TABLE IF NOT EXISTS public.weekly_leaderboard_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  rank INTEGER NOT NULL,
  coins_awarded INTEGER NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);

-- ---------- RLS ENABLE ----------
ALTER TABLE public.parties              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_activity_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_leaderboard_rewards ENABLE ROW LEVEL SECURITY;

-- ---------- HELPER FUNCTIONS (avoid recursive RLS) ----------
CREATE OR REPLACE FUNCTION public.is_party_member(_party_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.party_members
    WHERE party_id = _party_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_party_leader(_party_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parties
    WHERE id = _party_id AND leader_id = _user_id
  );
$$;

-- ---------- RLS POLICIES ----------
-- Parties: readable by signed-in (basic info); writes restricted via RPCs
DROP POLICY IF EXISTS "Parties readable by authenticated" ON public.parties;
CREATE POLICY "Parties readable by authenticated"
  ON public.parties FOR SELECT TO authenticated USING (true);

-- party_members: members can see own party rows; everyone authed can see member rows of public party listings is intentional for leaderboards
DROP POLICY IF EXISTS "Party members readable by authenticated" ON public.party_members;
CREATE POLICY "Party members readable by authenticated"
  ON public.party_members FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Members can leave own row" ON public.party_members;
CREATE POLICY "Members can leave own row"
  ON public.party_members FOR DELETE TO authenticated USING (user_id = auth.uid());

-- party_goals: only members can read/write
DROP POLICY IF EXISTS "Goals visible to members" ON public.party_goals;
CREATE POLICY "Goals visible to members"
  ON public.party_goals FOR SELECT TO authenticated
  USING (public.is_party_member(party_id, auth.uid()));

-- party_activity_log: only members can read
DROP POLICY IF EXISTS "Log visible to members" ON public.party_activity_log;
CREATE POLICY "Log visible to members"
  ON public.party_activity_log FOR SELECT TO authenticated
  USING (public.is_party_member(party_id, auth.uid()));

-- friendships: visible to both endpoints
DROP POLICY IF EXISTS "Friendships visible to endpoints" ON public.friendships;
CREATE POLICY "Friendships visible to endpoints"
  ON public.friendships FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "Friendships insertable by requester" ON public.friendships;
CREATE POLICY "Friendships insertable by requester"
  ON public.friendships FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Friendships updatable by endpoints" ON public.friendships;
CREATE POLICY "Friendships updatable by endpoints"
  ON public.friendships FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "Friendships deletable by endpoints" ON public.friendships;
CREATE POLICY "Friendships deletable by endpoints"
  ON public.friendships FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- leaderboard_entries: readable by all authed; writes only via RPCs
DROP POLICY IF EXISTS "Leaderboard readable by authenticated" ON public.leaderboard_entries;
CREATE POLICY "Leaderboard readable by authenticated"
  ON public.leaderboard_entries FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Rewards readable by owner" ON public.weekly_leaderboard_rewards;
CREATE POLICY "Rewards readable by owner"
  ON public.weekly_leaderboard_rewards FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------- TIMESTAMPS TRIGGERS ----------
DROP TRIGGER IF EXISTS trg_parties_updated ON public.parties;
CREATE TRIGGER trg_parties_updated BEFORE UPDATE ON public.parties
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_party_goals_updated ON public.party_goals;
CREATE TRIGGER trg_party_goals_updated BEFORE UPDATE ON public.party_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_friendships_updated ON public.friendships;
CREATE TRIGGER trg_friendships_updated BEFORE UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lb_updated ON public.leaderboard_entries;
CREATE TRIGGER trg_lb_updated BEFORE UPDATE ON public.leaderboard_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- LEADERBOARD SYNC ----------
-- Bump leaderboard + party log when activities are inserted
CREATE OR REPLACE FUNCTION public.sync_leaderboard_on_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uname TEXT;
  v_streak INT;
  v_party UUID;
  v_stat TEXT;
  v_week DATE := date_trunc('week', now())::date;
BEGIN
  SELECT username INTO v_uname FROM public.profiles WHERE user_id = NEW.user_id;
  SELECT current_streak INTO v_streak FROM public.streaks WHERE user_id = NEW.user_id;
  SELECT stat::text INTO v_stat FROM public.activity_types WHERE id = NEW.type_id;

  INSERT INTO public.leaderboard_entries (user_id, username, total_xp, weekly_xp,
       study_xp, fitness_xp, discipline_score, current_streak, week_start)
  VALUES (NEW.user_id, COALESCE(v_uname,'Player'), NEW.xp_gained, NEW.xp_gained,
       CASE WHEN v_stat='intelligence' THEN NEW.xp_gained ELSE 0 END,
       CASE WHEN v_stat='strength'     THEN NEW.xp_gained ELSE 0 END,
       COALESCE(v_streak,0), COALESCE(v_streak,0), v_week)
  ON CONFLICT (user_id) DO UPDATE
    SET username = EXCLUDED.username,
        total_xp = public.leaderboard_entries.total_xp + EXCLUDED.total_xp,
        weekly_xp = CASE WHEN public.leaderboard_entries.week_start = v_week
                         THEN public.leaderboard_entries.weekly_xp + EXCLUDED.total_xp
                         ELSE EXCLUDED.total_xp END,
        study_xp = public.leaderboard_entries.study_xp + EXCLUDED.study_xp,
        fitness_xp = public.leaderboard_entries.fitness_xp + EXCLUDED.fitness_xp,
        discipline_score = GREATEST(public.leaderboard_entries.discipline_score, COALESCE(v_streak,0)),
        current_streak = COALESCE(v_streak, 0),
        week_start = v_week,
        updated_at = now();

  -- Party contribution
  SELECT party_id INTO v_party FROM public.party_members WHERE user_id = NEW.user_id;
  IF v_party IS NOT NULL THEN
    INSERT INTO public.party_activity_log (party_id, user_id, activity_date, xp_contributed, quests_completed)
    VALUES (v_party, NEW.user_id, NEW.activity_date, NEW.xp_gained, 0)
    ON CONFLICT (party_id, user_id, activity_date) DO UPDATE
      SET xp_contributed = public.party_activity_log.xp_contributed + EXCLUDED.xp_contributed;

    UPDATE public.parties SET xp_pool = xp_pool + NEW.xp_gained, updated_at = now()
      WHERE id = v_party;
    UPDATE public.party_members SET last_active_date = NEW.activity_date
      WHERE party_id = v_party AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_lb_activity ON public.activities;
CREATE TRIGGER trg_sync_lb_activity AFTER INSERT ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.sync_leaderboard_on_activity();

-- Bump weekly_quests + party quests on quest completion
CREATE OR REPLACE FUNCTION public.sync_leaderboard_on_quest()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_party UUID;
  v_week DATE := date_trunc('week', now())::date;
BEGIN
  IF (NEW.completed = TRUE AND COALESCE(OLD.completed, FALSE) = FALSE) THEN
    INSERT INTO public.leaderboard_entries (user_id, username, weekly_quests, week_start)
    VALUES (NEW.user_id,
      COALESCE((SELECT username FROM public.profiles WHERE user_id = NEW.user_id), 'Player'),
      1, v_week)
    ON CONFLICT (user_id) DO UPDATE
      SET weekly_quests = CASE WHEN public.leaderboard_entries.week_start = v_week
                               THEN public.leaderboard_entries.weekly_quests + 1
                               ELSE 1 END,
          week_start = v_week,
          updated_at = now();

    SELECT party_id INTO v_party FROM public.party_members WHERE user_id = NEW.user_id;
    IF v_party IS NOT NULL THEN
      INSERT INTO public.party_activity_log (party_id, user_id, activity_date, quests_completed)
      VALUES (v_party, NEW.user_id, CURRENT_DATE, 1)
      ON CONFLICT (party_id, user_id, activity_date) DO UPDATE
        SET quests_completed = public.party_activity_log.quests_completed + 1;

      -- Tick party goals (metric='quests')
      UPDATE public.party_goals
        SET current = LEAST(target, current + 1),
            completed = (current + 1 >= target),
            updated_at = now()
        WHERE party_id = v_party AND metric = 'quests' AND completed = FALSE
          AND (expires_at IS NULL OR expires_at > now());
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_lb_quest ON public.quests;
CREATE TRIGGER trg_sync_lb_quest AFTER UPDATE ON public.quests
FOR EACH ROW EXECUTE FUNCTION public.sync_leaderboard_on_quest();

-- ---------- PARTY RPCs ----------
CREATE OR REPLACE FUNCTION public.create_party(p_name TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_id UUID;
  v_code TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.party_members WHERE user_id = v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_in_party');
  END IF;
  v_code := upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 6));
  INSERT INTO public.parties (name, invite_code, leader_id)
    VALUES (NULLIF(trim(p_name),''), v_code, v_user)
    RETURNING id INTO v_id;
  INSERT INTO public.party_members (party_id, user_id, role)
    VALUES (v_id, v_user, 'leader');
  RETURN jsonb_build_object('ok', true, 'party_id', v_id, 'invite_code', v_code);
END $$;

CREATE OR REPLACE FUNCTION public.join_party(p_invite_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_party public.parties;
  v_count INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.party_members WHERE user_id = v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_in_party');
  END IF;
  SELECT * INTO v_party FROM public.parties WHERE invite_code = upper(trim(p_invite_code));
  IF v_party.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.party_members WHERE party_id = v_party.id;
  IF v_count >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'party_full');
  END IF;
  INSERT INTO public.party_members (party_id, user_id, role) VALUES (v_party.id, v_user, 'member');
  RETURN jsonb_build_object('ok', true, 'party_id', v_party.id);
END $$;

CREATE OR REPLACE FUNCTION public.leave_party()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_party UUID;
  v_role public.party_role;
  v_next UUID;
  v_remaining INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT party_id, role INTO v_party, v_role FROM public.party_members WHERE user_id = v_user;
  IF v_party IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_in_party'); END IF;
  DELETE FROM public.party_members WHERE party_id = v_party AND user_id = v_user;
  SELECT COUNT(*) INTO v_remaining FROM public.party_members WHERE party_id = v_party;
  IF v_remaining = 0 THEN
    DELETE FROM public.parties WHERE id = v_party;
  ELSIF v_role = 'leader' THEN
    SELECT user_id INTO v_next FROM public.party_members WHERE party_id = v_party ORDER BY joined_at ASC LIMIT 1;
    UPDATE public.party_members SET role = 'leader' WHERE party_id = v_party AND user_id = v_next;
    UPDATE public.parties SET leader_id = v_next, updated_at = now() WHERE id = v_party;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.kick_party_member(p_target UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid(); v_party UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT party_id INTO v_party FROM public.party_members WHERE user_id = v_user AND role='leader';
  IF v_party IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_leader'); END IF;
  IF p_target = v_user THEN RETURN jsonb_build_object('ok', false, 'reason', 'cannot_kick_self'); END IF;
  DELETE FROM public.party_members WHERE party_id = v_party AND user_id = p_target;
  RETURN jsonb_build_object('ok', FOUND);
END $$;

CREATE OR REPLACE FUNCTION public.set_party_settings(p_name TEXT, p_accountability BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid(); v_party UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT party_id INTO v_party FROM public.party_members WHERE user_id = v_user AND role='leader';
  IF v_party IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_leader'); END IF;
  UPDATE public.parties
    SET name = COALESCE(NULLIF(trim(p_name),''), name),
        accountability_mode = COALESCE(p_accountability, accountability_mode),
        updated_at = now()
    WHERE id = v_party;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.set_party_goal(p_title TEXT, p_metric TEXT, p_target INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid(); v_party UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT party_id INTO v_party FROM public.party_members WHERE user_id = v_user AND role='leader';
  IF v_party IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_leader'); END IF;
  -- Replace any active weekly goal
  DELETE FROM public.party_goals WHERE party_id = v_party AND completed = FALSE;
  INSERT INTO public.party_goals (party_id, title, metric, target, period, expires_at)
    VALUES (v_party, COALESCE(NULLIF(trim(p_title),''), 'Weekly Goal'),
            COALESCE(NULLIF(p_metric,''), 'quests'), GREATEST(1, p_target),
            'weekly', now() + INTERVAL '7 days');
  RETURN jsonb_build_object('ok', true);
END $$;

-- ---------- FRIENDSHIP RPCs ----------
CREATE OR REPLACE FUNCTION public.send_friend_request(p_username TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_target UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT user_id INTO v_target FROM public.profiles WHERE lower(username) = lower(trim(p_username));
  IF v_target IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found'); END IF;
  IF v_target = v_user THEN RETURN jsonb_build_object('ok', false, 'reason', 'self'); END IF;
  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE (requester_id = v_user AND addressee_id = v_target)
       OR (requester_id = v_target AND addressee_id = v_user)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_exists');
  END IF;
  INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (v_user, v_target, 'pending');
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(p_id UUID, p_accept BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_accept THEN
    UPDATE public.friendships SET status = 'accepted'
      WHERE id = p_id AND addressee_id = v_user AND status = 'pending';
  ELSE
    DELETE FROM public.friendships WHERE id = p_id AND addressee_id = v_user;
  END IF;
  RETURN jsonb_build_object('ok', FOUND);
END $$;

CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = v_user AND addressee_id = p_friend_id)
        OR (requester_id = p_friend_id AND addressee_id = v_user));
  RETURN jsonb_build_object('ok', FOUND);
END $$;

-- ---------- DAILY PARTY STREAK + ACCOUNTABILITY ----------
CREATE OR REPLACE FUNCTION public.tick_party_streaks_daily()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  v_yesterday DATE := CURRENT_DATE - 1;
  v_member_count INT;
  v_active_count INT;
  v_all_active BOOLEAN;
  v_penalty NUMERIC;
  v_grace_week DATE := date_trunc('week', now())::date;
BEGIN
  FOR rec IN SELECT * FROM public.parties LOOP
    SELECT COUNT(*) INTO v_member_count FROM public.party_members WHERE party_id = rec.id;
    IF v_member_count < 2 THEN CONTINUE; END IF;

    SELECT COUNT(DISTINCT user_id) INTO v_active_count
      FROM public.party_activity_log
      WHERE party_id = rec.id AND activity_date = v_yesterday AND xp_contributed > 0;
    v_all_active := (v_active_count = v_member_count);

    IF v_all_active THEN
      UPDATE public.parties
        SET shared_streak = CASE
              WHEN last_streak_date = v_yesterday - 1 OR last_streak_date = v_yesterday
                THEN shared_streak + 1
              ELSE 1 END,
            longest_shared_streak = GREATEST(longest_shared_streak,
              CASE WHEN last_streak_date = v_yesterday - 1 THEN shared_streak + 1 ELSE 1 END),
            last_streak_date = v_yesterday,
            updated_at = now()
        WHERE id = rec.id;
    ELSE
      IF rec.accountability_mode THEN
        IF rec.grace_used_week IS DISTINCT FROM v_grace_week THEN
          -- consume weekly grace, no penalty
          UPDATE public.parties SET grace_used_week = v_grace_week, updated_at = now() WHERE id = rec.id;
        ELSE
          v_penalty := 0.03; -- 3% soft penalty
          UPDATE public.parties
            SET xp_pool = GREATEST(0, ROUND(xp_pool * (1 - v_penalty)))::int,
                shared_streak = 0,
                updated_at = now()
            WHERE id = rec.id;
        END IF;
      ELSE
        UPDATE public.parties SET shared_streak = 0, updated_at = now() WHERE id = rec.id;
      END IF;
    END IF;

    -- Recompute party level from xp_pool
    UPDATE public.parties
      SET level = GREATEST(1, FLOOR(POWER(GREATEST(xp_pool,1)::numeric / 200, 0.6))::int)
      WHERE id = rec.id;
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ---------- WEEKLY LEADERBOARD RESET ----------
CREATE OR REPLACE FUNCTION public.reset_weekly_leaderboard()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  v_rank INT := 0;
  v_old_week DATE;
  v_new_week DATE := date_trunc('week', now())::date;
BEGIN
  -- Pay out top 3 by weekly_xp from previous period
  FOR rec IN
    SELECT user_id, weekly_xp, week_start FROM public.leaderboard_entries
     WHERE week_start < v_new_week AND weekly_xp > 0
     ORDER BY weekly_xp DESC LIMIT 3
  LOOP
    v_rank := v_rank + 1;
    v_old_week := rec.week_start;
    INSERT INTO public.weekly_leaderboard_rewards (user_id, week_start, rank, coins_awarded, xp_awarded)
    VALUES (rec.user_id, v_old_week, v_rank,
      CASE v_rank WHEN 1 THEN 200 WHEN 2 THEN 100 ELSE 50 END,
      CASE v_rank WHEN 1 THEN 100 WHEN 2 THEN 50  ELSE 25 END)
    ON CONFLICT (user_id, week_start) DO NOTHING;

    UPDATE public.profiles
      SET coins = coins + CASE v_rank WHEN 1 THEN 200 WHEN 2 THEN 100 ELSE 50 END,
          xp    = xp    + CASE v_rank WHEN 1 THEN 100 WHEN 2 THEN 50  ELSE 25 END,
          updated_at = now()
      WHERE user_id = rec.user_id;
  END LOOP;

  -- Reset weekly counters
  UPDATE public.leaderboard_entries
    SET weekly_xp = 0, weekly_quests = 0, week_start = v_new_week, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'rewarded', v_rank);
END $$;

-- ---------- REALTIME PUBLICATIONS ----------
ALTER PUBLICATION supabase_realtime ADD TABLE public.parties;
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_goals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard_entries;

ALTER TABLE public.parties              REPLICA IDENTITY FULL;
ALTER TABLE public.party_members        REPLICA IDENTITY FULL;
ALTER TABLE public.party_goals          REPLICA IDENTITY FULL;
ALTER TABLE public.party_activity_log   REPLICA IDENTITY FULL;
ALTER TABLE public.friendships          REPLICA IDENTITY FULL;
ALTER TABLE public.leaderboard_entries  REPLICA IDENTITY FULL;

-- ---------- CRON SCHEDULES ----------
-- Daily party streak + accountability tick at 00:15 UTC
DO $$ BEGIN
  PERFORM cron.unschedule('tick-party-streaks-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('tick-party-streaks-daily', '15 0 * * *',
  $$ SELECT public.tick_party_streaks_daily(); $$);

-- Weekly leaderboard reset Monday 00:00 UTC
DO $$ BEGIN
  PERFORM cron.unschedule('reset-weekly-leaderboard');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('reset-weekly-leaderboard', '0 0 * * 1',
  $$ SELECT public.reset_weekly_leaderboard(); $$);
