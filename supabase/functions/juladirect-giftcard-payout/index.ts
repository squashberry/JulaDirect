
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://juladirect.pages.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-modem-signature, x-gambasket-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const env = (name: string) => Deno.env.get(name) || "";
function serviceKey(): string {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_KEY");
  if (direct) return direct;
  const raw = env("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return parsed.default || Object.values(parsed)[0] || "";
    } catch { return raw; }
  }
  return "";
}
const supabaseUrl = () => env("SUPABASE_URL").replace(/\/$/, "");
async function readJson(response: Response) {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : {}; } catch { return { raw: raw.slice(0, 500) }; }
}
async function rest(path: string, init: RequestInit = {}) {
  const key = serviceKey();
  if (!key) throw new Error("Supabase service credentials are not configured");
  const response = await fetch(supabaseUrl() + "/rest/v1/" + path, {
    ...init,
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error("Database request failed (" + response.status + "): " + JSON.stringify(data).slice(0, 400));
  return data;
}
async function rpc(name: string, args: Record<string, unknown>) {
  return await rest("rpc/" + name, { method: "POST", body: JSON.stringify(args) });
}
async function rpcAsUser(name: string, args: Record<string, unknown>, token: string) {
  const key = serviceKey();
  const response = await fetch(supabaseUrl() + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.message || data?.hint || ("Request failed (" + response.status + ")"));
  return data;
}
async function authenticatedUser(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication required");
  const key = serviceKey();
  const response = await fetch(supabaseUrl() + "/auth/v1/user", {
    headers: { apikey: key, Authorization: "Bearer " + token }
  });
  const data = await readJson(response);
  if (!response.ok || !data?.id) throw new Error("Invalid or expired session");
  return { user: data, token };
}
function safeProviderMessage(value: unknown) {
  return String(value || "Provider request failed")
    .replace(/sk_(?:live|test)_[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
}

async function requireAdmin(req: Request) {
  const auth = await authenticatedUser(req);
  const isAdmin = await rpcAsUser("gift_is_admin", {}, auth.token);
  if (isAdmin !== true) throw new Error("Administrator access required");
  return auth;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pays an approved gift-card settlement to the restaurant's approved Wave / Afrimoney number. Admin only.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    await requireAdmin(req);
    const body = await req.json();
    const settlementId = String(body.settlement_id || "");
    if (!UUID.test(settlementId)) return json({ error: "Invalid settlement" }, 400);
    if (!env("MODEMPAY_API_KEY") || env("MODEMPAY_PAYOUTS_ENABLED") !== "true") {
      return json({ error: "ModemPay payouts are not enabled. Pay the restaurant yourself and mark the settlement paid with the reference." }, 503);
    }
    const begun = await rpc("gift_settlement_begin", { p_settlement: settlementId });
    if (!begun?.ok) return json({ error: begun?.error === "NO_PAYOUT_METHOD" ? "This restaurant has no approved payout number yet." : "This settlement cannot be paid now (" + begun?.error + ")." }, 409);
    const base = (env("MODEMPAY_BASE_URL") || "https://api.modempay.com").replace(/\/$/, "");
    const response = await fetch(base + "/v1/transfers", {
      method: "POST",
      headers: { Authorization: "Bearer " + env("MODEMPAY_API_KEY"), "Content-Type": "application/json", "Idempotency-Key": "juladirect-gift-settlement-" + settlementId },
      body: JSON.stringify({ amount: Number(begun.amount), currency: "GMD", network: begun.network, account_number: begun.account_number,
        beneficiary_name: begun.beneficiary_name, narration: "JulaDirect gift card settlement",
        metadata: { juladirect_gift_settlement_id: settlementId, juladirect_restaurant_id: begun.restaurant_id } })
    });
    const providerBody = await readJson(response);
    const data = providerBody?.data?.data || providerBody?.data || providerBody;
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        await rpc("gift_settlement_finish", { p_settlement: settlementId, p_ok: false, p_error: safeProviderMessage(providerBody?.message || providerBody?.error) });
        return json({ error: "ModemPay rejected the transfer. The settlement is back to pending." }, 502);
      }
      return json({ success: true, pending_reconciliation: true, message: "The provider's answer is uncertain. The settlement stays 'processing'. Check ModemPay, then mark it paid or cancel it. Do not retry blindly." }, 202);
    }
    const status = String(data?.status || "").toLowerCase();
    if (["completed", "succeeded"].includes(status)) {
      await rpc("gift_settlement_finish", { p_settlement: settlementId, p_ok: true, p_reference: String(data?.id || data?.transfer_id || "modempay").slice(0, 120) });
      return json({ success: true, status: "paid" });
    }
    if (["failed", "reversed"].includes(status)) {
      await rpc("gift_settlement_finish", { p_settlement: settlementId, p_ok: false, p_error: safeProviderMessage(data?.message || status) });
      return json({ error: "ModemPay reported the transfer as " + status + ". The settlement is back to pending." }, 502);
    }
    return json({ success: true, pending_reconciliation: true, status: "processing", message: "ModemPay accepted the transfer but has not confirmed it yet. Check ModemPay, then mark the settlement paid." }, 202);
  } catch (error) { return json({ error: safeProviderMessage((error as Error)?.message || error) }, 400); }
});
