import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const blockSource = readFileSync(new URL("../public/blocked.js", import.meta.url), "utf8");

// A tiny IndexedDB stand-in (one database, key/value stores) shared across
// "restarts" of the worker, like the browser's real one.
function fakeIndexedDB(data = new Map()) {
  const later = (fn) => setTimeout(fn, 0);
  return {
    data,
    open() {
      const req = {};
      later(() => {
        const db = {
          createObjectStore(name) { data.set(name, data.get(name) || new Map()); },
          transaction(name) {
            const tx = {
              objectStore() {
                return {
                  get(key) { const r = {}; later(() => { r.result = data.get(name)?.get(key); r.onsuccess?.(); }); return r; },
                  put(value, key) { data.get(name).set(key, value); later(() => tx.oncomplete?.()); },
                };
              },
            };
            return tx;
          },
          close() {},
        };
        req.result = db;
        if (!data.has("jar")) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

function createHarness({ failing = false, transport = "/libcurl/index.mjs", fetchResponse, indexedDB, setCookie } = {}) {
  const transports = [];
  const handlers = new Map();
  const messages = [];
  const client = {
    url: "https://frontend.viztrrx.workers.dev/",
    postMessage(value) { messages.push(value); }
  };
  const self = {
    location: { origin: "https://frontend.viztrrx.workers.dev" },
    clients: {
      async matchAll() { return [client]; },
      async claim() {}
    },
    async skipWaiting() {},
    addEventListener(kind, fn) { handlers.set(kind, fn); }
  };
  let applied = null;
  const stored = { prefix: "/scramjet/" };
  // Mirrors Scramjet 1.1: a "loadConfig" message only stores the config, and
  // loadConfig() applies it from IndexedDB unless a config is already set.
  // Mirrors Scramjet 1.1's CookieStore (load() takes a JSON string).
  class CookieStore {
    cookies = {};
    load(text) { if (typeof text === "object") return text; this.cookies = JSON.parse(text); }
    dump() { return JSON.stringify(this.cookies); }
  }
  class ScramjetServiceWorker {
    config;
    cookieStore = indexedDB ? new CookieStore() : undefined;
    receiveConfigMessage(config) { this.config = config; }
    async loadConfig() {
      if (failing) throw new Error("<em>Backend problem</em>");
      if (this.config) return;
      this.config = stored;
      applied = stored;
    }
    route(event) {
      return new URL(event.request.url).pathname.startsWith("/scramjet/");
    }
    async fetch() {
      if (!applied) throw new TypeError("undefined is not an object (evaluating 'n.$W.prefix')");
      if (setCookie) this.cookieStore.cookies[setCookie] = { name: setCookie, value: "1", domain: ".example.com", path: "/" };
      return fetchResponse ? fetchResponse() : new Response("Website reached", { status: 200 });
    }
  }
  class BareMuxConnection {
    async getTransport() { return transport; }
    async setTransport(path, args) {
      transports.push([path, args]);
      await new Promise((resolve) => setTimeout(resolve, 5));
      transport = path;
    }
  }
  let worker;
  const $scramjetLoadWorker = () => ({
    ScramjetServiceWorker: class extends ScramjetServiceWorker { constructor() { super(); worker = this; } },
  });
  runInNewContext(source, {
    // blocked.js runs for real (it puts saintsBlock on self).
    importScripts(...paths) { if (paths.includes("/blocked.js")) runInNewContext(blockSource, { self, URL }); },
    $scramjetLoadWorker,
    self, URL, Response, Error, console, setTimeout, JSON, Promise,
    ...(indexedDB ? { indexedDB } : {}),
    BareMux: { BareMuxConnection },
    _CONFIG: { wispUrl: "wss://backend-ivvq.onrender.com/wisp/" },
    fetch: async () => new Response("Static asset", { status: 200 })
  });
  return {
    handlers,
    messages,
    transports,
    receiveConfigMessage: () => worker.receiveConfigMessage({ prefix: "/scramjet/" }),
    worker: () => worker,
    // A page asking the worker about saved sessions (sessions.js).
    ask(message) {
      return new Promise((resolve) => {
        const waits = [];
        handlers.get("message")({
          data: { saintsSessions: 1, ...message },
          ports: [{ postMessage: resolve }],
          source: { url: "https://frontend.viztrrx.workers.dev/" },
          waitUntil(p) { waits.push(p); },
        });
      });
    },
    async request(path, mode = "navigate") {
      let respond;
      const waits = [];
      handlers.get("fetch")({
        request: { url: "https://frontend.viztrrx.workers.dev" + path, mode },
        respondWith(value) { respond = value; },
        waitUntil(value) { waits.push(value); }
      });
      const response = await respond;
      await Promise.all(waits);
      return response;
    }
  };
}

test("proxied navigation reports real HTTP status to the controlling page", async () => {
  const h = createHarness();
  const path = "/scramjet/" + encodeURIComponent("https://google.com");
  const response = await h.request(path);
  assert.equal(response.status, 200);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].type, "scramjet-navigation-status");
  assert.equal(h.messages[0].path, path);
  assert.equal(h.messages[0].status, 200);
});

test("failed proxy navigation returns a diagnostic HTML response", async () => {
  const h = createHarness({ failing: true });
  const path = "/scramjet/" + encodeURIComponent("https://google.com");
  const response = await h.request(path);
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.match(body, /&lt;em&gt;Backend problem&lt;\/em&gt;/);
  assert.equal(h.messages[0].status, 0);
});

test("static assets are served without sending proxy navigation events", async () => {
  const h = createHarness();
  const response = await h.request("/config.js", "cors");
  assert.equal(response.status, 200);
  assert.equal(h.messages.length, 0);
});

test("full-tab pages get the libcurl transport restored once after BareMux restarts", async () => {
  const h = createHarness({ transport: "" });
  const asset = (name) => "/scramjet/" + encodeURIComponent("https://example.com/" + name);
  const responses = await Promise.all([h.request(asset("a.css"), "no-cors"), h.request(asset("b.js"), "no-cors")]);
  assert.deepEqual(responses.map((r) => r.status), [200, 200]);
  assert.equal(h.transports.length, 1, "concurrent requests share one setTransport call");
  assert.equal(JSON.stringify(h.transports[0]), JSON.stringify(["/libcurl/index.mjs", [{ websocket: "wss://backend-ivvq.onrender.com/wisp/" }]]));
  await h.request(asset("c.png"), "no-cors");
  assert.equal(h.transports.length, 1);
});

test("Scramjet's WASM loader does not wait on BareMux", async () => {
  const h = createHarness({ transport: "" });
  const response = await h.request("/scramjet/../scram/scramjet.wasm.wasm".replace("/scramjet/..", ""), "no-cors");
  assert.equal(response.status, 200);
  assert.equal(h.transports.length, 0);
});

test("proxied documents let BareMux messages through before parsing finishes", async () => {
  const h = createHarness({
    fetchResponse: () => new Response("<!doctype html><html><head lang=en><title>t</title></head><body>x</body></html>", {
      status: 200, headers: { "content-type": "text/html; charset=utf-8", "x-kept": "1" },
    }),
  });
  const response = await h.request("/scramjet/" + encodeURIComponent("https://example.com/"));
  const body = await response.text();
  assert.match(body, /^<!doctype html><html><head lang=en><script>navigator\.serviceWorker&&navigator\.serviceWorker\.startMessages\(\)<\/script><title>/);
  assert.equal(response.headers.get("x-kept"), "1");
});

test("Scramjet proxy error details are forwarded to the page", async () => {
  const script = encodeURIComponent('errorTrace.value = "Message: Request failed with error code 7: Could not connect to server\\n\\nUrl: x";');
  const h = createHarness({
    fetchResponse: () => new Response(`<html><head></head><body><script src="data:application/javascript,${script}"></script></body></html>`, {
      status: 500, headers: { "content-type": "text/html" },
    }),
  });
  await h.request("/scramjet/" + encodeURIComponent("https://www.google.com/"));
  assert.equal(h.messages[0].status, 500);
  assert.equal(h.messages[0].message, "Request failed with error code 7: Could not connect to server");
});

test("a worker woken by Scramjet's loadConfig message still applies the config", async () => {
  const h = createHarness();
  h.receiveConfigMessage();
  const path = "/scramjet/" + encodeURIComponent("https://example.com/");
  const response = await h.request(path);
  assert.equal(response.status, 200);
  assert.equal(h.messages[0].status, 200);
});

test("proxied sign-ins survive a service worker restart", async () => {
  const idb = fakeIndexedDB();
  const first = createHarness({ indexedDB: idb, setCookie: "SID" });
  await first.request("/scramjet/" + encodeURIComponent("https://example.com/"));
  // A fresh worker (the browser stopped the idle one) starts with an empty jar.
  const second = createHarness({ indexedDB: idb });
  assert.equal(second.worker().cookieStore.dump(), "{}");
  await second.request("/scramjet/" + encodeURIComponent("https://example.com/next"));
  assert.ok(JSON.parse(second.worker().cookieStore.dump()).SID, "the saved cookie was restored");
});

test("the page can read, replace and clear the cookie jar for saved sessions", async () => {
  const h = createHarness({ indexedDB: fakeIndexedDB() });
  const jar = JSON.stringify({ ".example.com@/@a": { name: "a", value: "1", domain: ".example.com", path: "/" } });
  assert.equal((await h.ask({ type: "load", cookies: jar })).ok, true);
  assert.equal((await h.ask({ type: "dump" })).cookies, jar);
  await h.ask({ type: "clear" });
  assert.equal((await h.ask({ type: "dump" })).cookies, "{}");
  assert.equal((await h.ask({ type: "nonsense" })).ok, false, "unknown requests are refused");
});

test("proxied AI sites are refused by the worker, page loads and their requests alike", async () => {
  const h = createHarness();
  const page = "/scramjet/" + encodeURIComponent("https://chatgpt.com/c/123");
  const response = await h.request(page);
  assert.equal(response.status, 403);
  assert.match(await response.text(), /unsafe and inaccurate/);
  assert.equal(h.messages[0].status, 403);
  const api = await h.request("/scramjet/" + encodeURIComponent("https://gemini.google.com/_/BardChatUi/data"), "cors");
  assert.equal(api.status, 403);
  // Ordinary sites still go through.
  assert.equal((await h.request("/scramjet/" + encodeURIComponent("https://www.google.com/search?q=chatgpt"))).status, 200);
});

test("Google sign-in pages and pop-ups get the notice with a Go back button", async () => {
  const h = createHarness();
  const popup = await h.request("/scramjet/" + encodeURIComponent("https://accounts.google.com/o/oauth2/v2/auth?client_id=1"));
  assert.equal(popup.status, 403);
  const html = await popup.text();
  assert.match(html, /doesn&#39;t support signing in with Google|doesn\u2019t support signing in with Google/);
  assert.match(html, />Go back<\/button>/);
  // Google's sign-in script and One Tap requests fail too.
  const script = await h.request("/scramjet/" + encodeURIComponent("https://accounts.google.com/gsi/client"), "no-cors");
  assert.equal(script.status, 403);
});
