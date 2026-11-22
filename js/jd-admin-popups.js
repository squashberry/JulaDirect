/* JulaDirect admin: popups & promos. Reads site_popups (row-level security shows admins every popup)
   and writes only through admin_save_site_popup / admin_set_site_popup_active / admin_delete_site_popup,
   which re-check admin access on the server. Rendering is shared with the storefront (js/jd-popups.js). */
(function () {
  "use strict";
  var JD = window.JD, P = JD.popups, $ = function (id) { return document.getElementById(id); };
  var TEXT = ["name", "kicker", "badge", "headline", "body", "promo_code", "cta_label", "secondary_label", "cta_url", "trigger_type", "trigger_value", "frequency", "audience", "priority"];
  var LIMITS = { name: 80, kicker: 40, badge: 14, headline: 90, body: 240, promo_code: 24, cta_label: 28, secondary_label: 28, cta_url: 300 };
  var PAGES = [["all", "Every page"], ["home", "Home"], ["explore", "Explore"], ["product", "Product"], ["cart", "Cart"], ["wishlist", "Wishlist"], ["orders", "Orders"]];
  var BUCKET = "site-banners", MAX = 8 * 1024 * 1024;
  var list = [], editingId = null, editing = null, template = "spotlight", device = "desktop", image = null, removeImg = false, objUrl = null, live = null, pvTimer = 0;
  var site = function (p) { return "../" + p; };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var toLocal = function (iso) { if (!iso) return ""; var d = new Date(iso); return isNaN(d) ? "" : d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  var field = function (k) { return $("f-" + k); };
  var tname = function (k) { var t = P.templates.filter(function (x) { return x.key === k; })[0]; return t ? t.name : k; };

  function status(p) {
    var n = Date.now();
    if (!p.is_active) return { l: "Off", c: "" };
    if (p.starts_at && new Date(p.starts_at) > n) return { l: "Scheduled", c: "jd-badge--warn" };
    if (p.ends_at && new Date(p.ends_at) < n) return { l: "Expired", c: "jd-badge--bad" };
    return { l: "Live", c: "jd-badge--ok" };
  }
  function blocked(title, text, actions) { $("jd-new").hidden = true; $("jd-note").hidden = true; $("jd-list").innerHTML = JD.empty({ icon: "settings", title: title, text: text, actions: actions || "" }); }

  /* a scaled, non-interactive miniature of a template */
  function mini(host, p, w, h, phone) {
    host.innerHTML = "";
    var box = document.createElement("div"); box.className = "pp-mini"; box.style.cssText = "width:" + w + "px;height:" + h + "px;background:#f4f7fd";
    var inst = P.render(p, { contained: true, preview: true, phone: phone });
    var el = inst.el; el.style.pointerEvents = "none"; el.querySelectorAll("*").forEach(function (n) { n.style.animationDuration = "0.001s"; n.style.animationDelay = "0s"; });
    box.appendChild(el); host.appendChild(box);
    var s = Math.min(host.clientWidth / w, host.clientHeight / h); box.style.transform = "scale(" + s + ")"; box.style.left = (host.clientWidth - w * s) / 2 + "px"; box.style.top = (host.clientHeight - h * s) / 2 + "px";
  }
  function sampleFor(t) { var s = P.sample[t] || {}; return Object.assign({ template: t, accent_color: "#1451E6", bg_color: "#FFFFFF" }, s); }

  function render() {
    $("jd-new").hidden = false; $("jd-note").hidden = false;
    if (!list.length) { $("jd-list").innerHTML = JD.empty({ icon: "tag", title: "No popups yet", text: "Pick one of ten designs and make it yours. It stays off until you switch it on.", actions: '<button type="button" class="jd-btn jd-btn--primary" data-new>New popup</button>' }); return; }
    $("jd-list").innerHTML = '<div class="pp-grid">' + list.map(function (p) {
      var st = status(p), pages = (p.pages || []).indexOf("all") >= 0 ? "every page" : (p.pages || []).join(", ");
      return '<article class="pp-card" data-id="' + JD.esc(p.id) + '"><div class="pp-card__pv" data-pv></div><div class="pp-card__body">' +
        '<div class="pp-card__t">' + JD.esc(p.name) + ' <span class="jd-badge ' + st.c + '">' + st.l + '</span></div>' +
        '<div class="pp-card__meta"><span>' + JD.esc(tname(p.template)) + " · " + JD.esc(pages) + '</span><span>' + JD.esc(({ load: "Right away", delay: "After " + p.trigger_value + "s", scroll: "At " + p.trigger_value + "% scroll", exit: "On exit" })[p.trigger_type] || "") + " · " + JD.esc(({ once_session: "once per visit", once_day: "once a day", once_ever: "once per person", always: "every time" })[p.frequency] || "") + '</span></div>' +
        '<div class="pp-card__acts"><label class="jd-switch" style="gap:8px"><span>Live</span><input type="checkbox" data-toggle' + (p.is_active ? " checked" : "") + '><span class="jd-switch__track" aria-hidden="true"></span></label>' +
        '<a class="jd-btn jd-btn--secondary jd-btn--sm" href="' + site("index.html") + "?preview_popup=" + encodeURIComponent(p.id) + '" target="_blank" rel="noopener">Preview</a>' +
        '<button type="button" class="jd-btn jd-btn--secondary jd-btn--sm" data-edit>Edit</button><button type="button" class="jd-btn jd-btn--ghost jd-btn--sm" data-delete>Delete</button></div></div></article>';
    }).join("") + "</div>";
    JD.$$("[data-pv]", $("jd-list")).forEach(function (host) { var p = list.filter(function (x) { return x.id === host.closest("[data-id]").getAttribute("data-id"); })[0]; if (p) mini(host, p, 900, 560, false); });
  }

  async function load() {
    $("jd-list").innerHTML = '<div class="jd-skel" style="height:160px" aria-hidden="true"></div>';
    try {
      var A = JD.auth(); await A.ready(); var user = await A.getUser();
      if (!user) { blocked("Sign in to continue", "This page is for JulaDirect administrators.", '<a class="jd-btn jd-btn--primary" href="' + JD.esc(JD.loginUrl()) + '">Log in</a>'); return; }
      var roles = (await A.getUserRoles()) || [];
      if (roles.indexOf("admin") < 0) { blocked("Administrators only", "Your account does not have access to popups.", '<a class="jd-btn jd-btn--secondary" href="' + site("index.html") + '">Back to the marketplace</a>'); return; }
      var c = await JD.client(); var r = await c.from("site_popups").select("*").order("updated_at", { ascending: false });
      if (r.error) {
        if (r.error.code === "42P01" || r.error.code === "PGRST205" || /site_popups/.test(r.error.message || "")) { blocked("Popup storage is not set up yet", "Apply the database migration 20261121200000_site_popups.sql, then reload this page."); return; }
        throw r.error;
      }
      list = r.data || []; render();
    } catch (e) { blocked("We could not load popups", (e && e.message) || "Please try again.", '<button type="button" class="jd-btn jd-btn--secondary" data-retry>Try again</button>'); }
  }

  function ask(title, text, ok) {
    return new Promise(function (resolve) { var d = $("jd-confirm"); $("jd-confirm-title").textContent = title; $("jd-confirm-text").textContent = text; $("jd-confirm-ok").textContent = ok || "Confirm"; var done = function () { d.removeEventListener("close", done); resolve(d.returnValue === "ok"); }; d.addEventListener("close", done); d.showModal(); });
  }
  async function rpc(name, args) { var c = await JD.client(); var r = await c.rpc(name, args); if (r.error) throw r.error; return r.data; }

  /* ---------- editor ---------- */
  function pagesBox(sel) {
    $("f-pages").innerHTML = PAGES.map(function (p) { return '<label><input type="checkbox" value="' + p[0] + '"' + (sel.indexOf(p[0]) >= 0 ? " checked" : "") + ">" + p[1] + "</label>"; }).join("");
  }
  function drawTemplates() {
    $("pp-tpls").innerHTML = P.templates.map(function (t) { return '<button type="button" class="pp-tpl" data-tpl="' + t.key + '" aria-pressed="' + (t.key === template) + '"><div class="pp-tpl__pv" data-tp></div><b>' + t.name + "</b><small>" + t.note + "</small></button>"; }).join("");
    JD.$$("[data-tp]", $("pp-tpls")).forEach(function (h) { var t = h.parentNode.getAttribute("data-tpl"); mini(h, sampleFor(t), 560, 340, false); });
  }
  function collect() {
    var p = { template: template };
    TEXT.forEach(function (k) { p[k] = field(k).value.trim(); });
    p.promo_code = p.promo_code.toUpperCase();
    p.accent_color = field("accent_color").value.toUpperCase(); p.bg_color = field("bg_color").value.toUpperCase();
    p.pages = JD.$$("input", $("f-pages")).filter(function (i) { return i.checked; }).map(function (i) { return i.value; });
    p.image_url = editing && !removeImg ? (editing.image_url || "") : "";
    ["starts_at", "ends_at", "countdown_to"].forEach(function (k) { p[k] = field(k).value ? new Date(field(k).value).toISOString() : ""; });
    return p;
  }
  function previewData() { var p = collect(); if (image) p.image_url = objUrl || ""; return p; }
  function drawPreview(replay) {
    var wrap = $("pp-wrap"), screen = $("pp-screen"), phone = device === "phone";
    var W = phone ? 390 : 1000, H = phone ? 780 : 620, avail = Math.max(240, wrap.clientWidth), s = Math.min(1, avail / W);
    if (phone) s = Math.min(s, 440 / H * 1.0);
    screen.style.width = W + "px"; screen.style.height = H + "px"; screen.style.transform = "scale(" + s + ")";
    wrap.style.height = Math.round(H * s) + "px"; wrap.style.width = "100%"; screen.style.marginRight = -(W - W * s) + "px"; screen.style.marginBottom = -(H - H * s) + "px";
    $("pp-fake").classList.toggle("ph", phone);
    var stage = $("pp-stage"); if (live) { live.destroy(); live = null; }
    stage.innerHTML = ""; live = P.render(previewData(), { contained: true, preview: true, phone: phone, closeOnScrim: false, onClose: function () { /* closed in preview: Replay brings it back */ } });
    stage.appendChild(live.el);
    if (!replay) JD.$$("*", live.el).forEach(function (n) { n.style.animationDelay = "0s"; });
  }
  function schedulePreview() { clearTimeout(pvTimer); pvTimer = setTimeout(function () { drawPreview(false); }, 120); }
  function syncTrigger() {
    var t = field("trigger_type").value, v = field("trigger_value");
    $("f-trigger_value-l").textContent = t === "scroll" ? "Scroll depth (%)" : t === "delay" ? "Seconds" : t === "exit" ? "Touch screens: wait (s)" : "Seconds (not used)";
    v.disabled = t === "load";
  }
  function setImgPreview() {
    if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
    var src = "";
    if (image) { objUrl = URL.createObjectURL(image); src = objUrl; } else if (!removeImg && editing) src = JD.safeUrl(editing.image_url);
    var im = $("f-img-prev"); if (src) { im.src = src; im.hidden = false; } else { im.hidden = true; im.removeAttribute("src"); }
    $("f-image-remove").hidden = !src;
  }
  function fill(p) {
    editing = p || null; image = null; removeImg = false;
    var base = p || Object.assign(sampleFor("spotlight"), { name: "", trigger_type: "delay", trigger_value: 4, frequency: "once_session", audience: "all", priority: 0, pages: ["home"] });
    template = base.template || "spotlight";
    TEXT.forEach(function (k) { field(k).value = base[k] != null ? base[k] : ""; });
    field("accent_color").value = (base.accent_color || "#1451E6").toLowerCase(); field("bg_color").value = (base.bg_color || "#FFFFFF").toLowerCase();
    ["starts_at", "ends_at", "countdown_to"].forEach(function (k) { field(k).value = toLocal(base[k]); });
    $("f-image-file").value = ""; $("f-body-count").textContent = field("body").value.length + " / 240";
    pagesBox(base.pages || ["home"]); syncTrigger(); setImgPreview(); setStatus("");
  }
  function setStatus(m, err) { var e = $("jd-form-status"); e.textContent = m || ""; e.classList.toggle("is-error", !!err); }
  function openForm(p) {
    editingId = p ? p.id : null; $("jd-form-title").textContent = p ? "Edit popup" : "New popup";
    fill(p); $("jd-form-dialog").showModal(); drawTemplates(); drawPreview(true); field("name").focus();
  }
  function pickTemplate(k) {
    var prev = sampleFor(template), next = sampleFor(k), keys = ["kicker", "headline", "body", "badge", "promo_code", "cta_label", "secondary_label"];
    /* swap in the new design's sample words only where the admin has not written their own */
    keys.forEach(function (key) { var cur = field(key).value.trim(); if (!cur || cur === (prev[key] || "")) field(key).value = next[key] || ""; });
    template = k;
    JD.$$("[data-tpl]", $("pp-tpls")).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-tpl") === k)); });
    $("f-body-count").textContent = field("body").value.length + " / 240";
    drawPreview(true);
  }
  function validate(p) {
    if (!p.name) return "Give the popup an internal name.";
    if (!p.headline) return "The headline is required.";
    for (var k in LIMITS) if (p[k] && p[k].length > LIMITS[k]) return "Shorten “" + k.replace(/_/g, " ") + "” to " + LIMITS[k] + " characters or fewer.";
    if (p.promo_code && !/^[A-Za-z0-9_-]{2,24}$/.test(p.promo_code)) return "The promo code can use letters, numbers, - and _ (2 to 24 characters).";
    if (p.cta_url && !(/^https:\/\/[^\s]+$/.test(p.cta_url) || /^[A-Za-z0-9_.\/?=&#%-]+$/.test(p.cta_url))) return "The button link must be a page on this site or a full https:// link.";
    if (p.cta_label && !p.cta_url) return "Add a button link, or clear the button label.";
    if (!p.pages.length) return "Choose at least one page.";
    if (p.starts_at && p.ends_at && new Date(p.ends_at) <= new Date(p.starts_at)) return "The end time must be after the start time.";
    return "";
  }
  async function save(thenPreview) {
    var p = collect(), problem = validate(p); if (problem) { setStatus(problem, true); return; }
    var btns = [$("jd-form-save"), $("jd-form-preview")]; btns.forEach(function (b) { b.disabled = true; });
    setStatus(image ? "Uploading picture…" : "Saving…");
    try {
      if (image) {
        var c = await JD.client(); if (!c || !c.storage) throw new Error("Image storage is unavailable. Refresh and try again.");
        var ext = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
        var name = image.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(-72) || ("popup." + ext);
        var up = await c.storage.from(BUCKET).upload("popups/" + (editingId || "new") + "/" + Date.now() + "-" + name, image, { cacheControl: "31536000", upsert: false, contentType: image.type });
        if (up.error) throw new Error("Picture upload failed: " + up.error.message);
        var pub = c.storage.from(BUCKET).getPublicUrl(up.data.path); if (!pub.data || !pub.data.publicUrl) throw new Error("The picture uploaded but its link could not be created.");
        p.image_url = pub.data.publicUrl;
      }
      setStatus("Saving popup…");
      var id = await rpc("admin_save_site_popup", { p_id: editingId, p_payload: Object.assign({}, p, { trigger_value: Number(p.trigger_value || 0), priority: Number(p.priority || 0) }) });
      $("jd-form-dialog").close(); JD.toast("Popup saved", "ok"); await load();
      if (thenPreview) window.open(site("index.html") + "?preview_popup=" + encodeURIComponent(id || editingId), "_blank", "noopener");
    } catch (e) { setStatus((e && e.message) || "We could not save this popup.", true); }
    finally { btns.forEach(function (b) { b.disabled = false; }); }
  }

  /* ---------- events ---------- */
  document.addEventListener("click", async function (e) {
    var row = e.target.closest("[data-id]"), id = row && row.getAttribute("data-id"), p = id && list.filter(function (x) { return x.id === id; })[0];
    if (e.target.closest("#jd-new") || e.target.closest("[data-new]")) { openForm(null); return; }
    if (e.target.closest("[data-retry]")) { load(); return; }
    if (p && e.target.closest("[data-edit]")) { openForm(p); return; }
    if (p && e.target.closest("[data-delete]")) {
      if (!(await ask("Delete this popup?", "“" + p.name + "” will be removed permanently.", "Delete"))) return;
      try { await rpc("admin_delete_site_popup", { p_id: p.id }); JD.toast("Popup deleted", "ok"); await load(); } catch (err) { JD.toast((err && err.message) || "We could not delete this popup.", "error"); }
      return;
    }
    var t = e.target.closest("[data-tpl]"); if (t) { pickTemplate(t.getAttribute("data-tpl")); return; }
    var d = e.target.closest("[data-dev]"); if (d) { device = d.getAttribute("data-dev"); JD.$$("[data-dev]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === d)); }); drawPreview(true); }
  });
  document.addEventListener("change", async function (e) {
    var t = e.target.closest("[data-toggle]"); if (!t) return;
    var p = list.filter(function (x) { return x.id === t.closest("[data-id]").getAttribute("data-id"); })[0]; if (!p) return;
    t.disabled = true;
    try { await rpc("admin_set_site_popup_active", { p_id: p.id, p_active: t.checked }); JD.toast(t.checked ? "Popup is live" : "Popup switched off", "ok"); } catch (err) { JD.toast((err && err.message) || "We could not change that popup.", "error"); }
    await load();
  });
  $("jd-form").addEventListener("submit", function (ev) { ev.preventDefault(); save(false); });
  $("jd-form").addEventListener("input", function (e) {
    if (e.target.id === "f-body") $("f-body-count").textContent = e.target.value.length + " / 240";
    if (e.target.id === "f-trigger_type") syncTrigger();
    schedulePreview();
  });
  $("jd-form").addEventListener("change", function (e) { if (e.target.id === "f-trigger_type") syncTrigger(); });
  $("jd-form-preview").addEventListener("click", function () { save(true); });
  $("jd-form-cancel").addEventListener("click", function () { $("jd-form-dialog").close(); });
  $("jd-form-x").addEventListener("click", function () { $("jd-form-dialog").close(); });
  $("pp-replay").addEventListener("click", function () { drawPreview(true); });
  $("f-image-file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) { image = null; setImgPreview(); schedulePreview(); return; }
    if (["image/png", "image/jpeg", "image/webp"].indexOf(f.type) < 0) { e.target.value = ""; image = null; setImgPreview(); setStatus("Choose a PNG, JPG or WebP picture.", true); return; }
    if (f.size > MAX) { e.target.value = ""; image = null; setImgPreview(); setStatus("The picture is too large. Maximum is 8 MB.", true); return; }
    image = f; removeImg = false; setImgPreview(); setStatus("Picture selected. It uploads when you save."); schedulePreview();
  });
  $("f-image-remove").addEventListener("click", function () { image = null; removeImg = true; $("f-image-file").value = ""; setImgPreview(); setStatus("The picture will be removed when you save."); schedulePreview(); });
  var fsInst = null;
  $("pp-full").addEventListener("click", function () {
    var host = $("pp-fs"); host.hidden = false; if (fsInst) fsInst.destroy();
    fsInst = P.render(previewData(), { preview: true, phone: window.innerWidth < 641, onClose: function () { /* Exit preview button leaves */ } }); host.appendChild(fsInst.el);
  });
  $("pp-fs-x").addEventListener("click", function () { $("pp-fs").hidden = true; if (fsInst) { fsInst.destroy(); fsInst = null; } document.body.classList.remove("jp-lock"); });
  window.addEventListener("resize", function () { if ($("jd-form-dialog").open) schedulePreview(); });

  JD.mountShell({ active: "" });
  load();
})();
