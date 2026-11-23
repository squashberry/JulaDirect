/* Account page: "Restaurant dashboard" row, only when the restaurant service is on. */
(function () {
  "use strict";
  if (!window.JDFood) return;
  JDFood.enabled().then(on => {
    if (!on || document.getElementById("ac-food-row")) return;
    const after = document.querySelector('.ac-row[href="orders.html"]'); if (!after) return;
    const a = document.createElement("a"); a.className = "ac-row"; a.id = "ac-food-row"; a.href = "restaurant-studio.html";
    a.innerHTML = '<span class="ac-ico" data-ico="package"></span><span class="ac-row__t"><b>Restaurant dashboard</b><small>Create a restaurant, manage your menu and orders.</small></span><span class="ac-chev" data-ico="chevronRight" data-size="18"></span>';
    after.after(a); if (window.JD && JD.icon) a.querySelectorAll("[data-ico]").forEach(el => { el.innerHTML = JD.icon(el.getAttribute("data-ico"), Number(el.getAttribute("data-size")) || 20); });
  }).catch(() => {});
})();
