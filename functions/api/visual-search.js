const MODEL = "@cf/google/embeddinggemma-2";
const MAX_SEARCH_BYTES = 5 * 1024 * 1024;
const MAX_INDEX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_INDEX_PAGE = 20;

function response(request, payload, status = 200, extra = {}) {
  const origin = new URL(request.url).origin;
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Vary": "Origin",
    ...extra,
  });
  return new Response(status === 204 ? null : JSON.stringify(payload), { status, headers });
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function asDataUri(bytes, mime) {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

function cleanText(value, max = 600) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function supabaseConfig(env, request) {
  if (env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) {
    return { url: env.SUPABASE_URL.replace(/\/$/, ""), key: env.SUPABASE_PUBLISHABLE_KEY };
  }
  if (!env.ASSETS?.fetch) throw new Error("Supabase public configuration is unavailable.");
  const asset = await env.ASSETS.fetch(new URL("/js/config.js", request.url));
  if (!asset.ok) throw new Error("Supabase public configuration could not be loaded.");
  const source = await asset.text();
  const url = source.match(/SUPABASE_URL\s*:\s*["']([^"']+)["']/);
  const key = source.match(/SUPABASE_PUBLISHABLE_KEY\s*:\s*["']([^"']+)["']/);
  if (!url || !key) throw new Error("Supabase public configuration is incomplete.");
  return { url: url[1].replace(/\/$/, ""), key: key[1] };
}

async function reviewerUser(request, config) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1];
  const headers = { apikey: config.key, Authorization: `Bearer ${token}`, Accept: "application/json" };

  const userResponse = await fetch(`${config.url}/auth/v1/user`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  if (!user?.id) return null;

  const permissionResponse = await fetch(`${config.url}/rest/v1/rpc/has_permission`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: user.id, p_permission: "products.review" }),
    signal: AbortSignal.timeout(8000),
  });
  if (!permissionResponse.ok) return null;
  if ((await permissionResponse.json()) !== true) return null;
  return { id: user.id, token, headers };
}

async function loadProducts(config, reviewer, options) {
  const params = new URLSearchParams({
    select: "id,title,description,category_id,main_image",
    status: "eq.approved",
    main_image: "not.is.null",
    order: "created_at.asc",
  });
  if (options.productIds) {
    params.set("id", `in.(${options.productIds.join(",")})`);
    params.set("limit", String(options.productIds.length));
  } else {
    params.set("limit", String(options.limit));
    params.set("offset", String(options.offset));
  }

  const res = await fetch(`${config.url}/rest/v1/products?${params}`, {
    headers: { ...reviewer.headers, Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Product catalogue lookup failed (${res.status}).`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows.filter(row => row.id && row.main_image) : [];
}

function allowedImageUrl(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:") return false;
  if (url.hostname === "res.cloudinary.com" || url.hostname === "images.unsplash.com") return true;
  if (url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/")) return true;
  return false;
}

async function productImage(product) {
  if (!allowedImageUrl(product.main_image)) return null;
  const res = await fetch(product.main_image, {
    headers: { Accept: "image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.1" },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok || !allowedImageUrl(res.url)) return null;
  const mime = (res.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return null;
  const length = Number(res.headers.get("Content-Length") || 0);
  if (length > MAX_INDEX_IMAGE_BYTES) return null;
  const buffer = await res.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > MAX_INDEX_IMAGE_BYTES) return null;
  return asDataUri(new Uint8Array(buffer), mime);
}

function modelConversation(imageUrl, text) {
  const content = [];
  if (text) content.push({ type: "text", text });
  content.push({ type: "image_url", image_url: { url: imageUrl } });
  return [{ role: "user", content }];
}

async function syncIndex(request, env, config, reviewer, body) {
  const requestedIds = Array.isArray(body.productIds)
    ? [...new Set(body.productIds.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))].slice(0, 20)
    : null;
  if (Array.isArray(body.productIds) && !requestedIds.length) {
    return response(request, { ok: true, indexed: 0, skipped: 0, deleted: 0, done: true });
  }

  const limit = requestedIds ? requestedIds.length : Math.max(1, Math.min(24, Number(body.limit) || DEFAULT_INDEX_PAGE));
  const offset = requestedIds ? 0 : Math.max(0, Math.min(1000000, Math.floor(Number(body.offset) || 0)));
  const products = await loadProducts(config, reviewer, { productIds: requestedIds, limit, offset });
  const approvedIds = new Set(products.map(product => product.id));
  let deleted = 0;

  if (requestedIds) {
    const noLongerApproved = requestedIds.filter(id => !approvedIds.has(id));
    if (noLongerApproved.length) {
      await env.VECTORIZE.deleteByIds(noLongerApproved);
      deleted = noLongerApproved.length;
    }
  }

  if (!products.length) {
    return response(request, {
      ok: true, indexed: 0, skipped: 0, deleted,
      nextOffset: requestedIds ? null : offset,
      done: true,
    });
  }

  const existingResponse = await env.VECTORIZE.getByIds(products.map(product => product.id));
  const existing = Array.isArray(existingResponse)
    ? existingResponse
    : (existingResponse?.vectors || existingResponse?.result?.vectors || []);
  const currentById = new Map(existing.map(vector => [vector.id, vector]));
  const changed = products.filter(product => currentById.get(product.id)?.metadata?.image_url !== product.main_image);
  let indexed = 0;
  let failed = 0;

  for (let offsetInPage = 0; offsetInPage < changed.length; offsetInPage += 8) {
    const page = changed.slice(offsetInPage, offsetInPage + 8);
    const prepared = await Promise.all(page.map(async product => {
      try {
        const image = await productImage(product);
        return image ? { product, image } : null;
      } catch {
        return null;
      }
    }));
    const valid = prepared.filter(Boolean);
    failed += page.length - valid.length;
    if (!valid.length) continue;

    const embedded = await env.AI.run(MODEL, {
      messages: valid.map(({ product, image }) => modelConversation(
        image,
        `title: ${cleanText(product.title, 180)} | text: Category ${cleanText(product.category_id, 80)}. ${cleanText(product.description, 500)}`
      )),
      dimensions: 768,
    });
    const data = embedded?.data || [];
    const vectors = valid.map(({ product }, i) => ({
      id: product.id,
      values: data[i]?.embedding,
      metadata: {
        image_url: product.main_image,
        category: cleanText(product.category_id, 80),
        status: "approved",
      },
    })).filter(vector => Array.isArray(vector.values) && vector.values.length === 768);

    if (vectors.length) {
      await env.VECTORIZE.upsert(vectors);
      indexed += vectors.length;
      failed += valid.length - vectors.length;
    } else {
      failed += valid.length;
    }
  }

  const nextOffset = requestedIds ? null : offset + products.length;
  const done = requestedIds ? true : products.length < limit;
  return response(request, {
    ok: failed === 0,
    indexed,
    skipped: products.length - changed.length,
    failed,
    deleted,
    nextOffset,
    done,
  }, failed ? 207 : 200);
}

async function searchImage(request, env, form) {
  const file = form.get("image");
  if (!file || typeof file.arrayBuffer !== "function") {
    return response(request, { error: "Choose a photo before searching." }, 400);
  }
  if (!String(file.type || "").startsWith("image/")) {
    return response(request, { error: "The uploaded file must be an image." }, 415);
  }
  if (file.size > MAX_SEARCH_BYTES) {
    return response(request, { error: "That photo is too large. Please use an image under 5 MB." }, 413);
  }
  const mime = ["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase())
    ? file.type.toLowerCase()
    : null;
  if (!mime) return response(request, { error: "Please use a JPG, PNG or WebP image." }, 415);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SEARCH_BYTES) {
    return response(request, { error: "The uploaded photo could not be read." }, 400);
  }
  const hint = cleanText(form.get("hint"), 180);
  const result = await env.AI.run(MODEL, {
    messages: [modelConversation(
      asDataUri(bytes, mime),
      `task: search result | query: ${hint ? `products visually similar to the pictured item. Additional shopper clue: ${hint}` : "products visually similar to the pictured item"}`
    )],
    dimensions: 768,
  });
  const embedding = result?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== 768) {
    throw new Error("The image model returned an unexpected embedding.");
  }

  const matches = await env.VECTORIZE.query(embedding, { topK: 30 });
  const rows = (matches?.matches || [])
    .filter(match => match && match.id && Number.isFinite(Number(match.score)))
    .map(match => ({ id: match.id, score: Number(match.score) }));
  return response(request, { ok: true, matches: rows });
}

export async function onRequestOptions({ request }) {
  return response(request, {}, 204);
}

export async function onRequestGet({ request, env }) {
  return response(request, {
    ok: true,
    configured: !!(env.AI && env.VECTORIZE),
    model: MODEL,
    dimensions: 768,
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.AI || !env.VECTORIZE) {
    return response(request, { error: "Visual search is not yet available on this deployment." }, 503);
  }

  try {
    const contentType = request.headers.get("Content-Type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      return await searchImage(request, env, form);
    }

    if (!contentType.includes("application/json")) {
      return response(request, { error: "Unsupported request format." }, 415);
    }
    const body = await request.json();
    if (body?.action !== "sync") {
      return response(request, { error: "Unsupported visual-search action." }, 400);
    }

    const config = await supabaseConfig(env, request);
    const reviewer = await reviewerUser(request, config);
    if (!reviewer) {
      return response(request, { error: "Marketplace product-review permission is required to index catalogue images." }, 403);
    }
    return await syncIndex(request, env, config, reviewer, body);
  } catch (error) {
    console.error("[JulaDirect visual search]", error?.message || error);
    return response(request, { error: "Visual search could not complete this request. Please retry." }, 502);
  }
}
