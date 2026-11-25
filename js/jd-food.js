/* =========================================================
   JulaDirect Food: data layer + feature flag.
   The whole restaurant service is controlled by platform_features.restaurants.
   While it is off (the default) nothing food-related is rendered anywhere.
   Preview without a backend: localStorage.jdFoodDemo = "1" (flag on + demo data).
   ========================================================= */
(function () {
  "use strict";
  const KEY = "jd_food_flag";
  const demo = () => { try { return localStorage.getItem("jdFoodDemo") === "1"; } catch (e) { return false; } };
  const client = async () => { if (!window.GamBasketAuth) return null; await GamBasketAuth.ready(); return GamBasketAuth.getClient(); };
  const slugify = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

  /* ---- flag: cached 5 min so pages never wait on it twice ---- */
  let flagP = null;
  function enabled(force) {
    if (demo()) return Promise.resolve(true);
    if (!force) { try { const c = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (c && Date.now() - c.t < 300000) return Promise.resolve(!!c.v); } catch (e) {} }
    if (flagP && !force) return flagP;
    flagP = (async () => {
      let v = false;
      try { const c = await client(); if (c) { const { data, error } = await c.rpc("food_enabled"); v = !error && data === true; } } catch (e) { v = false; }
      try { sessionStorage.setItem(KEY, JSON.stringify({ v, t: Date.now() })); } catch (e) {}
      return v;
    })();
    return flagP;
  }
  /* Pages that are only for the food service bounce home when it is off. */
  async function guardPage() { if (!(await enabled())) { location.replace("index.html"); return false; } return true; }

  /* ---- demo data ---- */
  const M = (id, category, name, description, price, emoji, extra) => Object.assign({ id, category, name, description, price, emoji, tags: [], spicy: 0, is_available: true, is_featured: false }, extra || {});
  const DEMO = [
    { id: "r1", slug: "kairaba-grill", name: "Kairaba Grill", tagline: "Charcoal, smoke and fresh bread.", cuisines: ["Grill", "Gambian"], location: "Kairaba Avenue, Serrekunda", rating: 4.8, prep_minutes: 25, delivery_fee: 50, min_order: 150, offers_delivery: true, offers_pickup: true, is_open: true, opening_hours: "Daily 11:00 – 23:00", phone: "+2207000000", whatsapp: "+2207000000", description: "Family-run grill house. Everything is cooked to order over charcoal, from whole chicken to fresh fish caught that morning.", hue: 18, status: "approved" },
    { id: "r2", slug: "mama-benachin", name: "Mama's Benachin", tagline: "Home cooking, the way it should taste.", cuisines: ["Gambian", "Rice dishes"], location: "Bakau", rating: 4.9, prep_minutes: 35, delivery_fee: 40, min_order: 100, offers_delivery: true, offers_pickup: true, is_open: true, opening_hours: "Mon–Sat 10:00 – 21:00", phone: "+2207111111", description: "Benachin, domoda and supakanja cooked in big pots by Mama herself.", hue: 38, status: "approved" },
    { id: "r3", slug: "sunset-bites", name: "Sunset Bites", tagline: "Burgers, shawarma and shakes.", cuisines: ["Fast food", "Burgers"], location: "Senegambia", rating: 4.5, prep_minutes: 20, delivery_fee: 60, min_order: 120, offers_delivery: true, offers_pickup: false, is_open: false, opening_hours: "Daily 16:00 – 01:00", phone: "+2207222222", description: "Late-night favourites near the beach.", hue: 340, status: "approved" },
    { id: "r4", slug: "green-bowl", name: "Green Bowl", tagline: "Fresh, light and colourful.", cuisines: ["Healthy", "Salads"], location: "Fajara", rating: 4.7, prep_minutes: 15, delivery_fee: 45, min_order: 90, offers_delivery: true, offers_pickup: true, is_open: true, opening_hours: "Daily 09:00 – 18:00", description: "Bowls, juices and wraps made fresh all day.", hue: 140, status: "approved" }
  ];
  const DEMO_MENU = {
    r1: [M("m1", "Grill", "Charcoal Chicken", "Half chicken marinated overnight in lemon, garlic and thyme, finished over charcoal. Served with fries and onion sauce.", 420, "🍗", { is_featured: true, tags: ["Best seller"], spicy: 1 }), M("m2", "Grill", "Whole Grilled Fish", "Fresh barracuda stuffed with herbs, grilled whole. Comes with rice and salad.", 650, "🐟", { is_featured: true, tags: ["Fresh today"] }), M("m3", "Grill", "Lamb Skewers", "Four juicy skewers with peppers and a smoky pepper sauce.", 380, "🍢", { spicy: 2 }), M("m4", "Sides", "Hand-cut Fries", "Crisp outside, fluffy inside.", 90, "🍟"), M("m5", "Sides", "Fresh Bread", "Warm baguette baked every hour.", 30, "🥖"), M("m6", "Drinks", "Bissap", "Chilled hibiscus with a touch of mint.", 60, "🥤", { tags: ["Local"] }), M("m7", "Drinks", "Ginger Juice", "Fresh pressed, fiery.", 60, "🍹", { spicy: 1 }), M("m8", "Dessert", "Mango Sorbet", "Seasonal mango, nothing else.", 110, "🍨")],
    r2: [M("m9", "Mains", "Benachin", "Jollof-style one-pot rice with fish, vegetables and tomato.", 260, "🍛", { is_featured: true, tags: ["National dish"], spicy: 1 }), M("m10", "Mains", "Domoda", "Rich peanut stew with beef and pumpkin over rice.", 280, "🥘", { is_featured: true }), M("m11", "Mains", "Supakanja", "Okra and palm oil stew with fish and crab.", 300, "🍲", { spicy: 2 }), M("m12", "Drinks", "Baobab Juice", "Creamy and tangy.", 55, "🥛")],
    r3: [M("m13", "Burgers", "Double Smash", "Two smashed patties, cheese, pickles.", 240, "🍔", { is_featured: true }), M("m14", "Wraps", "Chicken Shawarma", "Garlic sauce, pickles, fries inside.", 180, "🌯", { spicy: 1 }), M("m15", "Drinks", "Banana Shake", "Thick and cold.", 100, "🥤")],
    r4: [M("m16", "Bowls", "Rainbow Bowl", "Quinoa, avocado, mango, cabbage, tahini.", 210, "🥗", { is_featured: true, tags: ["Vegan"] }), M("m17", "Bowls", "Grilled Chicken Bowl", "Rice, greens, grilled chicken, lemon dressing.", 230, "🍱"), M("m18", "Drinks", "Green Juice", "Cucumber, apple, mint, lime.", 90, "🧃")]
  };

  /* ---- reads ---- */
  async function restaurants() {
    if (demo()) return DEMO.slice();
    const c = await client(); if (!c) return [];
    const { data, error } = await c.from("restaurants").select("*").eq("status", "approved").order("is_open", { ascending: false }).order("rating", { ascending: false, nullsFirst: false }).limit(60);
    return error ? [] : data || [];
  }
  async function restaurant(slug) {
    if (demo()) return DEMO.find(r => r.slug === slug) || null;
    const c = await client(); if (!c) return null;
    const { data } = await c.from("restaurants").select("*").eq("slug", slug).maybeSingle();
    return data || null;
  }
  async function menu(restaurantId) {
    if (demo()) return (DEMO_MENU[restaurantId] || []).slice();
    const c = await client(); if (!c) return [];
    const { data, error } = await c.from("restaurant_menu_items").select("*").eq("restaurant_id", restaurantId).order("sort").order("created_at");
    return error ? [] : data || [];
  }
  async function featured(limit) {
    if (demo()) return DEMO.flatMap(r => (DEMO_MENU[r.id] || []).filter(m => m.is_featured).map(m => Object.assign({ restaurant: r }, m))).slice(0, limit || 10);
    const c = await client(); if (!c) return [];
    const { data, error } = await c.from("restaurant_menu_items").select("*, restaurant:restaurants!inner(id,name,slug,is_open,status)").eq("is_featured", true).eq("is_available", true).eq("restaurant.status", "approved").limit(limit || 10);
    return error ? [] : data || [];
  }
  async function mine() {
    if (demo()) return DEMO[0];
    const c = await client(); if (!c) return null;
    const s = await GamBasketAuth.getSession(); if (!s?.user) return null;
    const { data } = await c.from("restaurants").select("*").eq("owner_id", s.user.id).maybeSingle();
    return data || null;
  }

  /* ---- writes (owner) ---- */
  async function saveRestaurant(fields) {
    const c = await client(), s = await GamBasketAuth.getSession(); if (!s?.user) throw new Error("Please sign in.");
    const row = Object.assign({}, fields); row.slug = row.slug || slugify(row.name);
    if (row.id) { const { data, error } = await c.from("restaurants").update(row).eq("id", row.id).select().single(); if (error) throw error; return data; }
    row.owner_id = s.user.id;
    const { data, error } = await c.from("restaurants").insert(row).select().single(); if (error) throw error; return data;
  }
  async function saveMeal(rid, fields) {
    const c = await client(), row = Object.assign({}, fields, { restaurant_id: rid });
    if (row.id) { const id = row.id; delete row.id; const { data, error } = await c.from("restaurant_menu_items").update(row).eq("id", id).select().single(); if (error) throw error; return data; }
    const { data, error } = await c.from("restaurant_menu_items").insert(row).select().single(); if (error) throw error; return data;
  }
  async function deleteMeal(id) { const c = await client(); const { error } = await c.from("restaurant_menu_items").delete().eq("id", id); if (error) throw error; }
  async function upload(file) {
    const c = await client(), s = await GamBasketAuth.getSession(); if (!s?.user) throw new Error("Please sign in.");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WEBP photo.");
    if (file.size > 6 * 1024 * 1024) throw new Error("Photo is over 6MB.");
    const path = `${s.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.type.split("/")[1].replace("jpeg", "jpg")}`;
    const { data, error } = await c.storage.from("food-media").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) throw error;
    return c.storage.from("food-media").getPublicUrl(data.path).data.publicUrl;
  }

  /* ---- orders ---- */
  const notReady = e => e && (e.code === "PGRST202" || e.code === "42883" || /place_food_order|food_orders/.test(e.message || ""));
  async function placeOrder(o) {
    const c = await client(); if (!c) throw new Error("Offline");
    const { data, error } = await c.rpc("place_food_order", { p_restaurant: o.restaurant_id, p_items: o.items.map(i => ({ id: i.id, quantity: i.quantity })), p_fulfilment: o.fulfilment, p_name: o.name, p_phone: o.phone, p_address: o.address || "", p_note: o.note || "" });
    if (error) { const err = new Error(error.message || "Could not place order"); err.notReady = notReady(error); throw err; }
    return data;
  }
  async function myOrders() { const c = await client(); if (!c) return []; const { data, error } = await c.from("food_orders").select("*, restaurant:restaurants(name,slug)").order("created_at", { ascending: false }).limit(40); return error ? [] : data || []; }
  async function restaurantOrders(rid, limit) { const c = await client(); const { data, error } = await c.from("food_orders").select("*").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(limit || 120); if (error) throw error; return data || []; }
  async function setOrderStatus(id, status) { const c = await client(); const { error } = await c.from("food_orders").update({ status }).eq("id", id); if (error) throw error; }
  async function subscribeOrders(rid, cb) { const c = await client(); if (!c || !c.channel) return () => {}; const ch = c.channel("food-orders-" + rid).on("postgres_changes", { event: "*", schema: "public", table: "food_orders", filter: "restaurant_id=eq." + rid }, cb).subscribe(); return () => { try { c.removeChannel(ch); } catch (e) {} }; }

  /* ---- admin ---- */
  async function setEnabled(v) { const c = await client(), s = await GamBasketAuth.getSession(); const { error } = await c.from("platform_features").upsert({ key: "restaurants", enabled: !!v, updated_at: new Date().toISOString(), updated_by: s?.user?.id || null }); if (error) throw error; try { sessionStorage.removeItem(KEY); } catch (e) {} flagP = Promise.resolve(!!v); try { window.dispatchEvent(new CustomEvent("jd:food-flag-updated", { detail: { enabled: !!v } })); } catch (e) {} }
  async function adminList() { const c = await client(); const { data, error } = await c.from("restaurants").select("*").order("created_at", { ascending: false }).limit(200); if (error) throw error; return data || []; }
  async function adminSetStatus(id, status) { const c = await client(); const { error } = await c.from("restaurants").update({ status }).eq("id", id); if (error) throw error; }
  async function adminFlag() { const c = await client(); const { data } = await c.from("platform_features").select("enabled").eq("key", "restaurants").maybeSingle(); return !!data?.enabled; }

  /* ---- shared look helpers ---- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = n => "D " + Number(n || 0).toLocaleString("en-GB");
  const safeUrl = u => { if (!u) return ""; try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };
  const hueOf = r => { if (r && r.hue != null) return r.hue; let h = 0; String((r && (r.slug || r.name)) || "").split("").forEach(c => { h = (h * 31 + c.charCodeAt(0)) % 360; }); return h; };

  window.JDFood = { placeOrder, myOrders, restaurantOrders, setOrderStatus, subscribeOrders, client, enabled, guardPage, restaurants, restaurant, menu, featured, mine, saveRestaurant, saveMeal, deleteMeal, upload, slugify, setEnabled, adminList, adminSetStatus, adminFlag, esc, money, safeUrl, hueOf, isDemo: demo };
})();
