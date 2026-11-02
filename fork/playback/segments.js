/* Fork addition: skip intros, recaps, credits and previews with the media segments Jellyfin
   provides (e.g. from the Intro Skipper plugin), after the model of Wholphin for Android TV.
   While a segment plays, a button "Skip intro" appears; OK jumps to the segment's end.
   Settings → Playback → "Skip intros automatically" (off by default) skips intros and recaps
   without asking. Independent of the app's code: reads the item from the video's URL.
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var AUTO_KEY = "wholphin-fork-auto-skip";

  var de = !window.wholphinI18n || window.wholphinI18n.lang !== "en";
  function t(en, german) {
    return de ? german : en;
  }
  var LABELS = {
    Intro: t("Skip intro", "Intro überspringen"),
    Recap: t("Skip recap", "Rückblick überspringen"),
    Outro: t("Skip credits", "Abspann überspringen"),
    Preview: t("Skip preview", "Vorschau überspringen"),
    Commercial: t("Skip ad", "Werbung überspringen"),
  };
  var AUTO_TYPES = { Intro: 1, Recap: 1 };

  function autoSkip() {
    try {
      return localStorage.getItem(AUTO_KEY) === "1";
    } catch (_) {
      return false;
    }
  }
  function session() {
    try {
      return JSON.parse(localStorage.getItem("wholphin-session"));
    } catch (_) {
      return null;
    }
  }

  var video = document.getElementById("video"),
    player = document.getElementById("player"),
    itemId = null,
    segments = [],
    shown = null, // segment the button is shown for
    done = {}, // segments skipped or dismissed in this playback, by start time
    button = null;
  if (!video || !player) return;

  // Direct play: /Videos/<id>/stream…; server HLS: /videos/<id with dashes>/master.m3u8
  function idFromSource() {
    var m = (video.currentSrc || video.src || "").match(/\/videos\/([0-9a-f-]{32,36})\//i);
    return m ? m[1].replace(/-/g, "").toLowerCase() : null;
  }

  function load() {
    var id = idFromSource();
    if (!id || id === itemId) return;
    itemId = id;
    segments = [];
    done = {};
    hide();
    var s = session();
    if (!s || !s.token) return;
    fetch(s.server + "/MediaSegments/" + id, {
      headers: { Authorization: 'MediaBrowser Client="Wholphin", Device="LG TV", DeviceId="' + (localStorage.getItem("wholphin-device") || "") + '", Version="fork", Token="' + s.token + '"' },
      credentials: "omit",
      cache: "no-store",
    })
      .then(function (r) {
        return r.ok ? r.json() : { Items: [] };
      })
      .then(function (data) {
        if (itemId !== id) return;
        segments = (data.Items || [])
          .filter(function (x) {
            return LABELS[x.Type] && x.EndTicks > x.StartTicks;
          })
          .map(function (x) {
            return { type: x.Type, start: x.StartTicks / 1e7, end: x.EndTicks / 1e7 };
          });
      })
      .catch(function () {});
  }

  function ensureButton() {
    if (button) return button;
    button = document.createElement("button");
    button.id = "fork-skip";
    button.setAttribute("data-no-i18n", "");
    button.hidden = true;
    button.onclick = skip;
    player.appendChild(button);
    return button;
  }
  function show(segment) {
    ensureButton();
    shown = segment;
    button.textContent = LABELS[segment.type];
    button.hidden = false;
  }
  function hide() {
    shown = null;
    if (button) button.hidden = true;
  }
  function skip() {
    if (!shown) return;
    var target = shown;
    done[target.start] = true;
    hide();
    // Stop just short of the very end so the app still sees the video finish normally.
    var end = isFinite(video.duration) && video.duration > 0 ? Math.min(target.end, video.duration - 0.5) : target.end;
    video.currentTime = end;
  }

  function check() {
    if (player.hidden || !segments.length) return hide();
    var now = video.currentTime,
      current = null;
    for (var i = 0; i < segments.length; i++) {
      var sgm = segments[i];
      // Leave the last second alone, so a skip never lands back inside the segment.
      if (now >= sgm.start && now < sgm.end - 1) current = sgm;
      // Seeking back before a segment offers it again.
      if (now < sgm.start - 1) delete done[sgm.start];
    }
    if (!current || done[current.start]) return hide();
    if (autoSkip() && AUTO_TYPES[current.type] && !video.paused) {
      shown = current;
      return skip();
    }
    if (shown !== current) show(current);
  }

  // OK on the remote skips while the button is shown, unless a player control has the focus.
  document.addEventListener(
    "keydown",
    function (e) {
      if (!shown || !button || button.hidden || e.keyCode !== 13) return;
      var active = document.activeElement;
      if (active && active !== button && active !== document.body && player.contains(active) && active.closest("#controls, #playback-panel"))
        return;
      e.preventDefault();
      e.stopPropagation();
      skip();
    },
    true,
  );

  video.addEventListener("loadedmetadata", load);
  video.addEventListener("playing", load);
  video.addEventListener("timeupdate", check);
  video.addEventListener("emptied", function () {
    itemId = null;
    segments = [];
    hide();
  });

  // ---- setting ----------------------------------------------------------------------------
  function mountSetting() {
    var main = document.getElementById("main");
    if (!main || !main.classList.contains("settings-page") || document.getElementById("fork-autoskip-row")) return;
    var anchor =
      document.getElementById("fork-rewind-row") || main.querySelector('.setting-row[aria-label^="Autoplay next episode"]');
    if (!anchor) return;
    var row = document.createElement("button");
    row.className = "setting-row";
    row.id = "fork-autoskip-row";
    row.setAttribute("data-no-i18n", "");
    row.innerHTML =
      '<span class="setting-copy"><span class="setting-title"></span><span class="setting-description"></span></span><span class="setting-value"></span>';
    row.querySelector(".setting-title").textContent = t("Skip intros automatically", "Intro automatisch überspringen");
    row.querySelector(".setting-description").textContent = t(
      "Skips intros and recaps without asking, if the server knows them (e.g. Intro Skipper plugin).",
      "Überspringt Intros und Rückblicke ohne Nachfrage, sofern der Server sie kennt (z. B. Plugin Intro Skipper).",
    );
    function render() {
      var v = autoSkip() ? t("On", "Ein") : t("Off", "Aus");
      row.querySelector(".setting-value").textContent = v;
      row.setAttribute("aria-label", t("Skip intros automatically", "Intro automatisch überspringen") + ": " + v);
    }
    row.onclick = function () {
      try {
        localStorage.setItem(AUTO_KEY, autoSkip() ? "0" : "1");
      } catch (_) {}
      render();
    };
    render();
    anchor.parentNode.insertBefore(row, anchor.nextSibling);
  }
  var main = document.getElementById("main");
  if (main) new MutationObserver(mountSetting).observe(main, { childList: true, subtree: true });
})();
