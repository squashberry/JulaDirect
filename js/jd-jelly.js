/* =========================================================
   JulaDirect jelly motion.
   One small spring engine shared by the storefront router and the seller studio.
   A damped oscillator is sampled into Web Animations keyframes, so everything
   overshoots and settles like rubber.

     Jelly.slide(el, dir)   page / tab change. dir: "right" = the new content arrives from the
                            right, "left" = from the left. Anything that is not a tab uses "right".
     Jelly.sheet(el, opts)  bottom sheets rise from below with a squash and stretch.
     Jelly.pop(el)          dialogs and popovers.

   Options: { mode: "transform" | "offset" }. "offset" moves the element with `left` instead of a
   transform, because a transformed ancestor would carry fixed-position children (buy bars, navs)
   along with it for the length of the animation.
   Honours prefers-reduced-motion.
   ========================================================= */
(function () {
  "use strict";
  if (window.Jelly) return;
  const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

  /* Damped spring 0 -> 1 sampled to n points. k = stiffness, c = damping. Returns [{t, v, s}] where
     v is progress (overshoots 1) and s is normalised speed (0..1) used for the squash. */
  function sample(k, c, n) {
    const out = [], w = Math.sqrt(Math.max(k - (c * c) / 4, 1)), T = 3.4 / (c / 2);
    let maxS = 0;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * T;
      const e = Math.exp(-(c / 2) * t);
      const v = 1 - e * (Math.cos(w * t) + (c / (2 * w)) * Math.sin(w * t));
      const s = Math.abs(e * ((k / w) * Math.sin(w * t)));
      maxS = Math.max(maxS, s);
      out.push({ v, s });
    }
    out.forEach(p => { p.s = maxS ? p.s / maxS : 0; });
    return { pts: out, ms: Math.round(T * 1000) };
  }
  const SPRING = sample(170, 11, 46);   /* lively, ~1 overshoot */
  const SOFT = sample(210, 15, 40);     /* sheets: a single clear bounce */

  function run(el, frames, ms, extra) {
    if (!el || !el.animate || reduced()) return null;
    try { if (el._jelly) el._jelly.cancel(); } catch (e) { /* done */ }
    const a = el.animate(frames, Object.assign({ duration: ms, easing: "linear", fill: "none" }, extra || {}));
    el._jelly = a;
    a.addEventListener("finish", () => { el.style.transformOrigin = ""; });
    a.addEventListener("cancel", () => { el.style.transformOrigin = ""; });
    return a;
  }

  /* dir: "right" | "left" */
  function slide(el, dir, o) {
    if (!el) return;
    o = o || {};
    const sign = dir === "left" ? -1 : 1, dist = (o.distance || Math.min(window.innerWidth * 0.5, 240)) * sign;
    const S = SPRING;
    if (o.mode === "offset") {
      const prev = el.style.position;
      const cs = getComputedStyle(el);
      if (cs.position === "static") el.style.position = "relative";
      const dx = Math.min(window.innerWidth, 1200) > 0 ? dist : 0;
      document.documentElement.style.overflowX = "clip";
      const a = run(el, S.pts.map((p, i) => ({ left: (dx * (1 - p.v)).toFixed(2) + "px", opacity: Math.min(1, 0.25 + p.v * 0.9), offset: i / (S.pts.length - 1) })), S.ms);
      const done = () => { el.style.position = prev; document.documentElement.style.overflowX = ""; };
      if (a) { a.onfinish = done; a.oncancel = done; } else done();
      return;
    }
    run(el, S.pts.map((p, i) => {
      const remain = 1 - p.v;                      /* + while approaching, - while overshooting */
      const sx = 1 + 0.10 * p.s * Math.sign(remain || 1) * 0.9 - 0.06 * Math.max(0, -remain) * 4;
      const sy = 1 - 0.035 * p.s;
      return { transform: "translate3d(" + (dist * remain).toFixed(2) + "px,0,0) scale(" + sx.toFixed(4) + "," + sy.toFixed(4) + ")", opacity: Math.min(1, 0.2 + p.v * 0.95), offset: i / (S.pts.length - 1) };
    }), S.ms, { });
    el.style.transformOrigin = sign > 0 ? "100% 40%" : "0% 40%";
  }

  /* Rises from the bottom edge; `base` is any transform the sheet already needs (e.g. translateX(-50%)). */
  function sheet(el, o) {
    if (!el) return;
    o = o || {};
    const base = o.base || "", S = SOFT, rise = Math.min(el.offsetHeight || 360, 640) + 40;
    el.style.transformOrigin = "50% 100%";
    run(el, S.pts.map((p, i) => {
      const remain = 1 - p.v;
      const sy = 1 + 0.07 * p.s * Math.sign(remain || 1) - 0.05 * Math.max(0, -remain) * 3;
      const sx = 1 - 0.025 * p.s * Math.sign(remain || 1);
      return { transform: base + " translate3d(0," + (rise * remain).toFixed(2) + "px,0) scale(" + sx.toFixed(4) + "," + sy.toFixed(4) + ")", offset: i / (S.pts.length - 1) };
    }), S.ms);
  }

  function pop(el, o) {
    if (!el) return;
    o = o || {};
    const S = SOFT, base = o.base || "", rise = o.rise == null ? 26 : o.rise;
    el.style.transformOrigin = o.origin || "50% 60%";
    return run(el, S.pts.map((p, i) => ({ transform: base + " translate3d(0," + (rise * (1 - p.v)).toFixed(2) + "px,0) scale(" + (0.86 + 0.14 * p.v).toFixed(4) + ")", opacity: Math.min(1, p.v * 1.8), offset: i / (S.pts.length - 1) })), S.ms);
  }

  /* Side panels: edge = "left" | "right" | "top" | "bottom". */
  function edge(el, side, o) {
    if (!el) return;
    o = o || {};
    const base = o.base || "", S = SOFT, horiz = side === "left" || side === "right";
    const size = (horiz ? el.offsetWidth : el.offsetHeight) + 40, sgn = side === "left" || side === "top" ? -1 : 1;
    el.style.transformOrigin = { left: "0 50%", right: "100% 50%", top: "50% 0", bottom: "50% 100%" }[side];
    return run(el, S.pts.map((p, i) => {
      const remain = 1 - p.v, grow = 1 + 0.06 * p.s * Math.sign(remain || 1) - 0.045 * Math.max(0, -remain) * 3, shrink = 1 - 0.02 * p.s * Math.sign(remain || 1);
      const d = (size * remain * sgn).toFixed(2);
      return { transform: base + (horiz ? " translate3d(" + d + "px,0,0) scale(" + grow.toFixed(4) + "," + shrink.toFixed(4) + ")" : " translate3d(0," + d + "px,0) scale(" + shrink.toFixed(4) + "," + grow.toFixed(4) + ")"), opacity: Math.min(1, 0.3 + p.v), offset: i / (S.pts.length - 1) };
    }), S.ms);
  }

  /* ------------------------------------------------------------------
     Universal layer. Everything that opens (sheets, drawers, modals, dialogs, menus,
     popovers, toasts) gets the matching jelly without per-page wiring, every button
     squishes under a finger, and full page loads arrive from the right.
     Opt out with data-jelly="off" on an element or any ancestor.
     ------------------------------------------------------------------ */
  const NAME = /(^|[\s_-])(sheet|drawer|modal|dialog|popover|dropdown|panel|menu|toast|lightbox|popup|flyout|tray)([\s_-]|$)/i;
  const NOT = /(scrim|backdrop|overlay|__|header|heading|title|body|foot|icon|item|copy|close|card|link|button|btn|text|label|list|row|nav|trigger|toggle|wrap)/i;
  const OPEN = /^(is-)?(open|opened|active|show|shown|visible|on|expanded|is-on|in)$/i;
  const SKIP = ".jp, .ms-shell, .ms-pop, [class*=\"vs-\"], .sx-drawer, dialog.sx-dialog, [data-jelly=off]";
  const looksOverlay = el => {
    if (!el || el.nodeType !== 1 || !el.className || typeof el.className !== "string") return false;
    const parts = el.className.split(/\s+/).filter(Boolean);
    return parts.some(c => NAME.test(c) && !NOT.test(c.replace(/(sheet|drawer|modal|dialog|popover|dropdown|panel|menu|toast|lightbox|popup|flyout|tray)/i, "")));
  };

  function auto(el) {
    if (!el.isConnected || reduced() || el.closest(SKIP)) return;
    const now = performance.now();
    if (el._jellyAt && now - el._jellyAt < 600) return;
    let cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || (cs.animationName && cs.animationName !== "none")) return;
    if (el.tagName !== "DIALOG" && cs.position !== "fixed" && cs.position !== "absolute") return;
    const keepT = el.style.transition;
    el.style.transition = "none"; void el.offsetWidth;        /* read the final, open geometry */
    cs = getComputedStyle(el);
    const base = cs.transform === "none" ? "" : cs.transform, r = el.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    const restore = () => { el.style.transition = keepT; };
    if (!r.width || !r.height || r.right <= 0 || r.left >= vw || r.bottom <= 0 || r.top >= vh || +cs.opacity < 0.05 && cs.transitionProperty.indexOf("opacity") < 0) return restore();
    if (r.width > vw * 0.97 && r.height > vh * 0.9) return restore();   /* full-screen takeovers keep their own motion */
    el._jellyAt = now;
    let a;
    const tall = r.height > vh * 0.78, name = el.className;
    if (/toast|snack/i.test(name)) a = pop(el, { base, rise: r.top < vh / 2 ? -18 : 18 });
    else if (tall && r.left <= 2 && r.width < vw * 0.92) a = edge(el, "left", { base });
    else if (tall && r.right >= vw - 2 && r.width < vw * 0.92) a = edge(el, "right", { base });
    else if (r.bottom >= vh - 2 && r.width > Math.min(vw * 0.6, 360)) a = edge(el, "bottom", { base });
    else if (r.top <= 2 && r.width > vw * 0.6) a = edge(el, "top", { base });
    else a = pop(el, { base, origin: /menu|dropdown|popover|flyout/i.test(name) ? "50% 0" : "50% 55%", rise: /menu|dropdown|popover|flyout/i.test(name) ? 10 : 26 });
    if (a) { a.onfinish = restore; a.oncancel = restore; setTimeout(restore, SOFT.ms + 120); } else restore();
  }

  function startObserver() {
    if (reduced() || !window.MutationObserver) return;
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === "childList") {
          m.addedNodes.forEach(n => {
            if (n.nodeType !== 1) return;
            const hit = el => { if (looksOverlay(el) || el.tagName === "DIALOG") { const o = +getComputedStyle(el).opacity; if (o > 0.05) auto(el); } };
            hit(n); if (n.querySelectorAll) n.querySelectorAll("[class]").forEach(c => { if (looksOverlay(c)) hit(c); });
          });
        } else if (m.type === "attributes") {
          const el = m.target;
          if (m.attributeName === "open") { if (el.hasAttribute("open") && (el.tagName === "DIALOG" || looksOverlay(el))) auto(el); }
          else if (m.attributeName === "hidden") { if (!el.hasAttribute("hidden") && looksOverlay(el)) auto(el); }
          else if (m.attributeName === "aria-hidden") { if (el.getAttribute("aria-hidden") === "false" && looksOverlay(el)) auto(el); }
          else if (m.attributeName === "class" && looksOverlay(el)) {
            const was = new Set((m.oldValue || "").split(/\s+/)); let added = false;
            el.classList.forEach(c => { if (!was.has(c) && OPEN.test(c)) added = true; });
            if (added) auto(el);
          }
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ["class", "hidden", "open", "aria-hidden"] });
  }

  /* Buttons squish and spring back. Uses the individual `scale` property so it never fights a
     button's own transform or transition. */
  const PRESS = "button, [role=button], a[class*=btn], a[class*=button], [class*=chip], summary, .jd-fnav__tab, .jd-tab, [class*=-tab]";
  function startPress() {
    if (reduced()) return;
    let cur = null, down = null;
    const spring = SPRING;
    document.addEventListener("pointerdown", e => {
      const t = e.target.closest && e.target.closest(PRESS);
      if (!t || t.disabled || t.getAttribute("aria-disabled") === "true" || t.closest("[data-jelly=off]") || t.matches("input, select, textarea")) return;
      const r = t.getBoundingClientRect(), to = r.width * r.height > 45000 ? 0.985 : 0.93;
      cur = t; down = to;
      try { t.animate([{ scale: "1" }, { scale: String(to) }], { duration: 110, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" }); } catch (err) { cur = null; }
    }, { passive: true, capture: true });
    const up = () => {
      if (!cur) return;
      const t = cur, to = down; cur = null;
      try {
        t.getAnimations().forEach(x => { if (x.effect && x.effect.getKeyframes().some(k => k.scale)) x.cancel(); });
        t.animate(spring.pts.map((p, i) => ({ scale: String((to + (1 - to) * p.v).toFixed(4)), offset: i / (spring.pts.length - 1) })), { duration: 520, easing: "linear" });
      } catch (err) { /* decorative */ }
    };
    ["pointerup", "pointercancel", "dragend"].forEach(n => document.addEventListener(n, up, { passive: true, capture: true }));
  }

  /* Full page loads (pages the router does not handle) arrive from the right. */
  function pageEnter() {
    if (reduced() || document.querySelector(".jd-pane")) return;
    let internal = false;
    try { internal = !!document.referrer && new URL(document.referrer).origin === location.origin && document.referrer.split("#")[0] !== location.href.split("#")[0]; } catch (e) { /* none */ }
    if (!internal) return;
    const main = document.querySelector("main, #adminApplication, .admin-main, .sx-main") || document.body;
    slide(main, "right", { mode: "offset" });
  }

  /* Content bounces up the first time it scrolls into view: headings, pills, cards, steps. */
  const REVEAL = [".hm-head", ".hm-pills > *", ".hm-rail > *", ".hm-trust > *", ".hm-steps > *", ".hm-faq__list > *", ".hm-cta__main", ".hm-cta__side", ".hm-slide__h", ".hm-slide__copy", ".hm-slide__btns", ".hm-eyebrow",
    ".jd-grid > *", ".jd-recent > *", ".ex-grid > *", "[class*=product-card]", "[class*=pcard]", ".wl-grid > *", "main .card", ".sx-card", ".sx-kpi", ".od-card", ".ck-card"].join(",");
  const seen = new WeakSet(), shown = new Set();
  /* Content that is re-rendered (a grid refreshed after a tab switch) must not bounce again,
     so what has been revealed is remembered by identity, not by DOM node. */
  const sigOf = el => {
    const a = el.matches("a[href]") ? el : el.querySelector("a[href]");
    const id = el.getAttribute("data-id") || el.getAttribute("data-product-id") || (a && a.getAttribute("href")) || (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    return (el.className || el.tagName) + "|" + id;
  };
  let io = null, batch = [], batchTimer = 0;
  function flush() {
    batchTimer = 0;
    const list = batch.splice(0).filter(el => { if (!el.isConnected) return false; const k = sigOf(el); if (shown.has(k)) return false; shown.add(k); return true; }).sort((a, b) => { const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return x.top - y.top || x.left - y.left; });
    list.forEach((el, i) => {
      const S = SOFT;
      el.style.transformOrigin = "50% 80%";
      try {
        const a = el.animate(S.pts.map((p, k) => ({ transform: "translate3d(0," + (54 * (1 - p.v)).toFixed(2) + "px,0) scale(" + (0.9 + 0.1 * p.v).toFixed(4) + ")", opacity: Math.min(1, p.v * 2), offset: k / (S.pts.length - 1) })), { duration: S.ms, delay: Math.min(i, 9) * 60, easing: "linear", fill: "backwards" });
        a.onfinish = a.oncancel = () => { el.style.transformOrigin = ""; };
      } catch (e) { /* decorative */ }
    });
  }
  function watch(el) {
    if (!io || seen.has(el) || el.closest("[data-jelly=off], .jp, .ms-shell, dialog")) return;
    seen.add(el); io.observe(el);
  }
  function startReveal() {
    if (reduced() || !window.IntersectionObserver) return;
    io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); batch.push(e.target); } });
      if (batch.length && !batchTimer) batchTimer = setTimeout(flush, 30);
    }, { threshold: 0.12 });
    const scan = root => { if (root.matches && root.matches(REVEAL)) watch(root); if (root.querySelectorAll) root.querySelectorAll(REVEAL).forEach(watch); };
    scan(document);
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) scan(n); }))).observe(document.documentElement, { childList: true, subtree: true });
  }

  const boot = () => { startObserver(); startPress(); pageEnter(); startReveal(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.Jelly = { slide, sheet, pop, edge };
})();
