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
await fs.writeFile(
  path.join(out, "i18n-data.js"),
  "window.WHOLPHIN_I18N = " + JSON.stringify({ de: { strings: de.strings, rules: de.rules }, en }) + ";\n",
);
await fs.copyFile(path.join(fork, "i18n/i18n.js"), path.join(out, "i18n.js"));
await fs.copyFile(path.join(fork, "subtitles/pgs.js"), path.join(out, "pgs.js"));
await fs.copyFile(path.join(fork, "playback/codecs.js"), path.join(out, "codecs.js"));

// Page: load the translation before the app, show the Wholphin name.
let html = await fs.readFile(path.join(out, "index.html"), "utf8");
const hook = '<script src="core.js"></script>',
  appHook = '<script src="app.js"></script>';
if (!html.includes(hook) || !html.includes(appHook)) throw new Error("index.html changed: script hooks of the fork not found");
html = html
  .replace(hook, '<script src="i18n-data.js"></script>\n    <script src="i18n.js"></script>\n    ' + hook)
  // PGS subtitles and AV1 hook into WholphinCore, so they load after core.js and before app.js.
  .replace(appHook, '<script src="pgs.js"></script>\n    <script src="codecs.js"></script>\n    ' + appHook)
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
// ASS/SSA as text on the TV: Jellyfin converts them to WebVTT (Stream.vtt), so they no longer
// need burn-in and transcoding. Styling of ASS (fonts, positions, effects) is not kept.
await patch(
  "core.js",
  '["srt", "subrip", "vtt", "webvtt"].indexOf(',
  '["srt", "subrip", "vtt", "webvtt", "ass", "ssa", "mov_text"].indexOf(',
  "ASS/SSA as text",
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
