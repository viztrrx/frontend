import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/index.js", import.meta.url), "utf8");

function setup({ wispUrl = "wss://backend-ivvq.onrender.com/wisp/", socketFails = false, controllerFails = false } = {}) {
  const elements = new Map();
  const frames = [];
  const transports = [];
  let websocketCount = 0;
  let timerId = 0;
  const timers = new Map();
  const makeElement = (id) => {
    const callbacks = new Map();
    const element = {
      id, hidden: id === "sj-toolbar" || id === "sj-loading" || id === "sj-progress",
      textContent: "", value: "", disabled: false, removed: false,
      addEventListener: (kind, fn) => callbacks.set(kind, fn),
      dispatch: (kind, event = {}) => callbacks.get(kind)?.({ preventDefault() {}, ...event }),
      setAttribute() {},
      remove() { this.removed = true; },
    };
    elements.set(id, element);
    return element;
  };
  for (const id of ["sj-form", "sj-address", "sj-search-engine", "sj-error", "sj-error-code", "sj-progress", "sj-toolbar", "sj-toolbar-status", "sj-loading", "sj-loading-status", "sj-close", "sj-reload"]) makeElement(id);
  elements.get("sj-address").value = "example.com";
  const document = {
    getElementById: (id) => elements.get(id),
    body: { appendChild: (node) => frames.push(node) },
  };
  class MockWebSocket {
    static OPEN = 1;
    constructor() {
      websocketCount++;
      this.readyState = 0;
      this.callbacks = new Map();
      queueMicrotask(() => {
        const event = socketFails ? "error" : "open";
        if (!socketFails) this.readyState = MockWebSocket.OPEN;
        this.callbacks.get(event)?.();
      });
    }
    addEventListener(kind, cb) { this.callbacks.set(kind, cb); }
    close() { this.readyState = 3; }
  }
  class ScramjetController {
    async init() { if (controllerFails) throw new Error("Wasm init failed"); }
    createFrame() {
      const el = makeElement("frame-" + frames.length);
      return { frame: el, async go(url) { el.url = url; el.dispatch("load"); } };
    }
  }
  class BareMuxConnection {
    async setTransport(...args) { transports.push(args); }
    async getTransport() { return transports.length ? "/libcurl/index.mjs" : ""; }
  }
  const ctx = {
    document,
    window: { BareMux: { BareMuxConnection } },
    navigator: { serviceWorker: { ready: Promise.resolve() } },
    _CONFIG: { wispUrl },
    $scramjetLoadController: () => ({ ScramjetController }),
    registerSW: async () => {},
    search: (value) => "https://" + value,
    URL,
    WebSocket: MockWebSocket,
    SharedWorker: class MockSharedWorker {},
    Error,
    Promise,
    console,
    setTimeout(fn, milliseconds) {
      const id = ++timerId;
      if (milliseconds <= 2500) queueMicrotask(fn);
      else timers.set(id, fn);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  runInNewContext(source, ctx, { filename: "public/index.js" });
  return {
    elements, frames, transports, timers,
    websocketCount: () => websocketCount,
    submit: () => elements.get("sj-form").dispatch("submit"),
  };
}

test("checks Render Wisp and configures the transport before navigating", async () => {
  const x = setup();
  await x.submit();
  assert.equal(x.websocketCount(), 1);
  assert.equal(x.transports.length, 1);
  assert.equal(x.transports[0][0], "/libcurl/index.mjs");
  assert.equal(x.transports[0][1][0].websocket, "wss://backend-ivvq.onrender.com/wisp/");
  assert.equal(x.frames.length, 1);
  assert.equal(x.frames[0].url, "https://example.com");
  assert.equal(x.elements.get("sj-toolbar").hidden, false);
  assert.equal(x.elements.get("sj-loading").hidden, true);
  await x.elements.get("sj-close").dispatch("click");
  assert.equal(x.frames[0].removed, true);
  assert.equal(x.elements.get("sj-toolbar").hidden, true);
});

test("invalid Wisp URL preserves the original page and reports an error", async () => {
  const x = setup({ wispUrl: "" });
  await x.submit();
  assert.equal(x.frames.length, 0);
  assert.equal(x.websocketCount(), 0);
  assert.match(x.elements.get("sj-error-code").textContent, /missing or invalid/);
  assert.equal(x.elements.get("sj-loading").hidden, true);
});

test("broken backend handshake does not create a black frame", async () => {
  const x = setup({ socketFails: true });
  await x.submit();
  assert.equal(x.websocketCount(), 3);
  assert.equal(x.frames.length, 0);
  assert.match(x.elements.get("sj-error-code").textContent, /Cannot connect to wss:\/\/backend-ivvq/);
});

test("controller initialization failure is shown without masking the page", async () => {
  const x = setup({ controllerFails: true });
  await x.submit();
  assert.equal(x.frames.length, 0);
  assert.match(x.elements.get("sj-error-code").textContent, /Wasm init failed/);
});

test("Retry always refreshes the Wisp transport", async () => {
  const x = setup();
  await x.submit();
  await x.elements.get("sj-reload").dispatch("click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(x.transports.length, 2);
  assert.equal(x.frames.length, 2);
  assert.equal(x.frames[0].removed, true);
});
