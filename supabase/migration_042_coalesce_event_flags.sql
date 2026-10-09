-- Sale dates are optional. Coalesce each boolean expression so nullable date
-- fields never attempt to write NULL into the NOT NULL flag columns.
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
    on_sale_this_week = COALESCE(
      public_onsale_start >= v_now
      AND public_onsale_start <= v_now + INTERVAL '7 days', false
    ),
    presale_this_week = COALESCE(
      presale_start >= v_now
      AND presale_start <= v_now + INTERVAL '7 days', false
    ),
    upcoming_presale = COALESCE(
      presale_start >= v_now
      AND presale_start <= v_now + INTERVAL '30 days', false
    ),
    newly_announced = COALESCE(
      created_at >= v_now - INTERVAL '7 days'
      AND public_onsale_start > v_now, false
    )
  WHERE on_sale_this_week
     OR presale_this_week
     OR upcoming_presale
     OR newly_announced
     OR (public_onsale_start >= v_now AND public_onsale_start <= v_now + INTERVAL '7 days')
     OR (presale_start >= v_now AND presale_start <= v_now + INTERVAL '30 days')
     OR (created_at >= v_now - INTERVAL '7 days' AND public_onsale_start > v_now);
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_event_flags() TO service_role;
