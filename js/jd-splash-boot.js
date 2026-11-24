/* JulaDirect app-launch splash.
   Show once per tab session, not once per document load. Safari and Firefox may
   discard a background tab and restore it with a fresh document; sessionStorage
   survives that restore so the app intro is not replayed on every return. */
(function () {
  "use strict";
  var root = document.documentElement;
  var params = new URLSearchParams(location.search);
  var splashParam = params.get("splash");
  var force = splashParam === "1";
  var seenKey = "jd_app_splash_seen_v1";
  if (splashParam === "0" || window.__jdSplashBootStarted) return;

  function hasSeenSplash() {
    try { return window.sessionStorage.getItem(seenKey) === "1"; }
    catch (_) {
      try { return document.cookie.split(";").some(function (part) { return part.trim() === seenKey + "=1"; }); } catch (_) { return false; }
    }
  }
  function markSplashSeen() {
    try { window.sessionStorage.setItem(seenKey, "1"); }
    catch (_) { try { document.cookie = seenKey + "=1; path=/; SameSite=Lax; Secure"; } catch (_) {} }
  }

  if (!force && hasSeenSplash()) return;
  if (navigator.webdriver && !force) return;

  // The router executes pane scripts inside the current document. The intro
  // belongs to the app launch, not a tab activation or a restored page load.
  if (window.JD && window.JD.router) return;

  window.__jdSplashBootStarted = true;
  markSplashSeen();
  root.classList.add("jd-splash-on");

  var style = document.createElement("style");
  style.setAttribute("data-jd-splash-boot", "");
  style.textContent =
    "html.jd-splash-on{background:#fff}" +
    "html.jd-splash-on body{visibility:hidden;animation:jd-sp-fs 0s 9s forwards}" +
    "@keyframes jd-sp-fs{to{visibility:visible}}";
  (document.head || root).appendChild(style);

  var script = document.createElement("script");
  script.src = "/js/jd-splash.js";
  script.async = true;
  script.onerror = function () {
    root.classList.remove("jd-splash-on");
    style.remove();
  };
  (document.head || root).appendChild(script);
})();
