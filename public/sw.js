importScripts("/scram/scramjet.all.js");

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

async function handleRequest(event) {
  const pathname = new URL(event.request.url).pathname;
  const isDocumentNavigation = event.request.mode === "navigate" &&
    pathname.startsWith("/scramjet/");
  try {
    await scramjet.loadConfig();
    if (!scramjet.route(event)) return fetch(event.request);
    const response = await scramjet.fetch(event);
    if (isDocumentNavigation) {
      event.waitUntil(reportNavigation(pathname, response.status));
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
