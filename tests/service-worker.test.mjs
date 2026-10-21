import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function createHarness({ failing = false } = {}) {
  const handlers = new Map();
  const messages = [];
  const waits = [];
  let respond;
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
  class ScramjetServiceWorker {
    async loadConfig() {
      if (failing) throw new Error("<em>Backend problem</em>");
    }
    route(event) {
      return new URL(event.request.url).pathname.startsWith("/scramjet/");
    }
    async fetch() { return new Response("Website reached", { status: 200 }); }
  }
  runInNewContext(source, {
    importScripts() {},
    $scramjetLoadWorker() { return { ScramjetServiceWorker }; },
    self, URL, Response, Error, console,
    fetch: async () => new Response("Static asset", { status: 200 })
  });
  return {
    handlers,
    messages,
    async request(path, mode = "navigate") {
      waits.length = 0;
      respond = undefined;
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
