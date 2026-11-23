/* Restaurant dashboard: create the restaurant, edit the profile, manage the menu. */
(async function () {
  "use strict";
  if (!(await JDFood.guardPage())) return;
  const { esc, money } = JDFood, root = document.getElementById("fs-root"), $ = (s, r) => (r || document).querySelector(s);
  const toast = m => { const t = document.createElement("div"); t.className = "fs-toast"; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };
  const demo = JDFood.isDemo();
  if (!demo) { await GamBasketAuth.ready(); const s = await GamBasketAuth.getSession(); if (!s?.user) { location.href = "login.html?redirect=" + encodeURIComponent(location.pathname); return; } }
  let R = await JDFood.mine(), menu = [];
  const BANNER = { pending: "Waiting for approval. Your restaurant will appear to customers once JulaDirect approves it.", approved: "You're live. Customers can see your menu.", suspended: "Your restaurant is suspended. Contact JulaDirect support." };
  const field = (n, l, v, extra) => `<label>${l}<input name="${n}" value="${esc(v == null ? "" : v)}" ${extra || ""}></label>`;
  async function pick(input) { const f = input.files[0]; if (!f) return null; try { toast("Uploading…"); return await JDFood.upload(f); } catch (e) { toast(e.message || "Upload failed"); return null; } }

  async function render() {
    if (!R) return root.innerHTML = `<section class="fs-card"><h2>Create your restaurant</h2><p style="margin-top:0;color:#66759a">Tell customers who you are. JulaDirect reviews new restaurants before they go live.</p><form id="f-new" class="fs-grid">${field("name", "Restaurant name", "", "required minlength=2 maxlength=80")}${field("tagline", "Tagline", "")}${field("cuisines", "Cuisines (comma separated)", "", "placeholder='Grill, Gambian'")}${field("location", "Location", "")}${field("phone", "Phone", "", "type=tel")}${field("whatsapp", "WhatsApp number (for orders)", "", "type=tel")}<button class="fs-btn" type="submit">Create restaurant</button></form></section>`, $("#f-new").addEventListener("submit", async e => {
      e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true; const f = Object.fromEntries(new FormData(e.target));
      try { R = await JDFood.saveRestaurant({ name: f.name.trim(), tagline: f.tagline, cuisines: f.cuisines.split(",").map(x => x.trim()).filter(Boolean), location: f.location, phone: f.phone, whatsapp: f.whatsapp }); toast("Restaurant created"); render(); } catch (er) { toast(er.message || "Could not create"); b.disabled = false; }
    });
    menu = await JDFood.menu(R.id);
    root.innerHTML = `<div class="fs-banner fs-banner--${esc(R.status)}">${R.status === "approved" ? "✅" : R.status === "pending" ? "⏳" : "⛔"} ${esc(BANNER[R.status] || "")}</div>
    <section class="fs-card"><div class="fs-row"><h2 style="margin:0;flex:1">${esc(R.name)}</h2><label class="fs-chk"><input type="checkbox" id="open" ${R.is_open ? "checked" : ""}> Open for orders</label><a class="fs-btn fs-btn--ghost" style="text-decoration:none" href="restaurant.html?slug=${encodeURIComponent(R.slug)}">View page</a></div></section>
    <section class="fs-card"><h2>Profile</h2><form id="f-prof" class="fs-grid fs-grid--2">${field("name", "Name", R.name, "required")}${field("tagline", "Tagline", R.tagline)}${field("cuisines", "Cuisines", (R.cuisines || []).join(", "))}${field("location", "Location", R.location)}${field("phone", "Phone", R.phone, "type=tel")}${field("whatsapp", "WhatsApp (orders)", R.whatsapp, "type=tel")}${field("opening_hours", "Opening hours", R.opening_hours, "placeholder='Daily 11:00 – 23:00'")}${field("prep_minutes", "Prep time (min)", R.prep_minutes, "type=number min=1")}${field("delivery_fee", "Delivery fee (D)", R.delivery_fee, "type=number min=0")}${field("min_order", "Minimum order (D)", R.min_order, "type=number min=0")}<label>Logo<input type="file" name="logo" accept="image/*"></label><label>Cover photo<input type="file" name="cover" accept="image/*"></label><label style="grid-column:1/-1">About<textarea name="description" rows="3">${esc(R.description || "")}</textarea></label><label class="fs-chk"><input type="checkbox" name="offers_delivery" ${R.offers_delivery ? "checked" : ""}> Delivery</label><label class="fs-chk"><input type="checkbox" name="offers_pickup" ${R.offers_pickup ? "checked" : ""}> Pickup</label><button class="fs-btn" type="submit" style="grid-column:1/-1">Save profile</button></form></section>
    <section class="fs-card"><div class="fs-row"><h2 style="margin:0;flex:1">Menu (${menu.length})</h2><button class="fs-btn" id="m-new" type="button">+ Add meal</button></div><div id="m-form"></div><div id="m-list">${menu.map(m => `<div class="fs-meal"><span class="fs-meal__e">${JDFood.safeUrl(m.image_url) ? `<img src="${esc(JDFood.safeUrl(m.image_url))}" alt="">` : esc(m.emoji || "🍽️")}</span><div><b>${esc(m.name)}</b> <small>· ${esc(m.category)}</small><br><small>${money(m.price)}${m.is_available === false ? " · sold out" : ""}${m.is_featured ? " · featured" : ""}</small></div><button class="fs-btn fs-btn--ghost" data-e="${esc(m.id)}" type="button">Edit</button></div>`).join("") || '<p style="color:#66759a">No meals yet. Add your first one.</p>'}</div></section>`;
    $("#open").addEventListener("change", async e => { try { await JDFood.saveRestaurant({ id: R.id, is_open: e.target.checked }); R.is_open = e.target.checked; toast(R.is_open ? "You're open" : "You're closed"); } catch (er) { toast(er.message); e.target.checked = !e.target.checked; } });
    $("#f-prof").addEventListener("submit", async e => {
      e.preventDefault(); const b = e.target.querySelector("[type=submit]"); b.disabled = true; const fd = new FormData(e.target), f = Object.fromEntries(fd);
      try {
        const patch = { id: R.id, name: f.name.trim(), tagline: f.tagline, cuisines: f.cuisines.split(",").map(x => x.trim()).filter(Boolean), location: f.location, phone: f.phone, whatsapp: f.whatsapp, opening_hours: f.opening_hours, description: f.description, prep_minutes: Number(f.prep_minutes) || 25, delivery_fee: Number(f.delivery_fee) || 0, min_order: Number(f.min_order) || 0, offers_delivery: !!f.offers_delivery, offers_pickup: !!f.offers_pickup };
        const lg = await pick(e.target.logo), cv = await pick(e.target.cover); if (lg) patch.logo_url = lg; if (cv) patch.cover_url = cv;
        R = await JDFood.saveRestaurant(patch); toast("Saved"); render();
      } catch (er) { toast(er.message || "Could not save"); b.disabled = false; }
    });
    $("#m-new").addEventListener("click", () => mealForm({}));
    $("#m-list").addEventListener("click", e => { const b = e.target.closest("[data-e]"); if (b) mealForm(menu.find(m => String(m.id) === b.dataset.e)); });
  }
  function mealForm(m) {
    const box = $("#m-form"); box.innerHTML = `<form id="f-meal" class="fs-grid fs-grid--2" style="padding:14px 0 18px;border-bottom:1px solid #eef1f8;margin-bottom:6px">${field("name", "Meal name", m.name, "required")}${field("category", "Category", m.category || "Mains", "required list=cats")}<datalist id="cats">${[...new Set(menu.map(x => x.category))].map(c => `<option value="${esc(c)}">`).join("")}</datalist>${field("price", "Price (D)", m.price, "type=number min=0 step=1 required")}${field("emoji", "Emoji (shown if no photo)", m.emoji, "maxlength=4 placeholder='🍛'")}${field("tags", "Tags (comma separated)", (m.tags || []).join(", "))}<label>Spice level<select name="spicy">${[0, 1, 2, 3].map(n => `<option value="${n}" ${Number(m.spicy || 0) === n ? "selected" : ""}>${["Not spicy", "Mild 🌶️", "Hot 🌶️🌶️", "Very hot 🌶️🌶️🌶️"][n]}</option>`).join("")}</select></label><label>Photo<input type="file" name="photo" accept="image/*"></label><label style="grid-column:1/-1">Description<textarea name="description" rows="2">${esc(m.description || "")}</textarea></label><label class="fs-chk"><input type="checkbox" name="is_available" ${m.is_available !== false ? "checked" : ""}> Available</label><label class="fs-chk"><input type="checkbox" name="is_featured" ${m.is_featured ? "checked" : ""}> Feature on home</label><div class="fs-row" style="grid-column:1/-1"><button class="fs-btn" type="submit">${m.id ? "Save meal" : "Add meal"}</button><button class="fs-btn fs-btn--ghost" type="button" id="m-cancel">Cancel</button>${m.id ? '<button class="fs-btn fs-btn--red" type="button" id="m-del">Delete</button>' : ""}</div></form>`;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("#m-cancel").onclick = () => { box.innerHTML = ""; };
    if (m.id) $("#m-del").onclick = async () => { if (!confirm("Delete this meal?")) return; try { await JDFood.deleteMeal(m.id); toast("Deleted"); render(); } catch (er) { toast(er.message); } };
    $("#f-meal").addEventListener("submit", async e => {
      e.preventDefault(); const b = e.target.querySelector("[type=submit]"); b.disabled = true; const f = Object.fromEntries(new FormData(e.target));
      try {
        const row = { id: m.id, name: f.name.trim(), category: f.category.trim() || "Mains", price: Number(f.price), emoji: f.emoji || null, tags: f.tags.split(",").map(x => x.trim()).filter(Boolean), spicy: Number(f.spicy), description: f.description, is_available: !!f.is_available, is_featured: !!f.is_featured };
        const ph = await pick(e.target.photo); if (ph) row.image_url = ph; if (!row.id) delete row.id;
        await JDFood.saveMeal(R.id, row); toast("Saved"); render();
      } catch (er) { toast(er.message || "Could not save"); b.disabled = false; }
    });
  }
  render();
})();
