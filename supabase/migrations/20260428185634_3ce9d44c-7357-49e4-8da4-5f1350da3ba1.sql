
-- ============================================================================
-- EVENT SYSTEM (re-engagement engine)
-- ============================================================================

-- ---------- Types ----------
DO $$ BEGIN
  CREATE TYPE public.event_scope AS ENUM ('weekly','seasonal','global');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.event_status AS ENUM ('upcoming','active','completed','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.participation_status AS ENUM ('not_joined','active','completed','expired','claimed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Catalog: templates ----------
CREATE TABLE IF NOT EXISTS public.event_templates (
  id              TEXT PRIMARY KEY,
  scope           public.event_scope NOT NULL,
  category        TEXT NOT NULL,                     -- productivity | health | learning | social | recovery
  title           TEXT NOT NULL,
  tagline         TEXT NOT NULL,
  flavor          TEXT,                              -- arc / story flavor
  criteria        JSONB NOT NULL DEFAULT '{}'::jsonb,-- e.g. {"metric":"activities","target":5,"window":"day","filter":{"before_hour":18}}
  duration_hours  INT  NOT NULL DEFAULT 168,         -- weekly default
  multiplier      NUMERIC NOT NULL DEFAULT 1.2,
  difficulty_min  INT NOT NULL DEFAULT 1,            -- 1..5; picker selects based on user activity
  difficulty_max  INT NOT NULL DEFAULT 5,
  base_xp         INT NOT NULL DEFAULT 100,
  base_coins      INT NOT NULL DEFAULT 25,
  base_tokens     INT NOT NULL DEFAULT 0,
  reward_item_ids TEXT[] NOT NULL DEFAULT '{}',
  weight          INT NOT NULL DEFAULT 10,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Templates readable by everyone"
  ON public.event_templates FOR SELECT USING (true);

-- ---------- Catalog: exclusive rewards ----------
CREATE TABLE IF NOT EXISTS public.event_rewards_catalog (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  kind        TEXT NOT NULL,                          -- badge | theme | shield | bundle
  icon        TEXT NOT NULL DEFAULT '🏆',
  rarity      TEXT NOT NULL DEFAULT 'rare',           -- common | rare | epic | legendary
  effect      JSONB NOT NULL DEFAULT '{}'::jsonb,     -- e.g. {"streak_protect_days":2}
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_rewards_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rewards catalog readable by everyone"
  ON public.event_rewards_catalog FOR SELECT USING (true);

-- ---------- Events (instances) ----------
CREATE TABLE IF NOT EXISTS public.events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     TEXT REFERENCES public.event_templates(id) ON DELETE SET NULL,
  user_id         UUID,                                -- NULL = global event
  scope           public.event_scope NOT NULL,
  status          public.event_status NOT NULL DEFAULT 'active',
  title           TEXT NOT NULL,
  tagline         TEXT NOT NULL,
  flavor          TEXT,
  category        TEXT NOT NULL,
  criteria        JSONB NOT NULL DEFAULT '{}'::jsonb,
  multiplier      NUMERIC NOT NULL DEFAULT 1.2,
  difficulty      INT NOT NULL DEFAULT 3,
  reward_xp       INT NOT NULL DEFAULT 100,
  reward_coins    INT NOT NULL DEFAULT 25,
  reward_tokens   INT NOT NULL DEFAULT 0,
  reward_item_ids TEXT[] NOT NULL DEFAULT '{}',
  -- Seasonal/global aggregate progress (units defined by criteria.metric)
  global_target   INT,                                  -- only for global / seasonal
  global_progress INT NOT NULL DEFAULT 0,
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at         TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_user_idx        ON public.events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_global_idx      ON public.events(scope, status) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS events_status_ends_idx ON public.events(status, ends_at);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own events readable"
  ON public.events FOR SELECT
  TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

-- (no INSERT/UPDATE/DELETE policies — all writes go through SECURITY DEFINER RPCs)

-- ---------- Participation ----------
CREATE TABLE IF NOT EXISTS public.event_participation (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  status        public.participation_status NOT NULL DEFAULT 'active',
  progress      INT NOT NULL DEFAULT 0,
  target        INT NOT NULL DEFAULT 1,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  claimed_at    TIMESTAMPTZ,
  awarded_items TEXT[] NOT NULL DEFAULT '{}',
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS participation_user_idx   ON public.event_participation(user_id);
CREATE INDEX IF NOT EXISTS participation_event_idx  ON public.event_participation(event_id);

ALTER TABLE public.event_participation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own participation readable"
  ON public.event_participation FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------- History ----------
CREATE TABLE IF NOT EXISTS public.event_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  event_id      UUID,
  template_id   TEXT,
  title         TEXT NOT NULL,
  scope         public.event_scope NOT NULL,
  outcome       public.participation_status NOT NULL,  -- completed | expired | claimed
  progress      INT NOT NULL DEFAULT 0,
  target        INT NOT NULL DEFAULT 1,
  awarded_xp    INT NOT NULL DEFAULT 0,
  awarded_coins INT NOT NULL DEFAULT 0,
  awarded_tokens INT NOT NULL DEFAULT 0,
  awarded_items TEXT[] NOT NULL DEFAULT '{}',
  ended_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_history_user_idx ON public.event_history(user_id, ended_at DESC);

ALTER TABLE public.event_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own history readable"
  ON public.event_history FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- ---------- User exclusive inventory ----------
CREATE TABLE IF NOT EXISTS public.user_event_inventory (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  reward_id    TEXT NOT NULL REFERENCES public.event_rewards_catalog(id) ON DELETE CASCADE,
  source_event UUID,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, reward_id, source_event)
);

ALTER TABLE public.user_event_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own event inventory readable"
  ON public.user_event_inventory FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Exclusive rewards
INSERT INTO public.event_rewards_catalog (id, name, description, kind, icon, rarity, effect) VALUES
  ('badge_iron_will',   'Iron Will',         'Awarded for surviving a 7-day discipline arc.',    'badge',  '🛡️', 'epic',      '{}'::jsonb),
  ('badge_dawn_runner', 'Dawn Runner',       'Logged 5 activities before 9 AM in a single week.','badge',  '🌅', 'rare',      '{}'::jsonb),
  ('badge_marathoner',  'Marathoner',        'Cleared a 30-day seasonal arc.',                   'badge',  '🏅', 'legendary', '{}'::jsonb),
  ('badge_hivemind',    'Hivemind',          'Contributed to a global community goal.',          'badge',  '🌐', 'epic',      '{}'::jsonb),
  ('shield_streak_2d',  'Streak Shield (2d)','Auto-protects your streak for up to 2 missed days.','shield','🧿', 'rare',      '{"streak_protect_days":2}'::jsonb),
  ('shield_streak_3d',  'Streak Shield (3d)','Auto-protects your streak for up to 3 missed days.','shield','🛡️', 'epic',      '{"streak_protect_days":3}'::jsonb),
  ('theme_neon_pulse',  'Neon Pulse Theme',  'Limited UI accent unlocked from a global event.',  'theme',  '🎨', 'epic',      '{"theme":"neon_pulse"}'::jsonb),
  ('bundle_gold_cache', 'Gold Cache',        '+200 coins, +5 tokens — event exclusive bundle.',  'bundle', '💰', 'rare',      '{"coins":200,"tokens":5}'::jsonb)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
      kind = EXCLUDED.kind, rarity = EXCLUDED.rarity, effect = EXCLUDED.effect;

-- Weekly templates (12)
INSERT INTO public.event_templates (id, scope, category, title, tagline, flavor, criteria, duration_hours, multiplier, difficulty_min, difficulty_max, base_xp, base_coins, base_tokens, reward_item_ids, weight) VALUES
  ('w_early_bird',     'weekly','productivity','Early Bird Protocol',     'Log 5 activities before 6 PM.',                  'Win the day before the day wins you.',
     '{"metric":"activities","target":5,"filter":{"before_hour":18}}'::jsonb,             168, 1.3, 2, 4, 250,  60, 0, ARRAY['badge_dawn_runner'], 12),
  ('w_no_skip_3d',     'weekly','health',      'Unbroken Chain',          'No skipped days for 3 consecutive days.',        'Discipline is what remains when motivation leaves.',
     '{"metric":"streak_days","target":3}'::jsonb,                                         168, 1.4, 1, 4, 220,  50, 1, ARRAY['shield_streak_2d'], 12),
  ('w_hard_5',         'weekly','productivity','Iron Forge',              'Complete 5 hard-difficulty tasks.',              'Heavy weeks build heavy lifters.',
     '{"metric":"hard_activities","target":5}'::jsonb,                                     168, 1.4, 3, 5, 300,  75, 1, ARRAY['badge_iron_will'], 8),
  ('w_quest_15',       'weekly','productivity','Quest Marathon',          'Complete 15 quests this week.',                  'Volume creates momentum.',
     '{"metric":"quests","target":15}'::jsonb,                                             168, 1.3, 2, 5, 260,  60, 0, ARRAY[]::text[], 14),
  ('w_focus_2h',       'weekly','learning',    'Deep Focus Marathon',     'Log 120 minutes of focus/study sessions.',       'The mind sharpens in long, quiet hours.',
     '{"metric":"duration_minutes","target":120,"filter":{"category":"learning"}}'::jsonb, 168, 1.3, 2, 4, 240,  55, 0, ARRAY[]::text[], 12),
  ('w_morning_3',      'weekly','health',      'Morning Momentum',        '3 morning activities (before 10 AM).',           'Rule the first hour, rule the day.',
     '{"metric":"activities","target":3,"filter":{"before_hour":10}}'::jsonb,              168, 1.25,1, 3, 180,  45, 0, ARRAY['badge_dawn_runner'], 14),
  ('w_balance',        'weekly','health',      'Balanced Loadout',        'Log activities in 3 different categories.',      'Range protects against burnout.',
     '{"metric":"distinct_categories","target":3}'::jsonb,                                 168, 1.25,2, 4, 200,  50, 0, ARRAY[]::text[], 12),
  ('w_quick_wins',     'weekly','recovery',    'Quick Wins',              'Complete 7 easy activities to rebuild momentum.','Small reps. Big return.',
     '{"metric":"easy_activities","target":7}'::jsonb,                                     168, 1.2, 1, 2, 160,  40, 0, ARRAY[]::text[], 10),
  ('w_medium_10',      'weekly','productivity','Steady Climb',            'Complete 10 medium-difficulty activities.',      'Steady beats spectacular.',
     '{"metric":"medium_activities","target":10}'::jsonb,                                  168, 1.3, 2, 4, 240,  55, 0, ARRAY[]::text[], 12),
  ('w_xp_1000',        'weekly','productivity','XP Surge',                'Earn 1000 XP this week.',                        'Stack the curve.',
     '{"metric":"xp_total","target":1000}'::jsonb,                                         168, 1.4, 2, 5, 280,  65, 1, ARRAY[]::text[], 10),
  ('w_recover',        'weekly','recovery',    '48h Recovery Sprint',     'Log just 3 activities — re-enter the loop.',     'Even one rep breaks the slope.',
     '{"metric":"activities","target":3}'::jsonb,                                          48,  1.5, 1, 1, 150,  40, 0, ARRAY['shield_streak_2d'], 18),
  ('w_evening_3',      'weekly','health',      'Night Owl Closeout',      '3 evening activities (after 8 PM).',             'Close strong. Sleep stronger.',
     '{"metric":"activities","target":3,"filter":{"after_hour":20}}'::jsonb,               168, 1.25,1, 3, 180,  45, 0, ARRAY[]::text[], 10)
ON CONFLICT (id) DO UPDATE
  SET title=EXCLUDED.title, tagline=EXCLUDED.tagline, criteria=EXCLUDED.criteria,
      multiplier=EXCLUDED.multiplier, base_xp=EXCLUDED.base_xp, base_coins=EXCLUDED.base_coins,
      base_tokens=EXCLUDED.base_tokens, reward_item_ids=EXCLUDED.reward_item_ids, weight=EXCLUDED.weight,
      duration_hours=EXCLUDED.duration_hours, flavor=EXCLUDED.flavor;

-- Seasonal templates (3)
INSERT INTO public.event_templates (id, scope, category, title, tagline, flavor, criteria, duration_hours, multiplier, base_xp, base_coins, base_tokens, reward_item_ids, weight) VALUES
  ('s_discipline_30',  'seasonal','productivity','Discipline Season',     'A 30-day arc of consistent execution.',
     'Each milestone unlocks at 25/50/75/100% of the campaign.',
     '{"metric":"activities","target":60}'::jsonb,                                         720, 1.5, 1500, 400, 10, ARRAY['badge_iron_will','badge_marathoner','shield_streak_3d'], 5),
  ('s_focus_sprint_30','seasonal','learning',    'Focus Sprint',          '30 days of deliberate learning.',
     'Tier rewards at 25/50/75/100% — finish for the legendary mark.',
     '{"metric":"duration_minutes","target":900,"filter":{"category":"learning"}}'::jsonb, 720, 1.5, 1400, 380, 8,  ARRAY['badge_marathoner','theme_neon_pulse'], 5),
  ('s_resilience_30',  'seasonal','health',      'Resilience Arc',        '30 days, no longer than 2-day gaps.',
     'Built for the long game.',
     '{"metric":"active_days","target":24}'::jsonb,                                        720, 1.5, 1300, 360, 8,  ARRAY['badge_marathoner','shield_streak_3d'], 5)
ON CONFLICT (id) DO UPDATE
  SET title=EXCLUDED.title, tagline=EXCLUDED.tagline, flavor=EXCLUDED.flavor,
      criteria=EXCLUDED.criteria, multiplier=EXCLUDED.multiplier,
      base_xp=EXCLUDED.base_xp, base_coins=EXCLUDED.base_coins, base_tokens=EXCLUDED.base_tokens,
      reward_item_ids=EXCLUDED.reward_item_ids;

-- Global templates (2)
INSERT INTO public.event_templates (id, scope, category, title, tagline, flavor, criteria, duration_hours, multiplier, base_xp, base_coins, base_tokens, reward_item_ids, weight) VALUES
  ('g_million_tasks',  'global','social',  'Hivemind: 10K Quest Push',  'Players collectively complete 10,000 quests.',
     '+2x XP for everyone until the goal is reached.',
     '{"metric":"global_quests","target":10000}'::jsonb,                                    72, 2.0, 500, 100, 2, ARRAY['badge_hivemind','theme_neon_pulse'], 1),
  ('g_xp_storm',       'global','productivity','XP Storm',              '48h global XP surge.',
     'Every activity counts double across the whole server.',
     '{"metric":"participation","target":1}'::jsonb,                                        48, 2.0, 400, 80,  1, ARRAY['badge_hivemind'], 1)
ON CONFLICT (id) DO UPDATE
  SET title=EXCLUDED.title, tagline=EXCLUDED.tagline, flavor=EXCLUDED.flavor,
      criteria=EXCLUDED.criteria, multiplier=EXCLUDED.multiplier,
      base_xp=EXCLUDED.base_xp, base_coins=EXCLUDED.base_coins, base_tokens=EXCLUDED.base_tokens,
      reward_item_ids=EXCLUDED.reward_item_ids;

-- ============================================================================
-- HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public._touch_event_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_events_touch ON public.events;
CREATE TRIGGER trg_events_touch BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public._touch_event_updated_at();

DROP TRIGGER IF EXISTS trg_participation_touch ON public.event_participation;
CREATE TRIGGER trg_participation_touch BEFORE UPDATE ON public.event_participation
  FOR EACH ROW EXECUTE FUNCTION public._touch_event_updated_at();

-- ============================================================================
-- PROGRESS RECORDER
-- Called from triggers on activities & quests. Iterates the player's active
-- events and increments progress where the activity matches the criteria.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_event_progress_for_user(
  p_user UUID,
  p_event_kind TEXT,        -- 'activity' | 'quest'
  p_payload JSONB           -- {type_id, difficulty, duration_minutes, hour, xp_gained, category}
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ev RECORD;
  cri JSONB;
  metric TEXT;
  target INT;
  filt JSONB;
  delta INT;
  matches BOOLEAN;
  pr RECORD;
  hour_of INT;
  total_xp INT;
  per RECORD;
  new_progress INT;
BEGIN
  hour_of := COALESCE((p_payload->>'hour')::int, EXTRACT(HOUR FROM now())::int);

  FOR ev IN
    SELECT e.* FROM public.events e
    LEFT JOIN public.event_participation p
      ON p.event_id = e.id AND p.user_id = p_user
    WHERE e.status = 'active'
      AND e.ends_at > now()
      AND (
        e.user_id = p_user
        OR (e.user_id IS NULL AND COALESCE(p.status,'active'::participation_status) IN ('active','completed','claimed'))
      )
  LOOP
    cri := ev.criteria;
    metric := COALESCE(cri->>'metric','activities');
    filt := COALESCE(cri->'filter','{}'::jsonb);
    delta := 0;
    matches := TRUE;

    -- Filter checks
    IF filt ? 'before_hour' AND hour_of >= (filt->>'before_hour')::int THEN matches := FALSE; END IF;
    IF filt ? 'after_hour'  AND hour_of <  (filt->>'after_hour')::int  THEN matches := FALSE; END IF;
    IF filt ? 'category' THEN
      IF lower(COALESCE(p_payload->>'category','')) <> lower(filt->>'category') THEN matches := FALSE; END IF;
    END IF;

    IF NOT matches THEN CONTINUE; END IF;

    IF p_event_kind = 'activity' THEN
      IF metric = 'activities' THEN delta := 1;
      ELSIF metric = 'hard_activities'   AND p_payload->>'difficulty' = 'hard'   THEN delta := 1;
      ELSIF metric = 'medium_activities' AND p_payload->>'difficulty' = 'medium' THEN delta := 1;
      ELSIF metric = 'easy_activities'   AND p_payload->>'difficulty' = 'easy'   THEN delta := 1;
      ELSIF metric = 'duration_minutes' THEN delta := COALESCE((p_payload->>'duration_minutes')::int, 0);
      ELSIF metric = 'xp_total'         THEN delta := COALESCE((p_payload->>'xp_gained')::int, 0);
      ELSIF metric = 'active_days' THEN
        -- Increment only once per day per event
        IF NOT EXISTS (
          SELECT 1 FROM public.event_participation
          WHERE event_id = ev.id AND user_id = p_user
            AND (meta->>'last_active_date')::date = CURRENT_DATE
        ) THEN delta := 1; END IF;
      ELSIF metric = 'distinct_categories' THEN
        -- Counted by adding category into participation.meta.cats[]
        IF NOT EXISTS (
          SELECT 1 FROM public.event_participation p2
          WHERE p2.event_id = ev.id AND p2.user_id = p_user
            AND p2.meta -> 'cats' ? COALESCE(p_payload->>'category','')
        ) THEN delta := 1; END IF;
      ELSIF metric = 'streak_days' THEN
        -- Pulled from streaks table on tick instead; skip here
        delta := 0;
      ELSIF metric = 'global_quests' THEN
        delta := 0; -- quest path
      ELSIF metric = 'participation' THEN delta := 1;
      END IF;
    ELSIF p_event_kind = 'quest' THEN
      IF metric = 'quests' THEN delta := 1;
      ELSIF metric = 'global_quests' THEN delta := 1;
      ELSIF metric = 'participation' THEN delta := 1;
      END IF;
    END IF;

    IF delta <= 0 THEN CONTINUE; END IF;

    -- Upsert participation row
    INSERT INTO public.event_participation (event_id, user_id, status, progress, target, meta)
    VALUES (
      ev.id, p_user, 'active', 0,
      COALESCE(ev.global_target, (ev.criteria->>'target')::int, 1),
      jsonb_build_object('cats', '[]'::jsonb)
    )
    ON CONFLICT (event_id, user_id) DO NOTHING;

    SELECT * INTO per FROM public.event_participation
      WHERE event_id = ev.id AND user_id = p_user FOR UPDATE;

    IF per.status NOT IN ('active') THEN CONTINUE; END IF;

    new_progress := LEAST(per.target, per.progress + delta);

    UPDATE public.event_participation SET
      progress = new_progress,
      meta = CASE
        WHEN metric = 'distinct_categories' THEN
          jsonb_set(COALESCE(meta, '{}'::jsonb), '{cats}',
            COALESCE(meta->'cats','[]'::jsonb) || to_jsonb(COALESCE(p_payload->>'category','')))
        WHEN metric = 'active_days' THEN
          jsonb_set(COALESCE(meta, '{}'::jsonb), '{last_active_date}', to_jsonb(CURRENT_DATE::text))
        ELSE meta
      END,
      status = CASE WHEN new_progress >= target THEN 'completed' ELSE status END,
      completed_at = CASE WHEN new_progress >= target AND completed_at IS NULL THEN now() ELSE completed_at END
    WHERE id = per.id;

    -- Bump global aggregate progress for global events
    IF ev.user_id IS NULL THEN
      UPDATE public.events
        SET global_progress = LEAST(COALESCE(global_target, 9999999), global_progress + delta)
        WHERE id = ev.id;
    END IF;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.record_event_progress_for_user(UUID, TEXT, JSONB) FROM PUBLIC, anon;

-- ---------- Activity trigger ----------
CREATE OR REPLACE FUNCTION public._tg_record_event_progress_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cat TEXT;
BEGIN
  SELECT lower(stat::text) INTO cat FROM public.activity_types WHERE id = NEW.type_id;
  -- map stat to category bucket
  cat := CASE
    WHEN cat = 'intelligence' THEN 'learning'
    WHEN cat = 'strength'     THEN 'health'
    WHEN cat = 'discipline'   THEN 'productivity'
    WHEN cat = 'charisma'     THEN 'social'
    ELSE 'productivity'
  END;
  PERFORM public.record_event_progress_for_user(
    NEW.user_id, 'activity',
    jsonb_build_object(
      'type_id',          NEW.type_id,
      'difficulty',       NEW.difficulty::text,
      'duration_minutes', COALESCE(NEW.duration_minutes,0),
      'xp_gained',        NEW.xp_gained,
      'hour',             EXTRACT(HOUR FROM NEW.created_at)::int,
      'category',         cat
    )
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_event_progress_activity ON public.activities;
CREATE TRIGGER trg_event_progress_activity
  AFTER INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public._tg_record_event_progress_activity();

-- ---------- Quest completion trigger ----------
CREATE OR REPLACE FUNCTION public._tg_record_event_progress_quest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.completed AND (OLD.completed IS DISTINCT FROM NEW.completed) THEN
    PERFORM public.record_event_progress_for_user(
      NEW.user_id, 'quest',
      jsonb_build_object('xp_gained', NEW.reward_xp, 'category', 'productivity')
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_event_progress_quest ON public.quests;
CREATE TRIGGER trg_event_progress_quest
  AFTER UPDATE ON public.quests
  FOR EACH ROW EXECUTE FUNCTION public._tg_record_event_progress_quest();

-- ============================================================================
-- ROLLER: pick weekly events for the player based on behavior
-- ============================================================================

CREATE OR REPLACE FUNCTION public.roll_weekly_events_for_user(p_user UUID DEFAULT auth.uid())
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_active INT;
  v_recent_acts INT;
  v_inactive_days INT;
  v_consistency NUMERIC;
  v_difficulty_band INT;        -- 1..5
  v_picks INT;
  tmpl RECORD;
  v_now TIMESTAMPTZ := now();
  inserted INT := 0;
  recent_titles TEXT[];
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Already active weekly events for this user
  SELECT COUNT(*) INTO v_active
    FROM public.events
    WHERE user_id = p_user AND scope = 'weekly' AND status = 'active' AND ends_at > v_now;

  IF v_active >= 3 THEN
    RETURN jsonb_build_object('inserted', 0, 'reason', 'cap_reached');
  END IF;

  -- Behavior signals
  SELECT COUNT(*) INTO v_recent_acts
    FROM public.activities WHERE user_id = p_user AND created_at >= v_now - INTERVAL '14 days';

  SELECT COALESCE(CURRENT_DATE - MAX(activity_date), 999) INTO v_inactive_days
    FROM public.activities WHERE user_id = p_user;

  SELECT (COUNT(DISTINCT activity_date)::numeric / 14) * 100 INTO v_consistency
    FROM public.activities WHERE user_id = p_user AND activity_date >= CURRENT_DATE - 13;

  v_difficulty_band := CASE
    WHEN v_inactive_days >= 3 OR v_recent_acts < 4 THEN 1   -- recovery / easy entry
    WHEN v_consistency < 40 THEN 2
    WHEN v_consistency < 65 THEN 3
    WHEN v_consistency < 85 THEN 4
    ELSE 5
  END;

  v_picks := GREATEST(0, 3 - v_active);
  IF v_consistency >= 70 THEN v_picks := LEAST(5 - v_active, v_picks + 2); END IF;

  IF v_picks <= 0 THEN
    RETURN jsonb_build_object('inserted', 0, 'reason', 'cap_reached');
  END IF;

  -- Avoid repeating titles from the last 21 days
  SELECT COALESCE(array_agg(title), '{}') INTO recent_titles
    FROM public.event_history
    WHERE user_id = p_user AND ended_at >= v_now - INTERVAL '21 days';

  -- Weighted pick
  FOR tmpl IN
    SELECT t.*
    FROM public.event_templates t
    WHERE t.scope = 'weekly' AND t.active
      AND t.difficulty_min <= v_difficulty_band
      AND t.difficulty_max >= v_difficulty_band
      AND NOT (t.title = ANY(recent_titles))
      AND NOT EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.user_id = p_user AND e.template_id = t.id AND e.status = 'active'
      )
    ORDER BY (random() * t.weight) DESC
    LIMIT v_picks
  LOOP
    INSERT INTO public.events (
      template_id, user_id, scope, status, title, tagline, flavor, category,
      criteria, multiplier, difficulty, reward_xp, reward_coins, reward_tokens,
      reward_item_ids, global_target, starts_at, ends_at
    ) VALUES (
      tmpl.id, p_user, 'weekly', 'active', tmpl.title, tmpl.tagline, tmpl.flavor, tmpl.category,
      tmpl.criteria, tmpl.multiplier, v_difficulty_band, tmpl.base_xp, tmpl.base_coins, tmpl.base_tokens,
      tmpl.reward_item_ids,
      COALESCE((tmpl.criteria->>'target')::int, 1),
      v_now, v_now + (tmpl.duration_hours || ' hours')::interval
    );

    -- Auto-create participation row
    INSERT INTO public.event_participation (event_id, user_id, status, progress, target)
    SELECT e.id, p_user, 'active', 0, COALESCE((e.criteria->>'target')::int, 1)
    FROM public.events e
    WHERE e.user_id = p_user AND e.template_id = tmpl.id AND e.status = 'active'
    ORDER BY created_at DESC LIMIT 1
    ON CONFLICT (event_id, user_id) DO NOTHING;

    inserted := inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted', inserted, 'difficulty_band', v_difficulty_band);
END $$;

GRANT EXECUTE ON FUNCTION public.roll_weekly_events_for_user(UUID) TO authenticated;

-- ============================================================================
-- JOIN seasonal event (opt-in)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.join_event(p_event UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event RECORD;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF v_event.status <> 'active' OR v_event.ends_at <= now() THEN
    RAISE EXCEPTION 'event_not_active';
  END IF;
  IF v_event.user_id IS NOT NULL AND v_event.user_id <> v_user THEN
    RAISE EXCEPTION 'not_yours';
  END IF;

  INSERT INTO public.event_participation (event_id, user_id, status, progress, target)
  VALUES (p_event, v_user, 'active', 0, COALESCE((v_event.criteria->>'target')::int, COALESCE(v_event.global_target,1)))
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET status = CASE WHEN public.event_participation.status = 'not_joined' THEN 'active' ELSE public.event_participation.status END;

  RETURN jsonb_build_object('joined', true);
END $$;

GRANT EXECUTE ON FUNCTION public.join_event(UUID) TO authenticated;

-- ============================================================================
-- CLAIM rewards
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_event_rewards(p_event UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event RECORD;
  v_part RECORD;
  v_xp INT;
  v_coins INT;
  v_tokens INT;
  v_items TEXT[];
  it TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
  SELECT * INTO v_part FROM public.event_participation WHERE event_id = p_event AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_joined'; END IF;
  IF v_part.status NOT IN ('completed') THEN RAISE EXCEPTION 'not_completed'; END IF;

  v_xp := v_event.reward_xp;
  v_coins := v_event.reward_coins;
  v_tokens := v_event.reward_tokens;
  v_items := v_event.reward_item_ids;

  UPDATE public.profiles
    SET xp = xp + v_xp,
        coins = coins + v_coins,
        tokens = tokens + v_tokens
    WHERE user_id = v_user;

  -- Grant exclusive items
  IF v_items IS NOT NULL THEN
    FOREACH it IN ARRAY v_items LOOP
      INSERT INTO public.user_event_inventory (user_id, reward_id, source_event)
      VALUES (v_user, it, p_event)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  UPDATE public.event_participation SET
    status = 'claimed',
    claimed_at = now(),
    awarded_items = COALESCE(v_items, '{}')
  WHERE id = v_part.id;

  INSERT INTO public.event_history (
    user_id, event_id, template_id, title, scope, outcome,
    progress, target, awarded_xp, awarded_coins, awarded_tokens, awarded_items
  ) VALUES (
    v_user, v_event.id, v_event.template_id, v_event.title, v_event.scope, 'claimed',
    v_part.progress, v_part.target, v_xp, v_coins, v_tokens, COALESCE(v_items,'{}')
  );

  RETURN jsonb_build_object('xp', v_xp, 'coins', v_coins, 'tokens', v_tokens, 'items', v_items);
END $$;

GRANT EXECUTE ON FUNCTION public.claim_event_rewards(UUID) TO authenticated;

-- ============================================================================
-- LIFECYCLE TICK
-- Expires finished events, archives history, refreshes weekly pool, ensures
-- a global event exists when none is live.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tick_event_lifecycle()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expired INT := 0;
  v_completed INT := 0;
  v_global_added INT := 0;
  ev RECORD;
  tmpl RECORD;
BEGIN
  -- 1. Move past-deadline events to expired/completed and archive history
  FOR ev IN
    SELECT * FROM public.events WHERE status = 'active' AND ends_at <= v_now
  LOOP
    UPDATE public.events SET status = CASE
      WHEN scope = 'global' AND global_target IS NOT NULL AND global_progress >= global_target THEN 'completed'
      ELSE 'expired'
    END WHERE id = ev.id;

    -- Archive participations
    INSERT INTO public.event_history (
      user_id, event_id, template_id, title, scope, outcome,
      progress, target, awarded_xp, awarded_coins, awarded_tokens, awarded_items, ended_at
    )
    SELECT
      p.user_id, ev.id, ev.template_id, ev.title, ev.scope,
      CASE WHEN p.status = 'claimed' THEN 'claimed'
           WHEN p.status = 'completed' THEN 'completed'
           ELSE 'expired' END,
      p.progress, p.target, 0, 0, 0, p.awarded_items, v_now
    FROM public.event_participation p
    WHERE p.event_id = ev.id
      AND NOT EXISTS (SELECT 1 FROM public.event_history h WHERE h.event_id = ev.id AND h.user_id = p.user_id);

    -- Mark participations expired (keep claimed/completed states)
    UPDATE public.event_participation
      SET status = CASE WHEN status IN ('claimed','completed') THEN status ELSE 'expired' END
      WHERE event_id = ev.id;

    v_expired := v_expired + 1;
  END LOOP;

  -- 2. Ensure a global event exists
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE scope = 'global' AND status = 'active' AND ends_at > v_now) THEN
    SELECT * INTO tmpl FROM public.event_templates
      WHERE scope = 'global' AND active ORDER BY random() * weight DESC LIMIT 1;
    IF FOUND THEN
      INSERT INTO public.events (
        template_id, user_id, scope, status, title, tagline, flavor, category,
        criteria, multiplier, difficulty, reward_xp, reward_coins, reward_tokens,
        reward_item_ids, global_target, starts_at, ends_at
      ) VALUES (
        tmpl.id, NULL, 'global', 'active', tmpl.title, tmpl.tagline, tmpl.flavor, tmpl.category,
        tmpl.criteria, tmpl.multiplier, 3, tmpl.base_xp, tmpl.base_coins, tmpl.base_tokens,
        tmpl.reward_item_ids,
        COALESCE((tmpl.criteria->>'target')::int, 10000),
        v_now, v_now + (tmpl.duration_hours || ' hours')::interval
      );
      v_global_added := 1;
    END IF;
  END IF;

  RETURN jsonb_build_object('expired', v_expired, 'global_added', v_global_added);
END $$;

GRANT EXECUTE ON FUNCTION public.tick_event_lifecycle() TO authenticated;

-- ============================================================================
-- VIEW: get_event_dashboard()
-- One call, returns active/upcoming/seasonal/global/history bundle.
-- Also calls roll + tick lazily on demand.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_event_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_active JSONB;
  v_seasonal JSONB;
  v_global JSONB;
  v_history JSONB;
  v_inventory JSONB;
  v_streak INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Lazy lifecycle + weekly roll (bounded; cap-checked inside)
  PERFORM public.tick_event_lifecycle();
  PERFORM public.roll_weekly_events_for_user(v_user);

  -- Per-user active (weekly)
  WITH e AS (
    SELECT e.*, p.progress, p.target, p.status AS part_status, p.claimed_at
    FROM public.events e
    LEFT JOIN public.event_participation p
      ON p.event_id = e.id AND p.user_id = v_user
    WHERE e.user_id = v_user AND e.status = 'active' AND e.ends_at > now()
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY ends_at), '[]'::jsonb) INTO v_active FROM e;

  -- Seasonal (auto-listed even if not joined; opt-in)
  WITH s AS (
    SELECT e.*, p.progress, p.target, COALESCE(p.status::text,'not_joined') AS part_status, p.claimed_at
    FROM public.events e
    LEFT JOIN public.event_participation p
      ON p.event_id = e.id AND p.user_id = v_user
    WHERE e.user_id = v_user AND e.scope = 'seasonal'
      AND e.status = 'active' AND e.ends_at > now()
    UNION ALL
    -- Show available seasonal templates not yet instantiated for this user
    SELECT
      gen_random_uuid() AS id, t.id AS template_id, NULL::uuid AS user_id, 'seasonal'::event_scope AS scope,
      'upcoming'::event_status AS status, t.title, t.tagline, t.flavor, t.category, t.criteria, t.multiplier,
      3 AS difficulty, t.base_xp AS reward_xp, t.base_coins AS reward_coins, t.base_tokens AS reward_tokens,
      t.reward_item_ids,
      COALESCE((t.criteria->>'target')::int, 1) AS global_target, 0 AS global_progress,
      now() AS starts_at, now() + (t.duration_hours || ' hours')::interval AS ends_at,
      now() AS created_at, now() AS updated_at,
      0 AS progress, COALESCE((t.criteria->>'target')::int, 1) AS target,
      'not_joined'::text AS part_status, NULL::timestamptz AS claimed_at
    FROM public.event_templates t
    WHERE t.scope = 'seasonal' AND t.active
      AND NOT EXISTS (
        SELECT 1 FROM public.events e2
        WHERE e2.user_id = v_user AND e2.template_id = t.id AND e2.status = 'active'
      )
    LIMIT 3
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_seasonal FROM s;

  -- Global active
  WITH g AS (
    SELECT e.*, COALESCE(p.progress,0) AS progress, COALESCE(p.target,1) AS target,
           COALESCE(p.status::text,'active') AS part_status, p.claimed_at
    FROM public.events e
    LEFT JOIN public.event_participation p
      ON p.event_id = e.id AND p.user_id = v_user
    WHERE e.user_id IS NULL AND e.status = 'active' AND e.ends_at > now()
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY ends_at), '[]'::jsonb) INTO v_global FROM g;

  -- History (last 20)
  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.ended_at DESC), '[]'::jsonb) INTO v_history
  FROM (
    SELECT * FROM public.event_history WHERE user_id = v_user ORDER BY ended_at DESC LIMIT 20
  ) h;

  -- Inventory
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reward_id', i.reward_id, 'acquired_at', i.acquired_at,
    'name', r.name, 'description', r.description, 'icon', r.icon,
    'kind', r.kind, 'rarity', r.rarity, 'effect', r.effect
  ) ORDER BY i.acquired_at DESC), '[]'::jsonb) INTO v_inventory
  FROM public.user_event_inventory i
  JOIN public.event_rewards_catalog r ON r.id = i.reward_id
  WHERE i.user_id = v_user;

  -- Aggregate active multiplier (max across active events, weekly+seasonal+global)
  SELECT COALESCE(MAX(e.multiplier), 1.0) INTO v_streak FROM public.events e
   LEFT JOIN public.event_participation p ON p.event_id = e.id AND p.user_id = v_user
   WHERE e.status='active' AND e.ends_at > now()
     AND (e.user_id = v_user OR (e.user_id IS NULL AND COALESCE(p.status::text,'active') IN ('active','completed','claimed')));

  RETURN jsonb_build_object(
    'active', v_active,
    'seasonal', v_seasonal,
    'global', v_global,
    'history', v_history,
    'inventory', v_inventory,
    'aggregate_multiplier', COALESCE(v_streak, 1.0),
    'computed_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_event_dashboard() TO authenticated;

-- ============================================================================
-- REALTIME
-- ============================================================================
ALTER TABLE public.events             REPLICA IDENTITY FULL;
ALTER TABLE public.event_participation REPLICA IDENTITY FULL;

DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.events';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.event_participation';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
