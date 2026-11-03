// Fork addition: builds the LG webOS app as "Wholphin" with German UI.
// Runs the original build unchanged, then adds the translation and the branding
// to dist/webos only, so the sources of the original stay untouched.
//   node fork/build.mjs            build dist/webos
//   node fork/build.mjs --package  also create the .ipk (needs ares-package)
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  fork = path.join(root, "fork"),
  out = path.join(root, "dist/webos"),
  APP_ID = "ch.brunoz78.wholphin";

function run(cmd, args, shell) {
  // Windows can start the ares-*.cmd scripts only through the shell.
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: !!shell });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
}

run(process.execPath, ["tools/build.mjs", "webos"]);

// Translation data: German, plus English with the Wholphin name only.
const de = JSON.parse(await fs.readFile(path.join(fork, "i18n/de.json"), "utf8")),
  strings = JSON.parse(await fs.readFile(path.join(fork, "i18n/strings.json"), "utf8")),
  en = { strings: {}, rules: [["Ember for Jellyfin · v([\\d.]+)", "Wholphin for Jellyfin · v$1"]] };
for (const k of Object.keys(strings))
  if (/\bEmber\b/.test(k) && !/ · v\d/.test(k)) en.strings[k] = k.replace(/\bEmber\b/g, "Wholphin");
// Release name shown in the playback information: the workflow passes the release tag,
// a local build is marked as such.
const version = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")).version,
  stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 12),
  release = process.env.FORK_RELEASE || `v${version}.local${stamp}`;
await fs.writeFile(
  path.join(out, "i18n-data.js"),
  "window.WHOLPHIN_I18N = " + JSON.stringify({ de: { strings: de.strings, rules: de.rules }, en }) + ";\n" +
    "window.WHOLPHIN_RELEASE = " + JSON.stringify(release) + ";\n",
);
await fs.copyFile(path.join(fork, "i18n/i18n.js"), path.join(out, "i18n.js"));
await fs.copyFile(path.join(fork, "subtitles/pgs.js"), path.join(out, "pgs.js"));
await fs.copyFile(path.join(fork, "playback/codecs.js"), path.join(out, "codecs.js"));
await fs.copyFile(path.join(fork, "playback/stats.js"), path.join(out, "stats.js"));
await fs.copyFile(path.join(fork, "login.js"), path.join(out, "login.js"));
await fs.copyFile(path.join(fork, "nav.js"), path.join(out, "nav.js"));
await fs.copyFile(path.join(fork, "extras.js"), path.join(out, "extras.js"));
await fs.copyFile(path.join(fork, "exit.js"), path.join(out, "exit.js"));
await fs.copyFile(path.join(fork, "overview.js"), path.join(out, "overview.js"));
await fs.copyFile(path.join(fork, "filmography.js"), path.join(out, "filmography.js"));
await fs.copyFile(path.join(fork, "plex.js"), path.join(out, "plex.js"));
await fs.copyFile(path.join(fork, "playback/theme.js"), path.join(out, "theme.js"));
await fs.copyFile(path.join(fork, "style.css"), path.join(out, "fork.css"));

// Page: load the translation before the app, show the Wholphin name.
let html = await fs.readFile(path.join(out, "index.html"), "utf8");
const hook = '<script src="core.js"></script>',
  appHook = '<script src="app.js"></script>';
if (!html.includes(hook) || !html.includes(appHook)) throw new Error("index.html changed: script hooks of the fork not found");
html = html
  .replace(hook, '<script src="i18n-data.js"></script>\n    <script src="i18n.js"></script>\n    ' + hook)
  // PGS subtitles and AV1 hook into WholphinCore, so they load after core.js and before app.js.
  .replace(
    appHook,
    '<script src="pgs.js"></script>\n    <script src="codecs.js"></script>\n    <script src="login.js"></script>\n    ' + appHook +
      '\n    <script src="stats.js"></script>\n    <script src="nav.js"></script>\n    <script src="extras.js"></script>\n    <script src="exit.js"></script>\n    <script src="overview.js"></script>\n    <script src="filmography.js"></script>\n    <script src="plex.js"></script>',
  )
  // Theme music must exist before the app opens its first page.
  .replace(
    appHook,
    '<script src="theme.js"></script>\n    ' + appHook,
  )
  .replace('<link rel="stylesheet" href="style.css" />', '<link rel="stylesheet" href="style.css" /><link rel="stylesheet" href="fork.css" />')
  .replace(/<title>[^<]*<\/title>/, "<title>Wholphin</title>")
  .replace("<strong>Ember</strong>", "<strong>Wholphin</strong>");
await fs.writeFile(path.join(out, "index.html"), html);

// Code patches on the built copy. Each one fails the build if the original code moved,
// so a change of the original is noticed instead of silently dropping the feature.
async function patch(file, from, to, why) {
  const p = path.join(out, file),
    code = await fs.readFile(p, "utf8");
  if (!code.includes(from)) throw new Error(`Patch "${why}" no longer fits ${file}`);
  await fs.writeFile(p, code.replace(from, to));
}
// Subtitle defaults of the fork: off unless chosen (the original remembers the last choice and
// picks English subtitles for every non-English audio track, i.e. also for German audio).
// "Preferred language" is German when switched on in Settings.
await patch(
  "app.js",
  '{mode: "remember", language: "eng", foreignEnglish: true}',
  '{mode: "off", language: "deu", foreignEnglish: false}',
  "Subtitle defaults",
);

// Direct play also with an applied track choice, see WholphinNeedsRemux in playback/codecs.js.
await patch(
  "app.js",
  "(!!options.trackChange || !!subtitleCues || !!options.applyPreferences)",
  "(!!options.trackChange || !!(window.WholphinNeedsRemux ? window.WholphinNeedsRemux(options, sourceMetadata) : (subtitleCues || options.applyPreferences)))",
  "Direct play with track choice",
);

// Native playback is the default on LG (the original starts in Compatibility: H.264, at most 1080p).
await patch(
  "app.js",
  "native: !!P.playbackPolicy,",
  "native: true,",
  "Native playback by default",
);
// Watched check marks and episodes opening in the season view come from the original since 0.2.82.

// A playlist or a collection opens its items directly instead of its detail page.
await patch(
  "app.js",
  "return detail(item.Id, !!item.IsLiveProgram);",
  "return item.Type === \"Playlist\" ? forkPlaylist(item) : item.Type === \"BoxSet\" ? forkCollection(item) : detail(item.Id, !!item.IsLiveProgram);",
  "Playlist and collection open their items",
);
// A playlist opens its items directly (no detail page and "Browse" step), loaded at once,
// in playlist order: watchlists synced from Plex (e.g. by CrossWatch) list the newest first.
// Episodes are shown as their series, once: such watchlists list every single episode.
// The playlist "Watchlist" and the playlists library are called "Merkliste", as in Plex, and
// the library opens its only playlist directly.
await patch(
  "app.js",
  "  async function seasonsPage(seriesId) {",
  "  function forkWatchlistName(name) {\n" +
    "    var german = !window.wholphinI18n || window.wholphinI18n.lang !== \"en\";\n" +
    "    return name === \"Watchlist\" || name === \"Playlists\" ? (german ? \"Merkliste\" : \"Watchlist\") : name;\n" +
    "  }\n" +
    "  async function forkPlaylists(library) {\n" +
    "    var found = await api(\"/Users/\" + session.user + \"/Items\", { ParentId: library.Id, Limit: 2 });\n" +
    "    var only = (found.Items || []).length === 1 && found.Items[0].Type === \"Playlist\" ? found.Items[0] : null;\n" +
    "    return only ? forkPlaylist(only) : listing(library.Id, forkWatchlistName(library.Name));\n" +
    "  }\n" +
    "  async function forkPlaylist(item) {\n" +
    "    var r = reset(forkWatchlistName(item.Name));\n" +
    "    main.className = \"library-page fork-playlist-page\";\n" +
    "    var info = el(\"p\", \"Loading…\", main);\n" +
    "    info.className = \"metadata\";\n" +
    "    var data = await api(\"/Playlists/\" + encodeURIComponent(item.Id) + \"/Items\", {\n" +
    "      UserId: session.user,\n" +
    "      Fields: \"PrimaryImageAspectRatio,ProductionYear\",\n" +
    "    });\n" +
    "    if (r !== revision) return;\n" +
    "    var entries = [], seriesIds = [], seen = {};\n" +
    "    (data.Items || []).forEach(function (entry) {\n" +
    "      if (entry.Type === \"Episode\" && entry.SeriesId) {\n" +
    "        if (seen[entry.SeriesId]) return;\n" +
    "        seen[entry.SeriesId] = true;\n" +
    "        seriesIds.push(entry.SeriesId);\n" +
    "        entries.push({ seriesId: entry.SeriesId, episode: entry });\n" +
    "      } else entries.push(entry);\n" +
    "    });\n" +
    "    var series = {};\n" +
    "    if (seriesIds.length) {\n" +
    "      var found = await api(\"/Users/\" + session.user + \"/Items\", {\n" +
    "        Ids: seriesIds.join(\",\"),\n" +
    "        Fields: \"PrimaryImageAspectRatio,ProductionYear\",\n" +
    "      });\n" +
    "      if (r !== revision) return;\n" +
    "      (found.Items || []).forEach(function (s) { series[s.Id] = s; });\n" +
    "    }\n" +
    "    var items = entries.map(function (entry) {\n" +
    "      return entry.seriesId ? series[entry.seriesId] || entry.episode : entry;\n" +
    "    });\n" +
    "    info.textContent = items.length + \" items loaded\";\n" +
    "    if (!items.length) el(\"p\", \"No items found.\", main);\n" +
    "    else {\n" +
    "      var grid = cards(items, main);\n" +
    "      var restoreFrame = stack[stack.length - 1];\n" +
    "      var restore = Array.prototype.find.call(grid.children, function (card) {\n" +
    "        return restoreFrame && card.dataset.item === restoreFrame.focus;\n" +
    "      });\n" +
    "      (restore || grid.firstElementChild).focus();\n" +
    "    }\n" +
    // Plex watchlist titles that are not in the library yet (fork/plex.js).
    "    if (window.WholphinPlexMissing) window.WholphinPlexMissing({\n" +
    "      parent: main,\n" +
    "      valid: function () { return r === revision; },\n" +
    "      cards: function (list, parent, onSelect) { return cards(list, parent, null, null, onSelect); },\n" +
    "    });\n" +
    "  }\n" +
    // Pages of the fork outside the library (TMDB information page), with Back like any page.
    "  window.WholphinPage = function (title, build) {\n" +
    "    run(function () {\n" +
    "      return go(function () {\n" +
    "        var pageRevision = reset(title);\n" +
    "        main.className = \"detail-page fork-collection-page fork-tmdb-page\";\n" +
    "        return build(main, function () { return pageRevision === revision; });\n" +
    "      });\n" +
    "    });\n" +
    "  };\n" +
    "  async function seasonsPage(seriesId) {",
  "Playlist page",
);
await patch(
  "app.js",
  '        label = name === "tv" ? "TV" : name === "kids tv" ? "Kids TV" : item.Name;',
  '        label = name === "tv" ? "TV" : name === "kids tv" ? "Kids TV" : item.CollectionType === "playlists" ? forkWatchlistName(item.Name) : item.Name;',
  "Playlists library called Merkliste",
);
await patch(
  "app.js",
  "              : listing(item.Id, item.Name);",
  "              : item.CollectionType === \"playlists\" ? forkPlaylists(item) : listing(item.Id, item.Name);",
  "Playlists library opens its only playlist",
);

// Series page as in Plex: series poster beside the title, season posters instead of the series
// poster, no "Continue watching" row (it stays hidden for the Play button, see style.css).
await patch(
  "app.js",
  "    else if (!landscape && item.SeriesId) id = item.SeriesId;",
  "    else if (!landscape && item.SeriesId && !(item.Type === \"Season\" && tags.Primary)) id = item.SeriesId;",
  "Season posters",
);
await patch(
  "app.js",
  '      "detail-page" + (item.Type === "Series" ? " series-detail" : item.Type === "Movie" ? " movie-detail" : "");',
  '      "detail-page" + (item.Type === "Series" ? " series-detail" : item.Type === "Movie" ? " movie-detail" : "");\n' +
    '    if (item.Type === "Series" && item.ImageTags && item.ImageTags.Primary) {\n' +
    '      var forkPoster = el("img", null, null);\n' +
    '      main.insertBefore(forkPoster, main.firstChild);\n' +
    '      forkPoster.className = "fork-series-poster";\n' +
    '      forkPoster.alt = "";\n' +
    '      main.classList.add("fork-has-poster");\n' +
    '      setImageSource(forkPoster, session.server + "/Items/" + encodeURIComponent(item.Id) + "/Images/Primary?maxWidth=450&quality=85");\n' +
    "    }",
  "Series poster",
);
// Remote on the series page: down from Play leads to the seasons (the original jumps to the cast),
// up from the seasons back to Play (the hidden "Continue watching" row cannot take the focus).
await patch(
  "app.js",
  '    if ((!playing || livePreview) && key === 40 && active.closest(".actions")) {',
  '    if ((!playing || livePreview) && key === 40 && active.closest(".actions") && main.querySelector(".season-grid .card")) {\n' +
    '      focusContent(main.querySelector(".season-grid .card"));\n' +
    "      return;\n" +
    "    }\n" +
    '    if ((!playing || livePreview) && key === 40 && active.closest(".actions")) {',
  "Series page: Play down to the seasons",
);
await patch(
  "app.js",
  '            main.querySelector(".series-continue .card") ||',
  '            (main.classList.contains("series-detail") ? null : main.querySelector(".series-continue .card")) ||',
  "Series page: seasons up to Play",
);
// The series page opens with Play focused, as in Plex (the original focuses the hidden row).
await patch(
  "app.js",
  "          seriesPlay.disabled = false;",
  "          seriesPlay.disabled = false;\n" +
    '          if (document.activeElement === main.querySelector(".season-grid .card") &&\n' +
    "              !(stack[stack.length - 1] && stack[stack.length - 1].focus)) {\n" +
    "            seriesPlay.focus();\n" +
    "            main.scrollTop = 0;\n" +
    "          }",
  "Series page: Play focused",
);
// A collection opens a page as in Plex: collection poster, years and description, a Play
// button (first movie not yet watched) and the movies below, with title and year.
await patch(
  "app.js",
  "  async function seasonsPage(seriesId) {",
  "  async function forkCollection(item) {\n" +
    "    var r = reset(item.Name);\n" +
    "    var data = await Promise.all([\n" +
    "      api(\"/Users/\" + session.user + \"/Items/\" + item.Id),\n" +
    "      api(\"/Users/\" + session.user + \"/Items\", {\n" +
    "        ParentId: item.Id,\n" +
    "        SortBy: \"ProductionYear,PremiereDate,SortName\",\n" +
    "        Fields: \"PrimaryImageAspectRatio,ProductionYear,UserData\",\n" +
    "      }),\n" +
    "    ]);\n" +
    "    if (r !== revision) return;\n" +
    "    var full = data[0], movies = data[1].Items || [];\n" +
    "    main.className = \"detail-page fork-collection-page\";\n" +
    "    setBackdrop(full);\n" +
    "    if (full.ImageTags && full.ImageTags.Primary) {\n" +
    "      var poster = el(\"img\", null, null);\n" +
    "      poster.className = \"fork-series-poster\";\n" +
    "      poster.alt = \"\";\n" +
    "      main.insertBefore(poster, main.firstChild);\n" +
    "      main.classList.add(\"fork-has-poster\");\n" +
    "      setImageSource(poster, session.server + \"/Items/\" + encodeURIComponent(full.Id) + \"/Images/Primary?maxWidth=450&quality=85\");\n" +
    "    }\n" +
    "    var years = movies.map(function (m) { return m.ProductionYear; }).filter(Boolean),\n" +
    "      first = Math.min.apply(null, years), last = Math.max.apply(null, years),\n" +
    "      facts = [];\n" +
    "    if (full.OfficialRating) facts.push(full.OfficialRating);\n" +
    "    if (years.length) facts.push(first === last ? String(first) : first + \" — \" + last);\n" +
    "    if (facts.length) el(\"p\", facts.join(\" · \"), main).className = \"metadata\";\n" +
    "    if (full.Overview) el(\"p\", full.Overview, main).className = \"overview\";\n" +
    "    var actions = el(\"div\", null, main);\n" +
    "    actions.className = \"actions\";\n" +
    "    var next = movies.find(function (m) { return !(m.UserData && m.UserData.Played); }) || movies[0];\n" +
    "    var playButton = next && button(\"Play\", function () {\n" +
    "      return play(next, (next.UserData && next.UserData.PlaybackPositionTicks) || 0, true);\n" +
    "    }, actions);\n" +
    "    var section = el(\"section\", null, main);\n" +
    "    section.className = \"fork-collection-movies\";\n" +
    "    el(\"h2\", movies.length === 1 ? \"1 movie\" : movies.length + \" movies\", section);\n" +
    "    if (!movies.length) return;\n" +
    "    var grid = cards(movies, section);\n" +
    "    grid.classList.add(\"season-grid\", \"rail\", \"portrait\");\n" +
    "    var restoreFrame = stack[stack.length - 1];\n" +
    "    var restore = Array.prototype.find.call(grid.children, function (card) {\n" +
    "      return restoreFrame && card.dataset.item === restoreFrame.focus;\n" +
    "    });\n" +
    "    focusContent(restore || playButton || grid.firstElementChild);\n" +
    "    main.scrollTop = 0;\n" +
    "  }\n" +
    "  async function seasonsPage(seriesId) {",
  "Collection page",
);
// Cast: OK on a person opens a page as in Plex with picture, name, biography and the movies and
// shows of the library with this person (the original does nothing).
await patch(
  "app.js",
  "          figure.tabIndex = 0;",
  "          figure.tabIndex = 0;\n" +
    "          (function (target, who) {\n" +
    "            target.onclick = function () {\n" +
    "              run(function () { return go(function () { return forkPerson(who); }); });\n" +
    "            };\n" +
    "            target.addEventListener(\"keydown\", function (event) {\n" +
    "              if (event.keyCode !== 13) return;\n" +
    "              event.preventDefault();\n" +
    "              event.stopPropagation();\n" +
    "              target.onclick();\n" +
    "            });\n" +
    "          })(figure, person);",
  "Cast opens the person",
);
await patch(
  "app.js",
  "  async function seasonsPage(seriesId) {",
  "  async function forkPerson(person) {\n" +
    "    var r = reset(person.Name);\n" +
    "    var data = await Promise.all([\n" +
    "      api(\"/Users/\" + session.user + \"/Items/\" + person.Id).catch(function () { return {}; }),\n" +
    "      api(\"/Users/\" + session.user + \"/Items\", {\n" +
    "        PersonIds: person.Id,\n" +
    "        Recursive: true,\n" +
    "        IncludeItemTypes: \"Movie,Series\",\n" +
    "        SortBy: \"ProductionYear,SortName\",\n" +
    "        SortOrder: \"Descending\",\n" +
    "        Fields: \"PrimaryImageAspectRatio,ProductionYear,UserData\",\n" +
    "      }),\n" +
    "    ]);\n" +
    "    if (r !== revision) return;\n" +
    "    var full = data[0] || {}, titles = data[1].Items || [];\n" +
    "    main.className = \"detail-page fork-collection-page fork-person-page\";\n" +
    "    if (person.PrimaryImageTag || (full.ImageTags && full.ImageTags.Primary)) {\n" +
    "      var picture = el(\"img\", null, null);\n" +
    "      picture.className = \"fork-series-poster\";\n" +
    "      picture.alt = \"\";\n" +
    "      main.insertBefore(picture, main.firstChild);\n" +
    "      main.classList.add(\"fork-has-poster\");\n" +
    "      setImageSource(picture, session.server + \"/Items/\" + encodeURIComponent(person.Id) + \"/Images/Primary?maxWidth=450&quality=85\");\n" +
    "    }\n" +
    "    if (full.PremiereDate) {\n" +
    "      var born = new Date(full.PremiereDate);\n" +
    "      el(\"p\", \"Born \" + born.toLocaleDateString(window.wholphinI18n && window.wholphinI18n.lang === \"en\" ? \"en-GB\" : \"de-CH\", { day: \"numeric\", month: \"long\", year: \"numeric\" }) +\n" +
    "        (full.ProductionLocations && full.ProductionLocations[0] ? \" · \" + full.ProductionLocations[0] : \"\"), main).className = \"metadata\";\n" +
    "    }\n" +
    "    if (full.Overview) el(\"p\", full.Overview, main).className = \"overview\";\n" +
    "    var section = el(\"section\", null, main);\n" +
    "    section.className = \"fork-collection-movies\";\n" +
    "    el(\"h2\", \"In your library (\" + titles.length + \")\", section);\n" +
    "    var grid = null, restoreFrame = stack[stack.length - 1], restore = null;\n" +
    "    if (!titles.length) el(\"p\", \"No items found.\", section);\n" +
    "    else {\n" +
    "      grid = cards(titles, section);\n" +
    "      grid.classList.add(\"season-grid\", \"rail\", \"portrait\");\n" +
    "      restore = Array.prototype.find.call(grid.children, function (card) {\n" +
    "        return restoreFrame && card.dataset.item === restoreFrame.focus;\n" +
    "      });\n" +
    "      focusContent(restore || grid.firstElementChild);\n" +
    "    }\n" +
    "    main.scrollTop = 0;\n" +
    // Full filmography from TMDB below the library titles (fork/filmography.js).
    "    if (window.WholphinFilmography) window.WholphinFilmography({\n" +
    "      person: full,\n" +
    "      after: section,\n" +
    "      grid: grid,\n" +
    "      restore: !restore && restoreFrame && restoreFrame.focus,\n" +
    "      valid: function () { return r === revision; },\n" +
    "      open: function (id) {\n" +
    "        run(function () { return go(function () { return detail(id); }); });\n" +
    "      },\n" +
    "      page: function (title, build) {\n" +
    "        run(function () {\n" +
    "          return go(function () {\n" +
    "            var pageRevision = reset(title);\n" +
    "            main.className = \"detail-page fork-collection-page fork-tmdb-page\";\n" +
    "            return build(main, function () { return pageRevision === revision; });\n" +
    "          });\n" +
    "        });\n" +
    "      },\n" +
    "    });\n" +
    "  }\n" +
    "  async function seasonsPage(seriesId) {",
  "Person page",
);

// Settings → About shows the exact release (e.g. v0.2.91.post202611031937), not only the app name.
await patch(
  "app.js",
  '    var about = section("About", "Ember for Jellyfin" + (P.appVersion && P.appVersion() ? " · v" + P.appVersion() : ""));',
  '    var about = section("About", "Wholphin for Jellyfin · " + (window.WHOLPHIN_RELEASE || (P.appVersion && P.appVersion() ? "v" + P.appVersion() : "")));',
  "Exact release in About",
);

// Leaving the app: Back on the start page asks with an own dialog (fork/exit.js); the TV does not
// show window.confirm, so Back did nothing.
await patch(
  "app.js",
  '      if (window.confirm("Exit Ember?")) window.close();',
  "      if (window.WholphinExit) window.WholphinExit();\n" +
    '      else if (window.confirm("Exit Ember?")) window.close();',
  "Exit dialog",
);

// Theme music (fork/playback/theme.js): detail pages and the season view report their item.
await patch(
  "app.js",
  "    if (liveProgram) item.IsLiveProgram = true;",
  "    if (liveProgram) item.IsLiveProgram = true;\n" +
    "    else if (window.WholphinTheme) window.WholphinTheme(item);",
  "Theme music on detail pages",
);
await patch(
  "app.js",
  '    main.className = "detail-page season-browser";',
  '    main.className = "detail-page season-browser";\n' +
    '    if (window.WholphinTheme) window.WholphinTheme({ Id: context.seriesId, Type: "Series" });',
  "Theme music in the season view",
);

// Skipping segments comes from the original (intro and outro). The fork adds recaps and
// previews, which the Intro Skipper plugin also marks, each with its own setting.
await patch(
  "core.js",
  '      return s && (s.Type === "Intro" || s.Type === "Outro") &&',
  '      return s && (s.Type === "Intro" || s.Type === "Recap" || s.Type === "Outro" || s.Type === "Preview") &&',
  "Recaps and previews as segments",
);
// Jellyfin rejects or ignores a comma list in IncludeSegmentTypes (no segments at all),
// so all segments are loaded and mediaSegments() in core.js picks the types.
await patch(
  "app.js",
  '{IncludeSegmentTypes: "Intro,Outro"}',
  '{}',
  "Load all segments",
);
await patch(
  "app.js",
  '    ["intro", "outro"].forEach(function (kind) {',
  '    ["intro", "recap", "outro", "preview"].forEach(function (kind) {',
  "Settings for recaps and previews",
);
await patch(
  "app.js",
  '      var title = kind === "intro" ? "Skip intro" : "Skip outro",',
  '      var title = "Skip " + kind,',
  "Setting titles for recaps and previews",
);

// Season view: the series title opens the series page with all seasons and their posters,
// as in Plex. Reachable with the remote from the season tabs (down) or the episodes (up).
await patch(
  "app.js",
  "    heading.textContent = context.title;",
  "    heading.textContent = \"\";\n" +
    "    var forkSeries = button(context.title, function () {\n" +
    "      return go(function () { return detail(context.seriesId); });\n" +
    "    }, heading);\n" +
    "    forkSeries.className = \"fork-series-link\";\n" +
    "    forkSeries.setAttribute(\"data-no-i18n\", \"\");",
  "Series title opens the series page",
);
await patch(
  "app.js",
  "          else if (key === 40) focusContent(Array.prototype.find.call(grid.children, function (card) {",
  "          else if (key === 40 && forkSeries) focusContent(forkSeries);\n" +
    "          else if (key === 40) focusContent(Array.prototype.find.call(grid.children, function (card) {",
  "Season tabs down to the series title",
);
await patch(
  "app.js",
  "        if (grid.contains(active) && key === 38) {",
  "        if (active === forkSeries && (key === 38 || key === 40)) {\n" +
    "          if (key === 38) focusContent(tabs.querySelector('[aria-selected=\"true\"]'));\n" +
    "          else focusContent(Array.prototype.find.call(grid.children, function (card) {\n" +
    "            return selected && card.dataset.item === selected.Id;\n" +
    "          }) || grid.querySelector(\".card\"));\n" +
    "          return true;\n" +
    "        }\n" +
    "        if (grid.contains(active) && key === 38 && forkSeries) {\n" +
    "          focusContent(forkSeries);\n" +
    "          return true;\n" +
    "        }\n" +
    "        if (grid.contains(active) && key === 38) {",
  "Series title between season tabs and episodes",
);

// Season view: no "All seasons" button (the series title does that), the subtitle choice sits
// in the button row instead of a row of its own. Down from the buttons leads to the cast.
await patch(
  "app.js",
  '    var subtitleMount = el("div", null, main),',
  '    var subtitleMount = el("div", null, actions),',
  "Season view: subtitles in the button row",
);
await patch(
  "app.js",
  '    if (context.seasons.length > 1) button("All seasons", function () {',
  '    subtitleMount.className = "fork-subtitle-action";\n' +
    "    actions.appendChild(subtitleMount);\n" +
    '    if (false) button("All seasons", function () {',
  "Season view: no All seasons button",
);
await patch(
  "app.js",
  "        if (actions.contains(active) && key === 38) {",
  "        if (actions.contains(active) && key === 40 && !active.closest(\"#detail-subtitle-menu\")) {\n" +
    '          var forkCast = main.querySelector(".cast-row");\n' +
    "          if (forkCast) {\n" +
    "            forkCast.castReturnFocus = active;\n" +
    '            focusContent(forkCast.querySelector("figure"));\n' +
    "          }\n" +
    "          return true;\n" +
    "        }\n" +
    "        if (actions.contains(active) && key === 38) {",
  "Season view: buttons down to the cast",
);

// Rewind on resume (fork/extras.js): resuming starts a few seconds before the saved position.
await patch(
  "app.js",
  "      var decoder = decoderOptions(),",
  "      if (!live && !options.trackChange && ticks > 0 && window.WholphinResumeRewind)\n" +
    "        ticks = Math.max(0, ticks - window.WholphinResumeRewind() * 10000000);\n" +
    "      var decoder = decoderOptions(),",
  "Rewind on resume",
);
// List view of libraries (fork/extras.js): the virtual grid needs the list's row height.
await patch(
  "app.js",
  "      rowHeight = width * (seasonContext ? 0.5625 : 1.5) + 75 + 32;",
  "      rowHeight = window.WholphinListRow && main.classList.contains(\"fork-list-view\") && !seasonContext\n" +
    "        ? window.WholphinListRow\n" +
    "        : width * (seasonContext ? 0.5625 : 1.5) + 75 + 32;",
  "Library list view",
);

// App entry on the TV: own ID, so it installs next to the original.
const info = JSON.parse(await fs.readFile(path.join(out, "appinfo.json"), "utf8"));
for (const f of [info.icon, info.largeIcon]) await fs.rm(path.join(out, f), { force: true });
await fs.copyFile(path.join(fork, "assets/wholphin-icon.png"), path.join(out, "wholphin-icon.png"));
await fs.copyFile(path.join(fork, "assets/wholphin-large-icon.png"), path.join(out, "wholphin-large-icon.png"));
Object.assign(info, {
  id: APP_ID,
  title: "Wholphin",
  vendor: "brunoz78",
  icon: "wholphin-icon.png",
  largeIcon: "wholphin-large-icon.png",
  iconColor: "#21172f",
});
await fs.writeFile(path.join(out, "appinfo.json"), JSON.stringify(info, null, 2) + "\n");
console.log(`Wholphin ${info.version} (${APP_ID}) in ${path.relative(root, out)}`);

if (process.argv.includes("--package")) {
  const ares = process.env.ARES_PACKAGE || (process.platform === "win32" ? "ares-package.cmd" : "ares-package");
  run(ares, ["dist/webos", "-o", "dist"], process.platform === "win32");
}
