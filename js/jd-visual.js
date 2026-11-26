/* JulaDirect visual search: a jelly panel that drops out of the search bar's camera button.
   Flow: pick (camera / upload / drop / paste) → crop → search.
   The matching itself is a hook: the cropped photo is announced with a `jd:visual-search` event
   (detail: { blob, dataUrl, colors, hint, form }). Until a matcher is attached, the buyer can add a word
   and we run the normal text search with it. Nothing is uploaded by this file. */
(function () {
  "use strict";
  if (window.JD && window.JD.visual) return;
  var JD = window.JD || (window.JD = {});
  var base = (document.currentScript && document.currentScript.src || "").replace(/js\/jd-visual\.js.*$/, "");
  var link = document.createElement("link");
  link.rel = "stylesheet"; link.href = base + "css/jd-visual.css"; document.head.appendChild(link);

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var phone = window.matchMedia("(max-width: 820px)");
  var MAX_SIDE = 1280, OUT_SIDE = 1024, MAX_BYTES = 20 * 1024 * 1024;
  var S = null; /* open session */

  var I = {
    cam: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z"/><circle cx="12" cy="13" r="3.4"/></svg>',
    img: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 3.5 3 3-2.5L20 16"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    rot: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/></svg>',
    flip: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a8 8 0 0 1 14-3l2 2"/><path d="M20 4v4h-4"/><path d="M20 15a8 8 0 0 1-14 3l-2-2"/><path d="M4 20v-4h4"/></svg>',
    retake: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    spark: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/><path d="M11 8.5v5M8.5 11h5"/></svg>'
  };

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function toast(m) { if (JD.toast) JD.toast(m); }

  /* ---------- panel shell ---------- */
  function build(form) {
    var root = el("div", "vs");
    root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Search by image");
    root.innerHTML =
      '<span class="vs__neck" aria-hidden="true"></span>' +
      '<div class="vs__card">' +
      '<div class="vs__head"><b>Search by image</b><button type="button" class="vs__x" data-vs="close" aria-label="Close">' + I.x + '</button></div>' +
      '<div class="vs__views">' +
      /* pick */
      '<section class="vs__view" data-view="pick">' +
      '<div class="vs__drop" data-vs="drop"><div class="vs__orb" aria-hidden="true"><i></i><i></i>' + I.img + '</div>' +
      '<strong>Show us what you are looking for</strong><span>Drop a photo here, paste one, or pick a way below.</span></div>' +
      '<div class="vs__row"><button type="button" class="vs__btn vs__btn--p" data-vs="camera">' + I.cam + '<span>Take a photo</span></button>' +
      '<button type="button" class="vs__btn" data-vs="upload">' + I.img + '<span>Upload</span></button></div>' +
      '<p class="vs__tip">Tip: a clear photo of one item on a plain background finds the best matches.</p>' +
      '</section>' +
      /* camera */
      '<section class="vs__view" data-view="cam" hidden>' +
      '<div class="vs__cam"><video playsinline muted autoplay></video><i class="vs__c vs__c--tl"></i><i class="vs__c vs__c--tr"></i><i class="vs__c vs__c--bl"></i><i class="vs__c vs__c--br"></i><div class="vs__flash"></div></div>' +
      '<div class="vs__shutterbar"><button type="button" class="vs__round" data-vs="gallery" aria-label="Choose from gallery">' + I.img + '</button>' +
      '<button type="button" class="vs__shutter" data-vs="snap" aria-label="Take photo"><i></i></button>' +
      '<button type="button" class="vs__round" data-vs="flip" aria-label="Switch camera">' + I.flip + '</button></div>' +
      '</section>' +
      /* crop */
      '<section class="vs__view" data-view="crop" hidden>' +
      '<div class="vs__stagewrap"><div class="vs__stage"><img alt="Your photo" draggable="false"><div class="vs__crop" tabindex="0" aria-label="Crop area. Drag to move, drag the corners to resize.">' +
      '<i class="vs__h" data-h="tl"></i><i class="vs__h" data-h="tr"></i><i class="vs__h" data-h="bl"></i><i class="vs__h" data-h="br"></i><b class="vs__grid"></b></div><div class="vs__scan" aria-hidden="true"></div></div></div>' +
      '<div class="vs__tools"><button type="button" class="vs__chip" data-vs="retake">' + I.retake + 'Retake</button><button type="button" class="vs__chip" data-vs="rotate">' + I.rot + 'Rotate</button><button type="button" class="vs__chip" data-vs="reset">Reset crop</button><button type="button" class="vs__chip vs__chip--x" data-vs="remove" hidden>Clear image search</button></div>' +
      '<div class="vs__colors" aria-label="Colours found in the selection"></div>' +
      '<label class="vs__hint"><span>What is it? <small>(optional, helps us search)</small></span><input type="text" inputmode="search" enterkeyhint="search" placeholder="e.g. sneakers, phone, blender" maxlength="60"></label>' +
      '<p class="vs__note" role="status" aria-live="polite" hidden></p>' +
      '<button type="button" class="vs__btn vs__btn--p vs__go" data-vs="go">' + I.spark + '<span>Search with this photo</span></button>' +
      '</section>' +
      '</div></div>' +
      '<input type="file" accept="image/*" hidden data-vs-file><input type="file" accept="image/*" capture="environment" hidden data-vs-capture>';
    return root;
  }

  /* ---------- placement ---------- */
  function place() {
    if (!S) return;
    var f = S.form.getBoundingClientRect(), cam = S.form.querySelector(".sx-cam"), c = cam ? cam.getBoundingClientRect() : f;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight, w, left;
    if (phone.matches) { w = vw - 24; left = 12; }
    else { w = Math.min(480, vw - 24); left = clamp(f.right - w, 12, vw - w - 12); }
    var top = Math.max(8, f.bottom + 12);
    var s = S.root.style;
    s.left = left + "px"; s.width = w + "px"; s.top = top + "px";
    s.maxHeight = Math.max(260, vh - top - (phone.matches ? 92 : 16)) + "px";
    s.setProperty("--nx", clamp(c.left + c.width / 2 - left, 30, w - 30) + "px");
    var vh2 = Math.max(160, Math.min(vh * (phone.matches ? 0.42 : 0.4), 340));
    s.setProperty("--stage-h", vh2 + "px");
  }
  var raf = 0;
  function schedule() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; place(); }); }

  /* ---------- open / close ---------- */
  function open(form) {
    if (S) { if (S.form === form) return close(); close(true); }
    var root = build(form);
    document.body.appendChild(root);
    S = { form: form, root: root, state: "pick", stream: null, facing: "environment", canvas: null, crop: null, colors: [], prevFocus: document.activeElement };
    form.classList.add("vs-on");
    var cam = form.querySelector(".sx-cam"); if (cam) { cam.setAttribute("aria-expanded", "true"); jelly(cam); }
    var q = form.querySelector('input[name="q"], input[type="search"], input'); if (q) q.blur();
    place();
    show("pick", true);
    root.classList.add("is-in");
    var bd = el("div", "vs-backdrop"); document.body.appendChild(bd); S.bd = bd;
    requestAnimationFrame(function () { bd.classList.add("is-on"); });
    document.body.classList.add("vs-open");
    if (!reduce && root.animate) {
      var card = root.querySelector(".vs__card"), kids = card ? [].slice.call(card.querySelectorAll(".vs__head, .vs__view:not([hidden]) > *")) : [];
      /* a drop of jelly leaves the camera, stretches, then the panel wobbles out of it */
      var drip = el("i", "vs__drip"); root.appendChild(drip);
      drip.animate([
        { transform: "translate(-50%,-46px) scale(.5)", opacity: 0, offset: 0 },
        { transform: "translate(-50%,-18px) scale(.9,1.5)", opacity: 1, offset: .35 },
        { transform: "translate(-50%,10px) scale(1.5,.7)", opacity: 1, offset: .7 },
        { transform: "translate(-50%,24px) scale(3.4,.2)", opacity: 0, offset: 1 }
      ], { duration: 420, easing: "ease-in", fill: "forwards" }).onfinish = function () { drip.remove(); };
      root.animate([
        { transform: "translateY(-22px) scale(.04,.02)", opacity: 0, offset: 0 },
        { transform: "translateY(-6px) scale(.5,.55)", opacity: 1, offset: .16 },
        { transform: "scale(.82,1.2) skewX(-2deg)", offset: .32 },
        { transform: "scale(1.1,.88) skewX(2deg)", offset: .5 },
        { transform: "scale(.96,1.06) skewX(-1deg)", offset: .66 },
        { transform: "scale(1.03,.98)", offset: .8 },
        { transform: "scale(.992,1.006)", offset: .91 },
        { transform: "none", opacity: 1, offset: 1 }
      ], { duration: 980, easing: "cubic-bezier(.25,.6,.35,1)", delay: 120, fill: "backwards" });
      kids.forEach(function (k, i) { if (k.animate) k.animate([{ opacity: 0, transform: "translateY(10px) scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 380 + i * 55, easing: "cubic-bezier(.2,.9,.3,1.3)", fill: "backwards" }); });
    }
    bindSession();
    var rec = form.classList.contains("sx-hasvs") && saved();
    if (rec) restore(rec);
    setTimeout(function () { var b = root.querySelector('[data-vs="camera"]'); if (b) b.focus({ preventScroll: true }); }, 380);
  }

  function jelly(node) {
    if (reduce || !node.animate) return;
    node.animate([{ transform: "scale(1)" }, { transform: "scale(.78,1.2)" }, { transform: "scale(1.18,.86)" }, { transform: "scale(.96,1.04)" }, { transform: "scale(1)" }], { duration: 520, easing: "ease-out" });
  }

  function close(instant) {
    var s = S; if (!s) return; S = null;
    stopStream(s);
    s.unbind && s.unbind();
    s.form.classList.remove("vs-on"); document.body.classList.remove("vs-open");
    if (s.bd) { var bdn = s.bd; bdn.classList.remove("is-on"); setTimeout(function () { bdn.remove(); }, 260); }
    var cam = s.form.querySelector(".sx-cam"); if (cam) cam.setAttribute("aria-expanded", "false");
    var done = function () { if (s.root.parentNode) s.root.parentNode.removeChild(s.root); };
    if (instant || reduce || !s.root.animate) done();
    else {
      var a = s.root.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.02,.96)", opacity: 1, offset: .25 }, { transform: "scale(.8,.04)", opacity: 0 }], { duration: 300, easing: "cubic-bezier(.5,0,.8,.4)", fill: "forwards" });
      a.onfinish = done; setTimeout(done, 450);
    }
    try { if (s.prevFocus && s.prevFocus.focus && !instant) s.prevFocus.focus({ preventScroll: true }); } catch (e) {}
  }

  /* ---------- views ---------- */
  function show(name, quiet) {
    S.state = name;
    S.root.setAttribute("data-state", name);
    [].forEach.call(S.root.querySelectorAll(".vs__view"), function (v) { v.hidden = v.getAttribute("data-view") !== name; });
    if (name !== "cam") stopStream(S);
    var v = S.root.querySelector('[data-view="' + name + '"]');
    if (!quiet && !reduce && v && v.animate) v.animate([{ opacity: 0, transform: "translateY(8px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
    S.root.querySelector(".vs__head b").textContent = name === "cam" ? "Take a photo" : name === "crop" ? "Frame your item" : "Search by image";
    schedule();
  }

  function stopStream(s) { if (s && s.stream) { s.stream.getTracks().forEach(function (t) { t.stop(); }); s.stream = null; } }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return fallbackCapture();
    show("cam");
    var video = S.root.querySelector("video");
    try {
      stopStream(S);
      var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: S.facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      if (!S) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      S.stream = stream; video.srcObject = stream;
      video.classList.toggle("is-front", S.facing === "user");
      await video.play().catch(function () {});
    } catch (e) {
      if (!S) return;
      show("pick");
      toast(e && e.name === "NotAllowedError" ? "Camera is blocked. Allow it in your browser, or upload a photo." : "We couldn't open the camera. Choose a photo instead.");
      fallbackCapture(true);
    }
  }
  function fallbackCapture(skip) { var i = S.root.querySelector("[data-vs-capture]"); if (!skip) i.click(); }

  function snap() {
    var video = S.root.querySelector("video");
    if (!video.videoWidth) return;
    var k = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    var c = document.createElement("canvas"); c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
    var x = c.getContext("2d");
    if (S.facing === "user") { x.translate(c.width, 0); x.scale(-1, 1); }
    x.drawImage(video, 0, 0, c.width, c.height);
    var fl = S.root.querySelector(".vs__flash");
    if (fl && fl.animate && !reduce) fl.animate([{ opacity: .9 }, { opacity: 0 }], { duration: 380, easing: "ease-out" });
    setTimeout(function () { if (S) useCanvas(c); }, reduce ? 0 : 160);
  }

  async function useFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast("That file isn't an image."); return; }
    if (file.size > MAX_BYTES) { toast("That photo is too large. Pick one under 20 MB."); return; }
    try {
      var bmp;
      if (window.createImageBitmap) { try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { bmp = null; } }
      if (!bmp) bmp = await new Promise(function (res, rej) { var im = new Image(), u = URL.createObjectURL(file); im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
      var w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, MAX_SIDE / Math.max(w, h));
      var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      if (S) useCanvas(c);
    } catch (e) { toast("We couldn't read that photo. Try another one."); }
  }

  /* ---------- crop ---------- */
  function useCanvas(c) {
    S.canvas = c; S.crop = { x: .08, y: .08, w: .84, h: .84 };
    var img = S.root.querySelector(".vs__stage img");
    img.onload = function () { paintCrop(); computeColors(); };
    img.src = c.toDataURL("image/jpeg", .9);
    S.root.querySelector(".vs__note").hidden = true;
    S.root.querySelector(".vs__stage").classList.remove("is-scanning");
    show("crop");
    img.style.maxHeight = "var(--stage-h)";
  }

  function paintCrop() {
    var b = S.root.querySelector(".vs__crop"), c = S.crop;
    b.style.left = c.x * 100 + "%"; b.style.top = c.y * 100 + "%"; b.style.width = c.w * 100 + "%"; b.style.height = c.h * 100 + "%";
  }

  function bindCrop() {
    var stage = S.root.querySelector(".vs__stage"), box = S.root.querySelector(".vs__crop"), drag = null, MIN = 0.12;
    function pt(e) { var r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
    box.addEventListener("pointerdown", function (e) {
      if (!S || S.state !== "crop") return;
      var h = e.target.getAttribute && e.target.getAttribute("data-h");
      drag = { h: h || "move", start: pt(e), c: Object.assign({}, S.crop) };
      box.setPointerCapture(e.pointerId); box.classList.add("is-drag"); e.preventDefault();
    });
    box.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var p = pt(e), dx = p.x - drag.start.x, dy = p.y - drag.start.y, c = drag.c, n = Object.assign({}, c);
      if (drag.h === "move") { n.x = clamp(c.x + dx, 0, 1 - c.w); n.y = clamp(c.y + dy, 0, 1 - c.h); }
      else {
        var l = c.x, t = c.y, r = c.x + c.w, bt = c.y + c.h;
        if (/l/.test(drag.h)) l = clamp(c.x + dx, 0, r - MIN);
        if (/r/.test(drag.h)) r = clamp(c.x + c.w + dx, l + MIN, 1);
        if (/t/.test(drag.h)) t = clamp(c.y + dy, 0, bt - MIN);
        if (/b/.test(drag.h)) bt = clamp(c.y + c.h + dy, t + MIN, 1);
        n = { x: l, y: t, w: r - l, h: bt - t };
      }
      S.crop = n; paintCrop();
    });
    function end() { if (!drag) return; drag = null; box.classList.remove("is-drag"); computeColors(); }
    box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end);
    box.addEventListener("keydown", function (e) {
      var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
      var st = e.shiftKey ? 0.001 : 0.02, c = S.crop;
      if (e.altKey) { c.w = clamp(c.w + d[0] * st, .12, 1 - c.x); c.h = clamp(c.h + d[1] * st, .12, 1 - c.y); }
      else { c.x = clamp(c.x + d[0] * st, 0, 1 - c.w); c.y = clamp(c.y + d[1] * st, 0, 1 - c.h); }
      paintCrop(); computeColors(); e.preventDefault();
    });
  }

  function rotate() {
    var c = S.canvas, n = document.createElement("canvas"); n.width = c.height; n.height = c.width;
    var x = n.getContext("2d"); x.translate(n.width, 0); x.rotate(Math.PI / 2); x.drawImage(c, 0, 0);
    var o = S.crop; /* rotate the selection with the photo */
    S.crop = { x: 1 - o.y - o.h, y: o.x, w: o.h, h: o.w };
    S.canvas = n;
    var img = S.root.querySelector(".vs__stage img");
    img.onload = function () { paintCrop(); computeColors(); };
    img.src = n.toDataURL("image/jpeg", .9);
  }

  function cropCanvas() {
    var c = S.canvas, r = S.crop, sx = Math.round(r.x * c.width), sy = Math.round(r.y * c.height), sw = Math.max(8, Math.round(r.w * c.width)), sh = Math.max(8, Math.round(r.h * c.height));
    var k = Math.min(1, OUT_SIDE / Math.max(sw, sh)), o = document.createElement("canvas");
    o.width = Math.round(sw * k); o.height = Math.round(sh * k);
    o.getContext("2d").drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height);
    return o;
  }

  /* ---------- colours ---------- */
  function colorName(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 510;
    if (d < 22) return l > .85 ? "white" : l < .18 ? "black" : "grey";
    var h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h = (h * 60 + 360) % 360;
    var s = d / (255 - Math.abs(mx + mn - 255) || 1);
    if (h < 15 || h >= 345) return "red"; if (h < 40) return l < .4 ? "brown" : "orange"; if (h < 68) return "yellow"; if (h < 160) return "green";
    if (h < 200) return "teal"; if (h < 255) return "blue"; if (h < 290) return "purple"; if (h < 345) return s > .5 && l > .6 ? "pink" : "pink";
    return "grey";
  }
  function computeColors() {
    if (!S || !S.canvas) return;
    var o = cropCanvas(), t = document.createElement("canvas"); t.width = t.height = 28;
    var x = t.getContext("2d", { willReadFrequently: true }); x.drawImage(o, 0, 0, 28, 28);
    var d = x.getImageData(0, 0, 28, 28).data, bins = {};
    for (var i = 0; i < d.length; i += 4) {
      var r = d[i], g = d[i + 1], b = d[i + 2], name = colorName(r, g, b), k = name;
      var e = bins[k] || (bins[k] = { n: 0, r: 0, g: 0, b: 0, name: name }); e.n++; e.r += r; e.g += g; e.b += b;
    }
    var list = Object.keys(bins).map(function (k) { return bins[k]; }).sort(function (a, b) { return b.n - a.n; }).filter(function (e) { return e.n > 784 * 0.06; }).slice(0, 4);
    S.colors = list.map(function (e) { return { name: e.name, hex: "rgb(" + Math.round(e.r / e.n) + "," + Math.round(e.g / e.n) + "," + Math.round(e.b / e.n) + ")" }; });
    var box = S.root.querySelector(".vs__colors");
    box.innerHTML = S.colors.length ? '<small>Colours found</small>' + S.colors.map(function (c) { return '<button type="button" class="vs__sw" data-color="' + c.name + '"><i style="background:' + c.hex + '"></i>' + c.name + "</button>"; }).join("") : "";
  }

  /* ---------- remember the last search so the bar can show it ---------- */
  var KEY = "jd-visual-last";
  function save(hint) {
    try {
      var t = document.createElement("canvas"), o = cropCanvas(), k = 96 / Math.max(o.width, o.height);
      t.width = Math.max(1, Math.round(o.width * k)); t.height = Math.max(1, Math.round(o.height * k));
      t.getContext("2d").drawImage(o, 0, 0, t.width, t.height);
      sessionStorage.setItem(KEY, JSON.stringify({ thumb: t.toDataURL("image/jpeg", .8), src: S.canvas.toDataURL("image/jpeg", .82), crop: S.crop, hint: hint }));
    } catch (e) { /* storage full or blocked: the search still works, just without the preview */ }
  }
  function saved() { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function forget() { try { sessionStorage.removeItem(KEY); } catch (e) {} if (JD.search && JD.search.syncThumb) JD.search.syncThumb(); }
  function restore(rec) {
    var im = new Image();
    im.onload = function () {
      if (!S) return;
      var c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext("2d").drawImage(im, 0, 0);
      useCanvas(c); S.crop = rec.crop || S.crop; paintCrop(); computeColors();
      S.root.querySelector(".vs__hint input").value = rec.hint || "";
      S.root.querySelector('[data-vs="remove"]').hidden = false;
      S.root.querySelector(".vs__head b").textContent = "Your image search";
    };
    im.src = rec.src;
  }

  /* ---------- search ---------- */
  function go() {
    var hint = S.root.querySelector(".vs__hint input").value.trim(), out = cropCanvas(), note = S.root.querySelector(".vs__note");
    var form = S.form, colors = S.colors.slice();
    var stage = S.root.querySelector(".vs__stage"); stage.classList.add("is-scanning");
    S.root.querySelector('[data-vs="go"] span').textContent = "Scanning…";
    S.root.classList.add("is-busy");
    save(hint);
    out.toBlob(function (blob) {
      var detail = { blob: blob, dataUrl: out.toDataURL("image/jpeg", .85), colors: colors, hint: hint, form: form, handled: false };
      document.dispatchEvent(new CustomEvent("jd:visual-search", { detail: detail }));
      setTimeout(function () {
        if (!S) return;
        if (detail.handled && detail.pending) return;
        stage.classList.remove("is-scanning"); S.root.classList.remove("is-busy");
        S.root.querySelector('[data-vs="go"] span').textContent = "Search with this photo";
        if (detail.handled) { close(); return; }
        if (hint) { close(); var url = "explore.html?q=" + encodeURIComponent(hint) + "&vs=1"; if (JD.router && JD.router.navigate) JD.router.navigate(url); else location.href = url; return; }
        note.hidden = false;
        note.textContent = "Photo matching is still being switched on. Add a word like \"sneakers\" or tap a colour and we will search for it now.";
        var inp = S.root.querySelector(".vs__hint input"); inp.focus();
        if (note.animate && !reduce) note.animate([{ transform: "translateY(-6px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 300 });
      }, reduce ? 0 : 1300);
    }, "image/jpeg", .85);
  }

  /* ---------- events ---------- */
  function bindSession() {
    var root = S.root, form = S.form, fileIn = root.querySelector("[data-vs-file]"), capIn = root.querySelector("[data-vs-capture]");
    bindCrop();
    root.addEventListener("click", function (e) {
      var a = e.target.closest("[data-vs]"), sw = e.target.closest("[data-color]");
      if (sw) { var inp = root.querySelector(".vs__hint input"), c = sw.getAttribute("data-color"); if (inp.value.toLowerCase().indexOf(c) < 0) inp.value = (c + " " + inp.value).trim(); inp.focus(); return; }
      if (!a) return;
      var k = a.getAttribute("data-vs");
      if (k === "close") close();
      else if (k === "camera") startCamera();
      else if (k === "upload" || k === "gallery" || k === "drop") fileIn.click();
      else if (k === "snap") snap();
      else if (k === "flip") { S.facing = S.facing === "user" ? "environment" : "user"; startCamera(); }
      else if (k === "retake") show("pick");
      else if (k === "rotate") rotate();
      else if (k === "reset") { S.crop = { x: .08, y: .08, w: .84, h: .84 }; paintCrop(); computeColors(); }
      else if (k === "go") go();
      else if (k === "remove") { forget(); close(); var u = new URL(location.href); if (u.searchParams.get("vs")) { u.searchParams.delete("vs"); history.replaceState(history.state, "", u.pathname + u.search); if (JD.search) JD.search.syncThumb(); } }
    });
    root.querySelector(".vs__hint input").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
    fileIn.addEventListener("change", function () { useFile(fileIn.files[0]); fileIn.value = ""; });
    capIn.addEventListener("change", function () { useFile(capIn.files[0]); capIn.value = ""; });
    var drop = root.querySelector(".vs__drop");
    ["dragenter", "dragover"].forEach(function (t) { root.addEventListener(t, function (e) { e.preventDefault(); root.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (t) { root.addEventListener(t, function (e) { e.preventDefault(); if (t === "drop" || !root.contains(e.relatedTarget)) root.classList.remove("is-over"); }); });
    root.addEventListener("drop", function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) useFile(f); });
    function onPaste(e) { var items = e.clipboardData && e.clipboardData.items; if (!items) return; for (var i = 0; i < items.length; i++) if (items[i].type.indexOf("image") === 0) { useFile(items[i].getAsFile()); e.preventDefault(); return; } }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); if (S.state === "crop" && false) show("pick"); else close(); } }
    function onDoc(e) { if (!root.contains(e.target) && !form.contains(e.target)) close(); }
    function onShow() { close(true); }
    document.addEventListener("paste", onPaste); document.addEventListener("keydown", onKey); document.addEventListener("pointerdown", onDoc, true);
    window.addEventListener("resize", schedule); window.addEventListener("scroll", schedule, true); window.addEventListener("jd:pane:show", onShow);
    S.unbind = function () {
      document.removeEventListener("paste", onPaste); document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDoc, true);
      window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); window.removeEventListener("jd:pane:show", onShow);
    };
  }

  /* ---------- live multimodal matcher ---------- */
  function visualStatus(message) {
    if (!S) return;
    var stage = S.root.querySelector(".vs__stage"), button = S.root.querySelector('[data-vs="go"]');
    if (stage) stage.classList.remove("is-scanning");
    S.root.classList.remove("is-busy");
    if (button) {
      button.disabled = false;
      var label = button.querySelector("span");
      if (label) label.textContent = "Search with this photo";
    }
    var note = S.root.querySelector(".vs__note");
    if (!note) return;
    note.hidden = false;
    note.textContent = message;
  }

  document.addEventListener("jd:visual-search", function (event) {
    var detail = event.detail;
    if (!detail || !detail.blob || detail.handled) return;

    /* Claim the event synchronously so the crop panel does not fall back to text-only search. */
    detail.handled = true;
    detail.pending = true;
    visualStatus("Finding visually similar products in the JulaDirect marketplace…");

    (async function () {
      try {
        var body = new FormData();
        body.append("image", detail.blob, "juladirect-visual-search.jpg");
        if (detail.hint) body.append("hint", String(detail.hint).slice(0, 180));

        var res = await fetch("/api/visual-search", {
          method: "POST",
          headers: { Accept: "application/json" },
          body: body
        });
        var payload = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(payload.error || "Image search could not be completed.");

        var matches = Array.isArray(payload.matches) ? payload.matches : [];
        var ids = matches.map(function (match) { return match && match.id; })
          .filter(function (id) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || "")); })
          .slice(0, 30);

        if (!ids.length) {
          detail.pending = false;
          visualStatus("We couldn't find close matches for this photo yet. Try a clearer photo or add a product clue.");
          return;
        }

        try { sessionStorage.setItem("jd-visual-results", JSON.stringify(ids)); } catch (e) { /* IDs are also carried in the URL. */ }
        detail.pending = false;
        close();
        var url = "explore.html?vs=1&vsi=" + encodeURIComponent(ids.join(","));
        if (JD.router && JD.router.navigate) JD.router.navigate(url);
        else location.href = url;
      } catch (error) {
        detail.pending = false;
        visualStatus(error && error.message ? error.message : "Image search failed. Please try again.");
      }
    })();
  });

  JD.visual = { open: open, close: close, toggle: open, isOpen: function () { return !!S; } };
  if (JD._vsPending) { var f = JD._vsPending; JD._vsPending = null; open(f); }
})();
