-- 1. Schema changes
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS subtype TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS activity_date DATE NOT NULL DEFAULT CURRENT_DATE;

UPDATE public.activities SET activity_date = created_at::date;

-- 2. Drop activities referencing types we're removing (frees the FK)
DELETE FROM public.activities
WHERE type_id NOT IN ('workout','study','public_speaking','cardio','socializing','meditation');

-- 3. Upsert new catalog (preserve types still referenced)
INSERT INTO public.activity_types (id, label, icon, stat, xp, description) VALUES
  ('workout',          'Workout',         'Dumbbell',   'strength',     50, 'Gym, yoga or home training'),
  ('study',            'Study',           'BookOpen',   'intelligence', 50, 'Deep work or general study'),
  ('public_speaking',  'Public Speaking', 'Mic',        'charisma',     50, 'Practice or live speaking'),
  ('cardio',           'Cardio',          'Footprints', 'strength',     50, 'Jog, run or HIIT'),
  ('socializing',      'Socializing',     'Users',      'charisma',     35, 'Casual, deep or networking'),
  ('meditation',       'Meditation',      'Sparkles',   'discipline',   30, 'Center your mind')
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  stat = EXCLUDED.stat,
  xp = EXCLUDED.xp,
  description = EXCLUDED.description;

-- Remove any catalog entries not in the new structured set
DELETE FROM public.activity_types
WHERE id NOT IN ('workout','study','public_speaking','cardio','socializing','meditation');

-- 4. Dedupe same-day duplicates so the unique index can be created
DELETE FROM public.activities a
USING public.activities b
WHERE a.user_id = b.user_id
  AND a.type_id = b.type_id
  AND COALESCE(a.subtype,'') = COALESCE(b.subtype,'')
  AND a.activity_date = b.activity_date
  AND a.ctid > b.ctid;

-- 5. Anti-exploit unique index
CREATE UNIQUE INDEX IF NOT EXISTS activities_user_type_subtype_date_uniq
  ON public.activities (user_id, type_id, COALESCE(subtype, ''), activity_date);

-- 6. XP calculator
CREATE OR REPLACE FUNCTION public.compute_activity_xp(
  p_type TEXT, p_subtype TEXT, p_duration INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE d INTEGER := COALESCE(p_duration, 0);
BEGIN
  IF p_type = 'workout' THEN
    IF d >= 60 THEN RETURN 50; ELSIF d >= 45 THEN RETURN 40;
    ELSIF d >= 30 THEN RETURN 25; ELSIF d >= 10 THEN RETURN 10;
    ELSE RETURN 0; END IF;
  ELSIF p_type = 'study' THEN
    IF d >= 60 THEN RETURN 50; ELSIF d >= 30 THEN RETURN 25;
    ELSIF d >= 10 THEN RETURN 10; ELSE RETURN 0; END IF;
  ELSIF p_type = 'public_speaking' THEN
    IF d >= 60 THEN RETURN 50; ELSIF d >= 30 THEN RETURN 30;
    ELSIF d >= 10 THEN RETURN 15; ELSE RETURN 0; END IF;
  ELSIF p_type = 'cardio' THEN
    IF d >= 45 THEN RETURN 50; ELSIF d >= 30 THEN RETURN 30;
    ELSIF d >= 10 THEN RETURN 10; ELSE RETURN 0; END IF;
  ELSIF p_type = 'socializing' THEN
    IF d >= 60 THEN RETURN 35; ELSIF d >= 30 THEN RETURN 20;
    ELSIF d >= 10 THEN RETURN 8; ELSE RETURN 0; END IF;
  ELSIF p_type = 'meditation' THEN
    IF d >= 30 THEN RETURN 30; ELSIF d >= 20 THEN RETURN 20;
    ELSIF d >= 10 THEN RETURN 10; ELSE RETURN 0; END IF;
  END IF;
  RETURN 0;
END; $$;

-- 7. Secure log_activity RPC
CREATE OR REPLACE FUNCTION public.log_activity(
  p_type TEXT, p_subtype TEXT, p_duration INTEGER, p_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_xp INTEGER;
  v_existing UUID;
  v_row public.activities;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activity_types WHERE id = p_type) THEN
    RAISE EXCEPTION 'invalid_activity_type';
  END IF;
  v_xp := public.compute_activity_xp(p_type, p_subtype, p_duration);
  IF v_xp <= 0 THEN RAISE EXCEPTION 'invalid_duration'; END IF;

  SELECT id INTO v_existing FROM public.activities
  WHERE user_id = v_user AND type_id = p_type
    AND COALESCE(subtype,'') = COALESCE(p_subtype,'')
    AND activity_date = CURRENT_DATE
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed_today');
  END IF;

  INSERT INTO public.activities (user_id, type_id, subtype, duration_minutes, xp_gained, note, activity_date)
  VALUES (v_user, p_type, NULLIF(p_subtype,''), p_duration, v_xp, NULLIF(p_note,''), CURRENT_DATE)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'activity', to_jsonb(v_row), 'xp_gained', v_xp);
END; $$;

GRANT EXECUTE ON FUNCTION public.log_activity(TEXT, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_activity_xp(TEXT, TEXT, INTEGER) TO authenticated, anon;