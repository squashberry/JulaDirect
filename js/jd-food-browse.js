(async function () {
  "use strict";
  if (!(await JDFood.guardPage())) return;
  const { esc, hueOf, safeUrl } = JDFood, grid = document.getElementById("fd-grid"), pills = document.getElementById("fd-pills"), q = document.getElementById("fd-q");
  const emoji = r => r.emoji || ({ grill: "🍗", gambian: "🍛", "fast food": "🍔", burgers: "🍔", healthy: "🥗", salads: "🥗", pizza: "🍕", seafood: "🐟" })[String((r.cuisines || [])[0] || "").toLowerCase()] || "🍽️";
  const list = await JDFood.restaurants(); let cuisine = "All";
  const all = ["All"].concat([...new Set(list.flatMap(r => r.cuisines || []))]);
  pills.innerHTML = all.map(c => `<button class="fd-pill" type="button" data-c="${esc(c)}" aria-pressed="${c === "All"}">${esc(c)}</button>`).join("");
  function paint() {
    const t = q.value.trim().toLowerCase();
    const rows = list.filter(r => (cuisine === "All" || (r.cuisines || []).includes(cuisine)) && (!t || (r.name + " " + (r.cuisines || []).join(" ") + " " + (r.tagline || "")).toLowerCase().includes(t)));
    grid.innerHTML = rows.length ? rows.map((r, i) => { const bg = safeUrl(r.cover_url); return `<a class="fd-rcard" style="--h:${hueOf(r)};--i:${i}" href="restaurant.html?slug=${encodeURIComponent(r.slug)}">${bg ? `<span class="fd-rcard__bg" style="background-image:url('${esc(bg)}')"></span>` : `<span class="fd-rcard__e">${emoji(r)}</span>`}<span class="fd-rcard__body"><h3>${esc(r.name)}</h3><p>${esc(r.tagline || (r.cuisines || []).join(" · "))}</p><span class="fd-rcard__row"><span class="fd-chip fd-chip--${r.is_open ? "open" : "closed"}">${r.is_open ? "Open" : "Closed"}</span>${r.rating ? `<span class="fd-chip">★ ${Number(r.rating).toFixed(1)}</span>` : ""}<span class="fd-chip">${r.prep_minutes || 25} min</span>${r.location ? `<span class="fd-chip">📍 ${esc(r.location.split(",")[0])}</span>` : ""}</span></span></a>`; }).join("") : '<p class="fd-none">No restaurants match yet.</p>';
  }
  pills.addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (!b) return; cuisine = b.dataset.c; pills.querySelectorAll(".fd-pill").forEach(x => x.setAttribute("aria-pressed", String(x === b))); paint(); });
  q.addEventListener("input", paint); paint();
})();
