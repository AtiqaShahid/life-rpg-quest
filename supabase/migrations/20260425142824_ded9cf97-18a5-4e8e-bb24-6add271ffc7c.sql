
-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  username TEXT NOT NULL,
  avatar_url TEXT,
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by owner" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Profiles insertable by owner" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Profiles updatable by owner" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- =========================
-- STATS
-- =========================
CREATE TABLE public.stats (
  user_id UUID NOT NULL PRIMARY KEY,
  intelligence INT NOT NULL DEFAULT 10,
  strength INT NOT NULL DEFAULT 10,
  discipline INT NOT NULL DEFAULT 10,
  charisma INT NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stats viewable by owner" ON public.stats
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Stats insertable by owner" ON public.stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Stats updatable by owner" ON public.stats
  FOR UPDATE USING (auth.uid() = user_id);

-- =========================
-- STREAKS
-- =========================
CREATE TABLE public.streaks (
  user_id UUID NOT NULL PRIMARY KEY,
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_active_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Streaks viewable by owner" ON public.streaks
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Streaks insertable by owner" ON public.streaks
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Streaks updatable by owner" ON public.streaks
  FOR UPDATE USING (auth.uid() = user_id);

-- =========================
-- ACTIVITY TYPES (public catalog)
-- =========================
CREATE TYPE public.stat_kind AS ENUM ('intelligence','strength','discipline','charisma');

CREATE TABLE public.activity_types (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  stat public.stat_kind NOT NULL,
  xp INT NOT NULL,
  description TEXT
);
ALTER TABLE public.activity_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Activity types readable by everyone" ON public.activity_types
  FOR SELECT USING (true);

INSERT INTO public.activity_types (id, label, icon, stat, xp, description) VALUES
  ('workout','Workout','Dumbbell','strength',50,'Train your body'),
  ('run','Run / Cardio','Footprints','strength',40,'Build endurance'),
  ('study','Study Session','BookOpen','intelligence',40,'Learn something new'),
  ('read','Read a Book','Book','intelligence',30,'Expand your mind'),
  ('meditate','Meditate','Sparkles','discipline',30,'Center your mind'),
  ('deep_work','Deep Work','Brain','discipline',45,'Focused, distraction-free work'),
  ('socialize','Socialize','Users','charisma',30,'Connect with people'),
  ('public_speak','Public Speaking','Mic','charisma',60,'Speak in front of others'),
  ('healthy_meal','Healthy Meal','Salad','strength',20,'Fuel your body well'),
  ('sleep_well','Sleep 8h','Moon','discipline',25,'Rest and recover');

-- =========================
-- ACTIVITIES
-- =========================
CREATE TABLE public.activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type_id TEXT NOT NULL REFERENCES public.activity_types(id),
  xp_gained INT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_user_created ON public.activities(user_id, created_at DESC);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Activities viewable by owner" ON public.activities
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Activities insertable by owner" ON public.activities
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Activities deletable by owner" ON public.activities
  FOR DELETE USING (auth.uid() = user_id);

-- =========================
-- QUESTS
-- =========================
CREATE TABLE public.quests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  reward_xp INT NOT NULL DEFAULT 25,
  is_daily BOOLEAN NOT NULL DEFAULT false,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quests_user ON public.quests(user_id);
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Quests viewable by owner" ON public.quests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Quests insertable by owner" ON public.quests
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Quests updatable by owner" ON public.quests
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Quests deletable by owner" ON public.quests
  FOR DELETE USING (auth.uid() = user_id);

-- =========================
-- ACHIEVEMENTS
-- =========================
CREATE TABLE public.achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, code)
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Achievements viewable by owner" ON public.achievements
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Achievements insertable by owner" ON public.achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =========================
-- TIMESTAMP TRIGGER
-- =========================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_stats_updated BEFORE UPDATE ON public.stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_streaks_updated BEFORE UPDATE ON public.streaks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- AUTO-PROVISION NEW USERS
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (user_id, username) VALUES (NEW.id, uname);
  INSERT INTO public.stats (user_id) VALUES (NEW.id);
  INSERT INTO public.streaks (user_id) VALUES (NEW.id);

  INSERT INTO public.quests (user_id, title, reward_xp, is_daily) VALUES
    (NEW.id, 'Complete a workout', 50, true),
    (NEW.id, 'Study for 30 minutes', 40, true),
    (NEW.id, 'Meditate 10 minutes', 30, true),
    (NEW.id, 'Read 20 pages', 30, true);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- DAILY QUEST RESET (user-callable)
-- =========================
CREATE OR REPLACE FUNCTION public.reset_daily_quests(p_user UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() <> p_user THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.quests
    SET completed = false, completed_at = NULL
    WHERE user_id = p_user AND is_daily = true
      AND (completed_at IS NULL OR completed_at::date < CURRENT_DATE);
END; $$;
