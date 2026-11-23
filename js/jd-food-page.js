/* Restaurant page: the artistic menu. Order = tray -> WhatsApp / call, plus a `jdfood:order` event to wire real checkout. */
(async function () {
  "use strict";
  if (!(await JDFood.guardPage())) return;
  const { esc, money, hueOf, safeUrl } = JDFood, $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const slug = new URLSearchParams(location.search).get("slug") || "";
  const root = $("#fd-root"), r = await JDFood.restaurant(slug);
  if (!r) { root.innerHTML = '<p class="fd-none" style="padding-top:36vh">We couldn\'t find that restaurant.<br><a href="restaurants.html" style="color:#ffb067">Browse restaurants</a></p>'; return; }
  const items = await JDFood.menu(r.id), h = hueOf(r);
  document.title = r.name + " — JulaDirect"; $("#fd-tt").textContent = r.name;
  const cats = [...new Set(items.map(m => m.category || "Menu"))];
  const emojis = [...new Set(items.map(m => m.emoji).filter(Boolean))];
  const tray = {}; const KEY = "jd_tray_" + r.id;
  try { Object.assign(tray, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  const byId = id => items.find(m => String(m.id) === String(id));
  const letters = name => name.split(" ").map((w, wi) => `<span class="fd-w">${[...w].map((c, i) => `<span class="fd-l" style="--i:${wi * 4 + i}">${esc(c)}</span>`).join("")}</span>`).join(" ");
  const plate = (m, extra) => `<span class="fd-plate" style="--h:${h + (extra || 0)}"><i class="fd-ring"></i><span class="fd-disc">${safeUrl(m.image_url) ? `<img src="${esc(safeUrl(m.image_url))}" alt="${esc(m.name)}" loading="lazy">` : `<span class="fd-emoji">${esc(m.emoji || "🍽️")}</span>`}</span><span class="fd-steam"><b></b><b></b><b></b></span></span>`;
  const chilis = n => n ? "🌶️".repeat(n) : "";
  const floats = emojis.slice(0, 9).map((e, i) => `<span class="fd-float" data-s="${(0.05 + (i % 4) * .05).toFixed(2)}" style="left:${(i * 37 + 8) % 92}%;top:${(i * 23 + 10) % 70}%;--sz:${34 + (i % 4) * 14}px;--d:${6 + (i % 5)}s;--dl:${-i}s" aria-hidden="true">${esc(e)}</span>`).join("");
  const facts = [[r.rating ? "★ " + Number(r.rating).toFixed(1) : null, "Rating"], [(r.prep_minutes || 25) + " min", "Prep time"], [r.offers_delivery ? (r.delivery_fee ? money(r.delivery_fee) : "Free") : null, "Delivery"], [r.min_order ? money(r.min_order) : null, "Minimum"]].filter(f => f[0]).map(f => `<div class="fd-fact"><b>${esc(f[0])}</b><span>${f[1]}</span></div>`).join("");
  root.innerHTML = `<section class="fd-hero" style="--h:${h}">${safeUrl(r.cover_url) ? `<div class="fd-hero__cover" style="background-image:url('${esc(safeUrl(r.cover_url))}')"></div>` : ""}<div class="fd-hero__bg"></div>${floats}
    <div class="fd-eyebrow"><span class="fd-chip fd-chip--${r.is_open ? "open" : "closed"}">${r.is_open ? "Open now" : "Closed"}</span>${(r.cuisines || []).map(c => `<span class="fd-chip">${esc(c)}</span>`).join("")}${r.location ? `<span class="fd-chip">📍 ${esc(r.location)}</span>` : ""}</div>
    <h1 class="fd-title">${letters(r.name)}</h1>${r.tagline ? `<p class="fd-tag">${esc(r.tagline)}</p>` : ""}<div class="fd-facts">${facts}</div><span class="fd-cue" aria-hidden="true"></span></section>
    ${items.length ? `<div class="fd-mq" style="--h:${h}" aria-hidden="true"><div class="fd-mq__t">${[1, 2].map(() => items.map(m => `<span>${esc(m.name)}</span>`).join("")).join("")}</div></div>
    <nav class="fd-nav" style="--h:${h}" aria-label="Menu sections"><div class="fd-nav__in" id="fd-navin"><i class="fd-ind" id="fd-ind"></i>${cats.map((c, i) => `<a href="#cat-${i}" data-i="${i}">${esc(c)}</a>`).join("")}</div></nav>` : ""}
    <div class="fd-menu" style="--h:${h}">${r.description ? `<p class="fd-desc" style="max-width:640px;font-size:17px;margin:12px 0 10px">${esc(r.description)}</p>${r.opening_hours ? `<p class="fd-sec__n">🕒 ${esc(r.opening_hours)}</p>` : ""}` : ""}
    ${cats.map((c, ci) => `<section class="fd-sec" id="cat-${ci}"><h2 class="fd-sec__h">${esc(c)}</h2><p class="fd-sec__n">${items.filter(m => (m.category || "Menu") === c).length} dishes</p>${items.filter(m => (m.category || "Menu") === c).map((m, i) => `<article class="fd-item${m.is_available === false ? " is-off" : ""}" style="--h:${h + (i % 3) * 12}" data-id="${esc(m.id)}" id="m-${esc(m.id)}" tabindex="0">${plate(m, (i % 3) * 12)}<div class="fd-info"><h3 class="fd-name">${esc(m.name)}</h3>${m.description ? `<p class="fd-desc">${esc(m.description)}</p>` : ""}<div class="fd-meta"><span class="fd-price">${money(m.price)}</span>${chilis(m.spicy) ? `<span aria-label="Spicy">${chilis(m.spicy)}</span>` : ""}${(m.tags || []).slice(0, 2).map(t => `<span class="fd-tg">${esc(t)}</span>`).join("")}<button class="fd-add" type="button" data-add="${esc(m.id)}">Add +</button></div></div></article>`).join("")}</section>`).join("") || '<p class="fd-none">This menu is being prepared. Check back soon.</p>'}</div>`;

  /* ----- call / share / top bar ----- */
  const tel = (r.phone || r.whatsapp || "").replace(/[^\d+]/g, ""); if (tel) { const c = $("#fd-call"); c.hidden = false; c.href = "tel:" + tel; }
  $("#fd-share").addEventListener("click", () => { if (navigator.share) navigator.share({ title: r.name, url: location.href }).catch(() => {}); else navigator.clipboard && navigator.clipboard.writeText(location.href); });
  const top = $("#fd-top"), floatsEl = $$(".fd-float");
  let ticking = false;
  function onScroll() { if (ticking) return; ticking = true; requestAnimationFrame(() => { const y = scrollY; top.classList.toggle("is-solid", y > 260); if (!reduce) floatsEl.forEach(f => { f.style.translate = `0 ${(-y * f.dataset.s).toFixed(1)}px`; }); ticking = false; }); }
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ----- reveal: plates spin in, sections draw their outline ----- */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { threshold: .18, rootMargin: "0px 0px -6% 0px" });
  $$(".fd-item,.fd-sec").forEach(el => io.observe(el));

  /* ----- sticky nav: scrollspy + jelly indicator ----- */
  const navLinks = $$(".fd-nav a"), ind = $("#fd-ind");
  function moveInd(a) { if (!a || !ind) return; navLinks.forEach(x => x.classList.toggle("is-on", x === a)); ind.style.left = a.offsetLeft + "px"; ind.style.width = a.offsetWidth + "px"; const sc = $("#fd-navin"); sc.scrollTo({ left: a.offsetLeft - sc.clientWidth / 2 + a.offsetWidth / 2, behavior: "smooth" }); }
  if (navLinks.length) {
    moveInd(navLinks[0]);
    const spy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) moveInd(navLinks[Number(e.target.id.replace("cat-", ""))]); }), { rootMargin: "-40% 0px -55% 0px" });
    $$(".fd-sec").forEach(s => spy.observe(s));
    $(".fd-nav").addEventListener("click", e => { const a = e.target.closest("a"); if (!a) return; e.preventDefault(); const s = $(a.getAttribute("href")); scrollTo({ top: s.getBoundingClientRect().top + scrollY - 70, behavior: "smooth" }); });
    addEventListener("resize", () => moveInd($(".fd-nav a.is-on") || navLinks[0]));
  }
  /* ----- plate tilt (desktop pointers) ----- */
  if (!reduce && matchMedia("(hover:hover)").matches) root.addEventListener("pointermove", e => { const p = e.target.closest(".fd-item .fd-plate"); if (!p) return; const b = p.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - .5, y = (e.clientY - b.top) / b.height - .5; p.style.transform = `perspective(600px) rotateY(${x * 22}deg) rotateX(${-y * 22}deg) scale(1.05)`; });
  root.addEventListener("pointerout", e => { const p = e.target.closest(".fd-item .fd-plate"); if (p && !p.contains(e.relatedTarget)) p.style.transform = ""; });

  /* ----- tray ----- */
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(tray)); } catch (e) {} };
  const lines = () => Object.keys(tray).map(id => ({ m: byId(id), q: tray[id] })).filter(l => l.m && l.q > 0);
  const total = () => lines().reduce((s, l) => s + l.m.price * l.q, 0), count = () => lines().reduce((s, l) => s + l.q, 0);
  function paintTray(bump) {
    const n = count(), t = $("#fd-tray"); t.classList.toggle("is-on", n > 0);
    $("#fd-tray-n").innerHTML = `<b>${n}</b> ${n === 1 ? "item" : "items"}`; $("#fd-tray-t").textContent = "View order · " + money(total());
    if (bump && !reduce) t.animate([{ scale: 1 }, { scale: 1.12 }, { scale: .96 }, { scale: 1 }], { duration: 520, easing: "ease-out" });
  }
  function fly(fromEl, emoji) {
    if (reduce || !fromEl) return; const a = fromEl.getBoundingClientRect(), b = $("#fd-tray").getBoundingClientRect(), f = document.createElement("span");
    f.className = "fd-fly"; f.textContent = emoji || "🍽️"; f.style.left = a.left + a.width / 2 - 22 + "px"; f.style.top = a.top + a.height / 2 - 22 + "px"; document.body.appendChild(f);
    const dx = b.left + 40 - a.left - a.width / 2, dy = b.top + b.height / 2 - a.top - a.height / 2;
    f.animate([{ transform: "translate(0,0) scale(1.4) rotate(0)" }, { transform: `translate(${dx * .5}px,${dy * .5 - 120}px) scale(1) rotate(180deg)`, offset: .5 }, { transform: `translate(${dx}px,${dy}px) scale(.3) rotate(360deg)` }], { duration: 760, easing: "cubic-bezier(.5,0,.3,1)" }).onfinish = () => f.remove();
  }
  function add(id, q, from) { const m = byId(id); if (!m || m.is_available === false) return; tray[id] = (tray[id] || 0) + (q || 1); save(); paintTray(true); fly(from, m.emoji); }
  root.addEventListener("click", e => { const a = e.target.closest("[data-add]"); if (a) { e.stopPropagation(); add(a.dataset.add, 1, a.closest(".fd-item").querySelector(".fd-plate")); return; } const it = e.target.closest(".fd-item"); if (it) openView(it); });
  root.addEventListener("keydown", e => { if (e.key === "Enter") { const it = e.target.closest(".fd-item"); if (it) openView(it); } });

  /* ----- plate viewer (FLIP from the tapped plate) ----- */
  const view = $("#fd-view"); let viewId = null, vq = 1;
  function openView(it) {
    const m = byId(it.dataset.id); if (!m) return; viewId = m.id; vq = 1;
    const orbit = [...(m.tags || []), chilis(m.spicy), r.prep_minutes ? r.prep_minutes + " min" : ""].filter(Boolean).slice(0, 5);
    view.innerHTML = `<button class="fd-ib fd-x" type="button" data-x aria-label="Close">✕</button><div class="fd-view__c" style="--h:${h}"><div class="fd-plate fd-big" id="fd-bigp" style="--h:${h}"><i class="fd-ring"></i><span class="fd-orbit" aria-hidden="true">${orbit.map((o, i) => `<span style="--a:${i * (360 / orbit.length)}deg"><em>${esc(o)}</em></span>`).join("")}</span><span class="fd-disc">${safeUrl(m.image_url) ? `<img src="${esc(safeUrl(m.image_url))}" alt="${esc(m.name)}">` : `<span class="fd-emoji">${esc(m.emoji || "🍽️")}</span>`}</span><span class="fd-steam"><b></b><b></b><b></b></span></div>
      <h2 class="fd-name">${esc(m.name)}</h2><p class="fd-desc">${esc(m.description || "")}</p><span class="fd-price" style="margin-top:10px">${money(m.price)}</span>
      <div class="fd-qty"><button type="button" data-q="-1" aria-label="Less">−</button><b id="fd-vq">1</b><button type="button" data-q="1" aria-label="More">+</button></div>
      <button class="fd-cta" type="button" data-addv>${m.is_available === false ? "Sold out" : "Add to order · " + money(m.price)}</button></div>`;
    view.hidden = false; document.body.style.overflow = "hidden";
    const big = $("#fd-bigp"), src = it.querySelector(".fd-plate");
    if (!reduce) { const a = src.getBoundingClientRect(), b = big.getBoundingClientRect(), dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2), s = a.width / b.width;
      big.animate([{ transform: `translate(${dx}px,${dy}px) scale(${s}) rotate(-120deg)` }, { transform: "translate(0,0) scale(1.08) rotate(14deg)", offset: .7 }, { transform: "none" }], { duration: 850, easing: "cubic-bezier(.3,1.2,.4,1)" });
      view.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); $$(".fd-view__c > :not(.fd-big)", view).forEach((el, i) => el.animate([{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: 260 + i * 70, easing: "cubic-bezier(.34,1.5,.5,1)", fill: "backwards" })); }
  }
  function closeView() { if (view.hidden) return; const done = () => { view.hidden = true; view.innerHTML = ""; document.body.style.overflow = ""; }; if (reduce) return done(); view.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 }).onfinish = done; }
  view.addEventListener("click", e => {
    if (e.target === view || e.target.closest("[data-x]")) return closeView();
    const q = e.target.closest("[data-q]"); if (q) { vq = Math.max(1, Math.min(20, vq + Number(q.dataset.q))); $("#fd-vq").textContent = vq; const m = byId(viewId); $("[data-addv]", view).textContent = "Add to order · " + money(m.price * vq); return; }
    if (e.target.closest("[data-addv]")) { const m = byId(viewId); if (m.is_available === false) return; const from = $("#fd-bigp"); add(viewId, vq, from); closeView(); }
  });
  addEventListener("keydown", e => { if (e.key === "Escape") { closeView(); closeSheet(); } });
  if (location.hash.startsWith("#") && byId(location.hash.slice(1))) setTimeout(() => { const el = $("#m-" + CSS.escape(location.hash.slice(1))); if (el) { el.scrollIntoView({ block: "center" }); setTimeout(() => openView(el), 500); } }, 900);

  /* ----- order sheet ----- */
  const sheet = $("#fd-sheet"), scrim = $("#fd-scrim");
  function openSheet() { paintSheet(); sheet.classList.add("is-on"); scrim.classList.add("is-on"); }
  function closeSheet() { sheet.classList.remove("is-on"); scrim.classList.remove("is-on"); }
  function paintSheet() {
    const ls = lines(); if (!ls.length) { closeSheet(); return; }
    const fee = r.offers_delivery ? Number(r.delivery_fee || 0) : 0;
    sheet.innerHTML = `<span class="fd-grab"></span><h2>Your order</h2>${ls.map(l => `<div class="fd-line"><span class="e">${esc(l.m.emoji || "🍽️")}</span><div><b>${esc(l.m.name)}</b><br><small>${money(l.m.price)}</small></div><div class="fd-qty"><button type="button" data-l="${esc(l.m.id)}" data-d="-1" aria-label="Less">−</button><b>${l.q}</b><button type="button" data-l="${esc(l.m.id)}" data-d="1" aria-label="More">+</button></div></div>`).join("")}
      <div class="fd-tot"><span>Total${fee ? " + delivery " + money(fee) : ""}</span><span>${money(total() + fee)}</span></div>
      ${r.min_order && total() < r.min_order ? `<p style="color:#ffb067;margin:0 0 10px">Minimum order is ${money(r.min_order)}.</p>` : ""}
      <button class="fd-cta" type="button" data-send ${r.min_order && total() < r.min_order ? "disabled style='opacity:.5'" : ""}>${r.whatsapp ? "Send order on WhatsApp" : tel ? "Call to order" : "Place order"}</button><button class="fd-cta fd-ghost" type="button" data-clear>Clear order</button>`;
  }
  $("#fd-tray").addEventListener("click", openSheet); scrim.addEventListener("click", closeSheet);
  sheet.addEventListener("click", e => {
    const l = e.target.closest("[data-l]"); if (l) { tray[l.dataset.l] = Math.max(0, (tray[l.dataset.l] || 0) + Number(l.dataset.d)); if (!tray[l.dataset.l]) delete tray[l.dataset.l]; save(); paintTray(); paintSheet(); return; }
    if (e.target.closest("[data-clear]")) { Object.keys(tray).forEach(k => delete tray[k]); save(); paintTray(); closeSheet(); return; }
    if (e.target.closest("[data-send]")) {
      const ls = lines(), order = { restaurant: r, items: ls.map(x => ({ id: x.m.id, name: x.m.name, price: x.m.price, quantity: x.q })), subtotal: total(), delivery_fee: r.offers_delivery ? Number(r.delivery_fee || 0) : 0 };
      document.dispatchEvent(new CustomEvent("jdfood:order", { detail: order }));   /* wire real checkout here */
      const text = `Hi ${r.name}, I'd like to order via JulaDirect:\n` + ls.map(x => `• ${x.q} × ${x.m.name} (${money(x.m.price * x.q)})`).join("\n") + `\nTotal: ${money(total())}`;
      if (r.whatsapp) window.open("https://wa.me/" + r.whatsapp.replace(/\D/g, "") + "?text=" + encodeURIComponent(text), "_blank", "noopener"); else if (tel) location.href = "tel:" + tel;
    }
  });
  paintTray();
})();
