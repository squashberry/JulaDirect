import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const migrationsDir = "supabase/migrations";
const names = [
  "20261114090000_gambasket_finance_ledger.sql",
  "20261114091000_gambasket_seller_wallet_payouts.sql",
  "20261114092000_gambasket_refunds_delivery_proof.sql",
  "20261114093000_admin_payout_method_review.sql",
  "20261114094000_persist_order_discounts.sql"
];
const migrations = names.map(name => readFileSync(`${migrationsDir}/${name}`, "utf8"));
const [ledger, payouts, refunds] = migrations;
const allSql = readdirSync(migrationsDir)
  .filter(name => name.endsWith(".sql"))
  .map(name => readFileSync(`${migrationsDir}/${name}`, "utf8"))
  .join("\n");

assert.match(ledger, /commission_rate numeric\(5,2\) NOT NULL DEFAULT 5\.00/);
assert.match(ledger, /seller_release_window_hours integer NOT NULL DEFAULT 24/);
assert.match(ledger, /refund_provider_window_hours integer NOT NULL DEFAULT 48/);
assert.match(ledger, /CREATE CONSTRAINT TRIGGER seller_wallet_batch_balanced/);
assert.match(ledger, /CREATE CONSTRAINT TRIGGER seller_wallet_entries_balanced/);
assert.match(ledger, /CREATE TRIGGER seller_wallet_entries_immutable/);
assert.match(ledger, /CREATE POLICY seller_wallet_entries_owner_read/);
assert.match(ledger, /UNIQUE\s*\(provider, provider_event_id\)/);

assert.match(payouts, /network IN \('wave','afrimoney'\)/);
assert.match(payouts, /CREATE FUNCTION public\.seller_get_wallet_summary/);
assert.match(payouts, /CREATE FUNCTION public\.seller_add_payout_method/);
assert.match(payouts, /CREATE FUNCTION public\.seller_update_wallet_preferences/);
assert.match(payouts, /CREATE FUNCTION public\.seller_request_payout/);
assert.match(payouts, /pg_advisory_xact_lock/);
assert.match(payouts, /payout-reservation:/);
assert.match(payouts, /INSUFFICIENT_AVAILABLE_BALANCE/);
assert.match(allSql, /FUNCTION public\.admin_review_seller_payout_method/);
assert.match(allSql, /ADD COLUMN IF NOT EXISTS discount_amount/);
assert.match(allSql, /set_gambasket_order_discount_amount/);

assert.match(refunds, /CREATE TABLE public\.order_refund_cases/);
assert.match(refunds, /CREATE TABLE public\.order_refund_events/);
assert.match(refunds, /CREATE TABLE public\.delivery_otp_confirmations/);
assert.match(refunds, /REVOKE ALL ON TABLE public\.order_refund_cases, public\.order_refund_events,/);
assert.match(refunds, /No client policy exists for delivery_otp_confirmations/);

const onlineOnly = readFileSync(
  "supabase/migrations/20261123001500_online_payment_only_checkout.sql",
  "utf8"
);
assert.match(onlineOnly, /v_method NOT IN \('wave','qmoney','afrimoney'\)/);
assert.match(onlineOnly, /ONLINE_PAYMENT_REQUIRED/);
assert.match(onlineOnly, /NEW\.payment_method IN \('pending_online','wave','qmoney','afrimoney'\)/);

const checkoutHtml = readFileSync("checkout.html", "utf8");
assert.doesNotMatch(checkoutHtml, /id="cod"/i, "Cash on Delivery must not be offered to buyers.");
for (const method of ["wave", "qmoney", "afrimoney"]) {
  assert.match(checkoutHtml, new RegExp('id="' + method + '"'));
}
assert.match(allSql, /SET refund_provider_window_hours = 24/i);
assert.match(allSql, /make_interval\(hours => v_window_hours\)/i);
assert.match(allSql, /pickup_station_name text/i);
assert.match(allSql, /JulaDirect Pickup Station/i);
assert.match(checkoutHtml, /24-hour refund eligibility/i);
assert.match(checkoutHtml, /id="pickup" value="pickup_station"/i);
assert.match(checkoutHtml, /Banjul, The Gambia/i);
assert.match(checkoutHtml, /subject to JulaDirect review/i);

console.log("PASS: JulaDirect financial foundation schema and security contracts.");
console.log("PASS: 5% commission, 24-hour seller release and refund eligibility windows, pickup station routing and private OTP records.");
console.log("PASS: New orders require Wave, QMoney or Afrimoney; COD remains historical only.");
