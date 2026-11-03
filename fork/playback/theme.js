/* Fork addition: theme music on detail pages, as in Plex and Wholphin for Android TV.
   The detail page of a movie or series and the season view play the item's theme song quietly,
   once, with a fade-in. It stops when the page is left or a video starts; moving between seasons
   of the same series keeps it playing. Settings → Playback → "Play theme music" (on by default).
   The app reports the shown item through window.WholphinTheme (two build patches).
   Theme songs come from Jellyfin (theme.mp3 next to the media, e.g. from the Themerr plugin).
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var KEY = "wholphin-fork-theme-music",
    VOLUME = 0.25;

  var de = !window.wholphinI18n || window.wholphinI18n.lang !== "en";
  function t(en, german) {
    return de ? german : en;
  }
  function enabled() {
    try {
      return localStorage.getItem(KEY) !== "0";
    } catch (_) {
      return true;
    }
  }
  function session() {
    try {
      return JSON.parse(localStorage.getItem("wholphin-session"));
    } catch (_) {
      return null;
    }
  }

  var audio = new Audio(),
    ownerId = null, // movie or series whose theme plays (or is being looked up)
    pending = false, // theme of ownerId is being looked up
    queued = null, // stream found while the page was still loading
    leaveTimer = null,
    fadeTimer = null;
  audio.preload = "auto";

  function fadeTo(target, done) {
    clearInterval(fadeTimer);
    fadeTimer = setInterval(function () {
      var step = target > audio.volume ? 0.02 : -0.03,
        next = audio.volume + step;
      if ((step > 0 && next >= target) || (step < 0 && next <= target)) {
        audio.volume = Math.max(0, Math.min(1, target));
        clearInterval(fadeTimer);
        if (done) done();
      } else audio.volume = Math.max(0, Math.min(1, next));
    }, 100);
  }
  function start(url) {
    queued = null;
    audio.src = url;
    audio.volume = 0;
    var started = audio.play();
    if (started && started.catch) started.catch(function () {});
    fadeTo(VOLUME);
  }
  function stop() {
    ownerId = null;
    pending = false;
    queued = null;
    clearTimeout(leaveTimer);
    if (audio.paused) return;
    fadeTo(0, function () {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    });
  }

  // Called by the app with the item a detail page or season view shows.
  window.WholphinTheme = function (item) {
    if (!item || !enabled()) return stop();
    var id = item.Type === "Episode" || item.Type === "Season" ? item.SeriesId : item.Id;
    if (!id || (item.Type !== "Movie" && item.Type !== "Series" && item.Type !== "Season" && item.Type !== "Episode"))
      return stop();
    // Same movie or series: keep playing. A theme that ended or failed starts again.
    if (id === ownerId && (pending || !audio.paused)) return;
    stop();
    ownerId = id;
    var s = session();
    if (!s || !s.token) return;
    pending = true;
    fetch(s.server + "/Items/" + encodeURIComponent(id) + "/ThemeSongs?UserId=" + encodeURIComponent(s.user) + "&InheritFromParent=true", {
      headers: { Authorization: 'MediaBrowser Client="Wholphin", Device="LG TV", DeviceId="' + (localStorage.getItem("wholphin-device") || "") + '", Version="fork", Token="' + s.token + '"' },
      credentials: "omit",
      cache: "no-store",
    })
      .then(function (r) {
        return r.ok ? r.json() : { Items: [] };
      })
      .then(function (data) {
        var song = (data.Items || [])[0];
        if (ownerId !== id) return;
        pending = false;
        if (!song) return;
        var url = s.server + "/Audio/" + encodeURIComponent(song.Id) + "/stream?static=true&api_key=" + encodeURIComponent(s.token);
        // The series page reports its item before it is built: start once it is shown.
        if (onDetailPage()) start(url);
        else queued = url;
      })
      .catch(function () {
        if (ownerId === id) pending = false;
      });
  };

  function playerShown() {
    var player = document.getElementById("player");
    return (player && !player.hidden) || document.hidden;
  }
  function onDetailPage() {
    var main = document.getElementById("main");
    return !!main && main.classList.contains("detail-page") && !playerShown();
  }
  // Starting a video or hiding the app stops the music at once. Leaving the page stops it unless
  // another detail page follows shortly: the app empties the page while loading the next one,
  // e.g. from the season view to the series page, and the music keeps playing there.
  function watch() {
    if (!ownerId) return;
    clearTimeout(leaveTimer);
    if (playerShown()) return stop();
    if (onDetailPage()) {
      if (queued) start(queued);
      return;
    }
    leaveTimer = setTimeout(function () {
      if (ownerId && !onDetailPage()) stop();
    }, 1500);
  }
  var main = document.getElementById("main"),
    player = document.getElementById("player");
  if (main) new MutationObserver(watch).observe(main, { attributes: true, attributeFilter: ["class"] });
  if (player) new MutationObserver(watch).observe(player, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", watch);

  // ---- setting ----------------------------------------------------------------------------
  function mountSetting() {
    if (!main || !main.classList.contains("settings-page") || document.getElementById("fork-theme-row")) return;
    var anchor =
      document.getElementById("fork-rewind-row") ||
      main.querySelector('.setting-row[aria-label^="Autoplay next episode"]');
    if (!anchor) return;
    var row = document.createElement("button");
    row.className = "setting-row";
    row.id = "fork-theme-row";
    row.setAttribute("data-no-i18n", "");
    row.innerHTML =
      '<span class="setting-copy"><span class="setting-title"></span><span class="setting-description"></span></span><span class="setting-value"></span>';
    row.querySelector(".setting-title").textContent = t("Play theme music", "Titelmusik abspielen");
    row.querySelector(".setting-description").textContent = t(
      "Plays a movie's or series' theme song quietly on its page, if the server has one.",
      "Spielt die Titelmusik eines Films oder einer Serie leise auf deren Seite, sofern der Server sie hat.",
    );
    function render() {
      var v = enabled() ? t("On", "Ein") : t("Off", "Aus");
      row.querySelector(".setting-value").textContent = v;
      row.setAttribute("aria-label", t("Play theme music", "Titelmusik abspielen") + ": " + v);
    }
    row.onclick = function () {
      try {
        localStorage.setItem(KEY, enabled() ? "0" : "1");
      } catch (_) {}
      if (!enabled()) stop();
      render();
    };
    render();
    anchor.parentNode.insertBefore(row, anchor.nextSibling);
  }
  if (main) new MutationObserver(mountSetting).observe(main, { childList: true, subtree: true });
})();
