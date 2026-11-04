/* Fork addition: choose which entries the side navigation shows and in which order
   (Settings → Navigation). Hidden entries are taken out of the navigation (not just made
   invisible), so the remote's up/down movement never lands on them. Live TV is hidden by
   default. Search, Home, Settings and the profile keep their places.
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var KEY = "wholphin-fork-nav-hidden",
    ORDER_KEY = "wholphin-fork-nav-order",
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

  function savedOrder() {
    try {
      var list = JSON.parse(localStorage.getItem(ORDER_KEY));
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }
  function saveOrder(list) {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  var nav = document.getElementById("nav"),
    order = [], // all entry buttons of the current navigation, in the app's order
    applying = false;

  function labelOf(b) {
    var span = b.querySelector(".nav-label");
    return (span && span.textContent) || b.getAttribute("aria-label") || b.dataset.nav;
  }

  // The movable entries in the chosen order: saved ones first as saved, new ones in the app's order.
  function arranged() {
    var saved = savedOrder(),
      movable = order.filter(function (b) {
        return !FIXED[b.dataset.nav];
      });
    return movable.slice().sort(function (a, b) {
      var ia = saved.indexOf(a.dataset.nav),
        ib = saved.indexOf(b.dataset.nav);
      if (ia < 0) ia = 1000 + movable.indexOf(a);
      if (ib < 0) ib = 1000 + movable.indexOf(b);
      return ia - ib;
    });
  }
  function apply() {
    if (!nav) return;
    var hidden = hiddenSet(),
      queue = arranged(),
      focused = document.activeElement;
    // Fixed entries keep their slots, the movable ones fill the others in the chosen order.
    var wanted = [];
    order.forEach(function (slot) {
      var b = FIXED[slot.dataset.nav] ? slot : queue.shift() || slot;
      if (!hidden[b.dataset.nav] || FIXED[b.dataset.nav]) wanted.push(b);
    });
    // Touch the navigation only when it differs: every change wakes the observer again.
    var current = Array.prototype.slice.call(nav.children);
    if (current.length === wanted.length && current.every(function (b, i) { return b === wanted[i]; })) return;
    applying = true;
    current.forEach(function (b) {
      if (wanted.indexOf(b) < 0) {
        if (document.activeElement === b) b.blur();
        nav.removeChild(b);
      }
    });
    wanted.forEach(function (b, i) {
      if (nav.children[i] !== b) nav.insertBefore(b, nav.children[i] || null);
    });
    if (focused && focused.parentNode === nav && document.activeElement !== focused) focused.focus();
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
      t(
        "Choose which entries the side navigation shows on this TV and in which order. OK on an entry opens its options.",
        "Wähle, welche Einträge die Seitenleiste auf diesem Fernseher zeigt und in welcher Reihenfolge. OK auf einem Eintrag öffnet die Möglichkeiten.",
      ),
      area,
    );
    var list = el("div", "fork-nav-list", null, area);
    function renderRows(focusKey) {
      list.textContent = "";
      arranged().forEach(function (b) {
        var key = b.dataset.nav,
          row = el("button", "setting-row", null, list),
          copy = el("span", "setting-copy", null, row);
        el("span", "setting-title", labelOf(b), copy);
        var value = el("span", "setting-value", hiddenSet()[key] ? t("Hidden", "Ausgeblendet") : t("Shown", "Angezeigt"), row);
        row.setAttribute("aria-label", labelOf(b) + ": " + value.textContent);
        row.onclick = function () {
          openMenu(b);
        };
        if (focusKey === key) row.focus();
      });
    }
    // Menu of an entry: move up, move down, show or hide. It stays open for several moves.
    function openMenu(entry) {
      if (!window.WholphinDialog) return;
      var key = entry.dataset.nav,
        d = window.WholphinDialog({
          title: labelOf(entry),
          vertical: true,
          buttons: [
            { label: t("Move up", "Nach oben"), keep: true, action: function () { move(-1); } },
            { label: t("Move down", "Nach unten"), keep: true, action: function () { move(1); } },
            { label: "", keep: true, action: toggle },
            { label: t("Done", "Fertig") },
          ],
          onClose: function () {
            renderRows(key);
          },
        }),
        up = d.buttons[0],
        down = d.buttons[1];
      function keys() {
        return arranged().map(function (b) {
          return b.dataset.nav;
        });
      }
      function render() {
        var list = keys(), at = list.indexOf(key);
        d.message.textContent = t("Position ", "Position ") + (at + 1) + t(" of ", " von ") + list.length;
        d.buttons[2].textContent = hiddenSet()[key] ? t("Show", "Anzeigen") : t("Hide", "Ausblenden");
        up.disabled = at === 0;
        down.disabled = at === list.length - 1;
      }
      function move(delta) {
        var list = keys(), at = list.indexOf(key), to = at + delta;
        if (to < 0 || to >= list.length) return;
        list.splice(at, 1);
        list.splice(to, 0, key);
        saveOrder(list);
        apply();
        renderRows();
        render();
        var target = delta < 0 ? up : down;
        (target.disabled ? (delta < 0 ? down : up) : target).focus();
      }
      function toggle() {
        var set = hiddenSet();
        if (set[key]) delete set[key];
        else set[key] = 1;
        saveHidden(set);
        apply();
        render();
      }
      render();
      (up.disabled ? down : up).focus();
    }
    renderRows();
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
