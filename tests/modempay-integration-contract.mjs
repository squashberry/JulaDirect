import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const [migration, codMigration, onlineOnlyMigration, pickupRefundMigration, checkoutFn, webhookFn, payoutFn, deliveryFn, refundFn, configFn, checkoutUi, deliveryUi, ordersUi, walletUi, codWalletUi, codAdminUi, supplierEarnings] =
  await Promise.all([
    read("supabase/migrations/20261114160000_gambasket_modempay_finance_lifecycle.sql"),
    read("supabase/migrations/20261114170000_gambasket_cod_commission_reserve.sql"),
    read("supabase/migrations/20261123001500_online_payment_only_checkout.sql"),
    read("supabase/migrations/20261123003000_pickup_station_and_24h_refund.sql"),
    read("supabase/functions/gambasket-modempay-checkout/index.ts"),
    read("supabase/functions/gambasket-modempay-webhook/index.ts"),
    read("supabase/functions/gambasket-modempay-payouts/index.ts"),
    read("supabase/functions/gambasket-delivery-proof/index.ts"),
    read("supabase/functions/gambasket-modempay-refunds/index.ts"),
    read("supabase/functions/gambasket-modempay-config/index.ts"),
    read("js/checkout.js"), read("js/delivery.js"), read("orders.html"), read("js/seller-wallet.js"),
    read("js/seller-cod-reserve.js"), read("admin/cod-reserves.html"), read("supplier/earnings.html")
  ]);

assert.match(migration, /commission_rate/);
assert.match(migration, /interval '24 hours'/);

assert.match(migration, /gambasket_guard_order_payment_method/);
assert.match(migration, /gambasket_process_modempay_charge/);
assert.match(migration, /gambasket_process_modempay_transfer_event/);
assert.match(migration, /gambasket_issue_delivery_otp/);
assert.match(migration, /gambasket_confirm_delivery_with_otp/);
assert.match(migration, /gambasket_queue_automatic_payouts/);
assert.match(migration, /gambasket_release_due_seller_funds/);
assert.match(migration, /gambasket_finalize_modempay_refund/);
assert.match(codMigration, /seller_cod_commission_reservations/);
assert.match(codMigration, /seller_fund_cod_commission_reserve/);
assert.match(codMigration, /seller_request_cod_reserve_deposit/);
assert.match(codMigration, /admin_review_seller_cod_reserve_deposit/);
assert.match(codMigration, /gambasket_cod_checkout_eligibility/);
assert.match(codMigration, /cod_commission_capture/);
assert.match(codMigration, /ONLINE_PAYMENT_REQUIRED/);
assert.match(codMigration, /pending_online/);
assert.match(codMigration, /SELLER_COD_NOT_ELIGIBLE/);
assert.match(codMigration, /NEW\.order_status='confirmed'/);
assert.match(onlineOnlyMigration, /v_method NOT IN \('wave','qmoney','afrimoney'\)/);
assert.match(onlineOnlyMigration, /ONLINE_PAYMENT_REQUIRED/);
assert.match(onlineOnlyMigration, /DROP TRIGGER IF EXISTS orders_available_payment_methods_only ON public\.orders/);
assert.match(pickupRefundMigration, /ALTER COLUMN refund_provider_window_hours SET DEFAULT 24/);
assert.match(pickupRefundMigration, /refund_provider_window_hours = 24/);
assert.match(pickupRefundMigration, /make_interval\(hours => v_window_hours\)/);
assert.match(pickupRefundMigration, /CREATE TABLE IF NOT EXISTS public\.pickup_stations/);
assert.match(pickupRefundMigration, /'SRN'/);
assert.match(pickupRefundMigration, /p_pickup_station_id uuid/);
assert.match(pickupRefundMigration, /is_active = true/);
assert.match(pickupRefundMigration, /v_internal_fulfillment := 'pickup'/);
assert.match(pickupRefundMigration, /No courier is assigned/);
assert.match(pickupRefundMigration, /gambasket_get_pickup_station_config/);
assert.match(pickupRefundMigration, /gambasket_notify_pickup_station_ready/);
assert.doesNotMatch(pickupRefundMigration, /INSERT INTO public\.delivery_requests/i);
assert.doesNotMatch(pickupRefundMigration, /interval '48 hours'/);

assert.match(checkoutFn, /MODEMPAY_API_KEY/);
assert.ok(checkoutFn.includes("/v1/payments"));
assert.match(checkoutFn, /payment_methods/);
assert.doesNotMatch(checkoutFn, /callback_url/);
assert.match(checkoutFn, /payment_link/);
assert.match(webhookFn, /x-modem-signature/);
assert.match(webhookFn, /SHA-512/);
assert.match(webhookFn, /gambasket_process_modempay_charge/);
assert.match(webhookFn, /gambasket_process_modempay_transfer_event/);
assert.ok(payoutFn.includes("/v1/transfers"));
assert.match(payoutFn, /Idempotency-Key/);
assert.match(payoutFn, /gambasket_release_due_seller_funds/);
assert.match(deliveryFn, /GAMBASKET_OTP_PEPPER/);
assert.match(deliveryFn, /gambasket_confirm_delivery_with_otp/);
assert.ok(refundFn.includes("/v1/transactions/refund"));
assert.match(refundFn, /gambasket_mark_refund_provider_pending/);
assert.match(refundFn, /gambasket_finalize_modempay_refund/);
assert.match(configFn, /MODEMPAY_CHECKOUT_ENABLED/);
assert.match(configFn, /MODEMPAY_PAYOUTS_ENABLED/);
for (const source of [checkoutFn, webhookFn, payoutFn, deliveryFn, refundFn, configFn]) {
  assert.match(source, /x-client-info/);
}

assert.match(checkoutUi, /payment_method: payment/);
assert.doesNotMatch(checkoutUi, /gambasket_cod_checkout_eligibility|cash_on_delivery/i);
const checkoutPage = await read("checkout.html");
assert.doesNotMatch(checkoutPage, /id="cod"/i);
assert.match(checkoutPage, /24-hour refund eligibility/i);
assert.match(checkoutPage, /All requests are reviewed by JulaDirect/i);
assert.match(checkoutPage, /Pickup station/);
assert.match(checkoutPage, /id="pickupStationArea"/);
assert.match(checkoutPage, /id="pickupStationSelect"/);
assert.doesNotMatch(checkoutPage, /Collect from our Banjul station/);
assert.match(checkoutPage, /pickupStationAvailability/);
const sellerOrdersPage = await read("supplier/orders.html");
assert.match(sellerOrdersPage, /Seller brings this order here\. No courier is assigned\./);
assert.match(sellerOrdersPage, /ready_for_pickup/);
assert.match(codWalletUi, /seller_get_cod_reserve_summary/);
assert.match(codWalletUi, /seller_fund_cod_commission_reserve/);
assert.match(codWalletUi, /seller_set_cod_checkout_enabled/);
assert.match(codWalletUi, /seller_request_cod_reserve_deposit/);
assert.match(codAdminUi, /admin_review_seller_cod_reserve_deposit/);
assert.match(supplierEarnings, /codReserveAvailable/);
assert.match(checkoutUi, /gambasket-modempay-checkout/);
assert.match(deliveryUi, /gambasket-delivery-proof/);
assert.match(ordersUi, /data-delivery-code/);
assert.match(ordersUi, /gambasket-modempay-refunds/);
assert.match(walletUi, /gambasket-modempay-payouts/);
for (const source of [checkoutFn, webhookFn, payoutFn, deliveryFn, refundFn, configFn]) {
  assert.doesNotMatch(source, /sk_live_[A-Za-z0-9_-]{8,}|sk_test_[A-Za-z0-9_-]{8,}/);
}
console.log("ModemPay integration contracts passed.");
