import { test, expect } from "@playwright/test";

const PROJECT = "https://iwxcepbwmnnkxocskopx.supabase.co";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const IPHONE_ID = "11111111-1111-4111-8111-111111111111";
const SAMSUNG_ID = "33333333-3333-4333-8333-333333333333";
const SAMSUNG_SELLER_ID = "44444444-4444-4444-8444-444444444444";
const SESSION_KEY = "sb-iwxcepbwmnnkxocskopx-auth-token";

const iphone = {
  id: IPHONE_ID,
  title: "iPhone 13 128GB",
  price: 14500,
  currency: "GMD",
  category_id: "Phones",
  location: "Serrekunda",
  condition: "Like New",
  delivery_available: true,
  main_image: "https://images.example.test/iphone-front.jpg",
  description: "Factory unlocked test listing.",
  attributes: { brand: "Apple", model: "iPhone 13", storage: "128GB", battery_health: 92 },
  stock: 3,
  status: "approved",
  searchable: true,
  sales_count: 7,
  listing_type: "retail",
  seller_id: USER_ID,
  created_at: "2026-10-15T10:00:00.000Z"
};
const samsung = {
  id: SAMSUNG_ID,
  title: "Samsung Galaxy S24",
  price: 22000,
  currency: "GMD",
  category_id: "Phones",
  location: "Brikama",
  condition: "New",
  main_image: "https://images.example.test/samsung-front.jpg",
  description: "Test Samsung phone listing.",
  attributes: { brand: "Samsung", model: "Galaxy S24", storage: "256GB" },
  stock: 5,
  status: "approved",
  searchable: true,
  sales_count: 4,
  listing_type: "retail",
  seller_id: SAMSUNG_SELLER_ID,
  delivery_available: false,
  created_at: "2026-10-14T10:00:00.000Z"
};

function fakeSession() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "fake-gambasket-e2e-access-token",
    refresh_token: "fake-gambasket-e2e-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user: {
      id: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "gambasket-e2e@example.test",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { first_name: "Test", last_name: "Buyer" },
      created_at: "2026-10-01T00:00:00.000Z"
    }
  };
}

async function mockBackend(page, options = {}) {
  const products = options.products || [];
  const gallery = options.gallery || [];
  const cartRows = options.cartRows || [];
  const writes = options.writes || [];
  const authenticated = Boolean(options.authenticated);
  if (authenticated) {
    await page.addInitScript(({ key, session }) => {
      try { localStorage.setItem(key, JSON.stringify(session)); } catch {}
    }, { key: SESSION_KEY, session: fakeSession() });
  }

  await page.route("https://images.example.test/**", route => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" fill="#eef4ff"/></svg>'
  }));

  await page.route("https://iwxcepbwmnnkxocskopx.supabase.co/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
      "access-control-allow-headers": "*",
      "access-control-max-age": "86400"
    };
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors, body: "" });
      return;
    }
    const json = async (body, status = 200, extraHeaders = {}) => route.fulfill({
      status,
      contentType: "application/json",
      headers: { ...cors, ...extraHeaders },
      body: JSON.stringify(body)
    });

    if (path === "/functions/v1/gambasket-modempay-config" && method === "GET") {
      await json({ checkout_enabled: true, payment_methods: ["wave", "qmoney", "afrimoney"], currency: "GMD", provider: "ModemPay" });
      return;
    }
    if (path === "/functions/v1/gambasket-modempay-checkout" && method === "POST") {
      let body = null;
      try { body = request.postDataJSON(); } catch {}
      writes.push({ table: "functions/gambasket-modempay-checkout", body });
      await json({ success: true, payment_url: "https://checkout.modempay.com/test-payment", payment_id: "77777777-7777-4777-8777-777777777777" });
      return;
    }

    if (path === "/auth/v1/settings") {
      await json({
        disable_signup: false,
        mailer_autoconfirm: false,
        phone_autoconfirm: false,
        sms_autoconfirm: false,
        external: { apple: false, azure: false, bitbucket: false, discord: false, facebook: false, github: false, gitlab: false, google: false, keycloak: false, linkedin: false, slack: false, spotify: false, twitch: false, twitter: false, workos: false, zoom: false }
      });
      return;
    }
    if (path === "/auth/v1/user") {
      if (authenticated) { await json(fakeSession().user); return; }
      await json({ code: "invalid_token", message: "No test session" }, 401);
      return;
    }
    if (path.startsWith("/auth/v1/token")) {
      await json({ error: "invalid_grant", error_description: "No exchange in mocked smoke tests" }, 400);
      return;
    }
    if (path.startsWith("/storage/v1/object/product-images/") && method === "POST") {
      const objectPath = path.split("/storage/v1/object/product-images/")[1] || "";
      await json({ Key: "product-images/" + objectPath, Id: "test-object-id", path: objectPath }, 200);
      return;
    }
    if (path === "/rest/v1/products") {
      let matching = [...products];
      const idParam = url.searchParams.get("id") || "";
      if (idParam.startsWith("eq.")) matching = matching.filter(item => item.id === idParam.slice(3));
      if (idParam.startsWith("in.(")) {
        const ids = idParam.slice(4, -1).split(",");
        matching = matching.filter(item => ids.includes(item.id));
      }
      const statusParam = url.searchParams.get("status") || "";
      if (statusParam.startsWith("eq.")) matching = matching.filter(item => item.status === statusParam.slice(3));
      const category = url.searchParams.get("category_id") || "";
      if (category.startsWith("eq.")) matching = matching.filter(item => item.category_id === category.slice(3));
      const location = url.searchParams.get("location") || "";
      if (location.startsWith("ilike.")) {
        const term = location.slice(6).replace(/^%|%$/g, "").toLowerCase();
        matching = matching.filter(item => String(item.location || "").toLowerCase().includes(term));
      }
      if (url.searchParams.get("delivery_available") === "eq.true") {
        matching = matching.filter(item => item.delivery_available === true);
      }
      const stock = url.searchParams.get("stock") || "";
      if (stock.startsWith("gt.")) matching = matching.filter(item => Number(item.stock || 0) > Number(stock.slice(3)));
      const price = url.searchParams.get("price") || "";
      if (price.startsWith("gte.")) matching = matching.filter(item => Number(item.price || 0) >= Number(price.slice(4)));
      if (price.startsWith("lte.")) matching = matching.filter(item => Number(item.price || 0) <= Number(price.slice(4)));
      const condition = url.searchParams.get("condition") || "";
      if (condition.startsWith("eq.")) matching = matching.filter(item => item.condition === condition.slice(3));
      const orFilter = url.searchParams.get("or") || "";
      if (orFilter) {
        const terms = [...orFilter.matchAll(/ilike\.%([^%]+)%/gi)].map(match => match[1].toLowerCase());
        const searchesAttributes = /attributes->>/.test(orFilter);
        if (terms.length) {
          matching = matching.filter(item => {
            const values = [
              item.title, item.description,
              ...(searchesAttributes ? Object.values(item.attributes || {}) : [])
            ].map(value => String(value || "").toLowerCase());
            return terms.some(term => values.some(value => value.includes(term)));
          });
        }
      }
      const accept = request.headers()["accept"] || "";
      if (accept.includes("vnd.pgrst.object+json")) {
        if (matching.length === 1) { await json(matching[0]); return; }
        await json({
          code: "PGRST116",
          details: `The result contains ${matching.length} rows`,
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned"
        }, 406);
        return;
      }
      const range = request.headers()["range"] || "";
      const match = range.match(/(\d+)-(\d+)/);
      const total = matching.length;
      if (match) matching = matching.slice(Number(match[1]), Number(match[2]) + 1);
      const last = matching.length ? Number((match && match[1]) || 0) + matching.length - 1 : 0;
      await json(matching, 200, { "content-range": "0-" + last + "/" + total });
      return;
    }
    if (path === "/rest/v1/product_images") { await json(gallery); return; }
    if (path === "/rest/v1/cart_items") { await json(cartRows); return; }
    if (path === "/rest/v1/marketplace_reviews") { await json([]); return; }
    if (path === "/rest/v1/category_attribute_definitions") { await json([]); return; }
    if (path === "/rest/v1/public_profiles" || path === "/rest/v1/profiles") {
      const publicRows = [
        { id: USER_ID, first_name: "Awa", last_name: "Store", avatar_url: null, area: "Serrekunda", region: "Kanifing", business_name: "Awa Mobile Store", seller_type: "business", is_seller_verified: true, has_business_store: true },
        { id: SAMSUNG_SELLER_ID, first_name: "Individual", last_name: "Seller", avatar_url: null, area: "Brikama", region: "West Coast", business_name: null, seller_type: "individual", is_seller_verified: false, has_business_store: false }
      ];
      const privateRows = [{ id: USER_ID, first_name: "Test", last_name: "Buyer", email: "gambasket-e2e@example.test", phone: "+2207000000", region: "West Coast Region", area: "Brikama", avatar_url: null }];
      let rows = path.endsWith("/public_profiles") ? publicRows : privateRows;
      const idParam = url.searchParams.get("id") || "";
      if (idParam.startsWith("eq.")) rows = rows.filter(item => item.id === idParam.slice(3));
      if (idParam.startsWith("in.(")) {
        const ids = idParam.slice(4,-1).split(",");
        rows = rows.filter(item => ids.includes(item.id));
      }
      const accept = request.headers()["accept"] || "";
      if (accept.includes("vnd.pgrst.object+json")) {
        if (rows.length === 1) await json(rows[0]);
        else await json({ code: "PGRST116", details: `The result contains ${rows.length} rows`, hint: null, message: "No rows found" }, 406);
      } else await json(rows);
      return;
    }
    if (path === "/rest/v1/rpc/gambasket_get_pickup_station_config" && method === "POST") {
      await json({
        available: true,
        stations: [{
          id: "88888888-8888-4888-8888-888888888888",
          station_name: "SRN",
          region: "Greater Banjul Area",
          area: "Banjul",
          address: "SRN, Banjul, The Gambia",
          is_active: true
        }]
      });
      return;
    }
    if (path === "/rest/v1/rpc/gambasket_cod_checkout_eligibility" && method === "POST") {
      await json({
        eligible: true,
        reason: "eligible",
        required_reserve: 725,
        commission_rate: 5
      });
      return;
    }
    if (path === "/rest/v1/rpc/create_order" && method === "POST") {
      let body = null;
      try { body = request.postDataJSON(); } catch {}
      writes.push({ table: "rpc/create_order", body });
      await json({ id: "55555555-5555-4555-8555-555555555555", order_number: "GB-TEST-0001", order_status: "pending", payment_status: "pending", total: 14600, subtotal: 14500, delivery_fee: 100, currency: "GMD" });
      return;
    }
    if (path === "/rest/v1/saved_searches" && method === "POST") {
      let body = null;
      try { body = request.postDataJSON(); } catch {}
      writes.push({ table: "saved_searches", body });
      await json([], 201, { "preference-applied": "return=minimal" });
      return;
    }
    if (path === "/rest/v1/saved_searches" && method === "GET") { await json([]); return; }
    if (path === "/rest/v1/wishlist_alerts") { await json([]); return; }
    if (path === "/rest/v1/growth_notifications") { await json([]); return; }
    if (path.startsWith("/rest/v1/")) {
      if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
        writes.push({ table: path.slice("/rest/v1/".length), method, url: url.href });
        await json([], 201, { "preference-applied": "return=minimal" });
      } else await json([]);
      return;
    }
    if (path.startsWith("/storage/v1/")) {
      await json({ Key: path.split("/").slice(-1)[0] || "object" });
      return;
    }
    await json({});
  });
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", dialog => dialog.dismiss());
  page.on("pageerror", error => console.error("[browser page error]", error.message));
  page.on("console", message => {
    if (message.type() === "error" || message.text().includes("[JulaDirect product")) {
      console.log("[browser console]", message.type(), message.text());
    }
  });
});

test("Persistent navigation enables only the active page styles", async ({ page }) => {
  await mockBackend(page, { products: [iphone], authenticated: true });
  await page.goto("/index.html");

  const media = href => page.locator('link[rel="stylesheet"][href*="' + href + '"]').getAttribute("media");

  await expect.poll(() => media("jd-home2.css")).toBe("all");
  await page.evaluate(() => window.JD.router.navigate("/explore.html"));
  await expect(page).toHaveURL(/\/explore\.html$/);
  await expect.poll(() => media("jd-home2.css")).toBe("not all");
  await expect.poll(() => media("jd-explore2.css")).toBe("all");
  await expect.poll(() => media("jd.css")).toBe("all");

  await page.evaluate(id => window.JD.router.navigate("/product.html?id=" + id), IPHONE_ID);
  await expect(page).toHaveURL(/\/product\.html\?id=/);
  await expect.poll(() => media("jd-explore2.css")).toBe("not all");
  await expect.poll(() => media("jd-pdp.css")).toBe("all");

  await page.evaluate(() => window.JD.router.navigate("/cart.html"));
  await expect(page).toHaveURL(/\/cart\.html$/);
  await expect.poll(() => media("jd-pdp.css")).toBe("not all");
  await expect.poll(() => media("jd.css")).toBe("all");

  const sellerNames = await page.evaluate(() => ({
    business: JD.sellerName({ seller_type: "business", business_name: "Awa Mobile Store", first_name: "Awa", last_name: "Jallow" }),
    individual: JD.sellerName({ seller_type: "individual", business_name: null, first_name: "Awa", last_name: "Jallow" }),
    individualWithLegacyBusinessName: JD.sellerName({ seller_type: "individual", business_name: "Old Store Label", first_name: "Awa", last_name: "Jallow" })
  }));
  expect(sellerNames.business).toBe("Awa Mobile Store");
  expect(sellerNames.individual).toBe("Awa J.");
  expect(sellerNames.individualWithLegacyBusinessName).toBe("Awa J.");
});

test("Fixed mobile purchase bars stay viewport-anchored during persistent route changes", async ({ page }) => {
  await mockBackend(page, { products: [iphone] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/explore.html");
  await page.evaluate(() => localStorage.setItem("gambasket_cart", JSON.stringify([{
    id: "66666666-6666-4666-8666-666666666666",
    name: "Cart test item",
    price: 14500,
    quantity: 1,
    image: "https://images.example.test/cart-item.jpg",
    stock: 3,
    seller: "Test Seller"
  }])));

  await page.evaluate(id => window.JD.router.navigate("/product.html?id=" + id), IPHONE_ID);
  const productBar = page.locator(".pd-buybar");
  await expect(productBar).toBeVisible();
  const productPosition = await productBar.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { position: getComputedStyle(el).position, top: rect.top, bottom: rect.bottom, height: innerHeight };
  });
  expect(productPosition.position).toBe("fixed");
  expect(productPosition.bottom).toBeLessThanOrEqual(productPosition.height);
  expect(productPosition.bottom).toBeGreaterThan(productPosition.height - 100);

  await page.evaluate(() => window.JD.router.navigate("/cart.html"));
  const cartBar = page.locator("#jd-cart .jd-mobilebar");
  await expect(cartBar).toBeVisible();
  const cartPosition = await cartBar.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { position: getComputedStyle(el).position, top: rect.top, bottom: rect.bottom, height: innerHeight };
  });
  expect(cartPosition.position).toBe("fixed");
  expect(cartPosition.bottom).toBeLessThanOrEqual(cartPosition.height);
  expect(cartPosition.bottom).toBeGreaterThan(0);

  await page.evaluate(id => window.JD.router.navigate("/product.html?id=" + id), IPHONE_ID);
  await expect(productBar).toBeVisible();
  const revisitedBottom = await productBar.evaluate(el => el.getBoundingClientRect().bottom);
  expect(revisitedBottom).toBeLessThanOrEqual(844);
  expect(revisitedBottom).toBeGreaterThan(744);
});

test("Rapid navigation waits for an in-flight page initializer instead of interleaving scripts", async ({ page }) => {
  await mockBackend(page, { products: [] });
  await page.route("**/js/jd-cart.js", async route => {
    await new Promise(resolve => setTimeout(resolve, 450));
    await route.continue();
  });
  await page.goto("/explore.html");

  const cartScriptRequest = page.waitForRequest(request =>
    new URL(request.url()).pathname === "/js/jd-cart.js"
  );
  await page.evaluate(() => { void window.JD.router.navigate("/cart.html"); });
  await cartScriptRequest;

  /* The cart page is still initializing when this second navigation is requested. */
  await page.evaluate(() => { void window.JD.router.navigate("/wishlist.html"); });
  await expect(page).toHaveURL(/\/wishlist\.html$/);
  await expect(page.locator("#jd-wl")).toBeVisible();
  await expect(page.locator('.jd-pane[data-route="wishlist"] main h1')).toHaveText("Your wishlist");
  await expect(page.locator("body")).not.toHaveClass(/has-cartbar/);
});

test("Product overlays and scroll locks are cleared when leaving the product pane", async ({ page }) => {
  await mockBackend(page, { products: [iphone] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/product.html?id=" + IPHONE_ID);
  await expect(page.locator("#jd-pdp")).toContainText("iPhone 13 128GB");

  await page.locator(".pd-fab--zoom").click();
  await expect(page.locator(".pd-lb")).toBeVisible();
  expect(await page.locator("html").evaluate(el => el.classList.contains("qv-lock"))).toBe(true);

  await page.evaluate(() => window.JD.router.navigate("/cart.html"));
  await expect(page.locator(".pd-lb")).toHaveCount(0);
  expect(await page.locator("html").evaluate(el => el.classList.contains("qv-lock"))).toBe(false);
});

test("Changing the product URL clears the old mobile purchase-bar state", async ({ page }) => {
  await mockBackend(page, { products: [iphone] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/product.html?id=" + IPHONE_ID);
  await expect(page.locator(".pd-buybar")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/has-mobilebar/);

  await page.evaluate(() => window.JD.router.navigate("/product.html?id=not-a-valid-id"));
  await expect(page.locator("#jd-pdp")).toContainText("This product link is not valid");
  await expect(page.locator(".pd-buybar")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/has-mobilebar/);
});

test("Back and forward navigation restore each route's CSS and body state", async ({ page }) => {
  await mockBackend(page, { products: [iphone] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("gambasket_cart", JSON.stringify([{
    id: "66666666-6666-4666-8666-666666666666", name: "Cart test item", price: 14500,
    quantity: 1, image: "https://images.example.test/cart-item.jpg", stock: 3, seller: "Test Seller"
  }])));
  await page.goto("/explore.html");
  await page.evaluate(() => window.JD.router.navigate("/cart.html"));
  await expect(page.locator("#jd-cart .jd-mobilebar")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/explore\.html$/);
  await expect(page.locator("body")).not.toHaveClass(/has-cartbar/);
  await expect.poll(() => page.locator('link[rel="stylesheet"][href*="jd-explore2.css"]').getAttribute("media")).toBe("all");
  await page.goForward();
  await expect(page).toHaveURL(/\/cart\.html$/);
  await expect(page.locator("#jd-cart .jd-mobilebar")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/has-cartbar/);
  const bar = await page.locator("#jd-cart .jd-mobilebar").evaluate(el => ({
    position: getComputedStyle(el).position,
    bottom: el.getBoundingClientRect().bottom,
    height: innerHeight
  }));
  expect(bar.position).toBe("fixed");
  expect(bar.bottom).toBeLessThanOrEqual(bar.height);
});

test("Explore shows only live approved database listings, not fabricated demo inventory", async ({ page }) => {
  await mockBackend(page, { products: [] });
  await page.goto("/explore.html");
  await expect(page.locator("#productGrid .ex-sugg")).toBeVisible();
  await expect(page.locator("#productGrid .jd-pcard")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("iPhone 13 128GB");
});

test("Brand/model filtering uses actual category attributes", async ({ page }) => {
  await mockBackend(page, { products: [iphone, samsung] });
  await page.goto("/explore.html");
  await expect(page.locator("#productGrid .jd-pcard")).toHaveCount(2);
  await page.locator("#ex-brand").fill("Apple");
  await expect(page.locator("#productGrid .jd-pcard")).toHaveCount(1);
  await expect(page.locator("#productGrid .jd-pcard__title")).toHaveText("iPhone 13 128GB");

  await expect(page).toHaveURL(/brandModel=Apple/);
  const criteria = await page.evaluate(() => new URLSearchParams(location.search).get("brandModel"));
  expect(criteria).toBe("Apple");
});

test("Product detail renders category specifications and switches photo thumbnails", async ({ page }) => {
  await mockBackend(page, {
    products: [iphone],
    gallery: [{ image_url: "https://images.example.test/iphone-back.jpg", sort_order: 1 }],
    authenticated: true
  });
  await page.goto("/product.html?id=" + IPHONE_ID);
  await expect(page.locator("#jd-pdp .pd-title")).toHaveText("iPhone 13 128GB");
  await expect(page.locator("#jd-pdp .pd-specs")).toContainText("Apple");
  await expect(page.locator("#jd-pdp .pd-specs")).toContainText("128GB");
  const main = page.locator("#pd-track .pd-slide img").first();
  await expect(main).toHaveAttribute("src", iphone.main_image);
  const thumbnails = page.locator("#jd-pdp .pd-thumb");
  await expect(thumbnails).toHaveCount(2);
  await thumbnails.nth(1).click();
  await expect(thumbnails.nth(1)).toHaveAttribute("aria-current", "true");
  await expect.poll(() => page.locator("#pd-track").evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
});

test("Removed or unapproved product URLs show an unavailable state instead of sample products", async ({ page }) => {
  await mockBackend(page, { products: [] });
  await page.goto("/product.html?id=" + IPHONE_ID);
  await expect(page.locator("#jd-pdp .pd-state .jd-empty h3")).toHaveText("This product is no longer available");
  await expect(page.locator("#jd-pdp [data-pdp-buy]")).toHaveCount(0);
  await expect(page.locator("#jd-pdp")).not.toContainText("iPhone 13 128GB");
});

test("Comparison page compares approved listings and supports removing one", async ({ page }) => {
  await mockBackend(page, { products: [iphone, samsung], authenticated: true });
  await page.addInitScript(({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)), {
    key: "gambasket_compare_products", ids: [IPHONE_ID, SAMSUNG_ID]
  });
  await page.goto("/compare.html");
  await expect(page.locator("#jd-cmp .jd-cmp")).toBeVisible();
  await expect(page.locator("#jd-cmp")).toContainText("iPhone 13 128GB");
  await expect(page.locator("#jd-cmp")).toContainText("Samsung Galaxy S24");
  await expect(page.locator("#jd-cmp")).toContainText("Battery Health");
  await page.locator("#jd-cmp [data-drop]").first().click();
  await expect(page.locator("#jd-cmp .jd-cmp")).toBeVisible();
  await expect(page.locator("#jd-sub")).toContainText("Add one more to compare");
});

test("Explore compare dock can be opened with a real listing ID", async ({ page }) => {
  await mockBackend(page, { products: [iphone, samsung] });
  await page.goto("/explore.html");
  await expect(page.locator("#productGrid .jd-pcard")).toHaveCount(2);
  await page.locator("#productGrid button[data-compare]").first().click();
  await expect(page.locator("#jd-compare-tray")).toBeVisible();
  await expect(page.locator("#jd-compare-tray")).toContainText("1 selected to compare");
});

test("Authenticated saved-search form writes only the filter criteria contract", async ({ page }) => {
  const writes = [];
  await mockBackend(page, { products: [iphone, samsung], authenticated: true, writes });
  await page.goto("/explore.html?category=Phones&location=Serrekunda&min=10000");
  await page.locator("#ex-brand").fill("Apple");
  await expect(page).toHaveURL(/brandModel=Apple/);
  await page.locator("#jd-save-search").click();
  await expect(page.locator("#jd-save-dialog")).toBeVisible();
  await page.locator("#jd-save-name").fill("Apple phones in Serrekunda");
  await page.locator("#jd-save-confirm").click();
  await expect.poll(() => writes.some(row => row.table === "saved_searches")).toBe(true);
  const insert = writes.find(row => row.table === "saved_searches");
  expect(insert.body.name).toBe("Apple phones in Serrekunda");
  expect(insert.body.criteria.category).toBe("Phones");
  expect(insert.body.criteria.location).toBe("Serrekunda");
  expect(insert.body.criteria.minPrice).toBe(10000);
  expect(insert.body.criteria.brandModel).toBe("Apple");
});

test("Checkout creates an online-only order and opens ModemPay", async ({ page }) => {
  const writes = [];
  const cartRows = [{
    id: "66666666-6666-4666-8666-666666666666",
    user_id: USER_ID,
    product_id: IPHONE_ID,
    quantity: 1,
    product: iphone
  }];
  await mockBackend(page, { products: [iphone], cartRows, authenticated: true, writes });
  await page.route("https://checkout.modempay.com/**", route => route.fulfill({
    status: 200, contentType: "text/html", body: "<title>ModemPay test checkout</title>"
  }));
  await page.goto("/checkout.html");
  await expect(page.locator("#summaryItems")).toContainText("iPhone 13 128GB");
  await expect(page.locator("#cod")).toHaveCount(0);
  await page.locator("#fullName").fill("Test Buyer");
  await page.locator("#email").fill("gambasket-e2e@example.test");
  await page.locator("#phone").fill("+2207000000");
  await page.locator("#region").selectOption({ label: "West Coast Region" });
  await page.locator("#area").fill("Brikama");
  await page.locator("#address").fill("Test Street");
  await page.locator("#placeOrderBtn").click();
  await page.locator("#wave").check();
  await page.locator("#placeOrderBtn").click();
  await page.locator("#placeOrderBtn").click();
  await expect(page).toHaveURL(/checkout\.modempay\.com\/test-payment/);
  const orderCall = writes.find(row => row.table === "rpc/create_order");
  expect(orderCall).toBeTruthy();
  expect(orderCall.body.p_items).toEqual([{ product_id: IPHONE_ID, quantity: 1 }]);
  expect(orderCall.body.p_delivery_area).toBe("Brikama");
  expect(orderCall.body.p_fulfillment_type).toBe("delivery");
  expect(orderCall.body.p_payment_method).toBe("wave");
  const paymentCall = writes.find(row => row.table === "functions/gambasket-modempay-checkout");
  expect(paymentCall.body.payment_method).toBe("wave");
});

test("Pickup station checkout sends the selected station ID and area without a delivery address", async ({ page }) => {
  const writes = [];
  const cartRows = [{
    id: "66666666-6666-4666-8666-666666666666",
    user_id: USER_ID,
    product_id: IPHONE_ID,
    quantity: 1,
    product: iphone
  }];
  await mockBackend(page, { products: [iphone], cartRows, authenticated: true, writes });
  await page.route("https://checkout.modempay.com/**", route => route.fulfill({
    status: 200, contentType: "text/html", body: "<title>ModemPay test checkout</title>"
  }));
  await page.goto("/checkout.html");
  await page.locator("#fullName").fill("Test Buyer");
  await page.locator("#email").fill("gambasket-e2e@example.test");
  await page.locator("#phone").fill("+2207000000");
  await expect(page.locator("#pickup")).toBeEnabled();
  await expect(page.locator("#pickupStationAvailability")).toContainText("1 station");
  await page.locator("#pickup").check();
  await expect(page.locator("#deliveryFields")).toBeHidden();
  await expect(page.locator("#pickupStationFields")).toBeVisible();
  await page.locator("#pickupStationArea").selectOption("Greater Banjul Area|||Banjul");
  await page.locator("#pickupStationSelect").selectOption("88888888-8888-4888-8888-888888888888");
  await expect(page.locator("#pickupStationDetails")).toContainText("SRN, Banjul, The Gambia");
  await expect(page.locator("#summaryDeliveryLabel")).toContainText("Pickup station");
  await page.locator("#placeOrderBtn").click();
  await page.locator("#wave").check();
  await page.locator("#placeOrderBtn").click();
  await page.locator("#placeOrderBtn").click();
  await expect(page).toHaveURL(/checkout\.modempay\.com\/test-payment/);

  const orderCall = writes.find(row => row.table === "rpc/create_order");
  expect(orderCall).toBeTruthy();
  expect(orderCall.body.p_fulfillment_type).toBe("pickup_station");
  expect(orderCall.body.p_pickup_station_id).toBe("88888888-8888-4888-8888-888888888888");
  expect(orderCall.body.p_delivery_region).toBe("Greater Banjul Area");
  expect(orderCall.body.p_delivery_area).toBe("Banjul");
  expect(orderCall.body.p_delivery_address).toBeNull();
  expect(orderCall.body.p_delivery_instructions).toBeNull();

  const paymentCall = writes.find(row => row.table === "functions/gambasket-modempay-checkout");
  expect(paymentCall.body.payment_method).toBe("wave");
});

test("Image upload falls back to Supabase Storage when Cloudinary is unset", async ({ page }) => {
  await mockBackend(page, { authenticated: true });
  await page.goto("/explore.html");
  const result = await page.evaluate(async () => {
    // This test covers the Storage fallback specifically; the shipped public
    // config includes Cloudinary credentials, so disable only its feature flag
    // in this isolated browser context.
    window.GAMBASKET_CONFIG.isCloudinaryConfigured = () => false;
    const file = new File([new Uint8Array([1,2,3])], "test-photo.jpg", { type: "image/jpeg" });
    return await window.GamBasketAuth.uploadImage(file, "products");
  });
  const expected = "/storage/v1/object/public/product-images/" + USER_ID + "/products/.*\\.jpg";
  expect(result).toMatch(new RegExp(expected));
  expect(result).toContain("https://iwxcepbwmnnkxocskopx.supabase.co");
});

test("Quick Sell category selection renders relevant category fields", async ({ page }) => {
  await mockBackend(page, { authenticated: true });
  await page.goto("/quick-sell.html");
  await expect(page.locator("#quickSellAttributes")).toContainText("Brand");
  await expect(page.locator("#quickSellAttributes")).toContainText("Model");
  await page.locator("#quickSellCategory").selectOption("Auto");
  await expect(page.locator("#quickSellAttributes")).toContainText("Mileage (km)");
  await expect(page.locator("#quickSellAttributes")).toContainText("Transmission");
});

test("Verified seller badges and the delivery filter reflect listing data", async ({ page }) => {
  await mockBackend(page, { products: [iphone, samsung] });
  await page.goto("/explore.html");
  const cards = page.locator("#productGrid .jd-pcard");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Verified");
  await expect(cards.nth(0).locator(".jd-pcard__title")).toHaveText("iPhone 13 128GB");
  await expect(cards.nth(1)).not.toContainText("Verified");

  await page.locator("#ex-delivery").check();
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator(".jd-pcard__title")).toHaveText("iPhone 13 128GB");
  await expect(cards.first()).toContainText("Delivery");
});

test("Mobile Explore does not hide the key search/filters controls", async ({ page }) => {
  await mockBackend(page, { products: [iphone, samsung] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/explore.html");
  await expect(page.locator("#ex-filters-open")).toBeVisible();
  await page.locator("#ex-filters-open").click();
  await expect(page.locator("#ex-filters")).toHaveClass(/is-open/);
  await expect(page.locator("#ex-brand")).toBeVisible();
});

test("Checkout offers online payment only and explains the refund request window", async ({ page }) => {
  // Inspect the shipped checkout UI without running authentication or payment JS.
  await page.route("**/js/**", route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: ""
  }));
  await page.goto("/checkout.html");
  await expect(page.locator("#cod")).toHaveCount(0);
  await expect(page.locator("#pickup")).toHaveValue("pickup_station");
  await expect(page.locator("#pickup")).toBeDisabled();
  await expect(page.locator("#pickupStationArea")).toBeDisabled();
  await expect(page.locator("#pickupStationSelect")).toBeDisabled();
  await expect(page.locator("#pickupStationFields")).toContainText("Choose an area");
  await expect(page.locator("#region option")).toHaveCount(3);
  await expect(page.locator("#region")).not.toContainText("North Bank Region");
  await expect(page.locator("#paymentAvailabilityNote")).toContainText("pay securely online");
  await expect(page.locator("#refundWindowNote")).toContainText("submitted within 24 hours");
  await expect(page.locator("#refundWindowNote")).toContainText("All requests are reviewed by JulaDirect");
  for (const id of ["wave", "qmoney", "afrimoney"]) {
    await expect(page.locator(`#${id}`)).toBeDisabled();
    await expect(page.locator(`label[for="${id}"]`)).toContainText("Coming soon");
  }
});

test("Guest cart never invents stock or a seller for stale local snapshots", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gambasket_cart", JSON.stringify([{
      id: "guest-snapshot-product",
      name: "Saved phone snapshot",
      price: 1250,
      quantity: 1,
      image: ""
      // No stock or seller was stored in this older local-cart snapshot.
    }]));
  });
  await mockBackend(page);
  await page.goto("/cart.html");
  await expect(page.locator("#jd-cart .jd-citem")).toContainText("Sign in to verify availability");
  await expect(page.locator("#jd-cart .jd-citem")).toContainText("Seller confirmed after sign-in");
  await expect(page.locator("#jd-cart .jd-citem")).not.toContainText("999 available");
  await expect(page.locator("#jd-cart-sub")).toContainText("Sign in to verify current prices and availability");
});

test("Legacy sample notifications are removed instead of shown as activity", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gambasket_notifications", JSON.stringify([
      { id: "welcome-1", type: "welcome", title: "Welcome to JulaDirect", message: "Discover products", time: new Date().toISOString(), read: false },
      { id: "wishlist-1", type: "wishlist", title: "Build your wishlist", message: "Save products", time: new Date().toISOString(), read: false },
      { id: "explore-1", type: "explore", title: "New products available", message: "Explore products", time: new Date().toISOString(), read: true }
    ]));
  });
  await mockBackend(page, { authenticated: true });
  await page.goto("/messages.html");
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("gambasket_notifications") || "[]"); }
    catch { return null; }
  })).toEqual([]);
});


test("Product details and account pages stay inside the persistent app shell", async ({ page }) => {
  await mockBackend(page, { products: [iphone, samsung] });
  await page.goto("/explore.html");
  await expect(page.locator("#productGrid .jd-pcard")).toHaveCount(2);

  await page.evaluate(() => {
    window.__jdPersistentDocumentProbe = { document, marker: "same-document" };
  });
  /* A card tap opens the quick-view sheet; "View full details" goes to the product page. */
  await page.locator(`#productGrid a[href*="${IPHONE_ID}"]`).first().click();
  await expect(page.locator(".qv [data-qv-details]")).toBeVisible();
  await page.locator(".qv [data-qv-details]").click();
  await expect(page).toHaveURL(new RegExp(`/product\\.html\\?id=${IPHONE_ID}`));
  await expect(page.locator("#jd-pdp")).toContainText("iPhone 13 128GB");
  expect(await page.evaluate(() => window.__jdPersistentDocumentProbe?.document === document)).toBe(true);

  await page.evaluate(id => window.JD.router.navigate(`/product.html?id=${id}`), SAMSUNG_ID);
  await expect(page).toHaveURL(new RegExp(`/product\\.html\\?id=${SAMSUNG_ID}`));
  await expect(page.locator("#jd-pdp")).toContainText("Samsung Galaxy S24");
  expect(await page.evaluate(() => window.__jdPersistentDocumentProbe?.marker)).toBe("same-document");

  await page.evaluate(() => window.JD.router.navigate("/me.html"));
  await expect(page).toHaveURL(/\/me\.html$/);
  await expect(page.locator('.jd-pane[data-route="me"] #jd-main')).toBeVisible();
  expect(await page.evaluate(() => window.__jdPersistentDocumentProbe?.document === document)).toBe(true);
  await expect(page.locator("body")).not.toHaveClass(/jd-pdp-page/);
});


test("Supplier dashboard navigation stays in the same document", async ({ page }) => {
  await page.addInitScript(() => {
    window.__jdSupplierDocument = document;
    window.GamBasketGuard = { gatePage: async () => true, showUnauthorized: () => {} };
    window.GamBasketBusiness = { getCurrentRoles: async () => ["supplier"], getClient: () => ({}) };
    window.GamBasketSellerWallet = { init: async () => {} };
    window.GamBasketSellerEarnings = {
      getFinancialSummary: async () => ({ transactions: [], grossSales: 0, marketplaceFees: 0, availableBalance: 0, pendingBalance: 0 }),
      renderSellerEarnings: () => {}
    };
  });
  await page.route("**/js/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/jd-router.js")) return route.continue();
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });

  await page.goto("/supplier/add-product.html");
  await expect(page.locator("#productForm")).toBeVisible();
  const sameDocument = () => page.evaluate(() => window.__jdSupplierDocument === document);
  expect(await sameDocument()).toBe(true);

  await page.locator('.seller-nav a[href="earnings.html"]').click();
  await expect(page).toHaveURL(/\/supplier\/earnings\.html$/);
  await expect(page.locator('.jd-pane[data-route="supplier/earnings"] .seller-page-title')).toContainText("Earnings");
  expect(await sameDocument()).toBe(true);

  await page.locator('.seller-nav a[href="products.html"]').click();
  await expect(page).toHaveURL(/\/supplier\/products\.html$/);
  await expect(page.locator('.jd-pane[data-route="supplier/products"] .seller-page-title')).toContainText("Products");
  expect(await sameDocument()).toBe(true);

  await page.locator('.seller-nav a[href="add-product.html"]').click();
  await expect(page).toHaveURL(/\/supplier\/add-product\.html$/);
  await expect(page.locator("#productForm")).toBeVisible();
  expect(await sameDocument()).toBe(true);

  await page.goBack();
  await expect(page).toHaveURL(/\/supplier\/products\.html$/);
  expect(await sameDocument()).toBe(true);
});
