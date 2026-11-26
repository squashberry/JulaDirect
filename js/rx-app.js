/* Restaurant Studio: the restaurant owner's own role, dashboard and signup. */
(function () {
  "use strict";
  const FI = window.FI, F = window.JDFood, esc = F.esc, money = F.money, $ = (s, r) => (r || document).querySelector(s);
  const root = document.getElementById("rx"), demo = F.isDemo();
  const CUIS = ["Gambian", "Grill", "Rice dishes", "Fast food", "Burgers", "Healthy", "Seafood", "Pizza", "Bakery", "Desserts", "Drinks", "Chinese", "Lebanese"];
  const ST = { new: ["New", "warn"], accepted: ["Accepted", "blue"], preparing: ["Cooking", "blue"], ready: ["Ready", "ok"], completed: ["Done", "ok"], cancelled: ["Cancelled", ""] };
  const NEXT = { new: ["accepted", "Accept order"], accepted: ["preparing", "Start cooking"], preparing: ["ready", "Mark ready"], ready: ["completed", "Handed over"] };
  const S = { r: null, menu: [], orders: [], view: "overview", filter: "new", known: null, ob: null, unsub: null, timer: null };
  let toastT;
  const toast = m => { document.querySelectorAll(".rx-toast").forEach(n => n.remove()); const t = document.createElement("div"); t.className = "rx-toast"; t.textContent = m; document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); };
  const hydrate = el => { try { FI.hydrate && FI.hydrate(el); } catch (e) {} };
  const ago = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + " min ago" : s < 86400 ? Math.floor(s / 3600) + " h ago" : new Date(d).toLocaleDateString(); };

  /* ---------- demo data ---------- */
  function demoOrders() {
    const n = Date.now(), m = x => new Date(n - x * 60000).toISOString();
    const o = (i, st, min, name, ful, items) => { const sub = items.reduce((a, b) => a + b.price * b.quantity, 0), fee = ful === "delivery" ? 50 : 0; return { id: "do" + i, code: "A" + (4820 + i), status: st, created_at: m(min), customer_name: name, customer_phone: "+2207001122", address: ful === "delivery" ? "Kairaba Ave, Serrekunda" : "", fulfilment: ful, items, subtotal: sub, delivery_fee: fee, total: sub + fee, note: i === 1 ? "No onions please" : "" }; };
    return [o(1, "new", 2, "Fatou J.", "delivery", [{ name: "Charcoal Chicken", price: 420, quantity: 2 }, { name: "Bissap", price: 60, quantity: 2 }]), o(2, "new", 6, "Lamin S.", "pickup", [{ name: "Whole Grilled Fish", price: 650, quantity: 1 }]), o(3, "preparing", 14, "Awa B.", "delivery", [{ name: "Lamb Skewers", price: 380, quantity: 1 }, { name: "Hand-cut Fries", price: 90, quantity: 1 }]), o(4, "ready", 30, "Modou K.", "pickup", [{ name: "Charcoal Chicken", price: 420, quantity: 1 }]), o(5, "completed", 120, "Isatou C.", "delivery", [{ name: "Mango Sorbet", price: 110, quantity: 3 }])];
  }

  /* ---------- boot ---------- */
  async function boot() {
    if (!demo) {
      const guard = window.GamBasketGuard;
      if (!guard || !(await guard.gatePage("restaurant"))) return;
      if (!(await F.enabled())) { location.replace("../index.html"); return; }
    }
    S.r = (demo && new URLSearchParams(location.search).has("new")) ? null : await F.mine().catch(() => null);
    if (!S.r && !demo) {
      try { const c = await F.client(), { data: ms } = await c.from("gift_restaurant_staff").select("restaurant_id").limit(1);
        if (ms && ms[0]) { const { data: rr } = await c.from("restaurants").select("*").eq("id", ms[0].restaurant_id).maybeSingle(); if (rr) { S.r = rr; S.staff = true; } } } catch (e) {}
    }
    if (!S.r) { S.ob = { step: 0, d: { cuisines: [], offers_delivery: true, offers_pickup: true, delivery_fee: 50, min_order: 0, prep_minutes: 25 } }; return onboard(); }
    await enter();
  }
  async function enter() {
    S.ob = null;
    if (S.staff) { S.menu = []; S.orders = []; S.known = new Set(); shell(); if (location.hash !== "#/gifts") location.hash = "#/gifts"; route(); window.addEventListener("hashchange", route); return; }
    S.menu = await F.menu(S.r.id).catch(() => []);
    S.orders = demo ? demoOrders() : await F.restaurantOrders(S.r.id).catch(() => []);
    S.known = new Set(S.orders.map(o => o.id));
    shell(); route();
    window.addEventListener("hashchange", route);
    if (!demo) { F.subscribeOrders(S.r.id, () => refresh()).then(u => S.unsub = u); }
    S.timer = setInterval(() => refresh(), 20000);
  }
  async function refresh() {
    if (demo || !S.r) return;
    try {
      const list = await F.restaurantOrders(S.r.id), fresh = list.filter(o => !S.known.has(o.id) && o.status === "new");
      S.orders = list; list.forEach(o => S.known.add(o.id));
      if (fresh.length) { beep(); toast(fresh.length + " new order" + (fresh.length > 1 ? "s" : "") + "!"); }
      badge(); if (S.view === "overview" || S.view === "orders") paint();
    } catch (e) {}
  }
  function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .5); o.start(); o.stop(a.currentTime + .5); } catch (e) {} }
  const newCount = () => S.orders.filter(o => o.status === "new").length;

  /* ---------- shell ---------- */
  const NAV = [["overview", "home", "Overview"], ["orders", "receipt", "Orders"], ["menu", "utensils", "Menu"], ["gifts", "wallet", "Gift cards"], ["profile", "store", "Restaurant"]];
  const TITLES = { overview: "Overview", orders: "Orders", menu: "Menu", gifts: "Gift cards", profile: "Restaurant profile" };
  function shell() {
    const NAVX = S.staff ? NAV.filter(n => n[0] === "gifts") : NAV;
    const link = (k, ic, t) => `<a href="#/${k}" data-nav="${k}">${FI(ic, 23)}<span>${t}</span><b class="rx-badge" data-b="${k}" hidden></b></a>`;
    root.innerHTML = `<div class="rx-shell"><aside class="rx-side"><div class="brand"><i>${FI("chef", 22)}</i><div>${esc(S.r.name)}<small>Restaurant Studio</small></div></div>${NAVX.map(n => link(...n)).join("")}<div class="sp"></div><a href="../food.html">${FI("bowl", 22)}<span>Customer food app</span></a><a href="../index.html" class="out">${FI("back", 22)}<span>Back to JulaDirect</span></a></aside>
    <div><header class="rx-top"><h1 id="rx-t"></h1><a class="rx-ib" href="../food.html" title="Customer app" aria-label="Customer app">${FI("bowl", 22)}</a></header><main class="rx-main" id="rx-m"></main></div>
    <nav class="rx-tabs">${NAVX.map(n => link(...n)).join("")}</nav></div>`;
    badge();
  }
  function badge() { const n = newCount(); document.querySelectorAll('[data-b="orders"]').forEach(b => { b.hidden = !n; b.textContent = n; }); document.title = (n ? `(${n}) ` : "") + "Restaurant Studio — JulaDirect"; }
  function route() {
    const v = (location.hash.match(/#\/(\w+)/) || [])[1]; S.view = S.staff ? "gifts" : TITLES[v] ? v : "overview";
    closeDrawer(true);
    document.querySelectorAll("[data-nav]").forEach(a => a.setAttribute("aria-current", a.dataset.nav === S.view ? "page" : "false"));
    $("#rx-t").textContent = TITLES[S.view]; paint(true); window.scrollTo(0, 0);
  }
  function paint(anim) {
    const m = $("#rx-m"); if (!m) return;
    m.innerHTML = `<div class="${anim ? "rx-view" : ""}">${({ overview, orders, menu, gifts, profile })[S.view]()}</div>`; hydrate(m);
  }

  /* ---------- Overview ---------- */
  function banner() {
    const s = S.r.status;
    if (s === "approved") return "";
    return s === "suspended" ? `<div class="rx-banner rx-banner--suspended">${FI("close", 22)}<div>Your restaurant is suspended. Contact JulaDirect support.</div></div>` : `<div class="rx-banner rx-banner--pending">${FI("clock", 22)}<div>Awaiting approval. You can build your menu now. Customers will see you once JulaDirect approves.</div></div>`;
  }
  const todays = () => S.orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString());
  function overview() {
    const t = todays(), rev = t.filter(o => o.status !== "cancelled").reduce((a, o) => a + Number(o.total), 0), kit = S.orders.filter(o => o.status === "accepted" || o.status === "preparing").length;
    const recent = S.orders.slice(0, 5);
    return `${banner()}<div class="rx-card"><div class="rx-row"><div class="rx-sp"><h2 style="margin:0">${S.r.is_open ? "You are open" : "You are closed"}</h2><div style="color:var(--rx-mut);font-size:13.5px">${S.r.is_open ? "Customers can order now." : "Customers can see you but cannot order."}</div></div><button class="rx-sw" role="switch" aria-label="Open for orders" aria-checked="${!!S.r.is_open}" data-toggle-open></button></div></div>
    <div class="rx-kpis"><div class="rx-kpi rx-kpi--hot" style="--i:0"><small>New orders</small><b>${newCount()}</b></div><div class="rx-kpi" style="--i:1"><small>In the kitchen</small><b>${kit}</b></div><div class="rx-kpi" style="--i:2"><small>Orders today</small><b>${t.length}</b></div><div class="rx-kpi" style="--i:3"><small>Sales today</small><b>${money(rev)}</b></div></div>
    <div class="rx-cols"><div class="rx-card"><div class="rx-row"><h2 class="rx-sp">Recent orders</h2><a class="rx-btn rx-btn--soft rx-btn--sm" href="#/orders">View all</a></div><div class="rx-orders" style="margin-top:12px">${recent.length ? recent.map(orderCard).join("") : empty("receipt", "No orders yet. They will appear here the moment a customer orders.")}</div></div>
    <div><div class="rx-card"><h2>Quick links</h2><p class="sub">Keep your restaurant fresh.</p><div class="rx-row">${S.r.status === "approved" ? `<a class="rx-btn rx-btn--dark rx-btn--sm" href="../restaurant.html?slug=${encodeURIComponent(S.r.slug)}">${FI("arrow", 18)}View public page</a>` : ""}<button class="rx-btn rx-btn--soft rx-btn--sm" data-add-meal>${FI("plus", 18)}Add a meal</button></div></div>
    <div class="rx-card"><h2>Menu</h2><p class="sub">${S.menu.length} meal${S.menu.length === 1 ? "" : "s"}, ${S.menu.filter(m => !m.is_available).length} sold out.</p><a class="rx-btn rx-btn--ghost rx-btn--sm" href="#/menu">Manage menu</a></div></div></div>`;
  }
  const empty = (ic, t) => `<div class="rx-empty">${FI(ic, 44)}${esc(t)}</div>`;

  /* ---------- Orders ---------- */
  const GROUPS = [["new", "New", ["new"]], ["kitchen", "In kitchen", ["accepted", "preparing"]], ["ready", "Ready", ["ready"]], ["done", "Done", ["completed", "cancelled"]]];
  const inGroup = k => S.orders.filter(o => GROUPS.find(g => g[0] === k)[2].includes(o.status));
  function orderCard(o) {
    const [lb, tone] = ST[o.status] || ["", ""], items = Array.isArray(o.items) ? o.items : [], nx = NEXT[o.status];
    return `<article class="rx-o ${o.status === "new" ? "is-new" : ""}" data-oid="${esc(o.id)}"><div class="rx-o__h"><b>#${esc(o.code || String(o.id).slice(0, 6))}</b><span class="rx-tag rx-tag--${tone}">${lb}</span><span class="rx-tag">${o.fulfilment === "pickup" ? "Pickup" : "Delivery"}</span><small style="margin-left:auto">${ago(o.created_at)}</small></div>
    <ul>${items.map(i => `<li><span>${esc(i.quantity || i.qty || 1)} × ${esc(i.name || "Item")}</span><span>${money((i.price || 0) * (i.quantity || i.qty || 1))}</span></li>`).join("")}</ul>
    <div class="rx-o__c"><span><b>${esc(o.customer_name)}</b></span>${o.customer_phone ? `<a href="tel:${esc(o.customer_phone)}">${esc(o.customer_phone)}</a>` : ""}${o.address ? `<span>${esc(o.address)}</span>` : ""}${o.note ? `<span><i>"${esc(o.note)}"</i></span>` : ""}</div>
    <div class="rx-o__f"><b>${money(o.total)}</b>${o.status === "new" ? `<button class="rx-btn rx-btn--red rx-btn--sm" data-st="cancelled" data-id="${esc(o.id)}">Decline</button>` : ""}${nx ? `<button class="rx-btn rx-btn--sm" data-st="${nx[0]}" data-id="${esc(o.id)}">${nx[1]}</button>` : ""}</div></article>`;
  }
  function orders() {
    const list = k => { const l = inGroup(k); return l.length ? l.slice(0, k === "done" ? 12 : 99).map(orderCard).join("") : empty("receipt", "Nothing here"); };
    return `${banner()}<div class="rx-mob"><div class="rx-seg">${GROUPS.map(g => `<button aria-pressed="${S.filter === g[0]}" data-f="${g[0]}">${g[1]}${g[0] === "new" && newCount() ? `<i>${newCount()}</i>` : ""}</button>`).join("")}</div><div class="rx-orders">${list(S.filter)}</div></div>
    <div class="rx-desk"><div class="rx-kan">${GROUPS.map(g => `<div><h3>${g[1]} · ${inGroup(g[0]).length}</h3><div class="rx-orders">${list(g[0])}</div></div>`).join("")}</div></div>`;
  }
  async function setStatus(id, st) {
    const o = S.orders.find(x => String(x.id) === id); if (!o) return; const prev = o.status; o.status = st; badge(); paint();
    if (demo) return;
    try { await F.setOrderStatus(id, st); } catch (e) { o.status = prev; badge(); paint(); toast("Could not update the order. Try again."); }
  }

  /* ---------- Menu ---------- */
  function menu() {
    const cats = [...new Set(S.menu.map(m => m.category || "Mains"))];
    return `${banner()}<div class="rx-row" style="margin-bottom:6px"><div class="rx-sp" style="color:var(--rx-mut);font-weight:700">${S.menu.length} meals</div><button class="rx-btn" data-add-meal>${FI("plus", 18)}Add meal</button></div>
    ${S.menu.length ? `<div class="rx-menu">${cats.map(c => `<div class="rx-cat">${esc(c)}</div>${S.menu.filter(m => (m.category || "Mains") === c).map(mealRow).join("")}`).join("")}</div>` : empty("utensils", "Your menu is empty. Add your first meal.")}`;
  }
  const mealRow = m => `<div class="rx-meal ${m.is_available ? "" : "off"}"><div class="th">${m.image_url ? `<img src="${esc(F.safeUrl(m.image_url))}" alt="" loading="lazy">` : FI("utensils", 26)}</div><div class="n"><b>${esc(m.name)}</b><small>${money(m.price)}${m.is_featured ? " · Featured" : ""}${m.is_available ? "" : " · Sold out"}</small></div><button class="rx-sw" role="switch" aria-label="Available" aria-checked="${!!m.is_available}" data-avail="${esc(m.id)}"></button><button class="rx-ib" aria-label="Edit ${esc(m.name)}" data-edit="${esc(m.id)}">${FI("sliders", 20)}</button></div>`;

  function mealForm(m) {
    const cats = [...new Set(S.menu.map(x => x.category).filter(Boolean))];
    return `<span class="rx-grab"></span><h2>${m.id ? "Edit meal" : "Add a meal"}</h2><form class="rx-f" id="mf" novalidate>
    ${upTile("image_url", "Meal photo", m.image_url, 150)}
    <label>Name<input data-k="name" value="${esc(m.name || "")}" maxlength="100" placeholder="e.g. Charcoal Chicken"></label>
    <label>Category<input data-k="category" list="rx-cats" value="${esc(m.category || "")}" placeholder="Mains, Sides, Drinks…"><datalist id="rx-cats">${["Mains", "Sides", "Drinks", "Dessert"].concat(cats).map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>
    <label>Price (D)<input data-k="price" data-num type="number" inputmode="decimal" min="0" step="1" value="${m.price ?? ""}"></label>
    <label>Description<textarea data-k="description" rows="3" maxlength="400">${esc(m.description || "")}</textarea></label>
    <label>Tags <small>comma separated</small><input data-k="tags" data-tags value="${esc((m.tags || []).join(", "))}" placeholder="Best seller, Vegan"></label>
    <label>Spice level<div class="rx-chips">${["Mild", "Medium", "Hot", "Fire"].map((t, i) => `<button type="button" class="rx-chip" data-spicy="${i}" aria-pressed="${(m.spicy || 0) === i}">${t}</button>`).join("")}</div></label>
    ${sw("is_available", "Available now", m.is_available !== false)}${sw("is_featured", "Feature on my page", !!m.is_featured)}
    <div class="rx-row"><button type="submit" class="rx-btn rx-sp" id="mf-save">Save meal</button>${m.id ? `<button type="button" class="rx-btn rx-btn--red" data-del>Delete</button>` : ""}</div></form>`;
  }
  let drawerEl, scrimEl;
  function openDrawer(html, obj, onSubmit) {
    closeDrawer(true);
    scrimEl = document.createElement("div"); scrimEl.className = "rx-scrim"; drawerEl = document.createElement("div"); drawerEl.className = "rx-drawer"; drawerEl.setAttribute("role", "dialog"); drawerEl.setAttribute("aria-modal", "true"); drawerEl.innerHTML = html;
    document.body.append(scrimEl, drawerEl); hydrate(drawerEl); bind(drawerEl, obj);
    scrimEl.onclick = () => closeDrawer(); requestAnimationFrame(() => requestAnimationFrame(() => { scrimEl.classList.add("on"); drawerEl.classList.add("on"); }));
    $("form", drawerEl).onsubmit = e => { e.preventDefault(); onSubmit(obj, drawerEl); };
  }
  function closeDrawer(now) { const d = drawerEl, s = scrimEl; if (!d) return; drawerEl = scrimEl = null; d.classList.remove("on"); s.classList.remove("on"); setTimeout(() => { d.remove(); s.remove(); }, now ? 0 : 500); }
  function editMeal(id) {
    const obj = Object.assign({ is_available: true, category: "", spicy: 0 }, S.menu.find(m => String(m.id) === id) || {});
    openDrawer(mealForm(obj), obj, async (o, el) => {
      const name = (o.name || "").trim(), price = Number(o.price);
      if (name.length < 2) return toast("Give the meal a name."); if (!(price >= 0) || o.price === "" || o.price == null) return toast("Enter a price.");
      const btn = $("#mf-save", el); btn.disabled = true; btn.textContent = "Saving…";
      const row = { id: o.id, name, category: (o.category || "Mains").trim() || "Mains", price, description: (o.description || "").trim(), image_url: o.image_url || null, tags: o.tags || [], spicy: o.spicy || 0, is_available: o.is_available !== false, is_featured: !!o.is_featured };
      try {
        let saved; if (demo) saved = Object.assign({}, row, { id: row.id || "dm" + Date.now() }); else { if (!row.id) delete row.id; saved = await F.saveMeal(S.r.id, row); }
        const i = S.menu.findIndex(m => String(m.id) === String(saved.id)); if (i >= 0) S.menu[i] = saved; else S.menu.push(saved);
        closeDrawer(); paint(); toast("Meal saved");
      } catch (e) { btn.disabled = false; btn.textContent = "Save meal"; toast(e.message || "Could not save."); }
    });
    const del = $("[data-del]", drawerEl); if (del) del.onclick = async () => {
      if (!confirm("Delete this meal?")) return;
      try { if (!demo) await F.deleteMeal(obj.id); S.menu = S.menu.filter(m => String(m.id) !== String(obj.id)); closeDrawer(); paint(); toast("Meal deleted"); } catch (e) { toast("Could not delete."); }
    };
  }
  async function toggleAvail(id) {
    const m = S.menu.find(x => String(x.id) === id); if (!m) return; m.is_available = !m.is_available; paint();
    if (demo) return; try { await F.saveMeal(S.r.id, { id, is_available: m.is_available }); } catch (e) { m.is_available = !m.is_available; paint(); toast("Could not update."); }
  }

  /* ---------- shared form pieces ---------- */
  const sw = (k, label, on) => `<label class="rx-chk"><span>${label}</span><button type="button" class="rx-sw" role="switch" aria-checked="${!!on}" data-sw="${k}"></button></label>`;
  const upTile = (k, label, url, h) => `<label class="rx-up ${url ? "has" : ""}" data-up="${k}" style="min-height:${h || 130}px;${url ? `background-image:url('${esc(F.safeUrl(url))}')` : ""}"><input type="file" accept="image/jpeg,image/png,image/webp">${url ? "" : `${FI("plus", 26)}<span>${label}</span>`}</label>`;
  function bind(el, obj) {
    el.addEventListener("input", e => { const t = e.target, k = t.dataset && t.dataset.k; if (!k) return; obj[k] = t.hasAttribute("data-tags") ? t.value.split(",").map(s => s.trim()).filter(Boolean) : t.hasAttribute("data-num") ? (t.value === "" ? null : Number(t.value)) : t.value; });
    el.addEventListener("click", e => {
      const s = e.target.closest("[data-sw]"); if (s) { const k = s.dataset.sw; obj[k] = !obj[k]; s.setAttribute("aria-checked", !!obj[k]); return; }
      const sp = e.target.closest("[data-spicy]"); if (sp) { obj.spicy = Number(sp.dataset.spicy); el.querySelectorAll("[data-spicy]").forEach(b => b.setAttribute("aria-pressed", b === sp)); return; }
      const c = e.target.closest("[data-cu]"); if (c) { const v = c.dataset.cu, a = obj.cuisines = obj.cuisines || [], i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); c.setAttribute("aria-pressed", i < 0); }
    });
    el.addEventListener("change", async e => {
      const f = e.target; if (f.type !== "file" || !f.files[0]) return; const tile = f.closest("[data-up]"), k = tile.dataset.up;
      tile.style.opacity = ".5";
      try { const url = demo ? URL.createObjectURL(f.files[0]) : await F.upload(f.files[0]); obj[k] = url; tile.classList.add("has"); tile.style.backgroundImage = `url('${url}')`; tile.querySelectorAll("span,svg").forEach(n => n.remove()); const pv = el.querySelector("[data-prev]"); if (pv) preview(el, obj); }
      catch (err) { toast(err.message || "Upload failed."); } tile.style.opacity = "";
    });
  }
  const fText = (k, label, d, ph, extra) => `<label class="${extra === "wide" ? "wide" : ""}">${label}<input data-k="${k}" value="${esc(d[k] ?? "")}" placeholder="${esc(ph || "")}" maxlength="${k === "name" ? 80 : 120}"></label>`;
  const fNum = (k, label, d) => `<label>${label}<input data-k="${k}" data-num type="number" inputmode="decimal" min="${k === "prep_minutes" ? 1 : 0}" step="${k === "prep_minutes" ? 1 : "any"}" value="${d[k] ?? ""}"></label>`;
  const gBasics = d => `<div class="rx-f rx-f--2">${fText("name", "Restaurant name", d, "e.g. Kairaba Grill", "wide")}${fText("tagline", "Tagline", d, "One line customers will love", "wide")}<label class="wide">Cuisines<div class="rx-chips">${CUIS.concat((d.cuisines || []).filter(c => !CUIS.includes(c))).map(c => `<button type="button" class="rx-chip" data-cu="${esc(c)}" aria-pressed="${(d.cuisines || []).includes(c)}">${esc(c)}</button>`).join("")}</div></label><label class="wide">About<textarea data-k="description" rows="4" maxlength="600" placeholder="Tell customers your story">${esc(d.description || "")}</textarea></label></div>`;
  const gContact = d => `<div class="rx-f rx-f--2">${fText("location", "Location", d, "Street, area", "wide")}${fText("phone", "Phone", d, "+220…")}${fText("whatsapp", "WhatsApp", d, "+220…")}${fText("opening_hours", "Opening hours", d, "Daily 10:00 – 22:00", "wide")}</div>`;
  const gService = d => `<div class="rx-f rx-f--2">${sw("offers_delivery", "Delivery", d.offers_delivery)}${sw("offers_pickup", "Pickup", d.offers_pickup)}${fNum("delivery_fee", "Delivery fee (D)", d)}${fNum("min_order", "Minimum order (D)", d)}${fNum("prep_minutes", "Prep time (minutes)", d)}</div>`;
  const gMedia = d => `<div class="rx-f rx-f--2"><div><b style="font-size:13px">Logo</b>${upTile("logo_url", "Add logo", d.logo_url, 130)}</div><div><b style="font-size:13px">Cover photo</b>${upTile("cover_url", "Add cover", d.cover_url, 130)}</div></div>`;
  function preview(el, d) { const p = $("[data-prev]", el); if (!p) return; p.style.backgroundImage = d.cover_url ? `url('${d.cover_url}')` : ""; p.innerHTML = `<b>${esc(d.name || "Your restaurant")}</b><span>${esc((d.cuisines || []).join(" · ") || "Cuisines")}${d.location ? " · " + esc(d.location) : ""}</span>`; }
  function validate(d, step) {
    if (step === 0 || step === "all") {
      const name = String(d.name || "").trim();
      if (name.length < 2) return "Enter your restaurant name.";
      if (name.length > 80) return "Restaurant names must be 80 characters or fewer.";
      if (!(d.cuisines || []).length) return "Pick at least one cuisine.";
    }
    if (step === 1 || step === "all") {
      if (!(d.location || "").trim()) return "Add your location.";
      const phoneDigits = String(d.phone || "").replace(/\D/g, "");
      if (phoneDigits.length < 6) return "Enter a valid phone number with at least 6 digits.";
    }
    if (step === 2 || step === "all") {
      if (!d.offers_delivery && !d.offers_pickup) return "Offer delivery, pickup or both.";
      for (const [key, label] of [["delivery_fee", "Delivery fee"], ["min_order", "Minimum order"], ["prep_minutes", "Prep time"]]) {
        const raw = d[key];
        if (raw === null || raw === "") continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) return label + " must be zero or greater.";
      }
      if (d.prep_minutes !== null && d.prep_minutes !== "" && (!Number.isInteger(Number(d.prep_minutes)) || Number(d.prep_minutes) < 1)) {
        return "Prep time must be a whole number of at least 1 minute.";
      }
    }
    return "";
  }
  function clean(d) { const r = Object.assign({}, d); ["delivery_fee", "min_order", "prep_minutes"].forEach(k => r[k] = Number(r[k]) || 0); if (!r.prep_minutes) r.prep_minutes = 25; r.name = r.name.trim(); ["tagline", "description", "location", "phone", "whatsapp", "opening_hours"].forEach(k => r[k] = (r[k] || "").trim() || null); return r; }

  /* ---------- Profile ---------- */
  function profile() {
    const d = S.r; return `${banner()}<form id="pf" novalidate><div class="rx-card"><h2>Basics</h2><p class="sub">How your restaurant is introduced.</p>${gBasics(d)}</div><div class="rx-card"><h2>Contact and hours</h2><p class="sub">&nbsp;</p>${gContact(d)}</div><div class="rx-card"><h2>Service</h2><p class="sub">Delivery, pickup and pricing.</p>${gService(d)}</div><div class="rx-card"><h2>Photos</h2><p class="sub">A great cover photo gets more orders.</p>${gMedia(d)}</div><div class="rx-row"><button class="rx-btn" type="submit" id="pf-save">Save changes</button>${S.r.status === "approved" ? `<a class="rx-btn rx-btn--ghost" href="../restaurant.html?slug=${encodeURIComponent(S.r.slug)}">View public page</a>` : ""}</div></form>`;
  }
  function bindProfile() {
    const f = $("#pf"); if (!f || f.dataset.b) return; f.dataset.b = 1; S.draft = Object.assign({}, S.r, { cuisines: (S.r.cuisines || []).slice() }); bind(f, S.draft);
    f.onsubmit = async e => {
      e.preventDefault(); const err = validate(S.draft, "all"); if (err) return toast(err);
      const b = $("#pf-save"); b.disabled = true; b.textContent = "Saving…";
      try { const row = clean(S.draft); S.r = demo ? Object.assign({}, S.r, row) : await F.saveRestaurant(Object.assign(row, { id: S.r.id })); toast("Saved"); } catch (er) { toast(er.message || "Could not save."); }
      b.disabled = false; b.textContent = "Save changes";
    };
  }

  /* ---------- Onboarding ---------- */
  const OB = [["Your restaurant", "Tell us what you cook and who you are.", gBasics], ["Contact and hours", "So customers can reach you.", gContact], ["How you serve", "Delivery, pickup and pricing.", gService], ["Make it look delicious", "Add a logo and cover photo.", gMedia], ["Ready to launch", "Check everything, then send it for approval.", null]];
  function onboard() {
    const { step, d } = S.ob, [t, sub, fn] = OB[step], last = step === OB.length - 1;
    root.innerHTML = `<div class="rx-ob"><div class="rx-ob__hero"><div class="logo">${FI("chef", 28)}</div><h1>${step ? esc(t) : "Open your restaurant on JulaDirect"}</h1><p class="lead">${step ? esc(sub) : "Get your own dashboard, live orders and a beautiful menu page. Takes about 3 minutes."}</p></div>
    <div class="rx-steps">${OB.map((_, i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>
    <div class="rx-card" id="ob-c">${step === 0 ? `<h2>${esc(t)}</h2><p class="sub">${esc(sub)}</p>` : ""}${last ? review(d) : fn(d)}</div>
    <div class="rx-ob__nav">${step ? `<button class="rx-btn rx-btn--ghost" id="ob-b">Back</button>` : `<a class="rx-btn rx-btn--ghost" href="../food.html">Cancel</a>`}<button class="rx-btn" id="ob-n">${last ? "Submit for approval" : "Continue"}</button></div></div>`;
    hydrate(root); const c = $("#ob-c"); bind(c, d); if (last) preview(c, d);
    const bk = $("#ob-b"); if (bk) bk.onclick = () => { S.ob.step--; onboard(); window.scrollTo(0, 0); };
    $("#ob-n").onclick = async () => {
      if (!last) { const e = validate(d, step); if (e) return toast(e); S.ob.step++; onboard(); window.scrollTo(0, 0); return; }
      const e = validate(d, "all"); if (e) return toast(e); const b = $("#ob-n"); b.disabled = true; b.textContent = "Submitting…";
      try { S.r = await create(d); toast("Submitted"); await enter(); location.hash = "#/overview"; } catch (er) { b.disabled = false; b.textContent = "Submit for approval"; toast(er.message || "Could not create your restaurant."); }
    };
  }
  const review = d => `<div class="rx-prev" data-prev></div><div style="margin-top:14px;display:grid;gap:6px;font-size:14px">${[["Location", d.location], ["Phone", d.phone], ["Hours", d.opening_hours], ["Service", [d.offers_delivery && "Delivery", d.offers_pickup && "Pickup"].filter(Boolean).join(" + ")], ["Delivery fee", money(d.delivery_fee || 0)], ["Prep time", (d.prep_minutes || 25) + " min"]].map(r => `<div class="rx-row"><span style="color:var(--rx-mut);width:110px">${r[0]}</span><b>${esc(r[1] || "Not set")}</b></div>`).join("")}</div><p style="color:var(--rx-mut);font-size:13px;margin:14px 0 0">After you submit, JulaDirect reviews your restaurant. You can add your menu while you wait.</p>`;
  async function create(d) {
    const row = clean(d); row.slug = F.slugify(row.name) || "restaurant";
    if (demo) return Object.assign({ id: "dnew", status: "pending", is_open: true }, row);
    for (let i = 0; i < 4; i++) {
      try { return await F.saveRestaurant(Object.assign({}, row, i ? { slug: row.slug + "-" + Math.random().toString(36).slice(2, 6) } : {})); }
      catch (e) { if (e && (e.code === "23505" || /duplicate|unique/i.test(e.message || ""))) continue; throw e; }
    }
    throw new Error("That restaurant name is taken. Try a slightly different name.");
  }

  /* ---------- events ---------- */
  document.addEventListener("click", async e => {
    const t = e.target;
    const st = t.closest("[data-st]"); if (st) return setStatus(st.dataset.id, st.dataset.st);
    const f = t.closest("[data-f]"); if (f) { S.filter = f.dataset.f; return paint(); }
    if (t.closest("[data-add-meal]")) return editMeal("");
    const ed = t.closest("[data-edit]"); if (ed) return editMeal(ed.dataset.edit);
    const av = t.closest("[data-avail]"); if (av) return toggleAvail(av.dataset.avail);
    if (t.closest("[data-toggle-open]")) {
      const v = !S.r.is_open; S.r.is_open = v; paint();
      if (!demo) try { await F.saveRestaurant({ id: S.r.id, is_open: v }); } catch (er) { S.r.is_open = !v; paint(); toast("Could not update."); }
    }
  });
  const _paint = paint; paint = function (a) { _paint(a); if (S.view === "profile") bindProfile(); if (S.view === "gifts") giftLoad(); };
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

  /* ---------- Gift cards (universal Restaurant Gift Card redemption) ---------- */
  const G = { sum: null, enrol: null, reds: [], credits: [], sets: [], card: null, idem: null, receipt: null, busy: false, err: "" };
  const gerr = { FORBIDDEN: "You are not allowed to do that for this restaurant.", NOT_FOUND: "We couldn't find a Restaurant Gift Card with that number.", RESTAURANT_NOT_ENROLLED: "This restaurant isn't approved for gift cards yet.", RATE_LIMITED: "Too many attempts. Please wait a few minutes.", BAD_PIN: "That PIN is not correct.", LOCKED: "This card is locked after too many wrong PINs. Try again later.", PIN_NOT_SET: "The card owner hasn't created a PIN yet.", INSUFFICIENT_BALANCE: "The card doesn't have enough balance.", CARD_NOT_USABLE: "This card can't be used right now.", BAD_AMOUNT: "Enter a valid amount.", AMOUNT_EXCEEDS_BILL: "The gift card amount can't be more than the bill.", IDEMPOTENCY_CONFLICT: "Please start the redemption again." };
  const gifts = () => `<div id="gx"><div class="rx-empty">Loading…</div></div>`;
  async function giftLoad() {
    const c = await F.client(); if (!c) return; const el = $("#gx"); if (!el) return;
    const rid = S.r.id;
    const [sm, rd, cr, se] = await Promise.all([c.rpc("gift_restaurant_summary", { p_restaurant: rid }), c.from("gift_redemptions").select("id,receipt_no,card_ref,amount,status,created_at").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(50), c.from("gift_merchant_credits").select("redemption_id,kind,amount,status").eq("restaurant_id", rid), c.from("gift_settlements").select("id,total,status,reference,created_at,paid_at").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(20)]);
    if (sm.error || !sm.data || !sm.data.ok) { el.innerHTML = `<div class="rx-card"><h2>Gift cards aren't set up yet</h2><p class="sub">Ask JulaDirect to switch the gift card programme on for the platform.</p></div>`; return; }
    G.staffList = []; G.payout = null;
    if (!S.staff) { const [sl, pm] = await Promise.all([c.rpc("gift_list_staff", { p_restaurant: rid }), c.from("gift_payout_methods").select("network,account_number,beneficiary_name,status").eq("restaurant_id", rid).maybeSingle()]); G.staffList = sl.data && sl.data.ok ? sl.data.staff : []; G.payout = pm.data || null; }
    G.sum = sm.data; G.reds = rd.data || []; G.credits = cr.data || []; G.sets = se.data || []; giftPaint();
  }
  const credStatus = id => { const k = G.credits.filter(x => x.redemption_id === id && x.kind === "redemption")[0]; return k ? k.status : "pending"; };
  function giftPaint() {
    const el = $("#gx"); if (!el) return; const en = G.sum.enrolment, sm = G.sum;
    const head = en === "approved" ? "" : `<div class="rx-banner rx-banner--${en === "requested" ? "pending" : en === "suspended" || en === "rejected" ? "suspended" : "pending"}">${FI("wallet", 22)}<div>${en === "requested" ? "Your request to accept Restaurant Gift Cards is awaiting approval." : en === "suspended" ? "Gift card redemptions are suspended for this restaurant." : en === "rejected" ? "Your gift card request was not approved. Contact JulaDirect." : "Accept JulaDirect Restaurant Gift Cards. Customers use one card at any participating restaurant, and you are credited for what they spend with you."}</div>${!en || en === "rejected" ? `<button class="rx-btn rx-btn--sm" data-g-enrol>Request to join</button>` : ""}</div>`;
    const kp = `<div class="rx-kpis"><div class="rx-kpi rx-kpi--hot"><small>Pending settlement</small><b>${money(sm.pending)}</b></div><div class="rx-kpi"><small>Total redeemed</small><b>${money(sm.redeemed_total)}</b></div><div class="rx-kpi"><small>Settled to you</small><b>${money(sm.settled)}</b></div><div class="rx-kpi"><small>Redemptions</small><b>${sm.redemptions}</b></div></div>`;
    const redeem = en === "approved" ? `<div class="rx-card"><h2>Redeem a gift card</h2><p class="sub">Enter the card number, or paste the QR link. The customer approves with their 6-digit PIN.</p>${G.receipt ? receiptHtml() : G.card ? redeemForm() : lookupForm()}</div>` : "";
    const rows = G.reds.length ? `<div class="rx-tblw"><table class="rx-tbl"><thead><tr><th>Date</th><th>Receipt</th><th>Card</th><th>Amount</th><th>Settlement</th></tr></thead><tbody>${G.reds.map(r => `<tr><td>${new Date(r.created_at).toLocaleString()}</td><td>${esc(r.receipt_no)}</td><td>${esc(r.card_ref)}</td><td><b>${money(r.amount)}</b>${r.status === "reversed" ? ' <span class="rx-tag rx-tag--bad">Reversed</span>' : ""}</td><td><span class="rx-tag ${credStatus(r.id) === "settled" ? "rx-tag--ok" : "rx-tag--warn"}">${credStatus(r.id) === "settled" ? "Settled" : credStatus(r.id) === "in_settlement" ? "In settlement" : "Pending"}</span></td></tr>`).join("")}</tbody></table></div>` : empty("wallet", "No gift card redemptions yet.");
    const sets = G.sets.length ? `<ul class="rx-sl">${G.sets.map(x => `<li><span><b>${money(x.total)}</b><small>${new Date(x.created_at).toLocaleDateString()}${x.reference ? " · " + esc(x.reference) : ""}</small></span><span class="rx-tag ${x.status === "paid" ? "rx-tag--ok" : x.status === "cancelled" ? "" : "rx-tag--warn"}">${x.status === "paid" ? "Paid" : x.status === "cancelled" ? "Cancelled" : "Payment due"}</span></li>`).join("")}</ul>` : `<p class="sub">No settlements yet.</p>`;
    const pm = G.payout, pst = pm ? pm.status : "", pill = pst === "active" ? "Approved" : pst === "pending" ? "Awaiting approval" : pst === "rejected" ? "Not approved" : "";
    const staff = G.sum.enrolment && S.r && !S.staff ? `<div class="rx-card"><h2>Staff who can redeem</h2><p class="sub">Add a team member by the email of their JulaDirect account. They can redeem gift cards here and nothing else.</p>${G.staffList.length ? `<ul class="rx-sl">${G.staffList.map(x => `<li><span><b>${esc(x.email)}</b><small>Added ${new Date(x.added_at).toLocaleDateString()}</small></span><button class="rx-btn rx-btn--ghost rx-btn--sm" data-g-rm="${esc(x.email)}">Remove</button></li>`).join("")}</ul>` : `<p class="sub">No staff added yet. Only you can redeem right now.</p>`}<div class="rx-row"><input id="g-st" type="email" placeholder="staff@example.com" style="flex:1;min-width:200px"><button class="rx-btn rx-btn--soft rx-btn--sm" data-g-staff="1">Add staff</button></div></div>
    <div class="rx-card"><h2>Get paid</h2><p class="sub">Settlements are sent to this Wave or Afrimoney number once JulaDirect approves it. Changing it needs approval again. ${pill ? `<b>Status: ${pill}</b>` : ""}</p><div class="rx-row"><select id="g-pn"><option value="wave" ${pm && pm.network === "wave" ? "selected" : ""}>Wave</option><option value="afrimoney" ${pm && pm.network === "afrimoney" ? "selected" : ""}>Afrimoney</option></select><input id="g-pa" inputmode="tel" placeholder="Mobile money number" value="${pm ? esc(pm.account_number) : ""}" style="flex:1;min-width:170px"><input id="g-pb" placeholder="Name on the account" value="${pm ? esc(pm.beneficiary_name) : ""}" maxlength="80" style="flex:1;min-width:170px"><button class="rx-btn rx-btn--soft rx-btn--sm" data-g-pay="1">Save</button></div></div>` : "";
    el.innerHTML = `${head}${en === "approved" ? kp : ""}${redeem}<div class="rx-cols"><div class="rx-card"><h2>Redemption history</h2><p class="sub">Only your restaurant's transactions appear here.</p>${rows}</div><div><div class="rx-card"><h2>Settlements</h2>${sets}</div>${staff}</div></div>`;
    const ref = $("#g-ref"); if (ref) ref.focus && 0;
  }
  const lookupForm = () => `<div class="rx-f"><label>Card number or QR link<input id="g-ref" placeholder="JD-R-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters"></label><div class="rx-row"><button class="rx-btn rx-sp" data-g-look>Find card</button>${"BarcodeDetector" in window ? `<button class="rx-btn rx-btn--ghost" data-g-scan>Scan QR</button>` : ""}</div><p class="gf-err rx-gerr" role="alert">${esc(G.err)}</p></div>`;
  const redeemForm = () => `<div class="rx-banner rx-banner--approved" style="margin-bottom:12px">${FI("check", 22)}<div><b>${esc(G.card.ref)}</b><br>Balance ${money(G.card.balance)}${G.card.recipient_name ? " · for " + esc(G.card.recipient_name) : ""}</div></div>${G.card.usable ? `<form class="rx-f rx-f--2" id="g-form" novalidate><label>Bill total (D) <small>optional</small><input id="g-bill" type="number" inputmode="decimal" min="0" step="1"></label><label>Amount to pay with gift card (D)<input id="g-amt" type="number" inputmode="decimal" min="1" step="1" max="${G.card.balance}" required></label><label class="wide">Customer's 6-digit PIN<input id="g-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="••••••" style="letter-spacing:.4em;font-size:20px"></label><div class="wide rx-row"><button type="submit" class="rx-btn rx-sp" id="g-go">Review and redeem</button><button type="button" class="rx-btn rx-btn--ghost" data-g-reset>Cancel</button></div><p class="gf-err rx-gerr wide" role="alert">${esc(G.err)}</p></form>` : `<p class="gf-err">${G.card.locked ? "This card is locked for a while after too many wrong PINs." : "This card can't be used (" + esc(G.card.status.replace(/_/g, " ")) + ")."}</p><button class="rx-btn rx-btn--ghost" data-g-reset>Back</button>`}`;
  const receiptHtml = () => `<div class="rx-banner rx-banner--approved">${FI("check", 22)}<div><b>Redeemed ${money(G.receipt.amount)}</b><br>Receipt ${esc(G.receipt.receipt_no)} · card balance now ${money(G.receipt.balance_after)}${G.receipt.duplicate ? " (already recorded)" : ""}</div></div><p class="sub" style="margin-top:12px">${esc(S.r.name)} will be credited ${money(G.receipt.amount)}. Collect any remaining bill another way.</p><div class="rx-row"><button class="rx-btn" data-g-reset>Next customer</button><button class="rx-btn rx-btn--ghost" data-g-print>Print receipt</button></div>`;
  function refOf(v) { v = String(v || "").trim(); const m = /[?&]t=([0-9a-f]{48})/i.exec(v); return m ? m[1].toLowerCase() : v; }
  async function gLookup() {
    const c = await F.client(), ref = refOf($("#g-ref").value); if (!ref) return;
    G.err = ""; const { data, error } = await c.rpc("gift_lookup", { p_restaurant: S.r.id, p_ref: ref });
    if (error || !data || !data.ok) { G.err = gerr[data && data.error] || "We couldn't look that card up."; return giftPaint(); }
    G.card = data; G.idem = null; giftPaint();
  }
  async function gRedeem(e) {
    e.preventDefault(); if (G.busy) return; const amt = Number($("#g-amt").value), bill = $("#g-bill").value === "" ? null : Number($("#g-bill").value), pin = $("#g-pin").value.trim();
    const bad = m => { G.err = m; $(".rx-gerr").textContent = m; };
    if (!(amt > 0) || Math.round(amt * 100) !== amt * 100) return bad("Enter a valid amount."); if (amt > G.card.balance) return bad("That's more than the card balance."); if (bill != null && amt > bill) return bad("The gift card amount can't be more than the bill."); if (!/^\d{6}$/.test(pin)) return bad("Enter the customer's 6-digit PIN.");
    if (!confirm(`Redeem ${money(amt)} from this gift card?\n${bill != null && bill > amt ? "The customer pays the remaining " + money(bill - amt) + " another way." : ""}`)) return;
    G.busy = true; const b = $("#g-go"); b.disabled = true; b.textContent = "Redeeming…";
    G.idem = G.idem || "rdm-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
    try {
      const c = await F.client(), { data, error } = await c.rpc("gift_redeem", { p_restaurant: S.r.id, p_card: G.card.card_id, p_pin: pin, p_amount: amt, p_idem: G.idem, p_bill: bill });
      if (error || !data) throw new Error("network"); if (!data.ok) { G.busy = false; G.err = gerr[data.error] || "The redemption was not completed. No money was taken from the card."; if (data.error === "LOCKED") G.card.usable = false; giftPaint(); return; }
      G.receipt = data; G.card = null; G.idem = null; G.busy = false; await giftLoad();
    } catch (er) { G.busy = false; G.err = "Connection problem. Tap redeem again: it can't be charged twice."; giftPaint(); }
  }
  function gScan() {
    openDrawer(`<span class="rx-grab"></span><h2>Scan QR</h2><video id="g-v" playsinline muted style="width:100%;border-radius:18px;background:#000"></video><form><button type="button" class="rx-btn rx-btn--ghost" data-g-stop style="margin-top:12px">Close</button></form>`, {}, () => {});
    let stop = false, stream; const done = () => { stop = true; if (stream) stream.getTracks().forEach(t => t.stop()); closeDrawer(); };
    $("[data-g-stop]", drawerEl).onclick = done;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(async s => { stream = s; const v = $("#g-v"); v.srcObject = s; await v.play(); const det = new BarcodeDetector({ formats: ["qr_code"] });
      const tick = async () => { if (stop) return; try { const r = await det.detect(v); if (r[0]) { $("#g-ref") && ($("#g-ref").value = r[0].rawValue); done(); gLookup(); return; } } catch (e) {} requestAnimationFrame(tick); }; tick(); }).catch(() => { toast("Camera isn't available. Type the card number instead."); done(); });
  }
  document.addEventListener("click", async e => {
    const t = e.target, c = () => F.client();
    if (t.closest("[data-g-enrol]")) { const { data } = await (await c()).rpc("gift_request_enrolment", { p_restaurant: S.r.id }); toast(data && data.ok ? "Request sent" : "Could not send request"); return giftLoad(); }
    if (t.closest("[data-g-look]")) return gLookup(); if (t.closest("[data-g-scan]")) return gScan();
    if (t.closest("[data-g-reset]")) { G.card = null; G.receipt = null; G.err = ""; G.idem = null; return giftPaint(); }
    if (t.closest("[data-g-print]")) return window.print();
    const rm = t.closest("[data-g-rm]"); if (rm) { if (!confirm("Remove " + rm.dataset.gRm + " from gift card staff?")) return; const { data } = await (await c()).rpc("gift_set_staff", { p_restaurant: S.r.id, p_email: rm.dataset.gRm, p_add: false }); toast(data && data.ok ? "Staff member removed" : "Only the restaurant owner can change staff."); return giftLoad(); }
    const pay = t.closest("[data-g-pay]"); if (pay) { const { data } = await (await c()).rpc("gift_set_payout_method", { p_restaurant: S.r.id, p_network: $("#g-pn").value, p_number: $("#g-pa").value, p_name: $("#g-pb").value }); toast(data && data.ok ? "Saved. JulaDirect will review it before paying out." : data && data.error === "BAD_DETAILS" ? "Check the number and the name." : "Only the restaurant owner can change payout details."); return giftLoad(); }
    const st = t.closest("[data-g-staff]"); if (st) { const em = $("#g-st").value.trim(); if (!em) return; const { data } = await (await c()).rpc("gift_set_staff", { p_restaurant: S.r.id, p_email: em, p_add: true }); if (data && data.ok) { toast("Staff member added"); return giftLoad(); } toast(data && data.error === "USER_NOT_FOUND" ? "No JulaDirect account uses that email." : "Only the restaurant owner can change staff."); }
  });
  document.addEventListener("submit", e => { if (e.target.id === "g-form") gRedeem(e); });
  document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "g-ref") { e.preventDefault(); gLookup(); } });
  boot();
})();
