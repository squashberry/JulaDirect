/* Backfill approved JulaDirect catalogue images when a product reviewer opens Admin. */
(function () {
  "use strict";
  if (window.__jdVisualIndexBackfillStarted) return;
  window.__jdVisualIndexBackfillStarted = true;

  async function currentAccessToken() {
    const auth = window.GamBasketAuth;
    if (!auth) return null;
    await auth.ready();
    const current = await auth.getSession();
    return current && current.access_token ? current.access_token : null;
  }

  async function sync(body, token) {
    const res = await fetch("/api/visual-search", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(Object.assign({ action: "sync" }, body)),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 207) {
      const error = new Error(payload.error || "Visual-search catalogue indexing failed.");
      error.status = res.status;
      throw error;
    }
    return payload;
  }

  async function backfill(token) {
    let offset = 0;
    for (let page = 0; page < 50; page++) {
      const result = await sync({ offset: offset, limit: 20 }, token);
      if (result.done) {
        window.dispatchEvent(new CustomEvent("jd:visual-index-ready", { detail: result }));
        return;
      }
      const next = Number(result.nextOffset);
      if (!Number.isFinite(next) || next <= offset) return;
      offset = next;
    }
  }

  (async function () {
    try {
      const token = await currentAccessToken();
      if (!token) return;
      await backfill(token);

      /* A newly approved listing is indexed immediately, without waiting for a second dashboard visit. */
      document.addEventListener("click", function (event) {
        const button = event.target && event.target.closest && event.target.closest("[data-approve-product]");
        if (!button) return;
        const productId = button.getAttribute("data-approve-product");
        if (!productId) return;
        window.setTimeout(function () {
          sync({ productIds: [productId] }, token).catch(function (error) {
            console.warn("[JulaDirect] Could not refresh the visual index for this listing:", error.message);
          });
        }, 1800);
      }, true);
    } catch (error) {
      /* The endpoint rejects non-reviewers; do not block or disturb the admin dashboard. */
      if (error.status !== 403) console.warn("[JulaDirect] Visual-search indexing deferred:", error.message);
    } finally {
      window.__jdVisualIndexBackfillStarted = false;
    }
  })();
})();
