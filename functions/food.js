/* Clean SEO URL for the food app.
   /food serves the food.html application without changing the public URL.
   The food page owns its canonical URL and dynamic restaurant discovery. */
export async function onRequestGet({ request, env, next }) {
  try {
    const target = new URL("/food.html", request.url);
    const response = await env.ASSETS.fetch(new Request(target, {
      method: "GET",
      headers: { "Accept": request.headers.get("Accept") || "text/html" }
    }));
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("Cache-Control", "public, max-age=60, s-maxage=600, stale-while-revalidate=1800");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    return next();
  }
}
