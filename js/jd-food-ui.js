/* Shared food-app UI: cart, meal detail, order sheet, "order sent" screen. */
(function () {
  "use strict";
  const { esc, money, hueOf, safeUrl } = JDFood;
  const $ = (s, r) => (r || document).querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let cart = jget("jd_food_cart", { r: null, items: {}, note: "" }), saved = jget("jd_food_saved", {}), listeners = [], app;
  const snap = m => ({ id: m.id, name: m.name, price: m.price, emoji: m.emoji, image_url: m.image_url, description: m.description, spicy: m.spicy, category: m.category });
  const lines = () => Object.values(cart.items).filter(l => l.q > 0);
  const count = () => lines().reduce((s, l) => s + l.q, 0), total = () => lines().reduce((s, l) => s + l.m.price * l.q, 0);
  const fee = () => (cart.r && cart.r.offers_delivery ? Number(cart.r.delivery_fee || 0) : 0);
  const save = () => { jset("jd_food_cart", cart); listeners.forEach(f => f()); paintBar(); };
  const qtyOf = id => (cart.items[id] ? cart.items[id].q : 0);
  function setQty(r, m, q) {
    if (q > 0 && cart.r && cart.r.id !== r.id && count() > 0) { if (!confirm(`Your order has meals from ${cart.r.name}. Start a new order with ${r.name}?`)) return false; cart = { r: null, items: {} }; }
    if (q > 0 && (!cart.r || cart.r.id !== r.id)) cart.r = { id: r.id, slug: r.slug, name: r.name, whatsapp: r.whatsapp, phone: r.phone, delivery_fee: r.delivery_fee, min_order: r.min_order, offers_delivery: r.offers_delivery, prep_minutes: r.prep_minutes, hue: hueOf(r) };
    if (q <= 0) delete cart.items[m.id]; else cart.items[m.id] = { m: snap(m), q: Math.min(q, 30) };
    if (!count()) cart = { r: null, items: {} };
    save(); return true;
  }
  const thumb = m => safeUrl(m.image_url) ? `<img src="${esc(safeUrl(m.image_url))}" alt="" loading="lazy">` : FI("plate", 40);

  /* ----- mount ----- */
  function mount(root) {
    app = root || document.body;
    app.insertAdjacentHTML("beforeend", `<button class="fa-cartbar" id="fa-bar" type="button" aria-label="View cart"></button><div class="fa-scrim" id="fa-scrim"></div><section class="fa-sheet" id="fa-sheet" role="dialog" aria-modal="true" aria-label="Your order"></section><section class="fa-meal" id="fa-meal" role="dialog" aria-modal="true" aria-label="Meal"></section><section class="fa-done" id="fa-done" role="dialog" aria-modal="true"></section>`);
    $("#fa-bar").addEventListener("click", openCart); $("#fa-scrim").addEventListener("click", () => { closeCart(); closeMeal(); });
    addEventListener("keydown", e => { if (e.key === "Escape") { closeCart(); closeMeal(); } });
    paintBar();
  }
  function paintBar() {
    const b = $("#fa-bar"); if (!b) return; const n = count();
    b.classList.toggle("is-on", n > 0);
    b.innerHTML = `<span class="fa-stack">${lines().slice(0, 3).map(l => `<i>${thumb(l.m)}</i>`).join("")}${n > 3 ? `<i style="font-size:12px;font-weight:800">+${n - 3}</i>` : ""}</span><span class="t">View cart<small>${n} ${n === 1 ? "item" : "items"} · ${money(total())}</small></span><span class="fa-go">${FI("arrow", 20)}</span>`;
    if (!reduce && n) b.animate([{ scale: 1 }, { scale: 1.06 }, { scale: .98 }, { scale: 1 }], { duration: 420, easing: "ease-out" });
  }

  /* ----- meal detail ----- */
  let cur = null;
  function openMeal(m, r, fromEl) {
    cur = { m, r, q: Math.max(1, qtyOf(m.id)) };
    const el = $("#fa-meal"), h = hueOf(r), isSaved = !!saved[m.id];
    const crumbs = ["spark", "leaf", "drop", "spark", "spark"].map((c, i) => `<span class="fa-crumb" style="left:${10 + i * 19}%;top:${14 + (i * 31) % 60}%;--d:${4 + i}s;--dl:${-i}s">${FI(c, 16 + (i % 3) * 6)}</span>`).join("");
    el.style.setProperty("--h", h);
    el.innerHTML = `<div class="fa-meal__top"><button class="fa-rb l" type="button" data-close aria-label="Back">${FI("back", 22)}</button><button class="fa-rb r" type="button" data-save aria-pressed="${isSaved}" aria-label="Save">${FI(isSaved ? "heartfill" : "heart", 22)}</button>${crumbs}${safeUrl(m.image_url) ? `<img class="fa-hero-img" src="${esc(safeUrl(m.image_url))}" alt="${esc(m.name)}">` : `<span class="fa-hero-e">${FI("plate", 250)}</span>`}</div>
    <div class="fa-meal__sheet"><div class="fa-meal__h"><div><h2>${esc(m.name)}</h2><small>${esc(r.name)}${m.spicy ? ` · <span class="fa-spicy">${FI("flame", 13).repeat(m.spicy)}</span>` : ""}</small></div></div>
    ${m.description ? `<p class="fa-quote">${esc(m.description)}</p>` : ""}
    <div class="fa-buy"><div><small>Total price</small><b id="fa-mt">${money(m.price * cur.q)}</b></div><div class="fa-step"><button type="button" data-d="-1" aria-label="Less">−</button><b id="fa-mq">${cur.q}</b><button class="plus" type="button" data-d="1" aria-label="More">+</button></div></div>
    <button class="fa-btn" type="button" data-addm ${m.is_available === false || r.is_open === false ? "disabled" : ""}>${m.is_available === false ? "Sold out" : r.is_open === false ? "Restaurant is closed" : qtyOf(m.id) ? "Update cart" : "Add to cart"}</button></div>`;
    el.classList.add("is-on"); document.body.style.overflow = "hidden"; $("#fa-scrim").classList.add("is-on");
    const hero = $(".fa-hero-e,.fa-hero-img", el);
    if (hero && !reduce) hero.animate([{ transform: "scale(.3) rotate(-90deg)", opacity: 0 }, { transform: "scale(1.12) rotate(8deg)", opacity: 1, offset: .65 }, { transform: "none" }], { duration: 900, easing: "cubic-bezier(.3,1.3,.4,1)" });
  }
  function closeMeal() { const el = $("#fa-meal"); if (!el || !el.classList.contains("is-on")) return; el.classList.remove("is-on"); document.body.style.overflow = ""; if (!$("#fa-sheet").classList.contains("is-on")) $("#fa-scrim").classList.remove("is-on"); }
  document.addEventListener("click", e => {
    const el = e.target.closest("#fa-meal"); if (!el) return;
    if (e.target.closest("[data-close]")) return closeMeal();
    const s = e.target.closest("[data-save]"); if (s) { const m = cur.m; if (saved[m.id]) delete saved[m.id]; else saved[m.id] = { m: snap(m), r: { id: cur.r.id, slug: cur.r.slug, name: cur.r.name, hue: hueOf(cur.r) } }; jset("jd_food_saved", saved); s.innerHTML = FI(saved[m.id] ? "heartfill" : "heart", 22); s.setAttribute("aria-pressed", String(!!saved[m.id])); listeners.forEach(f => f()); if (!reduce) s.animate([{ transform: "scale(1)" }, { transform: "scale(1.5)" }, { transform: "scale(1)" }], { duration: 400, easing: "cubic-bezier(.34,1.7,.5,1)" }); return; }
    const d = e.target.closest("[data-d]"); if (d) { cur.q = Math.max(1, Math.min(30, cur.q + Number(d.dataset.d))); $("#fa-mq").textContent = cur.q; $("#fa-mt").textContent = money(cur.m.price * cur.q); return; }
    if (e.target.closest("[data-addm]")) { if (setQty(cur.r, cur.m, cur.q)) { closeMeal(); } }
  });

  /* ----- cart sheet / checkout ----- */
  const prof = () => jget("jd_food_profile", { name: "", phone: "", address: "", mode: "delivery" });
  function mode() { const r = cart.r || {}, p = prof(); return p.mode === "pickup" && r.offers_pickup !== false ? "pickup" : r.offers_delivery === false ? "pickup" : "delivery"; }
  function paintCart() {
    const sh = $("#fa-sheet"), ls = lines(); if (!ls.length) { closeCart(); return; }
    const r = cart.r, p = prof(), md = mode(), sub = total(), f = md === "delivery" ? Number(r.delivery_fee || 0) : 0, min = Number(r.min_order || 0), low = min && sub < min;
    const seg = (r.offers_delivery !== false && r.offers_pickup !== false) ? `<div class="fa-seg" role="tablist"><button type="button" data-md="delivery" aria-pressed="${md === "delivery"}">${FI("scooter", 18)}Delivery</button><button type="button" data-md="pickup" aria-pressed="${md === "pickup"}">${FI("bag", 18)}Pickup</button></div>` : "";
    sh.innerHTML = `<span class="fa-grab"></span><h2>Your order · ${esc(r.name)}</h2>${ls.map(l => `<div class="fa-line"><span class="th">${thumb(l.m)}</span><div class="n"><b>${esc(l.m.name)}</b><small>${money(l.m.price)}</small></div><div class="fa-step"><button type="button" data-l="${esc(l.m.id)}" data-d="-1" aria-label="Less">−</button><b>${l.q}</b><button class="plus" type="button" data-l="${esc(l.m.id)}" data-d="1" aria-label="More">+</button></div></div>`).join("")}
    ${seg}<div class="fa-fields"><label>Your name<input id="fa-n" autocomplete="name" value="${esc(p.name)}" placeholder="Full name"></label><label>Phone<input id="fa-p" type="tel" autocomplete="tel" value="${esc(p.phone)}" placeholder="+220 700 0000"></label>${md === "delivery" ? `<label class="wide">Delivery address<input id="fa-a" autocomplete="street-address" value="${esc(p.address)}" placeholder="Area, street, landmark"></label>` : ""}<label class="wide">Note for the kitchen<textarea id="fa-note" rows="2" maxlength="300" placeholder="No onions, extra sauce…">${esc(cart.note || "")}</textarea></label></div>
    <div class="fa-sum"><span>Subtotal</span><span>${money(sub)}</span></div>${md === "delivery" ? `<div class="fa-sum"><span>Delivery</span><span>${f ? money(f) : "Free"}</span></div>` : ""}<div class="fa-sum t"><span>Total</span><span>${money(sub + f)}</span></div>
    ${low ? `<p class="fa-err">Minimum order is ${money(min)}.</p>` : ""}<p class="fa-err" id="fa-err" hidden></p>
    <button class="fa-btn fa-btn--dark" type="button" data-place ${low || r.is_open === false ? "disabled" : ""}>Place order · ${money(sub + f)}</button><button class="fa-btn fa-btn--ghost" type="button" data-clear>Clear order</button>`;
  }
  function openCart() { paintCart(); $("#fa-sheet").classList.add("is-on"); $("#fa-scrim").classList.add("is-on"); }
  function closeCart() { const s = $("#fa-sheet"); if (s) { s.classList.remove("is-on"); $("#fa-scrim").classList.remove("is-on"); } }
  const saveProf = () => { const g = id => ($("#" + id) || {}).value, p = prof(); const n = g("fa-n"), ph = g("fa-p"), a = g("fa-a"); jset("jd_food_profile", Object.assign(p, n != null ? { name: n } : {}, ph != null ? { phone: ph } : {}, a != null ? { address: a } : {})); };
  document.addEventListener("input", e => { if (e.target.id === "fa-note") { cart.note = e.target.value; jset("jd_food_cart", cart); } else if (/^fa-[npa]$/.test(e.target.id)) saveProf(); });
  document.addEventListener("click", e => {
    if (!e.target.closest("#fa-sheet")) return;
    const l = e.target.closest("[data-l]"); if (l) { saveProf(); const it = cart.items[l.dataset.l]; if (it) setQty({ id: cart.r.id }, it.m, it.q + Number(l.dataset.d)); paintCart(); return; }
    const md = e.target.closest("[data-md]"); if (md) { saveProf(); const p = prof(); p.mode = md.dataset.md; jset("jd_food_profile", p); paintCart(); return; }
    if (e.target.closest("[data-clear]")) { cart = { r: null, items: {}, note: "" }; save(); closeCart(); return; }
    if (e.target.closest("[data-place]")) place(e.target.closest("[data-place]"));
  });
  async function place(btn) {
    saveProf(); const ls = lines(), r = cart.r, p = prof(), md = mode(), sub = total(), f = md === "delivery" ? Number(r.delivery_fee || 0) : 0, err = $("#fa-err");
    const fail = m => { err.textContent = m; err.hidden = false; };
    if (String(p.name).trim().length < 2) return fail("Please enter your name.");
    if (String(p.phone).trim().length < 6) return fail("Please enter a phone number we can reach you on.");
    if (md === "delivery" && String(p.address).trim().length < 4) return fail("Please enter your delivery address.");
    err.hidden = true; btn.disabled = true; btn.textContent = "Sending…";
    const order = { id: "o" + Date.now(), restaurant: r, restaurant_id: r.id, items: ls.map(l => ({ id: l.m.id, name: l.m.name, price: l.m.price, quantity: l.q })), subtotal: sub, delivery_fee: f, total: sub + f, at: new Date().toISOString(), fulfilment: md, name: p.name, phone: p.phone, address: p.address, note: cart.note || "" };
    document.dispatchEvent(new CustomEvent("jdfood:order", { detail: order }));
    let saved_ = null;
    try {
      if (!JDFood.isDemo()) { await GamBasketAuth.ready(); const s = await GamBasketAuth.getSession(); if (!s?.user) { location.href = "login.html?redirect=" + encodeURIComponent(location.pathname + location.search); return; } saved_ = await JDFood.placeOrder(order); order.code = saved_.code; order.id = saved_.id; order.total = Number(saved_.total); order.status = saved_.status; }
    } catch (e) {
      if (!e.notReady) { btn.disabled = false; btn.textContent = "Place order · " + money(sub + f); return fail(e.message || "Could not place your order. Please try again."); }
      /* Backend not migrated yet: fall back to a WhatsApp / call hand-off so the order is never lost. */
      const text = `Hi ${r.name}, I'd like to order via JulaDirect:\n` + ls.map(l => `• ${l.q} × ${l.m.name} (${money(l.m.price * l.q)})`).join("\n") + `\nTotal: ${money(sub + f)}\nName: ${p.name}\nPhone: ${p.phone}${md === "delivery" ? "\nAddress: " + p.address : "\nPickup"}${cart.note ? "\nNote: " + cart.note : ""}`;
      const wa = (r.whatsapp || "").replace(/\D/g, ""), tel = (r.phone || "").replace(/[^\d+]/g, "");
      if (wa) window.open("https://wa.me/" + wa + "?text=" + encodeURIComponent(text), "_blank", "noopener"); else if (tel) window.open("tel:" + tel);
    }
    const hist = jget("jd_food_orders", []); hist.unshift(order); jset("jd_food_orders", hist.slice(0, 30));
    cart = { r: null, items: {}, note: "" }; save(); closeCart(); showDone(order);
  }
  function showDone(o) {
    const d = $("#fa-done"), live = !!o.code;
    d.innerHTML = `<div class="fa-done__i">${FI("check", 54)}</div><h2>${live ? "Order placed" : "Order sent"}</h2><p>${live ? `<b>${esc(o.restaurant.name)}</b> has your order <b>#${esc(o.code)}</b>. You can follow its progress in Orders.` : `Your order was sent to <b>${esc(o.restaurant.name)}</b>. Confirm the details with them${o.restaurant.whatsapp ? " on WhatsApp" : ""}.`} Estimated ${o.restaurant.prep_minutes || 25} min${o.fulfilment === "delivery" ? " plus delivery" : " until ready"}.</p><div class="fa-done__c"><span>${esc(o.restaurant.name)}</span><span>${money(o.total)}</span></div><button class="fa-btn fa-btn--dark" type="button" data-orders>Track my order</button><button class="fa-btn fa-btn--ghost" type="button" data-cont>Continue browsing</button>`;
    d.classList.add("is-on");
  }
  document.addEventListener("click", e => { const d = e.target.closest("#fa-done"); if (!d) return; if (e.target.closest("[data-orders]")) { d.classList.remove("is-on"); if (window.JDFoodApp) JDFoodApp.go("orders"); else location.href = "food.html#orders"; } else if (e.target.closest("[data-cont]")) d.classList.remove("is-on"); });

  window.JDFoodUI = { mount, openMeal, closeMeal, setQty, qtyOf, count, total, openCart, onChange: f => listeners.push(f), saved: () => saved, orders: () => jget("jd_food_orders", []), thumb, cartRestaurant: () => cart.r };
})();
