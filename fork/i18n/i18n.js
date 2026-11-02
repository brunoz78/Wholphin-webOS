/* Fork addition: runtime UI translation and language switch.
   Translates the English UI text in the DOM with window.WHOLPHIN_I18N[lang].
   Loaded before app.js, so the app code itself stays unchanged.
   Written for Chromium 79 (webOS 6): no optional chaining or ?? operator. */
(function () {
  "use strict";
  var KEY = "wholphin-fork-lang",
    LANGS = { de: "Deutsch", en: "English" },
    ATTRS = ["title", "placeholder", "alt"],
    // The video's own text and user input are never translated.
    SKIP_IDS = { "subtitle-overlay": 1, "live-preview-caption": 1 },
    SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, svg: 1, SVG: 1 };

  var lang = "de";
  try {
    lang = localStorage.getItem(KEY) || "de";
  } catch (_) {}
  if (!LANGS[lang]) lang = "de";
  var all = window.WHOLPHIN_I18N || {},
    dict = all[lang] || { strings: {}, rules: [] };

  // ---- lookup -------------------------------------------------------------
  function norm(s) {
    return s.replace(/\s+/g, " ").trim();
  }
  function reEsc(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  var exact = new Map(),
    patterns = [],
    values = new Set();
  Object.keys(dict.strings).forEach(function (k) {
    var v = dict.strings[k];
    values.add(norm(v));
    if (!/\{\d+\}/.test(k)) return exact.set(k, v);
    var order = [];
    var src = k
      .split(/(\{\d+\})/)
      .map(function (part) {
        var m = part.match(/^\{(\d+)\}$/);
        if (m) {
          order.push(+m[1]);
          return "([\\s\\S]+?)";
        }
        return reEsc(part);
      })
      .join("");
    patterns.push({
      re: new RegExp("^" + src + "$"),
      out: v,
      order: order,
      len: k.replace(/\{\d+\}/g, "").length,
    });
  });
  // Most specific pattern first.
  patterns.sort(function (a, b) {
    return b.len - a.len;
  });
  var rules = (dict.rules || []).map(function (r) {
    return [new RegExp("^" + r[0] + "$"), r[1]];
  });

  var cache = new Map();
  function translate(text, depth) {
    depth = depth || 0;
    var key = norm(text);
    if (!key || !/[A-Za-z]/.test(key)) return null;
    if (cache.has(key)) return cache.get(key);
    var out = exact.has(key) ? exact.get(key) : null;
    if (out == null)
      for (var i = 0; i < rules.length; i++)
        if (rules[i][0].test(key)) {
          out = key.replace(rules[i][0], rules[i][1]);
          break;
        }
    if (out == null && !values.has(key))
      for (var j = 0; j < patterns.length; j++) {
        var p = patterns[j],
          m = key.match(p.re);
        if (!m) continue;
        out = p.out.replace(/\{(\d+)\}/g, function (_, n) {
          var v = m[p.order.indexOf(+n) + 1] || "";
          if (depth >= 2) return v;
          var t = translate(v, depth + 1);
          return t == null ? v : t;
        });
        break;
      }
    if (out != null) values.add(norm(out));
    if (cache.size > 5000) cache.clear();
    cache.set(key, out);
    return out;
  }

  // ---- DOM ----------------------------------------------------------------
  var written = new WeakMap();
  function skipped(node) {
    for (var n = node; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP_TAGS[n.nodeName] || SKIP_IDS[n.id]) return true;
      if (n.hasAttribute("data-no-i18n")) return true;
    }
    return false;
  }
  function doText(node) {
    var v = node.data;
    if (written.get(node) === v || !v || v.length > 1000) return;
    if (!node.parentNode || skipped(node.parentNode)) return;
    var t = translate(v);
    if (t == null) return;
    var nv = v.match(/^\s*/)[0] + t + v.match(/\s*$/)[0];
    written.set(node, nv);
    if (nv !== v) node.data = nv;
  }
  function doAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (!v) continue;
      var t = translate(v);
      if (t != null && t !== v) el.setAttribute(ATTRS[i], t);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) {
      if (skipped(root)) return;
      doAttrs(root);
    }
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 1 && (SKIP_TAGS[n.nodeName] || SKIP_IDS[n.id] || n.hasAttribute("data-no-i18n")))
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else doAttrs(n);
    }
  }

  // The app compares the status line with its English text ("Preparing playback…"),
  // so reading it returns what the app wrote, while the screen shows the translation.
  function keepStatusReadable() {
    var status = document.getElementById("status");
    if (!status) return;
    var desc = Object.getOwnPropertyDescriptor(Node.prototype, "textContent"),
      original = desc.get.call(status);
    Object.defineProperty(status, "textContent", {
      configurable: true,
      get: function () {
        return original;
      },
      set: function (v) {
        original = v == null ? "" : String(v);
        desc.set.call(status, original);
      },
    });
  }

  function wrapDialogs() {
    ["alert", "confirm"].forEach(function (name) {
      var orig = window[name];
      if (typeof orig !== "function") return;
      window[name] = function (msg) {
        if (typeof msg === "string") {
          var t = translate(msg);
          if (t != null) msg = t;
        }
        return orig.call(window, msg);
      };
    });
  }

  // ---- language switch in the settings --------------------------------------
  function setLang(next) {
    try {
      localStorage.setItem(KEY, next);
    } catch (_) {}
    location.reload();
  }
  function el(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function mountSwitch() {
    var main = document.getElementById("main");
    if (!main || !main.classList.contains("settings-page")) return;
    if (document.getElementById("fork-language")) return;
    var pane = main.querySelector(".settings-pane"),
      categories = main.querySelector(".settings-categories");
    if (!pane || !categories) return;
    var sections = pane.querySelectorAll(".settings-section"),
      cats = categories.querySelectorAll(".settings-category"),
      before = sections[sections.length - 1], // "About" stays last
      beforeCat = cats[cats.length - 1],
      de = lang === "de";
    var area = el("section", "settings-section");
    area.id = "fork-language";
    area.setAttribute("data-no-i18n", "");
    el("h2", null, de ? "Sprache" : "Language", area);
    el("p", "settings-description", de ? "Sprache der Oberfläche auf diesem Fernseher." : "Interface language on this TV.", area);
    var row = el("button", "setting-row", null, area);
    row.setAttribute("aria-label", (de ? "Sprache: " : "Language: ") + LANGS[lang]);
    var copy = el("span", "setting-copy", null, row);
    el("span", "setting-title", de ? "Sprache" : "Language", copy);
    el("span", "setting-description", de ? "Wechselt zwischen Deutsch und Englisch. Die App startet dabei neu." : "Switch between German and English. The app restarts.", copy);
    el("span", "setting-value", LANGS[lang], row);
    row.onclick = function () {
      setLang(de ? "en" : "de");
    };
    var cat = el("button", "settings-category", de ? "Sprache" : "Language");
    cat.setAttribute("data-no-i18n", "");
    cat.onclick = function () {
      row.focus();
    };
    // The app's remote navigation follows these two links between category and section.
    cat.settingsSection = area;
    area.categoryButton = cat;
    if (before) pane.insertBefore(area, before);
    else pane.appendChild(area);
    if (beforeCat) categories.insertBefore(cat, beforeCat);
    else categories.appendChild(cat);
  }

  // ---- start --------------------------------------------------------------
  window.wholphinI18n = {
    lang: lang,
    languages: LANGS,
    t: function (s) {
      var t = translate(s);
      return t == null ? s : t;
    },
    setLang: setLang,
  };
  document.documentElement.lang = lang;
  wrapDialogs();
  function start() {
    keepStatusReadable();
    walk(document.documentElement);
    if (document.title) {
      var t = translate(document.title);
      if (t != null) document.title = t;
    }
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === "childList")
          for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
        else if (r.type === "characterData") doText(r.target);
        else if (r.type === "attributes" && !skipped(r.target)) doAttrs(r.target);
      }
      mountSwitch();
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
    mountSwitch();
  }
  // Loaded at the end of <body>: the static page already exists, the app has not rendered yet.
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
