BEGIN;
ALTER TABLE public.site_announcement_bars
  DROP CONSTRAINT IF EXISTS site_announcement_bars_link_safe;
ALTER TABLE public.site_announcement_bars
  ADD CONSTRAINT site_announcement_bars_link_safe
  CHECK (
    link_url IS NULL
    OR (
      lower(btrim(link_url)) NOT LIKE 'javascript:%'
      AND lower(btrim(link_url)) NOT LIKE 'data:%'
      AND lower(btrim(link_url)) NOT LIKE 'vbscript:%'
    )
  );
COMMIT;
