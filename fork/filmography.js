/* Fork addition: full filmography of a person from TMDB, as in Plex.
   Jellyfin only knows the titles of the library. With a TMDB key (Settings → "Movie data", stored
   on this TV only), the person page lists every role below "In your library": year, title and
   role, titles of the library marked. Those open their page in the app; the others open an
   information page with poster and description from TMDB.
   The person page calls window.WholphinFilmography (build patch).
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var KEY = "wholphin-fork-tmdb-key",
    TMDB = "https://api.themoviedb.org/3",
    IMAGES = "https://image.tmdb.org/t/p/";

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
  function tmdbKey() {
    try {
      return (localStorage.getItem(KEY) || "").trim();
    } catch (_) {
      return "";
    }
  }
  function session() {
    try {
      return JSON.parse(localStorage.getItem("wholphin-session"));
    } catch (_) {
      return null;
    }
  }

  // TMDB accepts the short API key (v3) as parameter and the long read access token as header.
  function tmdb(path, key) {
    key = key || tmdbKey();
    var bearer = key.length > 40,
      url = TMDB + path + (path.indexOf("?") < 0 ? "?" : "&") + "language=" + (de ? "de-DE" : "en-US") +
        (bearer ? "" : "&api_key=" + encodeURIComponent(key));
    return fetch(url, { headers: bearer ? { Authorization: "Bearer " + key } : {}, credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error("TMDB " + r.status);
      return r.json();
    });
  }

  // Movies and shows of the library by TMDB number; several versions (e.g. 4K and HD) count once each.
  var library = null,
    libraryTime = 0;
  function libraryIndex() {
    if (library && Date.now() - libraryTime < 10 * 60 * 1000) return library;
    var s = session();
    if (!s || !s.token) return Promise.resolve({});
    library = fetch(
      s.server + "/Users/" + encodeURIComponent(s.user) +
        "/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=ProviderIds&EnableImages=false&EnableUserData=false",
      {
        headers: { Authorization: 'MediaBrowser Client="Wholphin", Device="LG TV", DeviceId="' + (localStorage.getItem("wholphin-device") || "") + '", Version="fork", Token="' + s.token + '"' },
        credentials: "omit",
      },
    )
      .then(function (r) {
        return r.ok ? r.json() : { Items: [] };
      })
      .then(function (data) {
        var index = {};
        (data.Items || []).forEach(function (item) {
          var id = item.ProviderIds && (item.ProviderIds.Tmdb || item.ProviderIds.tmdb);
          if (!id) return;
          var k = (item.Type === "Series" ? "tv:" : "movie:") + id;
          (index[k] = index[k] || []).push(item.Id);
        });
        return index;
      })
      .catch(function () {
        library = null;
        return {};
      });
    libraryTime = Date.now();
    return library;
  }

  // Talk shows, news and appearances as oneself are left out, as Plex lists them separately.
  function isAppearance(credit) {
    var ids = credit.genre_ids || [];
    return ids.indexOf(10767) >= 0 || ids.indexOf(10763) >= 0 || /^(self|himself|herself|themselves|narrator)\b/i.test(credit.character || "");
  }
  function creditDate(credit) {
    return credit.release_date || credit.first_air_date || "";
  }

  window.WholphinFilmography = function (ctx) {
    var tmdbId = ctx.person && ctx.person.ProviderIds && (ctx.person.ProviderIds.Tmdb || ctx.person.ProviderIds.tmdb);
    if (!tmdbKey() || !tmdbId) return;
    var section = el("section", "fork-filmography");
    ctx.after.parentNode.insertBefore(section, ctx.after.nextSibling);
    var heading = el("h2", null, t("Filmography", "Filmografie"), section),
      status = el("p", "metadata", t("Loading from TMDB…", "Wird von TMDB geladen …"), section);
    section.setAttribute("data-no-i18n", "");
    Promise.all([tmdb("/person/" + encodeURIComponent(tmdbId) + "/combined_credits"), libraryIndex()])
      .then(function (results) {
        if (!ctx.valid()) return;
        var credits = results[0], index = results[1], seen = {};
        var list = (credits.cast || []).filter(function (c) {
          return !isAppearance(c);
        });
        if (!list.length) list = credits.crew || [];
        list = list.filter(function (c) {
          var k = c.media_type + ":" + c.id;
          if (seen[k] || (c.media_type !== "movie" && c.media_type !== "tv")) return false;
          seen[k] = true;
          return true;
        });
        list.sort(function (a, b) {
          var da = creditDate(a), db = creditDate(b);
          if (!da || !db) return da ? 1 : db ? -1 : 0; // announced titles without date first
          return da < db ? 1 : da > db ? -1 : 0;
        });
        heading.textContent = t("Filmography", "Filmografie") + " (" + list.length + ")";
        status.remove();
        var rows = el("div", "fork-credits", null, section),
          restored = null;
        list.forEach(function (credit) {
          var owned = index[credit.media_type + ":" + credit.id],
            row = el("button", "fork-credit" + (owned ? " is-owned" : ""), null, rows);
          row.dataset.item = "tmdb:" + credit.media_type + ":" + credit.id;
          el("span", "fork-credit-year", creditDate(credit).slice(0, 4) || "", row);
          var main = el("span", "fork-credit-title", null, row);
          el("span", null, credit.title || credit.name || "", main);
          var role = credit.character || credit.job;
          if (role) el("span", "fork-credit-role", " · " + t("as ", "als ") + role, main);
          if (owned)
            el("span", "fork-credit-owned", t("In your library", "In deiner Mediathek") + (owned.length > 1 ? " +" + (owned.length - 1) : ""), row);
          row.onclick = function () {
            if (owned) ctx.open(owned[0]);
            else ctx.page(credit.title || credit.name || "", function (page, valid) {
              return infoPage(page, valid, credit);
            });
          };
          if (ctx.restore && ctx.restore === row.dataset.item) restored = row;
        });
        if (restored) {
          restored.focus();
          restored.scrollIntoView({ block: "center" });
        }
        // Remote: down from the library titles to the list, up and down within it.
        if (ctx.grid)
          ctx.grid.addEventListener("keydown", function (event) {
            if (event.keyCode !== 40 || !rows.firstElementChild) return;
            event.preventDefault();
            event.stopPropagation();
            rows.firstElementChild.focus();
            rows.firstElementChild.scrollIntoView({ block: "nearest" });
          });
        rows.addEventListener("keydown", function (event) {
          var key = event.keyCode, row = document.activeElement;
          if (key !== 38 && key !== 40) return;
          event.preventDefault();
          event.stopPropagation();
          var next = key === 40 ? row.nextElementSibling : row.previousElementSibling;
          if (!next && key === 38) {
            var card = ctx.grid && ctx.grid.querySelector(".card");
            if (card) {
              card.focus();
              card.scrollIntoView({ block: "nearest" });
            }
            return;
          }
          if (next) {
            next.focus();
            next.scrollIntoView({ block: "nearest" });
          }
        });
      })
      .catch(function () {
        if (!ctx.valid()) return;
        status.textContent = t(
          "TMDB could not be reached. Check the key under Settings → Movie data.",
          "TMDB ist nicht erreichbar. Prüfe den Schlüssel unter Einstellungen → Filmdaten.",
        );
      });
  };

  // Information page of a title that is not in the library.
  function infoPage(page, valid, credit) {
    // TMDB texts arrive in the chosen language; the page itself (the app's main area) must stay
    // translatable, so only the own elements are marked.
    var box = el("div", "fork-tmdb-info", null, page);
    box.setAttribute("data-no-i18n", "");
    var status = el("p", "metadata", t("Loading from TMDB…", "Wird von TMDB geladen …"), box);
    return tmdb("/" + credit.media_type + "/" + encodeURIComponent(credit.id)).then(
      function (item) {
        if (!valid()) return;
        status.remove();
        if (item.poster_path) {
          var poster = el("img", "fork-series-poster");
          poster.alt = "";
          poster.src = IMAGES + "w500" + item.poster_path;
          page.insertBefore(poster, page.firstChild);
          page.classList.add("fork-has-poster");
        }
        var year = (item.release_date || item.first_air_date || "").slice(0, 4),
          facts = [];
        if (year) facts.push(year);
        if (item.runtime) facts.push(item.runtime + " " + t("min", "Min."));
        if (item.number_of_seasons) facts.push(item.number_of_seasons + " " + (item.number_of_seasons === 1 ? t("season", "Staffel") : t("seasons", "Staffeln")));
        if (item.vote_average) facts.push(item.vote_average.toFixed(1) + " ★");
        if (facts.length) el("p", "metadata", facts.join(" · "), box);
        if (item.genres && item.genres.length)
          el("p", "genres", item.genres.map(function (g) { return g.name; }).join(", "), box);
        if (item.overview) el("p", "overview", item.overview, box);
        el("p", "metadata fork-not-owned", t("Not in your library", "Nicht in deiner Mediathek"), box);
        // Watchlist and watched in Plex (fork/plex.js); without it a plain note.
        var row = el("div", "actions", null, box);
        if (window.WholphinPlexActions) window.WholphinPlexActions(row, credit, true);
      },
      function () {
        if (valid()) status.textContent = t("TMDB could not be reached.", "TMDB ist nicht erreichbar.");
      },
    );
  }

  // Shared with fork/plex.js: library index, TMDB posters and the information page.
  window.WholphinLibraryIndex = libraryIndex;
  window.WholphinTmdbPoster = function (credit) {
    if (!tmdbKey()) return Promise.resolve(null);
    return tmdb("/" + credit.media_type + "/" + encodeURIComponent(credit.id)).then(
      function (item) {
        return item.poster_path ? IMAGES + "w342" + item.poster_path : null;
      },
      function () {
        return null;
      },
    );
  };
  window.WholphinTmdbInfo = function (credit) {
    if (!window.WholphinPage) return;
    window.WholphinPage(credit.title || credit.name || "", function (page, valid) {
      return infoPage(page, valid, credit);
    });
  };

  // ---- setting: TMDB key -------------------------------------------------------------------
  function openKeyDialog(row, render) {
    if (document.getElementById("fork-tmdb-dialog")) return;
    var dialog = el("section", null, null, document.body);
    dialog.id = "fork-tmdb-dialog";
    dialog.className = "fork-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-no-i18n", "");
    var box = el("div", "fork-exit-box fork-tmdb-box", null, dialog);
    el("h2", null, t("TMDB key", "TMDB-Schlüssel"), box);
    el("p", "metadata", t(
      "API key or API read access token from themoviedb.org (Settings → API). Stored on this TV only.",
      "API-Schlüssel oder API-Lesezugriffstoken von themoviedb.org (Einstellungen → API). Bleibt nur auf diesem TV gespeichert.",
    ), box);
    var input = el("input", "fork-tmdb-input", null, box);
    input.type = "text";
    input.value = tmdbKey();
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    var message = el("p", "metadata fork-tmdb-message", null, box),
      buttons = el("div", "fork-exit-buttons", null, box),
      save = el("button", null, t("Check and save", "Prüfen und speichern"), buttons),
      remove = el("button", null, t("Remove", "Entfernen"), buttons),
      cancel = el("button", null, t("Cancel", "Abbrechen"), buttons);
    function close() {
      dialog.remove();
      render();
      row.focus();
    }
    save.onclick = function () {
      var key = input.value.trim();
      if (!key) return;
      message.textContent = t("Checking…", "Wird geprüft …");
      tmdb("/configuration", key).then(
        function () {
          try {
            localStorage.setItem(KEY, key);
          } catch (_) {}
          close();
        },
        function () {
          message.textContent = t("TMDB does not accept this key.", "TMDB akzeptiert diesen Schlüssel nicht.");
        },
      );
    };
    remove.onclick = function () {
      try {
        localStorage.removeItem(KEY);
      } catch (_) {}
      close();
    };
    cancel.onclick = close;
    // The dialog keeps the keys: up/down between field and buttons, left/right between buttons.
    dialog.addEventListener("keydown", function (event) {
      var key = event.keyCode,
        active = document.activeElement,
        list = [save, remove, cancel];
      event.stopPropagation();
      if (key === 461 || key === 27) {
        event.preventDefault();
        close();
      } else if (key === 13 && active === input) {
        event.preventDefault();
        save.click();
      } else if (key === 40 && active === input) {
        event.preventDefault();
        save.focus();
      } else if (key === 38 && active !== input) {
        event.preventDefault();
        input.focus();
      } else if ((key === 37 || key === 39) && active !== input) {
        event.preventDefault();
        var at = list.indexOf(active);
        list[(at + (key === 37 ? list.length - 1 : 1)) % list.length].focus();
      }
    });
    input.focus();
  }

  function mountSetting() {
    var main = document.getElementById("main");
    if (!main || !main.classList.contains("settings-page") || document.getElementById("fork-tmdb")) return;
    var pane = main.querySelector(".settings-pane"),
      categories = main.querySelector(".settings-categories");
    if (!pane || !categories) return;
    var sections = pane.querySelectorAll(".settings-section"),
      cats = categories.querySelectorAll(".settings-category"),
      before = sections[sections.length - 1], // "About" stays last
      beforeCat = cats[cats.length - 1];
    var area = el("section", "settings-section");
    area.id = "fork-tmdb";
    area.setAttribute("data-no-i18n", "");
    el("h2", null, t("Movie data", "Filmdaten"), area);
    el("p", "settings-description", t("Full filmography of actors from TMDB.", "Ganze Filmografie von Schauspielern aus TMDB."), area);
    var row = el("button", "setting-row", null, area),
      copy = el("span", "setting-copy", null, row);
    el("span", "setting-title", t("TMDB key", "TMDB-Schlüssel"), copy);
    el("span", "setting-description", t(
      "With a key, people show every movie and show they appeared in, not only those in the library.",
      "Mit Schlüssel zeigen Personen alle Filme und Serien, in denen sie mitgespielt haben, nicht nur die der Mediathek.",
    ), copy);
    var value = el("span", "setting-value", null, row);
    function render() {
      value.textContent = tmdbKey() ? t("Saved", "Gespeichert") : t("Not set", "Nicht eingerichtet");
      row.setAttribute("aria-label", t("TMDB key", "TMDB-Schlüssel") + ": " + value.textContent);
    }
    render();
    row.onclick = function () {
      openKeyDialog(row, render);
    };
    var cat = el("button", "settings-category", t("Movie data", "Filmdaten"));
    cat.setAttribute("data-no-i18n", "");
    cat.onclick = function () {
      row.focus();
    };
    cat.settingsSection = area;
    area.categoryButton = cat;
    if (before) pane.insertBefore(area, before);
    else pane.appendChild(area);
    if (beforeCat) categories.insertBefore(cat, beforeCat);
    else categories.appendChild(cat);
  }
  var main = document.getElementById("main");
  if (main) new MutationObserver(mountSetting).observe(main, { childList: true, subtree: true });
})();
