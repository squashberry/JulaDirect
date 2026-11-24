const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const httpsUrl = u => (/^https:\/\/[^\s"'<>]+$/.test(String(u || "")) ? String(u) : "");
async function credentials(env, request) {
  if (env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) return { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY };
  try {
    const res = await env.ASSETS.fetch(new URL("/js/config.js", request.url));
    const text = await res.text();
    const u = text.match(/SUPABASE_URL\s*:\s*["']([^"']+)["']/);
    const k = text.match(/SUPABASE_PUBLISHABLE_KEY\s*:\s*["']([^"']+)["']/);
    if (u && k) return { url: u[1], key: k[1] };
  } catch (e) { /* fall through */ }
  return null;
}
async function rest(c, path) {
  const res = await fetch(c.url + "/rest/v1/" + path, {
    headers: { apikey: c.key, Authorization: "Bearer " + c.key, Accept: "application/json" },
    signal: AbortSignal.timeout(3500)
  });
  if (!res.ok) throw new Error("Supabase " + res.status);
  return res.json();
}

export async function onRequestGet({ request, env, next }) {
  const base = await next();
  try {
    const url = new URL(request.url), id = url.searchParams.get("id") || "";
    if (!base.ok || !UUID.test(id)) return base;
    const c = await credentials(env, request);
    if (!c) return base;
    const [profiles, stores, products] = await Promise.all([
      rest(c, "public_profiles?id=eq." + id + "&select=id,first_name,last_name,avatar_url,region,area,business_name,seller_type,is_seller_verified&limit=1"),
      rest(c, "stores?seller_id=eq." + id + "&is_active=eq.true&select=name,description,category,logo_url,banner_url,location,is_verified,created_at&limit=1").catch(() => []),
      rest(c, "products?seller_id=eq." + id + "&status=eq.approved&select=id,title,price,currency,main_image,category_id,stock&order=created_at.desc&limit=12").catch(() => [])
    ]);
    if (!profiles.length || (!stores.length && !products.length)) {
      const missing = new HTMLRewriter().on("title", { element(el) { el.setInnerContent("Seller profile not found — JulaDirect"); } })
        .on("head", { element(el) { el.append('<meta name="robots" content="noindex, nofollow">', { html: true }); } }).transform(base);
      return new Response(missing.body, { status: 404, headers: base.headers });
    }
    const p = profiles[0], store = stores[0] || {};
    const name = store.name || p.business_name || [p.first_name,p.last_name].filter(Boolean).join(" ") || "JulaDirect seller";
    const description = String(store.description || (name + " offers products on JulaDirect, The Gambia's online marketplace. Browse listings, compare details and contact the seller."))
      .replace(/\s+/g, " ").trim().slice(0, 155);
    const canonical = url.origin + "/seller?id=" + id;
    const image = httpsUrl(store.banner_url) || httpsUrl(store.logo_url) || httpsUrl(p.avatar_url) || (url.origin + "/assets/juladirect-og.jpg");
    const entity = { "@type": (store.name || p.seller_type === "business") ? "Organization" : "Person", "@id":canonical+"#profile", "name":name, "description":description, "url":canonical, "image":image,
      "address": (store.location || p.region || p.area) ? {"@type":"PostalAddress","addressLocality":store.location || [p.area,p.region].filter(Boolean).join(", "),"addressCountry":"GM"} : undefined };
    const jsonld = {"@context":"https://schema.org","@type":"ProfilePage","name":name+" — JulaDirect","url":canonical,"description":description,"mainEntity":entity};
    const head =
      '<meta name="robots" content="index, follow, max-image-preview:large"><link rel="canonical" href="' + esc(canonical) + '">' +
      '<meta property="og:type" content="profile"><meta property="og:site_name" content="JulaDirect">' +
      '<meta property="og:title" content="' + esc(name+" — Seller on JulaDirect") + '"><meta property="og:description" content="' + esc(description) + '">' +
      '<meta property="og:url" content="' + esc(canonical) + '"><meta property="og:image" content="' + esc(image) + '">' +
      '<meta property="og:image:secure_url" content="' + esc(image) + '"><meta property="og:image:alt" content="' + esc(name+" seller profile on JulaDirect") + '">' +
      '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(name+" — Seller on JulaDirect") + '">' +
      '<meta name="twitter:description" content="' + esc(description) + '"><meta name="twitter:image" content="' + esc(image) + '">' +
      '<script type="application/ld+json" id="jd-profile-ld">' + JSON.stringify(jsonld).replace(/</g, "\\u003c") + "</script>";
    const ssr = '<article class="jd-ssr"><h1>' + esc(name) + '</h1><img src="' + esc(image) + '" alt="' + esc(name) + '" width="640" height="360">' +
      (store.category ? '<p>' + esc(store.category) + '</p>' : '') + '<p>' + esc(description) + '</p>' +
      (store.location || p.region ? '<p>' + esc(store.location || [p.area,p.region].filter(Boolean).join(", ")) + ', The Gambia</p>' : '') +
      '<h2>Products from ' + esc(name) + '</h2><ul>' + products.map(x => '<li><a href="/product?id=' + encodeURIComponent(x.id) + '">' + esc(x.title) + '</a>' +
      (x.price != null ? ' — ' + esc((x.currency === "GMD" || !x.currency ? "D" : x.currency) + " " + Number(x.price).toLocaleString("en-GB")) : '') + '</li>').join("") + '</ul></article>';
    const out = new HTMLRewriter().on("title", { element(el) { el.setInnerContent(name + " — Seller on JulaDirect"); } })
      .on('meta[name="description"]', { element(el) { el.setAttribute("content", description); } })
      .on("head", { element(el) { el.append(head, { html: true }); } })
      .on("#pf-root", { element(el) { el.setInnerContent(ssr, { html: true }); } }).transform(base);
    const headers = new Headers(base.headers); headers.delete("content-length");
    headers.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    return new Response(out.body, { status:200, headers });
  } catch (e) { return base; }
}
