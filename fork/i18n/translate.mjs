// Fork addition: translates texts without a German entry with the Claude API and adds them
// to fork/i18n/de.json. Needs ANTHROPIC_API_KEY; run extract.mjs first.
//   node fork/i18n/translate.mjs            translate and save
//   node fork/i18n/translate.mjs --dry-run  only list what would be sent
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)),
  MODEL = "claude-opus-5-5",
  BATCH = 150;

const SYSTEM = `You translate the user interface of Wholphin, a Jellyfin media player app for LG webOS TVs
operated with a TV remote, from English into German for Switzerland.

Rules:
- Swiss spelling: never use "ß", always "ss" (e.g. "schliessen", "gross"). Use ä, ö, ü normally.
- Address the user informally with "du" (lowercase).
- Keep placeholders such as {0}, {1} exactly; you may reorder them. A placeholder that only
  adds an English plural "s" may be dropped by rephrasing.
- Keep product names unchanged (Wholphin, Jellyfin, Bonfire, Quick Connect, Dolby Vision, HDR10, LG C1).
  Replace the name "Ember" with "Wholphin".
- Use these terms consistently: library = Mediathek, episode = Folge, season = Staffel, series/show = Serie,
  movie = Film, queue = Warteschlange, subtitles = Untertitel, audio (track) = Ton / Tonspur,
  burn-in = einbrennen, transcoding = Transcoding, Compatibility (mode) = Kompatibilität,
  native = nativ, Home = Start / Startseite, Continue watching = Weiterschauen, Next up = Als Nächstes,
  favorites = Favoriten, channel = Sender, guide = Programmführer, programme = Sendung, retry = erneut laden.
- Ellipsis "…" is written with a space before it ("Wird geladen …").
- Short labels stay short; keep capitalisation style.
- Quote UI names with «» when the English text refers to a button or page by name.
- If a string is code, a CSS class, a URL or otherwise not human text, return it unchanged.`;

const SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: { source: { type: "string" }, target: { type: "string" } },
        required: ["source", "target"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

// A translation must keep every placeholder and must not contain "ß".
function problem(src, dst) {
  const ph = (s) => (s.match(/\{\d+\}/g) || []).sort().join();
  if (/ß/.test(dst)) return "ß";
  if (ph(src) !== ph(dst)) return "placeholders";
  return null;
}

async function translateBatch(items) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: "Translate these strings. Return every source string exactly as given.\n\n" + JSON.stringify(items, null, 1),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.stop_reason === "refusal" || body.stop_reason === "max_tokens")
    throw new Error("translation stopped: " + body.stop_reason);
  const text = body.content.find((b) => b.type === "text").text,
    wanted = new Set(items),
    out = {};
  for (const row of JSON.parse(text).translations || []) {
    if (!wanted.has(row.source) || !row.target) continue;
    const p = problem(row.source, row.target);
    if (p) console.error(`skipped (${p}): ${row.source}`);
    else out[row.source] = row.target;
  }
  return out;
}

const deFile = path.join(here, "de.json"),
  de = JSON.parse(fs.readFileSync(deFile, "utf8")),
  strings = JSON.parse(fs.readFileSync(path.join(here, "strings.json"), "utf8")),
  rules = de.rules.map(([re]) => new RegExp("^" + re + "$")),
  missing = Object.keys(strings).filter((k) => !(k in de.strings) && !rules.some((re) => re.test(k)));

console.log(missing.length + " texts to translate");
if (process.argv.includes("--dry-run")) {
  missing.forEach((k) => console.log("  " + k));
  process.exit(0);
}
if (!missing.length) process.exit(0);
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");

let added = 0;
for (let i = 0; i < missing.length; i += BATCH) {
  const result = await translateBatch(missing.slice(i, i + BATCH));
  Object.assign(de.strings, result);
  added += Object.keys(result).length;
}
de.strings = Object.fromEntries(Object.entries(de.strings).sort(([a], [b]) => (a < b ? -1 : 1)));
fs.writeFileSync(deFile, JSON.stringify(de, null, 1) + "\n");
console.log(added + " translations added");
