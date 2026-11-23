-- Buyers may choose delivery or an active pickup station only.
-- The database still stores pickup-station orders as internal "pickup" records
-- so the existing seller fulfilment lifecycle remains unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_order(p_items jsonb, p_fulfillment_type character varying, p_pickup_station_id uuid, p_delivery_address text DEFAULT NULL::text, p_delivery_region character varying DEFAULT NULL::character varying, p_delivery_area character varying DEFAULT NULL::character varying, p_delivery_phone character varying DEFAULT NULL::character varying, p_delivery_instructions text DEFAULT NULL::text, p_payment_method character varying DEFAULT NULL::character varying, p_coupon_code character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order jsonb;
  v_fulfillment text := lower(trim(COALESCE(p_fulfillment_type, '')));
  v_method text := NULLIF(trim(p_payment_method), '');
  v_internal_fulfillment character varying;
  v_seller_id uuid;
  v_buyer_id uuid := auth.uid();
  v_order_id uuid;
  v_station public.pickup_stations%ROWTYPE;
BEGIN
  IF v_buyer_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  IF v_fulfillment NOT IN ('delivery', 'pickup_station') THEN
    RAISE EXCEPTION 'INVALID_FULFILLMENT';
  END IF;

  IF v_method IS NULL OR v_method NOT IN ('wave', 'qmoney', 'afrimoney') THEN
    RAISE EXCEPTION 'ONLINE_PAYMENT_REQUIRED';
  END IF;

  IF v_fulfillment = 'pickup_station' THEN
    IF p_pickup_station_id IS NULL THEN
      RAISE EXCEPTION 'PICKUP_STATION_REQUIRED: Choose an available pickup station';
    END IF;

    SELECT *
    INTO v_station
    FROM public.pickup_stations
    WHERE id = p_pickup_station_id
      AND is_active = true
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PICKUP_STATION_UNAVAILABLE: This pickup station is no longer available';
    END IF;

    IF lower(trim(COALESCE(p_delivery_region, ''))) <> lower(trim(v_station.region))
       OR lower(trim(COALESCE(p_delivery_area, ''))) <> lower(trim(v_station.area)) THEN
      RAISE EXCEPTION 'PICKUP_STATION_LOCATION_MISMATCH';
    END IF;

    IF NULLIF(trim(COALESCE(p_delivery_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'PICKUP_CONTACT_REQUIRED';
    END IF;

    v_internal_fulfillment := 'pickup';
  ELSE
    IF p_pickup_station_id IS NOT NULL THEN
      RAISE EXCEPTION 'UNEXPECTED_PICKUP_STATION';
    END IF;
    v_internal_fulfillment := v_fulfillment;
  END IF;

  -- Reuse the existing atomic inventory/coupon/order routine. Station orders
  -- are passed as ordinary pickup so no courier delivery request is created.
  PERFORM set_config('app.gambasket_order_creation', 'on', true);

  v_order := public.gambasket_create_order_internal(
    p_items,
    v_internal_fulfillment,
    CASE WHEN v_fulfillment = 'pickup_station' THEN NULL ELSE p_delivery_address END,
    CASE WHEN v_fulfillment = 'pickup_station' THEN v_station.region ELSE p_delivery_region END,
    CASE WHEN v_fulfillment = 'pickup_station' THEN v_station.area ELSE p_delivery_area END,
    p_delivery_phone,
    CASE WHEN v_fulfillment = 'pickup_station' THEN NULL ELSE p_delivery_instructions END,
    'cash_on_delivery',
    p_coupon_code
  );

  v_order_id := (v_order->>'id')::uuid;

  -- Complete payment-method transition and station snapshot in a single update.
  -- The existing trigger allows this trusted COD-to-online order-creation update.
  UPDATE public.orders
  SET payment_method = v_method,
      pickup_station_id = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station.id ELSE NULL END,
      pickup_station_region = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station.region ELSE NULL END,
      pickup_station_name = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station.station_name ELSE NULL END,
      pickup_station_city = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station.area ELSE NULL END,
      pickup_station_address = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station.address ELSE NULL END,
      pickup_location = CASE WHEN v_fulfillment = 'pickup_station'
        THEN v_station.station_name || ', ' || v_station.area
        ELSE pickup_location
      END,
      delivery_region = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station.region ELSE delivery_region END,
      delivery_area = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station.area ELSE delivery_area END,
      delivery_address = CASE WHEN v_fulfillment = 'pickup_station' THEN NULL ELSE delivery_address END,
      delivery_instructions = CASE WHEN v_fulfillment = 'pickup_station' THEN NULL ELSE delivery_instructions END,
      updated_at = now()
  WHERE id = v_order_id
    AND buyer_id = v_buyer_id
    AND order_status = 'pending'
    AND payment_status = 'pending'
  RETURNING seller_id INTO v_seller_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'ONLINE_ORDER_SETUP_FAILED'; END IF;

  IF v_fulfillment = 'pickup_station' THEN
    UPDATE public.notifications
    SET title = 'New pickup-station order',
        message = 'Prepare this order and take it to ' || v_station.station_name || ', ' ||
          v_station.area || '. No courier is assigned; bring the order directly to the selected station.',
        data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
          'order_id', v_order_id,
          'fulfillment_type', 'pickup_station',
          'pickup_station_id', v_station.id,
          'pickup_station_name', v_station.station_name,
          'pickup_station_region', v_station.region,
          'pickup_station_area', v_station.area,
          'pickup_station_address', v_station.address,
          'seller_instruction', 'Bring this order to ' || v_station.station_name || ', ' ||
            v_station.area || '. No courier is required.'
        )
    WHERE user_id = v_seller_id
      AND data->>'order_id' = v_order_id::text;

    UPDATE public.notifications
    SET title = 'Order placed — pickup station',
        message = 'Your order will be taken to ' || v_station.station_name || ', ' ||
          v_station.area || '. We will notify you when it is ready for collection.',
        data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
          'order_id', v_order_id,
          'fulfillment_type', 'pickup_station',
          'pickup_station_id', v_station.id,
          'pickup_station_name', v_station.station_name,
          'pickup_station_region', v_station.region,
          'pickup_station_area', v_station.area,
          'pickup_station_address', v_station.address
        )
    WHERE user_id = v_buyer_id
      AND data->>'order_id' = v_order_id::text;

    RETURN v_order || jsonb_build_object(
      'fulfillment_type', 'pickup_station',
      'pickup_station_id', v_station.id,
      'pickup_station_name', v_station.station_name,
      'pickup_station_region', v_station.region,
      'pickup_station_area', v_station.area,
      'pickup_station_address', v_station.address
    );
  END IF;

  RETURN v_order;
END;
$function$;
ALTER FUNCTION public.create_order(
  jsonb, character varying, uuid, text, character varying, character varying,
  character varying, text, character varying, character varying
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_order(
  jsonb, character varying, uuid, text, character varying, character varying,
  character varying, text, character varying, character varying
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(
  jsonb, character varying, uuid, text, character varying, character varying,
  character varying, text, character varying, character varying
) TO authenticated;
COMMIT;
