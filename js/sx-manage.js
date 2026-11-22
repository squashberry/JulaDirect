/* =========================================================
   Seller Studio: "Manage" pages, built inside the studio so nothing links out to the
   old seller workspace. Messages, Store profile, Business website, Pickup & delivery
   and Settings. Registered through SX.register (js/sx-app.js).
   All user text is escaped; image URLs must be http(s).
   ========================================================= */
(function () {
  "use strict";
  const SX = window.SX;
  if (!SX || !SX.register || !SX.ui) return;
  const U = SX.ui;
  const { D, esc, ago, safeUrl, thumb, hydrate, skel, empty, ask, toast, errMsg, $, $$ } = U;
  const auth = () => window.GamBasketAuth;
  const client = () => D.client();
  const uid = () => D.user().id;

  async function uploadImage(bucket, file) {
    if (!file) return "";
    if (!/^image\//.test(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose an image under 5MB.");
    const path = uid() + "/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()) + "-" + file.name.replace(/[^a-z0-9.]+/gi, "-");
    const { error } = await client().storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error("We couldn't upload that image. " + (error.message || ""));
    return client().storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  const field = (lab, inner, hint) => '<label class="sx-field">' + esc(lab) + inner + (hint ? '<small class="sx-hint">' + esc(hint) + "</small>" : "") + "</label>";
  const input = (id, val, o) => { o = o || {}; return '<input class="sx-input" id="' + id + '" type="' + (o.type || "text") + '" value="' + esc(val || "") + '" maxlength="' + (o.max || 160) + '" placeholder="' + esc(o.ph || "") + '"' + (o.req ? " required" : "") + ">"; };
  const val = id => ($("#" + id) || {}).value || "";

  /* =====================================================
     MESSAGES
     ===================================================== */
  const M = { list: [], active: null, sub: null, msgs: [], poll: null };

  function stopMessages() { if (M.sub && M.sub.unsubscribe) { try { M.sub.unsubscribe(); } catch (e) { /* closed */ } } M.sub = null; clearInterval(M.poll); M.poll = null; }

  function convRow(c) {
    const name = c.other_user_name || "Customer";
    return '<button type="button" class="smg-row' + (M.active === c.id ? " is-on" : "") + '" data-conv="' + esc(c.id) + '">' +
      thumb(c.other_user_avatar, name) +
      '<span class="smg-row__b"><span class="smg-row__t"><b>' + esc(name) + "</b><i>" + esc(ago(c.last_message_at)) + '</i></span><span class="smg-row__s">' +
      (c.product ? "<em>" + esc(c.product.title) + "</em> · " : "") + esc(c.last_message) + "</span></span>" +
      (c.unread_count ? '<span class="sx-badge">' + esc(c.unread_count) + "</span>" : "") + "</button>";
  }
  function bubble(m) {
    const mine = m.sender_id === uid();
    return '<div class="smg-b ' + (mine ? "smg-b--me" : "smg-b--them") + '" data-mid="' + esc(m.id) + '"><p>' + esc(m.content || m.message_text) + "</p><time>" + esc(new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })) + "</time></div>";
  }
  function paintThread() {
    const flow = $("#smgFlow"); if (!flow) return;
    const near = flow.scrollHeight - flow.scrollTop - flow.clientHeight < 140;
    flow.innerHTML = M.msgs.length ? M.msgs.map(bubble).join("") : '<p class="smg-none">No messages yet. Say hello.</p>';
    if (near || !flow._init) { flow.scrollTop = flow.scrollHeight; flow._init = true; }
  }
  async function openConv(id) {
    M.active = id; stopMessages();
    const c = M.list.find(x => x.id === id) || {};
    const root = $("#v-messages .smg"); if (!root) return;
    root.classList.add("is-open");
    $$(".smg-row").forEach(r => r.classList.toggle("is-on", r.getAttribute("data-conv") === id));
    const pane = $("#smgThread");
    pane.innerHTML = '<header class="smg-head"><button class="sx-icon-btn smg-back" type="button" data-smg="back" aria-label="Back to conversations"><svg><use href="#i-close"/></svg></button>' + thumb(c.other_user_avatar, c.other_user_name) +
      "<div><b>" + esc(c.other_user_name || "Customer") + "</b>" + (c.product ? "<small>About " + esc(c.product.title) + "</small>" : "") + "</div></header>" +
      '<div class="smg-flow" id="smgFlow" aria-live="polite">' + '<div class="sx-skel" style="height:60px"></div>' + '</div>' +
      '<form class="smg-compose" id="smgForm"><textarea class="sx-textarea" id="smgText" rows="1" maxlength="4000" placeholder="Write a reply…" aria-label="Message"></textarea><button class="sx-btn sx-btn--primary" type="submit">Send</button></form>';
    hydrate(pane);
    try {
      const r = await auth().getConversationMessages(id);
      if (M.active !== id) return;
      M.msgs = r.messages || []; paintThread();
      auth().markConversationRead(id).catch(() => {});
      const row = M.list.find(x => x.id === id); if (row) { row.unread_count = 0; refreshBadge(); const el = $('.smg-row[data-conv="' + id + '"] .sx-badge'); if (el) el.remove(); }
    } catch (e) { $("#smgFlow").innerHTML = empty("Couldn't load this chat", errMsg(e)); return; }
    const add = m => { if (M.active !== id || M.msgs.some(x => x.id === m.id)) return; M.msgs.push(m); paintThread(); if (m.sender_id !== uid()) auth().markConversationRead(id).catch(() => {}); };
    try { M.sub = auth().subscribeToConversation(id, add, () => {}); } catch (e) { /* polling covers it */ }
    M.poll = setInterval(async () => { try { const r = await auth().getConversationMessages(id); if (M.active === id && (r.messages || []).length !== M.msgs.length) { M.msgs = r.messages; paintThread(); } } catch (e) { /* retry next tick */ } }, 7000);
  }
  function refreshBadge() { const n = M.list.reduce((a, c) => a + (c.unread_count || 0), 0); const b = $("#sxBadgeMessages"); if (b) { b.hidden = !n; b.textContent = n; } }

  SX.register("messages", "Messages", async function (el) {
    stopMessages(); M.active = null;
    el.innerHTML = skel(3);
    const r = await auth().getConversations();
    M.list = r.items || []; refreshBadge();
    el.innerHTML = '<div class="smg"><aside class="smg-list" aria-label="Conversations">' +
      (M.list.length ? M.list.map(convRow).join("") : empty("No conversations yet", "When a buyer messages you about a product, it appears here.")) +
      '</aside><section class="smg-thread" id="smgThread"><div class="smg-pick">Select a conversation to read and reply.</div></section></div>';
    hydrate(el);
    const want = new URLSearchParams((location.hash.split("?")[1] || "")).get("c");
    if (want && M.list.some(c => c.id === want)) openConv(want);
  });
  window.addEventListener("hashchange", () => { if (!/^#\/messages/.test(location.hash)) stopMessages(); });

  document.addEventListener("click", e => {
    const row = e.target.closest("[data-conv]"); if (row) return void openConv(row.getAttribute("data-conv"));
    if (e.target.closest('[data-smg="back"]')) { const root = $("#v-messages .smg"); if (root) root.classList.remove("is-open"); M.active = null; stopMessages(); $$(".smg-row").forEach(r => r.classList.remove("is-on")); }
  });
  document.addEventListener("submit", async e => {
    if (e.target.id !== "smgForm") return;
    e.preventDefault();
    const ta = $("#smgText"), text = ta.value.trim(), id = M.active; if (!text || !id) return;
    const btn = e.target.querySelector("button"); btn.disabled = true;
    try {
      const r = await auth().sendMessage(id, text);
      ta.value = ""; if (!M.msgs.some(x => x.id === r.message.id)) M.msgs.push(r.message); paintThread();
      const c = M.list.find(x => x.id === id); if (c) { c.last_message = text; c.last_message_at = r.message.created_at; }
    } catch (err) { toast(errMsg(err), "bad"); } finally { btn.disabled = false; ta.focus(); }
  });
  document.addEventListener("keydown", e => { if (e.target.id === "smgText" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#smgForm").requestSubmit(); } });

  /* =====================================================
     STORE PROFILE
     ===================================================== */
  const imgPick = (id, lab, url) => '<div class="sm-img"><div class="sm-img__pv" id="' + id + 'Pv" ' + (safeUrl(url) ? 'data-bg="' + esc(safeUrl(url)) + '"' : "") + '></div><div><b>' + esc(lab) + '</b><input type="file" accept="image/*" id="' + id + 'File" class="sx-sr"><label class="sx-btn sx-btn--sm" for="' + id + 'File">Choose image</label></div></div>';

  SX.register("store", "Store profile", async function (el) {
    el.innerHTML = skel(2);
    const { data: s, error } = await client().from("stores").select("id,name,description,category,logo_url,banner_url,location,phone,is_verified,rating").eq("seller_id", uid()).maybeSingle();
    if (error) throw error;
    const st = s || {};
    const files = {};
    el.innerHTML = '<div class="sx-grid sx-grid--split"><form class="sx-card" id="smStore" novalidate><div class="sx-card__head"><h2>Store details</h2>' + (st.is_verified ? '<span class="sx-pill sx-pill--good">Verified</span>' : '<span class="sx-pill">Unverified</span>') + '</div><div class="sx-card__body sm-form">' +
      field("Store name", input("smName", st.name, { req: 1, max: 80, ph: "e.g. Banjul Tech Hub" })) +
      '<div class="sm-two">' + field("Category", input("smCat", st.category, { max: 60, ph: "Electronics, Fashion…" })) + field("Phone / WhatsApp", input("smPhone", st.phone, { type: "tel", max: 30, ph: "+220 700 0000" })) + "</div>" +
      field("Location", input("smLoc", st.location, { max: 120, ph: "e.g. Kairaba Avenue, Serrekunda" })) +
      field("About your store", '<textarea class="sx-textarea" id="smDesc" rows="4" maxlength="600" placeholder="What you sell and why buyers can trust you">' + esc(st.description || "") + "</textarea>") +
      imgPick("smLogo", "Logo", st.logo_url) + imgPick("smBanner", "Cover banner", st.banner_url) +
      '<div class="sm-actions"><button class="sx-btn sx-btn--primary" type="submit" id="smSave">Save changes</button><a class="sx-btn" target="_blank" rel="noopener" href="../seller.html?id=' + esc(uid()) + '">View live store</a></div></div></form>' +
      '<aside class="sx-card"><div class="sx-card__head"><h2>Preview</h2></div><div class="sx-card__body"><div class="sm-pv"><div class="sm-pv__cover" id="pvCover"></div><div class="sm-pv__logo" id="pvLogo"></div><h3 id="pvName"></h3><p id="pvLoc"></p><p id="pvDesc"></p></div></div></aside></div>';
    hydrate(el);
    const paintPv = () => {
      $("#pvName").textContent = val("smName") || "Your store"; $("#pvLoc").textContent = val("smLoc") || "Location"; $("#pvDesc").textContent = val("smDesc") || "Tell buyers about your store.";
      const cov = files.banner ? files.banner.url : safeUrl(st.banner_url), lg = files.logo ? files.logo.url : safeUrl(st.logo_url);
      $("#pvCover").style.backgroundImage = cov ? 'url("' + cov.replace(/"/g, "%22") + '")' : ""; $("#pvLogo").style.backgroundImage = lg ? 'url("' + lg.replace(/"/g, "%22") + '")' : ""; $("#pvLogo").textContent = lg ? "" : (val("smName") || "J").charAt(0).toUpperCase();
    };
    paintPv();
    ["smName", "smLoc", "smDesc"].forEach(i => $("#" + i).addEventListener("input", paintPv));
    [["smLogo", "logo"], ["smBanner", "banner"]].forEach(([id, key]) => $("#" + id + "File").addEventListener("change", ev => {
      const f = ev.target.files[0]; if (!f) return;
      if (!/^image\//.test(f.type) || f.size > 5 * 1024 * 1024) { ev.target.value = ""; return void toast("Choose an image under 5MB.", "bad"); }
      files[key] = { file: f, url: URL.createObjectURL(f) };
      const pv = $("#" + id + "Pv"); pv.style.backgroundImage = 'url("' + files[key].url + '")'; paintPv();
    }));
    $("#smStore").addEventListener("submit", async ev => {
      ev.preventDefault();
      if (!val("smName").trim()) { $("#smName").focus(); return void toast("Enter your store name.", "bad"); }
      const btn = $("#smSave"); btn.disabled = true; btn.textContent = "Saving…";
      try {
        const [logo, banner] = await Promise.all([files.logo ? uploadImage("store-assets", files.logo.file).catch(() => uploadImage("business-sites", files.logo.file)) : "", files.banner ? uploadImage("store-assets", files.banner.file).catch(() => uploadImage("business-sites", files.banner.file)) : ""]);
        const { data, error: e } = await client().rpc("save_my_store", { p_name: val("smName").trim(), p_description: val("smDesc").trim() || null, p_category: val("smCat").trim() || null, p_logo_url: logo || st.logo_url || null, p_banner_url: banner || st.banner_url || null, p_location: val("smLoc").trim() || null, p_phone: val("smPhone").trim() || null });
        if (e) throw e;
        if (data) { st.logo_url = data.logo_url; st.banner_url = data.banner_url; }
        $("#sxStoreName").textContent = data && data.name || val("smName");
        toast("Store profile saved", "good");
      } catch (err) { toast(errMsg(err), "bad"); } finally { btn.disabled = false; btn.textContent = "Save changes"; }
    });
  });

  /* =====================================================
     BUSINESS WEBSITE
     ===================================================== */
  const slugify = v => String(v || "").toLowerCase().trim().replace(/["']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "business";
  const siteUrl = slug => location.origin + "/business.html?site=" + encodeURIComponent(slug);
  const PAL = ["blue", "green", "purple"];

  SX.register("website", "Business website", async function (el) {
    el.innerHTML = skel(2);
    const { data: sites, error } = await client().from("business_websites").select("*").eq("user_id", uid()).order("created_at", { ascending: false });
    if (error) throw error;
    let editing = null;
    const paintForm = () => {
      const s = editing || {};
      $("#swForm").innerHTML = '<div class="sx-card__head"><h2>' + (editing ? "Edit website" : "Create a website") + "</h2>" + (editing ? '<button type="button" class="sx-btn sx-btn--sm" data-sw="new">New site</button>' : "") + '</div><div class="sx-card__body sm-form">' +
        field("Business name", input("swName", s.business_name, { req: 1, max: 80 })) +
        field("Description", '<textarea class="sx-textarea" id="swDesc" rows="3" maxlength="600">' + esc(s.description || "") + "</textarea>") +
        '<div class="sm-two">' + field("Location", input("swLoc", s.location, { max: 120 })) + field("Opening hours", input("swHours", s.opening_hours, { max: 120, ph: "Mon–Sat, 9am–6pm" })) + "</div>" +
        '<div class="sm-two">' + field("Phone", input("swPhone", s.phone, { type: "tel", max: 30 })) + field("WhatsApp", input("swWa", s.whatsapp, { type: "tel", max: 30 })) + "</div>" +
        field("Colour", '<select class="sx-select" id="swPal">' + PAL.map(p => '<option value="' + p + '"' + ((s.palette || "blue") === p ? " selected" : "") + ">" + p.charAt(0).toUpperCase() + p.slice(1) + "</option>").join("") + "</select>") +
        '<div class="sm-actions"><button class="sx-btn sx-btn--primary" type="submit" id="swSave">' + (editing ? "Save changes" : "Publish website") + "</button></div></div>";
    };
    el.innerHTML = '<div class="sx-grid sx-grid--split"><form class="sx-card" id="swForm" novalidate></form><section class="sx-card"><div class="sx-card__head"><h2>Your websites</h2></div><div class="sx-card__body" id="swList"></div></section></div>';
    const paintList = () => {
      $("#swList").innerHTML = sites.length ? '<div class="sx-rows">' + sites.map(s => '<div class="sx-row" style="grid-template-columns:minmax(0,1fr)"><div><div class="sx-row__t">' + esc(s.business_name) + '</div><div class="sx-row__s"><a class="sx-link" href="' + esc(siteUrl(s.slug)) + '" target="_blank" rel="noopener">' + esc(siteUrl(s.slug).replace(/^https?:\/\//, "")) + '</a></div></div><div class="sm-btns"><button class="sx-btn sx-btn--sm" data-sw="edit" data-id="' + esc(s.id) + '">Edit</button><button class="sx-btn sx-btn--sm" data-sw="copy" data-id="' + esc(s.id) + '">Copy link</button><button class="sx-btn sx-btn--sm sx-btn--danger" data-sw="del" data-id="' + esc(s.id) + '">Delete</button></div></div>').join("") + "</div>" : empty("No website yet", "Fill in the form to publish a free page for your business.");
    };
    paintForm(); paintList();
    el.onclick = async ev => {
      const b = ev.target.closest("[data-sw]"); if (!b) return;
      const a = b.getAttribute("data-sw"), s = sites.find(x => x.id === b.getAttribute("data-id"));
      if (a === "new") { editing = null; paintForm(); }
      else if (a === "edit" && s) { editing = s; paintForm(); $("#swForm").scrollIntoView({ behavior: "smooth", block: "start" }); }
      else if (a === "copy" && s) { try { await navigator.clipboard.writeText(siteUrl(s.slug)); toast("Link copied", "good"); } catch (e) { toast(siteUrl(s.slug)); } }
      else if (a === "del" && s) {
        if (!(await ask({ title: "Delete this website?", body: "The public page stops working. This cannot be undone.", confirm: "Delete", cancel: "Keep it", danger: true }))) return;
        const { error: e } = await client().from("business_websites").delete().eq("id", s.id).eq("user_id", uid());
        if (e) return void toast(errMsg(e), "bad");
        sites.splice(sites.indexOf(s), 1); if (editing === s) editing = null; paintForm(); paintList(); toast("Website deleted");
      }
    };
    $("#swForm").addEventListener("submit", async ev => {
      ev.preventDefault();
      const name = val("swName").trim(); if (!name) { $("#swName").focus(); return void toast("Enter your business name.", "bad"); }
      const btn = $("#swSave"); btn.disabled = true;
      const row = { business_name: name, description: val("swDesc").trim(), location: val("swLoc").trim(), phone: val("swPhone").trim(), whatsapp: val("swWa").trim(), palette: val("swPal"), template: (editing && editing.template) || "aurora", opening_hours: val("swHours").trim(), status: "published", published_at: new Date().toISOString() };
      try {
        let res;
        if (editing) res = await client().from("business_websites").update(row).eq("id", editing.id).eq("user_id", uid()).select().single();
        else res = await client().from("business_websites").insert({ ...row, user_id: uid(), slug: slugify(name) + "-" + Math.random().toString(36).slice(2, 7) }).select().single();
        if (res.error) throw res.error;
        const i = sites.findIndex(x => x.id === res.data.id); if (i >= 0) sites[i] = res.data; else sites.unshift(res.data);
        editing = res.data; paintForm(); paintList(); toast(i >= 0 ? "Website updated" : "Website published", "good");
      } catch (err) { toast(errMsg(err), "bad"); btn.disabled = false; }
    });
  });

  /* =====================================================
     PICKUP & DELIVERY (per listing)
     ===================================================== */
  SX.register("delivery", "Pickup & delivery", async function (el) {
    el.innerHTML = skel(3);
    const { data: store } = await client().from("stores").select("location").eq("seller_id", uid()).maybeSingle();
    let products = (await D.products(true)).filter(p => p.status !== "archived");
    const paint = () => {
      const on = products.filter(p => p.delivery_available).length;
      el.innerHTML = '<div class="sx-note sx-note--info">Buyers can always collect from your pickup location. Switch <b>delivery</b> on for listings a courier can bring to the buyer. Pickup location defaults to your store address' + (store && store.location ? " (" + esc(store.location) + ")" : "") + ".</div>" +
        '<div class="sx-toolbar" style="margin-top:14px"><b>' + on + " of " + products.length + ' listings offer delivery</b><span class="sx-toolbar__space"></span><button class="sx-btn sx-btn--sm" data-dl="all" type="button">Enable for all</button><button class="sx-btn sx-btn--sm" data-dl="none" type="button">Disable for all</button></div>' +
        (products.length ? '<section class="sx-card"><div class="sx-card__body"><div class="sx-rows">' + products.map(p => '<div class="sx-row sm-dl"><div class="sm-dl__p">' + thumb(p.main_image, p.title) + '<div><div class="sx-row__t">' + esc(p.title) + '</div><div class="sx-row__s">' + esc(U.label(p.status)) + '</div></div></div><label class="sx-field sm-dl__loc">Pickup location<input class="sx-input" data-dl-loc="' + esc(p.id) + '" value="' + esc(p.location || "") + '" maxlength="120" placeholder="' + esc((store && store.location) || "Where buyers collect") + '"></label><label class="sm-switch"><input type="checkbox" data-dl-on="' + esc(p.id) + '"' + (p.delivery_available ? " checked" : "") + '><span>Delivery</span></label></div>').join("") + "</div></div></section>" : empty("No listings yet", "Add a product, then choose how buyers receive it.", '<p><a class="sx-btn sx-btn--primary" href="add-product.html">Add a product</a></p>'));
      hydrate(el);
    };
    paint();
    const save = async (id, patch) => {
      const { error } = await client().from("products").update(patch).eq("id", id).eq("seller_id", uid());
      if (error) throw error;
      const p = products.find(x => x.id === id); if (p) Object.assign(p, patch); D.invalidate();
    };
    el.onchange = async ev => {
      const t = ev.target;
      try {
        if (t.hasAttribute("data-dl-on")) { await save(t.getAttribute("data-dl-on"), { delivery_available: t.checked }); toast(t.checked ? "Delivery on" : "Delivery off", "good"); const b = $(".sx-toolbar b", el); b.textContent = products.filter(p => p.delivery_available).length + " of " + products.length + " listings offer delivery"; }
        else if (t.hasAttribute("data-dl-loc")) { await save(t.getAttribute("data-dl-loc"), { location: t.value.trim() || null }); toast("Pickup location saved", "good"); }
      } catch (err) { toast(errMsg(err), "bad"); paint(); }
    };
    el.onclick = async ev => {
      const b = ev.target.closest("[data-dl]"); if (!b) return;
      const to = b.getAttribute("data-dl") === "all"; b.disabled = true;
      try { for (const p of products) if (!!p.delivery_available !== to) await save(p.id, { delivery_available: to }); toast(to ? "Delivery enabled for all listings" : "Delivery disabled for all listings", "good"); } catch (err) { toast(errMsg(err), "bad"); }
      paint();
    };
  });

  /* =====================================================
     SETTINGS
     ===================================================== */
  const PREF_KEY = "gambasket_seller_settings";
  const NOTIFS = [["newOrder", "New customer orders"], ["buyerMessage", "Buyer messages"], ["lowStock", "Low stock (5 or fewer left)"], ["productApproved", "Listing approved"], ["productRejected", "Listing rejected"], ["payoutUpdate", "Payout updates"]];
  const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } };

  SX.register("settings", "Settings", async function (el) {
    const prefs = readPrefs(), n = prefs.notifications || {}, user = D.user();
    const dark = document.documentElement.classList.contains("dark");
    el.innerHTML = '<div class="sm-stack">' +
      '<section class="sx-card"><div class="sx-card__head"><h2>Notifications</h2></div><div class="sx-card__body"><div class="sm-checks">' + NOTIFS.map(x => '<label class="sm-switch"><input type="checkbox" data-pref="' + x[0] + '"' + (n[x[0]] === false ? "" : " checked") + "><span>" + esc(x[1]) + "</span></label>").join("") + '</div><p class="sx-hint">These preferences are saved on this device.</p></div></section>' +
      '<section class="sx-card"><div class="sx-card__head"><h2>Appearance</h2></div><div class="sx-card__body"><label class="sm-switch"><input type="checkbox" id="stDark"' + (dark ? " checked" : "") + "><span>Dark mode</span></label></div></section>" +
      '<section class="sx-card"><div class="sx-card__head"><h2>Account</h2></div><div class="sx-card__body"><dl class="sx-kv" style="grid-template-columns:auto 1fr"><dt>Signed in as</dt><dd>' + esc(user.email || "—") + '</dd></dl><div class="sm-actions"><a class="sx-btn" href="../me.html">Manage my account</a><a class="sx-btn" href="../help.html">Help &amp; seller guide</a><button class="sx-btn sx-btn--danger" id="stOut" type="button">Sign out</button></div></div></section></div>';
    el.onchange = ev => {
      const t = ev.target;
      if (t.hasAttribute("data-pref")) { const p = readPrefs(); p.notifications = Object.assign({}, p.notifications, { [t.getAttribute("data-pref")]: t.checked }); try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); toast("Saved", "good"); } catch (e) { toast("Couldn't save on this device", "bad"); } }
      else if (t.id === "stDark") { const b = $("#sxTheme"); if (b && document.documentElement.classList.contains("dark") !== t.checked) b.click(); }
    };
    $("#stOut").onclick = async () => { try { await auth().signOut(); } catch (e) { /* redirect anyway */ } location.href = "../login.html"; };
  });

  /* unread badge on the rail, once boot is done */
  (async function () { try { await new Promise(r => { const t = setInterval(() => { if (D.ready) { clearInterval(t); r(); } }, 200); }); const r = await auth().getConversations(); M.list = r.items || []; const n = M.list.reduce((a, c) => a + (c.unread_count || 0), 0); const a = $('#sxNav a[data-route="messages"]'); if (a && n) { a.insertAdjacentHTML("beforeend", '<span class="sx-badge" id="sxBadgeMessages">' + n + "</span>"); } } catch (e) { /* badge is optional */ } })();
})();
