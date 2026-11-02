// Fork addition: translates the commit titles of the original for the release notes into German.
// Reads Markdown list lines ("- Title ([abc1234](url))") on stdin and writes them translated to
// stdout. Without ANTHROPIC_API_KEY, or if the API fails, the lines are passed through unchanged.
import fs from "node:fs";

const MODEL = "claude-opus-5-5",
  lines = fs.readFileSync(0, "utf8").split("\n").filter(Boolean);

const SYSTEM = `You translate commit titles of a Jellyfin TV app for LG webOS (also Samsung Tizen and Fire TV)
into German for Switzerland, for release notes read by end users.
Rules: Swiss spelling (never "ß", always "ss"); keep it short, one line each; start with a verb in the
3rd person or a noun phrase ("Ergänzt …", "Behebt …", "Untertitel-Standards pro Profil"); replace the app
name "Ember" with "Wholphin"; keep product names (Jellyfin, Fire TV, Tizen, webOS, HDR10, Dolby Vision,
HEVC, AV1, ASS, PGS, Quick Connect) unchanged; library = Mediathek, episode = Folge, season = Staffel,
subtitles = Untertitel, audio = Ton, profile = Profil.`;

const SCHEMA = {
  type: "object",
  properties: { titles: { type: "array", items: { type: "string" } } },
  required: ["titles"],
  additionalProperties: false,
};

async function translate(titles) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: "Translate these titles, same order and count:\n\n" + JSON.stringify(titles, null, 1),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const body = await res.json(),
    out = JSON.parse(body.content.find((b) => b.type === "text").text).titles;
  if (!Array.isArray(out) || out.length !== titles.length) throw new Error("unexpected answer");
  return out;
}

const parsed = lines.map((l) => l.match(/^- (.*?)( \(\[[0-9a-f]+\]\(.*\)\))?$/) || [l, l, ""]);
let titles = parsed.map((m) => m[1]);
if (process.env.ANTHROPIC_API_KEY && titles.length) {
  try {
    titles = await translate(titles);
  } catch (error) {
    console.error("Release notes stay in English: " + error.message);
  }
}
process.stdout.write(parsed.map((m, i) => "- " + titles[i] + (m[2] || "")).join("\n") + (lines.length ? "\n" : ""));
