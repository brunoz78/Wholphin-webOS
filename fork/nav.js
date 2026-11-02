/* Fork addition: choose which entries the side navigation shows (Settings → Navigation).
   Hidden entries are taken out of the navigation (not just made invisible), so the remote's
   up/down movement never lands on them. Live TV is hidden by default.
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var KEY = "wholphin-fork-nav-hidden",
    FIXED = { search: 1, home: 1, settings: 1, profiles: 1 }; // always shown

  var de = !window.wholphinI18n || window.wholphinI18n.lang !== "en";
  function t(en, german) {
    return de ? german : en;
  }

  function hiddenSet() {
    var list = ["livetv"];
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) list = JSON.parse(raw);
    } catch (_) {}
    var set = {};
    (Array.isArray(list) ? list : []).forEach(function (k) {
      set[k] = 1;
    });
    return set;
  }
  function saveHidden(set) {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.keys(set)));
    } catch (_) {}
  }

  var nav = document.getElementById("nav"),
    order = [], // all entry buttons of the current navigation, in the app's order
    applying = false;

  function labelOf(b) {
    var span = b.querySelector(".nav-label");
    return (span && span.textContent) || b.getAttribute("aria-label") || b.dataset.nav;
  }

  function apply() {
    if (!nav) return;
    var hidden = hiddenSet();
    applying = true;
    for (var i = 0; i < order.length; i++) {
      var b = order[i],
        hide = hidden[b.dataset.nav] && !FIXED[b.dataset.nav];
      if (hide && b.parentNode === nav) {
        if (document.activeElement === b) b.blur();
        nav.removeChild(b);
      } else if (!hide && b.parentNode !== nav) {
        // put it back before the next entry that is shown
        var next = null;
        for (var j = i + 1; j < order.length && !next; j++) if (order[j].parentNode === nav) next = order[j];
        nav.insertBefore(b, next);
      }
    }
    applying = false;
  }

  function capture() {
    if (applying || !nav) return;
    var current = Array.prototype.slice.call(nav.querySelectorAll("button"));
    // A fresh render by the app replaces all entries; keep removed ones of the old render out.
    var fresh = current.some(function (b) {
      return order.indexOf(b) < 0;
    });
    if (fresh) order = current;
    apply();
  }
  if (nav) new MutationObserver(capture).observe(nav, { childList: true });
  capture();

  // ---- settings section ---------------------------------------------------------
  function el(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function mount() {
    var main = document.getElementById("main");
    if (!main || !main.classList.contains("settings-page") || document.getElementById("fork-nav-settings")) return;
    var pane = main.querySelector(".settings-pane"),
      categories = main.querySelector(".settings-categories");
    if (!pane || !categories) return;
    var entries = order.filter(function (b) {
      return !FIXED[b.dataset.nav];
    });
    if (!entries.length) return;
    // Before the language section of the fork, or before "About".
    var sections = pane.querySelectorAll(".settings-section"),
      before = document.getElementById("fork-language") || sections[sections.length - 1],
      beforeCat = before && before.categoryButton;
    var area = el("section", "settings-section");
    area.id = "fork-nav-settings";
    area.setAttribute("data-no-i18n", "");
    el("h2", null, t("Navigation", "Seitenleiste"), area);
    el(
      "p",
      "settings-description",
      t("Choose which entries the side navigation shows on this TV.", "Wähle, welche Einträge die Seitenleiste auf diesem Fernseher zeigt."),
      area,
    );
    entries.forEach(function (b) {
      var key = b.dataset.nav,
        row = el("button", "setting-row", null, area),
        copy = el("span", "setting-copy", null, row);
      el("span", "setting-title", labelOf(b), copy);
      var value = el("span", "setting-value", null, row);
      function render() {
        var shown = !hiddenSet()[key];
        value.textContent = shown ? t("Shown", "Angezeigt") : t("Hidden", "Ausgeblendet");
        row.setAttribute("aria-label", labelOf(b) + ": " + value.textContent);
      }
      row.onclick = function () {
        var set = hiddenSet();
        if (set[key]) delete set[key];
        else set[key] = 1;
        saveHidden(set);
        render();
        apply();
      };
      render();
    });
    var cat = el("button", "settings-category", t("Navigation", "Seitenleiste"));
    cat.setAttribute("data-no-i18n", "");
    cat.onclick = function () {
      var first = area.querySelector(".setting-row");
      if (first) first.focus();
    };
    // The app's remote navigation follows these two links between category and section.
    cat.settingsSection = area;
    area.categoryButton = cat;
    if (before) pane.insertBefore(area, before);
    else pane.appendChild(area);
    if (beforeCat) categories.insertBefore(cat, beforeCat);
    else categories.appendChild(cat);
  }
  new MutationObserver(mount).observe(document.getElementById("main") || document.body, { childList: true, subtree: true });
})();
