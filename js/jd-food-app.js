/* Food app home: tabs (Home / Orders / Saved / Account). */
(async function () {
  "use strict";
  if (!(await JDFood.guardPage())) return;
  const { esc, money, hueOf, safeUrl } = JDFood, $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const app = $("#fa-app"); JDFoodUI.mount(app); FI.hydrate(app);
  const eOf = r => FI(FI.cuisine((r.cuisines || [])[0]), 38);
  const [rests, hot] = await Promise.all([JDFood.restaurants(), JDFood.featured(12)]);
  const byId = Object.fromEntries(rests.map(r => [r.id, r]));
  let name = "there", initial = "J";
  try { if (!JDFood.isDemo()) { await GamBasketAuth.ready(); const s = await GamBasketAuth.getSession(); const n = s?.user?.user_metadata?.first_name || s?.user?.user_metadata?.full_name || (s?.user?.email || "").split("@")[0]; if (n) { name = String(n).split(" ")[0]; initial = name[0].toUpperCase(); } } else { name = "Sarah"; initial = "S"; } } catch (e) {}
  let cuisine = "All", q = "", openOnly = false;
  const cuisines = ["All"].concat([...new Set(rests.flatMap(r => r.cuisines || []))]);


  /* ----- food guide: answer 3 quick questions, get matching meals (hook `jdfood:ask` to plug in a real AI) ----- */
  const all = await (async () => { const out = []; for (const r of rests) { const ms = await JDFood.menu(r.id); ms.forEach(m => out.push(Object.assign({}, m, { restaurant: r }))); } return out; })();
  const gstate = { budget: null, mood: null };
  const sheet = document.createElement("section"), scrim = document.createElement("div");
  sheet.className = "fa-sheet"; scrim.className = "fa-scrim"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); app.append(scrim, sheet);
  const closeSheet = () => { sheet.classList.remove("is-on"); scrim.classList.remove("is-on"); };
  scrim.addEventListener("click", closeSheet);
  function openSheet(html) { sheet.innerHTML = '<span class="fa-grab"></span>' + html; sheet.classList.add("is-on"); scrim.classList.add("is-on"); }
  const chips = (key, opts) => `<div class="fa-gchips" data-k="${key}">${opts.map(o => `<button type="button" class="fa-pill" data-v="${esc(o[0])}" aria-pressed="${gstate[key] === o[0]}"><i>${FI(o[2], 18)}</i>${esc(o[1])}</button>`).join("")}</div>`;
  function openGuide() {
    openSheet(`<h2>Your food guide</h2><p class="fa-gp">What are you in the mood for?</p>${chips("mood", [["any", "Surprise me", "spark"], ["spicy", "Something spicy", "flame"], ["light", "Light and fresh", "leaf"], ["hearty", "Big and filling", "bowl"]])}<p class="fa-gp">Budget per meal</p>${chips("budget", [["200", "Under D200", "wallet"], ["400", "Under D400", "wallet"], ["9999", "No limit", "wallet"]])}<button class="fa-btn" type="button" id="fa-gogo">Find my meal</button>`);
  }
  function guideResults() {
    document.dispatchEvent(new CustomEvent("jdfood:ask", { detail: Object.assign({}, gstate) }));
    const cap = Number(gstate.budget || 9999); let pool = all.filter(m => m.is_available !== false && m.restaurant.is_open !== false && m.price <= cap);
    const mood = gstate.mood || "any", txt = m => (m.name + " " + (m.description || "") + " " + (m.category || "") + " " + (m.tags || []).join(" ")).toLowerCase();
    const score = m => mood === "spicy" ? (m.spicy || 0) * 2 + (m.is_featured ? 1 : 0) : mood === "light" ? (/salad|bowl|fresh|vegan|juice|fruit|light/.test(txt(m)) ? 3 : 0) + (m.is_featured ? 1 : 0) : mood === "hearty" ? (/rice|stew|grill|burger|chicken|lamb|beef|fish|benachin|domoda/.test(txt(m)) ? 2 : 0) + m.price / 400 : (m.is_featured ? 2 : 0) + Math.random();
    pool = pool.map(m => [score(m), m]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(x => x[1]);
    openSheet(`<h2>${pool.length ? "Try these" : "Nothing matched"}</h2>` + (pool.length ? pool.map(m => `<div class="fa-line" data-pick="${esc(m.id)}" style="cursor:pointer"><span class="th">${JDFoodUI.thumb(m)}</span><div class="n"><b>${esc(m.name)}</b><small>${esc(m.restaurant.name)} · ${money(m.price)}</small></div>${FI("arrow", 18)}</div>`).join("") : '<p class="fa-gp">Try a bigger budget or another mood.</p>') + '<button class="fa-btn fa-btn--ghost" type="button" id="fa-gback">Start over</button>');
    sheet.querySelectorAll("[data-pick]").forEach(el => el.addEventListener("click", () => { const m = all.find(x => String(x.id) === el.dataset.pick); closeSheet(); setTimeout(() => JDFoodUI.openMeal(m, m.restaurant), 250); }));
    const bk = sheet.querySelector("#fa-gback"); if (bk) bk.addEventListener("click", openGuide);
  }
  sheet.addEventListener("click", e => { const c = e.target.closest(".fa-gchips [data-v]"); if (c) { const k = c.parentNode.dataset.k; gstate[k] = c.dataset.v; c.parentNode.querySelectorAll(".fa-pill").forEach(x => x.setAttribute("aria-pressed", String(x === c))); return; } if (e.target.closest("#fa-gogo")) guideResults(); });
  function openBell() { const n = JDFoodUI.orders().length; openSheet(`<h2>Notifications</h2><div class="fa-line"><span class="th">${FI("receipt", 26)}</span><div class="n"><b>${n ? n + (n === 1 ? " order sent" : " orders sent") : "You're all caught up"}</b><small>${n ? "Confirm status with the restaurant. Order updates will appear here." : "Order updates will appear here."}</small></div></div><a class="fa-btn fa-btn--ghost" href="index.html">Back to JulaDirect</a>`); }

  /* ----- home ----- */
  function homeShell() {
    $("#p-home").innerHTML = `<div class="fa-bar"><span class="fa-av">${esc(initial)}</span><div class="fa-hi">Hi, ${esc(name)}</div><button class="fa-rb fa-bell" id="fa-bell" type="button" aria-label="Notifications">${FI("bell", 22)}${JDFoodUI.orders().length ? '<i class="fa-dot"></i>' : ""}</button></div>
    <h1 class="fa-h1">Let's find your new <em>favorite meal!</em></h1>
    <div class="fa-search"><label><span aria-hidden="true" class="fa-si">${FI("search", 20)}</span><input id="fa-q" type="search" placeholder="What are you craving?" autocomplete="off"></label><button class="fa-filter" id="fa-open" type="button" aria-pressed="false" aria-label="Show open restaurants only" title="Open now">${FI("sliders", 22)}</button></div>
    <div class="fa-pills" id="fa-pills">${cuisines.map(c => `<button class="fa-pill" type="button" data-c="${esc(c)}" aria-pressed="${c === "All"}"><i>${FI(FI.cuisine(c), 18)}</i>${esc(c)}</button>`).join("")}</div>
    <div class="fa-sec"><h2>Popular now</h2></div><div class="fa-car" id="fa-car"></div>
    <button class="fa-guide" id="fa-guide" type="button"><span class="fa-guide__i">${FI("chef", 26)}</span><span><b>Not sure what to eat?</b><small>Tell me your mood and budget. I'll pick for you.</small></span>${FI("arrow", 18)}</button>
    <div class="fa-sec"><h2>Restaurants</h2><span style="color:var(--fa-mut);font-weight:700" id="fa-n"></span></div><div id="fa-rests"></div>`;
  }
  const filt = () => rests.filter(r => (cuisine === "All" || (r.cuisines || []).includes(cuisine)) && (!openOnly || r.is_open) && (!q || (r.name + " " + (r.cuisines || []).join(" ") + " " + (r.tagline || "")).toLowerCase().includes(q)));
  function paintHome() {
    const list = filt(), ids = new Set(list.map(r => r.id));
    const meals = hot.filter(m => m.restaurant && ids.has(m.restaurant.id) && (!q || m.name.toLowerCase().includes(q) || true));
    $("#fa-car").innerHTML = meals.length ? meals.map((m, i) => { const r = byId[m.restaurant.id] || m.restaurant, img = safeUrl(m.image_url); return `<article class="fa-card" style="--h:${hueOf(r)};--i:${i}" data-m="${esc(m.id)}" data-r="${esc(r.id)}">${img ? `<span class="fa-card__img" style="background-image:url('${esc(img)}')"></span>` : `<span class="fa-card__e">${FI("plate", 150)}</span>`}<span class="fa-time">${FI("clock", 15)} ${(r.prep_minutes || 25)}–${(r.prep_minutes || 25) + 10} min</span><div class="fa-card__t"><div class="fa-card__r"><h3>${esc(m.name)}</h3><span class="fa-score">${r.rating ? Number(r.rating).toFixed(1) + "/5" : esc(r.name)}</span></div><p>${esc(m.description || "")}</p></div></article>`; }).join("") : '<p class="fa-empty">Nothing here yet.</p>';
    $("#fa-rests").innerHTML = list.length ? list.map((r, i) => { const bg = safeUrl(r.cover_url); return `<a class="fa-rest" style="--h:${hueOf(r)};--i:${i}" href="restaurant.html?slug=${encodeURIComponent(r.slug)}"><span class="fa-rest__img"${bg ? ` style="background-image:url('${esc(bg)}')"` : ""}>${bg ? "" : eOf(r)}</span><span style="flex:1;min-width:0"><b>${esc(r.name)}</b><small>${esc(r.tagline || (r.cuisines || []).join(" · "))}</small><span class="fa-rest__m"><span class="fa-tag fa-tag--${r.is_open ? "on" : "off"}">${r.is_open ? "Open" : "Closed"}</span>${r.rating ? `<span class="fa-tag fa-tag--i">${FI("star", 12)} ${Number(r.rating).toFixed(1)}</span>` : ""}<span class="fa-tag">${r.prep_minutes || 25} min</span>${r.offers_delivery ? `<span class="fa-tag">${r.delivery_fee ? money(r.delivery_fee) : "Free delivery"}</span>` : ""}</span></span></a>`; }).join("") : '<p class="fa-empty"><b>${FI("utensils", 44)}</b>No restaurants match.</p>';
    $("#fa-n").textContent = list.length + " found"; scaleCards();
  }
  function scaleCards() {
    const car = $("#fa-car"); if (!car) return; const mid = car.getBoundingClientRect().left + car.clientWidth / 2;
    $$(".fa-card", car).forEach(c => { const b = c.getBoundingClientRect(), d = Math.min(1, Math.abs(b.left + b.width / 2 - mid) / (car.clientWidth * .6)); const sg = (b.left + b.width / 2) < mid ? 1 : -1; c.style.setProperty("--sc", (1 - d * .12).toFixed(3)); c.style.setProperty("--op", (1 - d * .2).toFixed(2)); c.style.setProperty("--ry", (sg * d * 34).toFixed(1) + "deg"); });
  }
  homeShell(); paintHome();
  $("#fa-car").addEventListener("scroll", () => requestAnimationFrame(scaleCards), { passive: true });
  $("#p-home").addEventListener("click", e => {
    const p = e.target.closest("[data-c]"); if (p) { cuisine = p.dataset.c; $$("[data-c]").forEach(x => x.setAttribute("aria-pressed", String(x === p))); paintHome(); return; }
    const g = e.target.closest("#fa-guide"); if (g) return openGuide(); const bl = e.target.closest("#fa-bell"); if (bl) return openBell(); const f = e.target.closest("#fa-open"); if (f) { openOnly = !openOnly; f.setAttribute("aria-pressed", String(openOnly)); paintHome(); return; }
    const c = e.target.closest(".fa-card"); if (c) { const r = byId[c.dataset.r], m = hot.find(x => String(x.id) === c.dataset.m); if (r && m) JDFoodUI.openMeal(m, r); }
  });
  $("#p-home").addEventListener("input", e => { if (e.target.id === "fa-q") { q = e.target.value.trim().toLowerCase(); paintHome(); } });

  /* ----- other tabs ----- */
  const ago = iso => { const s = (Date.now() - new Date(iso)) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
  function paintOrders() {
    const os = JDFoodUI.orders();
    $("#p-orders").innerHTML = `<h1 class="fa-h1" style="margin-top:8px">Your <em>orders</em></h1>` + (os.length ? os.map((o, i) => `<a class="fa-rest" style="--h:${o.restaurant.hue || 20};--i:${i}" href="restaurant.html?slug=${encodeURIComponent(o.restaurant.slug)}"><span class="fa-rest__img">${FI("bag", 36)}</span><span style="flex:1;min-width:0"><b>${esc(o.restaurant.name)}</b><small>${o.items.map(x => x.quantity + "× " + esc(x.name)).join(", ")}</small><span class="fa-rest__m"><span class="fa-tag">${money(o.total)}</span><span class="fa-tag">${ago(o.at)}</span><span class="fa-tag fa-tag--on">Sent</span></span></span></a>`).join("") + '<p class="fa-empty" style="padding:10px">Orders sent from this device. Confirm status with the restaurant.</p>' : '<p class="fa-empty"><b>${FI("receipt", 44)}</b>No orders yet.<br>Your sent orders will show up here.</p>');
  }
  function paintSaved() {
    const s = Object.values(JDFoodUI.saved());
    $("#p-saved").innerHTML = `<h1 class="fa-h1" style="margin-top:8px">Saved <em>meals</em></h1>` + (s.length ? s.map((x, i) => `<div class="fa-row" style="--h:${x.r.hue};--i:${i}" data-sv="${esc(x.m.id)}"><span class="th">${JDFoodUI.thumb(x.m)}</span><span class="n"><b>${esc(x.m.name)}</b><p>${esc(x.r.name)}</p><span class="pr"><strong>${money(x.m.price)}</strong></span></span></div>`).join("") : '<p class="fa-empty"><b>${FI("heart", 44)}</b>Tap the heart on a meal to save it here.</p>');
  }
  function paintAccount() {
    $("#p-account").innerHTML = `<div class="fa-bar"><span class="fa-av">${esc(initial)}</span><div class="fa-hi"><small>Signed in as</small>${esc(name)}</div></div><h1 class="fa-h1">Your <em>account</em></h1><div class="fa-set"><a href="me.html">${FI("user", 22)}JulaDirect account</a><a href="restaurant-studio.html">${FI("chef", 22)}Restaurant dashboard</a><a href="index.html">${FI("bag", 22)}Back to JulaDirect</a></div>`;
  }
  $("#p-saved").addEventListener("click", e => { const r = e.target.closest("[data-sv]"); if (!r) return; const x = JDFoodUI.saved()[r.dataset.sv]; if (x) location.href = "restaurant.html?slug=" + encodeURIComponent(x.r.slug) + "#" + encodeURIComponent(x.m.id); });

  /* ----- tabs with jelly slide ----- */
  const order = ["home", "orders", "saved", "account"]; let tab = "home";
  const painters = { orders: paintOrders, saved: paintSaved, account: paintAccount };
  function go(t, instant) {
    if (!order.includes(t) || t === tab && !instant) return; const dir = order.indexOf(t) >= order.indexOf(tab) ? "right" : "left";
    if (painters[t]) painters[t]();
    $$(".fa-pane").forEach(p => { p.hidden = p.dataset.pane !== t; }); $$("#fa-nav button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.t === t)));
    const pane = $("#p-" + t); if (!instant && window.Jelly) Jelly.slide(pane, dir, { mode: "offset" }); tab = t; scrollTo(0, 0);
    if (t === "home") scaleCards(); history.replaceState(null, "", t === "home" ? location.pathname : "#" + t);
  }
  $("#fa-nav").addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (b) go(b.dataset.t); });
  window.JDFoodApp = { go };
  const h = location.hash.slice(1); if (order.includes(h) && h !== "home") go(h, true);
})();
