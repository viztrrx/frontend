// Site check: opens each site in site-check/sites.json through the live proxy
// in headless Chromium and records whether it showed content and how long it
// took. Used by .github/workflows/site-check.yml; can also be run by hand:
//
//   node site-check/run.mjs --url https://frontend.viztrrx.workers.dev --out site-report
//
// Options:
//   --url <frontend>      proxy to test (required)
//   --sites <file>        site list (default: site-check/sites.json)
//   --only <a,b>          only sites whose name contains one of these words
//   --out <dir>           where results.json, summary.md and screenshots go
//   --previous <file>     an earlier results.json, to show what changed
//   --timeout <seconds>   per site (default 45)
//   --label <text>        name of this proxy in the report (default: its host)
//   --transport <name>    use this transport (libcurl or epoxy) instead of the page's default
//   --insecure            accept self-signed certificates (local testing)
//
// Playwright isn't a dependency of the Worker; set PLAYWRIGHT_PATH to its
// index.mjs when it isn't installed where Node can find it.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    url: { type: "string" },
    sites: { type: "string", default: new URL("sites.json", import.meta.url).pathname },
    only: { type: "string", default: "" },
    out: { type: "string", default: "site-report" },
    previous: { type: "string", default: "" },
    timeout: { type: "string", default: "45" },
    label: { type: "string", default: "" },
    transport: { type: "string", default: "" },
    insecure: { type: "boolean", default: false },
  },
});
if (!args.url) throw new Error("--url is required");
const FRONTEND = new URL(args.url).origin + "/";
const LABEL = args.label || new URL(FRONTEND).host + (args.transport ? " (" + args.transport + ")" : "");
const TIMEOUT_MS = Number(args.timeout) * 1000;
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || "playwright");

let sites = JSON.parse(await readFile(args.sites, "utf8"));
if (args.only) {
  const words = args.only.toLowerCase().split(",").map((w) => w.trim()).filter(Boolean);
  sites = sites.filter((s) => words.some((w) => s.name.toLowerCase().includes(w)));
}
await mkdir(args.out + "/screenshots", { recursive: true });

// Which build of the proxy is being tested (written by scripts/build.mjs).
let version = {};
try {
  const r = await fetch(new URL("version.json", FRONTEND), { signal: AbortSignal.timeout(15000) });
  if (r.ok) version = await r.json();
} catch {}

// Runs in the proxy page: what the site's frame is showing right now.
function inspect() {
  const text = (el) => (el && el.textContent ? el.textContent.trim() : "");
  const error = text(document.getElementById("sj-error"));
  const block = document.getElementById("sj-block");
  if (block && !block.hidden) return { state: "blocked", detail: text(document.getElementById("sj-block-title")) };
  if (error) return { state: "error", detail: (error + " " + text(document.getElementById("sj-error-code"))).trim() };
  const frame = document.querySelector("iframe.sj-frame");
  const address = document.getElementById("sj-address");
  const out = { state: "waiting", address: address ? address.value : "", status: text(document.getElementById("sj-toolbar-status")), failure: text(document.getElementById("sj-loading-status")), textLength: 0, images: 0, canvases: 0, videos: 0, playingVideo: false, title: "", sample: "" };
  if (!frame) return out;
  let doc;
  try { doc = frame.contentDocument; } catch { return { ...out, state: "opaque" }; }
  if (!doc || !doc.body) return out;
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.width >= 40 && r.height >= 40; };
  const body = doc.body.innerText || "";
  // Scramjet's own error page ("Uh oh! There was an error loading ...").
  if (/there was an error loading/i.test(body) && /reload/i.test(body)) {
    const trace = doc.querySelector("textarea, pre");
    const flat = ((trace && (trace.value || trace.textContent)) || body).replace(/\s+/g, " ");
    const message = (/Message:\s*(.*?)\s*(Url:|Stack:|$)/.exec(flat) || [])[1] || "";
    return { ...out, state: "error", detail: "Scramjet error page: " + (message || flat).trim().slice(0, 240) };
  }
  out.textLength = body.replace(/\s+/g, " ").trim().length;
  out.sample = body.replace(/\s+/g, " ").trim().slice(0, 4000).toLowerCase();
  out.title = doc.title || "";
  out.images = [...doc.images].filter((img) => img.complete && img.naturalWidth > 0 && seen(img)).length;
  out.canvases = [...doc.querySelectorAll("canvas")].filter(seen).length;
  const videos = [...doc.querySelectorAll("video")];
  out.videos = videos.length;
  out.playingVideo = videos.some((v) => v.readyState >= 2);
  return out;
}

const hasContent = (s) => s.textLength >= 200 || s.images >= 3 || s.canvases >= 1 || s.videos >= 1;

async function checkSite(context, site) {
  const page = await context.newPage();
  const consoleErrors = [];
  let failedRequests = 0;
  page.on("console", (m) => { if (m.type() === "error" && consoleErrors.length < 50) consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => { if (consoleErrors.length < 50) consoleErrors.push("pageerror: " + String(e.message).slice(0, 300)); });
  page.on("requestfailed", () => { failedRequests++; });

  const result = { name: site.name, url: site.url, status: "fail", note: "", ms: null, title: "", address: "", consoleErrors: 0, failedRequests: 0, firstErrors: [] };
  const started = Date.now();
  try {
    await page.goto(FRONTEND, { waitUntil: "load", timeout: 60000 });
    // Let the page's warm-up (service worker, transport) begin, as it does for people.
    await page.waitForTimeout(1500);
    await page.fill("#sj-home-q", site.url);
    const opened = Date.now();
    await page.press("#sj-home-q", "Enter");

    let state = { state: "waiting" };
    let contentAt = null;
    while (Date.now() - opened < TIMEOUT_MS) {
      await page.waitForTimeout(500);
      state = await page.evaluate(inspect).catch(() => ({ state: "waiting" }));
      if (state.state === "blocked" || state.state === "error") break;
      if (/^Proxy error/i.test(state.status || "")) { state = { ...state, state: "error", detail: state.status }; break; }
      // index.js gave up on the page (after retrying with the other transport).
      if (state.status === "Website request failed") { state = { ...state, state: "error", detail: state.failure || state.status }; break; }
      if (contentAt === null && hasContent(state)) contentAt = Date.now();
      // Once content shows, give it a few seconds to finish (or start a video).
      if (contentAt !== null && (Date.now() - contentAt > 4000 || (!site.media || state.playingVideo) && Date.now() - contentAt > 1500)) break;
    }

    result.title = state.title || "";
    result.address = state.address || "";
    if (state.state === "blocked") {
      result.status = "blocked";
      result.note = state.detail || "blocked by the proxy";
    } else if (state.state === "error") {
      result.note = state.detail.slice(0, 300);
    } else if (contentAt === null) {
      const http = /HTTP \d{3}/.test(state.status || "") ? state.status.replace(/\.$/, "") + "; " : "";
      result.note = state.state === "opaque" ? "frame not readable" : http + "no content after " + args.timeout + "s (text " + (state.textLength || 0) + " chars, " + (state.images || 0) + " images)";
    } else {
      result.ms = contentAt - opened;
      const expect = (site.expect || "").toLowerCase();
      const found = !expect || state.sample.includes(expect) || result.title.toLowerCase().includes(expect);
      const httpStatus = /HTTP (\d{3})/.exec(state.status || "");
      if (httpStatus && Number(httpStatus[1]) >= 400) {
        result.status = "partial";
        result.note = state.status.slice(0, 200);
      } else if (site.media && !state.playingVideo) {
        result.status = "partial";
        result.note = "page loaded but the video didn't start";
      } else if (!found) {
        result.status = "partial";
        result.note = "loaded, but \"" + site.expect + "\" wasn't on the page (consent page or captcha?)";
      } else {
        result.status = "pass";
      }
    }
    await page.screenshot({ path: `${args.out}/screenshots/${slug(site.name)}.jpg`, type: "jpeg", quality: 50 }).catch(() => {});
  } catch (cause) {
    result.note = "tester error: " + String(cause && cause.message || cause).split("\n")[0].slice(0, 200);
  }
  result.consoleErrors = consoleErrors.length;
  result.failedRequests = failedRequests;
  result.firstErrors = consoleErrors.slice(0, 3);
  result.totalMs = Date.now() - started;
  await page.close().catch(() => {});
  return result;
}

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const browser = await chromium.launch({ args: args.insecure ? ["--ignore-certificate-errors"] : [] });
const context = await browser.newContext({
  ignoreHTTPSErrors: args.insecure,
  viewport: { width: 1280, height: 800 },
});
// The page keeps the chosen transport in localStorage (sj-transport).
if (args.transport) {
  await context.addInitScript((name) => { try { localStorage.setItem("sj-transport", name); } catch {} }, args.transport);
}
const results = [];
for (const site of sites) {
  const r = await checkSite(context, site);
  results.push(r);
  console.log(`${icon(r.status)} ${r.name.padEnd(18)} ${r.ms === null ? "   -  " : (r.ms / 1000).toFixed(1).padStart(5) + "s"}  ${r.note}`);
}
await browser.close();

function icon(status) {
  return { pass: "✅", partial: "⚠️", blocked: "⛔", fail: "❌" }[status] || "❔";
}

const passed = results.filter((r) => r.status === "pass").length;
const times = results.filter((r) => r.ms !== null).map((r) => r.ms).sort((a, b) => a - b);
const median = times.length ? times[Math.floor(times.length / 2)] : null;
const report = {
  target: LABEL,
  frontend: FRONTEND,
  testedAt: new Date().toISOString(),
  version,
  passed,
  partial: results.filter((r) => r.status === "partial").length,
  failed: results.filter((r) => r.status === "fail").length,
  total: results.length,
  medianMs: median,
  results,
};
await writeFile(`${args.out}/results.json`, JSON.stringify(report, null, 2) + "\n");

// What changed since the previous run.
let previous = null;
if (args.previous) {
  try { previous = JSON.parse(await readFile(args.previous, "utf8")); } catch {}
}
const before = new Map((previous?.results || []).map((r) => [r.name, r]));
const changes = [];
for (const r of results) {
  const p = before.get(r.name);
  if (p && p.status !== r.status) changes.push(`${r.name}: ${icon(p.status)} → ${icon(r.status)}`);
}

const secs = (ms) => (ms === null || ms === undefined ? "–" : (ms / 1000).toFixed(1) + " s");
const commit = version.commit ? version.commit.slice(0, 7) : "unknown";
const lines = [
  `## Site check: ${LABEL}`,
  "",
  `**${passed}/${results.length} sites working**, ${report.partial} partly, ${report.failed} failing. Median time to content: **${secs(median)}**.`,
  "",
  `Frontend build \`${commit}\`${version.message ? ` (${version.message})` : ""}${version.engine ? `, Scramjet ${version.engine === 2 ? "2" : "1.1"}` : ""}, tested ${report.testedAt.replace("T", " ").slice(0, 16)} UTC.`,
  "",
];
if (previous) {
  lines.push(changes.length ? "**Changed since last run:** " + changes.join(", ") : `No changes since the last run (${previous.passed}/${previous.total}, median ${secs(previous.medianMs)}).`, "");
}
lines.push("| | Site | Time | Notes |", "|---|---|---|---|");
for (const r of results) {
  const note = r.note || (r.title ? r.title.slice(0, 60) : "");
  lines.push(`| ${icon(r.status)} | [${r.name}](${r.url}) | ${secs(r.ms)} | ${note.replace(/\|/g, "\\|")} |`);
}
lines.push("", "✅ working · ⚠️ loaded but something's off · ❌ failed · ⛔ blocked by the proxy on purpose", "");
await writeFile(`${args.out}/summary.md`, lines.join("\n"));
console.log(`\n${passed}/${results.length} working, median ${secs(median)}. Report in ${args.out}/`);
