/* Fork addition: subtitles shown by the TV without delaying playback, including PGS (Blu-ray).
   Loaded between core.js and app.js. The app keeps its normal flow for text subtitles:
   - WholphinCore.textSubtitle also accepts PGS tracks, so the video is requested without burn-in;
   - the app's request for ".../Subtitles/<n>/Stream.vtt" is answered at once with a placeholder,
     the track (Stream.vtt, or Stream.sup for PGS) is loaded in the background;
   - WholphinCore.subtitleText shows the track once loaded; PGS bitmaps are drawn on a canvas.
   Written for Chromium 79 (webOS 6): no optional chaining or ?? operator. */
(function () {
  "use strict";
  var C = window.WholphinCore;
  if (!C || !window.fetch) return;

  var MAX_BYTES = 40 * 1024 * 1024,
    pgsTracks = {}, // "<sourceId>:<index>" of PGS tracks seen by textSubtitle
    loaded = {}, // marker id -> cue list with .pgs
    nextId = 1;

  // ---- track selection ------------------------------------------------------
  function isPgs(track) {
    var codec = String((track && track.Codec) || "").toLowerCase();
    return track && track.Type === "Subtitle" && (codec === "pgssub" || codec === "pgs");
  }
  // Text formats Jellyfin converts to WebVTT (Stream.vtt) besides the ones the original accepts.
  var TEXT = { ass: 1, ssa: 1, mov_text: 1 };
  var textSubtitle = C.textSubtitle;
  C.textSubtitle = function (source, index) {
    var track = textSubtitle(source, index);
    if (track) return track;
    track = ((source && source.MediaStreams) || []).find(function (t) {
      return (
        t.Index === index &&
        t.Type === "Subtitle" &&
        TEXT[String(t.Codec || "").toLowerCase()] &&
        t.IsTextSubtitleStream !== false
      );
    });
    if (track) return track;
    track = ((source && source.MediaStreams) || []).find(function (t) {
      return t.Index === index && isPgs(t);
    });
    if (track && source.Id) pgsTracks[source.Id + ":" + index] = true;
    return track;
  };

  // ---- PGS decoding -----------------------------------------------------------
  // Segments: "PG", PTS (90 kHz), DTS, type, size. A display set is PCS [WDS] [PDS] [ODS...] END.
  function parse(buf) {
    var d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength),
      pos = 0,
      sets = [],
      objects = {},
      palettes = {},
      current = null;
    while (pos + 13 <= buf.length) {
      if (buf[pos] !== 0x50 || buf[pos + 1] !== 0x47) throw new Error("Invalid PGS data");
      var pts = d.getUint32(pos + 2) / 90000,
        type = buf[pos + 10],
        size = d.getUint16(pos + 11),
        p = pos + 13,
        end = p + size;
      if (end > buf.length) break;
      if (type === 0x16) {
        // Presentation composition
        var state = buf[p + 7],
          count = buf[p + 10];
        if (state & 0x80) {
          objects = {};
          palettes = {};
        }
        current = {
          time: pts,
          width: d.getUint16(p),
          height: d.getUint16(p + 2),
          paletteId: buf[p + 9],
          items: [],
        };
        var q = p + 11;
        for (var i = 0; i < count && q + 8 <= end; i++) {
          var item = { object: d.getUint16(q), x: d.getUint16(q + 4), y: d.getUint16(q + 6) };
          if (buf[q + 3] & 0x40) {
            item.crop = [d.getUint16(q + 8), d.getUint16(q + 10), d.getUint16(q + 12), d.getUint16(q + 14)];
            q += 16;
          } else q += 8;
          current.items.push(item);
        }
      } else if (type === 0x14) {
        // Palette: id, version, then entries of id, Y, Cr, Cb, alpha
        var palette = new Uint32Array(palettes[buf[p]] || new Uint32Array(256));
        for (var e = p + 2; e + 5 <= end; e += 5) palette[buf[e]] = rgba(buf[e + 1], buf[e + 2], buf[e + 3], buf[e + 4]);
        palettes[buf[p]] = palette;
      } else if (type === 0x15) {
        // Object: id, version, sequence flag (0x80 first, 0x40 last), then RLE data in fragments
        var id = d.getUint16(p),
          flag = buf[p + 3];
        if (flag & 0x80) {
          objects[id] = {
            width: d.getUint16(p + 7),
            height: d.getUint16(p + 9),
            parts: [buf.subarray(p + 11, end)],
          };
        } else if (objects[id]) {
          objects[id] = { width: objects[id].width, height: objects[id].height, parts: objects[id].parts.concat([buf.subarray(p + 4, end)]) };
        }
      } else if (type === 0x80 && current) {
        // End of display set: freeze what is shown from this time on.
        var shown = [];
        current.items.forEach(function (item) {
          var obj = objects[item.object];
          if (obj) shown.push({ x: item.x, y: item.y, crop: item.crop, object: obj });
        });
        sets.push({
          time: current.time,
          width: current.width,
          height: current.height,
          palette: palettes[current.paletteId] || new Uint32Array(256),
          items: shown,
        });
        current = null;
      }
      pos = end;
    }
    return sets;
  }

  var littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  // BT.709 YCbCr to RGBA in the byte order of an ImageData pixel.
  function rgba(y, cr, cb, a) {
    var r = clamp(y + 1.5748 * (cr - 128)),
      g = clamp(y - 0.1873 * (cb - 128) - 0.4681 * (cr - 128)),
      b = clamp(y + 1.8556 * (cb - 128));
    return littleEndian ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
  }

  // Run-length decoding of one object into a canvas.
  function bitmap(obj, palette) {
    var w = obj.width,
      h = obj.height,
      pixels = new Uint32Array(w * h),
      total = 0;
    obj.parts.forEach(function (part) {
      total += part.length;
    });
    var data = new Uint8Array(total),
      at = 0;
    obj.parts.forEach(function (part) {
      data.set(part, at);
      at += part.length;
    });
    var i = 0,
      x = 0,
      y = 0;
    while (i < data.length && y < h) {
      var color = data[i++],
        run = 1;
      if (color === 0) {
        var flag = data[i++];
        if (flag === 0) {
          x = 0;
          y++;
          continue;
        }
        run = flag & 0x3f;
        if (flag & 0x40) run = (run << 8) | data[i++];
        color = flag & 0x80 ? data[i++] : 0;
      }
      var value = palette[color],
        start = y * w + x;
      for (var k = 0; k < run && x < w; k++, x++) pixels[start + k] = value;
    }
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var image = canvas.getContext("2d").createImageData(w, h);
    image.data.set(new Uint8ClampedArray(pixels.buffer));
    canvas.getContext("2d").putImageData(image, 0, 0);
    return canvas;
  }

  function cueList(sets) {
    var cues = [];
    sets.forEach(function (set, i) {
      if (!set.items.length) return;
      var next = sets[i + 1],
        end = next ? next.time : set.time + 10;
      if (end > set.time) cues.push({ start: set.time, end: end, text: "", set: set });
    });
    var maxEnd = 0;
    cues.forEach(function (cue) {
      cue.maxEnd = maxEnd = Math.max(maxEnd, cue.end);
    });
    return cues;
  }

  // ---- answering the app's subtitle request in the background ----------------------
  // The app waits for the subtitle file before it starts the video and gives up after 20 s;
  // then it lets the server burn the subtitles in, which forces Compatibility (H.264). Extracting
  // a track from a large MKV the first time often takes longer than that. So the request is
  // answered at once with a placeholder, the video starts natively, and the track is loaded in
  // the background without a time limit and shown as soon as it arrives.
  var nativeFetch = window.fetch.bind(window),
    parseSubtitles = C.parseSubtitles;

  function readLimited(response) {
    if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Subtitle file is too large.");
    return response.arrayBuffer().then(function (data) {
      if (data.byteLength > MAX_BYTES) throw new Error("Subtitle file is too large.");
      return new Uint8Array(data);
    });
  }

  function load(entry, url, init, pgs) {
    var headers = (init && init.headers) || {};
    nativeFetch(pgs ? url.replace("/Stream.vtt", "/Stream.sup") : url, {
      method: "GET",
      headers: headers,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: entry.controller.signal,
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Jellyfin request failed (" + response.status + ").");
        return readLimited(response);
      })
      .then(function (data) {
        entry.cues = pgs ? cueList(parse(data)) : parseSubtitles(new TextDecoder("utf-8").decode(data));
        entry.pgs = pgs;
      })
      .catch(function (error) {
        if (error && error.name === "AbortError") return;
        entry.cues = [];
        if (window.console) console.warn("Wholphin subtitles:", error && error.message);
      });
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input && input.url,
      m = url && url.match(/\/Videos\/[^/]+\/([^/]+)\/Subtitles\/(\d+)\/Stream\.vtt(\?|$)/);
    if (!m) return nativeFetch(input, init);
    var id = "sub" + nextId++,
      entry = { url: url, cues: null, pgs: false, controller: new AbortController() };
    // Keep the newest few tracks; the app may switch back to the previous one.
    var ids = Object.keys(loaded);
    if (ids.length >= 3) {
      loaded[ids[0]].controller.abort();
      delete loaded[ids[0]];
    }
    loaded[id] = entry;
    load(entry, url, init, !!pgsTracks[decodeURIComponent(m[1]) + ":" + m[2]]);
    return Promise.resolve(
      new Response("WEBVTT\n\nNOTE wholphin-sub " + id + "\n", {
        status: 200,
        headers: { "Content-Type": "text/vtt" },
      }),
    );
  };

  C.parseSubtitles = function (value) {
    var m = typeof value === "string" && value.match(/^WEBVTT\n\nNOTE wholphin-sub (sub\d+)\n$/);
    if (!m || !loaded[m[1]]) return parseSubtitles(value);
    // The app rejects an empty list, so the placeholder holds one empty cue.
    var cues = [{ start: 0, end: 0, maxEnd: 0, text: "" }];
    cues.lazy = m[1];
    return cues;
  };

  // ---- drawing ------------------------------------------------------------------
  var canvas = null,
    active = null, // cue list being shown
    delay = 0,
    lastCall = 0,
    shownCue = null,
    cache = [];

  function setup() {
    var player = document.getElementById("player"),
      overlay = document.getElementById("subtitle-overlay");
    if (canvas || !player) return;
    canvas = document.createElement("canvas");
    canvas.id = "pgs-overlay";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;";
    if (overlay) player.insertBefore(canvas, overlay);
    else player.appendChild(canvas);
  }

  function clear() {
    shownCue = null;
    if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  function image(cue, item) {
    for (var i = 0; i < cache.length; i++) if (cache[i].cue === cue && cache[i].item === item) return cache[i].canvas;
    var c = bitmap(item.object, cue.set.palette);
    cache.unshift({ cue: cue, item: item, canvas: c });
    if (cache.length > 8) cache.pop();
    return c;
  }

  function draw(cue) {
    var video = document.getElementById("video");
    setup();
    if (!canvas || !video) return;
    var w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      shownCue = null;
    }
    if (cue === shownCue) return;
    clear();
    shownCue = cue;
    if (!cue) return;
    // Video picture inside the element (object-fit contain or cover), then the PGS frame
    // scaled to the picture width and centred vertically, as other players do.
    var vw = video.videoWidth || cue.set.width,
      vh = video.videoHeight || cue.set.height,
      fit = getComputedStyle(video).objectFit,
      s = fit === "cover" ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh),
      pw = vw * s,
      ph = vh * s,
      scale = pw / cue.set.width,
      ox = (w - pw) / 2,
      oy = (h - ph) / 2 + (ph - cue.set.height * scale) / 2,
      ctx = canvas.getContext("2d");
    cue.set.items.forEach(function (item) {
      var src = image(cue, item),
        crop = item.crop || [0, 0, item.object.width, item.object.height];
      ctx.drawImage(src, crop[0], crop[1], crop[2], crop[3], ox + item.x * scale, oy + item.y * scale, crop[2] * scale, crop[3] * scale);
    });
  }

  function cueAt(cues, time) {
    var low = 0,
      high = cues.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      if (cues[mid].start <= time) low = mid + 1;
      else high = mid;
    }
    var cue = cues[low - 1];
    return cue && cue.end > time ? cue : null;
  }

  function frame() {
    var video = document.getElementById("video"),
      player = document.getElementById("player");
    // The app asks for subtitle text on every time update while playing; without such a call
    // for a while (another track, subtitles off, playback stopped) the picture is removed.
    var stale = !video || video.paused ? false : Date.now() - lastCall > 1200;
    if (!active || !player || player.hidden || document.hidden || stale) {
      if (shownCue) clear();
      if (stale || (player && player.hidden)) active = null;
    } else draw(cueAt(active, video.currentTime - delay));
    if (active) requestAnimationFrame(frame);
  }

  var subtitleText = C.subtitleText;
  C.subtitleText = function (cues, seconds, offset) {
    if (cues && cues.lazy) {
      var entry = loaded[cues.lazy];
      // Still loading (or failed): nothing to show yet.
      cues = entry && entry.cues && entry.cues.length ? entry.cues : [];
      if (entry && entry.pgs) cues.pgs = cues.pgs || cues.lazy || "pgs";
    }
    if (cues && cues.pgs) {
      var wasActive = active;
      active = cues;
      delay = offset || 0;
      lastCall = Date.now();
      if (!wasActive) requestAnimationFrame(frame);
      draw(cueAt(cues, seconds - delay));
      return "";
    }
    if (active) {
      active = null;
      clear();
    }
    return subtitleText(cues, seconds, offset);
  };

  window.WholphinPgs = { parse: parse, cueList: cueList };
})();
