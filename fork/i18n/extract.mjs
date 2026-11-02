// Fork addition: collects the English UI texts of the app for the runtime translation.
//   node fork/i18n/extract.mjs            writes fork/i18n/strings.json
//   node fork/i18n/extract.mjs --missing  lists texts without a German translation (exit code 0)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const here = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(here, "../.."),
  sources = ["webos/app/app.js", "webos/app/core.js"],
  ignore = new Set(JSON.parse(fs.readFileSync(path.join(here, "ignore.json"), "utf8")));

// Text that a person reads: at least one letter, and either a space or a capital start.
function looksLikeUi(text) {
  const s = text.replace(/\{\d+\}/g, "X");
  if (!/[A-Za-z]/.test(s) || s.length > 400) return false;
  if (/^[a-z][\w-]*$/.test(s)) return false; // keys, ids, class names
  if (/^[\w.-]+\/[\w.+-]+/.test(s) || /^https?:|^\/|\.(js|css|png|webp|json)$/.test(s)) return false;
  if (/^[#.\[]|[{};=<>]|=>|\$\{/.test(s)) return false; // selectors, code, markup
  if (/^[A-Z][A-Za-z]+$/.test(s) && /[a-z][A-Z]/.test(s)) return false; // CamelCase API fields
  if (/^[A-Z0-9_]+$/.test(s) && s.length > 4) return false; // CONSTANTS
  if (/^(Items|Users|Videos|Audio|Sessions|LiveTv|Shows|System|Branding|QuickConnect)\//.test(s)) return false;
  return /\s/.test(s.trim()) || /^[A-Z]/.test(s);
}

const found = new Map(); // text -> first location

function add(text, where) {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || ignore.has(t) || !looksLikeUi(t)) return;
  if (/^\{\d+\}$/.test(t) || !/[A-Za-z]{2}/.test(t.replace(/\{\d+\}/g, ""))) return;
  if (!found.has(t)) found.set(t, where);
}

// "Search " + kind + "s" becomes the pattern "Search {0}s".
function concatParts(node, out) {
  if (node.type === "BinaryExpression" && node.operator === "+") {
    concatParts(node.left, out);
    concatParts(node.right, out);
  } else if (node.type === "StringLiteral") out.push({ text: node.value });
  else if (node.type === "TemplateLiteral" && !node.expressions.length) out.push({ text: node.quasis[0].value.cooked });
  else out.push({ hole: true });
}

function walk(node, file, parentIsConcat) {
  if (!node || typeof node.type !== "string") return;
  if (node.type === "BinaryExpression" && node.operator === "+" && !parentIsConcat) {
    const parts = [];
    concatParts(node, parts);
    if (parts.some((p) => !p.hole && /[A-Za-z]/.test(p.text))) {
      let n = 0,
        pattern = "";
      for (const p of parts) pattern += p.hole ? "{" + n++ + "}" : p.text;
      pattern = pattern.replace(/(\{\d+\})(\{\d+\})+/g, "$1");
      add(pattern, file + ":" + node.loc.start.line);
      // Each literal piece can also show up on its own (e.g. "On" in "Autoplay: " + "On").
      for (const p of parts) if (!p.hole) add(p.text, file + ":" + node.loc.start.line);
    }
  }
  if (node.type === "StringLiteral") add(node.value, file + ":" + node.loc.start.line);
  if (node.type === "TemplateLiteral") {
    let pattern = "";
    node.quasis.forEach((q, i) => {
      pattern += q.value.cooked;
      if (i < node.expressions.length) pattern += "{" + i + "}";
    });
    add(pattern, file + ":" + node.loc.start.line);
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
    const v = node[key];
    const concat = node.type === "BinaryExpression" && node.operator === "+";
    if (Array.isArray(v)) v.forEach((c) => walk(c, file, false));
    else if (v && typeof v.type === "string") walk(v, file, concat);
  }
}

for (const file of sources) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  walk(parse(code, { sourceType: "script" }).program, file, false);
}

// Static texts in the page itself.
const html = fs.readFileSync(path.join(root, "webos/app/index.html"), "utf8");
for (const m of html.matchAll(/>([^<>]*[A-Za-z][^<>]*)</g)) add(m[1].replace(/&amp;/g, "&"), "index.html");
for (const m of html.matchAll(/(?:aria-label|title|alt)="([^"]+)"/g)) add(m[1], "index.html");

const strings = Object.fromEntries([...found.keys()].sort().map((k) => [k, found.get(k)]));
if (process.argv.includes("--missing")) {
  const de = JSON.parse(fs.readFileSync(path.join(here, "de.json"), "utf8"));
  const rules = de.rules.map(([re]) => new RegExp("^" + re + "$"));
  const missing = Object.keys(strings).filter(
    (k) => !(k in de.strings) && !rules.some((re) => re.test(k)),
  );
  for (const k of missing) console.log(JSON.stringify(k) + "  " + strings[k]);
  console.error(missing.length + " missing");
} else {
  fs.writeFileSync(path.join(here, "strings.json"), JSON.stringify(strings, null, 1) + "\n");
  console.log(Object.keys(strings).length + " texts");
}
