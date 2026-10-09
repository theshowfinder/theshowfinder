-- The safe-update protection used by this Supabase project rejects the
-- previous tautological id predicate. WHERE true keeps the intended
-- all-events reset explicit while remaining compatible with that protection.
CREATE OR REPLACE FUNCTION public.calculate_event_flags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  UPDATE public.events
  SET
    on_sale_this_week = false,
    presale_this_week = false,
    upcoming_presale  = false,
    newly_announced   = false
  WHERE true;

  UPDATE public.events
  SET on_sale_this_week = true
  WHERE public_onsale_start >= v_now
    AND public_onsale_start <= v_now + INTERVAL '7 days';

  UPDATE public.events
  SET presale_this_week = true
  WHERE presale_start >= v_now
    AND presale_start <= v_now + INTERVAL '7 days';

  UPDATE public.events
  SET upcoming_presale = true
  WHERE presale_start >= v_now
    AND presale_start <= v_now + INTERVAL '30 days';

  UPDATE public.events
  SET newly_announced = true
  WHERE created_at >= v_now - INTERVAL '7 days'
    AND public_onsale_start > v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_event_flags() TO service_role;
