// Serving the site under a path (BASE=/px, see scripts/build.mjs): the Saints
// Worker mounts it at /px/ next to its own routes. Relative paths ("index.js",
// "./sw.js") follow by themselves; absolute ones ("/scram/…", "/scramjet/",
// "/sessions") are listed here, file by file, and moved under the base in the
// built copy. The source keeps "/" paths, so the normal build is unchanged.
//
// Only exact quoted strings are replaced, and each one listed must be found:
// if a file changes and a path moves, the build stops instead of shipping a
// page that quietly asks for the wrong address. engine2.js is not listed: it
// already takes its base from saintsEngine2Base, set in s2/index.html.
import { readdir, readFile, writeFile } from "node:fs/promises";

export function normalizeBase(value) {
  const base = String(value || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  if (!/^\/[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i.test(base)) throw new Error("BASE must look like /px (got " + JSON.stringify(value) + ")");
  return base;
}

// file (relative to the site) → absolute path prefixes used in it.
export const BASE_PATHS = {
  "index.html": ["/scram/", "/baremux/"],
  "404.html": ["/"],                     // <base href="/" />
  "index.js": ["/scram/", "/scramjet/", "/baremux/", "/libcurl/", "/epoxy/", "/games/", "/icon?", "/s2/#", "/version.json"],
  "sw.js": ["/scram/", "/scramjet/", "/baremux/", "/libcurl/", "/epoxy/", "/config.js", "/blocked.js", "/sitefixes.js"],
  "sessions.js": ["/sessions"],
  "s2/index.html": ["/s2", "/config.js", "/blocked.js", "/sitefixes.js"],
  "s2/host.js": ["/s2/"],
  "s2/sw.js": ["/s2/"],
  "games/games.json": ["/games/"],
  "games/fit.js": ["/games/"],
};
// Game pages that load the shared fit script ("/games/fit.js"); optional per file.
const GAME_PAGE = /^games\/public\/.+\.html$/;

const QUOTES = ['"', "'", "`"];

// Puts base in front of every quoted string that starts with one of the
// prefixes. Each prefix must occur at least once. All prefixes are matched in
// one pass, so a path is never moved twice.
export function rewriteText(text, prefixes, base, file = "") {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alternatives = [...prefixes].sort((a, b) => b.length - a.length).map(escape).join("|");
  const seen = new Set();
  let changed = 0;
  const pattern = new RegExp("([" + QUOTES.join("") + "])(" + alternatives + ")", "g");
  text = text.replace(pattern, (whole, quote, prefix) => {
    seen.add(prefix);
    changed += 1;
    return quote + base + prefix;
  });
  for (const prefix of prefixes) {
    if (!seen.has(prefix)) throw new Error((file || "text") + ' has no "' + prefix + '" any more; update BASE_PATHS in scripts/base-path.mjs.');
  }
  return { text, changed };
}

async function walk(dir, rel = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = rel + entry.name;
    if (entry.isDirectory()) out.push(...(await walk(new URL(entry.name + "/", dir), path + "/")));
    else out.push(path);
  }
  return out;
}

// site: the built site's folder (a file: URL ending in "/"). Returns how many
// paths were moved.
export async function rewriteForBase(site, base) {
  base = normalizeBase(base);
  if (!base) return 0;
  let total = 0;
  for (const [file, prefixes] of Object.entries(BASE_PATHS)) {
    const url = new URL(file, site);
    const r = rewriteText(await readFile(url, "utf8"), prefixes, base, file);
    await writeFile(url, r.text);
    total += r.changed;
  }
  for (const file of (await walk(new URL("games/public/", site), "games/public/")).filter((f) => GAME_PAGE.test(f))) {
    const url = new URL(file, site);
    const text = await readFile(url, "utf8");
    if (!text.includes('"/games/fit.js"')) continue;
    const r = rewriteText(text, ["/games/fit.js"], base, file);
    await writeFile(url, r.text);
    total += r.changed;
  }
  return total;
}
