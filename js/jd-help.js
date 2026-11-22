(function () {
  "use strict";
  const JD = window.JD;
  if (!JD || window.__jdHelpBound) return;
  window.__jdHelpBound = true;

  const input = document.getElementById("helpSearch");
  const clear = document.getElementById("helpSearchClear");
  const count = document.getElementById("helpSearchCount");
  const form = document.getElementById("helpSearchForm");
  const items = Array.from(document.querySelectorAll("[data-help-item]"));
  const groups = Array.from(document.querySelectorAll("[data-help-section]"));
  const empty = document.createElement("div");
  empty.className = "jh-empty";
  empty.hidden = true;
  empty.textContent = "No matching help articles. Try another keyword or contact Customer Care.";
  const content = document.querySelector(".jh-faq-content");
  if (content) content.appendChild(empty);

  function filterArticles() {
    const query = (input?.value || "").trim().toLowerCase();
    let matches = 0;
    items.forEach(item => {
      const haystack = ((item.getAttribute("data-help-search") || "") + " " + item.textContent).toLowerCase();
      const found = !query || haystack.includes(query);
      item.hidden = !found;
      if (found) matches++;
    });
    groups.forEach(group => {
      const visible = group.querySelectorAll("[data-help-item]:not([hidden])").length;
      group.hidden = !!query && visible === 0;
    });
    if (empty) empty.hidden = !query || matches > 0;
    if (count) {
      count.textContent = query
        ? matches + " matching " + (matches === 1 ? "article" : "articles") + " across guides and FAQs."
        : "Search across guides and frequently asked questions.";
    }
    if (clear) clear.hidden = !query;
  }

  const runFilter = JD.debounce(filterArticles, 90);
  input?.addEventListener("input", runFilter);
  form?.addEventListener("submit", event => { event.preventDefault(); filterArticles(); });
  clear?.addEventListener("click", () => {
    if (input) { input.value = ""; input.focus(); }
    filterArticles();
  });

  document.querySelectorAll(".jh-faq summary").forEach(summary => {
    summary.addEventListener("keydown", event => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const visible = Array.from(document.querySelectorAll(".jh-faq summary"))
        .filter(node => !node.closest(".jh-faq")?.hidden);
      const index = visible.indexOf(summary);
      const next = visible[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) { event.preventDefault(); next.focus(); }
    });
  });

  JD.mountShell({ active: "" });
})();