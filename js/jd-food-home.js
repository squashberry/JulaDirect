/* Home feed: restaurants + hot meals. Renders nothing unless the admin has switched the restaurant service on. */
(function () {
  "use strict";
  if (!window.JDFood) return;
  const { esc, money, hueOf, safeUrl } = JDFood;
  const emojiOf = r => r.emoji || ({ grill: "🍗", gambian: "🍛", "fast food": "🍔", burgers: "🍔", healthy: "🥗", salads: "🥗", pizza: "🍕", seafood: "🐟" })[String((r.cuisines || [])[0] || "").toLowerCase()] || "🍽️";
  function rcard(r, i) {
    const bg = safeUrl(r.cover_url);
    return `<a class="fd-rcard" style="--h:${hueOf(r)};--i:${i}" href="restaurant.html?slug=${encodeURIComponent(r.slug)}">${bg ? `<span class="fd-rcard__bg" style="background-image:url('${esc(bg)}')"></span>` : `<span class="fd-rcard__e" aria-hidden="true">${emojiOf(r)}</span>`}<span class="fd-rcard__body"><h3>${esc(r.name)}</h3><p>${esc((r.cuisines || []).join(" · ") || r.tagline || "")}</p><span class="fd-rcard__row"><span class="fd-chip fd-chip--${r.is_open ? "open" : "closed"}">${r.is_open ? "Open" : "Closed"}</span>${r.rating ? `<span class="fd-chip">★ ${Number(r.rating).toFixed(1)}</span>` : ""}<span class="fd-chip">${r.prep_minutes || 25} min</span></span></span></a>`;
  }
  async function run() {
    if (document.getElementById("hm-food-sec")) return;
    if (!(await JDFood.enabled())) return;
    const anchor = document.querySelector(".hm-short"); if (!anchor) return;
    const [list, hot] = await Promise.all([JDFood.restaurants(), JDFood.featured(10)]);
    if (!list.length) return;
    if (!document.getElementById("fd-css")) { const l = document.createElement("link"); l.id = "fd-css"; l.rel = "stylesheet"; l.href = "css/jd-food.css"; document.head.appendChild(l); await new Promise(r => { l.onload = l.onerror = r; setTimeout(r, 1500); }); }
    const sec = document.createElement("section"); sec.className = "hm-sec"; sec.id = "hm-food-sec"; sec.setAttribute("aria-labelledby", "hm-food-h");
    sec.innerHTML = `<div class="hm-head"><div><h2 id="hm-food-h">Hungry? Order from local restaurants</h2><p>Fresh meals from kitchens near you.</p></div><a class="jd-link" href="food.html">All restaurants <span class="hm-arrow"></span></a></div><div class="fd-home__rail">${list.slice(0, 8).map(rcard).join("")}</div>` +
      (hot.length ? `<div class="hm-head" style="margin-top:6px"><div><h2 class="hm-mini">Hot right now</h2></div></div><div class="fd-hot">${hot.map((m, i) => `<a class="fd-hotcard" style="--i:${i}" href="restaurant.html?slug=${encodeURIComponent((m.restaurant || {}).slug || "")}#${esc(m.id)}"><span class="fd-plate" style="--h:${hueOf(m.restaurant)}"><span class="fd-disc">${safeUrl(m.image_url) ? `<img src="${esc(safeUrl(m.image_url))}" alt="" loading="lazy">` : `<span class="fd-emoji">${esc(m.emoji || "🍽️")}</span>`}</span></span><b>${esc(m.name)}</b><small>${esc((m.restaurant || {}).name || "")}</small><em>${money(m.price)}</em></a>`).join("")}</div>` : "");
    anchor.after(sec);
  }
  run().catch(() => {});
})();
