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
      '\n    <script src="stats.js"></script>',
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
// Watched episodes get a check mark on their card (the original only shows progress bars).
await patch(
  "app.js",
  'el("span", "E" + item.IndexNumber, art).className = "episode-badge";',
  'el("span", "E" + item.IndexNumber, art).className = "episode-badge";\n' +
    '        if (item.UserData && item.UserData.Played) el("span", "\\u2713", art).className = "fork-watched";',
  "Watched check mark",
);

// An episode chosen on Home (Continue watching, Next up …) opens the season view with the
// episode focused, instead of the episode's own detail page. Inside the season view nothing changes.
await patch(
  "app.js",
  "return detail(item.Id, !!item.IsLiveProgram);",
  "return item.Type === \"Episode\" && item.SeasonId && item.SeriesId && !item.IsLiveProgram &&\n" +
    "              !main.classList.contains(\"season-browser\")\n" +
    "              ? forkEpisodeSeason(item)\n" +
    "              : detail(item.Id, !!item.IsLiveProgram);",
  "Episode opens season view",
);
await patch(
  "app.js",
  "  async function seasonsPage(seriesId) {",
  "  async function forkEpisodeSeason(item) {\n" +
    "    var seasons;\n" +
    "    try {\n" +
    "      seasons = await seasonChoices(item.SeriesId);\n" +
    "    } catch (_) {\n" +
    "      return detail(item.Id);\n" +
    "    }\n" +
    "    var season = seasons.find(function (s) { return s.Id === item.SeasonId; });\n" +
    "    if (!season) return detail(item.Id);\n" +
    "    // seasonBrowser focuses the card whose id the current navigation frame remembers.\n" +
    "    var frame = stack[stack.length - 1];\n" +
    "    if (frame && !frame.focus) frame.focus = item.Id;\n" +
    "    return seasonBrowser(season.Id, (item.SeriesName || \"\") + \" · \" + season.Name, {\n" +
    "      seriesId: item.SeriesId,\n" +
    "      title: item.SeriesName,\n" +
    "      seasons: seasons,\n" +
    "    });\n" +
    "  }\n" +
    "  async function seasonsPage(seriesId) {",
  "Episode opens season view (helper)",
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
