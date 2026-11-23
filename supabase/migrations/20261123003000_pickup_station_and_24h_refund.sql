-- Add JulaDirect's Banjul pickup-station fulfilment and enforce the 24-hour refund window.
-- Pickup-station orders use the existing pickup status lifecycle and intentionally
-- do not create a delivery_requests row or enter courier dispatch.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_station_name text,
  ADD COLUMN IF NOT EXISTS pickup_station_city text,
  ADD COLUMN IF NOT EXISTS pickup_station_address text;

UPDATE public.gambasket_finance_settings
SET refund_provider_window_hours = 24,
    updated_at = now()
WHERE id = 1;

-- Authenticated checkout clients use this to enable the station option only
-- after the schema and server-side pickup workflow are deployed.
CREATE OR REPLACE FUNCTION public.gambasket_get_pickup_station_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $fn$
  SELECT jsonb_build_object(
    'available', true,
    'station_name', 'JulaDirect Pickup Station',
    'city', 'Banjul',
    'country', 'The Gambia'
  )
  WHERE (SELECT auth.uid()) IS NOT NULL;
$fn$;

REVOKE ALL ON FUNCTION public.gambasket_get_pickup_station_config()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gambasket_get_pickup_station_config()
TO authenticated;

CREATE OR REPLACE FUNCTION public.create_order(
  p_items jsonb,
  p_fulfillment_type character varying,
  p_delivery_address text DEFAULT NULL::text,
  p_delivery_region character varying DEFAULT NULL::character varying,
  p_delivery_area character varying DEFAULT NULL::character varying,
  p_delivery_phone character varying DEFAULT NULL::character varying,
  p_delivery_instructions text DEFAULT NULL::text,
  p_payment_method character varying DEFAULT NULL::character varying,
  p_coupon_code character varying DEFAULT NULL::character varying
)
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
  v_station_name constant text := 'JulaDirect Pickup Station';
  v_station_city constant text := 'Banjul';
BEGIN
  IF v_buyer_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  IF v_fulfillment NOT IN ('delivery', 'pickup', 'pickup_station') THEN
    RAISE EXCEPTION 'INVALID_FULFILLMENT';
  END IF;

  IF v_method IS NULL OR v_method NOT IN ('wave', 'qmoney', 'afrimoney') THEN
    RAISE EXCEPTION 'ONLINE_PAYMENT_REQUIRED';
  END IF;

  IF v_fulfillment = 'pickup_station' THEN
    IF lower(trim(COALESCE(p_delivery_area, ''))) <> 'banjul' THEN
      RAISE EXCEPTION 'PICKUP_STATION_UNAVAILABLE: Only the Banjul pickup station is currently available';
    END IF;
    IF NULLIF(trim(COALESCE(p_delivery_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'PICKUP_CONTACT_REQUIRED';
    END IF;
    v_internal_fulfillment := 'pickup';
  ELSE
    v_internal_fulfillment := v_fulfillment;
  END IF;

  -- Reuse the existing atomic inventory/coupon/order routine. For station
  -- fulfilment, send 'pickup' so it does not create a courier delivery request.
  PERFORM set_config('app.gambasket_order_creation', 'on', true);

  v_order := public.gambasket_create_order_internal(
    p_items,
    v_internal_fulfillment,
    CASE WHEN v_fulfillment = 'pickup_station' THEN NULL ELSE p_delivery_address END,
    CASE WHEN v_fulfillment = 'pickup_station' THEN v_station_city ELSE p_delivery_region END,
    CASE WHEN v_fulfillment = 'pickup_station' THEN v_station_city ELSE p_delivery_area END,
    p_delivery_phone,
    CASE WHEN v_fulfillment = 'pickup_station' THEN NULL ELSE p_delivery_instructions END,
    'cash_on_delivery',
    p_coupon_code
  );

  v_order_id := (v_order->>'id')::uuid;

  -- Complete the online-only payment-method transition within the same trusted
  -- transaction. The installed guard permits this specific order-creation path.
  -- Switch payment method and set any station destination metadata in ONE update.
  -- The payment-method guard only permits this one COD-to-online transition during
  -- trusted order creation; a second update would correctly require a payment intent.
  UPDATE public.orders
  SET payment_method = v_method,
      pickup_station_name = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station_name ELSE pickup_station_name END,
      pickup_station_city = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station_city ELSE pickup_station_city END,
      pickup_station_address = CASE WHEN v_fulfillment = 'pickup_station' THEN NULL ELSE pickup_station_address END,
      pickup_location = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station_name || ', ' || v_station_city ELSE pickup_location END,
      delivery_region = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station_city ELSE delivery_region END,
      delivery_area = CASE WHEN v_fulfillment = 'pickup_station' THEN v_station_city ELSE delivery_area END,
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
    -- Replace the generic new-order notice with actionable station instructions.
    UPDATE public.notifications
    SET title = 'New Banjul pickup-station order',
        message = 'Prepare this order and take it to the JulaDirect Pickup Station in Banjul. No courier is assigned; you must bring the order to the station.',
        data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
          'order_id', v_order_id,
          'fulfillment_type', 'pickup_station',
          'pickup_station_name', v_station_name,
          'pickup_station_city', v_station_city,
          'seller_instruction', 'Bring this order to the JulaDirect Pickup Station in Banjul. No courier is required.'
        )
    WHERE user_id = v_seller_id
      AND data->>'order_id' = v_order_id::text;

    UPDATE public.notifications
    SET title = 'Order placed — Banjul pickup station',
        message = 'Your order will be taken to the JulaDirect Pickup Station in Banjul. We will confirm the collection details when it is ready.',
        data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
          'order_id', v_order_id,
          'fulfillment_type', 'pickup_station',
          'pickup_station_name', v_station_name,
          'pickup_station_city', v_station_city
        )
    WHERE user_id = v_buyer_id
      AND data->>'order_id' = v_order_id::text;

    RETURN v_order || jsonb_build_object(
      'fulfillment_type', 'pickup_station',
      'pickup_station_name', v_station_name,
      'pickup_station_city', v_station_city
    );
  END IF;

  RETURN v_order;
END;
$function$;

-- Notify the buyer when the seller physically takes the order to the station.
CREATE OR REPLACE FUNCTION public.gambasket_notify_pickup_station_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF NEW.pickup_station_name IS NOT NULL
     AND NEW.order_status = 'ready_for_pickup'
     AND OLD.order_status IS DISTINCT FROM NEW.order_status THEN
    INSERT INTO public.notifications(user_id, type, title, message, data)
    VALUES (
      NEW.buyer_id,
      'order',
      'Your order is ready at the Banjul pickup station',
      'Your order has reached the JulaDirect Pickup Station in Banjul and is ready for collection.',
      jsonb_build_object(
        'order_id', NEW.id,
        'fulfillment_type', 'pickup_station',
        'pickup_station_name', NEW.pickup_station_name,
        'pickup_station_city', NEW.pickup_station_city,
        'pickup_station_address', NEW.pickup_station_address
      )
    );
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.gambasket_notify_pickup_station_ready()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_notify_pickup_station_ready ON public.orders;
CREATE TRIGGER orders_notify_pickup_station_ready
AFTER UPDATE OF order_status ON public.orders
FOR EACH ROW
WHEN (
  OLD.order_status IS DISTINCT FROM NEW.order_status
  AND NEW.order_status = 'ready_for_pickup'
  AND NEW.pickup_station_name IS NOT NULL
)
EXECUTE FUNCTION public.gambasket_notify_pickup_station_ready();

CREATE OR REPLACE FUNCTION public.gambasket_request_order_refund(
  p_order_id uuid,
  p_amount numeric,
  p_reason text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.gambasket_payments%ROWTYPE;
  v_case uuid;
  v_reserved numeric(14,2);
  v_amount numeric(14,2) := round(COALESCE(p_amount, 0), 2);
  v_reason text := trim(COALESCE(p_reason, ''));
  v_window_hours integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_amount <= 0 OR length(v_reason) NOT BETWEEN 3 AND 80 THEN
    RAISE EXCEPTION 'Valid refund amount and reason required';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND buyer_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND OR v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Only your paid order can be refunded';
  END IF;

  SELECT * INTO v_payment
  FROM public.gambasket_payments
  WHERE order_id = p_order_id AND status IN ('succeeded', 'partially_refunded')
  ORDER BY succeeded_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'No completed ModemPay payment found'; END IF;

  SELECT refund_provider_window_hours
  INTO v_window_hours
  FROM public.gambasket_finance_settings
  WHERE id = 1;

  v_window_hours := COALESCE(v_window_hours, 24);

  IF v_payment.succeeded_at IS NULL
     OR now() > v_payment.succeeded_at + make_interval(hours => v_window_hours) THEN
    RAISE EXCEPTION 'MODEMPAY_REFUND_WINDOW_EXPIRED: Refund requests must be submitted within 24 hours of successful payment';
  END IF;

  SELECT COALESCE(SUM(requested_amount), 0)::numeric(14,2)
  INTO v_reserved
  FROM public.order_refund_cases
  WHERE payment_id = v_payment.id
    AND status IN ('requested', 'under_review', 'approved', 'provider_pending', 'succeeded');

  IF v_reserved + v_amount > v_payment.amount THEN
    RAISE EXCEPTION 'Refund amount exceeds remaining payment amount';
  END IF;

  INSERT INTO public.order_refund_cases(
    order_id, payment_id, buyer_id, seller_id,
    requested_amount, reason, description, status
  )
  VALUES(
    p_order_id, v_payment.id, auth.uid(), v_order.seller_id,
    v_amount, v_reason, NULLIF(trim(COALESCE(p_description, '')), ''), 'requested'
  )
  RETURNING id INTO v_case;

  RETURN v_case;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.gambasket_validate_refund_case(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_case public.order_refund_cases%ROWTYPE;
  v_payment public.gambasket_payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_rate numeric(5,2);
  v_window_hours integer;
  v_merchandise numeric(14,2);
  v_commission numeric(14,2);
  v_seller_share numeric(14,2);
  v_ratio numeric(14,8);
  v_seller_refund numeric(14,2);
  v_commission_refund numeric(14,2);
  v_delivery_refund numeric(14,2);
  v_pending numeric(14,2);
  v_available numeric(14,2);
  v_commission_balance numeric(14,2);
  v_delivery_balance numeric(14,2);
  v_reserved numeric(14,2);
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('gambasket-refund-ledger', 0)
  );

  SELECT * INTO v_case
  FROM public.order_refund_cases
  WHERE id = p_case_id
  FOR UPDATE;

  IF NOT FOUND OR v_case.status NOT IN ('approved', 'provider_pending') THEN
    RAISE EXCEPTION 'Refund must be approved by an administrator first';
  END IF;

  SELECT * INTO v_payment
  FROM public.gambasket_payments
  WHERE id = v_case.payment_id
  FOR UPDATE;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_case.order_id
  FOR UPDATE;

  IF v_payment.status NOT IN ('succeeded', 'partially_refunded')
     OR v_payment.provider_reference IS NULL THEN
    RAISE EXCEPTION 'Completed provider transaction reference is missing';
  END IF;

  SELECT refund_provider_window_hours
  INTO v_window_hours
  FROM public.gambasket_finance_settings
  WHERE id = 1;

  v_window_hours := COALESCE(v_window_hours, 24);

  -- The 24-hour deadline applies until provider processing has begun.
  -- Once the case is provider_pending, allow reconciliation/finalisation to
  -- complete even if ModemPay confirms after the request window has elapsed.
  IF v_case.status = 'approved'
     AND (v_payment.succeeded_at IS NULL
       OR now() > v_payment.succeeded_at + make_interval(hours => v_window_hours)) THEN
    RAISE EXCEPTION 'MODEMPAY_REFUND_WINDOW_EXPIRED';
  END IF;

  SELECT COALESCE(SUM(requested_amount), 0)::numeric(14,2)
  INTO v_reserved
  FROM public.order_refund_cases
  WHERE payment_id = v_payment.id
    AND id <> p_case_id
    AND status IN ('requested', 'under_review', 'approved', 'provider_pending', 'succeeded');

  IF v_reserved + v_case.requested_amount > v_payment.amount THEN
    RAISE EXCEPTION 'Refund exceeds remaining payment balance';
  END IF;

  SELECT commission_rate
  INTO v_rate
  FROM public.gambasket_finance_settings
  WHERE id = 1;

  v_rate := COALESCE(v_rate, 5.00);
  v_merchandise := GREATEST(v_order.subtotal - v_order.discount_amount, 0);
  v_commission := round(v_merchandise * v_rate / 100, 2);
  v_seller_share := v_merchandise - v_commission;
  v_ratio := v_case.requested_amount / v_payment.amount;
  v_seller_refund := round(v_seller_share * v_ratio, 2);
  v_commission_refund := round(v_commission * v_ratio, 2);
  v_delivery_refund := v_case.requested_amount - v_seller_refund - v_commission_refund;

  SELECT
    COALESCE(SUM(e.credit - e.debit) FILTER (WHERE e.account_code = 'seller_pending'), 0)::numeric(14,2),
    COALESCE(SUM(e.credit - e.debit) FILTER (WHERE e.account_code = 'seller_available'), 0)::numeric(14,2)
  INTO v_pending, v_available
  FROM public.seller_wallet_ledger_entries e
  WHERE e.account_owner_id = v_order.seller_id
    AND (
      e.account_code = 'seller_available'
      OR (e.account_code = 'seller_pending' AND e.order_id = v_order.id)
    );

  SELECT COALESCE(SUM(e.credit - e.debit), 0)::numeric(14,2)
  INTO v_commission_balance
  FROM public.seller_wallet_ledger_entries e
  WHERE e.account_code = 'platform_commission'
    AND e.payment_id = v_payment.id;

  SELECT COALESCE(SUM(e.credit - e.debit), 0)::numeric(14,2)
  INTO v_delivery_balance
  FROM public.seller_wallet_ledger_entries e
  WHERE e.account_code = 'delivery_payable'
    AND e.payment_id = v_payment.id;

  IF v_pending + v_available < v_seller_refund
     OR v_commission_balance < v_commission_refund
     OR v_delivery_balance < v_delivery_refund THEN
    RAISE EXCEPTION 'REFUND_REQUIRES_MANUAL_FINANCIAL_REVIEW';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'provider_reference', v_payment.provider_reference,
    'amount', v_case.requested_amount,
    'currency', 'GMD',
    'seller_refund', v_seller_refund,
    'commission_refund', v_commission_refund,
    'delivery_refund', v_delivery_refund
  );
END;
$fn$;

COMMIT;
