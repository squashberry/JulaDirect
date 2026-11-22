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
     MESSAGES: the exact customer chat (messages.html), embedded, so a seller sees the
     same conversations, product cards and quick replies a buyer does.
     ===================================================== */
  SX.register("messages", "Messages", async function (el) {
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    const extra = ["conversation", "product"].filter(k => q.get(k)).map(k => "&" + k + "=" + encodeURIComponent(q.get(k))).join("");
    el.innerHTML = '<div class="sm-chat"><iframe title="Messages" src="../messages.html?embed=1' + extra + '" loading="eager"></iframe></div>';
  });

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
        (products.length ? '<section class="sx-card"><div class="sx-card__body"><div class="sx-rows">' + products.map(p => '<div class="sx-row sm-dl"><div class="sm-dl__p">' + thumb(p.main_image, p.title) + '<div><div class="sx-row__t">' + esc(p.title) + '</div><div class="sx-row__s">' + esc(U.label(p.status)) + '</div></div></div><label class="sx-field sm-dl__loc">Pickup location<input class="sx-input" data-dl-loc="' + esc(p.id) + '" value="' + esc(p.location || "") + '" maxlength="120" placeholder="' + esc((store && store.location) || "Where buyers collect") + '"></label><label class="sm-switch"><input type="checkbox" data-dl-on="' + esc(p.id) + '"' + (p.delivery_available ? " checked" : "") + '><span>Delivery</span></label></div>').join("") + "</div></div></section>" : empty("No listings yet", "Add a product, then choose how buyers receive it.", '<p><a class="sx-btn sx-btn--primary" href="#/add">Add a product</a></p>'));
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
      '<section class="sx-card"><div class="sx-card__head"><h2>Account</h2></div><div class="sx-card__body"><dl class="sx-kv" style="grid-template-columns:auto 1fr"><dt>Signed in as</dt><dd>' + esc(user.email || "—") + '</dd></dl><div class="sm-actions"><a class="sx-btn" href="#/help">Seller guide</a><button class="sx-btn sx-btn--danger" id="stOut" type="button">Sign out</button></div></div></section></div>';
    el.onchange = ev => {
      const t = ev.target;
      if (t.hasAttribute("data-pref")) { const p = readPrefs(); p.notifications = Object.assign({}, p.notifications, { [t.getAttribute("data-pref")]: t.checked }); try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); toast("Saved", "good"); } catch (e) { toast("Couldn't save on this device", "bad"); } }
      else if (t.id === "stDark") { const b = $("#sxTheme"); if (b && document.documentElement.classList.contains("dark") !== t.checked) b.click(); }
    };
    $("#stOut").onclick = async () => { try { await auth().signOut(); } catch (e) { /* redirect anyway */ } location.href = "../login.html"; };
  });

  /* =====================================================
     ADD / EDIT PRODUCT
     ===================================================== */
  const CATS = [["Phones", "Phones & tablets"], ["Electronics", "Electronics & computers"], ["Fashion", "Fashion & clothing"], ["Home", "Home & kitchen"], ["Beauty", "Beauty & personal care"], ["Food", "Food & groceries"], ["Solar", "Solar & energy"], ["Auto", "Vehicles & auto parts"], ["Hardware", "Hardware & tools"], ["Baby", "Baby & kids"], ["Sports", "Sports & fitness"]];
  const CONDS = [["New", "New"], ["Like New", "Like new"], ["Refurbished", "Refurbished"], ["Used - Good", "Used — good"], ["Used - Fair", "Used — fair"]];
  const opts = (list, cur) => list.map(o => '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("");
  const FEE = 5;

  SX.register("add", "Add product", async function (el) {
    const id = new URLSearchParams(location.hash.split("?")[1] || "").get("id");
    let p = null;
    if (id) { const { data, error } = await client().from("products").select("*").eq("id", id).eq("seller_id", uid()).maybeSingle(); if (error) throw error; p = data; if (!p) return void (el.innerHTML = empty("Product not found", "It may have been removed.", '<p><a class="sx-btn" href="#/products">Back to products</a></p>')); }
    p = p || {};
    let photos = [];   /* {url, file?} ; first is the main photo */
    if (p.id) {
      const { data: extra } = await client().from("product_images").select("image_url,sort_order").eq("product_id", p.id).order("sort_order");
      photos = [p.main_image, ...(extra || []).map(x => x.image_url)].filter(Boolean).filter((u, i, a) => a.indexOf(u) === i).map(url => ({ url }));
    }
    const attrBox = document.createElement("div");
    el.innerHTML = '<form class="sx-grid sx-grid--split" id="apForm" novalidate><div class="sm-stack" style="max-width:none">' +
      '<section class="sx-card"><div class="sx-card__head"><h2>' + (p.id ? "Edit product" : "Add a product") + '</h2>' + (p.id ? '<span class="sx-pill">' + esc(U.label(p.status)) + "</span>" : "") + '</div><div class="sx-card__body sm-form">' +
      field("Product name", input("apTitle", p.title, { req: 1, max: 100, ph: "e.g. iPhone 13, 128GB, blue" })) +
      '<div class="sm-two">' + field("Category", '<select class="sx-select" id="apCat">' + opts(CATS, p.attributes && p._cat || p.category_id || "Phones") + "</select>") + field("Condition", '<select class="sx-select" id="apCond">' + opts(CONDS, p.condition || "Used - Good") + "</select>") + "</div>" +
      '<div class="sm-two">' + field("Price (GMD)", input("apPrice", p.price, { type: "number", ph: "0" })) + field("Stock", input("apStock", p.stock == null ? 1 : p.stock, { type: "number", ph: "1" })) + "</div>" +
      field("Description", '<textarea class="sx-textarea" id="apDesc" rows="5" maxlength="2000" placeholder="Condition, what is included, anything a buyer should know">' + esc(p.description || "") + "</textarea>") +
      field("Pickup location", input("apLoc", p.location || (U.state.store && U.state.store.location), { max: 120, ph: "e.g. Serrekunda" })) +
      '<label class="sm-switch"><input type="checkbox" id="apDel"' + (p.delivery_available ? " checked" : "") + "><span>Offer delivery for this product</span></label></div></section>" +
      '<section class="sx-card"><div class="sx-card__body" id="apAttrs"></div></section></div>' +
      '<aside class="sm-stack" style="max-width:none"><section class="sx-card"><div class="sx-card__head"><h2>Photos</h2><span class="sx-hint" style="margin:0">Up to 8 · first is the cover</span></div><div class="sx-card__body"><div class="sm-photos" id="apPhotos"></div><input type="file" id="apFile" accept="image/jpeg,image/png,image/webp,image/gif" multiple class="sx-sr"></div></section>' +
      '<section class="sx-card"><div class="sx-card__body"><dl class="sx-kv" style="grid-template-columns:1fr auto"><dt>Price</dt><dd id="apPv">—</dd><dt>Est. fee (' + FEE + '%)</dt><dd id="apFee">—</dd><dt>You receive</dt><dd id="apNet"><b>—</b></dd></dl><p class="sx-hint">Estimate only. New listings and price changes are reviewed before buyers see them.</p>' +
      '<div class="sm-actions"><button class="sx-btn sx-btn--primary" type="submit" id="apSave">' + (p.id ? "Save changes" : "Submit for review") + '</button><a class="sx-btn" href="#/products">Cancel</a></div></div></section></aside></form>';
    const paintPhotos = () => {
      $("#apPhotos").innerHTML = photos.map((x, i) => '<figure class="sm-ph' + (i === 0 ? " is-main" : "") + '"><span style="background-image:url(&quot;' + esc(x.url) + '&quot;)"></span>' + (i ? '<button type="button" data-ph="main" data-i="' + i + '" title="Make cover">★</button>' : '<em>Cover</em>') + '<button type="button" data-ph="del" data-i="' + i + '" aria-label="Remove photo">×</button></figure>').join("") +
        (photos.length < 8 ? '<label class="sm-ph sm-ph--add" for="apFile"><span>+</span>Add photo</label>' : "");
    };
    paintPhotos();
    $("#apPhotos").onclick = ev => { const b = ev.target.closest("[data-ph]"); if (!b) return; const i = +b.getAttribute("data-i"); if (b.getAttribute("data-ph") === "del") photos.splice(i, 1); else photos.unshift(photos.splice(i, 1)[0]); paintPhotos(); };
    $("#apFile").onchange = ev => {
      for (const f of Array.from(ev.target.files)) {
        if (photos.length >= 8) break;
        if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type) || f.size > 5 * 1024 * 1024) { toast("Use JPG, PNG, WEBP or GIF under 5MB.", "bad"); continue; }
        photos.push({ url: URL.createObjectURL(f), file: f });
      }
      ev.target.value = ""; paintPhotos();
    };
    const attrs = window.GamBasketProductAttributes;
    const paintAttrs = () => { const box = $("#apAttrs"); if (attrs && attrs.render) attrs.render(box, val("apCat"), p.attributes || {}); else box.innerHTML = '<p class="sx-hint">No extra details for this category.</p>'; };
    paintAttrs();
    $("#apCat").addEventListener("change", () => { p.attributes = {}; paintAttrs(); });
    const calc = () => { const v = U.num(val("apPrice")); $("#apPv").textContent = v ? U.money(v) : "—"; $("#apFee").textContent = v ? U.money(v * FEE / 100) : "—"; $("#apNet").innerHTML = "<b>" + (v ? U.money(v - v * FEE / 100) : "—") + "</b>"; };
    $("#apPrice").addEventListener("input", calc); calc();

    $("#apForm").addEventListener("submit", async ev => {
      ev.preventDefault();
      const title = val("apTitle").trim(), price = U.num(val("apPrice")), stock = Math.max(0, Math.floor(U.num(val("apStock")))), desc = val("apDesc").trim(), loc = val("apLoc").trim();
      if (!title) { $("#apTitle").focus(); return void toast("Give your product a name.", "bad"); }
      if (!(price > 0)) { $("#apPrice").focus(); return void toast("Enter a price above zero.", "bad"); }
      if (!desc) { $("#apDesc").focus(); return void toast("Add a short description.", "bad"); }
      if (!photos.length) return void toast("Add at least one photo.", "bad");
      if (!loc) { $("#apLoc").focus(); return void toast("Add a pickup location.", "bad"); }
      const btn = $("#apSave"), label = btn.textContent; btn.disabled = true; btn.textContent = "Saving…";
      try {
        const urls = [];
        for (const x of photos) urls.push(x.file ? await auth().uploadImage(x.file, "products") : x.url);
        const attributes = attrs && attrs.read ? attrs.read($("#apAttrs")) : (p.attributes || {});
        const row = { title, price, currency: "GMD", category_id: val("apCat"), attributes, description: desc, condition: val("apCond"), stock, location: loc, delivery_available: $("#apDel").checked, main_image: urls[0] };
        let pid = p.id;
        if (pid) { const { error } = await client().from("products").update(row).eq("id", pid).eq("seller_id", uid()); if (error) throw error; await client().from("product_images").delete().eq("product_id", pid); }
        else { const { data, error } = await client().from("products").insert({ ...row, status: "pending_review", seller_id: uid() }).select("id").single(); if (error) throw error; pid = data.id; }
        if (urls.length > 1) { const { error } = await client().from("product_images").insert(urls.slice(1).map((image_url, i) => ({ product_id: pid, image_url, sort_order: i + 1 }))); if (error) throw new Error("Saved, but the extra photos could not be attached: " + error.message); }
        D.invalidate(); toast(p.id ? "Product updated" : "Submitted for review. It goes live once approved.", "good");
        location.hash = "#/products";
      } catch (err) {
        const m = errMsg(err); toast(/seller or supplier|row-level security/i.test(m) ? "Your account isn't enabled to sell yet. Complete seller verification first." : m, "bad");
        btn.disabled = false; btn.textContent = label;
      }
    });
  });

  /* =====================================================
     PAYOUTS (wallet, payout methods, withdrawals)
     ===================================================== */
  document.addEventListener("click", ev => { if (window.__poOpen) window.__poOpen(ev); });
  const NETS = { wave: "Wave", afrimoney: "Afrimoney" };
  SX.register("payouts", "Payouts", async function (el) {
    el.innerHTML = skel(3);
    const c = client();
    const [w, m, r, pf] = await Promise.all([c.rpc("seller_get_wallet_summary"), c.from("seller_payout_methods").select("id,network,account_number,beneficiary_name,verification_status,is_primary,created_at").order("created_at", { ascending: false }), c.from("seller_payout_requests").select("id,amount,status,requested_at").order("requested_at", { ascending: false }).limit(20), c.from("seller_wallet_preferences").select("auto_payout_enabled,auto_payout_threshold,payout_method_id").maybeSingle()]);
    for (const x of [w, m, r, pf]) if (x.error) throw new Error(/function|does not exist|schema cache/i.test(x.error.message || "") ? "Payouts need the wallet database update to be applied." : x.error.message);
    const sum = (Array.isArray(w.data) ? w.data[0] : w.data) || {}, methods = m.data || [], reqs = r.data || [], pref = pf.data || {};
    const active = methods.filter(x => x.verification_status === "active");
    const mask = n => "••••" + String(n).slice(-3);
    const tone = { active: "good", pending_verification: "warn", rejected: "bad", disabled: "bad" };
    const canPay = active.length > 0;
    el.innerHTML = '<div class="sx-toolbar"><div><b style="font-size:15px">Your wallet</b></div><span class="sx-toolbar__space"></span><button class="sx-btn" type="button" data-po="method">Payout methods</button><button class="sx-btn" type="button" data-po="auto">Automatic payouts</button><button class="sx-btn sx-btn--primary" type="button" data-po="withdraw">Withdraw</button></div>' +
      '<div class="sx-grid sx-grid--kpi">' + [["Available", sum.available_balance, "Ready to withdraw"], ["Pending", sum.pending_balance, "Released after delivery"], ["In transit", sum.payout_in_transit, "Being paid out"], ["Withdrawn", sum.withdrawn_total, "All time"]].map(k => '<div class="sx-kpi"><div class="sx-kpi__label">' + k[0] + '</div><div class="sx-kpi__value">' + U.money(k[1]) + '</div><div class="sx-kpi__meta">' + k[2] + "</div></div>").join("") + "</div>" +
      '<section class="sx-card" style="margin-top:16px"><div class="sx-card__head"><h2>Recent payouts</h2></div><div class="sx-card__body">' + (reqs.length ? '<div class="sx-rows">' + reqs.map(x => '<div class="sx-row" style="grid-template-columns:1fr auto"><div><div class="sx-row__t">' + U.money(x.amount) + '</div><div class="sx-row__s">' + esc(U.dayTime(x.requested_at)) + '</div></div><span class="sx-pill sx-pill--' + ({ paid: "good", completed: "good", failed: "bad", rejected: "bad" }[x.status] || "info") + '">' + esc(U.label(x.status)) + "</span></div>").join("") + "</div>" : empty("No payouts yet", "Tap Withdraw to move your available balance to Wave or Afrimoney.")) + "</div></section>";

    const fail = e => toast(/INSUFFICIENT/.test(e.message || "") ? "That is more than your available balance." : errMsg(e), "bad");
    const refresh = () => (SX.reload ? SX.reload() : location.reload());
    const methodsHtml = () => methods.length ? '<div class="sx-rows">' + methods.map(x => '<div class="sx-row" style="grid-template-columns:1fr auto"><div><div class="sx-row__t">' + esc(NETS[x.network] || x.network) + " " + esc(mask(x.account_number)) + '</div><div class="sx-row__s">' + esc(x.beneficiary_name) + '</div></div><span class="sx-pill sx-pill--' + (tone[x.verification_status] || "") + '">' + esc(U.label(x.verification_status)) + "</span></div>").join("") + "</div>" : "";

    function openWithdraw() {
      const body = canPay ? '<form class="sm-wd" id="poReq"><div class="sm-wd__bal"><span>Available to withdraw</span><b>' + U.money(sum.available_balance) + "</b></div>" + field("Amount (GMD)", input("poAmt", "", { type: "number", ph: "0" })) + '<div class="sm-quick"><button type="button" class="sx-chip" data-po-fill="all">All</button><button type="button" class="sx-chip" data-po-fill="half">Half</button></div>' + field("Send to", '<select class="sx-select" id="poMethod">' + active.map(x => '<option value="' + esc(x.id) + '">' + esc(NETS[x.network] || x.network) + " " + esc(mask(x.account_number)) + " · " + esc(x.beneficiary_name) + "</option>").join("") + "</select>") + '<button class="sx-btn sx-btn--primary" id="poGo" type="submit">Request payout</button><p class="sx-hint" style="margin:0">The amount is reserved from your balance right away. Payouts usually arrive within a day.</p></form>'
        : '<div class="sm-wd"><p style="margin:0;color:var(--sx-ink-2)">' + (methods.length ? "Your payout method is waiting for approval. You can withdraw as soon as it is active." : "Add a Wave or Afrimoney number first, then you can withdraw.") + '</p><button class="sx-btn sx-btn--primary" type="button" data-po="method">' + (methods.length ? "View payout methods" : "Add payout method") + "</button></div>";
      U.openDrawer("Withdraw", body, "");
      const f = $("#poReq"); if (!f) return;
      $$("[data-po-fill]", f).forEach(b => b.onclick = () => { const a = U.num(sum.available_balance); $("#poAmt").value = b.getAttribute("data-po-fill") === "all" ? a : Math.floor(a / 2); });
      f.addEventListener("submit", async ev => {
        ev.preventDefault(); const amt = U.num(val("poAmt")); if (!(amt > 0)) return void toast("Enter an amount.", "bad");
        const btn = $("#poGo"); btn.disabled = true; btn.textContent = "Requesting…";
        const { error } = await c.rpc("seller_request_payout", { p_amount: amt, p_payout_method_id: val("poMethod"), p_idempotency_key: "web-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2)) });
        if (error) { btn.disabled = false; btn.textContent = "Request payout"; return void fail(error); }
        U.closeDrawer(); toast("Payout requested", "good"); refresh();
      });
    }
    function openMethods() {
      U.openDrawer("Payout methods", '<div class="sm-wd">' + methodsHtml() + '<form class="sm-form" id="poAdd"><b>Add a method</b><div class="sm-two">' + field("Network", '<select class="sx-select" id="poNet"><option value="wave">Wave</option><option value="afrimoney">Afrimoney</option></select>') + field("Mobile number", input("poNum", "", { type: "tel", max: 20, ph: "+2207000000" })) + "</div>" + field("Account holder name", input("poName", "", { max: 120 })) + '<button class="sx-btn sx-btn--primary" type="submit" id="poAddGo">Add payout method</button><p class="sx-hint" style="margin:0">New methods are reviewed by JulaDirect before you can withdraw to them.</p></form></div>', "");
      $("#poAdd").addEventListener("submit", async ev => {
        ev.preventDefault(); const btn = $("#poAddGo"); btn.disabled = true;
        const { error } = await c.rpc("seller_add_payout_method", { p_network: val("poNet"), p_account_number: val("poNum"), p_beneficiary_name: val("poName") });
        if (error) { btn.disabled = false; return void toast(/valid|Enter|Unsupported/.test(error.message) ? error.message : errMsg(error), "bad"); }
        U.closeDrawer(); toast("Payout method added. It's awaiting approval.", "good"); refresh();
      });
    }
    function openAuto() {
      U.openDrawer("Automatic payouts", '<div class="sm-form"><label class="sm-switch"><input type="checkbox" id="poAuto"' + (pref.auto_payout_enabled ? " checked" : "") + "><span>Pay out automatically</span></label>" + field("When available balance reaches (GMD)", input("poThr", pref.auto_payout_threshold || "", { type: "number" })) + (canPay ? "" : '<p class="sx-hint" style="margin:0">You need an approved payout method first.</p>') + '<button class="sx-btn sx-btn--primary" id="poPref" type="button">Save</button></div>', "");
      $("#poPref").onclick = async () => {
        const { error } = await c.rpc("seller_update_wallet_preferences", { p_auto_payout_enabled: $("#poAuto").checked, p_auto_payout_threshold: U.num(val("poThr")) || null, p_payout_method_id: (active.find(x => x.is_primary) || active[0] || {}).id || null });
        if (error) return void fail(error); U.closeDrawer(); toast("Automatic payout settings saved", "good");
      };
    }
    el.onclick = ev => { const b = ev.target.closest("[data-po]"); if (b) ({ withdraw: openWithdraw, method: openMethods, auto: openAuto })[b.getAttribute("data-po")](); };
    window.__poOpen = ev => { const b = ev.target.closest("[data-po]"); if (b && b.closest("#sxDrawer")) ({ method: openMethods })[b.getAttribute("data-po")](); };
  });

  /* =====================================================
     HELP
     ===================================================== */
  const GUIDE = [["Get your first order", ["Add a product with clear photos, a fair price and an honest condition.", "Listings are reviewed before buyers see them, usually quickly.", "Keep stock accurate so buyers never order what you don't have."]], ["Handle an order", ["Confirm new orders promptly from Orders.", "Mark them ready for pickup or delivery as they progress.", "Delivery orders are collected by a courier with a code the buyer shows."]], ["Get paid", ["Earnings are held until the order is delivered, then become available.", "Add a Wave or Afrimoney payout method under Payouts and wait for approval.", "Request a payout whenever you like, or turn on automatic payouts."]], ["Win trust", ["Reply to messages quickly: buyers see the product you're discussing.", "Answer reviews politely from the Reviews page.", "Complete seller verification to earn the verified badge."]]];
  SX.register("help", "Seller guide", async function (el) {
    el.innerHTML = '<div class="sm-stack">' + GUIDE.map(g => '<section class="sx-card"><div class="sx-card__head"><h2>' + esc(g[0]) + '</h2></div><div class="sx-card__body"><ul class="sm-list">' + g[1].map(t => "<li>" + esc(t) + "</li>").join("") + "</ul></div></section>").join("") + '<p class="sx-hint">Need a hand? Message JulaDirect support from your account and we will help.</p></div>';
  });

  /* unread badge on the rail */
  (async function () { try { const t0 = Date.now(); while (!(D.user && D.user()) && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 300)); const r = await auth().getConversations(); const n = (r.items || []).reduce((a, c) => a + (c.unread_count || 0), 0); const a = $('#sxNav a[data-route="messages"]'); if (a && n) a.insertAdjacentHTML("beforeend", '<span class="sx-badge">' + n + "</span>"); } catch (e) { /* badge is optional */ } })();
})();
