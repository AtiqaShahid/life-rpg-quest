CREATE OR REPLACE FUNCTION public._clamp_fatigue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.exhaustion := GREATEST(0, LEAST(100, COALESCE(NEW.exhaustion, 0)));
  RETURN NEW;
END;
$$;