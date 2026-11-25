// Creates a ModemPay hosted payment for an existing gift_orders row.
// The card is NEVER issued here: issuance happens only in the signed webhook -> gift_process_payment().
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://juladirect.pages.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const env = (n: string) => Deno.env.get(n) || "";
function serviceKey(): string {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_KEY");
  if (direct) return direct;
  const raw = env("SUPABASE_SECRET_KEYS");
  if (raw) { try { const p = JSON.parse(raw); return p.default || Object.values(p)[0] || ""; } catch { return raw; } }
  return "";
}
const base = () => env("SUPABASE_URL").replace(/\/$/, "");
async function readJson(r: Response) { const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return { raw: t.slice(0, 300) }; } }
async function rest(path: string, init: RequestInit = {}) {
  const k = serviceKey(); if (!k) throw new Error("Supabase service credentials are not configured");
  const r = await fetch(base() + "/rest/v1/" + path, { ...init, headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(init.headers || {}) } });
  const d = await readJson(r); if (!r.ok) throw new Error("Database request failed (" + r.status + ")"); return d;
}
async function user(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""); if (!token) throw new Error("Authentication required");
  const r = await fetch(base() + "/auth/v1/user", { headers: { apikey: serviceKey(), Authorization: "Bearer " + token } });
  const d = await readJson(r); if (!r.ok || !d?.id) throw new Error("Invalid or expired session"); return d;
}
const safe = (v: unknown) => String(v || "Request failed").replace(/sk_(?:live|test)_[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 300);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const u = await user(req);
    if (env("MODEMPAY_CHECKOUT_ENABLED") !== "true" || !env("MODEMPAY_API_KEY") || !env("MODEMPAY_WEBHOOK_SECRET"))
      return json({ error: "Online payment is not enabled for JulaDirect yet, so gift cards cannot be purchased right now." }, 503);
    const input = await req.json();
    const orderId = String(input.order_id || ""); const method = String(input.payment_method || "").toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || !["wave", "qmoney", "afrimoney"].includes(method)) return json({ error: "Invalid order or payment method." }, 400);
    const rows = await rest("gift_orders?select=id,total,currency,payment_status,payment_link,payment_attempts,program&id=eq." + orderId + "&purchaser_id=eq." + encodeURIComponent(u.id) + "&limit=1");
    const o = rows && rows[0];
    if (!o) return json({ error: "Gift order not found." }, 404);
    if (o.payment_status === "paid") return json({ error: "This gift card is already paid." }, 409);
    if (o.payment_status === "cancelled") return json({ error: "This gift order was cancelled." }, 409);
    if (o.payment_status === "pending" && o.payment_link) return json({ success: true, payment_url: o.payment_link, reused: true });
    const attempt = Number(o.payment_attempts || 0) + 1;
    const ret = "https://juladirect.pages.dev/gift-cards.html?gift_return=1&order=" + encodeURIComponent(orderId);
    const res = await fetch((env("MODEMPAY_BASE_URL") || "https://api.modempay.com").replace(/\/$/, "") + "/v1/payments", {
      method: "POST",
      headers: { Authorization: "Bearer " + env("MODEMPAY_API_KEY"), "Content-Type": "application/json", "Idempotency-Key": "gift-order-" + orderId + "-" + attempt },
      body: JSON.stringify({ data: {
        amount: Number(o.total), currency: "GMD", title: "JulaDirect gift card", description: "Secure payment for your JulaDirect gift card",
        payment_methods: ["wallet"], metadata: { gift_order_id: orderId, requested_wallet: method }, return_url: ret, cancel_url: ret, from_sdk: false } })
    });
    const body = await readJson(res); const data = body?.data?.data || body?.data || body;
    if (!res.ok) {
      await rest("gift_orders?id=eq." + orderId, { method: "PATCH", body: JSON.stringify({ payment_status: "failed", payment_attempts: attempt, updated_at: new Date().toISOString() }) });
      return json({ error: "ModemPay could not create the payment request. You have not been charged." }, 502);
    }
    const url = String(data?.payment_link || data?.checkout_url || "");
    if (!/^https:\/\//i.test(url) || !/modempay\.com\//i.test(url)) return json({ error: "ModemPay did not return a valid checkout page." }, 502);
    await rest("gift_orders?id=eq." + orderId + "&payment_status=neq.paid", { method: "PATCH", body: JSON.stringify({
      payment_status: "pending", payment_link: url, payment_attempts: attempt, provider_intent_id: data?.id || data?.payment_intent_id || null, updated_at: new Date().toISOString() }) });
    return json({ success: true, payment_url: url });
  } catch (e) { return json({ error: safe((e as Error)?.message) }, 400); }
});
