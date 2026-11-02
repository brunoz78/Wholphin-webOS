/* Fork addition: the sign-in form suggests the last Jellyfin server, so Quick Connect is one
   click away after signing out. The address is remembered whenever the app saves a session.
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var KEY = "wholphin-fork-last-server";

  function remember(raw) {
    try {
      var session = JSON.parse(raw);
      if (session && session.server) localStorage.setItem(KEY, session.server);
    } catch (_) {}
  }
  try {
    remember(localStorage.getItem("wholphin-session"));
    var setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      setItem.call(this, key, value);
      if (this === window.localStorage && key === "wholphin-session") remember(value);
    };
  } catch (_) {}

  function fill() {
    var input = document.querySelector('input[aria-describedby="server-error server-example"]');
    if (!input || input.value || input.dataset.forkFilled) return;
    input.dataset.forkFilled = "1";
    var last = null;
    try {
      last = localStorage.getItem(KEY);
    } catch (_) {}
    if (!last) return;
    input.value = last;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function start() {
    fill();
    new MutationObserver(fill).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
