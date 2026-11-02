/* Fork addition: live playback overlay for testing, toggled with key 0 or in the player's Options
   menu ("Live info" next to "Playback info"); the choice is remembered.
   Also: the rows of the playback information are no longer focusable one by one, since the
   compact panel (style.css) shows everything without scrolling. Shows how the server delivers the video (direct, remux, transcode), codecs in and out,
   resolution, bit rate and the server's reasons, refreshed every few seconds from /Sessions.
   Independent of the app's code: reads the session and device id the app stores.
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var KEY = "wholphin-fork-stats",
    TOGGLE_KEYS = { 48: 1, 96: 1, 406: 1 }; // 0, numpad 0, blue

  var de = !window.wholphinI18n || window.wholphinI18n.lang !== "en";
  function t(en, german) {
    return de ? german : en;
  }

  var enabled = false;
  try {
    enabled = localStorage.getItem(KEY) === "1";
  } catch (_) {}
  var box = null,
    timer = null,
    item = null,
    itemId = null;

  function session() {
    try {
      return JSON.parse(localStorage.getItem("wholphin-session"));
    } catch (_) {
      return null;
    }
  }
  function auth(s) {
    return (
      'MediaBrowser Client="Wholphin", Device="LG TV", DeviceId="' +
      (localStorage.getItem("wholphin-device") || "") +
      '", Version="fork", Token="' +
      s.token +
      '"'
    );
  }
  function get(s, path) {
    return fetch(s.server + path, { headers: { Authorization: auth(s) }, credentials: "omit", cache: "no-store" }).then(
      function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      },
    );
  }

  function playing() {
    var player = document.getElementById("player");
    return player && !player.hidden;
  }

  function mbps(v) {
    return v ? (v / 1000000).toFixed(1) + " Mbit/s" : "–";
  }
  function channels(n) {
    return n ? (n === 6 ? "5.1" : n === 8 ? "7.1" : n === 2 ? "2.0" : n + " ch") : "";
  }
  var REASONS = {
    ContainerNotSupported: t("container", "Container"),
    VideoCodecNotSupported: t("video codec", "Video-Codec"),
    AudioCodecNotSupported: t("audio codec", "Ton-Codec"),
    SubtitleCodecNotSupported: t("subtitles", "Untertitel"),
    ContainerBitrateExceedsLimit: t("bit rate", "Bitrate"),
    VideoBitrateNotSupported: t("video bit rate", "Video-Bitrate"),
    VideoLevelNotSupported: t("video level", "Video-Level"),
    VideoRangeTypeNotSupported: t("HDR format", "HDR-Format"),
    VideoResolutionNotSupported: t("resolution", "Auflösung"),
    AudioChannelsNotSupported: t("audio channels", "Tonkanäle"),
    DirectPlayError: t("direct play off in app", "Direktwiedergabe in der App aus"),
  };

  function row(label, value, warn) {
    return (
      '<div><span>' +
      label +
      "</span><span" +
      (warn ? ' class="fork-stats-warn"' : "") +
      ">" +
      String(value).replace(/[<>&]/g, "") +
      "</span></div>"
    );
  }

  function render(s, sessions) {
    var device = localStorage.getItem("wholphin-device"),
      me = (sessions || []).find(function (x) {
        return x.DeviceId === device && x.NowPlayingItem;
      }),
      video = document.getElementById("video"),
      html = "";
    if (!me) {
      box.innerHTML = row(t("Playback", "Wiedergabe"), t("waiting for server …", "warte auf Server …"));
      return;
    }
    var now = me.NowPlayingItem,
      ti = me.TranscodingInfo,
      method = me.PlayState && me.PlayState.PlayMethod,
      streams = (item && item.MediaSources && item.MediaSources[0] && item.MediaSources[0].MediaStreams) || [],
      sv = streams.find(function (x) {
        return x.Type === "Video";
      }) || {},
      audioIndex = me.PlayState && me.PlayState.AudioStreamIndex,
      sa =
        streams.find(function (x) {
          return x.Type === "Audio" && x.Index === audioIndex;
        }) ||
        streams.find(function (x) {
          return x.Type === "Audio" && x.IsDefault;
        }) ||
        {};
    var mode =
      method === "DirectPlay"
        ? t("Direct play", "Direkte Wiedergabe")
        : ti && ti.IsVideoDirect
          ? ti.IsAudioDirect
            ? t("Remux (video and audio copied)", "Remux (Bild und Ton kopiert)")
            : t("Video copied, audio converted", "Bild kopiert, Ton umgewandelt")
          : ti
            ? t("Video transcoding", "Video wird umgewandelt")
            : method || "–";
    html += row(t("Playback", "Wiedergabe"), mode, ti && !ti.IsVideoDirect);
    var srcVideo = (sv.Codec || "?").toUpperCase() + " " + (sv.Width || "?") + "×" + (sv.Height || "?") + (sv.VideoRangeType ? " " + sv.VideoRangeType : "");
    var outVideo =
      method === "DirectPlay" || (ti && ti.IsVideoDirect)
        ? t("copied", "unverändert")
        : ti
          ? (ti.VideoCodec || "?").toUpperCase() + " " + (ti.Width || "?") + "×" + (ti.Height || "?")
          : "";
    html += row(t("Video", "Video"), srcVideo + (outVideo ? " → " + outVideo : ""), ti && !ti.IsVideoDirect);
    var srcAudio = (sa.Codec || "?").toUpperCase() + " " + channels(sa.Channels) + (sa.Language ? " (" + sa.Language + ")" : "");
    var outAudio =
      method === "DirectPlay" || (ti && ti.IsAudioDirect)
        ? t("copied", "unverändert")
        : ti
          ? (ti.AudioCodec || "?").toUpperCase() + " " + channels(ti.AudioChannels)
          : "";
    html += row(t("Audio", "Ton"), srcAudio + (outAudio ? " → " + outAudio : ""));
    html += row(
      t("Bit rate", "Bitrate"),
      mbps(item && item.MediaSources && item.MediaSources[0] && item.MediaSources[0].Bitrate) +
        (ti && ti.Bitrate ? " → " + mbps(ti.Bitrate) : ""),
    );
    if (video && video.videoWidth) html += row(t("TV decodes", "TV dekodiert"), video.videoWidth + "×" + video.videoHeight);
    if (ti && ti.TranscodeReasons && ti.TranscodeReasons.length)
      html += row(
        t("Reasons", "Gründe"),
        ti.TranscodeReasons.map(function (r) {
          return REASONS[r] || r;
        }).join(", "),
        true,
      );
    if (ti && ti.Framerate) html += row(t("Server speed", "Server-Tempo"), ti.Framerate.toFixed(0) + " fps");
    if (window.WHOLPHIN_RELEASE) html += row("Release", window.WHOLPHIN_RELEASE);
    box.innerHTML = html;
    if (now && now.Id !== itemId) load(s, now.Id);
  }

  function load(s, id) {
    itemId = id;
    get(s, "/Users/" + s.user + "/Items/" + id)
      .then(function (data) {
        if (itemId === id) item = data;
      })
      .catch(function () {});
  }

  function refresh() {
    if (!enabled || !playing()) return hide();
    var s = session();
    if (!s || !s.token) return;
    if (!box) {
      box = document.createElement("div");
      box.id = "fork-stats";
      box.setAttribute("data-no-i18n", "");
      box.setAttribute("aria-hidden", "true");
      document.getElementById("player").appendChild(box);
    }
    box.hidden = false;
    get(s, "/Sessions?DeviceId=" + encodeURIComponent(localStorage.getItem("wholphin-device") || ""))
      .then(function (sessions) {
        if (enabled && playing()) render(s, sessions);
      })
      .catch(function () {});
  }
  function hide() {
    if (box) box.hidden = true;
  }

  function schedule() {
    clearInterval(timer);
    timer = setInterval(refresh, 3000);
    refresh();
  }

  var toggleButton = null;
  function label() {
    return t("Live info", "Kurzinfo") + ": " + (enabled ? t("On", "Ein") : t("Off", "Aus"));
  }
  function toggle() {
    enabled = !enabled;
    try {
      localStorage.setItem(KEY, enabled ? "1" : "0");
    } catch (_) {}
    if (toggleButton) toggleButton.textContent = label();
    if (enabled) refresh();
    else hide();
  }

  // Button in Options → Display & diagnostics, next to "Playback info".
  function mountButton() {
    var info = document.getElementById("playback-info");
    if (!info || document.getElementById("fork-stats-toggle")) return;
    toggleButton = document.createElement("button");
    toggleButton.id = "fork-stats-toggle";
    toggleButton.setAttribute("data-no-i18n", "");
    toggleButton.textContent = label();
    toggleButton.onclick = toggle;
    info.parentNode.insertBefore(toggleButton, info.nextSibling);
  }

  document.addEventListener(
    "keydown",
    function (e) {
      if (!TOGGLE_KEYS[e.keyCode] || !playing()) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    },
    true,
  );
  // Playback information: rows are plain text, focus goes to the first button below them.
  function plainRows() {
    var panel = document.getElementById("playback-panel");
    if (!panel || panel.hidden || panel.dataset.kind !== "info") return;
    var rows = panel.querySelectorAll(".playback-info-row[tabindex]");
    if (!rows.length) return;
    for (var i = 0; i < rows.length; i++) rows[i].removeAttribute("tabindex");
    // The app then tries to focus the first row, which no longer takes focus.
    setTimeout(function () {
      var active = document.activeElement;
      if (active && panel.contains(active) && !active.classList.contains("menu-close") && active.tagName === "BUTTON") return;
      var next = panel.querySelector(".playback-info ~ p ~ button, .playback-info ~ button");
      if (next) next.focus();
    }, 0);
  }
  var panel = document.getElementById("playback-panel");
  if (panel) new MutationObserver(plainRows).observe(panel, { childList: true, subtree: true });

  mountButton();
  schedule();
})();
