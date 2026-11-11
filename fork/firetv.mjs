// Fork addition: builds the Fire TV app as "Wholphin" from the patched webOS build.
// The original builds its Fire TV app from the same interface; this script does the same with
// the fork's interface (German UI, Plex trailers, …) and leaves the original's files untouched:
// the Android project is copied to dist/firetv-project and branded there.
//   node fork/build.mjs && node fork/firetv.mjs            web part in dist/firetv
//   node fork/firetv.mjs --package                          also the APK (needs JDK 17 + Android SDK)
// Signing: WHOLPHIN_KEYSTORE (PKCS12 file) and WHOLPHIN_KEYSTORE_PASSWORD give a release APK that
// installs over the previous one; without them a debug APK is built.
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformAsync } from "@babel/core";

const require = createRequire(import.meta.url),
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  fork = path.join(root, "fork"),
  web = path.join(root, "dist/webos"),
  out = path.join(root, "dist/firetv"),
  project = path.join(root, "dist/firetv-project"),
  APP_ID = "ch.brunoz78.wholphin",
  REPO = "brunoz78/Wholphin-webOS";

// Release name and version code: the code counts minutes since 2026 from the release stamp, so
// every release installs over the one before.
const version = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")).version,
  now = new Date().toISOString().replace(/\D/g, "").slice(0, 12),
  release = (process.env.FORK_RELEASE || `v${version}.post${now}`).replace(/^v/, ""),
  stamp = (release.match(/\.post(\d{12})$/) || [])[1];
if (!stamp) throw new Error(`Release name ${release} has no .postYYYYMMDDHHMM stamp`);
const versionCode = Math.round(
  (Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8), +stamp.slice(8, 10), +stamp.slice(10, 12)) -
    Date.UTC(2026, 0, 1)) / 60000,
);

// ---- web part: the fork's webOS build, adapted as tools/build.mjs does for Fire TV ----------
try {
  await fs.access(path.join(web, "app.js"));
} catch (_) {
  throw new Error("dist/webos is missing: run node fork/build.mjs first");
}
await fs.rm(out, { recursive: true, force: true });
await fs.cp(web, out, { recursive: true });
// LG only: app entry, codec profile of the TV's browser player, PGS drawn in the browser
// (the Fire TV player decodes and shows subtitles itself).
for (const f of ["appinfo.json", "wholphin-icon.png", "wholphin-large-icon.png", "codecs.js", "pgs.js"])
  await fs.rm(path.join(out, f), { force: true });
const platformFiles = ["platform.js", "playback.js", "firetv.css"];
for (const f of platformFiles) await fs.copyFile(path.join(root, "platforms/firetv", f), path.join(out, f));

// A video the Fire TV cannot decode (e.g. AV1 on the Fire TV Stick 4K) made the original fall back
// to its compatibility profile: H.264 and stereo AAC. The fork keeps the device profile instead:
// the server converts only the video (HEVC with HDR when the server allows HEVC encoding, else
// H.264), and audio the Fire TV can play (E-AC-3 5.1, …) stays as it is.
{
  const p = path.join(out, "playback.js");
  let code = (await fs.readFile(p, "utf8")).replace(/\r\n/g, "\n");
  const steps = [
    [
      '    if (!support || !(caps.audio || []).length) return { native: false, reason: "No matching device decoder capability" };',
      '    if (!(caps.audio || []).length) return { native: false, reason: "No matching device decoder capability" };\n' +
        "    if (!support) {\n" +
        '      if (!(caps.videos || []).some(function (v) { return v.codec === "hevc" || v.codec === "h264"; }))\n' +
        '        return { native: false, reason: "No matching device decoder capability" };\n' +
        "      if (!nativeSubtitle(source, index == null ? -1 : index))\n" +
        '        return { native: false, reason: "Selected subtitles require server conversion" };\n' +
        '      return { native: true, reason: "Server converts the video for the Fire TV decoder, audio stays" };\n' +
        "    }",
    ],
    [
      'VideoCodec: remux.join(","),',
      'VideoCodec: remux.slice().sort(function (a, b) { return (b === "hevc") - (a === "hevc"); }).join(","),',
    ],
    [
      'AudioCodec: audio.filter(function (a) { return ["aac", "ac3", "eac3"].indexOf(a) >= 0; }).join(",") || "aac",',
      'AudioCodec: ["eac3", "ac3", "aac"].filter(function (a) { return audio.indexOf(a) >= 0; }).join(",") || "aac",',
    ],
  ];
  for (const [from, to] of steps) {
    if (!code.includes(from)) throw new Error(`playback.js changed: ${from} not found`);
    code = code.replace(from, to);
  }
  await fs.writeFile(p, code);
}

let html = await fs.readFile(path.join(out, "index.html"), "utf8");
for (const tag of ['<script src="pgs.js"></script>', '<script src="codecs.js"></script>']) {
  if (!html.includes(tag)) throw new Error(`index.html: ${tag} not found`);
  html = html.replace(tag + "\n    ", "").replace(tag, "");
}
const steps = [
  ['<link rel="stylesheet" href="style.css" />', '<link rel="stylesheet" href="style.css" /><link rel="stylesheet" href="firetv.css" />'],
  ['<script src="platform.js"></script>', '<script src="compat.js"></script>\n<script src="playback.js"></script>\n<script src="platform.js"></script>'],
  ["width=device-width,initial-scale=1", "width=1920"],
];
for (const [from, to] of steps) {
  if (!html.includes(from)) throw new Error(`index.html changed: ${from} not found`);
  html = html.replace(from, to);
}
await fs.writeFile(path.join(out, "index.html"), html);

const compat = await Promise.all(
  ["core-js-bundle/minified.js", "abortcontroller-polyfill/dist/polyfill-patch-fetch.js"].map((x) =>
    fs.readFile(require.resolve(x), "utf8"),
  ),
);
await fs.writeFile(path.join(out, "compat.js"), compat.join("\n;\n"));
for (const file of ["app.js", "core.js", "platform.js", "playback.js"]) {
  const code = await fs.readFile(path.join(out, file), "utf8");
  const compiled = await transformAsync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    sourceMaps: false,
    comments: false,
    presets: [[require.resolve("@babel/preset-env"), { targets: { chrome: "56" }, modules: false }]],
  });
  await fs.writeFile(path.join(out, file), compiled.code + "\n");
}
const licenses = await Promise.all(
  ["core-js-bundle/LICENSE", "abortcontroller-polyfill/LICENSE"].map((x) => fs.readFile(require.resolve(x), "utf8")),
);
await fs.writeFile(path.join(out, "THIRD-PARTY-LICENSES.txt"), licenses.join("\n\n"));

// ---- Android project: copy of the original's, with Wholphin's name, ID, art and updates ------
await fs.rm(project, { recursive: true, force: true });
await fs.cp(path.join(root, "platforms/firetv"), project, {
  recursive: true,
  filter: (src) => !/[\\/](build|\.gradle)([\\/]|$)/.test(path.relative(root, src)),
});
async function edit(file, pairs) {
  const p = path.join(project, file);
  // Line ends depend on the checkout (Windows: CRLF); the anchors are written with \n.
  let code = (await fs.readFile(p, "utf8")).replace(/\r\n/g, "\n");
  for (const [from, to, all] of pairs) {
    if (!code.includes(from)) throw new Error(`${file} changed: ${from} not found`);
    code = all ? code.split(from).join(to) : code.replace(from, to);
  }
  await fs.writeFile(p, code);
}
await edit("app/build.gradle", [
  ["applicationId 'tv.ember.jellyfin'", `applicationId '${APP_ID}'`],
  ["versionCode parts[0] * 1000000 + parts[1] * 10000 + parts[2]", `versionCode ${versionCode}`],
  ["versionName emberVersion", `versionName '${release}'`],
  [
    "    buildTypes.debug { applicationIdSuffix '.debug' }",
    "    buildTypes.debug { applicationIdSuffix '.debug' }\n" +
      "    if (System.getenv('WHOLPHIN_KEYSTORE')) {\n" +
      "        signingConfigs {\n" +
      "            release {\n" +
      "                storeFile file(System.getenv('WHOLPHIN_KEYSTORE'))\n" +
      "                storeType 'pkcs12'\n" +
      "                storePassword System.getenv('WHOLPHIN_KEYSTORE_PASSWORD')\n" +
      "                keyAlias 'wholphin'\n" +
      "                keyPassword System.getenv('WHOLPHIN_KEYSTORE_PASSWORD')\n" +
      "            }\n" +
      "        }\n" +
      "        buildTypes.release.signingConfig signingConfigs.release\n" +
      "    }",
  ],
]);
// The launcher keeps a tile's picture per launcher entry: a new picture needs a new entry name.
// Fire OS 6 shows a sideloaded app's banner squeezed into a square on a grey tile: the banner is
// therefore square too (dolphin with the name below). The picture is made once at installation;
// a changed picture shows only after uninstalling and installing again.
await edit("app/src/main/AndroidManifest.xml", [
  ['android:label="Ember"', 'android:label="Wholphin"', true],
  ['android:icon="@drawable/ember_launcher_tile"', 'android:icon="@drawable/ember_app_icon"', true],
  ['android:name=".EmberLauncher"', 'android:name=".WholphinLauncher3"'],
]);
const art = path.join(project, "app/src/main/res/drawable-nodpi");
await fs.copyFile(path.join(fork, "assets/firetv/wholphin_banner.png"), path.join(art, "ember_launcher_tile.png"));
await fs.copyFile(path.join(fork, "assets/firetv/wholphin_icon.png"), path.join(art, "ember_app_icon.png"));
// The app looks for updates in this fork's releases, named wholphin-firetv-<release>.apk.
const java = "app/src/main/java/tv/ember/jellyfin/";
await edit(java + "AppUpdater.java", [["repos/JoeKer1/Wholphin-webOS/releases", `repos/${REPO}/releases`]]);
await edit(java + "UpdateRelease.java", [
  ['"https://github.com/JoeKer1/Wholphin-webOS"', `"https://github.com/${REPO}"`],
  [
    '        if (!version.matches("[0-9]{1,2}\\\\.[0-9]{1,2}\\\\.[0-9]{1,4}")) return -1;\n' +
      '        String[] p = version.split("\\\\.");\n' +
      "        return Integer.parseInt(p[0]) * 1000000 + Integer.parseInt(p[1]) * 10000 + Integer.parseInt(p[2]);",
    '        java.util.regex.Matcher m = java.util.regex.Pattern.compile("[0-9]{1,2}\\\\.[0-9]{1,2}\\\\.[0-9]{1,4}\\\\.post([0-9]{12})").matcher(version);\n' +
      "        if (!m.matches()) return -1;\n" +
      "        String s = m.group(1);\n" +
      '        java.util.Calendar c = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));\n' +
      "        c.clear();\n" +
      "        c.set(Integer.parseInt(s.substring(0, 4)), Integer.parseInt(s.substring(4, 6)) - 1, Integer.parseInt(s.substring(6, 8)),\n" +
      "            Integer.parseInt(s.substring(8, 10)), Integer.parseInt(s.substring(10, 12)));\n" +
      `        return (int) ((c.getTimeInMillis() - ${Date.UTC(2026, 0, 1)}L) / 60000L);`,
  ],
  ['String name = "ember-firetv-" + version + "-debug.apk";', 'String name = "wholphin-firetv-" + version + ".apk";'],
]);
console.log(`Wholphin Fire TV ${release} (${APP_ID}, code ${versionCode}) in ${path.relative(root, out)}`);

if (process.argv.includes("--package")) {
  const signed = !!process.env.WHOLPHIN_KEYSTORE,
    task = signed ? "assembleRelease" : "assembleDebug",
    gradlew = path.join(project, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  if (process.platform !== "win32") await fs.chmod(gradlew, 0o755);
  const r = spawnSync(process.env.GRADLE || gradlew, ["-p", project, task, "--no-daemon"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
  const kind = signed ? "release/app-release.apk" : "debug/app-debug.apk",
    apk = path.join(root, "dist", `wholphin-firetv-${release}${signed ? "" : "-debug"}.apk`);
  await fs.copyFile(path.join(project, "app/build/outputs/apk", kind), apk);
  console.log(`APK: ${path.relative(root, apk)}`);
}
