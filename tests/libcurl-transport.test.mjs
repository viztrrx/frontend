import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

// The browser build served at /libcurl/index.mjs, after patches/ is applied.
const { libcurlPath } = createRequire(import.meta.url)("@mercuryworkshop/libcurl-transport");
const source = readFileSync(join(libcurlPath, "index.mjs"), "utf8");

// Load the transport the way BareMux's SharedWorker does: a worker-like global
// where libcurl's WASM is still compiling when the first request calls init().
function loadClient() {
  const context = {
    importScripts() {}, location: { href: "https://frontend.viztrrx.workers.dev/libcurl/index.mjs" },
    TextEncoder, TextDecoder, console: { ...console, log() {} }, setTimeout, clearTimeout,
    setInterval, clearInterval, queueMicrotask, Event, EventTarget, CustomEvent, URL, crypto,
    performance, atob, btoa,
    WebSocket: class { constructor() { throw new Error("no network in tests"); } },
  };
  context.self = context;
  context.globalThis = context;
  runInNewContext(
    source.replace(/export\s*\{\s*LibcurlClient as default\s*\};?\s*$/, "globalThis.LibcurlClient = LibcurlClient;"),
    context
  );
  assert.equal(typeof context.LibcurlClient, "function");
  return new context.LibcurlClient({ wisp: "wss://backend-ivvq.onrender.com/wisp/" });
}

test("first transport init waits for libcurl WASM instead of throwing", async () => {
  const client = loadClient();
  assert.equal(client.ready, false);
  await client.init();
  assert.equal(client.ready, true);
  assert.ok(client.session, "an HTTP session is created once WASM is ready");
});

test("concurrent first requests share one session and all resolve", async () => {
  const client = loadClient();
  await Promise.all([client.init(), client.init(), client.init()]);
  const session = client.session;
  assert.equal(client.ready, true);
  await client.init();
  assert.equal(client.session, session);
});
