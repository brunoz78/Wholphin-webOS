/* Fork addition: "Trailer" button on movie and series pages (and on TMDB pages of titles that
   are not in the library). The trailer plays online in the TV's YouTube app; nothing is stored.
   German trailers come first: the server's trailer links (from TMDB, named "… Deutsch") and the
   TMDB video list (needs the TMDB key from Settings → Movie data). Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var de = !window.wholphinI18n || window.wholphinI18n.lang !== "en";
  function t(en, german) {
    return de ? german : en;
  }
  var GERMAN = /deutsch|german|\bger\b|\bdt\.?\b/i;

  function youtubeId(url) {
    var m = /(?:[?&]v=|youtu\.be\/|\/embed\/)([\w-]{11})/.exec(url || "");
    return m ? m[1] : null;
  }
  // TMDB videos in German and English, best first: official German trailer, German teaser, …
  function tmdbVideos(type, id) {
    if (!window.WholphinTmdb || !id) return Promise.resolve([]);
    return window.WholphinTmdb("/" + type + "/" + encodeURIComponent(id) + "/videos?include_video_language=de,en").then(
      function (data) {
        return (data.results || []).filter(function (v) {
          return v.site === "YouTube" && v.key && (v.type === "Trailer" || v.type === "Teaser");
        });
      },
      function () {
        return [];
      },
    );
  }
  function rank(v) {
    return (v.german ? 0 : 10) + (v.type === "Teaser" ? 2 : 0) + (v.official ? 0 : 1);
  }
  // Resolves to { id, german } or null.
  function choose(remote, type, tmdbId) {
    var own = (remote || [])
      .map(function (r) {
        return { key: youtubeId(r.Url), german: GERMAN.test(r.Name || ""), type: /teaser/i.test(r.Name || "") ? "Teaser" : "Trailer", official: true };
      })
      .filter(function (r) {
        return r.key;
      });
    var german = own.filter(function (r) {
      return r.german;
    });
    if (german.length) return Promise.resolve({ id: german[0].key, german: true });
    return tmdbVideos(type, tmdbId).then(function (videos) {
      var list = videos
        .map(function (v) {
          return { key: v.key, german: v.iso_639_1 === "de", type: v.type, official: !!v.official };
        })
        // Links of the server whose language is unknown come after German, before English.
        .concat(
          own.map(function (r) {
            r.german = false;
            r.unknown = true;
            return r;
          }),
        );
      list.sort(function (a, b) {
        var ra = rank(a) - (a.unknown ? 5 : 0),
          rb = rank(b) - (b.unknown ? 5 : 0);
        return ra - rb;
      });
      if (!list.length) return null;
      // german: true, false (English) or null (link of the server, language unknown).
      return { id: list[0].key, german: list[0].unknown ? null : list[0].german };
    });
  }

  function launch(id) {
    var url = "https://www.youtube.com/tv?v=" + id;
    if (typeof window.PalmServiceBridge === "function") {
      var bridge = new window.PalmServiceBridge();
      bridge.onservicecallback = function (raw) {
        try {
          var r = JSON.parse(raw);
          if (r.returnValue === false && window.WholphinDialog)
            window.WholphinDialog({
              title: t("Trailer", "Trailer"),
              text: t("The YouTube app could not be opened.", "Die YouTube-App liess sich nicht öffnen.") + (r.errorText ? " (" + r.errorText + ")" : ""),
              buttons: [{ label: "OK" }],
            });
        } catch (_) {}
      };
      bridge.call(
        "luna://com.webos.applicationManager/launch",
        JSON.stringify({ id: "youtube.leanback.v4", params: { contentTarget: url } }),
      );
      return;
    }
    window.open("https://www.youtube.com/watch?v=" + id, "_blank");
  }

  // Adds the button to `row` once a trailer is found; `after` is the button it follows.
  function mount(row, options) {
    if (!row) return;
    choose(options.remote, options.type, options.tmdbId).then(function (found) {
      if (!found || !row.isConnected || row.querySelector(".fork-trailer")) return;
      var b = document.createElement("button");
      b.className = "fork-trailer";
      b.setAttribute("data-no-i18n", "");
      b.textContent = found.german === false ? t("Trailer (English)", "Trailer (englisch)") : t("Trailer", "Trailer");
      b.setAttribute("aria-label", b.textContent);
      b.onclick = function () {
        launch(found.id);
      };
      var after = options.after && options.after.parentNode === row ? options.after : null;
      row.insertBefore(b, after ? after.nextSibling : null);
    });
  }
  window.WholphinTrailer = {
    // Library item of Jellyfin (movie or series).
    item: function (row, item, after) {
      if (!item || (item.Type !== "Movie" && item.Type !== "Series")) return;
      mount(row, {
        remote: item.RemoteTrailers,
        type: item.Type === "Series" ? "tv" : "movie",
        tmdbId: item.ProviderIds && item.ProviderIds.Tmdb,
        after: after,
      });
    },
    // Title from TMDB (filmography page).
    tmdb: function (row, credit) {
      if (!credit) return;
      mount(row, { remote: null, type: credit.media_type === "tv" ? "tv" : "movie", tmdbId: credit.id });
    },
  };
})();
