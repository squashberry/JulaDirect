BEGIN;

INSERT INTO public.roles (id, name, description)
VALUES ('restaurant', 'Restaurant Owner', 'Approved restaurant operator who can manage a restaurant profile, menu and food orders.')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION public.submit_verification_request(
  p_role_type character varying,
  p_business_name character varying,
  p_business_category character varying DEFAULT NULL::character varying,
  p_identity_document_url text DEFAULT NULL::text,
  p_business_document_url text DEFAULT NULL::text,
  p_additional_document_url text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
RETURNS public.verification_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_request public.verification_requests%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_role_type NOT IN ('seller','supplier','restaurant') THEN
    RAISE EXCEPTION 'Choose a valid business role';
  END IF;
  IF NULLIF(trim(p_business_name),'') IS NULL OR length(trim(p_business_name)) > 160 THEN
    RAISE EXCEPTION 'Business or restaurant name is required and must be under 160 characters';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=v_user AND ur.role_id=p_role_type AND COALESCE(ur.is_active,true)=true
  ) THEN
    RAISE EXCEPTION 'This role is already active on your account';
  END IF;

  SELECT * INTO v_request
  FROM public.verification_requests
  WHERE user_id=v_user AND role_type=p_role_type AND status='pending'
  ORDER BY submitted_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN v_request; END IF;

  INSERT INTO public.verification_requests(
    user_id,role_type,business_name,business_category,identity_document_url,
    business_document_url,additional_document_url,notes,status
  )
  VALUES(
    v_user,p_role_type,trim(p_business_name),NULLIF(trim(p_business_category),''),
    NULLIF(trim(p_identity_document_url),''),NULLIF(trim(p_business_document_url),''),
    NULLIF(trim(p_additional_document_url),''),NULLIF(trim(p_notes),''),'pending'
  )
  RETURNING * INTO v_request;
  RETURN v_request;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_verification(
  p_request_id uuid,
  p_status character varying,
  p_notes text DEFAULT NULL::text
)
RETURNS public.verification_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r public.verification_requests%ROWTYPE;
  profile_phone text;
  profile_location text;
BEGIN
  IF NOT public.is_gambasket_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid verification status'; END IF;

  SELECT * INTO r FROM public.verification_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verification request not found'; END IF;
  IF r.role_type NOT IN ('seller','supplier','restaurant') THEN
    RAISE EXCEPTION 'Only seller, supplier and restaurant verification requests can assign roles';
  END IF;

  UPDATE public.verification_requests
  SET status=p_status, reviewed_at=now(), reviewed_by=auth.uid(), review_notes=p_notes
  WHERE id=p_request_id RETURNING * INTO r;

  SELECT phone, COALESCE(NULLIF(area,''), NULLIF(region,''), 'The Gambia')
  INTO profile_phone, profile_location
  FROM public.profiles WHERE id=r.user_id;

  IF p_status='approved' THEN
    INSERT INTO public.user_roles(user_id,role_id,assigned_by,is_active)
    VALUES(r.user_id,r.role_type,auth.uid(),true)
    ON CONFLICT(user_id,role_id) DO UPDATE SET is_active=true, assigned_by=auth.uid();

    IF r.role_type='seller' THEN
      UPDATE public.seller_profiles
      SET business_name=COALESCE(NULLIF(r.business_name,''),business_name),
          business_category=COALESCE(NULLIF(r.business_category,''),business_category),
          phone=COALESCE(profile_phone,phone),
          location=COALESCE(profile_location,location),
          verification_status='verified',is_active=true,updated_at=now()
      WHERE user_id=r.user_id;
      IF NOT FOUND THEN
        INSERT INTO public.seller_profiles(user_id,business_name,business_category,phone,location,verification_status,is_active)
        VALUES(r.user_id,COALESCE(NULLIF(r.business_name,''),'Independent Seller'),r.business_category,profile_phone,profile_location,'verified',true);
      END IF;
    ELSIF r.role_type='supplier' THEN
      UPDATE public.supplier_profiles
      SET business_name=COALESCE(NULLIF(r.business_name,''),business_name),
          business_category=COALESCE(NULLIF(r.business_category,''),business_category),
          phone=COALESCE(profile_phone,phone),
          location=COALESCE(profile_location,location),
          is_verified=true,is_active=true,updated_at=now()
      WHERE user_id=r.user_id;
      IF NOT FOUND THEN
        INSERT INTO public.supplier_profiles(user_id,business_name,business_category,phone,location,is_verified,is_active)
        VALUES(r.user_id,COALESCE(NULLIF(r.business_name,''),'Verified Supplier'),r.business_category,profile_phone,profile_location,true,true);
      END IF;
    END IF;
    -- Restaurants receive the restaurant role here; their restaurant profile/menu is created in Restaurant Studio.
  ELSE
    IF r.role_type='seller' THEN
      UPDATE public.seller_profiles SET verification_status='rejected',updated_at=now() WHERE user_id=r.user_id;
    ELSIF r.role_type='supplier' THEN
      UPDATE public.supplier_profiles SET is_verified=false,updated_at=now() WHERE user_id=r.user_id;
    END IF;
  END IF;

  INSERT INTO public.platform_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'verification_'||p_status,'verification_request',r.id,jsonb_build_object('role',r.role_type,'user_id',r.user_id));
  RETURN r;
END;
$function$;

COMMIT;
