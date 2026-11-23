-- Public lookup of a seller's published SquashberryPro website.
-- Only the published site name and public URL are exposed to anonymous visitors.
CREATE OR REPLACE FUNCTION public.public_store_website(p_seller uuid)
RETURNS TABLE (site_name text, public_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT s.site_name::text, s.public_url::text
  FROM public.juladirect_store_sites AS s
  WHERE s.seller_user_id = p_seller
    AND s.is_published = true
    AND s.public_url ~ '^https://squashberrypro[.]pages[.]dev(/|$)'
  ORDER BY s.updated_at DESC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.public_store_website(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_store_website(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_store_website(uuid) TO anon, authenticated;

-- Seller follows are private relationship rows. Public clients only receive
-- an aggregate count and their own boolean following state through RPCs.
CREATE TABLE IF NOT EXISTS public.seller_follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_follows_pkey PRIMARY KEY (follower_id, seller_id),
  CONSTRAINT seller_follows_no_self CHECK (follower_id <> seller_id)
);

CREATE INDEX IF NOT EXISTS seller_follows_seller_created_idx
  ON public.seller_follows (seller_id, created_at DESC);

ALTER TABLE public.seller_follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.seller_follows FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.seller_follow_summary(p_seller uuid)
RETURNS TABLE (follower_count bigint, following boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    count(*)::bigint,
    coalesce(bool_or(sf.follower_id = (SELECT auth.uid())), false)
  FROM public.seller_follows AS sf
  WHERE sf.seller_id = p_seller;
$function$;

REVOKE ALL ON FUNCTION public.seller_follow_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_follow_summary(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_seller_follow(p_seller uuid, p_follow boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_count bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_seller IS NULL OR p_seller = v_user THEN
    RAISE EXCEPTION 'Invalid seller';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_seller
      AND ur.role_id = 'seller'
      AND ur.is_active = true
  ) THEN
    RAISE EXCEPTION 'Seller not found';
  END IF;

  IF coalesce(p_follow, false) THEN
    INSERT INTO public.seller_follows (follower_id, seller_id)
    VALUES (v_user, p_seller)
    ON CONFLICT (follower_id, seller_id) DO NOTHING;
  ELSE
    DELETE FROM public.seller_follows
    WHERE follower_id = v_user
      AND seller_id = p_seller;
  END IF;

  SELECT count(*)::bigint INTO v_count
  FROM public.seller_follows
  WHERE seller_id = p_seller;

  RETURN jsonb_build_object(
    'seller_id', p_seller,
    'following', coalesce(p_follow, false),
    'follower_count', v_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_seller_follow(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_seller_follow(uuid, boolean) TO authenticated;
