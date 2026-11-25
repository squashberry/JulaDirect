/* =====================================================================
   JulaDirect: designed right-click menus.

   - Right-click a product (card, product page, quick view): a designed
     menu with Add to cart, Buy now, Save to wishlist, Compare, Quick view,
     Share, Copy link... Every action presses the product's own button, so
     existing logic (login, stock, toasts, animations) still runs.
   - Right-click empty space: a flat navigation ring that blooms out of the
     pointer (Home, Explore, Cart, Wishlist, Orders, Account, Sell, Help).
   - Images can't be saved from the page: no native image menu, no drag,
     no long-press save. (Browsers can't make this absolute: screenshots and
     developer tools always exist.)

   Inputs, text fields and ordinary links keep their native menu so that
   paste, spell-check and "open in new tab" still work.
   ===================================================================== */
(function () {
  "use strict";
  if (window.__jdCtx) return;
  var D = document, R = D.documentElement;
  var RM = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var PI = Math.PI;
  function cl(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sg(t, a, b) { return cl((t - a) / (b - a), 0, 1); }
  function lp(a, b, x) { return a + (b - a) * x; }
  function eo(x) { return 1 - Math.pow(1 - x, 3); }
  function elo(u, p) { if (u <= 0) return 0; if (u >= 1) return 1; p = p || 0.4; return Math.pow(2, -10 * u) * Math.sin((u - p / 4) * 2 * PI / p) + 1; }

  /* ---------- icons ---------- */
  var IC = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    explore: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
    cart: '<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21.5 8H6"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    orders: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    sell: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7"/><path d="M12 17h.01"/>',
    scale: '<path d="M12 3v18M6 21h12M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.7l6.8-4M8.6 13.3l6.8 4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function svg(n, s) { return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + IC[n] + "</svg>"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- styles ---------- */
  var CSS =
    "img,picture,video{-webkit-user-drag:none;user-drag:none;-webkit-touch-callout:none}img{-webkit-user-select:none;user-select:none}" +
    ".jdc-scrim{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483200;opacity:0;transition:opacity .25s ease;-webkit-tap-highlight-color:transparent}" +
    ".jdc-scrim.on{opacity:1}.jdc-scrim--r{background:radial-gradient(circle at var(--x) var(--y),rgba(47,107,255,.14),rgba(10,26,63,.26) 70%)}" +
    /* product menu */
    ".jdc-menu{position:fixed;z-index:2147483300;box-sizing:border-box;min-width:244px;max-width:min(310px,92vw);padding:8px;border-radius:20px;background:rgba(255,255,255,.93);-webkit-backdrop-filter:blur(16px) saturate(1.5);backdrop-filter:blur(16px) saturate(1.5);box-shadow:0 28px 64px rgba(10,26,63,.3),0 0 0 1px rgba(20,81,230,.12),inset 0 1px 0 rgba(255,255,255,.9);font:600 14px/1.25 var(--jd-font,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif);color:#0a1a3f;opacity:0;transform:scale(.6);will-change:transform,opacity}" +
    ".jdc-menu *{box-sizing:border-box}" +
    ".jdc-head{display:flex;align-items:center;gap:10px;padding:8px 10px 10px;margin:0 0 6px;border-bottom:1px solid rgba(20,81,230,.1)}" +
    ".jdc-head>i{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:12px;background:linear-gradient(145deg,#2f6bff,#1451e6);color:#fff;box-shadow:0 6px 12px rgba(20,81,230,.35)}" +
    ".jdc-head b{display:block;max-width:196px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:800}.jdc-head small{display:block;font-size:12px;font-weight:700;color:#4a5a80;margin-top:2px}" +
    ".jdc-it{display:flex;align-items:center;gap:11px;width:100%;padding:8px 10px;border:0;border-radius:13px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;animation:jdc-in .34s cubic-bezier(.34,1.56,.64,1) both;animation-delay:calc(var(--i) * 28ms + 60ms);-webkit-tap-highlight-color:transparent}" +
    ".jdc-it i{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:11px;background:rgba(20,81,230,.09);color:#1451e6;transition:transform .3s cubic-bezier(.34,1.56,.64,1),background .2s,color .2s}" +
    ".jdc-it:hover,.jdc-it:focus-visible{background:rgba(20,81,230,.08);outline:none}.jdc-it:hover i,.jdc-it:focus-visible i{background:#1451e6;color:#fff;transform:scale(1.16) rotate(-7deg)}" +
    ".jdc-it.on i{background:#1451e6;color:#fff}.jdc-it[disabled]{opacity:.45;cursor:not-allowed}.jdc-it[disabled]:hover i{background:rgba(20,81,230,.09);color:#1451e6;transform:none}" +
    ".jdc-sep{height:1px;margin:6px 8px;background:rgba(20,81,230,.1)}" +
    "@keyframes jdc-in{from{opacity:0;transform:translateX(-10px) scale(.96)}to{opacity:1;transform:none}}" +
    /* flat radial navigation */
    ".jdr{position:fixed;z-index:2147483300;width:0;height:0;font:700 12px/1 var(--jd-font,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif)}" +
    ".jdr-orbit,.jdr-halo{position:absolute;border-radius:50%;pointer-events:none}" +
    ".jdr-halo{background:radial-gradient(closest-side,rgba(47,107,255,.22),rgba(47,107,255,.08) 62%,transparent)}" +
    ".jdr-orbit{border:2px dashed rgba(20,81,230,.34)}" +
    ".jdr-it{position:absolute;display:block;width:var(--d);height:var(--d);left:calc(var(--d) / -2);top:calc(var(--d) / -2);color:#fff;text-decoration:none;-webkit-tap-highlight-color:transparent;outline:none;cursor:pointer}" +
    ".jdr-disc{position:absolute;left:0;top:0;right:0;bottom:0;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 32% 24%,#9bbcff 0,#2f6bff 40%,#1451e6 74%,#0e3dbd 100%);box-shadow:inset 0 -5px 9px rgba(7,17,43,.34),inset 0 4px 7px rgba(255,255,255,.55),0 10px 18px rgba(14,61,189,.34),0 0 0 3px rgba(255,255,255,.95);transition:transform .38s cubic-bezier(.34,1.56,.64,1),box-shadow .25s}" +
    ".jdr-disc svg{width:44%;height:44%;filter:drop-shadow(0 1px 1px rgba(7,17,43,.4))}" +
    ".jdr-it:hover .jdr-disc,.jdr-it:focus-visible .jdr-disc{transform:scale(1.2);box-shadow:inset 0 -5px 9px rgba(7,17,43,.34),inset 0 4px 7px rgba(255,255,255,.6),0 16px 26px rgba(14,61,189,.5),0 0 0 4px #fff,0 0 26px rgba(47,107,255,.65)}" +
    ".jdr-it.here .jdr-disc{box-shadow:inset 0 -5px 9px rgba(7,17,43,.34),inset 0 4px 7px rgba(255,255,255,.55),0 10px 18px rgba(14,61,189,.34),0 0 0 3px #fff,0 0 0 6px rgba(47,107,255,.55)}" +
    ".jdr-lab{position:absolute;white-space:nowrap;padding:5px 10px;border-radius:999px;color:#0a1a3f;background:rgba(255,255,255,.96);box-shadow:0 5px 12px rgba(10,26,63,.2);font-weight:800;letter-spacing:.01em;transition:background .2s,color .2s}" +
    ".jdr-lab.t{left:50%;bottom:calc(100% + 11px);transform:translateX(-50%)}.jdr-lab.b{left:50%;top:calc(100% + 11px);transform:translateX(-50%)}" +
    ".jdr-lab.l{right:calc(100% + 11px);top:50%;transform:translateY(-50%)}.jdr-lab.r{left:calc(100% + 11px);top:50%;transform:translateY(-50%)}" +
    ".jdr-it:hover .jdr-lab,.jdr-it:focus-visible .jdr-lab{background:#1451e6;color:#fff}" +
    ".jdr-bdg{position:absolute;right:-3px;top:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#fff;color:#1451e6;font:800 11px/20px system-ui,sans-serif;text-align:center;box-shadow:0 3px 8px rgba(10,26,63,.3)}" +
    ".jdr-hub{position:absolute;left:-19px;top:-19px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#1451e6;background:radial-gradient(circle at 35% 28%,#fff,#e4edff);box-shadow:0 8px 18px rgba(10,26,63,.26),0 0 0 3px rgba(47,107,255,.4),inset 0 -3px 6px rgba(20,81,230,.18);cursor:pointer;border:0;padding:0;outline:none}" +
    ".jdr-hub:focus-visible{box-shadow:0 8px 18px rgba(10,26,63,.26),0 0 0 3px #1451e6}";
  var st = D.createElement("style"); st.id = "jd-ctx-css"; st.textContent = CSS; D.head.appendChild(st);

  /* ---------- state ---------- */
  var cur = null; /* { kind, el, scrim, raf, ... } */
  var lastOpen = 0;

  function closeAll(fast) {
    if (!cur) return;
    var c = cur; cur = null;
    cancelAnimationFrame(c.raf);
    D.removeEventListener("keydown", c.onKey, true); window.removeEventListener("resize", c.onAway); window.removeEventListener("blur", c.onAway);
    window.removeEventListener("scroll", c.onAway, true); window.removeEventListener("wheel", c.onAway, true);
    function rm() { try { c.el.remove(); c.scrim.remove(); } catch (e) {} if (c.restore && c.restore.focus) { try { c.restore.focus({ preventScroll: true }); } catch (e) {} } }
    if (fast || RM) { rm(); return; }
    c.scrim.classList.remove("on");
    try { c.el.animate([{ opacity: 1, transform: c.el.style.transform || "none" }, { opacity: 0, transform: (c.el.style.transform || "") + " scale(.8)" }], { duration: 150, easing: "ease-in", fill: "forwards" }).onfinish = rm; } catch (e) { rm(); return; }
    setTimeout(rm, 220);
  }
  function arm(c) {
    c.onAway = function (e) { if (e && e.type === "scroll" && Date.now() - lastOpen < 300) return; if (cur === c && !(e && e.target && c.el.contains && c.el.contains(e.target))) closeAll(); };
    c.onKey = function (e) {
      if (e.key === "Escape") { e.preventDefault(); closeAll(); return; }
      var its = [].slice.call(c.el.querySelectorAll(".jdc-it:not([disabled]),.jdr-it")), i = its.indexOf(D.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); (its[(i + 1) % its.length] || its[0]).focus(); }
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) { e.preventDefault(); (its[(i - 1 + its.length) % its.length] || its[0]).focus(); }
      else if (e.key === "Home") { e.preventDefault(); its[0] && its[0].focus(); } else if (e.key === "End") { e.preventDefault(); its[its.length - 1] && its[its.length - 1].focus(); }
    };
    D.addEventListener("keydown", c.onKey, true); window.addEventListener("resize", c.onAway); window.addEventListener("blur", c.onAway);
    window.addEventListener("scroll", c.onAway, true); window.addEventListener("wheel", c.onAway, { capture: true, passive: true });
    c.scrim.addEventListener("pointerdown", function (e) { e.preventDefault(); closeAll(); });
    c.scrim.addEventListener("contextmenu", function (e) { e.preventDefault(); closeAll(); });
  }

  /* ---------- product menu ---------- */
  var ITEM = ".jd-pcard,.jd-rrow,.pd,.qv";
  function q1(root, sel) { return root.querySelector(sel); }
  function firstEnabled(root, sel) { var l = root.querySelectorAll(sel); for (var i = 0; i < l.length; i++) if (!l[i].disabled) return l[i]; return null; }
  function press(el) { try { el.click(); } catch (e) {} }
  function toast(m) { if (window.JD && JD.toast) JD.toast(m, "ok"); }
  function absUrl(a) { try { return new URL(a.getAttribute("href"), location.href).href; } catch (e) { return null; } }
  function productInfo(item) {
    var t = q1(item, ".jd-pcard__title,.jd-rrow__title,.pd-title,.qv-title,[data-qv-title]"), p = q1(item, ".jd-pcard__price,.jd-rrow__price,.pd-price,.qv-price");
    var a = q1(item, 'a[href*="product.html"]') || q1(item, "[data-qv-details]"), url = a ? absUrl(a) : (item.matches(".pd") ? location.href : null);
    return { title: (t && t.textContent.trim()) || "Product", price: p ? p.textContent.trim().split("\n")[0] : "", url: url, link: a };
  }
  function copy(text) {
    function fb() { try { var ta = D.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; D.body.appendChild(ta); ta.select(); D.execCommand("copy"); ta.remove(); toast("Link copied"); } catch (e) {} }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast("Link copied"); }, fb); else fb();
  }
  function buildActions(item, info) {
    var A = [], add = firstEnabled(item, "[data-add],[data-pdp-add],[data-qv-add]"), anyAdd = q1(item, "[data-add],[data-pdp-add],[data-qv-add]");
    if (anyAdd) A.push({ icon: "cart", label: add ? "Add to cart" : "Sold out", disabled: !add, run: function () { press(add); } });
    var buy = firstEnabled(item, "[data-pdp-buy],[data-qv-buy]");
    if (buy) A.push({ icon: "bolt", label: "Buy now", run: function () { press(buy); } });
    var w = q1(item, "[data-wish]");
    if (w) { var on = w.getAttribute("aria-pressed") === "true"; A.push({ icon: "heart", label: on ? "Remove from wishlist" : "Save to wishlist", on: on, run: function () { press(w); } }); }
    var c = q1(item, "[data-compare]");
    if (c) { var con = c.getAttribute("aria-pressed") === "true"; A.push({ icon: "scale", label: con ? "Remove from compare" : "Add to compare", on: con, run: function () { press(c); } }); }
    A.push("sep");
    if (item.matches(".jd-pcard,.jd-rrow") && info.link) A.push({ icon: "eye", label: "Quick view", run: function () { press(info.link); } });
    var lb = q1(item, "[data-lightbox]"); if (lb) A.push({ icon: "expand", label: "View photos full screen", run: function () { press(lb); } });
    if (info.url && !(item.matches(".pd") && info.url === location.href)) A.push({ icon: "ext", label: "Open product page", run: function () { location.href = info.url; } });
    if (info.url) A.push({ icon: "ext", label: "Open in new tab", run: function () { window.open(info.url, "_blank", "noopener"); } });
    if (info.url) A.push({ icon: "link", label: "Copy link", run: function () { copy(info.url); } });
    if (info.url && navigator.share) A.push({ icon: "share", label: "Share", run: function () { navigator.share({ title: info.title, url: info.url }).catch(function () {}); } });
    while (A.length && A[A.length - 1] === "sep") A.pop();
    return A.filter(function (a, i) { return !(a === "sep" && (i === 0 || A[i - 1] === "sep")); });
  }
  function openMenu(item, x, y) {
    closeAll(true);
    var info = productInfo(item), acts = buildActions(item, info);
    if (!acts.length) return false;
    var scrim = D.createElement("div"); scrim.className = "jdc-scrim"; var el = D.createElement("div"); el.className = "jdc-menu"; el.setAttribute("role", "menu"); el.setAttribute("aria-label", "Product actions");
    var html = '<div class="jdc-head"><i>' + svg("cart", 18) + '</i><div><b>' + esc(info.title) + "</b>" + (info.price ? "<small>" + esc(info.price) + "</small>" : "") + "</div></div>", n = 0;
    acts.forEach(function (a, i) { html += a === "sep" ? '<div class="jdc-sep" role="separator"></div>' : '<button type="button" role="menuitem" class="jdc-it' + (a.on ? " on" : "") + '" data-i="' + i + '" style="--i:' + (n++) + '"' + (a.disabled ? " disabled" : "") + "><i>" + svg(a.icon, 17) + "</i><span>" + esc(a.label) + "</span></button>"; });
    el.innerHTML = html; R.appendChild(scrim); R.appendChild(el);
    var vw = window.innerWidth, vh = window.innerHeight, r = el.getBoundingClientRect(), W = r.width, H = r.height;
    var left = x + W + 10 > vw ? Math.max(8, x - W) : x, top = y + H + 10 > vh ? Math.max(8, y - H) : y;
    el.style.left = left + "px"; el.style.top = top + "px";
    var ox = cl(x - left, 0, W), oy = cl(y - top, 0, H); el.style.transformOrigin = ox + "px " + oy + "px";
    var c = { kind: "menu", el: el, scrim: scrim, restore: D.activeElement, raf: 0 }; cur = c; arm(c); lastOpen = Date.now();
    void el.offsetWidth; scrim.classList.add("on");
    if (RM) { el.style.opacity = 1; el.style.transform = "none"; }
    else { try { el.animate([{ opacity: 0, transform: "scale(.55)" }, { opacity: 1, transform: "scale(1.04)", offset: .6 }, { opacity: 1, transform: "scale(.99)", offset: .82 }, { opacity: 1, transform: "scale(1)" }], { duration: 420, easing: "ease-out", fill: "forwards" }); el.style.opacity = 1; el.style.transform = "none"; } catch (e) { el.style.opacity = 1; el.style.transform = "none"; } }
    el.addEventListener("click", function (e) {
      var b = e.target.closest(".jdc-it"); if (!b || b.disabled) return;
      if (Date.now() - lastOpen < 320) return;
      var a = acts[Number(b.getAttribute("data-i"))]; closeAll(true); try { a.run(); } catch (err) {}
    });
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    var f = el.querySelector(".jdc-it:not([disabled])"); if (f && e_isKeyboard) f.focus({ preventScroll: true });
    return true;
  }
  var e_isKeyboard = false;

  /* ---------- radial navigation ---------- */
  var NAV = [
    ["Home", "index.html", "home"], ["Explore", "explore.html", "explore"], ["Cart", "cart.html", "cart"], ["Wishlist", "wishlist.html", "heart"],
    ["Orders", "orders.html", "orders"], ["Account", "me.html", "user"], ["Sell", "supplier/index.html", "sell"], ["Help", "help.html", "help"]
  ];
  function root() { return (window.JD && JD.root != null) ? JD.root : "../".repeat(Math.max(0, location.pathname.split("/").filter(Boolean).length - 1)); }
  function here(href) { var p = location.pathname.replace(/\/+$/, ""), h = "/" + href.replace(/^\.\//, ""); return p === h || (href === "index.html" && (p === "" || p === "/")) || p.slice(-h.length) === h; }
  function cartCount() { var e = q1(D, "[data-cart-count]:not([hidden])"), n = e ? parseInt(e.textContent, 10) : 0; return n > 0 ? n : 0; }
  function openRadial(x, y) {
    closeAll(true);
    var vw = window.innerWidth, vh = window.innerHeight, small = Math.min(vw, vh) < 560;
    var Rr = small ? 82 : 108, disc = small ? 52 : 62, n = NAV.length;
    var padH = Rr + disc / 2 + (small ? 72 : 84), padV = Rr + disc / 2 + 34;
    var cx = vw <= padH * 2 ? vw / 2 : cl(x, padH, vw - padH), cy = vh <= padV * 2 ? vh / 2 : cl(y, padV, vh - padV);
    var scrim = D.createElement("div"); scrim.className = "jdc-scrim jdc-scrim--r"; scrim.style.setProperty("--x", cx + "px"); scrim.style.setProperty("--y", cy + "px");
    var el = D.createElement("div"); el.className = "jdr"; el.style.left = cx + "px"; el.style.top = cy + "px"; el.style.setProperty("--d", disc + "px");
    el.setAttribute("role", "menu"); el.setAttribute("aria-label", "Navigation menu");
    var base = root(), cnt = cartCount(), items = "", th = [];
    NAV.forEach(function (m, i) {
      var ang = -PI / 2 + i * 2 * PI / n, c = Math.cos(ang), sn = Math.sin(ang), pos = Math.abs(c) < 0.35 ? (sn < 0 ? "t" : "b") : (c > 0 ? "r" : "l");
      th.push(ang);
      items += '<a class="jdr-it' + (here(m[1]) ? " here" : "") + '" role="menuitem" href="' + esc(base + m[1]) + '" data-i="' + i + '" aria-label="' + esc(m[0]) + '"><span class="jdr-disc">' + svg(m[2], 26) + (m[2] === "cart" && cnt ? '<b class="jdr-bdg">' + cnt + "</b>" : "") + '</span><span class="jdr-lab ' + pos + '">' + esc(m[0]) + "</span></a>";
    });
    el.innerHTML = '<div class="jdr-halo"></div><div class="jdr-orbit"></div>' + items + '<button type="button" class="jdr-hub" aria-label="Close menu">' + svg("compass", 22) + "</button>";
    R.appendChild(scrim); R.appendChild(el);
    var halo = el.querySelector(".jdr-halo"), orbit = el.querySelector(".jdr-orbit"), hub = el.querySelector(".jdr-hub"), its = [].slice.call(el.querySelectorAll(".jdr-it"));
    var c = { kind: "radial", el: el, scrim: scrim, restore: D.activeElement, raf: 0 }; cur = c; arm(c); lastOpen = Date.now();
    hub.addEventListener("click", function () { closeAll(); });
    el.addEventListener("click", function (e) { var a = e.target.closest(".jdr-it"); if (!a) return; if (Date.now() - lastOpen < 320) { e.preventDefault(); return; } if (!(e.ctrlKey || e.metaKey || e.shiftKey)) setTimeout(function () { closeAll(true); }, 30); });
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    function box(t, w) { t.style.width = t.style.height = w + "px"; t.style.left = t.style.top = -w / 2 + "px"; }
    /* every item starts as a droplet at the pointer, then spirals out into the circle with a rubber overshoot */
    function place(p) {
      var ge = RM ? 1 : elo(sg(p, 0, 0.7), 0.5);
      box(halo, Rr * 2.6 * Math.max(0, ge), 0); box(orbit, Rr * 2 * Math.max(0, ge), 0);
      halo.style.opacity = orbit.style.opacity = String(RM ? 1 : sg(p, 0.05, 0.4));
      hub.style.transform = "scale(" + (RM ? 1 : elo(sg(p, 0, 0.45), 0.5)) + ")";
      for (var i = 0; i < n; i++) {
        var u = RM ? 1 : sg(p, i * 0.035, i * 0.035 + 0.66), e = RM ? 1 : elo(u, 0.46), r = Rr * e, a = th[i] + (RM ? 0 : (1 - eo(u)) * -1.25);
        var s = RM ? 1 : lp(0.22, 1, e), it = its[i];
        it.style.transform = "translate(" + (Math.cos(a) * r).toFixed(2) + "px," + (Math.sin(a) * r).toFixed(2) + "px) scale(" + Math.max(0.001, s).toFixed(3) + ")";
        it.style.opacity = String(RM ? 1 : sg(u, 0, 0.12));
        it.lastChild.style.opacity = String(RM ? 1 : sg(p, 0.55, 0.85));
      }
    }
    var t0 = performance.now();
    function frame(now) { if (cur !== c) return; var p = sg((now - t0) / 1000, 0, 1.05); place(p); if (p < 1) c.raf = requestAnimationFrame(frame); }
    place(0); void el.offsetWidth; scrim.classList.add("on"); c.raf = requestAnimationFrame(frame);
    if (e_isKeyboard) { var f = its[0]; f && f.focus({ preventScroll: true }); }
    return true;
  }

  /* ---------- the event handler ---------- */
  function onCtx(e) {
    try {
      var t = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
      if (!t) return;
      if (t.closest(".jdc-menu,.jdr,.jdc-scrim")) { e.preventDefault(); return; }
      if (t.closest("input,textarea,select,[contenteditable]:not([contenteditable=false]),[data-native-menu]")) return;
      var x = e.clientX, y = e.clientY;
      e_isKeyboard = e.button === 0 && x === 0 && y === 0; /* the keyboard "menu" key */
      if (e_isKeyboard) { var r = t.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
      var isMedia = !!t.closest("img,picture,video,canvas");
      var item = t.closest(ITEM);
      if (item) { e.preventDefault(); e.stopPropagation(); if (!openMenu(item, x, y)) openRadial(x, y); return; }
      if (isMedia) { e.preventDefault(); e.stopPropagation(); openRadial(x, y); return; }
      if (t.closest("a[href],button,summary,label,[role=button],[role=link]")) return; /* keep the native menu for links and controls */
      var sel = window.getSelection && String(window.getSelection() || "").trim();
      if (sel) return; /* let people copy selected text */
      e.preventDefault(); e.stopPropagation(); openRadial(x, y);
    } catch (err) { /* never trap the browser menu on a bug */ }
  }
  D.addEventListener("contextmenu", onCtx, true);
  /* images cannot be dragged out of the page */
  D.addEventListener("dragstart", function (e) { var t = e.target; if (t && t.nodeType === 1 && (t.tagName === "IMG" || t.closest("picture,img"))) e.preventDefault(); }, true);
  D.addEventListener("mousedown", function () { e_isKeyboard = false; }, true);
  D.addEventListener("keydown", function (e) { if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) e_isKeyboard = true; }, true);
  window.addEventListener("pagehide", function () { closeAll(true); });
  window.__jdCtx = { openRadial: openRadial, openMenu: openMenu, close: function () { closeAll(true); } };
})();
