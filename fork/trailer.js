/* Fork addition, as in Plex: "Trailer" button on movie and series pages (and on TMDB pages of
   titles that are not in the library). The trailers come from Plex (signed-in Plex account,
   Settings → Movie data), German ones first, and play in Wholphin itself: Back closes them,
   at the end the page comes back, no advertising and nothing is stored.
   Without a Plex account there is no button. Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
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

  // ---- player ---------------------------------------------------------------------------
  var open = null;
  function close() {
    if (!open) return;
    var o = open;
    open = null;
    window.removeEventListener("keydown", o.onKey, true);
    clearTimeout(o.hideTimer);
    o.video.pause();
    o.video.removeAttribute("src");
    o.video.load();
    o.box.remove();
    if (o.opener && o.opener.isConnected) o.opener.focus();
    if (window.WholphinTheme && window.WholphinTheme.resume) window.WholphinTheme.resume();
  }
  function play(list, index) {
    close();
    var trailer = list[index],
      box = el("div", null, null, document.body),
      video = el("video", null, null, box),
      bar = el("div", "fork-trailer-bar", null, box),
      title = el("p", "fork-trailer-title", trailer.title + (list.length > 1 ? "  ·  " + (index + 1) + "/" + list.length : ""), bar),
      hint = el("p", "fork-trailer-hint", t("OK pause · ◀ ▶ 10 s · ▲ ▼ other trailer · Back close", "OK Pause · ◀ ▶ 10 s · ▲ ▼ anderer Trailer · Zurück schliessen"), bar),
      progress = el("div", "fork-trailer-progress", null, box),
      fill = el("div", null, null, progress);
    box.id = "fork-trailer-player";
    box.setAttribute("data-no-i18n", "");
    video.autoplay = true;
    video.src = trailer.url;
    var o = (open = { box: box, video: video, opener: document.activeElement });
    function show() {
      box.classList.remove("fork-trailer-quiet");
      clearTimeout(o.hideTimer);
      o.hideTimer = setTimeout(function () {
        if (!video.paused) box.classList.add("fork-trailer-quiet");
      }, 4000);
    }
    video.addEventListener("timeupdate", function () {
      if (video.duration) fill.style.width = (100 * video.currentTime) / video.duration + "%";
    });
    video.addEventListener("ended", close);
    video.addEventListener("error", function () {
      if (open !== o) return;
      close();
      if (window.WholphinDialog)
        window.WholphinDialog({
          title: t("Trailer", "Trailer"),
          text: t("Plex could not play this trailer.", "Plex konnte diesen Trailer nicht abspielen."),
          buttons: [{ label: "OK" }],
        });
    });
    video.addEventListener("pause", show);
    video.addEventListener("play", show);
    o.onKey = function (event) {
      var k = event.keyCode;
      event.preventDefault();
      event.stopPropagation();
      show();
      if (k === 461 || k === 8 || k === 27 || k === 413) return close(); // Back, Stop
      if (k === 13 || k === 32 || k === 415 || k === 19) {
        if (k === 415) return video.play();
        if (k === 19) return video.pause();
        return video.paused ? video.play() : video.pause();
      }
      if (k === 37 || k === 412) video.currentTime = Math.max(0, video.currentTime - 10);
      else if (k === 39 || k === 417) video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      else if ((k === 38 || k === 40) && list.length > 1) {
        var opener = o.opener;
        play(list, (index + (k === 40 ? 1 : list.length - 1)) % list.length);
        if (open) open.opener = opener;
      }
    };
    window.addEventListener("keydown", o.onKey, true);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (window.WholphinTheme && window.WholphinTheme.pause) window.WholphinTheme.pause();
    show();
  }

  // ---- button -----------------------------------------------------------------------------
  // Adds the button to `row` once Plex has a trailer; `after` is the button it follows.
  function mount(row, credit, after) {
    if (!row || !window.WholphinPlex || !window.WholphinPlex.signedIn() || !credit.id) return;
    window.WholphinPlex.trailers(credit).then(function (list) {
      if (!list.length || !row.isConnected || row.querySelector(".fork-trailer")) return;
      var b = document.createElement("button");
      b.className = "fork-trailer";
      b.setAttribute("data-no-i18n", "");
      b.textContent = list.length > 1 ? t("Trailers", "Trailer") + " (" + list.length + ")" : t("Trailer", "Trailer");
      b.setAttribute("aria-label", b.textContent);
      b.onclick = function () {
        play(list, 0);
      };
      var anchor = after && after.parentNode === row ? after : null;
      row.insertBefore(b, anchor ? anchor.nextSibling : null);
    });
  }
  window.WholphinTrailer = {
    // Library item of Jellyfin (movie or series).
    item: function (row, item, after) {
      if (!item || (item.Type !== "Movie" && item.Type !== "Series")) return;
      mount(
        row,
        { media_type: item.Type === "Series" ? "tv" : "movie", id: item.ProviderIds && item.ProviderIds.Tmdb, title: item.Name, name: item.Name },
        after,
      );
    },
    // Title from TMDB (filmography page).
    tmdb: function (row, credit) {
      if (credit) mount(row, credit, null);
    },
  };
})();
