importScripts("/scram/scramjet.all.js", "/baremux/index.js", "/config.js");

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

// BareMux keeps its transport only in SharedWorker memory. When a full-tab
// site replaces the page that configured it, the SharedWorker restarts empty,
// so restore the same transport the frontend sets (index.js) before fetching.
const TRANSPORT = "/libcurl/index.mjs";
let bareMux = null;
let settingTransport = null;
async function ensureTransport() {
  bareMux ??= new BareMux.BareMuxConnection();
  if ((await bareMux.getTransport()) === TRANSPORT) return;
  settingTransport ??= bareMux
    .setTransport(TRANSPORT, [{ websocket: _CONFIG.wispUrl }])
    .finally(() => { settingTransport = null; });
  await settingTransport;
}

async function handleRequest(event) {
  const pathname = new URL(event.request.url).pathname;
  const isDocumentNavigation = event.request.mode === "navigate" &&
    pathname.startsWith("/scramjet/");
  try {
    await scramjet.loadConfig();
    if (!scramjet.route(event)) return fetch(event.request);
    // Scramjet's WASM loader is routed too, but must not wait on BareMux:
    // the page needs it before it can hand this worker a port.
    if (pathname.startsWith("/scramjet/")) await ensureTransport();
    let response = await scramjet.fetch(event);
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
        { status: 502, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
      );
    }
    throw cause;
  }
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});
