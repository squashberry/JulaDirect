-- JulaDirect: payment-gated seller confirmation and safe seller product deletion.
-- Applied to Supabase project iwxcepbwmnnkxocskopx.

CREATE OR REPLACE FUNCTION public.seller_update_order_status(
  p_order_id uuid,
  p_next_status text,
  p_reason text DEFAULT NULL::text
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  o public.orders%ROWTYPE;
  old_status text;
  allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO o
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF NOT public.is_gambasket_admin()
     AND (o.seller_id IS DISTINCT FROM auth.uid()
          OR NOT public.has_role(auth.uid(), 'seller'::character varying)) THEN
    RAISE EXCEPTION 'Seller access required';
  END IF;

  IF p_next_status = 'confirmed'
     AND o.payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Payment must be completed before the seller can confirm this order';
  END IF;

  old_status := o.order_status;
  allowed := CASE old_status
    WHEN 'pending' THEN p_next_status IN ('confirmed', 'cancelled')
    WHEN 'confirmed' THEN p_next_status IN ('processing', 'cancelled')
    WHEN 'processing' THEN p_next_status IN ('ready_for_pickup', 'ready_for_delivery', 'cancelled')
    WHEN 'ready_for_delivery' THEN p_next_status = 'cancelled'
    WHEN 'ready_for_pickup' THEN p_next_status IN ('completed', 'delivered', 'cancelled')
    WHEN 'delivered' THEN p_next_status = 'completed'
    ELSE false
  END;

  IF NOT COALESCE(allowed, false) THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', old_status, p_next_status;
  END IF;

  IF o.fulfillment_type = 'delivery'
     AND p_next_status IN ('completed', 'delivered') THEN
    RAISE EXCEPTION 'Delivery orders must be completed through the delivery-worker workflow';
  END IF;

  IF p_next_status = 'cancelled' THEN
    p_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Cancelled by seller');
    PERFORM set_config('app.gambasket_internal', 'on', true);

    UPDATE public.products p
    SET stock = p.stock + oi.quantity,
        sales_count = GREATEST(COALESCE(p.sales_count, 0) - oi.quantity, 0),
        updated_at = now()
    FROM public.order_items oi
    WHERE oi.order_id = o.id
      AND oi.product_id = p.id;

    UPDATE public.delivery_requests
    SET status = 'cancelled',
        updated_at = now()
    WHERE order_id = o.id
      AND status IN ('awaiting_seller', 'pending');
  END IF;

  UPDATE public.orders
  SET order_status = p_next_status,
      cancellation_reason = CASE
        WHEN p_next_status = 'cancelled' THEN p_reason
        ELSE cancellation_reason
      END,
      updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO o;

  IF p_next_status = 'ready_for_delivery' THEN
    INSERT INTO public.delivery_requests(
      order_id, pickup_location, delivery_destination,
      delivery_area, estimated_fee, status
    )
    VALUES (
      o.id,
      COALESCE(o.pickup_location, 'Seller pickup location'),
      COALESCE(o.delivery_address, 'Delivery destination'),
      o.delivery_area,
      COALESCE(o.delivery_fee, 100),
      'pending'
    )
    ON CONFLICT (order_id) DO UPDATE
    SET status = 'pending', updated_at = now()
    WHERE public.delivery_requests.status IN ('awaiting_seller', 'pending');
  END IF;

  INSERT INTO public.order_status_history(
    order_id, from_status, to_status, changed_by, notes
  )
  VALUES (
    o.id, old_status, p_next_status, auth.uid(), NULLIF(trim(p_reason), '')
  );

  RETURN o;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seller_delete_product(p_product_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_product public.products%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_gambasket_admin()
     AND NOT (
       public.has_role(v_user_id, 'seller'::character varying)
       OR public.has_role(v_user_id, 'supplier'::character varying)
     ) THEN
    RAISE EXCEPTION 'Seller access required';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND
     OR (v_product.seller_id IS DISTINCT FROM v_user_id
         AND NOT public.is_gambasket_admin()) THEN
    RAISE EXCEPTION 'Product not found or not owned by this seller';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = p_product_id
      AND COALESCE(o.order_status, 'pending') NOT IN ('cancelled', 'completed', 'delivered')
  ) THEN
    RAISE EXCEPTION 'This product is linked to an active order. Complete or cancel the order before deleting the listing.';
  END IF;

  DELETE FROM public.products
  WHERE id = p_product_id;

  RETURN p_product_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.seller_delete_product(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seller_delete_product(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.seller_delete_product(uuid) TO authenticated;
