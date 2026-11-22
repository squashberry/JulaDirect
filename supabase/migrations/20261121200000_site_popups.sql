-- Storefront popups and promo overlays, editable by admins.
-- Ten visual templates share one set of fields. Several popups can be live; the storefront
-- shows the highest-priority eligible one per page. Admins write through the RPCs below
-- (direct client writes are revoked), following the site_banners pattern. Images reuse the
-- admin-only `site-banners` storage bucket. Additive and idempotent.
BEGIN;

CREATE TABLE IF NOT EXISTS public.site_popups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  template text NOT NULL DEFAULT 'spotlight' CHECK (template IN ('spotlight','split','fullbleed','coupon','flash','sheet','corner','ribbon','story','burst')),
  is_active boolean NOT NULL DEFAULT false,
  kicker text CHECK (kicker IS NULL OR char_length(kicker) <= 40),
  headline text NOT NULL CHECK (char_length(btrim(headline)) BETWEEN 1 AND 90),
  body text CHECK (body IS NULL OR char_length(body) <= 240),
  badge text CHECK (badge IS NULL OR char_length(badge) <= 14),
  promo_code text CHECK (promo_code IS NULL OR promo_code ~ '^[A-Za-z0-9_-]{2,24}$'),
  cta_label text CHECK (cta_label IS NULL OR char_length(cta_label) <= 28),
  cta_url text CHECK (cta_url IS NULL OR (char_length(cta_url) <= 300 AND (cta_url ~ '^https://[^[:space:]]+$' OR cta_url ~ '^[A-Za-z0-9_./?=&#%-]+$'))),
  secondary_label text CHECK (secondary_label IS NULL OR char_length(secondary_label) <= 28),
  image_url text CHECK (image_url IS NULL OR (char_length(image_url) <= 600 AND image_url ~ '^https://[^[:space:]]+$')),
  accent_color text NOT NULL DEFAULT '#1451E6' CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  bg_color text NOT NULL DEFAULT '#FFFFFF' CHECK (bg_color ~ '^#[0-9A-Fa-f]{6}$'),
  countdown_to timestamptz,
  trigger_type text NOT NULL DEFAULT 'delay' CHECK (trigger_type IN ('load','delay','scroll','exit')),
  trigger_value integer NOT NULL DEFAULT 4 CHECK (trigger_value BETWEEN 0 AND 600),
  frequency text NOT NULL DEFAULT 'once_session' CHECK (frequency IN ('once_session','once_day','once_ever','always')),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','guests','members')),
  pages text[] NOT NULL DEFAULT ARRAY['home']::text[] CHECK (pages <@ ARRAY['all','home','explore','product','cart','wishlist','orders']::text[]),
  priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN -100 AND 100),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_popups_schedule_order CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

ALTER TABLE public.site_popups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.site_popups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.site_popups TO anon, authenticated;

DROP POLICY IF EXISTS site_popups_public_live_read ON public.site_popups;
CREATE POLICY site_popups_public_live_read ON public.site_popups
FOR SELECT TO anon, authenticated
USING (
  public.is_gambasket_admin()
  OR (is_active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now()))
);

CREATE OR REPLACE FUNCTION public.admin_save_site_popup(p_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text := nullif(btrim(p_payload->>'name'), '');
  v_head text := nullif(btrim(p_payload->>'headline'), '');
  v_pages text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_gambasket_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid popup payload' USING ERRCODE = '22023';
  END IF;
  IF v_name IS NULL OR v_head IS NULL THEN
    RAISE EXCEPTION 'A popup name and a headline are required' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(x), ARRAY['home']::text[]) INTO v_pages FROM jsonb_array_elements_text(coalesce(p_payload->'pages', '["home"]'::jsonb)) AS t(x);

  IF p_id IS NULL THEN
    INSERT INTO public.site_popups (
      name, template, kicker, headline, body, badge, promo_code, cta_label, cta_url, secondary_label, image_url,
      accent_color, bg_color, countdown_to, trigger_type, trigger_value, frequency, audience, pages, priority,
      starts_at, ends_at, created_by
    ) VALUES (
      v_name, coalesce(nullif(p_payload->>'template', ''), 'spotlight'), nullif(btrim(p_payload->>'kicker'), ''), v_head,
      nullif(btrim(p_payload->>'body'), ''), nullif(btrim(p_payload->>'badge'), ''), nullif(btrim(p_payload->>'promo_code'), ''),
      nullif(btrim(p_payload->>'cta_label'), ''), nullif(btrim(p_payload->>'cta_url'), ''), nullif(btrim(p_payload->>'secondary_label'), ''),
      nullif(btrim(p_payload->>'image_url'), ''), coalesce(nullif(p_payload->>'accent_color', ''), '#1451E6'), coalesce(nullif(p_payload->>'bg_color', ''), '#FFFFFF'),
      nullif(p_payload->>'countdown_to', '')::timestamptz, coalesce(nullif(p_payload->>'trigger_type', ''), 'delay'), coalesce(nullif(p_payload->>'trigger_value', '')::int, 4),
      coalesce(nullif(p_payload->>'frequency', ''), 'once_session'), coalesce(nullif(p_payload->>'audience', ''), 'all'), v_pages, coalesce(nullif(p_payload->>'priority', '')::int, 0),
      nullif(p_payload->>'starts_at', '')::timestamptz, nullif(p_payload->>'ends_at', '')::timestamptz, auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.site_popups SET
      name = v_name, template = coalesce(nullif(p_payload->>'template', ''), 'spotlight'), kicker = nullif(btrim(p_payload->>'kicker'), ''), headline = v_head,
      body = nullif(btrim(p_payload->>'body'), ''), badge = nullif(btrim(p_payload->>'badge'), ''), promo_code = nullif(btrim(p_payload->>'promo_code'), ''),
      cta_label = nullif(btrim(p_payload->>'cta_label'), ''), cta_url = nullif(btrim(p_payload->>'cta_url'), ''), secondary_label = nullif(btrim(p_payload->>'secondary_label'), ''),
      image_url = nullif(btrim(p_payload->>'image_url'), ''), accent_color = coalesce(nullif(p_payload->>'accent_color', ''), '#1451E6'), bg_color = coalesce(nullif(p_payload->>'bg_color', ''), '#FFFFFF'),
      countdown_to = nullif(p_payload->>'countdown_to', '')::timestamptz, trigger_type = coalesce(nullif(p_payload->>'trigger_type', ''), 'delay'), trigger_value = coalesce(nullif(p_payload->>'trigger_value', '')::int, 4),
      frequency = coalesce(nullif(p_payload->>'frequency', ''), 'once_session'), audience = coalesce(nullif(p_payload->>'audience', ''), 'all'), pages = v_pages, priority = coalesce(nullif(p_payload->>'priority', '')::int, 0),
      starts_at = nullif(p_payload->>'starts_at', '')::timestamptz, ends_at = nullif(p_payload->>'ends_at', '')::timestamptz, updated_at = now()
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Popup not found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_site_popup_active(p_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_gambasket_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.site_popups SET is_active = coalesce(p_active, false), updated_at = now() WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Popup not found' USING ERRCODE = 'P0002'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_site_popup(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_gambasket_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.site_popups WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_site_popup(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_site_popup_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_site_popup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_site_popup(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_site_popup_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_site_popup(uuid) TO authenticated;

COMMIT;
