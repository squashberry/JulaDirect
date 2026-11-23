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
    $("#fa-bar").addEventListener("click", openCart); $("#fa-scrim").addEventListener("click", closeCart);
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
    el.classList.add("is-on"); document.body.style.overflow = "hidden";
    const hero = $(".fa-hero-e,.fa-hero-img", el);
    if (hero && !reduce) hero.animate([{ transform: "scale(.3) rotate(-90deg)", opacity: 0 }, { transform: "scale(1.12) rotate(8deg)", opacity: 1, offset: .65 }, { transform: "none" }], { duration: 900, easing: "cubic-bezier(.3,1.3,.4,1)" });
  }
  function closeMeal() { const el = $("#fa-meal"); if (!el || !el.classList.contains("is-on")) return; el.classList.remove("is-on"); document.body.style.overflow = ""; }
  document.addEventListener("click", e => {
    const el = e.target.closest("#fa-meal"); if (!el) return;
    if (e.target.closest("[data-close]")) return closeMeal();
    const s = e.target.closest("[data-save]"); if (s) { const m = cur.m; if (saved[m.id]) delete saved[m.id]; else saved[m.id] = { m: snap(m), r: { id: cur.r.id, slug: cur.r.slug, name: cur.r.name, hue: hueOf(cur.r) } }; jset("jd_food_saved", saved); s.innerHTML = FI(saved[m.id] ? "heartfill" : "heart", 22); s.setAttribute("aria-pressed", String(!!saved[m.id])); listeners.forEach(f => f()); if (!reduce) s.animate([{ transform: "scale(1)" }, { transform: "scale(1.5)" }, { transform: "scale(1)" }], { duration: 400, easing: "cubic-bezier(.34,1.7,.5,1)" }); return; }
    const d = e.target.closest("[data-d]"); if (d) { cur.q = Math.max(1, Math.min(30, cur.q + Number(d.dataset.d))); $("#fa-mq").textContent = cur.q; $("#fa-mt").textContent = money(cur.m.price * cur.q); return; }
    if (e.target.closest("[data-addm]")) { if (setQty(cur.r, cur.m, cur.q)) { closeMeal(); } }
  });

  /* ----- cart sheet ----- */
  function paintCart() {
    const sh = $("#fa-sheet"), ls = lines(); if (!ls.length) { closeCart(); return; }
    const sub = total(), f = fee(), min = Number(cart.r.min_order || 0), low = min && sub < min;
    sh.innerHTML = `<span class="fa-grab"></span><h2>Your order · ${esc(cart.r.name)}</h2>${ls.map(l => `<div class="fa-line"><span class="th">${thumb(l.m)}</span><div class="n"><b>${esc(l.m.name)}</b><small>${money(l.m.price)}</small></div><div class="fa-step"><button type="button" data-l="${esc(l.m.id)}" data-d="-1" aria-label="Less">−</button><b>${l.q}</b><button class="plus" type="button" data-l="${esc(l.m.id)}" data-d="1" aria-label="More">+</button></div></div>`).join("")}
    <label class="fa-note"><span>Note for the kitchen</span><textarea id="fa-note" rows="2" maxlength="300" placeholder="No onions, extra sauce, delivery directions…">${esc(cart.note || "")}</textarea></label><div class="fa-sum"><span>Subtotal</span><span>${money(sub)}</span></div>${cart.r.offers_delivery ? `<div class="fa-sum"><span>Delivery</span><span>${f ? money(f) : "Free"}</span></div>` : ""}<div class="fa-sum t"><span>Total</span><span>${money(sub + f)}</span></div>
    ${low ? `<p style="color:#b4233a;font-weight:700;margin:0 0 10px">Minimum order is ${money(min)}.</p>` : ""}
    <button class="fa-btn fa-btn--dark" type="button" data-place ${low ? "disabled" : ""}>${cart.r.whatsapp ? "Send order on WhatsApp" : cart.r.phone ? "Place order & call" : "Place order"}</button><button class="fa-btn fa-btn--ghost" type="button" data-clear>Clear order</button>`;
  }
  function openCart() { paintCart(); $("#fa-sheet").classList.add("is-on"); $("#fa-scrim").classList.add("is-on"); }
  function closeCart() { const s = $("#fa-sheet"); if (s) { s.classList.remove("is-on"); $("#fa-scrim").classList.remove("is-on"); } }
  document.addEventListener("input", e => { if (e.target.id === "fa-note") { cart.note = e.target.value; jset("jd_food_cart", cart); } });
  document.addEventListener("click", e => {
    if (!e.target.closest("#fa-sheet")) return;
    const l = e.target.closest("[data-l]"); if (l) { const it = cart.items[l.dataset.l]; if (it) setQty({ id: cart.r.id }, it.m, it.q + Number(l.dataset.d)); paintCart(); return; }
    if (e.target.closest("[data-clear]")) { cart = { r: null, items: {}, note: "" }; save(); closeCart(); return; }
    if (e.target.closest("[data-place]")) place();
  });
  function place() {
    const ls = lines(), r = cart.r, sub = total(), f = fee();
    const order = { note: cart.note || "", id: "o" + Date.now(), restaurant: r, items: ls.map(l => ({ id: l.m.id, name: l.m.name, emoji: l.m.emoji, price: l.m.price, quantity: l.q })), subtotal: sub, delivery_fee: f, total: sub + f, at: new Date().toISOString() };
    document.dispatchEvent(new CustomEvent("jdfood:order", { detail: order }));   /* wire real checkout / payment here */
    const hist = jget("jd_food_orders", []); hist.unshift(order); jset("jd_food_orders", hist.slice(0, 30));
    const text = `Hi ${r.name}, I'd like to order via JulaDirect:\n` + ls.map(l => `• ${l.q} × ${l.m.name} (${money(l.m.price * l.q)})`).join("\n") + `\nTotal: ${money(sub + f)}` + (cart.note ? `\nNote: ${cart.note}` : "");
    const wa = (r.whatsapp || "").replace(/\D/g, ""), tel = (r.phone || "").replace(/[^\d+]/g, "");
    if (wa) window.open("https://wa.me/" + wa + "?text=" + encodeURIComponent(text), "_blank", "noopener"); else if (tel) window.open("tel:" + tel);
    cart = { r: null, items: {} }; save(); closeCart(); showDone(order);
  }
  function showDone(o) {
    const d = $("#fa-done"); d.innerHTML = `<div class="fa-done__i">${FI("bag", 54)}</div><h2>Order sent</h2><p>Your order was sent to <b>${esc(o.restaurant.name)}</b>. Confirm the details with them${o.restaurant.whatsapp ? " on WhatsApp" : ""} — they'll prepare it in about ${o.restaurant.prep_minutes || 25} minutes.</p><div class="fa-done__c"><span>${esc(o.restaurant.name)}</span><span>${money(o.total)}</span></div><button class="fa-btn fa-btn--dark" type="button" data-orders>Check my orders</button><button class="fa-btn fa-btn--ghost" type="button" data-cont>Continue browsing</button>`;
    d.classList.add("is-on");
  }
  document.addEventListener("click", e => { const d = e.target.closest("#fa-done"); if (!d) return; if (e.target.closest("[data-orders]")) { d.classList.remove("is-on"); if (window.JDFoodApp) JDFoodApp.go("orders"); else location.href = "food.html#orders"; } else if (e.target.closest("[data-cont]")) d.classList.remove("is-on"); });

  window.JDFoodUI = { mount, openMeal, closeMeal, setQty, qtyOf, count, total, openCart, onChange: f => listeners.push(f), saved: () => saved, orders: () => jget("jd_food_orders", []), thumb, cartRestaurant: () => cart.r };
})();
