/* Fork addition: AV1 in the native playback mode.
   LG TVs from 2021 (e.g. OLED B1/C1) decode AV1 up to 4K 60p 10 bit in hardware. The original
   profile only offers H.264 and HEVC, so the server converts AV1 to H.264. This module adds AV1
   to the native profile when the TV reports that it can decode it.
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

  var profile = C.profile;
  C.profile = function (options) {
    var result = profile(options);
    if (!av1 || !options || !options.native) return result;
    // Direct play of MP4 and copying AV1 into the fMP4 HLS stream instead of converting it.
    (result.DirectPlayProfiles || []).forEach(function (p) {
      if (p.Type === "Video" && /h264|hevc/.test(p.VideoCodec || "")) p.VideoCodec = add(p.VideoCodec, "av1");
    });
    (result.TranscodingProfiles || []).forEach(function (p) {
      if (p.Type === "Video" && p.Container === "mp4" && /hevc/.test(p.VideoCodec || ""))
        p.VideoCodec = add(p.VideoCodec, "av1");
    });
    result.CodecProfiles = (result.CodecProfiles || []).concat([
      {
        Type: "Video",
        Codec: "av1",
        Conditions: [
          condition("Width", 3840),
          condition("Height", 2160),
          condition("VideoBitDepth", 10),
          condition("VideoFramerate", 60),
          condition("VideoBitrate", 60000000),
          // HDR10+ and Dolby Vision with an HDR10 base layer play as HDR10.
          condition("VideoRangeType", "SDR|HDR10|HDR10Plus|DOVIWithHDR10|DOVIWithHDR10Plus", "EqualsAny", false),
        ],
      },
    ]);
    return result;
  };

  window.WholphinCodecs = { av1: av1 };
})();
