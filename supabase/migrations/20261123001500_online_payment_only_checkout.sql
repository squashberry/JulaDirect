-- JulaDirect checkout is now online-payment only.
-- Existing historical COD orders and their ledger history are preserved.
-- New orders require an explicit ModemPay mobile-money method.

BEGIN;

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
  v_method text := NULLIF(trim(p_payment_method), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF v_method IS NULL OR v_method NOT IN ('wave','qmoney','afrimoney') THEN
    RAISE EXCEPTION 'ONLINE_PAYMENT_REQUIRED: Choose Wave, QMoney or Afrimoney to place this order';
  END IF;

  -- Keep the original inventory reservation/order validation atomic. The legacy
  -- internal function starts the row as COD solely because its existing insert
  -- trigger requires that placeholder. The trusted trigger below permits this
  -- wrapper to replace it with the buyer's selected online method in this
  -- transaction, before the order is committed or made visible.
  PERFORM set_config('app.gambasket_order_creation','on',true);

  v_order := public.gambasket_create_order_internal(
    p_items,
    p_fulfillment_type,
    p_delivery_address,
    p_delivery_region,
    p_delivery_area,
    p_delivery_phone,
    p_delivery_instructions,
    'cash_on_delivery',
    p_coupon_code
  );

  UPDATE public.orders
  SET payment_method = v_method,
      updated_at = now()
  WHERE id = (v_order->>'id')::uuid
    AND buyer_id = auth.uid()
    AND order_status = 'pending'
    AND payment_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ONLINE_ORDER_SETUP_FAILED';
  END IF;

  RETURN v_order;
END;
$function$;

-- Permit only the trusted order-creation transaction to replace its temporary
-- COD insert value with one of the supported online methods. All later online
-- payment-method changes still require a matching ModemPay payment intent.
CREATE OR REPLACE FUNCTION public.gambasket_guard_order_payment_method()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT'
     AND current_setting('app.gambasket_order_creation', true) = 'on'
     AND NEW.payment_status = 'pending'
     AND NEW.payment_method = 'cash_on_delivery' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND current_setting('app.gambasket_order_creation', true) = 'on'
     AND OLD.payment_method = 'cash_on_delivery'
     AND NEW.payment_method IN ('pending_online','wave','qmoney','afrimoney')
     AND NEW.payment_status = 'pending'
     AND OLD.order_status = 'pending'
     AND NEW.order_status = 'pending' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_method IS NULL THEN
    RETURN NEW;
  END IF;

  -- Historical COD orders may still be updated for fulfilment, but new COD
  -- order creation or changing an existing order into COD is not permitted.
  IF NEW.payment_method = 'cash_on_delivery' THEN
    IF TG_OP = 'INSERT' OR OLD.payment_method IS DISTINCT FROM NEW.payment_method THEN
      RAISE EXCEPTION 'ONLINE_PAYMENT_REQUIRED: Cash on delivery is no longer accepted';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.payment_method NOT IN ('pending_online','wave','qmoney','afrimoney') THEN
    RAISE EXCEPTION 'Unsupported checkout payment method';
  END IF;

  IF NEW.payment_method = 'pending_online' THEN
    RAISE EXCEPTION 'Pending-online is reserved for the trusted checkout transaction';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.gambasket_payments p
    WHERE p.order_id = NEW.id
      AND p.buyer_id = NEW.buyer_id
      AND p.currency = 'GMD'
      AND p.amount = NEW.total
      AND p.status IN ('pending','succeeded')
      AND p.metadata->>'payment_method' = NEW.payment_method
  ) THEN
    RAISE EXCEPTION 'A matching ModemPay payment intent is required for online checkout';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order(
  jsonb, character varying, text, character varying, character varying,
  character varying, text, character varying, character varying
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(
  jsonb, character varying, text, character varying, character varying,
  character varying, text, character varying, character varying
) TO authenticated;

REVOKE ALL ON FUNCTION public.gambasket_guard_order_payment_method()
FROM PUBLIC, anon, authenticated;

COMMIT;
