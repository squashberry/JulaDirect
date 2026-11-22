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
    return a;
  }

  /* dir: "right" | "left" */
  function slide(el, dir, o) {
    if (!el) return;
    o = o || {};
    const sign = dir === "left" ? -1 : 1, dist = (o.distance || Math.min(window.innerWidth * 0.34, 170)) * sign;
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

  function pop(el) {
    if (!el) return;
    const S = SOFT;
    el.style.transformOrigin = "50% 60%";
    run(el, S.pts.map((p, i) => ({ transform: "translate3d(0," + (26 * (1 - p.v)).toFixed(2) + "px,0) scale(" + (0.86 + 0.14 * p.v).toFixed(4) + ")", opacity: Math.min(1, p.v * 1.6), offset: i / (S.pts.length - 1) })), S.ms);
  }

  window.Jelly = { slide, sheet, pop };
})();
