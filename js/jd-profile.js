/* =========================================================
   JulaDirect public profiles: Seller storefront and Supplier (wholesale) profile.
   UI only. It renders whatever data it is given and falls back to demo data, so the
   pages look finished before anything is wired.

   HOW TO WIRE
     JDProfile.mount({ kind: "seller" | "supplier", data })      render a profile
     JDProfile.setProducts(list)                                  replace the product grid
     JDProfile.setReviews({ summary, items })                     replace the reviews tab
   Everything the user does is emitted as a DOM event on `document` (detail in brackets):
     jdprofile:follow   [{ following }]          jdprofile:message  [{ profile }]
     jdprofile:share    [{ url }]                jdprofile:search   [{ q }]
     jdprofile:sort     [{ sort }]               jdprofile:filter   [{ category }]
     jdprofile:quote    [{ product, quantity, name, phone, note }]   (supplier only)
   Data: set data.sellerId (auto-looks up the published website) or data.website (a squashberrypro.pages.dev URL) to show the "Visit website" link.
   Data shapes are documented at the bottom of this file (DEMO_*).
   ========================================================= */
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const I = (n, s) => (window.JD && JD.icon ? JD.icon(n, s || 18) : "");
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent("jdprofile:" + name, { detail }));
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const money = n => "D " + Number(n || 0).toLocaleString("en-GB");
  const url = u => { if (!u) return ""; try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };
  const initial = s => esc(String(s || "?").trim().charAt(0).toUpperCase());
  const stars = r => { const n = Math.round(r * 2) / 2; let h = ""; for (let i = 1; i <= 5; i++) h += '<svg class="pf-star' + (i <= n ? " is-on" : i - 0.5 === n ? " is-half" : "") + '" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"/></svg>'; return '<span class="pf-stars" role="img" aria-label="' + r + ' out of 5">' + h + "</span>"; };
  const tint = s => { let h = 0; String(s || "").split("").forEach(c => { h = (h * 31 + c.charCodeAt(0)) % 360; }); return "hsl(" + h + " 70% 92%)"; };
  const media = (src, label, cls) => src && url(src) ? '<img class="' + (cls || "") + '" src="' + esc(url(src)) + '" alt="" loading="lazy" decoding="async">' : '<span class="pf-ph ' + (cls || "") + '" style="background:' + tint(label) + '">' + initial(label) + "</span>";

  let state = { kind: "seller", data: null, products: [], category: "All", sort: "new", q: "", following: false };

  /* ---------------- pieces ---------------- */
  /* Website link: only for https://squashberrypro.pages.dev sites the seller published through JulaDirect. */
  const siteOk = u => { try { const x = new URL(u); return x.origin === "https://squashberrypro.pages.dev" ? x.href : ""; } catch (e) { return ""; } };
  const websiteItem = u => siteOk(u) ? '<li class="pf-site">' + I("globe", 15) + '<a href="' + esc(siteOk(u)) + '" target="_blank" rel="noopener noreferrer">Visit website ↗</a></li>' : "";
  async function lookupWebsite(d) {
    if (d.website || !d.sellerId || !window.JD || !JD.client) return;
    try { const c = await JD.client(); const { data } = await c.rpc("public_store_website", { p_seller: d.sellerId }); const row = Array.isArray(data) ? data[0] : data; if (row && siteOk(row.public_url) && !$(".pf-site")) { const ul = $(".pf-meta"); if (ul) ul.insertAdjacentHTML("beforeend", websiteItem(row.public_url)); } } catch (e) { /* not published or not wired yet */ }
  }
  function hero(d, kind) {
    const badges = [];
    if (d.verified) badges.push('<span class="pf-badge pf-badge--ok">' + I("shield", 14) + (kind === "supplier" ? "Verified supplier" : "Verified seller") + "</span>");
    if (d.topRated) badges.push('<span class="pf-badge pf-badge--gold">' + I("star", 14) + "Top rated</span>");
    const meta = [d.location && [I("pin", 15), d.location], d.joined && [I("user", 15), "Member since " + d.joined], d.responseTime && [I("message", 15), "Replies " + d.responseTime]].filter(Boolean).map(m => "<li>" + m[0] + "<span>" + esc(m[1]) + "</span></li>").join("") + websiteItem(d.website);
    return '<header class="pf-hero"><div class="pf-cover">' + (url(d.cover) ? '<img src="' + esc(url(d.cover)) + '" alt="">' : "") + '<span class="pf-cover__shade"></span></div>' +
      '<div class="pf-head"><div class="pf-avatar">' + media(d.avatar, d.name) + "</div>" +
      '<div class="pf-id"><div class="pf-badges">' + badges.join("") + '</div><h1 class="pf-name">' + esc(d.name) + "</h1>" + (d.tagline ? '<p class="pf-tag">' + esc(d.tagline) + "</p>" : "") + '<ul class="pf-meta">' + meta + "</ul></div>" +
      '<div class="pf-cta">' + (kind === "supplier"
        ? '<button type="button" class="jd-btn jd-btn--primary pf-btn" data-pf="quote">' + I("message", 18) + "Request a quote</button>"
        : '<button type="button" class="jd-btn jd-btn--primary pf-btn" data-pf="message">' + I("message", 18) + "Message</button>") +
      '<button type="button" class="jd-btn jd-btn--secondary pf-btn pf-follow" data-pf="follow" aria-pressed="false">' + I("heart", 18) + "<span>Follow</span></button>" +
      '<button type="button" class="pf-icon-btn" data-pf="share" aria-label="Share this profile">' + I("share", 19) + "</button></div></div></header>";
  }
  function stats(d, kind) {
    const items = kind === "supplier"
      ? [[d.rating ? d.rating.toFixed(1) : "–", "Rating", d.reviewCount ? d.reviewCount + " reviews" : ""], [d.years ? d.years + " yrs" : "–", "In business", ""], [d.moq || "–", "Typical MOQ", ""], [d.leadTime || "–", "Lead time", ""], [d.responseRate ? d.responseRate + "%" : "–", "Response rate", ""]]
      : [[d.rating ? d.rating.toFixed(1) : "–", "Rating", d.reviewCount ? d.reviewCount + " reviews" : ""], [d.sold != null ? Number(d.sold).toLocaleString("en-GB") : "–", "Items sold", ""], [d.productCount != null ? d.productCount : "–", "Products", ""], [d.followers != null ? Number(d.followers).toLocaleString("en-GB") : "–", "Followers", ""], [d.responseRate ? d.responseRate + "%" : "–", "Response rate", ""]];
    return '<section class="pf-stats" aria-label="Key figures">' + items.map(s => '<div class="pf-stat"><b>' + esc(s[0]) + "</b><span>" + esc(s[1]) + "</span>" + (s[2] ? "<small>" + esc(s[2]) + "</small>" : "") + "</div>").join("") + "</section>";
  }
  function tabs(kind) {
    const t = kind === "supplier" ? [["catalog", "Catalogue"], ["about", "About"], ["capabilities", "Capabilities"], ["reviews", "Reviews"], ["faq", "FAQ"]] : [["products", "Products"], ["about", "About"], ["reviews", "Reviews"], ["policies", "Policies"]];
    return '<nav class="pf-tabs" aria-label="Profile sections"><div class="pf-tabs__in" role="tablist">' + t.map((x, i) => '<button type="button" role="tab" class="pf-tab" data-tab="' + x[0] + '" aria-selected="' + (i === 0) + '">' + x[1] + "</button>").join("") + "</div></nav>";
  }
  function card(p, kind) {
    const tiers = kind === "supplier" && p.tiers && p.tiers.length ? '<div class="pf-tiers">' + p.tiers.slice(0, 3).map(t => "<span><b>" + money(t.price) + "</b> " + esc(t.qty) + "</span>").join("") + "</div>" : "";
    return '<article class="pf-card"><a class="pf-card__media" href="' + esc(p.href || "/product?id=" + encodeURIComponent(p.id || "")) + '" aria-label="' + esc(p.title) + '">' + media(p.image, p.title) + (p.badge ? '<span class="pf-card__badge">' + esc(p.badge) + "</span>" : "") + "</a>" +
      '<button type="button" class="pf-card__fav" data-wish="' + esc(p.id || "") + '" aria-pressed="false" aria-label="Save to wishlist">' + I("heart", 18) + "</button>" +
      '<div class="pf-card__body"><div class="pf-card__price">' + (kind === "supplier" && p.priceFrom ? "<small>from</small> " : "") + money(p.price) + "</div>" +
      '<a class="pf-card__title" href="' + esc(p.href || "/product?id=" + encodeURIComponent(p.id || "")) + '">' + esc(p.title) + "</a>" + tiers +
      '<div class="pf-card__meta">' + (kind === "supplier" && p.moq ? "<span>MOQ " + esc(p.moq) + "</span>" : p.rating ? stars(p.rating) + "<span>" + p.rating.toFixed(1) + "</span>" : "<span>New</span>") + (p.sold ? "<span>" + Number(p.sold).toLocaleString("en-GB") + " sold</span>" : "") + "</div></div></article>";
  }
  function productsPanel(kind) {
    const cats = ["All"].concat(Array.from(new Set(state.products.map(p => p.category).filter(Boolean))));
    return '<div class="pf-tools"><label class="pf-search">' + I("search", 18) + '<input type="search" id="pf-q" placeholder="Search this ' + (kind === "supplier" ? "catalogue" : "store") + '" autocomplete="off"></label>' +
      '<label class="pf-sort"><span class="jd-sr">Sort</span><select id="pf-sort"><option value="new">Newest</option><option value="priceAsc">Price: low to high</option><option value="priceDesc">Price: high to low</option><option value="popular">Most popular</option></select></label></div>' +
      '<div class="pf-pills" id="pf-cats">' + cats.map(c => '<button type="button" class="pf-pill" data-cat="' + esc(c) + '" aria-pressed="' + (c === "All") + '">' + esc(c) + "</button>").join("") + "</div>" +
      '<div class="pf-grid" id="pf-grid"></div><p class="pf-none" id="pf-none" hidden>Nothing matches your search.</p>';
  }
  function paintGrid() {
    const g = $("#pf-grid"); if (!g) return;
    let list = state.products.filter(p => (state.category === "All" || p.category === state.category) && (!state.q || (p.title || "").toLowerCase().includes(state.q)));
    if (state.sort === "priceAsc") list.sort((a, b) => a.price - b.price); else if (state.sort === "priceDesc") list.sort((a, b) => b.price - a.price); else if (state.sort === "popular") list.sort((a, b) => (b.sold || 0) - (a.sold || 0));
    g.innerHTML = list.map(p => card(p, state.kind)).join("");
    $("#pf-none").hidden = list.length > 0;
  }
  function infoRows(rows) { return '<dl class="pf-dl">' + rows.filter(r => r[1]).map(r => "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>").join("") + "</dl>"; }
  function aboutPanel(d, kind) {
    const hl = (d.highlights || []).map(h => '<li><span class="pf-hl__i">' + I(h.icon || "shield", 20) + "</span><div><b>" + esc(h.title) + "</b><span>" + esc(h.text) + "</span></div></li>").join("");
    const hours = (d.hours || []).map(h => "<li><span>" + esc(h[0]) + "</span><b>" + esc(h[1]) + "</b></li>").join("");
    return '<div class="pf-cols"><div class="pf-stack"><section class="pf-card2"><h2>About ' + esc(d.name) + "</h2><p class=\"pf-prose\">" + esc(d.about || "") + "</p></section>" +
      (hl ? '<section class="pf-card2"><h2>Why buyers choose us</h2><ul class="pf-hl">' + hl + "</ul></section>" : "") +
      (d.gallery && d.gallery.length ? '<section class="pf-card2"><h2>' + (kind === "supplier" ? "Facility & products" : "Gallery") + '</h2><div class="pf-gal">' + d.gallery.map((g, i) => '<figure class="pf-gal__i">' + media(g, d.name + i) + "</figure>").join("") + "</div></section>" : "") + "</div>" +
      '<aside class="pf-stack"><section class="pf-card2"><h2>Business details</h2>' + infoRows([["Business type", d.type], ["Registered", d.registered], ["Location", d.address || d.location], ["Phone", d.phone], ["Languages", d.languages]]) + "</section>" +
      (hours ? '<section class="pf-card2"><h2>Opening hours</h2><ul class="pf-hours">' + hours + "</ul></section>" : "") +
      '<section class="pf-card2 pf-trust"><h2>Trust & safety</h2><ul>' + (d.verified ? "<li>" + I("shield", 17) + "Identity and business checked by JulaDirect</li>" : "") + "<li>" + I("lock", 17) + "Payments protected on JulaDirect</li><li>" + I("message", 17) + "Keep chat on JulaDirect for dispute cover</li></ul></section></aside></div>";
  }
  function reviewsPanel(r) {
    r = r || { summary: { average: 0, count: 0, bars: [0, 0, 0, 0, 0] }, items: [] };
    const sm = r.summary, total = Math.max(1, sm.bars.reduce((a, b) => a + b, 0));
    return '<div class="pf-cols"><section class="pf-card2 pf-rsum"><div class="pf-rsum__s"><b>' + (sm.count ? sm.average.toFixed(1) : "–") + "</b>" + stars(sm.average || 0) + "<span>" + sm.count + " reviews</span></div><ul class=\"pf-bars\">" + [5, 4, 3, 2, 1].map((n, i) => '<li><span>' + n + ' star</span><i><b style="width:' + Math.round(sm.bars[i] / total * 100) + '%"></b></i><span>' + sm.bars[i] + "</span></li>").join("") + "</ul></section>" +
      '<section class="pf-card2 pf-rlist"><h2>What buyers say</h2>' + (r.items.length ? r.items.map(x => '<article class="pf-rev"><div class="pf-rev__top"><span class="pf-rev__av">' + initial(x.author) + "</span><div><b>" + esc(x.author) + "</b><small>" + esc(x.date) + (x.product ? " · " + esc(x.product) : "") + "</small></div>" + stars(x.rating) + "</div>" + (x.title ? "<h3>" + esc(x.title) + "</h3>" : "") + "<p>" + esc(x.body) + "</p>" + (x.reply ? '<div class="pf-rev__reply"><b>Seller reply</b><p>' + esc(x.reply) + "</p></div>" : "") + "</article>").join("") : '<p class="pf-none">No reviews yet.</p>') + "</section></div>";
  }
  function policiesPanel(d) {
    const p = d.policies || [];
    return '<div class="pf-cols pf-cols--even">' + p.map(x => '<section class="pf-card2"><span class="pf-hl__i">' + I(x.icon || "shield", 20) + "</span><h2>" + esc(x.title) + '</h2><p class="pf-prose">' + esc(x.text) + "</p></section>").join("") + "</div>";
  }
  function capabilitiesPanel(d) {
    const c = d.capabilities || [];
    return '<div class="pf-cols pf-cols--even">' + c.map(x => '<section class="pf-card2"><span class="pf-hl__i">' + I(x.icon || "bag", 20) + "</span><h2>" + esc(x.title) + "</h2>" + (x.items ? '<ul class="pf-list">' + x.items.map(i => "<li>" + esc(i) + "</li>").join("") + "</ul>" : '<p class="pf-prose">' + esc(x.text) + "</p>") + "</section>").join("") + "</div>" +
      (d.certs && d.certs.length ? '<section class="pf-card2" style="margin-top:18px"><h2>Certifications</h2><div class="pf-certs">' + d.certs.map(c => '<span class="pf-cert">' + I("shield", 16) + esc(c) + "</span>").join("") + "</div></section>" : "");
  }
  function faqPanel(d) { return '<section class="pf-card2 pf-faq">' + (d.faq || []).map(f => "<details><summary>" + esc(f[0]) + "</summary><p>" + esc(f[1]) + "</p></details>").join("") + "</section>"; }

  function quoteSheet(d) {
    const opts = state.products.map(p => '<option value="' + esc(p.title) + '">' + esc(p.title) + "</option>").join("");
    return '<div class="pf-scrim" id="pf-scrim" hidden></div><section class="pf-sheet" id="pf-sheet" role="dialog" aria-modal="true" aria-labelledby="pf-sheet-h" hidden><span class="pf-sheet__grab"></span><header><h2 id="pf-sheet-h">Request a quote</h2><button type="button" class="pf-icon-btn" data-pf="close" aria-label="Close">' + I("close", 20) + '</button></header>' +
      '<p class="pf-sheet__sub">Tell ' + esc(d.name) + ' what you need. They usually reply ' + esc(d.responseTime || "within a day") + '.</p>' +
      '<form id="pf-quote" class="pf-form"><label>Product<select name="product" required>' + (opts || '<option value="">Any product</option>') + '</select></label><div class="pf-two"><label>Quantity<input name="quantity" type="number" min="1" inputmode="numeric" placeholder="e.g. 200" required></label><label>Your phone<input name="phone" type="tel" placeholder="+220 700 0000"></label></div>' +
      '<label>Your name<input name="name" type="text" autocomplete="name" required></label><label>Notes<textarea name="note" rows="3" placeholder="Delivery town, deadline, branding, anything else"></textarea></label><button class="jd-btn jd-btn--primary jd-btn--lg" type="submit">Send request</button><p class="pf-fine">Sent through JulaDirect so you stay protected.</p></form></section>';
  }

  /* ---------------- mount ---------------- */
  function setProfileMeta(d, kind) {
    const id = kind === "supplier" ? d.supplierId : d.sellerId;
    const route = kind === "supplier" ? "/supplier-profile" : "/seller";
    const target = new URL(route, location.origin);
    if (id) target.searchParams.set("id", id);
    const canonical = target.href;
    const description = String(d.about || d.tagline || (d.name + " on JulaDirect."))
      .replace(/\\s+/g, " ").trim().slice(0, 155);
    const image = url(d.cover) || url(d.avatar) || "https://juladirect.pages.dev/assets/juladirect-og.svg";
    const title = d.name + (kind === "supplier" ? " — Supplier on JulaDirect" : " — Seller on JulaDirect");
    const setMeta = (type, key, value) => {
      const selector = "meta[" + type + "='" + key + "']";
      let node = $(selector);
      if (!node) { node = document.createElement("meta"); node.setAttribute(type, key); document.head.appendChild(node); }
      node.setAttribute("content", value);
    };
    setMeta("name", "description", description);
    setMeta("property", "og:type", "profile");
    setMeta("property", "og:site_name", "JulaDirect");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonical);
    setMeta("property", "og:image", image);
    setMeta("property", "og:image:alt", d.name + " profile on JulaDirect");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);
    let link = $('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = canonical;
    document.title = title;
  }

  function mount(opts) {
    opts = opts || {};
    const kind = opts.kind === "supplier" ? "supplier" : "seller";
    const root = $("#pf-root"); if (!root) return;
    const d = opts.data || window.JD_PROFILE_DATA || (opts.demo === true ? (kind === "supplier" ? DEMO_SUPPLIER : DEMO_SELLER) : null);
    if (!d || !d.name) {
      root.innerHTML = '<section class="pf-card2" role="status"><h1>Profile unavailable</h1><p class="pf-prose">This profile is not published or could not be loaded. Please return to the marketplace and try again.</p></section>';
      document.title = "Profile unavailable — JulaDirect";
      return;
    }
    state = { kind, data: d, products: (d.products || []).slice(), category: "All", sort: "new", q: "", following: !!d.following, reviews: d.reviews };
    setProfileMeta(d, kind);
    const panels = kind === "supplier"
      ? { catalog: productsPanel(kind), about: aboutPanel(d, kind), capabilities: capabilitiesPanel(d), reviews: reviewsPanel(d.reviews), faq: faqPanel(d) }
      : { products: productsPanel(kind), about: aboutPanel(d, kind), reviews: reviewsPanel(d.reviews), policies: policiesPanel(d) };
    const first = Object.keys(panels)[0];
    root.innerHTML = hero(d, kind) + stats(d, kind) + tabs(kind) + '<div class="pf-panels">' + Object.keys(panels).map(k => '<section class="pf-panel" id="pf-' + k + '" role="tabpanel"' + (k === first ? "" : " hidden") + ">" + panels[k] + "</section>").join("") + "</div>" + (kind === "supplier" ? quoteSheet(d) : "");
    paintGrid(); lookupWebsite(d);
    const followButton = $('[data-pf="follow"]');
    if (followButton) {
      followButton.setAttribute("aria-pressed", String(!!d.following));
      const followLabel = $("span", followButton);
      if (followLabel) followLabel.textContent = d.following ? "Following" : "Follow";
    }
    const hash = location.hash.replace("#", ""); if (hash && panels[hash]) show(hash, true);
    if (window.JD && JD.syncWishlist) JD.syncWishlist(root);
  }
  function show(name, instant) {
    $$(".pf-tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    $$(".pf-panel").forEach(p => { p.hidden = p.id !== "pf-" + name; });
    const act = $('.pf-tab[aria-selected="true"]'); if (act && act.scrollIntoView) act.scrollIntoView({ inline: "center", block: "nearest", behavior: instant ? "auto" : "smooth" });
    const tabs = $(".pf-tabs"); if (tabs && !instant) { const top = tabs.getBoundingClientRect().top + scrollY - 70; if (scrollY > top) scrollTo({ top, behavior: "smooth" }); }
    const dir = $$(".pf-tab").findIndex(t => t.dataset.tab === name);
    const panel = $("#pf-" + name); if (panel && window.Jelly && !instant) Jelly.slide(panel, dir >= (show._last || 0) ? "right" : "left", { mode: "offset", distance: 90 });
    show._last = dir;
  }
  function sheet(open) {
    const s = $("#pf-sheet"), sc = $("#pf-scrim"); if (!s) return;
    s.hidden = !open; sc.hidden = !open; s.classList.toggle("is-open", open); document.documentElement.classList.toggle("qv-lock", open);
    if (open) { const f = $("input,select", s); if (f) f.focus({ preventScroll: true }); }
  }

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-tab]"); if (t) return show(t.dataset.tab);
    const c = e.target.closest("[data-cat]"); if (c) { state.category = c.dataset.cat; $$("[data-cat]").forEach(x => x.setAttribute("aria-pressed", String(x === c))); paintGrid(); return emit("filter", { category: state.category }); }
    const a = e.target.closest("[data-pf]"); if (!a) { if (e.target.id === "pf-scrim") sheet(false); return; }
    const k = a.dataset.pf;
    if (k === "follow") { state.following = !state.following; a.setAttribute("aria-pressed", String(state.following)); $("span", a).textContent = state.following ? "Following" : "Follow"; emit("follow", { following: state.following }); }
    else if (k === "message") emit("message", { profile: state.data });
    else if (k === "quote") sheet(true);
    else if (k === "close") sheet(false);
    else if (k === "share") {
      const id = state.kind === "supplier" ? state.data.supplierId : state.data.sellerId;
      const path = state.kind === "supplier" ? "/supplier-profile" : "/seller";
      const shareUrl = new URL(path, location.origin);
      if (id) shareUrl.searchParams.set("id", id);
      const u = shareUrl.href;
      emit("share", { url: u });
      if (navigator.share) navigator.share({ title: state.data.name, url: u }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(u).then(() => window.JD && JD.toast && JD.toast("Link copied")).catch(() => {});
    }
  });
  document.addEventListener("input", e => { if (e.target.id === "pf-q") { state.q = e.target.value.trim().toLowerCase(); paintGrid(); emit("search", { q: state.q }); } });
  document.addEventListener("change", e => { if (e.target.id === "pf-sort") { state.sort = e.target.value; paintGrid(); emit("sort", { sort: state.sort }); } });
  document.addEventListener("submit", e => {
    if (e.target.id !== "pf-quote") return;
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target).entries());
    emit("quote", { product: f.product, quantity: Number(f.quantity), name: f.name, phone: f.phone, note: f.note });
    sheet(false); e.target.reset(); if (!window.JDProfileLive && window.JD && JD.toast) JD.toast("Quote request sent (demo)");
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") sheet(false); });

  window.JDProfile = {
    lookupWebsite: () => lookupWebsite(state.data),
    mount,
    setProducts(list) { state.products = list.slice(); paintGrid(); },
    setReviews(r) { state.reviews = r; const p = $("#pf-reviews"); if (p) p.innerHTML = reviewsPanel(r); }
  };

  /* ---------------- demo data (documents the shape each page expects) ---------------- */
  const P = (id, title, price, category, extra) => Object.assign({ id, title, price, category }, extra || {});
  const REV = {
    summary: { average: 4.7, count: 128, bars: [96, 22, 6, 2, 2] },
    items: [
      { author: "Awa Jallow", date: "2 weeks ago", product: "Solar LED Security Light", rating: 5, title: "Exactly as described", body: "Delivered the next day and it works perfectly. The seller answered every question before I ordered.", reply: "Thank you Awa, enjoy it!" },
      { author: "Modou Ceesay", date: "1 month ago", rating: 4, title: "Good value", body: "Well packed and fair price. Pickup was easy and the seller was friendly." },
      { author: "Fatou Bah", date: "2 months ago", rating: 5, body: "Third order from this store. Always reliable." }
    ]
  };
  const DEMO_SELLER = {
    name: "Banjul Tech Hub", website: "https://squashberrypro.pages.dev/banjul-tech", tagline: "Phones, solar and home electronics you can trust.", verified: true, topRated: true,
    location: "Serrekunda, The Gambia", joined: "March 2025", responseTime: "within 1 hour", rating: 4.7, reviewCount: 128, sold: 1840, productCount: 63, followers: 2310, responseRate: 98,
    about: "We are a family-run electronics store on Kairaba Avenue. Every item is tested before it is listed, and we describe condition honestly so you know exactly what you are buying. Ask us anything before you order.",
    highlights: [{ icon: "shield", title: "Tested before listing", text: "Every device is checked and photographed by us." }, { icon: "truck", title: "Fast delivery", text: "Same-day delivery around the Greater Banjul area." }, { icon: "wallet", title: "Online payment", text: "Use an online payment method when enabled at checkout." }],
    type: "Retail store", registered: "2025", address: "Kairaba Avenue, Serrekunda", phone: "+220 700 0000", languages: "English, Wolof, Mandinka",
    hours: [["Mon – Fri", "9:00 – 18:00"], ["Saturday", "10:00 – 16:00"], ["Sunday", "Closed"]],
    gallery: ["a", "b", "c"],
    policies: [{ icon: "truck", title: "Delivery", text: "We deliver across Greater Banjul. Delivery fees are shown at checkout and you confirm the handover with a code." }, { icon: "scale", title: "Returns", text: "If an item is not as described, message us within 48 hours and we will arrange a return or refund." }, { icon: "wallet", title: "Payment", text: "Use an online payment method enabled at checkout. Keep payment on JulaDirect to stay protected." }],
    reviews: REV,
    products: [P("1", "Solar LED Security Light", 2600, "Solar", { sold: 84, rating: 4.8, badge: "Best seller" }), P("2", "iPhone 13, 128GB", 21500, "Phones", { sold: 31, rating: 4.9 }), P("3", "Samsung Galaxy A14", 7800, "Phones", { sold: 52, rating: 4.6 }), P("4", "Portable Power Bank 20,000mAh", 1450, "Electronics", { sold: 120, rating: 4.7 }), P("5", "Wireless Earbuds Pro", 1900, "Electronics", { sold: 77, rating: 4.5 }), P("6", "12V Solar Panel Kit", 9800, "Solar", { sold: 18, rating: 4.8, badge: "New" }), P("7", "Bluetooth Speaker", 1250, "Electronics", { sold: 64, rating: 4.4 }), P("8", "USB-C Fast Charger", 650, "Electronics", { sold: 210, rating: 4.6 })]
  };
  const DEMO_SUPPLIER = {
    name: "Gambia Wholesale Traders", tagline: "Bulk electronics, solar and household goods for resellers.", verified: true, topRated: true,
    location: "Banjul, The Gambia", joined: "January 2023", responseTime: "within a day", rating: 4.8, reviewCount: 64, years: 9, moq: "20 units", leadTime: "2–5 days", responseRate: 95,
    about: "We supply shops, market traders and businesses across the Gambia with genuine stock at wholesale prices. Tiered pricing applies on most lines and we can arrange delivery to your town. Send a quote request with your quantities and we will come back with a price the same day.",
    highlights: [{ icon: "shield", title: "Genuine stock", text: "Sourced direct from manufacturers and authorised distributors." }, { icon: "truck", title: "Nationwide delivery", text: "Pallet and parcel delivery to all regions." }, { icon: "scale", title: "Tiered pricing", text: "The more you buy, the lower the unit price." }],
    type: "Wholesaler / distributor", registered: "2016", address: "Half Die, Banjul", phone: "+220 710 0000", languages: "English, Wolof",
    hours: [["Mon – Fri", "8:30 – 17:30"], ["Saturday", "9:00 – 14:00"], ["Sunday", "Closed"]],
    gallery: ["a", "b", "c", "d"],
    capabilities: [{ icon: "bag", title: "What we supply", items: ["Phones & accessories", "Solar panels, lights & batteries", "Small kitchen appliances", "Packaging & bulk household goods"] }, { icon: "truck", title: "Logistics", items: ["Dispatch within 2–5 days", "Delivery to all regions", "Pickup from our Banjul warehouse", "Delivery confirmed with a code"] }, { icon: "scale", title: "Ordering", items: ["Minimum order from 20 units", "Tiered pricing on every line", "Samples on request", "Invoices provided"] }],
    certs: ["Registered business", "Tax compliant", "Authorised distributor"],
    faq: [["What is the minimum order?", "Most lines start at 20 units. Some accessories start at 50. The quantity is shown on every product."], ["Can I get samples?", "Yes. Request a quote and mention samples; we will quote one or two units."], ["How do I pay?", "Use an online payment method enabled at JulaDirect checkout."], ["Do you deliver upcountry?", "Yes, we deliver to all regions. Fees depend on weight and distance."]],
    reviews: REV,
    products: [P("1", "Solar LED Security Light (carton of 20)", 2100, "Solar", { priceFrom: true, moq: "20 units", sold: 940, tiers: [{ qty: "20–99", price: 2100 }, { qty: "100–499", price: 1950 }, { qty: "500+", price: 1800 }] }), P("2", "Power Bank 20,000mAh", 1100, "Electronics", { priceFrom: true, moq: "30 units", sold: 1200, tiers: [{ qty: "30–99", price: 1100 }, { qty: "100+", price: 980 }] }), P("3", "USB-C Fast Charger", 480, "Electronics", { priceFrom: true, moq: "50 units", sold: 3100, tiers: [{ qty: "50–199", price: 480 }, { qty: "200+", price: 420 }] }), P("4", "12V Solar Panel Kit", 8600, "Solar", { priceFrom: true, moq: "5 units", sold: 210, tiers: [{ qty: "5–19", price: 8600 }, { qty: "20+", price: 8100 }] }), P("5", "Electric Kettle 1.8L", 690, "Home", { priceFrom: true, moq: "24 units", sold: 540 }), P("6", "Rice Cooker 1.5L", 1250, "Home", { priceFrom: true, moq: "12 units", sold: 380 })]
  };
})();
