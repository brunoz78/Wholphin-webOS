/* Fork addition: native playback mode closer to what the TV can do.
   - AV1: LG TVs from 2021 (e.g. OLED B1/C1) decode AV1 up to 4K 60p 10 bit in hardware; added
     when the TV reports it, instead of the server converting AV1 to H.264.
   - MKV played directly, bit rates up to 120 Mbit/s, unsupported audio becomes E-AC-3 5.1.
   - Dolby Vision with an HDR10/SDR base layer stays native.
   Loaded between core.js and app.js. Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var C = window.WholphinCore;
  if (!C || !C.profile) return;

  // AV1 Main profile, level 5.1 (4K 60p), 10 bit.
  var AV1 = 'video/mp4; codecs="av01.0.13M.10"';
  function canDecodeAv1() {
    try {
      if (window.MediaSource && MediaSource.isTypeSupported(AV1)) return true;
      return !!document.createElement("video").canPlayType(AV1);
    } catch (_) {
      return false;
    }
  }
  var av1 = canDecodeAv1();

  function add(list, codec) {
    var codecs = String(list || "").split(",").filter(Boolean);
    if (codecs.indexOf(codec) < 0) codecs.push(codec);
    return codecs.join(",");
  }
  function condition(property, value, operator, required) {
    return {
      Property: property,
      Value: String(value),
      Condition: operator || "LessThanEqual",
      IsRequired: required !== false,
    };
  }

  // UHD Blu-ray remuxes reach 60-100 Mbit/s; above the limit the server re-encodes the whole video.
  var MAX_BITRATE = 120000000;

  var profile = C.profile;
  C.profile = function (options) {
    var result = profile(options);
    if (!options || !options.native) return result;
    result.MaxStreamingBitrate = MAX_BITRATE;
    (result.DirectPlayProfiles || []).forEach(function (p) {
      if (p.Type !== "Video") return;
      // webOS plays MKV directly (as LG's own player and Plex do); the original allows only MP4.
      p.Container = add(p.Container, "mkv");
      if (av1 && /h264|hevc/.test(p.VideoCodec || "")) p.VideoCodec = add(p.VideoCodec, "av1");
    });
    (result.TranscodingProfiles || []).forEach(function (p) {
      if (p.Type !== "Video" || p.Container !== "mp4") return;
      // Copy AV1 into the fMP4 HLS stream instead of converting it.
      if (av1 && /hevc/.test(p.VideoCodec || "")) p.VideoCodec = add(p.VideoCodec, "av1");
      // Audio the TV cannot play (TrueHD, DTS, FLAC) becomes 5.1 E-AC-3 instead of stereo AAC.
      if (/eac3/.test(p.AudioCodec || "")) p.AudioCodec = "eac3,ac3,aac";
    });
    (result.CodecProfiles || []).forEach(function (p) {
      // webOS plays AAC 5.1 itself (as Plex does); the original allows only stereo AAC and
      // has the server convert 5.1 AAC to AC-3.
      var aac = p.Type === "VideoAudio" && /(^|,)aac(,|$)/.test(p.Codec || "");
      (p.Conditions || []).forEach(function (c) {
        if (aac && c.Property === "AudioChannels" && Number(c.Value) < 6) c.Value = "6";
        if (c.Property === "VideoBitrate") c.Value = String(MAX_BITRATE);
      });
    });
    if (!av1) return result;
    result.CodecProfiles = (result.CodecProfiles || []).concat([
      {
        Type: "Video",
        Codec: "av1",
        Conditions: [
          condition("Width", 3840),
          condition("Height", 2160),
          condition("VideoBitDepth", 10),
          condition("VideoFramerate", 60),
          // Level 5.1 (4K 60p). Without it the server assumes a low level and re-encodes 4K AV1.
          condition("VideoLevel", 13),
          condition("VideoBitrate", MAX_BITRATE),
          // HDR10+ and Dolby Vision with an HDR10 base layer play as HDR10.
          condition("VideoRangeType", "SDR|HDR10|HDR10Plus|DOVIWithHDR10|DOVIWithHDR10Plus", "EqualsAny", false),
        ],
      },
    ]);
    return result;
  };

  // The original switches every Dolby Vision video to Compatibility (H.264, at most 1080p) unless
  // the experimental "Dolby Vision MP4" option is on. Most 4K files carry Dolby Vision on top of an
  // HDR10 or SDR base layer, which the TV plays natively, so those stay in native mode.
  var BASE_LAYER = { DOVIWithHDR10: 1, DOVIWithHDR10Plus: 1, DOVIWithSDR: 1, DOVIWithHLG: 1 };
  var nativePolicy = C.nativePolicy;
  C.nativePolicy = function (source, options, subtitleIndex) {
    var result = nativePolicy(source, options, subtitleIndex);
    if (result.native || !options || !options.native) return result;
    var stream = ((source && source.MediaStreams) || []).find(function (entry) {
      return entry.Type === "Video";
    });
    if (!stream || !BASE_LAYER[stream.VideoRangeType]) return result;
    if (subtitleIndex != null && subtitleIndex >= 0) return result; // burn-in still needs Compatibility
    var codec = String(stream.Codec || "").toLowerCase();
    if (codec !== "hevc" && !(codec === "av1" && av1)) return result;
    return { native: true, reason: "Dolby Vision played as its base layer" };
  };

  // Playback info: names for dynamic ranges the original shows as "Unknown".
  var RANGES = {
    DOVIWithHDR10Plus: "Dolby Vision + HDR10+ base",
    DOVIWithSDR: "Dolby Vision + SDR base",
    DOVIWithHLG: "Dolby Vision + HLG base",
  };
  var playbackInfo = C.playbackInfo;
  if (playbackInfo)
    C.playbackInfo = function (active, stats, decoded) {
      var rows = playbackInfo(active, stats, decoded),
        video = ((active && active.source && active.source.MediaStreams) || []).find(function (s) {
          return s.Type === "Video";
        });
      (rows || []).forEach(function (row) {
        if (row[0] === "Source dynamic range" && row[1] === "Unknown" && video && RANGES[video.VideoRangeType])
          row[1] = RANGES[video.VideoRangeType];
      });
      if (rows && window.WHOLPHIN_RELEASE) rows.push(["Wholphin release", window.WHOLPHIN_RELEASE]);
      return rows;
    };

  window.WholphinCodecs = { av1: av1 };
})();
