import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/index.js", import.meta.url), "utf8");

function setup({ wispUrl = "wss://backend-ivvq.onrender.com/wisp/", socketFails = false, controllerFails = false, workerHang = false, transportHang = false, blankFrame = false, noLoad = false, storage = {}, versionFetch } = {}) {
  const elements = new Map();
  const frames = [];
  const transports = [];
  const swCallbacks = new Map();
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
  for (const id of ["sj-form", "sj-address", "sj-search-engine", "sj-error", "sj-error-code", "sj-progress", "sj-toolbar", "sj-toolbar-status", "sj-loading", "sj-loading-status", "sj-close", "sj-reload", "sj-fulltab", "sj-show-page", "sj-version"]) makeElement(id);
  elements.get("sj-version").append = function (...nodes) {
    this.textContent += nodes.map((node) => typeof node === "string" ? node : node.textContent).join("");
    this.children = nodes;
  };
  elements.get("sj-fulltab").checked = false;
  elements.get("sj-search-engine").value = "https://www.google.com/search?q=%s";
  elements.get("sj-search-engine").options = [
    { value: "https://www.google.com/search?q=%s" }, { value: "https://duckduckgo.com/?q=%s" },
  ];
  const assigned = [];
  elements.get("sj-address").value = "example.com";
  const document = {
    getElementById: (id) => elements.get(id),
    body: { appendChild: (node) => frames.push(node) },
    createElement: () => ({ textContent: "" }),
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
    encodeUrl(url) { return "/scramjet/" + encodeURIComponent(url); }
    createFrame() {
      const el = makeElement("frame-" + frames.length);
      el.contentWindow = { location: { href: blankFrame ? "about:blank" : "https://frontend.viztrrx.workers.dev/scramjet/test" } };
      el.contentDocument = {
        URL: blankFrame ? "about:blank" : "https://frontend.viztrrx.workers.dev/scramjet/test",
        body: { innerText: blankFrame ? "" : "Example page", querySelector: () => null }
      };
      return {
        frame: el,
        go(url) {
          el.url = url;
          el.src = "/scramjet/" + encodeURIComponent(url);
          if (!noLoad) el.dispatch("load");
        }
      };
    }
  }
  class BareMuxConnection {
    async setTransport(...args) {
      if (transportHang) return new Promise(() => {});
      transports.push(args);
    }
    async getTransport() {
      if (workerHang) return new Promise(() => {});
      return transports.length ? "/libcurl/index.mjs" : "";
    }
  }
  const ctx = {
    document,
    window: { BareMux: { BareMuxConnection } },
    navigator: { serviceWorker: {
      ready: Promise.resolve(),
      addEventListener(kind, fn) { swCallbacks.set(kind, fn); }
    } },
    _CONFIG: { wispUrl },
    $scramjetLoadController: () => ({ ScramjetController }),
    registerSW: async () => {},
    search: (value) => "https://" + value,
    URL,
    location: { href: "https://frontend.viztrrx.workers.dev/", assign: (url) => assigned.push(url) },
    localStorage: {
      getItem: (key) => (key in storage ? storage[key] : null),
      setItem: (key, value) => { storage[key] = String(value); },
    },
    WebSocket: MockWebSocket,
    SharedWorker: class MockSharedWorker {},
    Error,
    Promise,
    Date,
    isNaN,
    ...(versionFetch ? { fetch: versionFetch } : {}),
    console,
    setTimeout(fn, milliseconds) {
      const id = ++timerId;
      if (milliseconds === 2500) queueMicrotask(fn);
      else timers.set(id, { fn, milliseconds });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  runInNewContext(source, ctx, { filename: "public/index.js" });
  return {
    elements, frames, transports, timers, assigned, storage,
    websocketCount: () => websocketCount,
    submit: () => elements.get("sj-form").dispatch("submit"),
    sendNavStatus(status, message = "") {
      const frame = frames.at(-1);
      swCallbacks.get("message")?.({ data: {
        type: "scramjet-navigation-status",
        path: new URL(frame.src, "https://frontend.viztrrx.workers.dev/").pathname,
        status,
        message
      }});
    },
    async advance(ms) {
      // Allow async initialization and successful WebSocket probes to finish.
      for (let i = 0; i < 80; i++) await Promise.resolve();
      const entries = [...timers.entries()].filter(([, timer]) => timer.milliseconds <= ms);
      for (const [id, timer] of entries) {
        timers.delete(id);
        timer.fn();
      }
      for (let i = 0; i < 80; i++) await Promise.resolve();
    },
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
  await x.advance(4000);
  assert.equal(x.elements.get("sj-loading").hidden, true);
  assert.equal(x.elements.get("sj-toolbar-status").textContent, "Website content detected");
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

test("unresponsive BareMux SharedWorker reports an error rather than hanging forever", async () => {
  const x = setup({ workerHang: true });
  const pending = x.submit();
  await x.advance(8000);
  await pending;
  assert.equal(x.frames.length, 0);
  assert.match(x.elements.get("sj-error-code").textContent, /SharedWorker isn't responding/);
  assert.equal(x.elements.get("sj-progress").hidden, true);
});

test("transport setup timeout diagnoses libcurl rather than hiding the whole page", async () => {
  const x = setup({ transportHang: true });
  const pending = x.submit();
  await x.advance(18000);
  await pending;
  assert.equal(x.frames.length, 0);
  assert.match(x.elements.get("sj-error-code").textContent, /libcurl transport did not initialize/);
  assert.equal(x.elements.get("sj-progress").hidden, true);
});

test("blank about:blank iframe never counts as website loaded", async () => {
  const x = setup({ blankFrame: true });
  await x.submit();
  assert.equal(x.elements.get("sj-loading").hidden, false);
  await x.advance(35000);
  assert.equal(x.elements.get("sj-loading").hidden, false);
  assert.match(x.elements.get("sj-loading-status").textContent, /No completed proxied webpage/);
  assert.notEqual(x.elements.get("sj-toolbar-status").textContent, "Page frame loaded");
});

test("site HTTP errors keep the delivered page visible and explain the status", async () => {
  const x = setup();
  await x.submit();
  x.sendNavStatus(502, "Request failed with error code 7: Could not connect to server");
  await x.advance(4000);
  assert.equal(x.elements.get("sj-loading").hidden, true);
  assert.match(x.elements.get("sj-toolbar-status").textContent, /HTTP 502/);
  assert.match(x.elements.get("sj-toolbar-status").textContent, /Could not connect to server/);
  await x.advance(35000);
  assert.equal(x.elements.get("sj-loading").hidden, true);
});

test("rate-limited search pages (HTTP 429) are shown with a search engine hint", async () => {
  const x = setup();
  await x.submit();
  x.sendNavStatus(429);
  await x.advance(4000);
  assert.equal(x.elements.get("sj-loading").hidden, true);
  assert.match(x.elements.get("sj-toolbar-status").textContent, /429.*another search engine/);
});

test("service worker failures without a document still cover the frame with the reason", async () => {
  const x = setup();
  await x.submit();
  x.sendNavStatus(0, "Upstream service unavailable");
  await x.advance(4000);
  assert.equal(x.elements.get("sj-loading").hidden, false);
  assert.match(x.elements.get("sj-loading-status").textContent, /Upstream service unavailable/);
  assert.equal(x.elements.get("sj-toolbar-status").textContent, "Website request failed");
  x.elements.get("sj-show-page").dispatch("click");
  assert.equal(x.elements.get("sj-loading").hidden, true);
});

test("content appearing before the load event uncovers the page", async () => {
  const x = setup({ noLoad: true });
  await x.submit();
  assert.equal(x.elements.get("sj-loading").hidden, false);
  await x.advance(1000);
  assert.equal(x.elements.get("sj-loading").hidden, true);
  assert.equal(x.elements.get("sj-toolbar-status").textContent, "Website content detected");
});

test("full-tab mode opens the proxied site in the tab instead of a frame", async () => {
  const x = setup({ storage: { "sj-fulltab": "true" } });
  assert.equal(x.elements.get("sj-fulltab").checked, true);
  await x.submit();
  assert.equal(x.transports.length, 1, "transport is configured before leaving the page");
  assert.equal(x.frames.length, 0);
  assert.deepEqual(x.assigned, ["/scramjet/" + encodeURIComponent("https://example.com")]);
});

test("search engine and full-tab choices are remembered", async () => {
  const x = setup({ storage: { "sj-search-engine": "https://duckduckgo.com/?q=%s" } });
  assert.equal(x.elements.get("sj-search-engine").value, "https://duckduckgo.com/?q=%s");
  x.elements.get("sj-fulltab").checked = true;
  x.elements.get("sj-fulltab").dispatch("change");
  assert.equal(x.storage["sj-fulltab"], "true");
});

test("shows the deployed commit from version.json", async () => {
  const requests = [];
  const x = setup({
    versionFetch: async (url, options) => {
      requests.push([url, options.cache]);
      return { ok: true, json: async () => ({
        commit: "c5d09bea9539f96187fcd1d80478a81a6e72713d",
        message: "Add full-tab mode",
        committedAt: "2026-10-21T19:33:18+00:00",
      }) };
    },
  });
  await x.advance(0);
  assert.deepEqual(requests, [["/version.json", "no-store"]]);
  const label = x.elements.get("sj-version");
  assert.match(label.textContent, /^Live version: c5d09be · .+ · Add full-tab mode$/);
  assert.equal(label.children[0].href, "https://github.com/viztrrx/scramjet-frontend/commit/c5d09bea9539f96187fcd1d80478a81a6e72713d");
});

test("version label reports unknown when version.json is missing", async () => {
  const x = setup({ versionFetch: async () => ({ ok: false, status: 404 }) });
  await x.advance(0);
  assert.equal(x.elements.get("sj-version").textContent, "Live version: unknown");
});
