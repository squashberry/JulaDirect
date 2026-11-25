/* JulaDirect gift card artwork: 35 designs drawn on canvas. Same code renders the live preview,
   the downloadable PNG and the print-ready file, so what you see is what you get. */
(function () {
  "use strict";
  const W = 1600, H = 1008, SANS = '"Inter","Segoe UI",system-ui,Arial,sans-serif', SERIF = 'Georgia,"Times New Roman",serif';
  const D = { // slug: bg stops, ink, palette, motif, layout, font
    "birthday-confetti": { bg: ["#fff1d0", "#ffd0e6"], ink: "#3b1d4f", pal: ["#ff4f81", "#ffb703", "#3a86ff", "#06d6a0", "#8338ec"], motif: "confetti", layout: "left" },
    "birthday-balloons": { bg: ["#bfe4ff", "#f4fbff"], ink: "#0f2c57", pal: ["#ff5d73", "#ffc233", "#47c2ff", "#7c5cff", "#2ecf8a"], motif: "balloons", layout: "left" },
    "birthday-gold": { bg: ["#1b1230", "#3b1d5e"], ink: "#fff3cf", pal: ["#ffd166", "#f4a300", "#fff3cf"], motif: "sparkle", layout: "center", dark: 1, serif: 1 },
    "love-bloom": { bg: ["#ffe3ea", "#ffc2d4"], ink: "#6b1236", pal: ["#e5486f", "#ff7a9c", "#ffb3c6", "#fff0f4"], motif: "bloom", layout: "left", serif: 1 },
    "love-hearts": { bg: ["#ff6b8b", "#c81d54"], ink: "#fff", pal: ["#ffffff", "#ffd1dd", "#ff9fb8"], motif: "hearts", layout: "left", dark: 1 },
    "anniv-noir": { bg: ["#0d0d12", "#25141c"], ink: "#f6e3c5", pal: ["#d9a54a", "#f2d49a", "#8d5a22"], motif: "lines", layout: "center", dark: 1, serif: 1 },
    "valentine-ruby": { bg: ["#7a0c2e", "#bf1f52"], ink: "#ffe9ee", pal: ["#ff9db5", "#ffd1dd", "#ff5c85"], motif: "hearts", layout: "center", dark: 1, serif: 1 },
    "valentine-blush": { bg: ["#fff5f6", "#ffdfe6"], ink: "#8a1c42", pal: ["#f4829f", "#ffb7c8", "#e24d78"], motif: "petals", layout: "center", serif: 1 },
    "xmas-snow": { bg: ["#0c2a52", "#1e5aa8"], ink: "#fff", pal: ["#ffffff", "#cfe6ff"], motif: "snow", layout: "left", dark: 1 },
    "xmas-tree": { bg: ["#0f4a33", "#157a52"], ink: "#fff8e6", pal: ["#ffd166", "#e63946", "#0a3324", "#fff"], motif: "tree", layout: "left", dark: 1 },
    "xmas-gold": { bg: ["#5e0b15", "#8f1625"], ink: "#ffe9b8", pal: ["#ffd166", "#f1a900", "#ffeeba"], motif: "sparkle", layout: "center", dark: 1, serif: 1 },
    "eid-lantern": { bg: ["#16103d", "#2b2a7a"], ink: "#fff3d1", pal: ["#ffc83d", "#ff9f1c", "#fff1b8"], motif: "lantern", layout: "left", dark: 1 },
    "eid-crescent": { bg: ["#06382f", "#0b5d4b"], ink: "#fbeec4", pal: ["#e9c46a", "#f4e1a1", "#c99a2e"], motif: "crescent", layout: "left", dark: 1, serif: 1 },
    "festive-kente": { bg: ["#fff3d9", "#ffe2a8"], ink: "#3a1c0c", pal: ["#d62828", "#f77f00", "#2a9d8f", "#264653", "#fcbf49"], motif: "weave", layout: "left" },
    "congrats-burst": { bg: ["#ff9f1c", "#ff4d6d"], ink: "#fff", pal: ["#ffffff", "#ffe29a", "#7ae7ff"], motif: "burst", layout: "left", dark: 1 },
    "congrats-laurel": { bg: ["#f6efe0", "#e8dcc0"], ink: "#33280f", pal: ["#b08a2e", "#cfae55", "#8a6a1c"], motif: "laurel", layout: "center", serif: 1 },
    "grad-cap": { bg: ["#102a6b", "#1f4cc5"], ink: "#fff", pal: ["#ffd166", "#ffffff", "#0a1a45"], motif: "cap", layout: "left", dark: 1 },
    "grad-scroll": { bg: ["#f4ead2", "#e6d7b2"], ink: "#2a1d0c", pal: ["#7a1f2b", "#b8902f", "#2a1d0c"], motif: "lines", layout: "center", serif: 1 },
    "thanks-petals": { bg: ["#f1fff4", "#d3f5e0"], ink: "#124a2e", pal: ["#52b788", "#95d5b2", "#2d6a4f", "#fff"], motif: "petals", layout: "left" },
    "thanks-warm": { bg: ["#ffd29d", "#ff8a65"], ink: "#4a1a07", pal: ["#fff2cc", "#ffc27a", "#e85d2c"], motif: "sun", layout: "left" },
    "wedding-ivory": { bg: ["#fffaf2", "#f1e6d2"], ink: "#4a3a1d", pal: ["#c7a45a", "#e6d3a3", "#fff"], motif: "lace", layout: "center", serif: 1 },
    "wedding-garden": { bg: ["#f7fff7", "#dff3e4"], ink: "#27493a", pal: ["#8fcf9f", "#e8a1b5", "#ffd9a0", "#fff"], motif: "bloom", layout: "center", serif: 1 },
    "baby-clouds": { bg: ["#d8f0ff", "#f9fcff"], ink: "#1d4766", pal: ["#ffffff", "#bde3ff", "#ffd6e5"], motif: "clouds", layout: "left" },
    "baby-stars": { bg: ["#ffe9f0", "#e6e1ff"], ink: "#43306b", pal: ["#ffd166", "#c9b6ff", "#ffb3cd"], motif: "stars", layout: "left" },
    "well-sunny": { bg: ["#fff4b8", "#ffd966"], ink: "#4a3500", pal: ["#ffb300", "#ff8f00", "#fff"], motif: "sun", layout: "left" },
    "well-calm": { bg: ["#c9f1ef", "#8fd3d9"], ink: "#0b3a45", pal: ["#ffffff", "#5bb8c2", "#2a8c9a"], motif: "waves", layout: "left" },
    "appreciate-ribbon": { bg: ["#efe7ff", "#d6c6ff"], ink: "#2b1a5c", pal: ["#7c4dff", "#b39cff", "#fff"], motif: "ribbon", layout: "left" },
    "appreciate-mosaic": { bg: ["#ffffff", "#f3f6ff"], ink: "#17254f", pal: ["#2f6bff", "#ff7a59", "#ffc233", "#18b999"], motif: "mosaic", layout: "left" },
    "justbecause-waves": { bg: ["#5b8cff", "#8f5bff"], ink: "#fff", pal: ["#ffffff", "#c3d4ff", "#ffd1f2"], motif: "waves", layout: "left", dark: 1 },
    "justbecause-pop": { bg: ["#ffe14d", "#ffc400"], ink: "#111", pal: ["#ff3d7f", "#2d6bff", "#111"], motif: "pop", layout: "left" },
    "corp-slate": { bg: ["#1c2430", "#2f3b4d"], ink: "#eef2f7", pal: ["#8fa3bd", "#5e738f", "#c8d3e2"], motif: "grid", layout: "left", dark: 1 },
    "corp-blue": { bg: ["#1450e6", "#0a2a85"], ink: "#fff", pal: ["#ffffff", "#8fb2ff", "#4f86ff"], motif: "grid", layout: "left", dark: 1 },
    "lux-obsidian": { bg: ["#050506", "#18181d"], ink: "#e9d8b0", pal: ["#c9a24e", "#8a6a28", "#f1dfae"], motif: "lines", layout: "center", dark: 1, serif: 1 },
    "lux-pearl": { bg: ["#fbfaf8", "#e8e4de"], ink: "#38342d", pal: ["#b7ad9a", "#d9d2c3", "#8c8575"], motif: "lines", layout: "center", serif: 1 },
    "min-paper": { bg: ["#ffffff", "#f6f7f9"], ink: "#111827", pal: ["#1450e6", "#d5dbe7"], motif: "paper", layout: "left" },
    "photo-custom": { bg: ["#1450e6", "#0a2a85"], ink: "#fff", pal: ["#ffffff"], motif: "photo", layout: "left", dark: 1 }
  };
  const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const seed = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  function shiftHex(hex, deg) {
    if (!deg || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    let r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let h = 0, s = 0;
    if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    h = (h + deg + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return "#" + [rr, gg, bb].map(v => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
  }
  const mixHex = (a, b, t) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");
  const hueOf = a => { const m = /^h(-?\d{1,3})$/.exec(a || ""); return m ? Number(m[1]) : 0; };
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  const heart = (c, x, y, s) => { c.beginPath(); c.moveTo(x, y + s * .3); c.bezierCurveTo(x, y - s * .2, x - s * .6, y - s * .2, x - s * .6, y + s * .25); c.bezierCurveTo(x - s * .6, y + s * .6, x - s * .1, y + s * .8, x, y + s); c.bezierCurveTo(x + s * .1, y + s * .8, x + s * .6, y + s * .6, x + s * .6, y + s * .25); c.bezierCurveTo(x + s * .6, y - s * .2, x, y - s * .2, x, y + s * .3); c.fill(); };
  const star = (c, x, y, r, n = 5, k = .45) => { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = Math.PI * i / n - Math.PI / 2, q = i % 2 ? r * k : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); c.fill(); };
  const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };

  const M = { // motif painters: (ctx, pal, rnd, extra)
    confetti(c, p, r) { for (let i = 0; i < 140; i++) { c.save(); c.translate(r() * W, r() * H); c.rotate(r() * 6); c.fillStyle = p[i % p.length]; c.globalAlpha = .75; if (i % 3) c.fillRect(0, 0, 14 + r() * 24, 8 + r() * 10); else circ(c, 0, 0, 6 + r() * 8); c.restore(); } },
    balloons(c, p, r) { for (let i = 0; i < 9; i++) { const x = 980 + i * 70 + r() * 40, y = 180 + r() * 480, s = 70 + r() * 50; c.strokeStyle = "rgba(15,44,87,.35)"; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y + s * 1.2); c.quadraticCurveTo(x - 30, y + s * 2.4, x + 10, H + 20); c.stroke(); c.fillStyle = p[i % p.length]; c.beginPath(); c.ellipse(x, y, s * .78, s, 0, 0, 7); c.fill(); c.fillStyle = "rgba(255,255,255,.35)"; c.beginPath(); c.ellipse(x - s * .28, y - s * .38, s * .14, s * .3, .5, 0, 7); c.fill(); c.fillStyle = p[i % p.length]; c.beginPath(); c.moveTo(x, y + s); c.lineTo(x - 12, y + s + 20); c.lineTo(x + 12, y + s + 20); c.fill(); } },
    sparkle(c, p, r) { for (let i = 0; i < 70; i++) { c.fillStyle = p[i % p.length]; c.globalAlpha = .25 + r() * .75; star(c, r() * W, r() * H, 6 + r() * 22, 4, .22); } c.globalAlpha = 1; },
    bloom(c, p, r) { [[1380, 160, 300], [1520, 560, 220], [1180, 900, 260], [120, 980, 180]].forEach(([x, y, s], k) => { for (let i = 0; i < 10; i++) { c.save(); c.translate(x, y); c.rotate(i * Math.PI / 5); c.fillStyle = p[(i + k) % (p.length - 1)]; c.globalAlpha = .55; c.beginPath(); c.ellipse(s * .42, 0, s * .42, s * .17, 0, 0, 7); c.fill(); c.restore(); } c.globalAlpha = 1; c.fillStyle = p[p.length - 1]; circ(c, x, y, s * .12); }); },
    hearts(c, p, r) { for (let i = 0; i < 46; i++) { c.fillStyle = p[i % p.length]; c.globalAlpha = .2 + r() * .55; heart(c, r() * W, r() * H, 24 + r() * 80); } c.globalAlpha = 1; },
    petals(c, p, r) { for (let i = 0; i < 48; i++) { c.save(); c.translate(r() * W, r() * H); c.rotate(r() * 6); c.fillStyle = p[i % p.length]; c.globalAlpha = .35 + r() * .45; c.beginPath(); c.ellipse(0, 0, 14 + r() * 24, 30 + r() * 40, 0, 0, 7); c.fill(); c.restore(); } },
    lines(c, p) { c.strokeStyle = p[0]; c.lineWidth = 3; c.globalAlpha = .9; rr(c, 44, 44, W - 88, H - 88, 26); c.stroke(); c.globalAlpha = .45; c.lineWidth = 1.5; rr(c, 66, 66, W - 132, H - 132, 18); c.stroke(); c.globalAlpha = .18; for (let i = 0; i < 18; i++) { c.beginPath(); c.moveTo(W - 700 + i * 22, 66); c.lineTo(W - 66, 560 - i * 22 + 40); c.stroke(); } c.globalAlpha = 1; },
    snow(c, p, r) { for (let i = 0; i < 120; i++) { c.fillStyle = "#fff"; c.globalAlpha = .25 + r() * .7; circ(c, r() * W, r() * H, 2 + r() * 7); } c.globalAlpha = 1; },
    tree(c, p, r) { for (let k = 0; k < 3; k++) { const x = 1180 + k * 190, y = 760 - k * 40, s = 1 - k * .12; c.fillStyle = "#0a3324"; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x, y - 300 * s + i * 70 * s); c.lineTo(x - (80 + i * 38) * s, y - 150 * s + i * 70 * s); c.lineTo(x + (80 + i * 38) * s, y - 150 * s + i * 70 * s); c.fill(); } c.fillStyle = p[0]; star(c, x, y - 320 * s, 26 * s); c.fillStyle = p[1]; for (let i = 0; i < 7; i++) circ(c, x + (r() - .5) * 150 * s, y - 220 * s + r() * 220 * s, 8); } c.fillStyle = "#fff"; for (let i = 0; i < 60; i++) { c.globalAlpha = .6; circ(c, r() * W, r() * H, 2 + r() * 4); } c.globalAlpha = 1; },
    lantern(c, p, r) { [[1240, 120, 1], [1420, 180, .8], [1090, 220, .7]].forEach(([x, y, s]) => { c.strokeStyle = p[0]; c.lineWidth = 3; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, y); c.stroke(); c.fillStyle = p[0]; rr(c, x - 26 * s, y, 52 * s, 20 * s, 8); c.fill(); c.fillStyle = p[1]; c.globalAlpha = .92; c.beginPath(); c.moveTo(x - 26 * s, y + 20 * s); c.quadraticCurveTo(x - 80 * s, y + 130 * s, x - 26 * s, y + 250 * s); c.lineTo(x + 26 * s, y + 250 * s); c.quadraticCurveTo(x + 80 * s, y + 130 * s, x + 26 * s, y + 20 * s); c.fill(); c.globalAlpha = 1; c.fillStyle = p[2]; c.globalAlpha = .55; c.beginPath(); c.ellipse(x, y + 135 * s, 20 * s, 70 * s, 0, 0, 7); c.fill(); c.globalAlpha = 1; c.fillStyle = p[0]; rr(c, x - 26 * s, y + 250 * s, 52 * s, 16 * s, 6); c.fill(); }); for (let i = 0; i < 40; i++) { c.fillStyle = p[2]; c.globalAlpha = .3 + r() * .5; star(c, r() * W, r() * H, 3 + r() * 8, 4, .3); } c.globalAlpha = 1; },
    crescent(c, p, r, bgc) { c.fillStyle = p[0]; c.beginPath(); c.arc(1260, 330, 210, 0, 7); c.fill(); c.fillStyle = bgc; c.beginPath(); c.arc(1340, 290, 185, 0, 7); c.fill(); c.fillStyle = p[1]; star(c, 1340, 360, 46, 5, .42); for (let i = 0; i < 40; i++) { c.fillStyle = p[1]; c.globalAlpha = .25 + r() * .5; star(c, r() * W, r() * H, 4 + r() * 9, 4, .3); } c.globalAlpha = 1; c.strokeStyle = p[0]; c.globalAlpha = .35; c.lineWidth = 2; for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(W - 80, H - 80, 90 + i * 55, Math.PI, Math.PI * 1.5); c.stroke(); } c.globalAlpha = 1; },
    weave(c, p) { const bands = [p[0], p[4], p[2], p[3], p[1]]; for (let i = 0; i < 10; i++) { c.fillStyle = bands[i % bands.length]; c.fillRect(0, H - 150 + (i % 5) * 0, 0, 0); } c.save(); c.globalAlpha = .95; for (let row = 0; row < 3; row++) for (let i = 0; i < 40; i++) { c.fillStyle = [p[0], p[4], p[2], p[3]][(i + row) % 4]; c.fillRect(i * 44, H - 130 + row * 44 + ((i % 2) ? 0 : 0), 44, 44); if ((i + row) % 3 === 0) { c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(i * 44 + 14, H - 130 + row * 44 + 14, 16, 16); } } c.restore(); c.fillStyle = p[3]; c.fillRect(0, 0, W, 34); for (let i = 0; i < 40; i++) { c.fillStyle = [p[0], p[4], p[2]][i % 3]; c.fillRect(i * 44, 0, 44, 20); } },
    burst(c, p) { c.save(); c.translate(1200, 400); for (let i = 0; i < 24; i++) { c.rotate(Math.PI / 12); c.fillStyle = i % 2 ? "rgba(255,255,255,.17)" : "rgba(255,255,255,.07)"; c.beginPath(); c.moveTo(0, 0); c.lineTo(1100, -60); c.lineTo(1100, 60); c.fill(); } c.restore(); c.fillStyle = p[0]; star(c, 1220, 420, 150, 12, .6); c.fillStyle = p[1]; star(c, 1220, 420, 100, 12, .6); c.fillStyle = p[2]; star(c, 1220, 420, 46, 8, .5); },
    laurel(c, p) { [-1, 1].forEach(s => { for (let i = 0; i < 14; i++) { c.save(); c.translate(1200 + s * (92 - Math.abs(i - 7) * 4), 740 - i * 36); c.rotate(s * (-.55 + i * .06)); c.fillStyle = p[i % 2]; c.globalAlpha = .9; c.beginPath(); c.ellipse(s * 30, 0, 46, 15, s * .4, 0, 7); c.fill(); c.restore(); } }); c.globalAlpha = 1; c.fillStyle = p[0]; star(c, 1200, 420, 54, 5); c.strokeStyle = p[0]; c.lineWidth = 2; c.globalAlpha = .5; rr(c, 48, 48, W - 96, H - 96, 20); c.stroke(); c.globalAlpha = 1; },
    cap(c, p) { c.save(); c.translate(1220, 380); c.fillStyle = p[2]; c.beginPath(); c.moveTo(-230, 0); c.lineTo(0, -100); c.lineTo(230, 0); c.lineTo(0, 100); c.closePath(); c.fill(); c.fillStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.moveTo(0, -100); c.lineTo(230, 0); c.lineTo(0, 100); c.fill(); c.fillStyle = p[2]; c.fillRect(-120, 40, 240, 90); c.fillStyle = p[0]; c.fillRect(190, 0, 8, 150); circ(c, 194, 160, 18); c.restore(); c.fillStyle = p[1]; for (let i = 0; i < 30; i++) { c.globalAlpha = .3; star(c, (i * 337) % W, (i * 211) % H, 6 + (i % 5) * 3, 4, .3); } c.globalAlpha = 1; },
    lace(c, p) { c.strokeStyle = p[0]; c.lineWidth = 2; c.globalAlpha = .6; for (let y = 60; y < H; y += 54) for (let x = (y / 54 % 2) * 27 + 30; x < W; x += 54) { if (x < 150 || x > W - 150 || y < 150 || y > H - 150) { c.beginPath(); c.arc(x, y, 20, 0, 7); c.stroke(); circ(c, x, y, 3); } } c.globalAlpha = 1; c.lineWidth = 3; rr(c, 120, 120, W - 240, H - 240, 30); c.stroke(); },
    clouds(c, p, r) { for (let i = 0; i < 9; i++) { const x = r() * W, y = 100 + r() * 800, s = 60 + r() * 70; c.fillStyle = p[i % 2]; c.globalAlpha = .85; [[0, 0, 1], [-s * .8, s * .25, .75], [s * .8, s * .25, .8], [s * .3, s * .4, .7]].forEach(([dx, dy, k]) => circ(c, x + dx, y + dy, s * k)); } c.globalAlpha = 1; c.fillStyle = p[2]; for (let i = 0; i < 12; i++) { c.globalAlpha = .6; heart(c, r() * W, r() * H, 18 + r() * 20); } c.globalAlpha = 1; },
    stars(c, p, r, bgc) { for (let i = 0; i < 70; i++) { c.fillStyle = p[i % p.length]; c.globalAlpha = .35 + r() * .6; star(c, r() * W, r() * H, 8 + r() * 30); } c.globalAlpha = 1; c.fillStyle = p[0]; c.beginPath(); c.arc(1300, 280, 150, 0, 7); c.fill(); c.fillStyle = bgc; c.beginPath(); c.arc(1360, 250, 130, 0, 7); c.fill(); },
    sun(c, p) { const g = c.createRadialGradient(1280, 300, 20, 1280, 300, 700); g.addColorStop(0, p[0]); g.addColorStop(.35, p[1] + "99"); g.addColorStop(1, "transparent"); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = p[0]; circ(c, 1280, 300, 120); c.strokeStyle = p[0]; c.lineWidth = 12; c.lineCap = "round"; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; c.beginPath(); c.moveTo(1280 + Math.cos(a) * 160, 300 + Math.sin(a) * 160); c.lineTo(1280 + Math.cos(a) * (210 + (i % 2) * 40), 300 + Math.sin(a) * (210 + (i % 2) * 40)); c.stroke(); } c.fillStyle = p[2]; c.globalAlpha = .35; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 40) c.lineTo(x, H - 80 - Math.sin(x / 120) * 30); c.lineTo(W, H); c.fill(); c.globalAlpha = 1; },
    waves(c, p) { for (let k = 0; k < 6; k++) { c.fillStyle = p[k % p.length]; c.globalAlpha = .22; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 20) c.lineTo(x, 560 + k * 70 + Math.sin(x / 130 + k * 1.3) * 42); c.lineTo(W, H); c.fill(); } c.globalAlpha = 1; },
    ribbon(c, p) { c.fillStyle = p[0]; c.fillRect(1160, 0, 90, H); c.fillRect(0, 740, W, 90); c.fillStyle = "rgba(255,255,255,.2)"; c.fillRect(1160, 0, 24, H); c.fillRect(0, 740, W, 24); c.fillStyle = p[0]; [[-1, 1], [1, 1]].forEach(([s]) => { c.save(); c.translate(1205, 785); c.rotate(s * .5); c.beginPath(); c.ellipse(s * 90, -40, 100, 54, 0, 0, 7); c.fill(); c.restore(); }); c.fillStyle = p[1]; circ(c, 1205, 785, 38); },
    mosaic(c, p, r) { const s = 64; for (let y = 0; y < H / s; y++) for (let x = 0; x < W / s; x++) { if (x * s < 920 && y * s > 120 && y * s < 880) continue; if (r() < .55) { c.fillStyle = p[(x + y) % p.length]; c.globalAlpha = .55 + r() * .4; if ((x + y) % 2) c.fillRect(x * s + 4, y * s + 4, s - 8, s - 8); else { c.beginPath(); c.moveTo(x * s + 4, y * s + s - 4); c.lineTo(x * s + s - 4, y * s + s - 4); c.lineTo(x * s + s - 4, y * s + 4); c.fill(); } } } c.globalAlpha = 1; },
    pop(c, p) { c.fillStyle = p[0]; for (let y = 0; y < 14; y++) for (let x = 0; x < 12; x++) circ(c, 940 + x * 56 + (y % 2) * 28, 40 + y * 70, 4 + (13 - y) * 1.4 + x * .3); c.fillStyle = p[1]; circ(c, 1360, 740, 120); c.fillStyle = p[2]; c.font = "900 150px " + SANS; c.textAlign = "center"; c.fillText("!", 1360, 790); c.textAlign = "left"; },
    grid(c, p) { c.strokeStyle = p[0]; c.globalAlpha = .18; c.lineWidth = 1.5; for (let x = 0; x < W; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (let y = 0; y < H; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } c.globalAlpha = .9; c.fillStyle = p[2]; [[1240, 260, 150], [1380, 420, 90], [1120, 470, 60]].forEach(([x, y, s]) => { c.globalAlpha = .12; rr(c, x - s, y - s, s * 2, s * 2, s * .3); c.fill(); }); c.globalAlpha = 1; },
    paper(c, p) { c.strokeStyle = p[1]; c.lineWidth = 2; rr(c, 40, 40, W - 80, H - 80, 24); c.stroke(); c.fillStyle = p[0]; c.fillRect(110, 118, 80, 8); },
    photo(c) { }
  };

  function drawBag(c, x, y, s, col) { c.save(); c.translate(x, y); c.scale(s / 32, s / 32); c.fillStyle = col; rr(c, 0, 0, 32, 32, 10); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.moveTo(10, 12.5); c.lineTo(22, 12.5); c.lineTo(21, 22.5); c.quadraticCurveTo(20.8, 24.3, 19, 24.3); c.lineTo(13, 24.3); c.quadraticCurveTo(11.2, 24.3, 11, 22.5); c.closePath(); c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 1.8; c.lineCap = "round"; c.beginPath(); c.arc(16, 11, 3.2, Math.PI, 0); c.stroke(); c.restore(); }
  function wrap(c, text, maxW, maxLines) { const words = String(text).split(/\s+/), lines = []; let cur = ""; for (const w of words) { const t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s?\S*$/, "") + "…"; } return lines; }
  const money = n => "D" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

  function drawQR(c, url, x, y, size, ink) {
    let m; try { m = window.GiftQR.matrix(url); } catch (e) { return; } const n = m.length, q = 3, cell = size / (n + q * 2);
    c.fillStyle = "#fff"; rr(c, x, y, size, size, 18); c.fill(); c.fillStyle = ink || "#0a1a3f";
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (m[j][i]) c.fillRect(x + (i + q) * cell, y + (j + q) * cell, cell + .6, cell + .6);
  }

  /* opts: {slug, hue, recipient, sender, message, amount, program, qrUrl, side, image, width, bleed, codeHint} */
  function render(canvas, o) {
    const def = D[o.slug] || D["min-paper"], bleed = o.bleed || 0, w = o.width || 1600, k = w / W, pad = bleed * k;
    const cw = Math.round(w + pad * 2), ch = Math.round(H * k + pad * 2); canvas.width = cw; canvas.height = ch;
    const c = canvas.getContext("2d"), hue = o.hue || 0, hx = col => shiftHex(col, hue);
    c.save(); c.translate(pad, pad); c.scale(k, k);
    // bleed area: paint background beyond trim
    c.save(); if (bleed) c.translate(0, 0);
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, hx(def.bg[0])); g.addColorStop(1, mixHex(hx(def.bg[0]), hx(def.bg[1]), .6));
    c.fillStyle = g; c.fillRect(-bleed, -bleed, W + bleed * 2, H + bleed * 2);
    c.beginPath(); c.rect(0, 0, W, H); c.clip();
    const pal = def.pal.map(hx), rnd = mulberry(seed(o.slug || "x")), ink = hx(def.ink);
    if (def.motif === "photo" && o.image) {
      const im = o.image, s = Math.max(W / im.width, H / im.height), iw = im.width * s, ih = im.height * s; c.drawImage(im, (W - iw) / 2, (H - ih) / 2, iw, ih);
      const sh = c.createLinearGradient(0, 0, W * .8, 0); sh.addColorStop(0, "rgba(5,10,30,.82)"); sh.addColorStop(1, "rgba(5,10,30,.1)"); c.fillStyle = sh; c.fillRect(0, 0, W, H);
    } else (M[def.motif] || M.paper)(c, pal, rnd, hx(def.bg[1]));
    const front = o.side !== "back", dark = !!def.dark, center = def.layout === "center", ax = center ? W / 2 : 110; c.textAlign = center ? "center" : "left"; c.textBaseline = "alphabetic";
    const label = o.program === "restaurant" ? "RESTAURANT GIFT CARD" : "MARKETPLACE GIFT CARD";
    // brand row
    drawBag(c, center ? W / 2 - 150 : 110, 100, 52, hx(dark ? "#2f6bff" : "#1450e6"));
    c.fillStyle = ink; c.font = "800 40px " + SANS; c.textAlign = "left"; c.fillText("JulaDirect", (center ? W / 2 - 150 : 110) + 66, 140); c.textAlign = center ? "center" : "left";
    c.font = "700 22px " + SANS; c.globalAlpha = .75; c.fillText(label, ax, 200); c.globalAlpha = 1;
    if (front) {
      c.fillStyle = ink; c.font = (def.serif ? "700 190px " + SERIF : "800 200px " + SANS); const amt = money(o.amount || 0);
      while (c.measureText(amt).width > (center ? 1100 : 880) && c.font.indexOf("px") > 0) c.font = c.font.replace(/(\d+)px/, (_, n) => (n - 8) + "px");
      c.fillText(amt, ax, center ? 440 : 430);
      let y = center ? 520 : 515;
      if (o.recipient) { c.font = (def.serif ? "italic 400 52px " : "600 50px ") + (def.serif ? SERIF : SANS); c.fillText("For " + o.recipient, ax, y); y += 64; }
      if (o.message) { c.font = (def.serif ? "italic 400 36px " + SERIF : "500 35px " + SANS); c.globalAlpha = .92; wrap(c, o.message, center ? 1000 : 860, 4).forEach(l => { c.fillText(l, ax, y); y += 50; }); c.globalAlpha = 1; }
      if (o.sender) { c.font = "700 32px " + SANS; c.globalAlpha = .85; c.fillText("With love, " + o.sender, ax, Math.min(y + 24, H - 90)); c.globalAlpha = 1; }
      // QR
      if (o.qrUrl) { const qs = 190; drawQR(c, o.qrUrl, W - qs - 90, H - qs - 80, qs, "#0a1a3f"); c.textAlign = "center"; c.font = "700 18px " + SANS; c.fillStyle = ink; c.globalAlpha = .8; c.fillText("SCAN TO OPEN", W - qs / 2 - 90, H - 48); c.globalAlpha = 1; }
    } else {
      c.fillStyle = ink; c.textAlign = "left"; c.font = "800 52px " + SANS; c.fillText(o.program === "restaurant" ? "Use at any participating restaurant" : "Use on JulaDirect", 110, 330);
      c.font = "500 30px " + SANS; c.globalAlpha = .9;
      const lines = o.program === "restaurant"
        ? ["1. Show this card or scan the QR code at the restaurant.", "2. Give the staff your 6-digit PIN to approve the amount.", "3. Use your balance across several visits and restaurants.", "Balance and history: juladirect.pages.dev/gift"]
        : ["1. Scan the QR code to open your gift and see your balance.", "2. Sign in to JulaDirect to manage your card.", "3. Keep your PIN private. JulaDirect will never ask for it.", "Balance and history: juladirect.pages.dev/gift"];
      lines.forEach((l, i) => c.fillText(l, 110, 410 + i * 56)); c.globalAlpha = 1;
      if (o.qrUrl) drawQR(c, o.qrUrl, W - 330, H - 330, 230, "#0a1a3f");
      c.font = "600 24px " + SANS; c.globalAlpha = .7; if (o.codeHint) c.fillText("Card " + o.codeHint, 110, H - 90); c.globalAlpha = 1;
    }
    c.restore(); c.restore();
    return canvas;
  }
  const catalog = () => Object.keys(D);
  window.GiftArt = { render, def: D, catalog, W, H, money, hueOf, shiftHex };
})();
