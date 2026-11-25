/* JulaDirect service worker: conservative app shell.
   - HTML pages and css/js: network first, so a new deploy is never masked by a
     stale copy; the cache is only the offline fallback.
   - Images and fonts: cache first, refreshed in the background.
   - Never touches cross-origin requests (Supabase, payments, image CDNs),
     non-GET requests, or anything under /api. Bump VERSION to invalidate.
   To remove it, deploy a sw.js that calls self.registration.unregister(). */
const VERSION = "jd-v2-15";
const PAGES = VERSION + "-pages";
const STATIC = VERSION + "-static";
const OFFLINE = "/offline.html";
const OFFLINE_ALIAS = "/offline";

const EMERGENCY_OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>You're Offline — JulaDirect</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f8fafc;color:#0f172a;font:16px system-ui,-apple-system,Segoe UI,sans-serif}
main{width:min(520px,100%);padding:34px 26px;text-align:center;background:#fff;border:1px solid #e2e8f0;border-radius:24px;box-shadow:0 18px 50px #0f172a12}
.mark{width:86px;height:86px;margin:0 auto 22px;border-radius:26px;background:linear-gradient(145deg,#3b82f6,#1d4ed8);color:#fff;display:grid;place-items:center;font-size:42px;font-weight:900}
.kicker{color:#2563eb;font-size:11px;font-weight:800;letter-spacing:.14em}
h1{font-size:clamp(30px,7vw,42px);letter-spacing:-.05em;margin:12px 0}
p{line-height:1.7;color:#64748b}
button,a{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:12px;font-weight:750;text-decoration:none}
button{border:0;background:#2563eb;color:white;cursor:pointer}a{margin-top:10px;border:1px solid #e2e8f0;color:#0f172a}
</style></head><body><main><div class="mark">J</div><div class="kicker">CONNECTION LOST</div><h1>Oops, you're offline.</h1>
<p>JulaDirect can't reach the marketplace right now. Recheck your connection and try again.</p>
<button onclick="location.reload()">Try Again</button><br><a href="/">Back to JulaDirect</a></main></body></html>`;

async function cacheOfflinePage() {
  const cache = await caches.open(PAGES);
  let response;
  try {
    response = await fetch(OFFLINE, { cache: "reload" });
    if (!response.ok) throw new Error("Offline page returned HTTP " + response.status);
  } catch (error) {
    response = new Response(EMERGENCY_OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  await cache.put(OFFLINE, response.clone());
  await cache.put(OFFLINE_ALIAS, response.clone());
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    await cacheOfflinePage();
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.indexOf(VERSION) !== 0) await caches.delete(k);
    await self.clients.claim();
  })());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error("timeout")), ms); promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); }); });
}
async function networkFirst(event, cacheName, ms, alwaysTimeout) {
  const cache = await caches.open(cacheName);
  /* Only give up on the network when a cached copy exists to fall back to.
     With nothing cached, wait for the network: failing a stylesheet or script
     after a timeout leaves the page rendering as unstyled HTML. */
  const hasCopy = !!(await cache.match(event.request));
  try {
    const fetching = fetch(event.request);
    const res = (hasCopy || alwaysTimeout) ? await withTimeout(fetching, ms) : await fetching;
    if (res && res.ok && res.type === "basic") event.waitUntil(cache.put(event.request, res.clone()));
    return res;
  } catch (err) {
    const hit = await cache.match(event.request);
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(event.request);
  const refresh = fetch(event.request).then(res => { if (res && res.ok) cache.put(event.request, res.clone()); return res; }).catch(() => null);
  if (hit) { event.waitUntil(refresh); return hit; }
  return (await refresh) || Response.error();
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf("/api/") === 0) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(event, PAGES, 8000, true).catch(async () => {
      const c = await caches.open(PAGES);
      return (await c.match(OFFLINE)) || (await c.match(OFFLINE_ALIAS)) ||
        new Response(EMERGENCY_OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }));
    return;
  }
  if (/^\/(css|js)\//.test(url.pathname)) { event.respondWith(networkFirst(event, STATIC, 3500).catch(() => Response.error())); return; }
  if (/\.(?:svg|png|jpe?g|webp|gif|ico|woff2?)$/i.test(url.pathname) || url.pathname === "/manifest.webmanifest") { event.respondWith(cacheFirst(event)); }
});
