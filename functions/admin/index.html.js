/* Attach the visual-search catalogue indexer to the authenticated admin dashboard.
   The original admin bundle remains untouched. */
export async function onRequest({ request, next }) {
  const page = await next();
  const contentType = page.headers.get("Content-Type") || "";
  if (!page.ok || !contentType.toLowerCase().includes("text/html")) return page;

  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append('<script src="/js/jd-visual-indexer.js" defer></script>', { html: true });
      },
    })
    .transform(page);
}
