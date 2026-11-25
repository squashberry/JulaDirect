/* Public gift presentation page. Shows only what the secure link is allowed to reveal; never the card number or PIN. */
(function () {
  "use strict";
  const A = window.GiftArt, root = document.getElementById("gv"), tok = (new URLSearchParams(location.search).get("t") || "").trim().toLowerCase();
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => { const t = document.getElementById("gf-toast"); t.textContent = m; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 3000); };
  const brand = '<div class="gv-brand"><svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="10" fill="#2f6bff"/><path d="M10 12.5h12l-1 10a2 2 0 0 1-2 1.8h-6a2 2 0 0 1-2-1.8l-1-10Z" fill="#fff"/><path d="M12.8 12.5V11a3.2 3.2 0 0 1 6.4 0v1.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>JulaDirect</div>';
  const page = h => root.innerHTML = `<div class="gv-stage">${brand}${h}</div>`;
  const client = async () => { await GamBasketAuth.ready(); return GamBasketAuth.getClient(); };
  async function img(path, c) { if (!path) return null; const url = c.storage.from("gift-media").getPublicUrl(path).data.publicUrl; return new Promise(r => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => r(i); i.onerror = () => r(null); i.src = url; }); }
  const STATUS = { pending_activation: "Waiting to be delivered", active: "Ready to use", partially_redeemed: "Partly used", fully_redeemed: "Fully used", suspended: "Temporarily on hold", cancelled: "Cancelled", expired: "Expired" };
  function confetti() { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; const w = document.createElement("div"); w.className = "gv-confetti"; const cols = ["#ffd166", "#ff5d73", "#47c2ff", "#2ecf8a", "#fff", "#a78bfa"]; for (let i = 0; i < 70; i++) { const e = document.createElement("i"); e.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % 6]};animation-duration:${2 + Math.random() * 2.4}s;animation-delay:${Math.random() * .6}s`; w.appendChild(e); } document.body.appendChild(w); setTimeout(() => w.remove(), 5200); }
  async function main() {
    if (!/^[0-9a-f]{48}$/.test(tok)) return page(`<h1>This gift link isn't valid</h1><p class="l">Check the link you were sent, or ask the sender to share it again.</p><a class="gf-btn gf-btn--gold" href="index.html">Go to JulaDirect</a>`);
    const c = await client(), { data: v, error } = await c.rpc("gift_public_view", { p_token: tok });
    if (error || !v || !v.ok) return page(`<h1>We couldn't find this gift</h1><p class="l">The link may be incorrect or the card is no longer available.</p><a class="gf-btn gf-btn--gold" href="index.html">Go to JulaDirect</a>`);
    if (v.scheduled) { const when = new Date(v.deliver_at); return page(`<h1>A gift is on its way to you</h1><p class="l">It's sealed until <b>${esc(when.toLocaleString())}</b>. Come back then to open it.</p><button class="gv-box" disabled aria-label="Sealed gift"><span class="base"></span><span class="lid"></span><span class="bow"></span></button>`); }
    const d = v.design || {}, who = d.recipient_name ? esc(d.recipient_name) : "you";
    page(`<h1>A gift for ${who}${d.sender_name ? `<br><small style="font-size:.5em;font-weight:600;color:#ffd166">from ${esc(d.sender_name)}</small>` : ""}</h1><p class="l">${v.program === "restaurant" ? "A JulaDirect Restaurant Gift Card" : "A JulaDirect Marketplace Gift Card"}. Tap the box to open it.</p><button class="gv-box" id="box" aria-label="Open your gift"><span class="base"></span><span class="lid"></span><span class="bow"></span></button><div class="gv-hint" id="hint">Tap to open</div><div id="rev"></div>`);
    const open = async () => {
      const box = document.getElementById("box"); if (box.classList.contains("open")) return; box.classList.add("open"); document.getElementById("hint").remove(); confetti();
      const image = await img(v.image_path, c), cv = document.createElement("canvas");
      A.render(cv, { slug: d.template, hue: A.hueOf(d.accent), recipient: d.recipient_name, sender: d.sender_name, message: d.message, amount: v.amount, program: v.program, qrUrl: location.href.split("#")[0], image, code: "JD-" + (v.program === "restaurant" ? "R" : "M") + "-\u2022\u2022\u2022\u2022-\u2022\u2022\u2022\u2022-" + String(v.ref_last4 || "\u2022\u2022\u2022\u2022"), width: 1200 });
      const pct = Math.max(0, Math.min(100, Math.round(v.balance / v.amount * 100))), ses = (await GamBasketAuth.getSession())?.user, here = encodeURIComponent(location.pathname.replace(/^\//, "") + location.search);
      const rev = document.getElementById("rev"); rev.innerHTML = `<div class="gv-card"></div><div class="gv-panel"><div class="gv-bal"><div><span>Current balance</span><br><b>${A.money(v.balance)}</b></div><span>of ${A.money(v.amount)} · ${esc(STATUS[v.status] || v.status)}</span></div><div class="gf-bar"><i style="width:${pct}%"></i></div>
      <ol>${v.program === "restaurant" ? "<li>Sign in or create a JulaDirect account to claim this card.</li><li>Open the card and create your private 6-digit PIN.</li><li>At any participating restaurant, show the card or QR code and approve with your PIN.</li>" : "<li>Sign in or create a JulaDirect account to claim this card.</li><li>Your balance and history live in My gift cards.</li><li>Keep your PIN private. JulaDirect will never ask you for it.</li>"}</ol>
      <div class="gv-actions" id="act">${ses ? `<button class="gf-btn gf-btn--gold" id="claim">Add to my gift cards</button>` : `<a class="gf-btn gf-btn--gold" href="login.html?redirect=${here}">Sign in to claim</a><a class="gf-btn gf-btn--ghost" href="signup.html?redirect=${here}">Create an account</a>`}</div></div>`;
      rev.querySelector(".gv-card").appendChild(cv);
      const cl = document.getElementById("claim"); if (cl) cl.onclick = async () => { cl.disabled = true; const { data } = await c.rpc("gift_claim", { p_token: tok }); if (data && data.ok) location.href = "gift-cards.html#/card/" + data.card_id; else { cl.disabled = false; toast(data && data.error === "ALREADY_CLAIMED" ? "This gift has already been claimed by someone else." : data && data.error === "NOT_YET" ? "This gift hasn't been unsealed yet." : "We couldn't claim this gift right now."); } };
    };
    document.getElementById("box").onclick = open; setTimeout(() => { if (matchMedia("(prefers-reduced-motion: reduce)").matches) open(); }, 50);
  }
  main();
})();
