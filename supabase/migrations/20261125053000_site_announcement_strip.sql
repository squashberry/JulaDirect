BEGIN;

CREATE TABLE public.site_announcement_bars (
  id smallint PRIMARY KEY DEFAULT 1 CONSTRAINT site_announcement_bars_singleton CHECK (id = 1),
  message text NOT NULL CHECK (length(btrim(message)) BETWEEN 1 AND 180),
  link_label text,
  link_url text,
  background_color text NOT NULL DEFAULT '#1451e6'
    CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color text NOT NULL DEFAULT '#ffffff'
    CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT site_announcement_bars_schedule_valid
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT site_announcement_bars_link_pair
    CHECK (
      (NULLIF(btrim(link_label), '') IS NULL AND NULLIF(btrim(link_url), '') IS NULL)
      OR
      (NULLIF(btrim(link_label), '') IS NOT NULL AND NULLIF(btrim(link_url), '') IS NOT NULL)
    ),
  CONSTRAINT site_announcement_bars_link_safe
    CHECK (link_url IS NULL OR link_url !~* '^\\s*(javascript|data|vbscript):')
);

ALTER TABLE public.site_announcement_bars ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.site_announcement_bars FROM anon, authenticated;
GRANT SELECT ON TABLE public.site_announcement_bars TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.site_announcement_bars TO authenticated;

DROP POLICY IF EXISTS site_announcement_bars_public_live_read ON public.site_announcement_bars;
CREATE POLICY site_announcement_bars_public_live_read
  ON public.site_announcement_bars
  FOR SELECT
  TO anon
  USING (
    is_active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

DROP POLICY IF EXISTS site_announcement_bars_authenticated_read ON public.site_announcement_bars;
CREATE POLICY site_announcement_bars_authenticated_read
  ON public.site_announcement_bars
  FOR SELECT
  TO authenticated
  USING (
    public.is_gambasket_admin()
    OR (
      is_active
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at > now())
    )
  );

DROP POLICY IF EXISTS site_announcement_bars_admin_insert ON public.site_announcement_bars;
CREATE POLICY site_announcement_bars_admin_insert
  ON public.site_announcement_bars
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_gambasket_admin());

DROP POLICY IF EXISTS site_announcement_bars_admin_update ON public.site_announcement_bars;
CREATE POLICY site_announcement_bars_admin_update
  ON public.site_announcement_bars
  FOR UPDATE
  TO authenticated
  USING (public.is_gambasket_admin())
  WITH CHECK (public.is_gambasket_admin());

DROP POLICY IF EXISTS site_announcement_bars_admin_delete ON public.site_announcement_bars;
CREATE POLICY site_announcement_bars_admin_delete
  ON public.site_announcement_bars
  FOR DELETE
  TO authenticated
  USING (public.is_gambasket_admin());

COMMIT;
