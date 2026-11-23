/* Line icon set for the food app (24px grid, 2px round stroke). window.FI(name,size) -> svg string. */
(function () {
  "use strict";
  const P = {
    home: '<path d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.500 1.500H15v-5.500H9v5.500H5.500A1.500 1.500 0 0 1 4 19v-7.800Z"/>',
    receipt: '<path d="M6 3.500h12v17l-3-1.800-3 1.800-3-1.800-3 1.800v-17Z"/><path d="M9 8.500h6M9 12h6"/>',
    heart: '<path d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.200a4.300 4.300 0 0 1 7.500 2.600C19.500 15.400 12 20 12 20Z"/>',
    heartfill: '<path fill="currentColor" d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.200a4.300 4.300 0 0 1 7.500 2.600C19.500 15.400 12 20 12 20Z"/>',
    user: '<circle cx="12" cy="8.200" r="3.800"/><path d="M4.500 20c.7-3.700 3.800-5.800 7.500-5.800s6.800 2.100 7.500 5.800"/>',
    search: '<circle cx="11" cy="11" r="6.500"/><path d="m16 16 4.500 4.500"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.200"/><circle cx="9" cy="17" r="2.200"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="M14.500 5.500 8 12l6.500 6.500"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    phone: '<path d="M6.500 4h3l1.500 4-2 1.300a11 11 0 0 0 5.700 5.700L16 13l4 1.500v3A2.500 2.500 0 0 1 17.500 20 13.500 13.500 0 0 1 4 6.500 2.500 2.500 0 0 1 6.500 4Z"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6.500A1.500 1.500 0 0 0 6.500 20h11a1.500 1.500 0 0 0 1.500-1.500V12"/>',
    clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
    scooter: '<circle cx="6.500" cy="17" r="2.500"/><circle cx="18" cy="17" r="2.500"/><path d="M9 17h6.500l-2.500-8h-3M15 9h3l1 5"/>',
    bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6.500a3 3 0 0 1 6 0V8"/>',
    pin: '<path d="M12 21s6.500-5.500 6.500-11A6.500 6.500 0 0 0 5.500 10c0 5.500 6.500 11 6.500 11Z"/><circle cx="12" cy="10" r="2.300"/>',
    star: '<path fill="currentColor" stroke="none" d="m12 3.500 2.600 5.400 5.900.8-4.300 4.100 1 5.900L12 16.900l-5.200 2.800 1-5.900L3.500 9.700l5.900-.8L12 3.500Z"/>',
    flame: '<path fill="currentColor" stroke="none" d="M12.500 2.500c.4 3-1.500 4.300-2.800 6-1.200 1.500-1.700 3-1.200 4.800-1.400-.8-2-2.300-1.800-3.800C5 11 4 13 4 15a8 8 0 0 0 16 0c0-4.500-3.300-6.500-5-9-.9-1.300-1.800-2.300-2.500-3.500Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
    bolt: '<path d="M13 3 5 13.500h6L10 21l8-10.500h-6L13 3Z"/>',
    utensils: '<path d="M7 3v8M4.500 3v5a2.500 2.500 0 0 0 5 0V3M7 11v10M17 21V3c-2.500 1.500-3.500 4.500-3.500 8H17"/>',
    bowl: '<path d="M3.500 11h17a8.500 8.500 0 0 1-17 0Z"/><path d="M8 20.500h8M9 7c0-1.300 1-1.700 1-3M13 7c0-1.300 1-1.700 1-3"/>',
    burger: '<path d="M4 11a8 6 0 0 1 16 0H4Z"/><path d="M3.500 14.500h17M5 18.500h14a1.500 1.500 0 0 0 1.500-1.500v-.5h-17v.5A1.500 1.500 0 0 0 5 18.500Z"/>',
    leaf: '<path d="M5 19c0-9 5-14 15-14 0 9-4.500 14-12.500 14M5 19c2-4 5-7 9-9"/>',
    cup: '<path d="M6 8h12l-1.300 12H7.300L6 8Z"/><path d="M5 8h14M13 8l2-5"/>',
    fish: '<path d="M3 12c3-5 8-6.500 13-4.500l5-2.500-1.500 5 1.500 5-5-2.500C11 14.500 6 17 3 12Z"/><circle cx="8" cy="11" r=".6" fill="currentColor"/>',
    cake: '<path d="M4 20h16v-6H4v6ZM4 14c1.500 0 1.500 1.500 3 1.500S8.500 14 10 14s1.500 1.500 3 1.500S14.500 14 16 14s1.500 1.500 4 0M12 10V6M12 6c-1 0-1.500-1-1-2 .7.4 1.300.8 1 2Z"/>',
    grid: '<rect x="4" y="4" width="6.500" height="6.500" rx="1.800"/><rect x="13.500" y="4" width="6.500" height="6.500" rx="1.800"/><rect x="4" y="13.500" width="6.500" height="6.500" rx="1.800"/><rect x="13.500" y="13.500" width="6.500" height="6.500" rx="1.800"/>',
    spark: '<path fill="currentColor" stroke="none" d="M12 3c.6 4.600 2.400 6.400 7 7-4.600.6-6.400 2.400-7 7-.6-4.600-2.400-6.400-7-7 4.600-.6 6.400-2.400 7-7Z"/>',
    drop: '<path fill="currentColor" stroke="none" d="M12 3c3.500 4.200 5.500 7 5.500 9.800a5.500 5.500 0 0 1-11 0C6.500 10 8.500 7.200 12 3Z"/>',
    store: '<path d="M4 9.500 5.500 4h13L20 9.500M4 9.500v1a2.500 2.500 0 0 0 5 0 2.500 2.500 0 0 0 6 0 2.500 2.500 0 0 0 5 0v-1M5.500 12.800V20h13v-7.200M10 20v-4.500h4V20"/>',
    chef: '<path d="M7 14V19h10v-5M7.500 14A4 4 0 1 1 9 6.200a3.500 3.500 0 0 1 6 0A4 4 0 1 1 16.500 14"/>'
  };
  /* An illustrated plate used wherever a meal has no photo yet. */
  const PLATE = '<circle cx="60" cy="60" r="54" fill="#fff" opacity=".92"/><circle cx="60" cy="60" r="54" fill="none" stroke="#fff" stroke-width="3"/><circle cx="60" cy="60" r="38" fill="none" stroke="#ffd3b0" stroke-width="2.500"/><circle cx="60" cy="60" r="32" fill="#ffb066"/><circle cx="52" cy="54" r="10" fill="#f26a00"/><circle cx="68" cy="58" r="8" fill="#7cc576"/><circle cx="58" cy="70" r="9" fill="#ffd56b"/><circle cx="72" cy="70" r="5" fill="#e0452f"/>';
  window.FI = function (name, size) {
    const s = size || 22;
    if (name === "plate") return `<svg class="fi fi-plate" viewBox="0 0 120 120" width="${s}" height="${s}" aria-hidden="true">${PLATE}</svg>`;
    return `<svg class="fi" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`;
  };
  FI.hydrate = root => (root || document).querySelectorAll("[data-i]").forEach(el => { el.innerHTML = FI(el.dataset.i, Number(el.dataset.s) || 22); });
  /* Cuisine / category -> icon */
  FI.cuisine = c => { c = String(c || "").toLowerCase(); return /burger|fast/.test(c) ? "burger" : /health|salad|vegan|veg/.test(c) ? "leaf" : /fish|sea/.test(c) ? "fish" : /drink|juice|shake|bar/.test(c) ? "cup" : /dessert|cake|sweet|bak/.test(c) ? "cake" : /rice|bowl|stew|gambian|soup|pasta/.test(c) ? "bowl" : /^all$/.test(c) ? "grid" : "utensils"; };
})();
