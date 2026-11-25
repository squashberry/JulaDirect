/* Minimal QR Code encoder (byte mode, error correction M, versions 1-10). Returns a boolean[][] matrix. */
(function () {
  "use strict";
  // [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] for level M
  const EC = [null, [10,1,16,0,0],[16,1,28,0,0],[26,1,44,0,0],[18,2,32,0,0],[24,2,43,0,0],[16,4,27,0,0],[18,4,31,0,0],[22,2,38,2,39],[22,3,36,2,37],[26,4,43,1,44]];
  const ALIGN = [null, [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50]];
  const mul = (a, b) => { let r = 0; for (let i = 7; i >= 0; i--) { r = (r << 1) ^ ((r >>> 7) * 0x11D); r ^= ((b >>> i) & 1) * a; } return r & 255; };
  const divisor = d => { const r = new Array(d).fill(0); r[d - 1] = 1; let root = 1; for (let i = 0; i < d; i++) { for (let j = 0; j < d; j++) { r[j] = mul(r[j], root); if (j + 1 < d) r[j] ^= r[j + 1]; } root = mul(root, 2); } return r; };
  const remainder = (data, div) => { const r = new Array(div.length).fill(0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f); }); } return r; };
  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 0;
    for (let v = 1; v <= 10; v++) { const e = EC[v], cap = e[1] * e[2] + e[3] * e[4]; if (bytes.length + (v < 10 ? 2 : 3) <= cap) { ver = v; break; } }
    if (!ver) throw new Error("QR payload too long");
    const e = EC[ver], capBits = (e[1] * e[2] + e[3] * e[4]) * 8, bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, capBits - bits.length)); while (bits.length % 8) bits.push(0);
    for (let p = 0xEC; bits.length < capBits; p ^= 0xEC ^ 0x11) put(p, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    const blocks = [], div = divisor(e[0]); let k = 0;
    for (let b = 0; b < e[1] + e[3]; b++) { const len = b < e[1] ? e[2] : e[4]; const d = data.slice(k, k + len); k += len; blocks.push({ d, ec: remainder(d, div) }); }
    const out = [], maxLen = Math.max(e[2], e[4]);
    for (let i = 0; i < maxLen; i++) blocks.forEach(b => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < e[0]; i++) blocks.forEach(b => out.push(b.ec[i]));
    return { ver, codewords: out };
  }
  function build(text) {
    const { ver, codewords } = encode(text), size = ver * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < size && y < size) { m[y][x] = c; fn[y][x] = true; } };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = ALIGN[ver], n = ap.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    const fmt = mask => {
      const d = mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const bits = ((d << 10) | r) ^ 0x5412, bit = i => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i)); set(8, size - 8, true);
    };
    fmt(0);
    if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const bits = (ver << 12) | r; for (let i = 0; i < 18; i++) { const c = ((bits >>> i) & 1) !== 0, a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, c); set(b, a, c); } }
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert; if (!fn[y][x] && i < codewords.length * 8) { m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; } } }
    const maskFn = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0, (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
    const apply = k => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[k](x, y)) m[y][x] = !m[y][x]; };
    const penalty = () => {
      let p = 0;
      for (let pass = 0; pass < 2; pass++) for (let a = 0; a < size; a++) { let run = 1; for (let b = 1; b < size; b++) { const c = pass ? m[b][a] : m[a][b], pr = pass ? m[b - 1][a] : m[a][b - 1]; if (c === pr) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
      let dark = 0; m.forEach(r => r.forEach(c => { if (c) dark++; })); p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let k = 0; k < 8; k++) { apply(k); fmt(k); const p = penalty(); if (p < bestP) { bestP = p; best = k; } apply(k); }
    apply(best); fmt(best);
    return m;
  }
  window.GiftQR = { matrix: build };
})();
