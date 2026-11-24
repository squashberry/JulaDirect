/* Server-rendered restaurant page for search engines and social previews.
   Route: /restaurant.html?slug=<restaurant-slug>. The food-page client takes over
   after the server has supplied crawlable menu content and restaurant metadata. */
const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[ch]));
const httpsUrl = value => /^https:\/\/[^\s"'<>]+$/.test(String(value || "")) ? String(value) : "";
async function credentials(env, request) {
  if (env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) {
    return { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY };
  }
  try {
    const res = await env.ASSETS.fetch(new URL("/js/config.js", request.url));
    const text = await res.text();
    const url = text.match(/SUPABASE_URL\s*:\s*["']([^"']+)["']/);
    const key = text.match(/SUPABASE_PUBLISHABLE_KEY\s*:\s*["']([^"']+)["']/);
    if (url && key) return { url: url[1], key: key[1] };
  } catch (e) { /* use static fallback */ }
  return null;
}
async function rest(c, path) {
  const res = await fetch(c.url + "/rest/v1/" + path, {
    headers: { apikey: c.key, Authorization: "Bearer " + c.key, Accept: "application/json" },
    signal: AbortSignal.timeout(4000)
  });
  if (!res.ok) throw new Error("Supabase " + res.status);
  return res.json();
}
const money = value => "D " + Number(value || 0).toLocaleString("en-GM", { maximumFractionDigits: 2 });

export async function onRequestGet({ request, env, next }) {
  const base = await next();
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug") || "";
    if (!base.ok || !/^[a-z0-9-]{2,60}$/.test(slug)) return base;
    const c = await credentials(env, request);
    if (!c) return base;
    const restaurants = await rest(c, "restaurants?slug=eq." + encodeURIComponent(slug) +
      "&status=eq.approved&select=id,name,slug,tagline,description,cuisines,logo_url,cover_url,location,phone,whatsapp,opening_hours,offers_delivery,offers_pickup,delivery_fee,min_order,prep_minutes,is_open,rating,updated_at&limit=1");
    if (!restaurants.length) {
      const missing = new HTMLRewriter()
        .on("title", { element(el) { el.setInnerContent("Restaurant not found — JulaDirect"); } })
        .on('meta[name="robots"]', { element(el) { el.setAttribute("content", "noindex, nofollow"); } })
        .transform(base);
      return new Response(missing.body, { status: 404, headers: base.headers });
    }
    const r = restaurants[0];
    const menu = await rest(c, "restaurant_menu_items?restaurant_id=eq." + r.id +
      "&is_available=eq.true&select=id,category,name,description,price,image_url,emoji,tags,spicy,is_featured,sort&order=category.asc,sort.asc,name.asc&limit=100").catch(() => []);
    const title = r.name + " menu, delivery and pickup — JulaDirect";
    const clean = String(r.description || "").replace(/\s+/g, " ").trim();
    const description = (clean || (r.name + " menu, meals, delivery and pickup in " + (r.location || "The Gambia") + " on JulaDirect."))
      .slice(0, 155);
    const canonical = url.origin + "/restaurant.html?slug=" + encodeURIComponent(r.slug);
    const image = httpsUrl(r.cover_url) || httpsUrl(r.logo_url) || (url.origin + "/assets/juladirect-og.jpg");
    const categories = [...new Set(menu.map(item => item.category || "Menu"))];
    const menuSections = categories.map(category => ({
      "@type":"MenuSection", name:category,
      hasMenuItem:menu.filter(item => (item.category || "Menu") === category).map(item => ({
        "@type":"MenuItem", name:item.name, description:item.description || undefined,
        offers:{"@type":"Offer",price:Number(item.price || 0),priceCurrency:"GMD"}
      }))
    }));
    const schema = {
      "@context":"https://schema.org", "@type":"Restaurant", name:r.name, description,
      url:canonical, image, servesCuisine:r.cuisines || undefined,
      telephone:r.phone || r.whatsapp || undefined,
      address:r.location ? {"@type":"PostalAddress",addressLocality:r.location,addressCountry:"GM"} : undefined,
      hasMenu:{"@type":"Menu",hasMenuSection:menuSections}
    };
    const ssr = '<article class="fa-rhero"><h1 class="fa-rname">' + esc(r.name) + '</h1>' +
      (r.tagline ? '<p>' + esc(r.tagline) + '</p>' : '') +
      (r.location ? '<p>' + esc(r.location) + ', The Gambia</p>' : '') +
      '<p>' + (r.offers_delivery ? 'Delivery available' : 'Pickup available') +
      (r.offers_pickup ? ' · Pickup also available' : '') + '</p>' +
      (r.description ? '<p>' + esc(r.description) + '</p>' : '') +
      '<p>' + (r.is_open ? 'Open now' : 'Currently closed') + ' · ' + Number(r.prep_minutes || 25) + ' minute preparation time</p></article>' +
      '<section class="fa-list"><h2>Menu</h2>' +
      (menu.length ? categories.map(category => '<section><h3>' + esc(category) + '</h3><ul>' +
        menu.filter(item => (item.category || "Menu") === category).map(item =>
          '<li><strong>' + esc(item.name) + '</strong> — ' + esc(money(item.price)) +
          (item.description ? '<p>' + esc(item.description) + '</p>' : '') + '</li>'
        ).join("") + '</ul></section>').join("") : '<p>Menu details are loading. Open the page to browse available meals.</p>') +
      '</section>';
    const headScript = '<script type="application/ld+json" id="jd-restaurant-ld">' +
      JSON.stringify(schema).replace(/</g, "\\u003c") + "</script>";
    const out = new HTMLRewriter()
      .on("title", { element(el) { el.setInnerContent(title); } })
      .on('meta[name="description"]', { element(el) { el.setAttribute("content", description); } })
      .on('meta[name="robots"]', { element(el) { el.setAttribute("content", "index, follow, max-image-preview:large"); } })
      .on('link[rel="canonical"]', { element(el) { el.setAttribute("href", canonical); } })
      .on('meta[property="og:title"]', { element(el) { el.setAttribute("content", title); } })
      .on('meta[property="og:description"]', { element(el) { el.setAttribute("content", description); } })
      .on('meta[property="og:url"]', { element(el) { el.setAttribute("content", canonical); } })
      .on('meta[property="og:image"]', { element(el) { el.setAttribute("content", image); } })
      .on('meta[property="og:image:secure_url"]', { element(el) { el.setAttribute("content", image); } })
      .on('meta[property="og:image:alt"]', { element(el) { el.setAttribute("content", r.name + " on JulaDirect"); } })
      .on('meta[name="twitter:title"]', { element(el) { el.setAttribute("content", title); } })
      .on('meta[name="twitter:description"]', { element(el) { el.setAttribute("content", description); } })
      .on('meta[name="twitter:image"]', { element(el) { el.setAttribute("content", image); } })
      .on("head", { element(el) { el.append(headScript, { html:true }); } })
      .on("#fa-root", { element(el) { el.setInnerContent(ssr, { html:true }); } })
      .transform(base);
    const headers = new Headers(base.headers);
    headers.delete("content-length");
    headers.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    return new Response(out.body, { status:200, headers });
  } catch (e) {
    return base;
  }
}