// Diagnostic: plays a YouTube video through the proxy in Google Chrome and
// records what happens second by second (renderer memory, the video
// element's state, proxied requests, console output, crashes).
//
//   node diag/youtube.mjs --url https://frontend-beta.viztrrx.workers.dev --transport libcurl --out out/beta-libcurl
import { mkdir, writeFile } from "node:fs/promises";
import { appendFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    url: { type: "string" },
    video: { type: "string", default: "https://www.youtube.com/watch?v=jNQXAC9IVRw" },
    transport: { type: "string", default: "libcurl" },
    out: { type: "string", default: "out" },
    seconds: { type: "string", default: "75" },
    channel: { type: "string", default: "chrome" },
    headed: { type: "boolean", default: false },
    insecure: { type: "boolean", default: false },
    block: { type: "string", default: "" },
    shots: { type: "boolean", default: false },
    direct: { type: "boolean", default: false },
  },
});
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || "playwright");
await mkdir(args.out, { recursive: true });

const started = Date.now();
const t = () => ((Date.now() - started) / 1000).toFixed(1);
const log = [];
// Written as it happens (log.jsonl), so a hang still leaves a record.
const note = (kind, data) => {
  const e = { t: Number(t()), kind, ...data };
  log.push(e);
  try { appendFileSync(`${args.out}/log.jsonl`, JSON.stringify(e) + "\n"); } catch {}
};
// A page that stops answering must not stall the whole run.
const timed = (promise, ms, what) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(what + " timed out after " + ms + " ms")), ms))]);
const watchdog = setTimeout(() => {
  note("WATCHDOG", { memory: rendererMemory() });
  writeFileSync(`${args.out}/summary.json`, JSON.stringify({ target: args.url, transport: args.transport, watchdog: true, lastEvents: log.slice(-15) }, null, 2));
  process.exit(3);
}, (Number(args.seconds) + 90) * 1000);

// Renderer processes' memory (RSS, MB) from ps, as the browser sees it.
function rendererMemory() {
  try {
    const out = execFileSync("ps", ["-eo", "pid,rss,args"], { encoding: "utf8" });
    return out.split("\n").filter((l) => /--type=renderer/.test(l) && !/extension-process/.test(l))
      .map((l) => { const [pid, rss] = l.trim().split(/\s+/); return { pid: Number(pid), mb: Math.round(Number(rss) / 1024) }; });
  } catch { return []; }
}

const decode = (u) => {
  try {
    const url = new URL(u);
    const m = /^\/(?:~\/sj\/[^/]+\/[^/]+|scramjet)\/(.+)$/.exec(url.pathname);
    return m ? decodeURIComponent(m[1]) : u;
  } catch { return u; }
};

const browser = await chromium.launch({
  channel: args.channel === "chromium" ? undefined : args.channel,
  // Headed (under xvfb in CI): YouTube asks headless Chrome to sign in.
  headless: !args.headed,
  args: ["--autoplay-policy=no-user-gesture-required", "--enable-precise-memory-info", "--enable-logging=stderr", "--v=0", ...(args.insecure ? ["--ignore-certificate-errors"] : [])],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: args.insecure });
await context.addInitScript((name) => { try { localStorage.setItem("sj-transport", name); } catch {} }, args.transport);
if (args.block) await context.addInitScript((source) => { self.__saintsDiagBlock = new RegExp(source); }, args.block);
const page = await context.newPage();

let crashed = false;
page.on("crash", () => { crashed = true; note("CRASH", { memory: rendererMemory() }); });
context.on("console", (m) => note("console", { type: m.type(), text: m.text().slice(0, 600) }));
page.on("pageerror", (e) => note("pageerror", { text: String(e.stack || e.message).slice(0, 1500) }));

const requests = new Map();
let seq = 0;
context.on("request", (r) => {
  const id = ++seq;
  requests.set(r, id);
  const real = decode(r.url());
  if (/\.(png|svg|ico|woff2?)(\?|$)/.test(real)) return;
  note("req", { id, method: r.method(), type: r.resourceType(), url: real.slice(0, 300), sw: !!r.serviceWorker() });
});
context.on("requestfinished", async (r) => {
  const id = requests.get(r);
  let size = null, status = null;
  try { const s = await r.sizes(); size = s.responseBodySize; } catch {}
  try { status = (await r.response())?.status(); } catch {}
  note("done", { id, status, size });
});
context.on("requestfailed", (r) => note("failed", { id: requests.get(r), url: decode(r.url()).slice(0, 300), error: r.failure()?.errorText }));

const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable").catch(() => {});

if (args.direct) {
  // Control: the video without any proxy.
  await page.goto(args.video, { waitUntil: "domcontentloaded", timeout: 30000 });
} else {
  await page.goto(args.url, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1500);
  note("version", { version: await timed(page.evaluate(() => fetch("/version.json").then((r) => r.json()).catch(() => null)), 10000, "version").catch((e) => e.message) });
  await page.fill("#sj-home-q", args.video, { timeout: 10000 });
  await page.press("#sj-home-q", "Enter", { timeout: 10000 });
}
note("opened", { video: args.video });

const deadline = Date.now() + Number(args.seconds) * 1000;
let shot = 0;
while (Date.now() < deadline && !crashed) {
  await new Promise((r) => setTimeout(r, 1000));
  const memory = rendererMemory();
  let heap = null;
  try {
    const { metrics } = await timed(cdp.send("Performance.getMetrics"), 5000, "metrics");
    const get = (n) => metrics.find((m) => m.name === n)?.value;
    heap = { usedMB: Math.round(get("JSHeapUsedSize") / 1048576), totalMB: Math.round(get("JSHeapTotalSize") / 1048576), nodes: get("Nodes"), docs: get("Documents"), frames: get("Frames") };
  } catch {}
  let video = null;
  const asked = Date.now();
  try {
    video = await timed(page.evaluate((direct) => {
      const f = document.querySelector("iframe.sj-frame");
      const d = direct ? document : f && f.contentDocument;
      const v = d && d.querySelector("video");
      const status = document.getElementById("sj-toolbar-status")?.textContent;
      if (!v) return { status, title: d?.title };
      const b = v.buffered;
      return {
        status, title: d.title,
        time: Number(v.currentTime.toFixed(2)), paused: v.paused, ready: v.readyState, net: v.networkState,
        error: v.error ? v.error.code + " " + v.error.message : null,
        buffered: b.length ? Number(b.end(b.length - 1).toFixed(1)) : 0,
        src: (v.currentSrc || "").slice(0, 60),
      };
    }, args.direct), 8000, "page.evaluate");
  } catch (e) { video = { evalError: String(e.message).slice(0, 200) }; }
  // How long the page's main thread took to answer (a hung page doesn't).
  note("tick", { memory, heap, video, answerMs: Date.now() - asked });
  if (args.shots && Number(t()) > 5 && shot < 6 && Math.floor(Number(t())) % 10 === 0) {
    await page.screenshot({ path: `${args.out}/t${Math.floor(Number(t()))}.jpg`, type: "jpeg", quality: 50, timeout: 8000 }).catch(() => {});
    shot++;
  }
  // Start playback if YouTube is waiting for a click.
  if (video && video.paused && video.ready >= 2 && Number(t()) > 8) {
    await timed(page.evaluate((direct) => { const v = (direct ? document : document.querySelector("iframe.sj-frame")?.contentDocument)?.querySelector("video"); v && v.play().catch(() => {}); }, args.direct), 5000, "play").catch(() => {});
  }
}
if (args.shots) await page.screenshot({ path: `${args.out}/final.jpg`, type: "jpeg", quality: 50, timeout: 8000 }).catch(() => {});

// Summary: requests by host/type, the slowest growth, the end state.
const byHost = {};
for (const e of log.filter((e) => e.kind === "req")) {
  let host = "";
  try { host = new URL(e.url).host; } catch { host = e.url.slice(0, 40); }
  const k = host + " " + e.type;
  byHost[k] = (byHost[k] || 0) + 1;
}
const ticks = log.filter((e) => e.kind === "tick");
const summary = {
  target: args.direct ? "direct" : args.url, transport: args.transport, block: args.block, shots: args.shots, crashed,
  lastTick: ticks.at(-1),
  peakRendererMB: Math.max(0, ...ticks.flatMap((e) => e.memory.map((m) => m.mb))),
  peakHeapMB: Math.max(0, ...ticks.map((e) => e.heap?.usedMB || 0)),
  requests: log.filter((e) => e.kind === "req").length,
  failed: log.filter((e) => e.kind === "failed").length,
  byHost: Object.fromEntries(Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 25)),
  pageErrors: log.filter((e) => e.kind === "pageerror").slice(0, 10).map((e) => e.text.slice(0, 300)),
  consoleErrors: log.filter((e) => e.kind === "console" && e.type === "error").slice(0, 25).map((e) => e.t + "s " + e.text.slice(0, 300)),
};
await writeFile(`${args.out}/log.json`, JSON.stringify(log, null, 1));
await writeFile(`${args.out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
clearTimeout(watchdog);
await timed(browser.close(), 15000, "close").catch(() => {});
process.exit(0);
