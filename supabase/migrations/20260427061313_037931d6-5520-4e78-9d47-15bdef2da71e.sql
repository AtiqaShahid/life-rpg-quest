
-- =========================================
-- Phase 1: profile economy + behavior fields
-- =========================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fatigue INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fatigue_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Clamp fatigue 0..100
CREATE OR REPLACE FUNCTION public._clamp_fatigue() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.fatigue := GREATEST(0, LEAST(100, COALESCE(NEW.fatigue, 0)));
  IF NEW.coins < 0 THEN NEW.coins := 0; END IF;
  IF NEW.tokens < 0 THEN NEW.tokens := 0; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS clamp_profile_economy ON public.profiles;
CREATE TRIGGER clamp_profile_economy
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._clamp_fatigue();

-- =========================================
-- Phase 2: shop catalog
-- =========================================
CREATE TABLE IF NOT EXISTS public.shop_items (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('boost','protection','recovery')),
  effect_kind   TEXT NOT NULL CHECK (effect_kind IN (
                  'xp_multiplier','streak_shield','fatigue_clear','streak_freeze','recovery_card'
                )),
  effect_value  NUMERIC NOT NULL DEFAULT 1.0,   -- e.g. 1.10 for +10%
  duration_min  INTEGER,                         -- NULL = instant / passive consumable
  cost          INTEGER NOT NULL,
  currency      TEXT NOT NULL CHECK (currency IN ('coins','tokens')),
  cooldown_min  INTEGER NOT NULL DEFAULT 0,
  icon          TEXT NOT NULL DEFAULT '✨',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop items readable by everyone" ON public.shop_items;
CREATE POLICY "Shop items readable by everyone" ON public.shop_items
  FOR SELECT USING (true);

-- Seed catalog (idempotent)
INSERT INTO public.shop_items (id, name, description, category, effect_kind, effect_value, duration_min, cost, currency, cooldown_min, icon, sort_order)
VALUES
  ('focus_potion',   'Focus Potion',   '+10% XP gain for 2 hours.',                'boost',      'xp_multiplier', 1.10, 120, 80,  'coins',  60,  '🧪', 10),
  ('double_xp',      'Double XP Boost','x2 XP gain for 30 minutes.',               'boost',      'xp_multiplier', 2.00, 30,  3,   'tokens', 240, '⚡', 20),
  ('streak_shield',  'Streak Shield',  'Prevents your streak from breaking once.', 'protection', 'streak_shield', 1.00, NULL, 150, 'coins',  0,   '🛡️', 30),
  ('recovery_card',  'Recovery Card',  'Negates the penalty from one missed day.', 'protection', 'recovery_card', 1.00, NULL, 200, 'coins',  0,   '🪄', 40),
  ('burnout_reset',  'Burnout Reset',  'Clears your fatigue state immediately.',   'recovery',   'fatigue_clear', 1.00, NULL, 2,   'tokens', 360, '💆', 50),
  ('time_freeze',    'Time Freeze Token','Pauses streak decay for 24 hours.',      'protection', 'streak_freeze', 1.00, 1440, 5,   'tokens', 0,   '⏳', 60)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
  effect_kind = EXCLUDED.effect_kind, effect_value = EXCLUDED.effect_value,
  duration_min = EXCLUDED.duration_min, cost = EXCLUDED.cost, currency = EXCLUDED.currency,
  cooldown_min = EXCLUDED.cooldown_min, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

-- =========================================
-- Phase 3: inventory
-- =========================================
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  item_id     TEXT NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);

ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inventory viewable by owner" ON public.user_inventory;
CREATE POLICY "Inventory viewable by owner" ON public.user_inventory
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Inventory insertable by owner" ON public.user_inventory;
CREATE POLICY "Inventory insertable by owner" ON public.user_inventory
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Inventory updatable by owner" ON public.user_inventory;
CREATE POLICY "Inventory updatable by owner" ON public.user_inventory
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_inventory_user ON public.user_inventory(user_id);

-- =========================================
-- Phase 4: active effects
-- =========================================
CREATE TABLE IF NOT EXISTS public.active_effects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  item_id     TEXT NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  effect_kind TEXT NOT NULL,
  effect_value NUMERIC NOT NULL DEFAULT 1.0,
  expires_at  TIMESTAMPTZ,           -- NULL = until consumed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.active_effects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Effects viewable by owner" ON public.active_effects;
CREATE POLICY "Effects viewable by owner" ON public.active_effects
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Effects insertable by owner" ON public.active_effects;
CREATE POLICY "Effects insertable by owner" ON public.active_effects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Effects deletable by owner" ON public.active_effects;
CREATE POLICY "Effects deletable by owner" ON public.active_effects
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_active_effects_user ON public.active_effects(user_id, expires_at);

-- =========================================
-- Phase 5: activity repeats (diminishing returns)
-- =========================================
CREATE TABLE IF NOT EXISTS public.activity_repeats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  type_id     TEXT NOT NULL,
  subtype     TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_repeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Repeats viewable by owner" ON public.activity_repeats;
CREATE POLICY "Repeats viewable by owner" ON public.activity_repeats
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Repeats insertable by owner" ON public.activity_repeats;
CREATE POLICY "Repeats insertable by owner" ON public.activity_repeats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_activity_repeats_lookup
  ON public.activity_repeats(user_id, type_id, subtype, occurred_at DESC);

-- =========================================
-- Phase 6: helper functions
-- =========================================

-- Diminishing-returns multiplier for repeated tasks (gentle curve)
-- 7-day rolling window. 1st=1.0, 2nd=0.85, 3rd=0.70, 4th=0.55, 5th+=0.40
CREATE OR REPLACE FUNCTION public.get_repeat_multiplier(p_user UUID, p_type TEXT, p_subtype TEXT)
RETURNS NUMERIC LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.activity_repeats
  WHERE user_id = p_user
    AND type_id = p_type
    AND COALESCE(subtype,'') = COALESCE(p_subtype,'')
    AND occurred_at >= now() - INTERVAL '7 days';

  RETURN CASE
    WHEN v_count = 0 THEN 1.00
    WHEN v_count = 1 THEN 0.85
    WHEN v_count = 2 THEN 0.70
    WHEN v_count = 3 THEN 0.55
    ELSE 0.40
  END;
END $$;

-- Active XP multiplier from boost items
CREATE OR REPLACE FUNCTION public.get_active_xp_multiplier(p_user UUID)
RETURNS NUMERIC LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_mult NUMERIC := 1.0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT effect_value FROM public.active_effects
    WHERE user_id = p_user
      AND effect_kind = 'xp_multiplier'
      AND (expires_at IS NULL OR expires_at > now())
  LOOP
    v_mult := v_mult * rec.effect_value;
  END LOOP;
  RETURN LEAST(3.0, v_mult); -- hard cap so stacking can't go wild
END $$;

-- Fatigue penalty: 1.0 when fresh, 0.5 when fully fatigued
CREATE OR REPLACE FUNCTION public.get_fatigue_multiplier(p_fatigue INT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(0.5, 1.0 - (GREATEST(0, LEAST(100, p_fatigue))::numeric / 200));
$$;

-- =========================================
-- Phase 7: log_activity v2 (diminishing + coins + fatigue + boosts)
-- =========================================
CREATE OR REPLACE FUNCTION public.log_activity(p_type text, p_subtype text, p_duration integer, p_note text DEFAULT NULL::text, p_difficulty text DEFAULT 'medium'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_base INTEGER;
  v_existing UUID;
  v_row public.activities;

  v_level INTEGER;
  v_xp_now INTEGER;
  v_skill_points INTEGER;
  v_coins_now INTEGER;
  v_fatigue INTEGER;
  v_streak_current INTEGER;
  v_streak_last DATE;

  v_diff NUMERIC;
  v_streak_mult NUMERIC;
  v_streak_skill_bonus NUMERIC;
  v_time_bonus NUMERIC;
  v_stat_mult NUMERIC;
  v_diminish NUMERIC := 1.0;
  v_repeat_mult NUMERIC;
  v_boost_mult NUMERIC;
  v_fatigue_mult NUMERIC;
  v_fatigue_added INT;

  v_final_xp INTEGER;
  v_coins_earned INTEGER;
  v_breakdown JSONB;

  v_hour INTEGER := EXTRACT(HOUR FROM now())::int;
  v_carry INTEGER;
  v_levels_gained INTEGER := 0;
  v_threshold INTEGER;
  v_new_level INTEGER;
  v_new_xp INTEGER;
  v_difficulty_enum public.activity_difficulty;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activity_types WHERE id = p_type) THEN
    RAISE EXCEPTION 'invalid_activity_type';
  END IF;

  v_base := public.compute_activity_xp(p_type, p_subtype, p_duration);
  IF v_base <= 0 THEN RAISE EXCEPTION 'invalid_duration'; END IF;

  SELECT id INTO v_existing FROM public.activities
  WHERE user_id = v_user AND type_id = p_type
    AND COALESCE(subtype,'') = COALESCE(p_subtype,'')
    AND activity_date = CURRENT_DATE
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed_today');
  END IF;

  v_difficulty_enum := COALESCE(NULLIF(p_difficulty,'')::public.activity_difficulty, 'medium'::public.activity_difficulty);

  SELECT level, xp, skill_points, coins, fatigue
    INTO v_level, v_xp_now, v_skill_points, v_coins_now, v_fatigue
    FROM public.profiles WHERE user_id = v_user;
  SELECT current_streak, last_active_date INTO v_streak_current, v_streak_last
    FROM public.streaks WHERE user_id = v_user;

  v_diff := CASE v_difficulty_enum WHEN 'easy' THEN 1.0 WHEN 'medium' THEN 1.5 WHEN 'hard' THEN 2.0 END;

  DECLARE v_proj_streak INTEGER;
  BEGIN
    IF v_streak_last = CURRENT_DATE THEN v_proj_streak := COALESCE(v_streak_current, 1);
    ELSIF v_streak_last = CURRENT_DATE - 1 THEN v_proj_streak := COALESCE(v_streak_current, 0) + 1;
    ELSE v_proj_streak := 1; END IF;
    v_streak_skill_bonus := public.get_streak_skill_bonus(v_user);
    v_streak_mult := LEAST(2.0, 1.0 + (GREATEST(v_proj_streak,1) - 1) * (0.1 + v_streak_skill_bonus));
  END;

  IF v_hour >= 5 AND v_hour < 10 THEN v_time_bonus := 1.20;
  ELSIF v_hour >= 22 OR v_hour < 2 THEN v_time_bonus := 1.10;
  ELSE v_time_bonus := 1.0; END IF;

  v_stat_mult := public.get_stat_xp_multiplier(v_user, p_type);
  IF v_level > 10 THEN v_diminish := GREATEST(0.5, 1.0 - (v_level - 10) * 0.01); END IF;

  v_repeat_mult  := public.get_repeat_multiplier(v_user, p_type, p_subtype);
  v_boost_mult   := public.get_active_xp_multiplier(v_user);
  v_fatigue_mult := public.get_fatigue_multiplier(v_fatigue);

  v_final_xp := GREATEST(1, ROUND(
    v_base * v_diff * v_streak_mult * v_time_bonus * v_stat_mult * v_diminish
          * v_repeat_mult * v_boost_mult * v_fatigue_mult
  ));
  v_coins_earned := GREATEST(1, FLOOR(v_final_xp::numeric / 10)::int);

  -- Fatigue accrual: hard tasks add 12, medium 6, easy 2; cap at 100.
  v_fatigue_added := CASE v_difficulty_enum WHEN 'hard' THEN 12 WHEN 'medium' THEN 6 ELSE 2 END;

  v_breakdown := jsonb_build_object(
    'base', v_base, 'difficulty', v_diff,
    'streak', v_streak_mult, 'streak_days_projected', GREATEST(1, v_proj_streak),
    'time_of_day', v_time_bonus, 'stat', v_stat_mult, 'diminish', v_diminish,
    'repeat', v_repeat_mult, 'boost', v_boost_mult, 'fatigue', v_fatigue_mult,
    'final', v_final_xp, 'coins', v_coins_earned
  );

  INSERT INTO public.activities
    (user_id, type_id, subtype, duration_minutes, xp_gained, base_xp, difficulty, multiplier_breakdown, note, activity_date)
  VALUES
    (v_user, p_type, NULLIF(p_subtype,''), p_duration, v_final_xp, v_base, v_difficulty_enum, v_breakdown, NULLIF(p_note,''), CURRENT_DATE)
  RETURNING * INTO v_row;

  -- Track repeat for diminishing returns
  INSERT INTO public.activity_repeats (user_id, type_id, subtype) VALUES (v_user, p_type, COALESCE(p_subtype,''));

  -- Level math
  v_new_level := v_level;
  v_new_xp := v_xp_now + v_final_xp;
  LOOP
    v_threshold := FLOOR(100 * POWER(v_new_level, 1.5))::int;
    EXIT WHEN v_new_xp < v_threshold;
    v_new_xp := v_new_xp - v_threshold;
    v_new_level := v_new_level + 1;
    v_levels_gained := v_levels_gained + 1;
  END LOOP;

  UPDATE public.profiles
    SET level = v_new_level,
        xp = v_new_xp,
        skill_points = v_skill_points + (v_levels_gained * 3),
        coins = v_coins_now + v_coins_earned,
        fatigue = LEAST(100, COALESCE(v_fatigue,0) + v_fatigue_added),
        fatigue_updated_at = now(),
        updated_at = now()
    WHERE user_id = v_user;

  -- Streak update with optional shield protection
  IF v_streak_last IS DISTINCT FROM CURRENT_DATE THEN
    UPDATE public.streaks
      SET current_streak = CASE
            WHEN v_streak_last = CURRENT_DATE - 1 THEN COALESCE(current_streak,0) + 1
            ELSE 1
          END,
          longest_streak = GREATEST(longest_streak, CASE
            WHEN v_streak_last = CURRENT_DATE - 1 THEN COALESCE(current_streak,0) + 1
            ELSE 1
          END),
          last_active_date = CURRENT_DATE,
          updated_at = now()
      WHERE user_id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'activity', to_jsonb(v_row),
    'xp_gained', v_final_xp,
    'coins_gained', v_coins_earned,
    'breakdown', v_breakdown,
    'levels_gained', v_levels_gained,
    'new_level', v_new_level,
    'new_xp', v_new_xp,
    'skill_points_awarded', v_levels_gained * 3,
    'fatigue', LEAST(100, COALESCE(v_fatigue,0) + v_fatigue_added)
  );
END; $function$;

-- =========================================
-- Phase 8: complete_quest v2 (coins + tokens)
-- =========================================
CREATE OR REPLACE FUNCTION public.complete_quest(p_quest_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_quest public.quests;
  v_xp_calc jsonb;
  v_xp INTEGER;
  v_coins INTEGER;
  v_tokens INTEGER := 0;
  v_level INTEGER; v_xp_now INTEGER; v_skill_points INTEGER;
  v_new_level INTEGER; v_new_xp INTEGER; v_threshold INTEGER; v_levels_gained INTEGER := 0;
  v_stat TEXT;
  v_boost_mult NUMERIC;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id AND user_id = v_user;
  IF v_quest.id IS NULL THEN RAISE EXCEPTION 'quest_not_found'; END IF;
  IF v_quest.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed');
  END IF;
  IF v_quest.status NOT IN ('active','locked') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_completable');
  END IF;

  v_xp_calc := public.compute_quest_xp(v_user, v_quest.difficulty, v_quest.quest_type);
  v_boost_mult := public.get_active_xp_multiplier(v_user);
  v_xp := GREATEST(1, ROUND((v_xp_calc->>'final')::int * v_boost_mult));

  -- Currency rewards (XP-tied + bonuses for rarer quest types)
  v_coins := GREATEST(1, FLOOR(v_xp::numeric / 8)::int);
  IF v_quest.quest_type = 'weekly' THEN v_tokens := 1;
  ELSIF v_quest.quest_type = 'epic' THEN v_tokens := 3;
  END IF;

  UPDATE public.quests
    SET status = 'completed', completed = true, completed_at = now(), reward_xp = v_xp
    WHERE id = p_quest_id;

  SELECT level, xp, skill_points INTO v_level, v_xp_now, v_skill_points
    FROM public.profiles WHERE user_id = v_user;
  v_new_level := v_level;
  v_new_xp := v_xp_now + v_xp;
  LOOP
    v_threshold := FLOOR(100 * POWER(v_new_level, 1.5))::int;
    EXIT WHEN v_new_xp < v_threshold;
    v_new_xp := v_new_xp - v_threshold;
    v_new_level := v_new_level + 1;
    v_levels_gained := v_levels_gained + 1;
  END LOOP;

  UPDATE public.profiles
    SET level = v_new_level, xp = v_new_xp,
        skill_points = v_skill_points + (v_levels_gained * 3),
        coins = coins + v_coins,
        tokens = tokens + v_tokens,
        updated_at = now()
    WHERE user_id = v_user;

  IF array_length(v_quest.linked_stats, 1) IS NOT NULL THEN
    FOREACH v_stat IN ARRAY v_quest.linked_stats LOOP
      IF v_stat IN ('intelligence','strength','discipline','charisma') THEN
        EXECUTE format('UPDATE public.stats SET %I = %I + 1, updated_at = now() WHERE user_id = $1', v_stat, v_stat)
          USING v_user;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'xp_gained', v_xp, 'coins_gained', v_coins, 'tokens_gained', v_tokens,
    'breakdown', v_xp_calc, 'levels_gained', v_levels_gained, 'new_level', v_new_level,
    'new_xp', v_new_xp, 'skill_points_awarded', v_levels_gained * 3
  );
END; $function$;

-- =========================================
-- Phase 9: shop functions
-- =========================================
CREATE OR REPLACE FUNCTION public.purchase_shop_item(p_item_id text, p_quantity int DEFAULT 1)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user UUID := auth.uid();
  v_item public.shop_items;
  v_total_cost INT;
  v_balance INT;
  v_qty INT := GREATEST(1, COALESCE(p_quantity, 1));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item_id AND active = TRUE;
  IF v_item.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_item'); END IF;
  v_total_cost := v_item.cost * v_qty;

  IF v_item.currency = 'coins' THEN
    SELECT coins INTO v_balance FROM public.profiles WHERE user_id = v_user;
    IF COALESCE(v_balance, 0) < v_total_cost THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_coins');
    END IF;
    UPDATE public.profiles SET coins = coins - v_total_cost, updated_at = now() WHERE user_id = v_user;
  ELSE
    SELECT tokens INTO v_balance FROM public.profiles WHERE user_id = v_user;
    IF COALESCE(v_balance, 0) < v_total_cost THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_tokens');
    END IF;
    UPDATE public.profiles SET tokens = tokens - v_total_cost, updated_at = now() WHERE user_id = v_user;
  END IF;

  INSERT INTO public.user_inventory (user_id, item_id, quantity)
  VALUES (v_user, v_item.id, v_qty)
  ON CONFLICT (user_id, item_id) DO UPDATE
    SET quantity = public.user_inventory.quantity + EXCLUDED.quantity,
        updated_at = now();

  RETURN jsonb_build_object('ok', true, 'item_id', v_item.id, 'quantity_added', v_qty, 'spent', v_total_cost, 'currency', v_item.currency);
END $$;

CREATE OR REPLACE FUNCTION public.use_inventory_item(p_item_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user UUID := auth.uid();
  v_item public.shop_items;
  v_inv public.user_inventory;
  v_expires TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item_id AND active = TRUE;
  IF v_item.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_item'); END IF;

  SELECT * INTO v_inv FROM public.user_inventory WHERE user_id = v_user AND item_id = p_item_id;
  IF v_inv.id IS NULL OR v_inv.quantity < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_inventory');
  END IF;

  IF v_item.cooldown_min > 0 AND v_inv.last_used_at IS NOT NULL
     AND v_inv.last_used_at > now() - (v_item.cooldown_min || ' minutes')::interval THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'on_cooldown',
      'available_at', v_inv.last_used_at + (v_item.cooldown_min || ' minutes')::interval);
  END IF;

  -- Apply effect
  IF v_item.effect_kind = 'fatigue_clear' THEN
    UPDATE public.profiles SET fatigue = 0, fatigue_updated_at = now(), updated_at = now()
      WHERE user_id = v_user;
  ELSE
    v_expires := CASE WHEN v_item.duration_min IS NOT NULL
                      THEN now() + (v_item.duration_min || ' minutes')::interval
                      ELSE NULL END;
    -- Replace any existing same-kind effect (no stacking same item)
    DELETE FROM public.active_effects WHERE user_id = v_user AND item_id = v_item.id;
    INSERT INTO public.active_effects (user_id, item_id, effect_kind, effect_value, expires_at)
    VALUES (v_user, v_item.id, v_item.effect_kind, v_item.effect_value, v_expires);
  END IF;

  UPDATE public.user_inventory
    SET quantity = quantity - 1, last_used_at = now(), updated_at = now()
    WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'effect_kind', v_item.effect_kind, 'expires_at', v_expires);
END $$;

CREATE OR REPLACE FUNCTION public.expire_active_effects()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user UUID := auth.uid();
  v_removed INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  WITH del AS (
    DELETE FROM public.active_effects
     WHERE user_id = v_user AND expires_at IS NOT NULL AND expires_at <= now()
     RETURNING 1
  ) SELECT COUNT(*) INTO v_removed FROM del;
  RETURN jsonb_build_object('ok', true, 'removed', v_removed);
END $$;

-- Slow fatigue recovery (1 point per 10 minutes since last update)
CREATE OR REPLACE FUNCTION public.recover_fatigue()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user UUID := auth.uid();
  v_fatigue INT;
  v_last TIMESTAMPTZ;
  v_minutes INT;
  v_recovered INT;
  v_new INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT fatigue, fatigue_updated_at INTO v_fatigue, v_last
    FROM public.profiles WHERE user_id = v_user;
  v_minutes := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_last))::int / 60);
  v_recovered := v_minutes / 10;
  IF v_recovered <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'fatigue', v_fatigue);
  END IF;
  v_new := GREATEST(0, COALESCE(v_fatigue,0) - v_recovered);
  UPDATE public.profiles SET fatigue = v_new, fatigue_updated_at = now(), updated_at = now()
    WHERE user_id = v_user;
  RETURN jsonb_build_object('ok', true, 'fatigue', v_new, 'recovered', v_recovered);
END $$;
