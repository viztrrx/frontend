import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function createHarness({ failing = false, transport = "/libcurl/index.mjs", fetchResponse } = {}) {
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
  class ScramjetServiceWorker {
    config;
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
    importScripts() {},
    $scramjetLoadWorker,
    self, URL, Response, Error, console, setTimeout,
    BareMux: { BareMuxConnection },
    _CONFIG: { wispUrl: "wss://backend-ivvq.onrender.com/wisp/" },
    fetch: async () => new Response("Static asset", { status: 200 })
  });
  return {
    handlers,
    messages,
    transports,
    receiveConfigMessage: () => worker.receiveConfigMessage({ prefix: "/scramjet/" }),
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
