/* Restaurant page (food app). */
(async function () {
  "use strict";
  if (!(await JDFood.guardPage())) return;
  const { esc, money, hueOf, safeUrl } = JDFood, $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const app = $("#fa-app"), root = $("#fa-root"); JDFoodUI.mount(app);
  const slug = new URLSearchParams(location.search).get("slug") || "", r = await JDFood.restaurant(slug);
  if (!r) { root.innerHTML = '<p class="fa-empty" style="padding-top:34vh"><b>🍽️</b>We couldn\'t find that restaurant.<br><a href="food.html" style="color:var(--fa-o2);font-weight:800">Browse restaurants</a></p>'; return; }
  const items = await JDFood.menu(r.id), h = hueOf(r), cats = [...new Set(items.map(m => m.category || "Menu"))];
  document.title = r.name + " — JulaDirect";
  const CE = { grill: "🍗", gambian: "🍛", "fast food": "🍔", burgers: "🍔", healthy: "🥗", salads: "🥗" }, ce = r.emoji || CE[String((r.cuisines || [])[0] || "").toLowerCase()] || "🍽️";
  const bg = safeUrl(r.cover_url), tel = (r.phone || r.whatsapp || "").replace(/[^\d+]/g, "");
  app.style.setProperty("--h", h);
  const row = (m, i) => { const q = JDFoodUI.qtyOf(m.id); return `<article class="fa-row${m.is_available === false ? " is-off" : ""}" style="--h:${h};--i:${i}" data-id="${esc(m.id)}"><span class="th">${JDFoodUI.thumb(m)}</span><div class="n"><b>${esc(m.name)}</b><p>${esc(m.description || "")}</p><div class="pr"><strong>${money(m.price)}${m.spicy ? " " + "🌶️".repeat(m.spicy) : ""}</strong>${q ? `<span class="fa-step"><button type="button" data-d="-1" aria-label="Less">−</button><b>${q}</b><button class="plus" type="button" data-d="1" aria-label="More">+</button></span>` : `<button class="fa-add" type="button" data-d="1" aria-label="Add ${esc(m.name)}">+</button>`}</div></div></article>`; };
  root.innerHTML = `<div class="fa-rhero"><div class="fa-bar" style="justify-content:space-between"><a class="fa-rb" href="food.html" aria-label="Back">←</a><span style="display:flex;gap:10px">${tel ? `<a class="fa-rb" href="tel:${esc(tel)}" aria-label="Call">📞</a>` : ""}<button class="fa-rb" id="fa-share" type="button" aria-label="Share">↗</button></span></div>
    <div class="fa-cover"${bg ? ` style="background-image:url('${esc(bg)}')"` : ""}>${bg ? "" : `<span>${ce}</span>`}</div>
    <h1 class="fa-rname">${esc(r.name)}</h1><small style="color:var(--fa-mut);font-weight:600">${esc(r.tagline || (r.cuisines || []).join(" · "))}</small>
    <div class="fa-rmeta"><span class="fa-tag fa-tag--${r.is_open ? "on" : "off"}">${r.is_open ? "Open now" : "Closed"}</span>${r.rating ? `<span class="fa-tag">★ ${Number(r.rating).toFixed(1)}</span>` : ""}<span class="fa-tag">⏱ ${r.prep_minutes || 25} min</span>${r.offers_delivery ? `<span class="fa-tag">🛵 ${r.delivery_fee ? money(r.delivery_fee) : "Free"}</span>` : ""}${r.offers_pickup ? '<span class="fa-tag">🥡 Pickup</span>' : ""}${r.location ? `<span class="fa-tag">📍 ${esc(r.location)}</span>` : ""}</div>
    ${r.description ? `<p class="fa-rdesc">${esc(r.description)}</p>` : ""}${r.opening_hours ? `<p class="fa-rdesc" style="margin-top:6px">🕒 ${esc(r.opening_hours)}</p>` : ""}</div>
    ${cats.length ? `<nav class="fa-cats" id="fa-cats">${cats.map((c, i) => `<button class="fa-pill" type="button" data-i="${i}" aria-pressed="${i === 0}"><i></i>${esc(c)}</button>`).join("")}</nav>` : ""}
    <div class="fa-list" id="fa-list">${cats.map((c, ci) => `<h3 id="c${ci}">${esc(c)}</h3>${items.filter(m => (m.category || "Menu") === c).map(row).join("")}`).join("") || '<p class="fa-empty"><b>🍳</b>This menu is being prepared.</p>'}</div>`;
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
