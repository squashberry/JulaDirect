-- Restrict new delivery orders to the service areas linked from the JulaDirect homepage.
-- Pickup-station orders are stored as pickup and are not subject to delivery-zone checks.

BEGIN;

CREATE OR REPLACE FUNCTION public.gambasket_guard_delivery_area()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_region text := lower(trim(COALESCE(NEW.delivery_region, '')));
  v_area text := lower(trim(COALESCE(NEW.delivery_area, '')));
BEGIN
  IF NEW.fulfillment_type = 'delivery' THEN
    IF v_region = 'greater banjul area'
       AND v_area IN ('banjul', 'serrekunda', 'bakau', 'kololi', 'fajara') THEN
      RETURN NEW;
    END IF;

    IF v_region = 'west coast region'
       AND v_area = 'brikama' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'DELIVERY_AREA_UNAVAILABLE: JulaDirect currently delivers only to Banjul, Serrekunda, Bakau, Kololi, Fajara and Brikama. Choose a listed area.';
  END IF;

  RETURN NEW;
END;
$fn$;

ALTER FUNCTION public.gambasket_guard_delivery_area() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.gambasket_guard_delivery_area()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_enforce_homepage_delivery_areas ON public.orders;
CREATE TRIGGER orders_enforce_homepage_delivery_areas
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.gambasket_guard_delivery_area();

COMMIT;
