/* JulaDirect app-launch splash.
   Runs once for a real document load on any primary app route.
   Pane HTML is fetched by jd-router after this script has already loaded,
   so switching to Home or another tab never replays the intro. */
(function () {
  "use strict";
  var root = document.documentElement;
  var params = new URLSearchParams(location.search);
  var force = params.get("splash") === "1";
  if (params.get("splash") === "0" || window.__jdSplashBootStarted) return;
  if (navigator.webdriver && !force) return;

  // The router executes page scripts inside the current document for pane
  // navigation. The intro belongs to the app launch, not a tab activation.
  if (window.JD && window.JD.router) return;

  window.__jdSplashBootStarted = true;
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
