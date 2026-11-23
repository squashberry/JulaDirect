-- Dynamic pickup-station directory and 24-hour refund eligibility.
-- Pickup-station orders follow the existing seller pickup lifecycle and never
-- create a courier delivery request. Station records can be added without UI changes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pickup_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_name text NOT NULL CHECK (length(trim(station_name)) BETWEEN 2 AND 120),
  region text NOT NULL CHECK (length(trim(region)) BETWEEN 2 AND 100),
  area text NOT NULL CHECK (length(trim(area)) BETWEEN 2 AND 100),
  address text NOT NULL CHECK (length(trim(address)) BETWEEN 2 AND 300),
  instructions text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_name, region, area)
);

ALTER TABLE public.pickup_stations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pickup_stations FROM PUBLIC, anon, authenticated;

-- First live pickup station. Add future locations as rows in this table.
INSERT INTO public.pickup_stations(station_name, region, area, address, instructions)
VALUES (
  'SRN',
  'Greater Banjul Area',
  'Banjul',
  'SRN, Banjul, The Gambia',
  'Collect from the SRN pickup point in Banjul.'
)
ON CONFLICT (station_name, region, area) DO UPDATE
SET address = EXCLUDED.address,
    instructions = EXCLUDED.instructions,
    is_active = true,
    updated_at = now();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_station_id uuid,
  ADD COLUMN IF NOT EXISTS pickup_station_region text,
  ADD COLUMN IF NOT EXISTS pickup_station_name text,
  ADD COLUMN IF NOT EXISTS pickup_station_city text,
  ADD COLUMN IF NOT EXISTS pickup_station_address text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_pickup_station_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_pickup_station_id_fkey
      FOREIGN KEY (pickup_station_id)
      REFERENCES public.pickup_stations(id)
      ON DELETE RESTRICT;
  END IF;
END;
$constraint$;

CREATE INDEX IF NOT EXISTS pickup_stations_active_area_idx
ON public.pickup_stations(region, area, station_name)
WHERE is_active = true;

ALTER TABLE public.gambasket_finance_settings
  ALTER COLUMN refund_provider_window_hours SET DEFAULT 24;

UPDATE public.gambasket_finance_settings
SET refund_provider_window_hours = 24,
    updated_at = now()
WHERE id = 1;

-- Return every active station to authenticated checkout clients. The client
-- groups these records by area; adding another row automatically adds a choice.
CREATE OR REPLACE FUNCTION public.gambasket_get_pickup_station_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT jsonb_build_object(
    'available', COUNT(*) > 0,
    'stations', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ps.id,
          'station_name', ps.station_name,
          'region', ps.region,
          'area', ps.area,
          'address', ps.address,
          'instructions', ps.instructions,
          'is_active', ps.is_active
        )
        ORDER BY ps.region, ps.area, ps.station_name
      ),
      '[]'::jsonb
    )
  )
  FROM public.pickup_stations ps
  WHERE ps.is_active = true
    AND (SELECT auth.uid()) IS NOT NULL;
$fn$;

ALTER FUNCTION public.gambasket_get_pickup_station_config() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.gambasket_get_pickup_station_config()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gambasket_get_pickup_station_config()
TO authenticated;

-- Ten-argument trusted order wrapper. The station ID is a separate argument,
-- not smuggled through the delivery address/instructions fields.
CREATE OR REPLACE FUNCTION public.create_order(
  p_items jsonb,
  p_fulfillment_type character varying,
  p_pickup_station_id uuid,
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
  v_station public.pickup_stations%ROWTYPE;
BEGIN
  IF v_buyer_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  IF v_fulfillment NOT IN ('delivery', 'pickup', 'pickup_station') THEN
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

-- Keep the nine-argument RPC signature for older cached clients, but disallow
-- pickup_station without an explicit station ID. New clients call the 10-arg RPC.
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
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $legacy$
  SELECT public.create_order(
    p_items,
    p_fulfillment_type,
    NULL::uuid,
    p_delivery_address,
    p_delivery_region,
    p_delivery_area,
    p_delivery_phone,
    p_delivery_instructions,
    p_payment_method,
    p_coupon_code
  );
$legacy$;

ALTER FUNCTION public.create_order(
  jsonb, character varying, uuid, text, character varying, character varying,
  character varying, text, character varying, character varying
) OWNER TO postgres;
ALTER FUNCTION public.create_order(
  jsonb, character varying, text, character varying, character varying,
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

REVOKE ALL ON FUNCTION public.create_order(
  jsonb, character varying, text, character varying, character varying,
  character varying, text, character varying, character varying
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(
  jsonb, character varying, text, character varying, character varying,
  character varying, text, character varying, character varying
) TO authenticated;

-- Inform the buyer when the seller takes the order to its selected station.
CREATE OR REPLACE FUNCTION public.gambasket_notify_pickup_station_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF NEW.pickup_station_id IS NOT NULL
     AND NEW.order_status = 'ready_for_pickup'
     AND OLD.order_status IS DISTINCT FROM NEW.order_status THEN
    INSERT INTO public.notifications(user_id, type, title, message, data)
    VALUES (
      NEW.buyer_id,
      'order',
      'Your order is ready at ' || COALESCE(NEW.pickup_station_name, 'the pickup station'),
      'Your order has reached ' || COALESCE(NEW.pickup_station_address,
        concat_ws(', ', NEW.pickup_station_name, NEW.pickup_station_city)) ||
        ' and is ready for collection.',
      jsonb_build_object(
        'order_id', NEW.id,
        'fulfillment_type', 'pickup_station',
        'pickup_station_id', NEW.pickup_station_id,
        'pickup_station_name', NEW.pickup_station_name,
        'pickup_station_region', NEW.pickup_station_region,
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
  AND NEW.pickup_station_id IS NOT NULL
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
