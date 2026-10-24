// Service worker for the Scramjet 2 build (published as /sw.js by
// scripts/build.mjs when SCRAMJET_ENGINE=2). Scramjet 2's controller does the
// fetching in the page (engine2.js); this worker only hands proxied requests
// to it.
importScripts("/controller/controller.sw.js");

self.addEventListener("fetch", (event) => {
  if ($scramjetController.shouldRoute(event)) event.respondWith($scramjetController.route(event));
});

// ---- Saved sessions ---------------------------------------------------------
// sessions.js asks this worker for the proxy's cookie jar to save and resume
// sessions: {saintsSessions: 1, type: "dump" | "load" | "clear", cookies?},
// answered on the MessagePort it sends along. Scramjet 2's controller keeps
// its jar in IndexedDB ("__scramjet_controller") and reloads it in every open
// page when told on its BroadcastChannel.
const JAR_DB = "__scramjet_controller";
const JAR_STORE = "state";
const JAR_KEY = "cookies";
const JAR_CHANNEL = "__scramjet_controller_channel";

function jarDb() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(JAR_DB, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(JAR_STORE)) open.result.createObjectStore(JAR_STORE);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
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
  } finally {
    db.close();
  }
}
async function dumpJar() {
  const state = await jarRequest("readonly", (store) => store.get(JAR_KEY));
  return state && typeof state.cookies === "string" ? state.cookies : "{}";
}
async function replaceJar(cookies) {
  let parsed = {};
  try { parsed = JSON.parse(typeof cookies === "string" && cookies ? cookies : "{}"); } catch {}
  const current = await jarRequest("readonly", (store) => store.get(JAR_KEY));
  const updatedAt = Math.max(Date.now(), ((current && current.updatedAt) || 0) + 1);
  await jarRequest("readwrite", (store) => store.put({ updatedAt, cookies: JSON.stringify(parsed) }, JAR_KEY));
  const channel = new BroadcastChannel(JAR_CHANNEL);
  channel.postMessage({ updatedAt });
  channel.close();
}

self.addEventListener("message", (event) => {
  const data = event.data;
  const port = event.ports && event.ports[0];
  if (!data || data.saintsSessions !== 1 || !port) return;
  if (event.source && event.source.url && new URL(event.source.url).origin !== self.location.origin) return;
  const work = (async () => {
    if (data.type === "dump") return { cookies: await dumpJar() };
    if (data.type === "load") { await replaceJar(data.cookies); return {}; }
    if (data.type === "clear") { await replaceJar("{}"); return {}; }
    throw new Error("unknown request");
  })();
  const reply = work.then((value) => port.postMessage({ ok: true, ...value }),
    (cause) => port.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }));
  if (typeof event.waitUntil === "function") event.waitUntil(reply);
});
