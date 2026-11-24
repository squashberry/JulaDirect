/* Restaurant page (food app). */
(async function () {
  "use strict";
  if (!(await JDFood.guardPage())) return;
  const { esc, money, hueOf, safeUrl } = JDFood, $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const app = $("#fa-app"), root = $("#fa-root"); JDFoodUI.mount(app);
  const slug = new URLSearchParams(location.search).get("slug") || "", r = await JDFood.restaurant(slug);
  if (!r) { root.innerHTML = `<p class="fa-empty" style="padding-top:34vh"><b>${FI("utensils", 44)}</b>We couldn't find that restaurant.<br><a href="food.html" style="color:var(--fa-o2);font-weight:800">Browse restaurants</a></p>`; return; }
  const items = await JDFood.menu(r.id), h = hueOf(r), cats = [...new Set(items.map(m => m.category || "Menu"))];
  const pageTitle = r.name + " menu, delivery and pickup — JulaDirect";
  const seoDescription = String(r.description || (r.name + " menu, meals, delivery and pickup in The Gambia on JulaDirect."))
    .replace(/\s+/g, " ").trim().slice(0, 155);
  const canonicalUrl = new URL("/restaurant?slug=" + encodeURIComponent(r.slug), location.origin).href;
  const socialImage = safeUrl(r.cover_url) || safeUrl(r.logo_url) || "https://res.cloudinary.com/jx9bpjdb/image/upload/v1795560311/juladirect-og-fashion.jpg";
  document.title = pageTitle;
  const setSeoMeta = (selector, attr, key, value) => {
    let node = document.querySelector(selector);
    if (!node) { node = document.createElement("meta"); node.setAttribute(attr, key); document.head.appendChild(node); }
    node.setAttribute("content", value);
  };
  setSeoMeta('meta[name="description"]', "name", "description", seoDescription);
  setSeoMeta('meta[name="robots"]', "name", "robots", "index, follow, max-image-preview:large");
  setSeoMeta('meta[property="og:type"]', "property", "og:type", "restaurant");
  setSeoMeta('meta[property="og:site_name"]', "property", "og:site_name", "JulaDirect");
  setSeoMeta('meta[property="og:title"]', "property", "og:title", pageTitle);
  setSeoMeta('meta[property="og:description"]', "property", "og:description", seoDescription);
  setSeoMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
  setSeoMeta('meta[property="og:image"]', "property", "og:image", socialImage);
  setSeoMeta('meta[property="og:image:alt"]', "property", "og:image:alt", r.name + " on JulaDirect");
  setSeoMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
  setSeoMeta('meta[name="twitter:title"]', "name", "twitter:title", pageTitle);
  setSeoMeta('meta[name="twitter:description"]', "name", "twitter:description", seoDescription);
  setSeoMeta('meta[name="twitter:image"]', "name", "twitter:image", socialImage);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
  canonical.href = canonicalUrl;
  const restaurantJsonLd = {
    "@context": "https://schema.org", "@type": "Restaurant", name: r.name, description: seoDescription,
    url: canonicalUrl, image: socialImage, servesCuisine: r.cuisines || undefined,
    telephone: r.phone || r.whatsapp || undefined,
    address: r.location ? { "@type": "PostalAddress", addressLocality: r.location, addressCountry: "GM" } : undefined
  };
  let jsonLdTag = document.getElementById("jd-restaurant-ld");
  if (!jsonLdTag) { jsonLdTag = document.createElement("script"); jsonLdTag.id = "jd-restaurant-ld"; jsonLdTag.type = "application/ld+json"; document.head.appendChild(jsonLdTag); }
  jsonLdTag.textContent = JSON.stringify(restaurantJsonLd).replace(/</g, "\\u003c");
  const ce = FI("plate", 150);
  const bg = safeUrl(r.cover_url), tel = (r.phone || r.whatsapp || "").replace(/[^\d+]/g, "");
  app.style.setProperty("--h", h);
  const row = (m, i) => { const q = JDFoodUI.qtyOf(m.id); return `<article class="fa-row${m.is_available === false ? " is-off" : ""}" style="--h:${h};--i:${i}" data-id="${esc(m.id)}"><span class="th">${JDFoodUI.thumb(m)}</span><div class="n"><b>${esc(m.name)}</b><p>${esc(m.description || "")}</p><div class="pr"><strong>${money(m.price)}${m.spicy ? " " + FI("flame", 13).repeat(m.spicy) : ""}</strong>${q ? `<span class="fa-step"><button type="button" data-d="-1" aria-label="Less">−</button><b>${q}</b><button class="plus" type="button" data-d="1" aria-label="More">+</button></span>` : `<button class="fa-add" type="button" data-d="1" aria-label="Add ${esc(m.name)}"${r.is_open === false ? " disabled" : ""}>+</button>`}</div></div></article>`; };
  root.innerHTML = `<div class="fa-rhero"><div class="fa-bar" style="justify-content:space-between"><a class="fa-rb" href="food.html" aria-label="Back">${FI("back", 22)}</a><span style="display:flex;gap:10px">${tel ? `<a class="fa-rb" href="tel:${esc(tel)}" aria-label="Call">${FI("phone", 20)}</a>` : ""}<button class="fa-rb" id="fa-share" type="button" aria-label="Share">${FI("share", 20)}</button></span></div>
    <div class="fa-cover"${bg ? ` style="background-image:url('${esc(bg)}')"` : ""}>${bg ? "" : `<span>${ce}</span>`}</div>
    <h1 class="fa-rname">${esc(r.name)}</h1><small style="color:var(--fa-mut);font-weight:600">${esc(r.tagline || (r.cuisines || []).join(" · "))}</small>
    <div class="fa-rmeta"><span class="fa-tag fa-tag--${r.is_open ? "on" : "off"}">${r.is_open ? "Open now" : "Closed"}</span>${r.rating ? `<span class="fa-tag fa-tag--i">${FI("star", 12)} ${Number(r.rating).toFixed(1)}</span>` : ""}<span class="fa-tag fa-tag--i">${FI("clock", 13)} ${r.prep_minutes || 25} min</span>${r.offers_delivery ? `<span class="fa-tag fa-tag--i">${FI("scooter", 14)} ${r.delivery_fee ? money(r.delivery_fee) : "Free"}</span>` : ""}${r.offers_pickup ? `<span class="fa-tag fa-tag--i">${FI("bag", 13)} Pickup</span>` : ""}${r.location ? `<span class="fa-tag fa-tag--i">${FI("pin", 13)} ${esc(r.location)}</span>` : ""}</div>
    ${r.is_open === false ? `<p class="fa-closed">${FI("clock", 16)} This restaurant is closed right now. You can browse the menu, but ordering is paused.</p>` : ""}${r.description ? `<p class="fa-rdesc">${esc(r.description)}</p>` : ""}${r.opening_hours ? `<p class="fa-rdesc" style="margin-top:6px"><span class="fa-tag fa-tag--i" style="background:none;padding:0">${FI("clock", 14)} ${esc(r.opening_hours)}</span></p>` : ""}</div>
    ${cats.length ? `<nav class="fa-cats" id="fa-cats">${cats.map((c, i) => `<button class="fa-pill" type="button" data-i="${i}" aria-pressed="${i === 0}"><i></i>${esc(c)}</button>`).join("")}</nav>` : ""}
    <div class="fa-list" id="fa-list">${cats.map((c, ci) => `<h3 id="c${ci}">${esc(c)}</h3>${items.filter(m => (m.category || "Menu") === c).map(row).join("")}`).join("") || '<p class="fa-empty"><b>${FI("chef", 44)}</b>This menu is being prepared.</p>'}</div>`;
  $$(".fa-cats .fa-pill i").forEach(i => i.remove());
  $("#fa-share").addEventListener("click", () => { if (navigator.share) navigator.share({ title: r.name, url: location.href }).catch(() => {}); else navigator.clipboard && navigator.clipboard.writeText(location.href); });
  const byId = id => items.find(m => String(m.id) === String(id));
  const repaint = () => { $$(".fa-row").forEach(el => { const m = byId(el.dataset.id), q = JDFoodUI.qtyOf(m.id), pr = $(".pr", el), cur = pr.lastElementChild, want = q ? "step" : "add"; if ((cur.classList.contains("fa-step") ? "step" : "add") !== want || q) { cur.outerHTML = q ? `<span class="fa-step"><button type="button" data-d="-1" aria-label="Less">−</button><b>${q}</b><button class="plus" type="button" data-d="1" aria-label="More">+</button></span>` : `<button class="fa-add" type="button" data-d="1" aria-label="Add ${esc(m.name)}">+</button>`; } }); };
  JDFoodUI.onChange(repaint);
  $("#fa-list").addEventListener("click", e => { const el = e.target.closest(".fa-row"); if (!el) return; const m = byId(el.dataset.id), d = e.target.closest("[data-d]"); if (d) { JDFoodUI.setQty(r, m, JDFoodUI.qtyOf(m.id) + Number(d.dataset.d)); return; } JDFoodUI.openMeal(m, r); });
  const cats$ = $("#fa-cats"); if (cats$) {
    cats$.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) scrollTo({ top: $("#c" + b.dataset.i).getBoundingClientRect().top + scrollY - 70, behavior: "smooth" }); });
    const spy = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { const i = en.target.id.slice(1); $$("#fa-cats .fa-pill").forEach(p => p.setAttribute("aria-pressed", String(p.dataset.i === i))); const a = $(`#fa-cats [data-i="${i}"]`); cats$.scrollTo({ left: a.offsetLeft - 20, behavior: "smooth" }); } }), { rootMargin: "-20% 0px -70% 0px" });
    cats.forEach((c, i) => spy.observe($("#c" + i)));
  }
  const hash = decodeURIComponent(location.hash.slice(1)); if (hash && byId(hash)) setTimeout(() => JDFoodUI.openMeal(byId(hash), r), 500);
})();
