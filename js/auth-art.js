/* Brand panel for the login / signup / reset pages. Decoration only (aria-hidden). */
(function () {
  var page = document.querySelector(".auth-page"); if (!page || page.querySelector(".auth-art")) return;
  var p = location.pathname, sub = /signup/.test(p) ? "Create your account and start buying or selling in minutes." : /reset/.test(p) ? "Choose a new password and get straight back to shopping." : "Shop from local sellers, pay on delivery and run your business from one place.";
  var ic = {
    phone: '<rect x="7" y="3" width="10" height="18" rx="2.500"/><path d="M11 18h2"/>',
    shirt: '<path d="m8 4-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3a4 4 0 0 1-8 0Z"/>',
    head: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.500"/><rect x="17" y="14" width="4" height="6" rx="1.500"/>',
    shoe: '<path d="M3 16c0-3 2-4 4-4l3-5 3 3c2 1 5 1 8 4v3H3Z"/><path d="M3 19h18"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-5 6-8 10-10"/>'
  };
  var item = function (x, c, d, r, k) { return '<div class="aa-item" style="--x:' + x + ';--c:' + c + ';--d:' + d + ';--r:' + r + '"><svg viewBox="0 0 24 24">' + ic[k] + '</svg></div>'; };
  var badge = function (cls, path, t) { return '<div class="aa-badge ' + cls + '"><i><svg viewBox="0 0 24 24">' + path + '</svg></i>' + t + '</div>'; };
  var a = document.createElement("aside"); a.className = "auth-art"; a.setAttribute("aria-hidden", "true");
  a.innerHTML = '<span class="auth-art__orb auth-art__orb--1"></span><span class="auth-art__orb auth-art__orb--2"></span>' +
    '<div><h2>Trade. Shop.<br><em>Connect.</em></h2><p>' + sub + '</p></div>' +
    '<div class="aa-stage"><div class="aa-cart"><div class="aa-shadow"></div>' +
    item("14%", "linear-gradient(145deg,#ff8a3d,#f2531a)", "0s", "-14deg", "shirt") + item("40%", "linear-gradient(145deg,#2dd4bf,#0e9f8e)", "1.6s", "10deg", "phone") + item("62%", "linear-gradient(145deg,#a78bfa,#6d4be0)", "3.2s", "-8deg", "head") + item("28%", "linear-gradient(145deg,#fbbf24,#e08a00)", "4.8s", "12deg", "shoe") +
    '<svg class="aa-front" viewBox="0 0 440 392" fill="none"><defs><linearGradient id="aab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset="1" stop-color="#cfe0ff" stop-opacity=".78"/></linearGradient></defs>' +
    '<path d="M18 40h54l22 20" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M88 90h328l-34 150a24 24 0 0 1-23 18H146a24 24 0 0 1-23-19L88 90Z" fill="url(#aab)" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>' +
    '<path d="M150 112l12 126M222 112v126M294 112l-12 126M110 150h292M126 204h262" stroke="#1451e6" stroke-opacity=".22" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M126 268 100 76" stroke="#fff" stroke-width="16" stroke-linecap="round"/>' +
    '<path d="M150 268h220" stroke="#fff" stroke-width="10" stroke-linecap="round"/><path d="M168 268v18M352 268v18" stroke="#fff" stroke-width="8" stroke-linecap="round"/><circle cx="168" cy="304" r="24" fill="#0a1a3f" stroke="#fff" stroke-width="4"/><circle cx="168" cy="304" r="9" fill="#fff"/><circle cx="352" cy="304" r="24" fill="#0a1a3f" stroke="#fff" stroke-width="4"/><circle cx="352" cy="304" r="9" fill="#fff"/></svg></div>' +
    badge("aa-badge--a", '<path d="M3 7h13v9H3zM16 10h3l2 3v3h-5"/><circle cx="7" cy="18" r="1.500"/><circle cx="17" cy="18" r="1.500"/>', "Pay on delivery") +
    badge("aa-badge--b", '<path d="M12 3 4 6v6c0 5 3.500 8 8 9 4.500-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>', "Verified sellers") +
    badge("aa-badge--c", '<path d="M21 12a8 8 0 0 1-11.600 7.100L3 20l1-4.800A8 8 0 1 1 21 12Z"/>', "Chat with sellers") +
    '</div><div class="aa-foot"><span>Local sellers</span><span>Secure sign-in</span><span>Made in The Gambia</span></div>';
  page.appendChild(a);
})();
