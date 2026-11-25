/* JulaDirect gift cards: landing, design studio, purchase, My Gift Cards. All money logic lives in the database. */
(function () {
  "use strict";
  const A = window.GiftArt, root = document.getElementById("gf-main");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = A.money, $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const client = async () => { await GamBasketAuth.ready(); return GamBasketAuth.getClient(); };
  let toastT; const toast = m => { const t = $("#gf-toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 3200); };
  const ERR = { AUTH_REQUIRED: "Please sign in first.", DISABLED: "Gift cards are paused right now.", PROGRAM_UNAVAILABLE: "That gift card type isn't available right now.", FORMAT_UNAVAILABLE: "That format isn't available yet.", BAD_AMOUNT: "That amount is outside the allowed range.", BAD_TEMPLATE: "Please pick a design.", TEXT_TOO_LONG: "Your name or message is too long.", BAD_IMAGE: "We couldn't use that photo. Try another.", BAD_RECIPIENT: "Check the recipient's email or phone number.", BAD_SCHEDULE: "Pick a delivery time in the future (within one year).", BAD_DELIVERY: "Please complete the delivery or collection details.", DELIVERY_UNAVAILABLE: "Delivery isn't available yet. Choose collection.", COLLECTION_UNAVAILABLE: "Collection isn't available yet.", BAD_IDEMPOTENCY: "Something went wrong. Please try again." };
  const STATUS = { pending_activation: ["Awaiting delivery", "warn"], active: ["Active", "ok"], partially_redeemed: ["Partly used", "ok"], fully_redeemed: ["Fully used", "mut"], suspended: ["Suspended", "bad"], cancelled: ["Cancelled", "bad"], expired: ["Expired", "mut"] };
  const COLS = "id,code,share_token,program,format,initial_amount,balance,status,purchaser_id,recipient_user_id,order_id,template_slug,design,deliver_at,created_at";
  const I = { gift: '<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.500S9 8 12 8Zm0 0c2-4 6-4 6-1.500S15 8 12 8Z"/></svg>' };
  const BG = '<svg class="bg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 7h-2.2A3 3 0 0 0 12 4.500 3 3 0 0 0 6.200 7H4a1 1 0 0 0-1 1v4h18V8a1 1 0 0 0-1-1ZM9 7a1 1 0 1 1 1-1v1H9Zm6 0h-1V6a1 1 0 1 1 1 1ZM4 14v6a1 1 0 0 0 1 1h6v-7H4Zm9 0v7h6a1 1 0 0 0 1-1v-6h-7Z"/></svg>';

  /* ---------------- draft state ---------------- */
  const blank = () => ({ step: 1, program: "", format: "", slug: "", hue: 0, amount: 0, cat: "All", recipient: "", sender: "", message: "", email: "", phone: "", when: "now", deliverAt: "", method: "collection", envelope: false, dname: "", dphone: "", daddress: "", dnotes: "", pay: "wave", idem: null, img: null, blob: null });
  let st = blank(), S = null, T = [], side = "front", user = null;
  const saveDraft = () => { try { const { img, blob, ...d } = st; sessionStorage.setItem("gf_draft", JSON.stringify(d)); } catch (e) {} };
  const loadDraft = () => { try { const d = JSON.parse(sessionStorage.getItem("gf_draft") || "null"); if (d) st = Object.assign(blank(), d); } catch (e) {} };
  const touch = () => { st.idem = null; saveDraft(); };
  const shareUrl = tok => location.origin + "/gift.html?t=" + tok;

  async function boot() {
    try {
      const c = await client(); user = (await GamBasketAuth.getSession())?.user || null;
      const [s, t] = await Promise.all([c.from("gift_settings").select("*").eq("id", 1).maybeSingle(), c.from("gift_templates").select("slug,category,name,premium,sort").eq("active", true).order("sort")]);
      S = s.data; T = t.data || [];
    } catch (e) {}
    loadDraft(); window.addEventListener("hashchange", route);
    const q = new URLSearchParams(location.search); if (q.get("gift_return") && q.get("order")) { history.replaceState(null, "", "gift-cards.html#/order/" + q.get("order")); }
    route();
  }
  const unavailable = () => root.innerHTML = `<div class="gf-empty gf-wrap">${I.gift}<h2>Gift cards aren't available yet</h2><p>This feature is being set up. Please check back soon.</p><a class="gf-btn" href="index.html">Back to JulaDirect</a></div>`;

  function route() {
    const h = location.hash.replace(/^#\/?/, "").split("/"), v = h[0] || "home";
    $$("[data-nav]").forEach(a => a.setAttribute("aria-current", (a.dataset.nav === v || (v === "card" && a.dataset.nav === "mine")) ? "page" : "false"));
    window.scrollTo(0, 0);
    if (!S || !S.enabled) return unavailable();
    ({ home, new: studio, mine, card: () => cardDetail(h[1]), order: () => orderStatus(h[1]) }[v] || home)();
  }

  /* ---------------- landing ---------------- */
  function sampleCanvas(slug, w, extra) { const c = document.createElement("canvas"); A.render(c, Object.assign({ slug, recipient: "Awa", sender: "Modou", message: "Treat yourself, you deserve it.", amount: 1000, program: "restaurant", qrUrl: location.origin + "/gift.html?t=sample", width: w }, extra)); return c; }
  function home() {
    root.innerHTML = `<section class="gf-hero"><div class="gf-wrap"><div><span class="gf-eyebrow">JulaDirect Gifts</span><h1>Give a gift they'll <em>actually use.</em></h1><p>Send a Marketplace or Restaurant gift card in minutes. Pick a beautiful design, add your message, and share it by link, image or print.</p><div class="gf-hero__cta"><a class="gf-btn gf-btn--gold" href="#/new">Create a gift card</a><a class="gf-btn gf-btn--ghost" href="#/mine">My gift cards</a></div></div><div class="gf-fan" id="fan" aria-hidden="true"></div></div></section>
    <section class="gf-sec"><div class="gf-wrap"><h2>Two ways to give</h2><p class="lead">Both come as a shareable digital card or a printed card.</p><div class="gf-prog">
    <button class="gf-pc gf-pc--m" data-go="marketplace">${BG}<h3>Marketplace Gift Card</h3><p>A general JulaDirect gift card for the recipient to keep and manage in their account.</p></button>
    <button class="gf-pc gf-pc--r" data-go="restaurant">${BG}<h3>Restaurant Gift Card</h3><p>One card, any participating restaurant on JulaDirect. Spend it in parts, across several restaurants.</p></button></div></div></section>
    <section class="gf-sec" style="padding-top:0"><div class="gf-wrap"><h2>How it works</h2><p class="lead">From idea to delivered in a few taps.</p><div class="gf-steps"><div><b>Choose</b><span>Marketplace or Restaurant, digital or physical.</span></div><div><b>Design</b><span>Browse ${Object.keys(A.def).length}+ designs and personalise the card.</span></div><div><b>Pay securely</b><span>Your card is issued only after payment is confirmed.</span></div><div><b>Share</b><span>Download the image, send the link or collect the printed card.</span></div></div></div></section>
    <section class="gf-sec" style="padding-top:0"><div class="gf-wrap"><h2>A design for every moment</h2><p class="lead">Birthdays, Eid, weddings, thank-yous, corporate gifts and more.</p></div><div class="gf-marq" id="marq"></div></section>`;
    const fan = $("#fan"); ["birthday-gold", "eid-lantern", "love-bloom"].forEach(s => fan.appendChild(sampleCanvas(s, 700, { program: "restaurant" })));
    const mq = $("#marq"), pick = ["birthday-confetti", "xmas-tree", "eid-crescent", "grad-cap", "wedding-ivory", "baby-clouds", "congrats-burst", "lux-obsidian", "justbecause-pop", "festive-kente"]; pick.forEach(s => mq.appendChild(sampleCanvas(s, 520)));
    $$("[data-go]").forEach(b => b.onclick = () => { st.program = b.dataset.go; saveDraft(); location.hash = "#/new"; });
  }

  /* ---------------- studio ---------------- */
  const STEPS = ["Type", "Design", "Amount", "Personalise", "Delivery", "Review"];
  const cats = () => ["All", ...Array.from(new Set(T.map(t => t.category)))];
  const fees = () => { if (st.format !== "physical" || !S) return 0; const t = T.find(x => x.slug === st.slug); return Number(S.physical_fee) + (t && t.premium ? Number(S.premium_extra_fee) : 0) + (st.envelope ? Number(S.envelope_fee) : 0) + (st.method === "delivery" ? Number(S.delivery_fee) : 0); };
  const total = () => (Number(st.amount) || 0) + fees();
  function studio() {
    if (!st.slug) st.slug = (T[0] || {}).slug || "min-paper";
    root.innerHTML = `<div class="gf-wrap"><div class="gf-studio"><div id="gf-form"></div><aside class="gf-prev" aria-label="Live preview"><div class="gf-prev__box"><canvas id="pv" aria-label="Gift card preview"></canvas><div class="gf-prev__tabs" id="pvt"><button aria-pressed="true" data-s="front">Front</button><button aria-pressed="false" data-s="back">Back</button></div></div><div class="gf-prev__sum" id="sum"></div></aside></div></div>`;
    $$("#pvt button").forEach(b => b.onclick = () => { side = b.dataset.s; $$("#pvt button").forEach(x => x.setAttribute("aria-pressed", x === b)); paintPreview(); });
    paintForm(); paintPreview();
  }
  let pvRaf = 0;
  function paintPreview() {
    cancelAnimationFrame(pvRaf); pvRaf = requestAnimationFrame(() => {
      const c = $("#pv"); if (!c) return;
      A.render(c, { slug: st.slug, hue: A.hueOf(st.hue ? "h" + st.hue : ""), recipient: st.recipient.trim(), sender: st.sender.trim(), message: st.message.trim(), amount: st.amount || 1000, program: st.program || "restaurant", qrUrl: location.origin + "/gift.html?t=your-card-link", side, image: st.img, width: 900 });
      const s = $("#sum"); if (!s) return; const f = fees();
      s.innerHTML = `<div><span>${st.program === "marketplace" ? "Marketplace" : st.program === "restaurant" ? "Restaurant" : "Gift"} card · ${st.format || "format"}</span><span>${st.amount ? money(st.amount) : "–"}</span></div>${f ? `<div><span>Printing & packaging</span><span>${money(f)}</span></div>` : ""}<div><b>Total</b><b class="t">${st.amount ? money(total()) : "–"}</b></div>`;
    });
  }
  const bar = () => `<nav class="gf-prog-steps" aria-label="Steps">${STEPS.map((s, i) => `<button data-step="${i + 1}" ${st.step === i + 1 ? 'aria-current="step"' : ""} class="${st.step > i + 1 ? "done" : ""}">${i + 1}. ${s}</button>`).join("")}</nav>`;
  const nav = (back, next, label) => `<div class="gf-nav2">${back ? `<button class="gf-btn gf-btn--ghost" data-back>Back</button>` : ""}<button class="gf-btn" data-next>${label || "Continue"}</button></div>`;
  function valid(step) {
    if (step >= 1 && (!st.program || !st.format)) return step > 1 || "Choose a gift card type and format.";
    if (step === 1) return true;
    if (step === 2) return !!st.slug && (st.slug !== "photo-custom" || !!st.img) || (st.slug === "photo-custom" ? "Upload your photo for this design." : "Pick a design.");
    if (step === 3) { const a = Number(st.amount); return (a >= Number(S.min_amount) && a <= Number(S.max_amount) && Math.round(a * 100) === a * 100) || `Enter an amount between ${money(S.min_amount)} and ${money(S.max_amount)}.`; }
    if (step === 4) return st.message.length <= 280 || "Message is too long.";
    if (step === 5) {
      if (st.format === "virtual") { if (st.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(st.email)) return "That email doesn't look right."; if (st.phone && !/^\+?[0-9 ]{7,16}$/.test(st.phone)) return "That phone number doesn't look right."; if (st.when === "later" && (!st.deliverAt || new Date(st.deliverAt) < new Date())) return "Pick a future date and time."; return true; }
      if (st.dname.trim().length < 2) return "Enter the recipient's name for collection or delivery."; if (!/^\+?[0-9 ]{7,16}$/.test(st.dphone)) return "Enter a valid contact phone number."; if (st.method === "delivery" && st.daddress.trim().length < 6) return "Enter the delivery address."; return true;
    }
    return true;
  }
  function go(n) { st.step = Math.max(1, Math.min(6, n)); saveDraft(); paintForm(); paintPreview(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function wire(f) {
    $$("[data-step]", f).forEach(b => b.onclick = () => { const n = Number(b.dataset.step); if (n <= st.step) return go(n); for (let s = st.step; s < n; s++) { const v = valid(s); if (v !== true) return toast(v); } go(n); });
    const bk = $("[data-back]", f); if (bk) bk.onclick = () => go(st.step - 1);
    const nx = $("[data-next]", f); if (nx) nx.onclick = () => { const v = valid(st.step); if (v !== true) return toast(v); if (st.step === 6) return pay(nx); go(st.step + 1); };
  }
  function paintForm() {
    const f = $("#gf-form"); if (!f) return; const fn = [null, s1, s2, s3, s4, s5, s6][st.step]; f.innerHTML = bar() + fn(); wire(f); (fnWire[st.step] || (() => {}))(f);
  }
  const fnWire = {};
  function opt(attr, val, cur, title, sub, dis, tag) { return `<button class="gf-o" ${attr}="${val}" aria-pressed="${cur === val}" ${dis ? "disabled" : ""}>${tag ? `<span class="tag">${tag}</span>` : ""}<b>${title}</b><span>${sub}</span></button>`; }
  function s1() {
    const mOK = S.marketplace_enabled, rOK = S.restaurant_enabled, pOK = S.physical_enabled;
    return `<div class="gf-card"><h2>What would you like to give?</h2><p class="sub">Pick the gift card and how it's delivered.</p>
    <div class="gf-opt">${opt("data-prog", "marketplace", st.program, "Marketplace Gift Card", "Use on JulaDirect. Keep it in the recipient's account.", !mOK, mOK ? "" : "Unavailable")}${opt("data-prog", "restaurant", st.program, "Restaurant Gift Card", "One card for any participating restaurant. Spend it in parts.", !rOK, rOK ? "" : "Unavailable")}</div>
    <h2 style="margin-top:24px;font-size:18px">Format</h2><div class="gf-opt">${opt("data-fmt", "virtual", st.format, "Virtual", "Instant image + secure link. Download, share on WhatsApp, or schedule.", !S.virtual_enabled)}${opt("data-fmt", "physical", st.format, "Physical", pOK ? "A printed card with premium finishes." : "Printed cards aren't available yet.", !pOK, pOK ? "" : "Coming soon")}</div>
    ${st.program === "restaurant" ? `<div class="gf-note">Restaurant gift cards work at any participating restaurant. The recipient needs a 6-digit PIN to approve each use.</div>` : ""}
    ${nav(false, true)}</div>`;
  }
  fnWire[1] = f => { $$("[data-prog]", f).forEach(b => b.onclick = () => { st.program = b.dataset.prog; touch(); paintForm(); paintPreview(); }); $$("[data-fmt]", f).forEach(b => b.onclick = () => { st.format = b.dataset.fmt; if (st.format === "physical") side = "front"; touch(); paintForm(); paintPreview(); }); };
  function s2() {
    return `<div class="gf-card"><h2>Choose a design</h2><p class="sub">Your details stay put while you browse.</p><div class="gf-chips">${cats().map(c => `<button class="gf-chip" data-cat="${esc(c)}" aria-pressed="${st.cat === c}">${esc(c)}</button>`).join("")}</div><div class="gf-gal" id="gal"></div>
    <div class="gf-sw" id="sw"><span>Colour</span>${[0, 40, 90, 160, 220, 290].map(h => `<button data-hue="${h}" aria-pressed="${st.hue === h}" aria-label="Colour variation ${h}" style="background:conic-gradient(from ${h}deg,#ff5d73,#ffc233,#2ecf8a,#47c2ff,#7c5cff,#ff5d73)"></button>`).join("")}</div>
    ${st.slug === "photo-custom" ? `<label class="gf-up" style="margin-top:14px"><input type="file" id="ph" accept="image/jpeg,image/png,image/webp">${st.img ? "Photo added. Tap to change." : "Tap to upload your photo (JPG, PNG, WebP up to 8 MB)"}</label>` : ""}
    ${nav(true, true)}</div>`;
  }
  fnWire[2] = f => {
    const g = $("#gal", f); const list = T.filter(t => st.cat === "All" || t.category === st.cat);
    list.forEach(t => { const b = document.createElement("button"); b.setAttribute("aria-pressed", t.slug === st.slug); b.setAttribute("aria-label", t.name);
      const c = document.createElement("canvas"); A.render(c, { slug: t.slug, hue: st.hue, recipient: st.recipient.trim() || "Awa", amount: st.amount || 1000, program: st.program || "restaurant", message: "", width: 340 }); b.appendChild(c); b.insertAdjacentHTML("beforeend", `<i>${esc(t.name)}</i>${t.premium ? '<i class="p">Premium</i>' : ""}`);
      b.onclick = () => { st.slug = t.slug; touch(); $$("#gal button", f).forEach(x => x.setAttribute("aria-pressed", x === b)); paintPreview(); if (t.slug === "photo-custom" || $("#ph", f)) paintForm(); }; g.appendChild(b); });
    $$("[data-cat]", f).forEach(b => b.onclick = () => { st.cat = b.dataset.cat; paintForm(); });
    $$("[data-hue]", f).forEach(b => b.onclick = () => { st.hue = Number(b.dataset.hue); touch(); paintForm(); paintPreview(); });
    const ph = $("#ph", f); if (ph) ph.onchange = async () => { try { await loadPhoto(ph.files[0]); touch(); paintForm(); paintPreview(); } catch (e) { toast(e.message); } };
  };
  async function loadPhoto(file) {
    if (!file) return; if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Please choose a JPG, PNG or WebP image."); if (file.size > 8 * 1024 * 1024) throw new Error("That photo is larger than 8 MB.");
    const bmp = await createImageBitmap(file).catch(() => null); if (!bmp) throw new Error("We couldn't read that image."); if (bmp.width < 400 || bmp.height < 250) throw new Error("That photo is too small. Use at least 400 x 250 pixels.");
    const sc = Math.min(1, 1800 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    st.blob = await new Promise(r => c.toBlob(r, "image/jpeg", .86)); st.img = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(st.blob); });
  }
  function s3() {
    const presets = (S.presets || []).filter(p => p >= S.min_amount && p <= S.max_amount);
    return `<div class="gf-card"><h2>How much?</h2><p class="sub">Between ${money(S.min_amount)} and ${money(S.max_amount)}. The card is not reloadable.</p><div class="gf-amts">${presets.map(p => `<button data-amt="${p}" aria-pressed="${Number(st.amount) === p}">${money(p)}</button>`).join("")}</div>
    <label class="gf-f"><label>Or enter an amount (D)<input id="amt" inputmode="decimal" type="number" min="${S.min_amount}" max="${S.max_amount}" step="1" value="${st.amount || ""}" placeholder="e.g. 750"></label></label>${nav(true, true)}</div>`;
  }
  fnWire[3] = f => { $$("[data-amt]", f).forEach(b => b.onclick = () => { st.amount = Number(b.dataset.amt); touch(); paintForm(); paintPreview(); }); $("#amt", f).oninput = e => { st.amount = e.target.value === "" ? 0 : Number(e.target.value); touch(); $$("[data-amt]", f).forEach(b => b.setAttribute("aria-pressed", Number(b.dataset.amt) === st.amount)); paintPreview(); }; };
  function s4() {
    return `<div class="gf-card"><h2>Make it personal</h2><p class="sub">Everything updates in the preview instantly.</p><div class="gf-f">
    <label>Recipient's name <small>(optional)</small><input id="rn" maxlength="60" value="${esc(st.recipient)}" placeholder="Who is it for?" autocomplete="off"></label>
    <label>Your name <small>(optional)</small><input id="sn" maxlength="60" value="${esc(st.sender)}" placeholder="From" autocomplete="name"></label>
    <label>Personal message <small id="mc">${st.message.length}/280</small><textarea id="ms" maxlength="280" placeholder="Write something kind…">${esc(st.message)}</textarea></label></div>${nav(true, true)}</div>`;
  }
  fnWire[4] = f => { const bind = (id, k) => $(id, f).oninput = e => { st[k] = e.target.value; touch(); if (k === "message") $("#mc", f).textContent = st.message.length + "/280"; paintPreview(); }; bind("#rn", "recipient"); bind("#sn", "sender"); bind("#ms", "message"); };
  function s5() {
    if (st.format === "virtual") return `<div class="gf-card"><h2>Delivery</h2><p class="sub">You always get the card in My gift cards, ready to download and share.</p>
      <div class="gf-opt">${opt("data-when", "now", st.when, "Available now", "The link works immediately.")}${opt("data-when", "later", st.when, "Schedule a reveal", "The gift stays sealed until the date you choose.")}</div>
      ${st.when === "later" ? `<div class="gf-f" style="margin-top:14px"><label>Reveal date and time<input id="da" type="datetime-local" value="${esc(st.deliverAt)}"></label></div>` : ""}
      <div class="gf-f" style="margin-top:14px"><label>Recipient's email <small>(optional, saved with the gift)</small><input id="em" type="email" value="${esc(st.email)}" placeholder="name@example.com"></label><label>Recipient's phone <small>(optional)</small><input id="ph2" type="tel" value="${esc(st.phone)}" placeholder="+220…"></label></div>
      <div class="gf-note">JulaDirect doesn't send the gift to the recipient automatically yet. After payment you'll share the secure link or the downloaded image yourself, by WhatsApp or any app.</div>${nav(true, true)}</div>`;
    const colOK = S.collection_enabled, delOK = S.delivery_enabled;
    return `<div class="gf-card"><h2>Collection or delivery</h2><p class="sub">Your printed card is produced after payment.</p><div class="gf-opt">${opt("data-m", "collection", st.method, "Collection", colOK ? esc(S.collection_note || "Collect from JulaDirect.") : "Not available yet.", !colOK, colOK ? "" : "Unavailable")}${opt("data-m", "delivery", st.method, "Delivery", delOK ? `Delivered to the address you give (${money(S.delivery_fee)}).` : "Not available yet.", !delOK, delOK ? "" : "Unavailable")}</div>
    <div class="gf-f" style="margin-top:14px"><label>Contact name<input id="dn" value="${esc(st.dname)}" maxlength="80"></label><label>Contact phone<input id="dp" type="tel" value="${esc(st.dphone)}" placeholder="+220…"></label>${st.method === "delivery" ? `<label>Delivery address<textarea id="dad" maxlength="240">${esc(st.daddress)}</textarea></label>` : ""}<label>Notes <small>(optional)</small><input id="dno" maxlength="240" value="${esc(st.dnotes)}"></label>
    <label style="grid-auto-flow:column;justify-content:start;align-items:center;gap:10px"><input type="checkbox" id="env" ${st.envelope ? "checked" : ""} style="width:20px;height:20px"> Add a gift envelope (+${money(S.envelope_fee)})</label></div>
    ${!colOK && !delOK ? `<p class="gf-err">Neither collection nor delivery is available right now, so printed cards can't be ordered yet.</p>` : ""}${nav(true, true)}</div>`;
  }
  fnWire[5] = f => {
    $$("[data-when]", f).forEach(b => b.onclick = () => { st.when = b.dataset.when; touch(); paintForm(); }); $$("[data-m]", f).forEach(b => b.onclick = () => { st.method = b.dataset.m; touch(); paintForm(); paintPreview(); });
    const b = (id, k, fn) => { const e = $(id, f); if (e) e.oninput = () => { st[k] = e.type === "checkbox" ? e.checked : e.value; touch(); if (fn) fn(); }; };
    b("#da", "deliverAt"); b("#em", "email"); b("#ph2", "phone"); b("#dn", "dname"); b("#dp", "dphone"); b("#dad", "daddress"); b("#dno", "dnotes"); b("#env", "envelope", paintPreview);
  };
  function s6() {
    const t = T.find(x => x.slug === st.slug) || {}, f = fees();
    return `<div class="gf-card"><h2>Review and pay</h2><p class="sub">Check everything. The card is created only after your payment is confirmed.</p>
    <ul class="gf-tl"><li><span>Card<small>${st.program === "marketplace" ? "Marketplace" : "Restaurant"} · ${st.format}</small></span><b>${money(st.amount)}</b></li><li><span>Design<small>${esc(t.name || "")}</small></span><span></span></li>${st.recipient ? `<li><span>For</span><span>${esc(st.recipient)}</span></li>` : ""}${st.when === "later" && st.format === "virtual" ? `<li><span>Reveals</span><span>${esc(new Date(st.deliverAt).toLocaleString())}</span></li>` : ""}${f ? `<li><span>Printing & packaging</span><b>${money(f)}</b></li>` : ""}<li><b>Total</b><b>${money(total())}</b></li></ul>
    <h2 style="font-size:17px;margin:18px 0 10px">Pay with</h2><div class="gf-pay">${[["wave", "Wave"], ["qmoney", "QMoney"], ["afrimoney", "Afrimoney"]].map(([k, n]) => `<button data-pay="${k}" aria-pressed="${st.pay === k}">${n}</button>`).join("")}</div>
    <div class="gf-note">You'll be taken to ModemPay's secure page to approve the payment. We never see your wallet PIN.</div><p class="gf-err" id="perr" role="alert"></p>${nav(true, true, "Pay " + money(total()))}</div>`;
  }
  fnWire[6] = f => { $$("[data-pay]", f).forEach(b => b.onclick = () => { st.pay = b.dataset.pay; touch(); $$("[data-pay]", f).forEach(x => x.setAttribute("aria-pressed", x === b)); }); };

  async function pay(btn) {
    const err = $("#perr"); err.textContent = ""; const bk = btn.textContent; btn.disabled = true; btn.textContent = "Please wait…";
    const fail = m => { err.textContent = m; btn.disabled = false; btn.textContent = bk; };
    try {
      const c = await client(); const ses = await GamBasketAuth.getSession(); if (!ses?.user) { saveDraft(); location.href = "login.html?redirect=" + encodeURIComponent(location.pathname + "#/new"); return; }
      let imagePath = null;
      if (st.slug === "photo-custom") { if (!st.blob) return fail("Please add your photo again."); imagePath = ses.user.id + "/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(16).slice(2)) + ".jpg"; const up = await c.storage.from("gift-media").upload(imagePath, st.blob, { contentType: "image/jpeg", upsert: false }); if (up.error) return fail("We couldn't upload your photo. Please try again."); }
      st.idem = st.idem || "gift-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
      const design = { template: st.slug, accent: st.hue ? "h" + st.hue : "", recipient_name: st.recipient.trim(), sender_name: st.sender.trim(), message: st.message.trim(), image_path: imagePath };
      const args = { p_program: st.program, p_format: st.format, p_amount: Number(st.amount), p_design: design, p_idem: st.idem, p_recipient_email: st.email.trim() || null, p_recipient_phone: st.phone.trim() || null, p_deliver_at: st.format === "virtual" && st.when === "later" ? new Date(st.deliverAt).toISOString() : null, p_envelope: st.format === "physical" && st.envelope, p_delivery: st.format === "physical" ? { method: st.method, name: st.dname.trim(), phone: st.dphone.trim(), address: st.daddress.trim(), notes: st.dnotes.trim() } : null };
      const { data, error } = await c.rpc("gift_create_order", args); if (error) return fail("We couldn't create your order. Please try again.");
      if (!data.ok) return fail(ERR[data.error] || "We couldn't create your order.");
      if (Math.abs(Number(data.total) - total()) > .001) return fail("Prices changed. Please review your order again.");
      const r = await c.functions.invoke("juladirect-giftcard-checkout", { body: { order_id: data.order_id, payment_method: st.pay } });
      const url = r.data && r.data.payment_url; if (!url) { let m = (r.data && r.data.error) || ""; if (!m && r.error && r.error.context && r.error.context.json) { try { m = (await r.error.context.json()).error; } catch (e) {} } return fail(m || "Payment couldn't be started. You have not been charged."); }
      location.href = url;
    } catch (e) { fail("Something went wrong. You have not been charged."); }
  }

  /* ---------------- order return / status ---------------- */
  async function orderStatus(id) {
    root.innerHTML = `<div class="gf-wrap"><div class="gf-empty"><div class="gf-sk" style="margin:0 auto 18px"></div><h2>Confirming your payment…</h2><p>This usually takes a few seconds. Please don't close this page.</p></div></div>`;
    const c = await client(); if (!(await GamBasketAuth.getSession())?.user) { location.href = "login.html?redirect=" + encodeURIComponent(location.pathname + "#/order/" + id); return; }
    const t0 = Date.now();
    const tick = async () => {
      if (location.hash.indexOf("#/order/") !== 0) return;
      const { data } = await c.from("gift_orders").select("id,payment_status,card_id,format").eq("id", id).maybeSingle();
      if (data && data.payment_status === "paid" && data.card_id) { try { sessionStorage.removeItem("gf_draft"); } catch (e) {} st = blank(); toast("Payment confirmed. Your gift card is ready."); location.hash = "#/card/" + data.card_id; return; }
      if (data && (data.payment_status === "failed" || data.payment_status === "cancelled")) return root.innerHTML = `<div class="gf-wrap"><div class="gf-empty"><h2>Payment ${data.payment_status === "cancelled" ? "cancelled" : "didn't go through"}</h2><p>You have not been charged for this gift card.</p><a class="gf-btn" href="#/new">Back to your design</a></div></div>`;
      if (Date.now() - t0 > 90000) return root.innerHTML = `<div class="gf-wrap"><div class="gf-empty"><h2>Still waiting for confirmation</h2><p>Your card will appear in My gift cards as soon as the payment is confirmed. Nothing is lost if you leave this page.</p><a class="gf-btn" href="#/mine">Go to My gift cards</a></div></div>`;
      setTimeout(tick, 2500);
    }; tick();
  }

  /* ---------------- My gift cards ---------------- */
  async function needLogin() { const s = await GamBasketAuth.getSession(); if (s?.user) { user = s.user; return true; } root.innerHTML = `<div class="gf-wrap"><div class="gf-empty">${I.gift}<h2>Sign in to see your gift cards</h2><p>Cards you buy or receive live in your account.</p><a class="gf-btn" href="login.html?redirect=${encodeURIComponent(location.pathname + "#/mine")}">Sign in</a></div></div>`; return false; }
  const stBadge = c => { const [l, k] = STATUS[c.status] || [c.status, "mut"]; return `<span class="gf-st gf-st--${k}">${l}</span>`; };
  async function artFor(card, w, side) {
    const d = card.design || {}, c = document.createElement("canvas"); let image = null;
    if (d.image_path) { const cl = await client(); const url = cl.storage.from("gift-media").getPublicUrl(d.image_path).data.publicUrl; image = await new Promise(r => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => r(im); im.onerror = () => r(null); im.src = url; }); }
    A.render(c, { slug: card.template_slug, hue: A.hueOf(d.accent), recipient: d.recipient_name, sender: d.sender_name, message: d.message, amount: card.initial_amount, program: card.program, qrUrl: shareUrl(card.share_token), side: side || "front", image, width: w || 700, codeHint: "…" + card.code.slice(-4) }); return c;
  }
  async function mine() {
    root.innerHTML = `<div class="gf-wrap"><div class="gf-boot"><div class="gf-sk"></div></div></div>`; if (!(await needLogin())) return;
    const c = await client(), { data, error } = await c.from("gift_cards").select(COLS).order("created_at", { ascending: false });
    if (error) return root.innerHTML = `<div class="gf-wrap"><div class="gf-empty"><h2>We couldn't load your cards</h2><p>Please refresh and try again.</p></div></div>`;
    if (!data.length) return root.innerHTML = `<div class="gf-wrap"><div class="gf-empty">${I.gift}<h2>No gift cards yet</h2><p>Cards you buy or receive will show up here, with their balance and history.</p><a class="gf-btn" href="#/new">Create a gift card</a></div></div>`;
    const { data: pend } = await c.from("gift_orders").select("id,amount,payment_status,created_at").in("payment_status", ["pending", "pending_payment"]).order("created_at", { ascending: false }).limit(3);
    root.innerHTML = `<div class="gf-wrap"><h2 style="margin:26px 0 0;font-size:30px;letter-spacing:-.03em">My gift cards</h2>${(pend || []).length ? `<div class="gf-note gf-note--warn" style="margin-top:14px">You have ${pend.length} payment${pend.length > 1 ? "s" : ""} awaiting confirmation. Cards appear here once payment is confirmed.</div>` : ""}<div class="gf-list" id="ml"></div></div>`;
    const list = $("#ml");
    for (const card of data) { const b = document.createElement("button"); b.className = "gf-mc"; b.appendChild(await artFor(card, 560)); const rec = card.recipient_user_id === user.id && card.purchaser_id !== user.id;
      b.insertAdjacentHTML("beforeend", `<div><span>${stBadge(card)} ${rec ? '<span class="gf-st gf-st--mut">Received</span>' : ""}</span><b>${money(card.balance)} <small>of ${money(card.initial_amount)}</small></b><small>${card.program === "restaurant" ? "Restaurant" : "Marketplace"} · ${card.format}</small></div>`); b.onclick = () => location.hash = "#/card/" + card.id; list.appendChild(b); }
  }
  const KIND = { issue: "Card issued", redeem: "Used at a restaurant", reversal: "Refunded to card", adjustment: "Balance adjustment", cancel: "Card cancelled" };
  async function cardDetail(id) {
    root.innerHTML = `<div class="gf-wrap"><div class="gf-boot"><div class="gf-sk"></div></div></div>`; if (!(await needLogin())) return;
    const c = await client(), { data: card } = await c.from("gift_cards").select(COLS).eq("id", id).maybeSingle();
    if (!card) return root.innerHTML = `<div class="gf-wrap"><div class="gf-empty"><h2>Card not found</h2><a class="gf-btn" href="#/mine">My gift cards</a></div></div>`;
    const [lg, od] = await Promise.all([c.from("gift_ledger").select("id,kind,amount,balance_after,created_at,note").eq("card_id", id).order("id", { ascending: false }), c.from("gift_orders").select("*").eq("id", card.order_id).maybeSingle()]);
    const o = od.data, owner = card.recipient_user_id ? card.recipient_user_id === user.id : card.purchaser_id === user.id, link = shareUrl(card.share_token), pct = Math.round(card.balance / card.initial_amount * 100);
    const flow = ["queued", "printing", "ready", "shipped", "delivered"], fi = o && o.fulfilment_status ? flow.indexOf(o.fulfilment_status) : -1;
    root.innerHTML = `<div class="gf-wrap"><p style="margin:18px 0 0"><a href="#/mine" style="color:var(--g-blue);font-weight:700">← My gift cards</a></p><div class="gf-detail"><div><div id="art"></div>${card.format === "physical" ? `<div class="gf-prev__tabs" style="margin-top:12px" id="sd"><button aria-pressed="true" data-s="front">Front</button><button aria-pressed="false" data-s="back">Back (printed)</button></div>` : ""}</div>
    <div><div class="gf-card"><span>${stBadge(card)}</span><div class="gf-bal" style="margin-top:10px">${money(card.balance)}</div><div class="gf-bar"><i style="width:${pct}%"></i></div><small style="color:var(--g-mut)">of ${money(card.initial_amount)} · ${card.program === "restaurant" ? "Works at any participating restaurant" : "Marketplace gift card"}</small>
    ${card.deliver_at && new Date(card.deliver_at) > new Date() ? `<div class="gf-note">Sealed until ${esc(new Date(card.deliver_at).toLocaleString())}</div>` : ""}
    ${card.status === "pending_activation" ? `<div class="gf-note gf-note--warn">Your printed card becomes usable once it has been delivered or collected.</div>` : ""}
    <div class="gf-acts"><button class="gf-btn gf-btn--sm" id="dl">Download image</button><button class="gf-btn gf-btn--ghost gf-btn--sm" id="sh">Share</button><a class="gf-btn gf-btn--ghost gf-btn--sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent("I sent you a JulaDirect gift card: " + link)}">WhatsApp</a><button class="gf-btn gf-btn--ghost gf-btn--sm" id="cp">Copy link</button></div></div>
    ${owner && card.program === "restaurant" ? `<div class="gf-card"><h2 style="font-size:18px">Card number and PIN</h2><p class="sub" style="margin-bottom:8px">Give the restaurant your card number or QR code, then approve with your PIN.</p><div style="font-weight:800;letter-spacing:.05em">${esc(card.code)}</div><div class="gf-acts"><button class="gf-btn gf-btn--sm" id="pin">Show / reset my PIN</button></div><div id="pinbox"></div></div>` : ""}
    ${o && o.format === "physical" ? `<div class="gf-card"><h2 style="font-size:18px">Printed card order</h2><div class="gf-fl">${flow.map((s, i) => `<div class="${i <= fi ? "on" : ""}">${s[0].toUpperCase() + s.slice(1)}</div>`).join("")}</div><small style="color:var(--g-mut)">${esc(o.delivery.method === "delivery" ? "Delivery to " + o.delivery.address : "Collection")} ${o.fulfilment_note ? "· " + esc(o.fulfilment_note) : ""}</small></div>` : ""}
    <div class="gf-card"><h2 style="font-size:18px">History</h2><ul class="gf-tl">${(lg.data || []).map(l => `<li><span>${KIND[l.kind] || l.kind}<small>${esc(new Date(l.created_at).toLocaleString())}${l.note && l.kind !== "issue" ? " · " + esc(l.note) : ""}</small></span><span><span class="${l.amount < 0 ? "neg" : "pos"}">${l.amount < 0 ? "−" : "+"}${money(Math.abs(l.amount))}</span><small style="text-align:right">Balance ${money(l.balance_after)}</small></span></li>`).join("") || "<li>No activity yet</li>"}</ul></div></div></div></div>`;
    let canvas = await artFor(card, 1100); $("#art").appendChild(canvas);
    $$("#sd button").forEach(b => b.onclick = async () => { $$("#sd button").forEach(x => x.setAttribute("aria-pressed", x === b)); canvas = await artFor(card, 1100, b.dataset.s); $("#art").innerHTML = ""; $("#art").appendChild(canvas); });
    const fileName = "JulaDirect-Gift-Card-" + card.code.slice(-4) + ".png", blobOf = async () => { const full = await artFor(card, 1600); return new Promise(r => full.toBlob(r, "image/png")); };
    $("#dl").onclick = async () => { const b = await blobOf(), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast("Downloaded. Your card stays in My gift cards if you lose it."); };
    $("#cp").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch (e) { prompt("Copy this link", link); } };
    $("#sh").onclick = async () => { try { const b = await blobOf(), f = new File([b], fileName, { type: "image/png" }); if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], text: "A JulaDirect gift card for you: " + link, title: "JulaDirect gift card" }); else if (navigator.share) await navigator.share({ text: "A JulaDirect gift card for you", url: link }); else { await navigator.clipboard.writeText(link); toast("Sharing isn't supported here. Link copied."); } } catch (e) {} };
    const pin = $("#pin"); if (pin) pin.onclick = async () => { if (!confirm("This creates a new PIN and cancels the old one. Continue?")) return; const { data } = await c.rpc("gift_set_pin", { p_card: card.id }); $("#pinbox").innerHTML = data && data.ok ? `<div class="gf-pin" role="status">${esc(data.pin)}</div><p class="sub">Write it down or tell the person using the card. It won't be shown again, and it never appears on the card image.</p>` : `<p class="gf-err">${data && data.error === "NOT_FOUND" ? "Only the card's current owner can change the PIN." : "We couldn't create a PIN right now."}</p>`; };
  }
  boot();
})();
