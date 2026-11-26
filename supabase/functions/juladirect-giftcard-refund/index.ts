
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

// Sends the unspent value of a cancelled gift card back through ModemPay. Admin only.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    await requireAdmin(req);
    const body = await req.json();
    const refundId = String(body.refund_id || "");
    if (!UUID.test(refundId)) return json({ error: "Invalid refund" }, 400);
    if (!env("MODEMPAY_API_KEY") || env("MODEMPAY_REFUNDS_ENABLED") !== "true") {
      return json({ error: "ModemPay refunds are not enabled. Refund the buyer yourself and record it as a manual refund." }, 503);
    }
    const begun = await rpc("gift_refund_begin", { p_refund: refundId });
    if (!begun?.ok) return json({ error: "This refund cannot be sent again (" + (begun?.status || begun?.error) + ")." }, 409);
    const base = (env("MODEMPAY_BASE_URL") || "https://api.modempay.com").replace(/\/$/, "");
    const response = await fetch(base + "/v1/transactions/refund", {
      method: "POST",
      headers: { Authorization: "Bearer " + env("MODEMPAY_API_KEY"), "Content-Type": "application/json", "Idempotency-Key": "juladirect-gift-refund-" + refundId },
      body: JSON.stringify({ reference: begun.provider_reference, amount: Number(begun.amount) })
    });
    const providerBody = await readJson(response);
    const data = providerBody?.data?.data || providerBody?.data || providerBody;
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        await rpc("gift_refund_finish", { p_refund: refundId, p_ok: false, p_note: safeProviderMessage(providerBody?.message || providerBody?.error) });
        return json({ error: "ModemPay rejected the refund. It stays queued so you can retry or refund manually." }, 502);
      }
      return json({ success: true, pending_reconciliation: true, message: "The provider's answer is uncertain. Check ModemPay, then record the result as a manual refund. Do not retry blindly." }, 202);
    }
    const status = String(data?.status || "").toLowerCase();
    const ok = providerBody?.success === true || data?.success === true || ["completed", "succeeded", "refunded"].includes(status);
    if (!ok) return json({ success: true, pending_reconciliation: true, message: "ModemPay has not confirmed the final status yet. Check ModemPay, then record it as a manual refund." }, 202);
    await rpc("gift_refund_finish", { p_refund: refundId, p_ok: true, p_note: String(data?.id || data?.reference || "modempay").slice(0, 120) });
    return json({ success: true, status: "succeeded" });
  } catch (error) { return json({ error: safeProviderMessage((error as Error)?.message || error) }, 400); }
});
