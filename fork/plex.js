/* Fork addition: Plex account for titles outside the library, as in Plex.
   Jellyfin can only store titles of the library. Signed in with Plex (Settings → Movie data,
   code on plex.tv/link, no password on the TV), the TMDB information page of a missing title
   adds it to the Plex watchlist or marks it watched in Plex; a Plex-Jellyfin sync carries both to Jellyfin
   once the title is in the library. The watchlist page also shows the Plex titles not yet in the
   library. Token and device number are stored on this TV only.
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var KEY = "wholphin-fork-plex",
    PLEX_TV = "https://plex.tv/api/v2",
    DISCOVER = "https://discover.provider.plex.tv",
    METADATA = "https://metadata.provider.plex.tv";

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
  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (_) {
      return {};
    }
  }
  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (_) {}
  }
  function clientId() {
    var data = load();
    if (!data.client) {
      data.client = "wholphin-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      save(data);
    }
    return data.client;
  }
  function headers() {
    var h = {
      Accept: "application/json",
      "X-Plex-Product": "Wholphin",
      "X-Plex-Client-Identifier": clientId(),
      "X-Plex-Device": "LG TV",
      "X-Plex-Platform": "webOS",
    };
    var token = load().token;
    if (token) h["X-Plex-Token"] = token;
    return h;
  }
  // A refused call does not sign out by itself: only when plex.tv also refuses the account
  // (token revoked or expired) is the token forgotten.
  function checkAccount() {
    var token = load().token;
    if (!token) return;
    fetch(PLEX_TV + "/user", { headers: headers(), credentials: "omit" }).then(function (r) {
      var data = load();
      if (r.status === 401 && data.token === token) {
        delete data.token;
        delete data.name;
        save(data);
      }
    }, function () {});
  }
  function request(method, url) {
    return fetch(url, { method: method, headers: headers(), credentials: "omit" }).then(function (r) {
      if (r.status === 401 && url.indexOf(PLEX_TV + "/pins") !== 0) checkAccount();
      if (!r.ok) throw new Error("Plex " + r.status);
      return r.status === 204 ? {} : r.text().then(function (text) {
        return text ? JSON.parse(text) : {};
      });
    });
  }

  // ---- matching and state -------------------------------------------------------------------
  // TMDB number → Plex discover item; found once, then remembered.
  var matches = {};
  function guidsOf(item) {
    return (item.Guid || []).map(function (g) {
      return g.id;
    });
  }
  function match(credit) {
    var type = credit.media_type === "tv" ? 2 : 1,
      guid = "tmdb://" + credit.id,
      k = credit.media_type + ":" + credit.id;
    if (matches[k]) return matches[k];
    matches[k] = request("GET", METADATA + "/library/metadata/matches?type=" + type + "&guid=" + encodeURIComponent(guid))
      .then(function (data) {
        var item = ((data.MediaContainer || {}).Metadata || [])[0];
        if (item && item.ratingKey) return item.ratingKey;
        throw new Error("no match");
      })
      // Fallback: search by title and year, take the result with the same TMDB number.
      .catch(function () {
        var title = credit.title || credit.name || "",
          url = DISCOVER + "/library/search?query=" + encodeURIComponent(title) +
            "&searchTypes=" + (type === 2 ? "tv" : "movies") + "&searchProviders=discover&includeMetadata=1&includeGuids=1&limit=20";
        return request("GET", url).then(function (data) {
          var found = null;
          ((data.MediaContainer || {}).SearchResults || []).forEach(function (group) {
            (group.SearchResult || []).forEach(function (result) {
              var meta = result.Metadata || {};
              if (!found && guidsOf(meta).indexOf(guid) >= 0) found = meta.ratingKey;
            });
          });
          if (!found) throw new Error("not on Plex");
          return found;
        });
      });
    matches[k].catch(function () {
      delete matches[k];
    });
    return matches[k];
  }
  function userState(ratingKey) {
    return request("GET", METADATA + "/library/metadata/" + encodeURIComponent(ratingKey) + "/userState").then(function (data) {
      var state = (data.MediaContainer || {}).UserState || {};
      if (Array.isArray(state)) state = state[0] || {};
      return { watchlisted: !!state.watchlistedAt, watched: (state.viewCount || 0) > 0 };
    });
  }
  function setWatchlist(ratingKey, on) {
    return request("PUT", DISCOVER + "/actions/" + (on ? "addToWatchlist" : "removeFromWatchlist") + "?ratingKey=" + encodeURIComponent(ratingKey));
  }
  function setWatched(ratingKey, on) {
    return request("PUT", METADATA + "/actions/" + (on ? "scrobble" : "unscrobble") + "?identifier=tv.plex.provider.discover&key=" + encodeURIComponent(ratingKey));
  }
  // Watchlist entries, newest first, with their TMDB numbers. Plex hands out at most 100 per request.
  function watchlist() {
    var all = [];
    function page(start) {
      return request("GET", DISCOVER + "/library/sections/watchlist/all?includeGuids=1&sort=watchlistedAt%3Adesc&X-Plex-Container-Start=" + start + "&X-Plex-Container-Size=100").then(function (data) {
        var container = data.MediaContainer || {},
          items = container.Metadata || [];
        all = all.concat(items);
        if (items.length && all.length < (container.totalSize || 0) && start < 2000) return page(start + 100);
        return all;
      });
    }
    return page(0).then(function (items) {
      return items.map(function (item) {
        var tmdb = null;
        guidsOf(item).forEach(function (g) {
          if (g.indexOf("tmdb://") === 0) tmdb = g.slice(7);
        });
        return { ratingKey: item.ratingKey, title: item.title, year: item.year, type: item.type === "show" ? "tv" : "movie", tmdb: tmdb };
      });
    });
  }

  // ---- sign-in with a code on plex.tv/link ----------------------------------------------------
  var dialogOpen = false;
  function signIn(done) {
    if (dialogOpen || !window.WholphinDialog) return;
    dialogOpen = true;
    var timer = null,
      stopped = false,
      d = window.WholphinDialog({
        title: t("Sign in with Plex", "Mit Plex anmelden"),
        buttons: [{ label: t("Cancel", "Abbrechen") }],
        onClose: function () {
          stopped = true;
          dialogOpen = false;
          clearTimeout(timer);
        },
      }),
      info = d.message,
      code = el("p", "fork-plex-code");
    d.box.insertBefore(code, info.nextSibling);
    info.textContent = t("Requesting a code…", "Code wird angefordert …");
    var close = d.close;
    request("POST", PLEX_TV + "/pins?strong=false")
      .then(function (pin) {
        if (stopped) return;
        info.textContent = t(
          "Open plex.tv/link on your phone or computer and enter this code:",
          "Öffne auf dem Handy oder Computer plex.tv/link und gib diesen Code ein:",
        );
        code.textContent = pin.code;
        var started = Date.now();
        (function poll() {
          timer = setTimeout(function () {
            if (stopped) return;
            if (Date.now() - started > 10 * 60 * 1000) {
              info.textContent = t("The code has expired.", "Der Code ist abgelaufen.");
              code.textContent = "";
              return;
            }
            request("GET", PLEX_TV + "/pins/" + pin.id)
              .then(function (state) {
                if (stopped) return;
                if (!state.authToken) return poll();
                var data = load();
                data.token = state.authToken;
                save(data);
                return request("GET", PLEX_TV + "/user").then(function (user) {
                  var d = load();
                  d.name = user.title || user.username || "";
                  save(d);
                  close();
                  if (done) done();
                });
              })
              .catch(function () {
                if (!stopped) poll();
              });
          }, 2000);
        })();
      })
      .catch(function () {
        if (!stopped) info.textContent = t("Plex could not be reached.", "Plex ist nicht erreichbar.");
      });
  }
  function signedIn() {
    return !!load().token;
  }

  window.WholphinPlex = {
    signedIn: signedIn,
    signIn: signIn,
    match: match,
    userState: userState,
    setWatchlist: setWatchlist,
    setWatched: setWatched,
    watchlist: watchlist,
  };

  // ---- buttons on the TMDB information page --------------------------------------------------
  // filmography.js calls this with the row of buttons and the TMDB title.
  window.WholphinPlexActions = function (row, credit, focus) {
    row.textContent = "";
    if (!signedIn()) {
      var connect = el("button", null, t("Sign in with Plex for watchlist and watched", "Mit Plex anmelden für Merkliste und Gesehen"), row);
      connect.onclick = function () {
        signIn(function () {
          window.WholphinPlexActions(row, credit, true);
        });
      };
      if (focus) connect.focus();
      return;
    }
    var status = el("p", "metadata", t("Checking Plex…", "Plex wird abgefragt …"), row);
    match(credit)
      .then(function (ratingKey) {
        return userState(ratingKey).then(function (state) {
          if (!row.isConnected) return;
          status.remove();
          var list = el("button", "fork-plex-watchlist", null, row),
            seen = el("button", "fork-plex-watched", null, row);
          var problem = el("p", "metadata fork-plex-problem", null, row);
          function render() {
            list.textContent = state.watchlisted ? t("✓ On watchlist", "✓ Auf der Merkliste") : t("Add to watchlist", "Zur Merkliste hinzufügen");
            seen.textContent = state.watched ? t("✓ Watched", "✓ Gesehen") : t("Mark as watched", "Als gesehen markieren");
            list.classList.toggle("is-on", state.watchlisted);
            seen.classList.toggle("is-on", state.watched);
          }
          function toggle(button, field, action) {
            button.onclick = function () {
              button.disabled = true;
              problem.textContent = "";
              action(ratingKey, !state[field])
                .then(function () {
                  state[field] = !state[field];
                })
                .catch(function () {
                  problem.textContent = t("Plex did not save this. Try again later.", "Plex hat das nicht gespeichert. Versuche es später erneut.");
                })
                .then(function () {
                  button.disabled = false;
                  render();
                  button.focus();
                });
            };
          }
          toggle(list, "watchlisted", setWatchlist);
          toggle(seen, "watched", setWatched);
          render();
          if (focus) list.focus();
        });
      })
      .catch(function () {
        if (!row.isConnected) return;
        status.textContent = t("This title is not on Plex.", "Dieser Titel ist auf Plex nicht zu finden.");
      });
  };

  // ---- watchlist page: Plex titles not yet in the library ----------------------------------------
  window.WholphinPlexMissing = function (ctx) {
    if (!signedIn() || !window.WholphinLibraryIndex) return;
    Promise.all([watchlist(), window.WholphinLibraryIndex()])
      .then(function (results) {
        if (!ctx.valid()) return;
        var index = results[1],
          missing = results[0].filter(function (entry) {
            return entry.tmdb && !index[entry.type + ":" + entry.tmdb];
          });
        if (!missing.length) return;
        var section = el("section", "fork-plex-missing", null, ctx.parent);
        el("h2", null, t("Not yet in your library", "Noch nicht in deiner Mediathek") + " (" + missing.length + ")", section);
        section.setAttribute("data-no-i18n", "");
        var items = missing.map(function (entry) {
          return {
            Id: "tmdb-" + entry.type + "-" + entry.tmdb,
            Name: entry.title || "",
            ProductionYear: entry.year,
            Type: entry.type === "tv" ? "Series" : "Movie",
            forkCredit: { media_type: entry.type, id: entry.tmdb, title: entry.title, name: entry.title },
          };
        });
        var grid = ctx.cards(items, section, function (item) {
          if (window.WholphinTmdbInfo) window.WholphinTmdbInfo(item.forkCredit);
        });
        // Posters from TMDB, when a key is set.
        if (window.WholphinTmdbPoster)
          items.forEach(function (item, i) {
            window.WholphinTmdbPoster(item.forkCredit).then(function (url) {
              var card = grid.children[i],
                art = card && card.querySelector(".art");
              if (!url || !art) return;
              var img = art.querySelector("img") || el("img", null, null, art);
              img.alt = "";
              img.src = url;
              var placeholder = art.querySelector("span");
              if (placeholder) placeholder.style.display = "none";
            });
          });
      })
      .catch(function () {});
  };

  function confirmSignOut(row, render) {
    if (dialogOpen || !window.WholphinDialog) return;
    dialogOpen = true;
    window.WholphinDialog({
      title: t("Sign out of Plex?", "Von Plex abmelden?"),
      buttons: [
        {
          label: t("Sign out", "Abmelden"),
          action: function () {
            var data = load();
            delete data.token;
            delete data.name;
            save(data);
          },
        },
        { label: t("Cancel", "Abbrechen") },
      ],
      focus: 1,
      onClose: function () {
        dialogOpen = false;
        render();
      },
    });
  }

  // ---- setting: Plex account in "Movie data" --------------------------------------------------
  function mountSetting() {
    var area = document.getElementById("fork-tmdb");
    if (!area || document.getElementById("fork-plex-row")) return;
    var row = el("button", "setting-row", null, area);
    row.id = "fork-plex-row";
    var copy = el("span", "setting-copy", null, row);
    el("span", "setting-title", t("Plex account", "Plex-Konto"), copy);
    el("span", "setting-description", t(
      "Watchlist and watched for titles that are not in the library, stored in Plex.",
      "Merkliste und Gesehen für Titel, die nicht in der Mediathek sind, gespeichert in Plex.",
    ), copy);
    var value = el("span", "setting-value", null, row);
    function render() {
      var data = load();
      value.textContent = data.token ? t("Signed in", "Angemeldet") + (data.name ? " · " + data.name : "") : t("Not signed in", "Nicht angemeldet");
      row.setAttribute("aria-label", t("Plex account", "Plex-Konto") + ": " + value.textContent);
    }
    render();
    row.onclick = function () {
      if (!signedIn()) return signIn(render);
      confirmSignOut(row, render);
    };
  }
  var main = document.getElementById("main");
  if (main) new MutationObserver(mountSetting).observe(main, { childList: true, subtree: true });
})();
