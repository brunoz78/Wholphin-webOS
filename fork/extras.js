/* Fork addition, after the model of Wholphin for Android TV:
   - resume a few seconds earlier (Settings → Playback → "Rewind on resume"),
   - list view for libraries (button "View: Grid / List" in the library toolbar).
   Loaded after app.js; the app reads WholphinResumeRewind and WholphinListRow through two
   small build patches (fork/build.mjs). Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var REWIND_KEY = "wholphin-fork-resume-rewind",
    VIEW_KEY = "wholphin-fork-library-view",
    REWIND_CHOICES = [0, 5, 10, 15, 30];

  var de = !window.wholphinI18n || window.wholphinI18n.lang !== "en";
  function t(en, german) {
    return de ? german : en;
  }
  function read(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }
  function el(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---- rewind on resume -------------------------------------------------------------
  function rewindSeconds() {
    var v = Number(read(REWIND_KEY, "5"));
    return REWIND_CHOICES.indexOf(v) >= 0 ? v : 5;
  }
  window.WholphinResumeRewind = rewindSeconds;

  function rewindLabel(v) {
    return v ? v + " " + t("seconds", "Sekunden") : t("Off", "Aus");
  }
  function mountRewind() {
    var main = document.getElementById("main");
    if (!main || !main.classList.contains("settings-page") || document.getElementById("fork-rewind-row")) return;
    // The playback section is the one holding the autoplay row (its aria-label is not translated).
    var anchor = main.querySelector('.setting-row[aria-label^="Autoplay next episode"]');
    if (!anchor) return;
    var row = el("button", "setting-row");
    row.id = "fork-rewind-row";
    row.setAttribute("data-no-i18n", "");
    var copy = el("span", "setting-copy", null, row);
    el("span", "setting-title", t("Rewind on resume", "Beim Fortsetzen zurückspringen"), copy);
    el(
      "span",
      "setting-description",
      t("Resume a few seconds earlier to find your way back into the scene.", "Setzt ein paar Sekunden früher fort, damit man leichter wieder hineinfindet."),
      copy,
    );
    var value = el("span", "setting-value", null, row);
    function render() {
      value.textContent = rewindLabel(rewindSeconds());
      row.setAttribute("aria-label", t("Rewind on resume", "Beim Fortsetzen zurückspringen") + ": " + value.textContent);
    }
    row.onclick = function () {
      var i = REWIND_CHOICES.indexOf(rewindSeconds());
      write(REWIND_KEY, String(REWIND_CHOICES[(i + 1) % REWIND_CHOICES.length]));
      render();
    };
    render();
    anchor.parentNode.insertBefore(row, anchor.nextSibling);
  }

  // ---- list view for libraries --------------------------------------------------------
  // Card height in the list (CSS .fork-list-view) plus the grid's row gap.
  window.WholphinListRow = 165 + 32;

  function listMode() {
    return read(VIEW_KEY, "grid") === "list";
  }
  function applyView() {
    var main = document.getElementById("main"),
      grid = main && main.querySelector("#library-items .library-grid");
    var on = !!grid && !grid.classList.contains("episode-grid") && listMode();
    if (main && main.classList.contains("fork-list-view") !== on) {
      main.classList.toggle("fork-list-view", on);
      // The library's virtual grid recomputes its rows on resize.
      window.dispatchEvent(new Event("resize"));
    }
  }
  function mountViewToggle() {
    var main = document.getElementById("main"),
      toolbar = main && main.querySelector(".library-toolbar");
    if (!toolbar || toolbar.querySelector(".fork-view-toggle")) return;
    var grid = main.querySelector("#library-items .library-grid");
    if (grid && grid.classList.contains("episode-grid")) return;
    var b = el("button", "fork-view-toggle", null, toolbar);
    b.setAttribute("data-no-i18n", "");
    function render() {
      b.textContent = t("View: ", "Ansicht: ") + (listMode() ? t("List", "Liste") : t("Grid", "Kacheln"));
    }
    b.onclick = function () {
      write(VIEW_KEY, listMode() ? "grid" : "list");
      render();
      applyView();
    };
    render();
  }

  var main = document.getElementById("main");
  if (main)
    new MutationObserver(function () {
      mountRewind();
      mountViewToggle();
      applyView();
    }).observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
})();
