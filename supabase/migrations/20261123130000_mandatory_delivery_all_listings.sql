-- Delivery is mandatory on every JulaDirect listing.
-- Keep the legacy column for compatibility, but force it true on every write.
BEGIN;
ALTER TABLE public.products ALTER COLUMN delivery_available SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.force_product_delivery_available()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $fn$
BEGIN
  NEW.delivery_available := true;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.force_product_delivery_available()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_force_delivery_available ON public.products;
CREATE TRIGGER a_force_delivery_available
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.force_product_delivery_available();

-- Backfill existing listings without running the seller-write guard or sending
-- saved-search notifications for this platform-wide policy correction.
ALTER TABLE public.products DISABLE TRIGGER trg_guard_product_write;
ALTER TABLE public.products DISABLE TRIGGER trg_notify_saved_search_matches_update;
UPDATE public.products SET delivery_available = true
WHERE delivery_available IS DISTINCT FROM true;
ALTER TABLE public.products ENABLE TRIGGER trg_notify_saved_search_matches_update;
ALTER TABLE public.products ENABLE TRIGGER trg_guard_product_write;

COMMENT ON COLUMN public.products.delivery_available IS
  'Legacy compatibility flag. Delivery is mandatory for every JulaDirect listing; new writes are forced true.';
COMMIT;
