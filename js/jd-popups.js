/* JulaDirect popups.
   Part 1: a renderer for ten admin-editable templates (used by the storefront and by the admin preview).
   Part 2: the storefront runner: picks the highest-priority live popup for this page and shows it by its
   trigger (load, delay, scroll, exit intent), frequency, audience and schedule.
   Content is always inserted as text, and links/images are validated, so admin text can never run script. */
(function () {
  "use strict";
  var JD = window.JD || (window.JD = {});
  var BASE = (document.currentScript && document.currentScript.src || "").replace(/js\/jd-popups\.js.*$/, "");
  var cssLoaded = false;
  function loadCss() {
    if (cssLoaded || document.querySelector("link[data-jp-css]")) { cssLoaded = true; return; }
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = BASE + "css/jd-popups.css"; l.setAttribute("data-jp-css", ""); document.head.appendChild(l); cssLoaded = true;
  }
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var TEMPLATES = [
    { key: "spotlight", name: "Spotlight", note: "Classic centred promo with a hero image", modal: true },
    { key: "split", name: "Split", note: "Image beside the message", modal: true },
    { key: "fullbleed", name: "Full photo", note: "Big photo with text over it", modal: true },
    { key: "coupon", name: "Coupon", note: "Ticket with a copy-able code", modal: true },
    { key: "flash", name: "Flash sale", note: "Dark card with a live countdown", modal: true },
    { key: "sheet", name: "Bottom sheet", note: "Slides up from the bottom", modal: true },
    { key: "corner", name: "Corner nudge", note: "Small, does not block the page", modal: false },
    { key: "ribbon", name: "Top ribbon", note: "Slim announcement bar", modal: false },
    { key: "story", name: "Story", note: "Tall poster, social-story style", modal: true },
    { key: "burst", name: "Burst", note: "Big starburst badge, e.g. 50% OFF", modal: true }
  ];

  var SAMPLE = {
    spotlight: { kicker: "New season", headline: "Fresh finds, straight from The Gambia", body: "Hand-picked products from verified sellers, delivered to your door.", cta_label: "Start shopping", secondary_label: "Maybe later" },
    split: { kicker: "Just landed", headline: "Phones, solar and more at honest prices", body: "Compare sellers side by side and pay on delivery.", cta_label: "See what is new", secondary_label: "Not now" },
    fullbleed: { kicker: "This weekend only", headline: "Dress up for less", body: "Up to 40% off fashion from trusted sellers.", cta_label: "Shop fashion" },
    coupon: { kicker: "A gift for you", headline: "Take D 100 off your first order", body: "Use this code at checkout.", badge: "D 100", promo_code: "WELCOME100", cta_label: "Use it now", secondary_label: "No thanks" },
    flash: { kicker: "Flash sale", headline: "Prices drop for the next few hours", body: "Grab it before the clock runs out.", badge: "-30%", cta_label: "Shop the sale" },
    sheet: { kicker: "Tip", headline: "Get updates when prices drop", body: "Save a search and we will tell you.", cta_label: "Save a search", secondary_label: "Dismiss" },
    corner: { kicker: "Free delivery", headline: "Free delivery over D 2,000", body: "Applied automatically at checkout.", cta_label: "Browse" },
    ribbon: { headline: "Free delivery on orders over D 2,000", cta_label: "Shop now" },
    story: { kicker: "Eid collection", headline: "Look good. Feel great.", body: "Tap to see the full collection.", cta_label: "View collection" },
    burst: { kicker: "Mega deal", headline: "On selected electronics", body: "While stock lasts.", badge: "50% OFF", cta_label: "Grab the deal", secondary_label: "Close" }
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]; }); }
  function safeImg(u) { try { var x = new URL(String(u || ""), location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } }
  function safeLink(u) {
    u = String(u || "").trim(); if (!u) return "";
    if (/^https:\/\/[^\s]+$/.test(u)) return u;
    if (/^[A-Za-z0-9_.\/?=&#%-]+$/.test(u)) return u;
    return "";
  }
  function hex(c, d) { return /^#[0-9a-f]{6}$/i.test(c || "") ? c : d; }
  function lum(h) { var n = parseInt(h.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
  function ink(bg) { return lum(bg) > 0.6 ? "#0b1530" : "#ffffff"; }
  function mix(h, t, a) { var n = parseInt(h.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255, tr = t >> 16 & 255, tg = t >> 8 & 255, tb = t & 255; function m(x, y) { return Math.round(x + (y - x) * a); } return "#" + ((1 << 24) + (m(r, tr) << 16) + (m(g, tg) << 8) + m(b, tb)).toString(16).slice(1); }
  var X = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  var COPY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/></svg>';
  var PH = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#6c93ff'/><stop offset='1' stop-color='#1451e6'/></linearGradient></defs><rect width='800' height='600' fill='url(#g)'/><circle cx='560' cy='190' r='90' fill='rgba(255,255,255,.22)'/><path d='M0 600 260 330l170 150 120-100 250 220Z' fill='rgba(255,255,255,.28)'/></svg>");

  function parts(p) {
    var img = safeImg(p.image_url);
    return {
      img: img,
      imgOrPh: img || PH,
      kicker: p.kicker ? '<span class="jp__kicker">' + esc(p.kicker) + "</span>" : "",
      head: '<h2 class="jp__h">' + esc(p.headline || "Your headline") + "</h2>",
      body: p.body ? '<p class="jp__b">' + esc(p.body) + "</p>" : "",
      badge: p.badge ? '<span class="jp__badge">' + esc(p.badge) + "</span>" : "",
      cta: p.cta_label ? '<a class="jp__cta" data-jp="cta" href="' + esc(safeLink(p.cta_url) || "#") + '">' + esc(p.cta_label) + "</a>" : "",
      sec: p.secondary_label ? '<button type="button" class="jp__sec" data-jp="close">' + esc(p.secondary_label) + "</button>" : "",
      code: p.promo_code ? '<div class="jp__code"><code>' + esc(p.promo_code) + '</code><button type="button" data-jp="copy" data-code="' + esc(p.promo_code) + '">' + COPY + "<span>Copy</span></button></div>" : "",
      count: '<div class="jp__count" data-jp-count aria-label="Time left"><span><b data-u="d">00</b><i>days</i></span><span><b data-u="h">00</b><i>hrs</i></span><span><b data-u="m">00</b><i>min</i></span><span><b data-u="s">00</b><i>sec</i></span></div>',
      x: '<button type="button" class="jp__x" data-jp="close" aria-label="Close">' + X + "</button>"
    };
  }

  function markup(p) {
    var t = parts(p), k = p.template;
    switch (k) {
      case "split": return '<div class="jp__card"><div class="jp__media"><img src="' + esc(t.imgOrPh) + '" alt="">' + t.badge + '</div><div class="jp__txt">' + t.kicker + t.head + t.body + t.code + '<div class="jp__acts">' + t.cta + t.sec + "</div></div>" + t.x + "</div>";
      case "fullbleed": return '<div class="jp__card"><img class="jp__bg" src="' + esc(t.imgOrPh) + '" alt=""><div class="jp__shade"></div>' + t.badge + '<div class="jp__txt">' + t.kicker + t.head + t.body + '<div class="jp__acts">' + t.cta + "</div></div>" + t.x + "</div>";
      case "coupon": return '<div class="jp__card"><div class="jp__top">' + (t.badge || "") + t.kicker + t.head + '</div><div class="jp__tear" aria-hidden="true"></div><div class="jp__txt">' + t.body + t.code + '<div class="jp__acts">' + t.cta + t.sec + "</div></div>" + t.x + "</div>";
      case "flash": return '<div class="jp__card"><div class="jp__glow" aria-hidden="true"></div><div class="jp__txt">' + t.kicker + t.badge + t.head + t.body + t.count + '<div class="jp__acts">' + t.cta + t.sec + "</div></div>" + t.x + "</div>";
      case "sheet": return '<div class="jp__card"><span class="jp__grab" aria-hidden="true"></span><div class="jp__row"><img class="jp__thumb" src="' + esc(t.imgOrPh) + '" alt=""><div class="jp__txt">' + t.kicker + t.head + t.body + "</div></div>" + '<div class="jp__acts">' + t.cta + t.sec + "</div>" + t.x + "</div>";
      case "corner": return '<div class="jp__card"><img class="jp__thumb" src="' + esc(t.imgOrPh) + '" alt=""><div class="jp__txt">' + t.kicker + t.head + t.body + '<div class="jp__acts">' + t.cta + "</div></div>" + t.x + "</div>";
      case "ribbon": return '<div class="jp__card">' + (t.badge || "") + '<span class="jp__h">' + esc(p.headline || "Your announcement") + "</span>" + (p.promo_code ? t.code : "") + t.cta + t.x + "</div>";
      case "story": return '<div class="jp__card"><img class="jp__bg" src="' + esc(t.imgOrPh) + '" alt=""><div class="jp__shade"></div><div class="jp__prog" aria-hidden="true"><i></i></div><div class="jp__txt">' + t.kicker + t.head + t.body + '<div class="jp__acts">' + t.cta + "</div></div>" + t.x + "</div>";
      case "burst": return '<div class="jp__card"><div class="jp__star" aria-hidden="true"></div><div class="jp__stat"><b>' + esc(p.badge || "50% OFF") + '</b></div><div class="jp__txt">' + t.kicker + t.head + t.body + '<div class="jp__acts">' + t.cta + t.sec + "</div></div>" + t.x + "</div>";
      default: return '<div class="jp__card"><div class="jp__media"><img src="' + esc(t.imgOrPh) + '" alt="">' + t.badge + '</div><div class="jp__txt">' + t.kicker + t.head + t.body + t.code + '<div class="jp__acts">' + t.cta + t.sec + "</div></div>" + t.x + "</div>";
    }
  }

  /* Build a popup element. opts: { contained, onClose, onCta }. Returns { el, destroy }. */
  function render(p, opts) {
    loadCss(); opts = opts || {};
    p = p || {}; p.template = TEMPLATES.some(function (t) { return t.key === p.template; }) ? p.template : "spotlight";
    var meta = TEMPLATES.filter(function (t) { return t.key === p.template; })[0];
    var accent = hex(p.accent_color, "#1451E6"), bg = hex(p.bg_color, "#FFFFFF");
    var root = document.createElement("div");
    root.className = "jp jp--" + p.template + (meta.modal ? " is-modal" : " is-soft") + (opts.contained ? " is-contained" : "") + (opts.phone ? " is-phone" : "");
    root.setAttribute("role", meta.modal ? "dialog" : "region"); if (meta.modal) root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", p.headline || "Announcement");
    root.style.setProperty("--jp-accent", accent); root.style.setProperty("--jp-accent-ink", ink(accent));
    root.style.setProperty("--jp-bg", bg); root.style.setProperty("--jp-ink", ink(bg));
    root.style.setProperty("--jp-soft", mix(bg, lum(bg) > .6 ? 0x0b1530 : 0xffffff, .08));
    root.innerHTML = (meta.modal ? '<div class="jp__scrim" data-jp="scrim"></div>' : "") + markup(p);
    var timer = 0, closed = false;

    function tick() {
      var box = root.querySelector("[data-jp-count]"); if (!box) return;
      var end = p.countdown_to ? new Date(p.countdown_to).getTime() : NaN;
      if (isNaN(end)) end = (root.__fallbackEnd = root.__fallbackEnd || Date.now() + (6 * 3600 + 24 * 60 + 9) * 1000); /* preview/sample until a date is set */
      var s = Math.max(0, Math.floor((end - Date.now()) / 1000)), v = { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
      Object.keys(v).forEach(function (u) { var n = box.querySelector('[data-u="' + u + '"]'); if (n) n.textContent = String(v[u]).padStart(2, "0"); });
      var days = box.querySelector('[data-u="d"]'); if (days) days.parentNode.hidden = v.d === 0;
    }
    if (root.querySelector("[data-jp-count]")) { tick(); timer = setInterval(tick, 1000); }

    function close(why) { if (closed) return; closed = true; clearInterval(timer); root.classList.add("is-out"); var done = function () { if (root.parentNode) root.parentNode.removeChild(root); }; if (reduce) done(); else { root.addEventListener("animationend", function f(e) { if (e.target.classList.contains("jp__card") || e.target === root) { root.removeEventListener("animationend", f); done(); } }); setTimeout(done, 700); } if (opts.onClose) opts.onClose(why || "close"); }
    root.addEventListener("click", function (e) {
      var a = e.target.closest("[data-jp]"); if (!a) return;
      var k = a.getAttribute("data-jp");
      if (k === "copy") { var c = a.getAttribute("data-code"); var done = function () { var s = a.querySelector("span"); if (s) { s.textContent = "Copied"; setTimeout(function () { s.textContent = "Copy"; }, 1600); } }; if (navigator.clipboard) navigator.clipboard.writeText(c).then(done, done); else done(); return; }
      if (k === "scrim") { if (!opts.contained || opts.closeOnScrim) close("scrim"); return; }
      if (k === "close") { close("close"); return; }
      if (k === "cta") {
        if (opts.preview) { e.preventDefault(); return; }
        if (opts.onCta) opts.onCta(a, e);
      }
    });
    return { el: root, close: close, destroy: function () { closed = true; clearInterval(timer); if (root.parentNode) root.parentNode.removeChild(root); } };
  }

  /* ---------- storefront runner ---------- */
  var PAGE = { index: "home", explore: "explore", product: "product", cart: "cart", wishlist: "wishlist", orders: "orders" };
  function pageKey(route) {
    if (route) return route === "" || route === "index" || route === "home" ? "home" : (PAGE[route] || route);
    var f = location.pathname.split("/").pop().replace(/\.html$/, "") || "index"; return PAGE[f] || f;
  }
  var shown = null, armed = null, cache = null, loading = null;

  function store(kind) { try { return kind === "session" ? window.sessionStorage : window.localStorage; } catch (e) { return null; } }
  function seenKey(p) { return "jd-popup:" + p.id; }
  function wasSeen(p) {
    var f = p.frequency; if (f === "always") return false;
    var st = store(f === "once_session" ? "session" : "local"); if (!st) return false;
    var v = st.getItem(seenKey(p)); if (!v) return false;
    if (f === "once_day") return Date.now() - Number(v) < 864e5;
    return true;
  }
  function markSeen(p) { var st = store(p.frequency === "once_session" ? "session" : "local"); if (st && p.frequency !== "always") try { st.setItem(seenKey(p), String(Date.now())); } catch (e) {} }

  async function fetchLive() {
    if (cache) return cache;
    if (loading) return loading;
    loading = (async function () {
      try {
        var c = await JD.client(); if (!c) return [];
        var q = await c.from("site_popups").select("*").eq("is_active", true).order("priority", { ascending: false });
        if (q.error) return [];
        return q.data || [];
      } catch (e) { return []; }
    })().then(function (r) { cache = r; setTimeout(function () { cache = null; }, 5 * 60 * 1000); loading = null; return r; });
    return loading;
  }
  async function isMember() { try { var A = JD.auth && JD.auth(); if (!A) return false; await A.ready(); var u = await A.getUser(); return !!u; } catch (e) { return false; } }

  function eligible(p, page, member) {
    var now = Date.now();
    if (p.starts_at && new Date(p.starts_at).getTime() > now) return false;
    if (p.ends_at && new Date(p.ends_at).getTime() < now) return false;
    if (p.audience === "guests" && member) return false;
    if (p.audience === "members" && !member) return false;
    var pages = p.pages || ["home"]; if (pages.indexOf("all") < 0 && pages.indexOf(page) < 0) return false;
    return !wasSeen(p);
  }

  function present(p, forced) {
    if (shown) return;
    loadCss();
    var inst = render(p, {
      onClose: function () { shown = null; document.body.classList.remove("jp-lock"); if (!forced) markSeen(p); },
      onCta: function (a, ev) {
        if (!forced) markSeen(p);
        var href = a.getAttribute("href"); if (!href || href === "#") { ev.preventDefault(); return; }
        if (!/^https:\/\//.test(href) && JD.go) { ev.preventDefault(); inst.close("cta"); JD.go(href); } else inst.close("cta");
      }
    });
    shown = inst;
    document.body.appendChild(inst.el);
    if (inst.el.classList.contains("is-modal")) document.body.classList.add("jp-lock");
    var onKey = function (e) { if (e.key === "Escape" && shown === inst) { inst.close("esc"); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);
    var first = inst.el.querySelector(".jp__cta, .jp__x"); if (first && inst.el.classList.contains("is-modal")) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 500);
  }

  function arm(p, forced) {
    if (armed) { armed.undo(); armed = null; }
    if (forced || p.trigger_type === "load") { present(p, forced); return; }
    var undo = function () {}; var fire = function () { undo(); armed = null; present(p, false); };
    if (p.trigger_type === "delay") { var t = setTimeout(fire, Math.max(0, p.trigger_value) * 1000); undo = function () { clearTimeout(t); }; }
    else if (p.trigger_type === "scroll") {
      var need = Math.max(5, Math.min(95, p.trigger_value || 40));
      var on = function () { var h = document.documentElement.scrollHeight - innerHeight; if (h > 0 && scrollY / h * 100 >= need) fire(); };
      window.addEventListener("scroll", on, { passive: true }); undo = function () { window.removeEventListener("scroll", on); };
    } else if (p.trigger_type === "exit") {
      var out = function (e) { if (e.clientY <= 0 && !e.relatedTarget) fire(); };
      document.addEventListener("mouseout", out);
      /* touch screens have no cursor to leave with: fall back to a gentle delay */
      var tt = window.matchMedia("(hover: none)").matches ? setTimeout(fire, 12000) : 0;
      undo = function () { document.removeEventListener("mouseout", out); clearTimeout(tt); };
    }
    armed = { undo: undo };
  }

  async function run(route) {
    var preview = new URLSearchParams(location.search).get("preview_popup");
    var page = pageKey(route);
    if (shown) { shown.destroy(); shown = null; document.body.classList.remove("jp-lock"); }
    if (preview) {
      try { var c = await JD.client(); var q = await c.from("site_popups").select("*").eq("id", preview).maybeSingle(); if (q.data) { arm(q.data, true); showPill(q.data); } } catch (e) {}
      return;
    }
    var list = await fetchLive(); if (!list.length) return;
    var member = await isMember();
    var pick = list.filter(function (p) { return eligible(p, page, member); })[0];
    if (pick) arm(pick, false); else if (armed) { armed.undo(); armed = null; }
  }
  function showPill(p) {
    if (document.getElementById("jp-pill")) return;
    var d = document.createElement("div"); d.id = "jp-pill"; d.className = "jp-pill";
    d.innerHTML = "<span>Previewing <strong>" + esc(p.name) + "</strong> (" + (p.is_active ? "live" : "not live") + ')</span><a href="admin/popups.html">Back to popups</a>';
    document.body.appendChild(d);
  }

  JD.popups = { render: render, templates: TEMPLATES, sample: SAMPLE, run: run, reset: function () { cache = null; } };
  function start() { if (!document.querySelector('[data-no-popups]')) run(); }
  window.addEventListener("jd:pane:show", function (e) { if (e.detail && !e.detail.first) run(e.detail.route); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
