/* Fork addition, as in Plex: "Continue watching" without forgotten titles.
   - Settings → Continue watching: titles not watched for 30/60/90/120 days drop out.
   - Holding OK on a card of the row removes that title by hand. It comes back on its own as
     soon as it is watched again; the settings can also bring all of them back.
   The app calls WholphinContinue.cutoff() and WholphinContinue.filter() from its home rows
   (build patches in fork/build.mjs). Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var DAYS_KEY = "wholphin-fork-continue-days",
    HIDDEN_KEY = "wholphin-fork-continue-hidden",
    CHOICES = [0, 30, 60, 90, 120],
    HOLD_MS = 700;

  var de = !window.wholphinI18n || window.wholphinI18n.lang !== "en";
  function t(en, german) {
    return de ? german : en;
  }
  function el(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function days() {
    var v = 0;
    try {
      v = Number(localStorage.getItem(DAYS_KEY)) || 0;
    } catch (_) {}
    return CHOICES.indexOf(v) >= 0 ? v : 0;
  }
  function hidden() {
    try {
      var v = JSON.parse(localStorage.getItem(HIDDEN_KEY));
      return v && typeof v === "object" ? v : {};
    } catch (_) {
      return {};
    }
  }
  function saveHidden(v) {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(v));
    } catch (_) {}
  }
  function keyOf(item) {
    return item.SeriesId || item.Id;
  }
  function lastPlayed(item) {
    var d = item.UserData && item.UserData.LastPlayedDate;
    return d ? Date.parse(d) : 0;
  }

  // Oldest date still shown, for the server's "Next up" (NextUpDateCutoff); undefined = no limit.
  function cutoff() {
    var d = days();
    return d ? new Date(Date.now() - d * 86400000).toISOString() : undefined;
  }
  // Drops titles removed by hand and, for started titles, those not watched within the period.
  function filter(items) {
    var list = hidden(),
      limit = days() ? Date.now() - days() * 86400000 : 0,
      changed = false;
    var result = (items || []).filter(function (item) {
      var entry = list[keyOf(item)];
      if (entry) {
        // Watched since it was removed, or the series went on to another episode: show it again.
        if (lastPlayed(item) > entry.at || entry.ids.indexOf(item.Id) < 0) {
          delete list[keyOf(item)];
          changed = true;
        } else return false;
      }
      var played = lastPlayed(item);
      if (limit && played && played < limit) return false;
      item.forkContinue = true;
      return true;
    });
    if (changed) saveHidden(list);
    return result;
  }
  function remove(item, row) {
    var list = hidden(),
      key = keyOf(item),
      ids = [item.Id];
    // The combined row can hold a started and the next episode of the same series.
    if (row)
      Array.prototype.forEach.call(row.querySelectorAll(".card"), function (card) {
        if (card.item && keyOf(card.item) === key && ids.indexOf(card.item.Id) < 0) ids.push(card.item.Id);
      });
    list[key] = { ids: ids, at: Date.now(), name: item.SeriesName || item.Name };
    saveHidden(list);
  }
  window.WholphinContinue = { cutoff: cutoff, filter: filter };

  // ---- hold OK on a card ------------------------------------------------------------
  var held = null;
  function ask(card) {
    var item = card.item,
      row = card.parentNode,
      name = item.SeriesName || item.Name;
    if (!window.WholphinDialog) return;
    window.WholphinDialog({
      title: name,
      text: item.SeriesName
        ? t("Remove this series from “Continue watching”? It comes back when you watch it again.", "Diese Serie aus «Weiterschauen» entfernen? Sie erscheint wieder, sobald du weiterschaust.")
        : t("Remove this title from “Continue watching”? It comes back when you watch it again.", "Diesen Titel aus «Weiterschauen» entfernen? Er erscheint wieder, sobald du weiterschaust."),
      buttons: [
        {
          label: t("Remove", "Entfernen"),
          action: function () {
            remove(item, row);
            var next = card.nextElementSibling || card.previousElementSibling;
            Array.prototype.forEach.call(row.querySelectorAll(".card"), function (c) {
              if (c.item && keyOf(c.item) === keyOf(item)) c.remove();
            });
            if (next && next.isConnected) next.focus();
          },
        },
        { label: t("Cancel", "Abbrechen") },
      ],
      focus: 1,
    });
  }
  window.addEventListener(
    "keydown",
    function (event) {
      if (event.keyCode !== 13) return;
      // While OK is held its repeats must not press a button of the question.
      if (held) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      var card = document.activeElement;
      if (!card || !card.classList || !card.classList.contains("card") || !card.item || !card.item.forkContinue) return;
      // The card opens on release; holding it opens the question instead.
      event.preventDefault();
      event.stopPropagation();
      held = {
        card: card,
        timer: setTimeout(function () {
          held.done = true;
          ask(card);
        }, HOLD_MS),
      };
    },
    true,
  );
  window.addEventListener(
    "keyup",
    function (event) {
      if (event.keyCode !== 13 || !held) return;
      var h = held;
      held = null;
      clearTimeout(h.timer);
      event.preventDefault();
      event.stopPropagation();
      if (!h.done && h.card.isConnected) h.card.click();
    },
    true,
  );

  // ---- settings section ---------------------------------------------------------
  function label(d) {
    return d ? d + " " + t("days", "Tage") : t("Never", "Nie");
  }
  function mount() {
    var main = document.getElementById("main");
    if (!main || !main.classList.contains("settings-page") || document.getElementById("fork-continue-settings")) return;
    var pane = main.querySelector(".settings-pane"),
      categories = main.querySelector(".settings-categories");
    if (!pane || !categories) return;
    var before = document.getElementById("fork-nav-settings") || document.getElementById("fork-language"),
      beforeCat = before && before.categoryButton;
    if (!before) return; // the navigation section comes first, this one goes in front of it
    var area = el("section", "settings-section");
    area.id = "fork-continue-settings";
    area.setAttribute("data-no-i18n", "");
    el("h2", null, t("Continue watching", "Weiterschauen"), area);
    el(
      "p",
      "settings-description",
      t(
        "Titles you have not watched for a while drop out of “Continue watching”. Hold OK on a card of the row to remove it by hand.",
        "Titel, die du länger nicht geschaut hast, fallen aus «Weiterschauen». Halte OK auf einer Karte der Zeile gedrückt, um sie von Hand zu entfernen.",
      ),
      area,
    );
    var row = el("button", "setting-row", null, area),
      copy = el("span", "setting-copy", null, row);
    el("span", "setting-title", t("Remove after", "Entfernen nach"), copy);
    el("span", "setting-description", t("Without watching for this long.", "So lange nicht mehr geschaut."), copy);
    var value = el("span", "setting-value", null, row);
    function render() {
      value.textContent = label(days());
      row.setAttribute("aria-label", t("Remove after", "Entfernen nach") + ": " + value.textContent);
    }
    row.onclick = function () {
      var i = CHOICES.indexOf(days());
      try {
        localStorage.setItem(DAYS_KEY, String(CHOICES[(i + 1) % CHOICES.length]));
      } catch (_) {}
      render();
    };
    render();
    var reset = el("button", "setting-row", null, area),
      resetCopy = el("span", "setting-copy", null, reset);
    el("span", "setting-title", t("Removed by hand", "Von Hand entfernt"), resetCopy);
    el("span", "setting-description", t("OK shows all of them again.", "OK zeigt alle wieder an."), resetCopy);
    var count = el("span", "setting-value", null, reset);
    function renderCount() {
      var names = Object.keys(hidden());
      count.textContent = String(names.length);
      reset.setAttribute("aria-label", t("Removed by hand", "Von Hand entfernt") + ": " + names.length);
    }
    reset.onclick = function () {
      var list = hidden(),
        names = Object.keys(list).map(function (k) {
          return list[k].name;
        });
      if (!names.length || !window.WholphinDialog) return;
      window.WholphinDialog({
        title: t("Show again?", "Wieder anzeigen?"),
        text: names.join(", "),
        buttons: [
          {
            label: t("Show all", "Alle anzeigen"),
            action: function () {
              saveHidden({});
              renderCount();
            },
          },
          { label: t("Cancel", "Abbrechen") },
        ],
      });
    };
    renderCount();
    var cat = el("button", "settings-category", t("Continue watching", "Weiterschauen"));
    cat.setAttribute("data-no-i18n", "");
    cat.onclick = function () {
      row.focus();
    };
    cat.settingsSection = area;
    area.categoryButton = cat;
    pane.insertBefore(area, before);
    if (beforeCat) categories.insertBefore(cat, beforeCat);
    else categories.appendChild(cat);
  }
  new MutationObserver(mount).observe(document.getElementById("main") || document.body, { childList: true, subtree: true });
})();
