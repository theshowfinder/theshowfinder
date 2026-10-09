-- Recalculate all sale flags in one targeted update. The earlier function ran
-- five full-table updates and could exceed Supabase's statement timeout.
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
    on_sale_this_week = (
      public_onsale_start >= v_now
      AND public_onsale_start <= v_now + INTERVAL '7 days'
    ),
    presale_this_week = (
      presale_start >= v_now
      AND presale_start <= v_now + INTERVAL '7 days'
    ),
    upcoming_presale = (
      presale_start >= v_now
      AND presale_start <= v_now + INTERVAL '30 days'
    ),
    newly_announced = (
      created_at >= v_now - INTERVAL '7 days'
      AND public_onsale_start > v_now
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
