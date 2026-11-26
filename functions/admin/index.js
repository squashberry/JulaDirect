/* Attach the visual-search indexer to the admin directory URL (/admin/). */
export async function onRequest({ next }) {
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
