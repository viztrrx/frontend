importScripts("/scram/scramjet.all.js", "/baremux/index.js", "/config.js", "/blocked.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A real navigation response is more reliable than an iframe's initial load
// event, which also fires for empty documents and failed navigations.
async function reportNavigation(path, status, message = "") {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    const url = new URL(client.url);
    if (url.origin === self.location.origin && !url.pathname.startsWith("/scramjet/")) {
      client.postMessage({ type: "scramjet-navigation-status", path, status, message });
    }
  }
}

// Scramjet renders proxy failures as a 500 page whose details live in an
// inline data: script; pull out the "Message:" line for the frontend toolbar.
async function scramjetErrorMessage(response) {
  try {
    const html = await response.clone().text();
    const start = html.indexOf("data:application/javascript,");
    if (start === -1) return "";
    const end = html.indexOf('"', start);
    const script = decodeURIComponent(html.slice(start + 28, end === -1 ? undefined : end));
    const match = /Message: (.*?)(?:\\n|\n|["'`])/.exec(script);
    return match ? match[1].slice(0, 200) : "";
  } catch {
    return "";
  }
}

// A proxied page opened in the full tab must hand this worker a fresh BareMux
// port, but service worker messages wait until the page finishes parsing,
// while its parser-blocking scripts wait on that port. startMessages() lets
// BareMux's port request through early (it retries every second).
const EARLY_MESSAGES = "<script>navigator.serviceWorker&&navigator.serviceWorker.startMessages()</script>";
async function enableEarlyMessages(response) {
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;
  const html = await response.text();
  const head = /<head\b[^>]*>/i.exec(html);
  const at = head ? head.index + head[0].length : 0;
  return new Response(html.slice(0, at) + EARLY_MESSAGES + html.slice(at), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// BareMux keeps its transport only in SharedWorker memory. If the SharedWorker
// restarts empty (a proxied page outlived the page that configured it),
// restore a transport the frontend uses (index.js) before fetching: libcurl,
// its default, or Epoxy if libcurl can't be set.
const TRANSPORTS = [
  ["/libcurl/index.mjs", () => [{ websocket: _CONFIG.wispUrl }]],
  ["/epoxy/index.mjs", () => [{ wisp: _CONFIG.wispUrl }]],
];
let bareMux = null;
let settingTransport = null;
async function ensureTransport() {
  bareMux ??= new BareMux.BareMuxConnection();
  const current = await bareMux.getTransport();
  if (TRANSPORTS.some(([path]) => path === current)) return;
  settingTransport ??= (async () => {
    for (const [path, args] of TRANSPORTS) {
      try { await bareMux.setTransport(path, args()); return; } catch (cause) { console.error("Couldn't set " + path + ":", cause); }
    }
    throw new Error("No proxy transport could be set up.");
  })().finally(() => { settingTransport = null; });
  await settingTransport;
}

// Scramjet's "loadConfig" message stores the config without applying it, and
// loadConfig() then returns early. A worker woken by that message (iOS stops
// idle workers while the page stays open) crashed with "n.$W.prefix", so load
// and apply the config from IndexedDB once per worker start.
let configLoaded = null;
function loadScramjetConfig() {
  configLoaded ??= (async () => {
    scramjet.config = undefined;
    await scramjet.loadConfig();
    // Not stored yet (the frontend stores it before registering this worker); retry next time.
    if (!scramjet.config) configLoaded = null;
  })().catch((cause) => {
    configLoaded = null;
    throw cause;
  });
  return configLoaded;
}

// ---- Cookie jar persistence and saved sessions ------------------------------
// Scramjet 1.1 keeps its cookie jar in memory and saves it to IndexedDB, but
// CookieStore.load() ignores the object it saved, so every worker restart
// (iOS stops idle workers) dropped every proxied sign-in. Cookies from HTTP
// responses weren't saved at all, only document.cookie writes. This worker
// keeps its own copy in the "saints-sessions" database and restores it
// before the first proxied request.
const JAR_DB = "saints-sessions";
const JAR_STORE = "jar";
// One connection, kept open: opening and closing the database for every
// request (TikTok sets cookies on dozens) strained Safari's IndexedDB, which
// Scramjet also relies on for every page.
let jarConnection = null;
function jarDb() {
  jarConnection ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(JAR_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(JAR_STORE);
    open.onsuccess = () => {
      const db = open.result;
      // Safari can drop the connection; the next use opens a new one.
      db.onclose = () => { jarConnection = null; };
      db.onversionchange = () => { db.close(); jarConnection = null; };
      resolve(db);
    };
    open.onerror = () => reject(open.error);
  }).catch((cause) => { jarConnection = null; throw cause; });
  return jarConnection;
}
async function jarRequest(mode, run) {
  const db = await jarDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(JAR_STORE, mode);
      const result = run(tx.objectStore(JAR_STORE));
      tx.oncomplete = () => resolve(result.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("The cookie store's transaction was aborted."));
    });
  } catch (cause) {
    jarConnection = null;
    throw cause;
  }
}
const jarGet = () => jarRequest("readonly", (store) => store.get("cookies"));
const jarPut = (value) => jarRequest("readwrite", (store) => store.put(value, "cookies"));
const hasJar = () => !!(scramjet.cookieStore && typeof scramjet.cookieStore.dump === "function");
let jarLoaded = null;
let jarSaved = "";
function loadJar() {
  if (typeof indexedDB === "undefined" || !hasJar()) return Promise.resolve();
  jarLoaded ??= jarGet().then((saved) => {
    // Cookies set before the saved copy was read (none in practice) win.
    if (typeof saved === "string" && saved) {
      const now = JSON.parse(scramjet.cookieStore.dump() || "{}");
      scramjet.cookieStore.load(JSON.stringify({ ...JSON.parse(saved), ...now }));
    }
    jarSaved = scramjet.cookieStore.dump();
  }).catch((cause) => {
    jarLoaded = null;
    console.error("Could not restore the proxy's cookies:", cause);
  });
  return jarLoaded;
}
// Called after each proxied request: writes only when the jar changed.
async function saveJar() {
  if (typeof indexedDB === "undefined" || !hasJar()) return;
  await loadJar();
  const now = scramjet.cookieStore.dump();
  if (now === jarSaved) return;
  jarSaved = now;
  try { await jarPut(now); } catch (cause) { jarSaved = ""; console.error("Could not save the proxy's cookies:", cause); }
}
// After proxied requests the jar is saved at most once a second, not per request.
const SAVE_DELAY_MS = 1000;
let saveSoonPromise = null;
function saveJarSoon() {
  saveSoonPromise ??= new Promise((resolve) => setTimeout(resolve, SAVE_DELAY_MS))
    .then(saveJar)
    .finally(() => { saveSoonPromise = null; });
  return saveSoonPromise;
}
async function replaceJar(cookies) {
  await loadJar();
  scramjet.cookieStore.load(typeof cookies === "string" && cookies ? cookies : "{}");
  await saveJar();
}

// The page (sessions.js) reads and replaces the jar to save and resume
// sessions: {saintsSessions: 1, type: "dump" | "load" | "clear", cookies?},
// answered on the MessagePort it sends along.
self.addEventListener("message", (event) => {
  const data = event.data;
  const port = event.ports && event.ports[0];
  if (!data || data.saintsSessions !== 1 || !port) return;
  if (event.source && event.source.url && new URL(event.source.url).origin !== self.location.origin) return;
  const work = (async () => {
    if (!hasJar()) throw new Error("Scramjet's cookie jar isn't available.");
    if (data.type === "dump") { await loadJar(); return { cookies: scramjet.cookieStore.dump() }; }
    if (data.type === "load") { await replaceJar(data.cookies); return {}; }
    if (data.type === "clear") { await replaceJar("{}"); return {}; }
    throw new Error("unknown request");
  })();
  const reply = work.then((value) => port.postMessage({ ok: true, ...value }),
    (cause) => port.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }));
  if (typeof event.waitUntil === "function") event.waitUntil(reply);
});

// Pages this worker writes itself go into Saints Search's frames, and Saints
// Search is cross-origin isolated (COEP require-corp): a framed page without
// COEP is refused, and the frame shows the browser's error page instead.
const OWN_PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin",
};

// ---- Blocked sites (blocked.js): AI, and signing in with Google -------------
// Proxied addresses are "/scramjet/" + encodeURIComponent(real URL) (Scramjet's
// default codec); Scramjet may add its own "?type=…" after it.
const PROXY_PREFIX = "/scramjet/";
function realUrlOf(requestUrl) {
  const u = new URL(requestUrl);
  if (u.origin !== self.location.origin || !u.pathname.startsWith(PROXY_PREFIX)) return "";
  try { return decodeURIComponent(u.pathname.slice(PROXY_PREFIX.length)); } catch { return ""; }
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
// What a blocked page shows. In Saints Search's own frame the page (index.js)
// covers it with its notice; this is what pop-ups ("Sign in with Google"
// windows) and frames inside sites show. Other requests just fail.
function blockedResponse(event, site, block) {
  const headers = OWN_PAGE_HEADERS;
  if (event.request.mode !== "navigate") return new Response("Blocked: " + block.message, { status: 403, headers });
  let host = "";
  try { host = new URL(site).hostname; } catch {}
  // Back to the page that sent you here; a pop-up with nowhere to go closes.
  const back = block.kind === "googleSignIn"
    ? '<button onclick="history.length>1?history.back():window.close()" style="margin-top:14px;min-height:40px;padding:0 16px;border:0;border-radius:10px;background:#b0b0b0;color:#171717;font:inherit;font-weight:600;cursor:pointer">Go back</button>'
    : "";
  return new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(block.title) + "</title>" +
    '<body style="margin:0;min-height:100vh;display:grid;place-items:center;overflow:hidden;background:#131313;color:#e6e6e6;font:min(16px,4.2vw)/1.5 -apple-system,system-ui,sans-serif;text-align:center;padding:16px;box-sizing:border-box">' +
    '<div style="max-width:420px"><h1 style="font-size:1.35em;margin:0 0 10px">' + escapeHtml(block.title) + '</h1><p style="margin:0 0 8px">' +
    escapeHtml(block.message) + '</p><p style="margin:0;color:#9c9c9c;font-size:.8em">' + escapeHtml(host) + "</p>" + back + "</div></body>",
    { status: 403, headers }
  );
}

// Scramjet error messages that come from the browser's storage, not the site.
const TRANSIENT = /AbortError|InvalidStateError|UnknownError|Indexed Database|transaction/i;

async function handleRequest(event) {
  const pathname = new URL(event.request.url).pathname;
  const site = realUrlOf(event.request.url);
  const block = site && self.saintsBlock ? self.saintsBlock.check(site) : null;
  if (block) {
    if (event.request.mode === "navigate") event.waitUntil(reportNavigation(pathname, 403, block.title));
    return blockedResponse(event, site, block);
  }
  const isDocumentNavigation = event.request.mode === "navigate" &&
    pathname.startsWith("/scramjet/");
  try {
    try {
      await loadScramjetConfig();
    } catch (cause) {
      // This site's own files and /sessions don't need Scramjet's settings.
      if (!pathname.startsWith("/scramjet/")) return fetch(event.request);
      throw cause;
    }
    if (!scramjet.config) {
      if (pathname.startsWith("/scramjet/")) throw new Error("Scramjet settings are not stored yet. Go Back and open the site again.");
      return fetch(event.request);
    }
    if (!scramjet.route(event)) return fetch(event.request);
    // Scramjet's WASM loader is routed too, but must not wait on BareMux:
    // the page needs it before it can hand this worker a port.
    if (pathname.startsWith("/scramjet/")) await ensureTransport();
    await loadJar();
    let response = await scramjet.fetch(event);
    // Safari sometimes aborts Scramjet's IndexedDB work mid-page (Scramjet
    // then shows "Message: AbortError"); one more try nearly always works.
    if (isDocumentNavigation && response.status === 500 && TRANSIENT.test(await scramjetErrorMessage(response))) {
      response = await scramjet.fetch(event);
    }
    event.waitUntil(saveJarSoon());
    if (isDocumentNavigation) {
      const message = response.status === 500 ? await scramjetErrorMessage(response) : "";
      event.waitUntil(reportNavigation(pathname, response.status, message));
      response = await enableEarlyMessages(response);
    }
    return response;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error("Scramjet service worker navigation failed:", cause);
    if (isDocumentNavigation) {
      event.waitUntil(reportNavigation(pathname, 0, message));
      const safeText = message.replace(/[&<>"']/g, (char) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
      );
      return new Response(
        '<!doctype html><title>Scramjet error</title><body style="background:#111;color:white;font:16px sans-serif;padding:24px"><h1>Website failed to load</h1><p>' +
        safeText + "</p></body>",
        { status: 502, headers: OWN_PAGE_HEADERS }
      );
    }
    throw cause;
  }
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});
