import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/index.js", import.meta.url), "utf8");

function setup({ wispUrl = "wss://backend-ivvq.onrender.com/wisp/", socketFails = false, controllerFails = false, workerHang = false, transportHang = false, blankFrame = false, noLoad = false, storage = {}, versionFetch, embed = false, realUrls = false } = {}) {
  const posts = [];
  const winMessage = { fn: null };
  const elements = new Map();
  const frames = [];
  const made = [];   // every frame Scramjet created, attached or not
  const transports = [];
  const swCallbacks = new Map();
  let websocketCount = 0;
  let timerId = 0;
  const timers = new Map();
  const makeElement = (id) => {
    const callbacks = new Map();
    const element = {
      id, hidden: id === "sj-loading" || id === "sj-progress" || id === "sj-view" || id === "sj-fs" || id === "sj-exit",
      textContent: "", value: "", disabled: false, removed: false,
      addEventListener: (kind, fn) => callbacks.set(kind, fn),
      dispatch: (kind, event = {}) => callbacks.get(kind)?.({ preventDefault() {}, ...event }),
      setAttribute() {},
      style: {},
      remove() { this.removed = true; },
    };
    elements.set(id, element);
    return element;
  };
  for (const id of ["sj-form", "sj-address", "sj-search-engine", "sj-error", "sj-error-code", "sj-progress", "sj-toolbar", "sj-toolbar-status", "sj-loading", "sj-loading-status", "sj-home-btn", "sj-reload", "sj-back", "sj-forward", "sj-show-page", "sj-version", "sj-home", "sj-view", "sj-home-form", "sj-home-q", "sj-omni-ic", "sj-fs", "sj-exit", "sj-tabs", "sj-newtab"]) makeElement(id);
  // The tab strip: keeps the rendered tabs so tests can read and click them.
  elements.get("sj-tabs").replaceChildren = function (...items) { this.items = items; };
  // The proxied page goes in the page area under the toolbar.
  elements.get("sj-view").appendChild = (node) => frames.push(node);
  elements.get("sj-version").append = function (...nodes) {
    this.textContent += nodes.map((node) => typeof node === "string" ? node : node.textContent).join("");
    this.children = nodes;
  };
  elements.get("sj-search-engine").value = "https://www.google.com/search?q=%s";
  elements.get("sj-search-engine").options = [
    { value: "https://www.google.com/search?q=%s" }, { value: "https://duckduckgo.com/?q=%s" },
  ];
  const assigned = [];
  elements.get("sj-address").value = "example.com";
  const document = {
    activeElement: null,
    getElementById: (id) => elements.get(id),
    body: { appendChild: (node) => frames.push(node) },
    createElement: () => {
      const callbacks = new Map();
      const node = {
        textContent: "", className: "", dataset: {}, style: {}, children: [], attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(kind, fn) { callbacks.set(kind, fn); },
        dispatch(kind, event = {}) { callbacks.get(kind)?.({ preventDefault() {}, stopPropagation() {}, ...event }); },
        append(...nodes) { this.children.push(...nodes); },
        appendChild(n) { this.children.push(n); },
        remove() {},
      };
      return node;
    },
    addEventListener() {},
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
    decodeUrl(href) {
      // realUrls: the frame's real page is whatever it was last sent to.
      if (realUrls) { const f = made.find((x) => x.contentWindow.location.href === href); return f ? f.url : "https://example.com/"; }
      return "https://example.com/";
    }
    createFrame() {
      const el = makeElement("frame-" + made.length);
      made.push(el);
      el.contentWindow = { location: { href: blankFrame ? "about:blank" : "https://frontend.viztrrx.workers.dev/scramjet/test" } };
      el.contentDocument = {
        URL: blankFrame ? "about:blank" : "https://frontend.viztrrx.workers.dev/scramjet/test",
        body: { innerText: blankFrame ? "" : "Example page", querySelector: () => null }
      };
      const history = [];
      let at = -1;
      const land = (url) => {
        el.url = url;
        if (!blankFrame) el.contentWindow.location.href = "https://frontend.viztrrx.workers.dev/scramjet/" + encodeURIComponent(url);
        if (!noLoad) el.dispatch("load");
      };
      const sj = {
        frame: el,
        reloads: 0,
        go(url) {
          history.splice(at + 1);
          history.push(url);
          at = history.length - 1;
          el.src = "/scramjet/" + encodeURIComponent(url);
          land(url);
        },
        back() { if (at > 0) land(history[--at]); },
        forward() { if (at < history.length - 1) land(history[++at]); },
        reload() { sj.reloads++; },
      };
      if (blankFrame) el.contentWindow.location.href = "about:blank";
      return sj;
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
    window: { BareMux: { BareMuxConnection }, addEventListener: (kind, fn) => { if (kind === 'message') winMessage.fn = fn; }, ...(embed ? { parent: { postMessage: (message) => posts.push(message) } } : {}) },
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
      removeItem: (key) => { delete storage[key]; },
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
  const initialAddress = elements.get("sj-address").value;
  elements.get("sj-address").value = "example.com";   // what the tests type
  return {
    initialAddress,
    elements, frames, transports, timers, assigned, storage, posts,
    navigate: (query) => winMessage.fn?.({ source: ctx.window.parent, data: { saintsProxy: 1, type: "navigate", query } }),
    chrome: (opts) => winMessage.fn?.({ source: ctx.window.parent, data: { saintsProxy: 1, type: "chrome", ...opts } }),
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
  assert.equal(x.elements.get("sj-view").hidden, false);
  assert.equal(x.elements.get("sj-home").hidden, true);
  await x.advance(4000);
  assert.equal(x.elements.get("sj-loading").hidden, true);
  assert.equal(x.elements.get("sj-toolbar-status").textContent, "Website content detected");
  await x.elements.get("sj-home-btn").dispatch("click");
  assert.equal(x.frames[0].removed, true);
  assert.equal(x.elements.get("sj-view").hidden, true);
  assert.equal(x.elements.get("sj-home").hidden, false);
  assert.equal(x.elements.get("sj-address").value, "saints://home");
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

test("Reload after a failed load reconnects and refreshes the Wisp transport", async () => {
  const x = setup();
  await x.submit();
  x.sendNavStatus(0, "Upstream service unavailable");
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

test("sites always open in the frame under the toolbar, even with the old full-tab setting", async () => {
  const x = setup({ storage: { "sj-fulltab": "true" } });
  assert.equal(x.storage["sj-fulltab"], undefined, "the old setting is cleared");
  await x.submit();
  assert.equal(x.frames.length, 1);
  assert.deepEqual(x.assigned, [], "the page itself never navigates away");
});

test("the search engine choice is remembered", async () => {
  const x = setup({ storage: { "sj-search-engine": "https://duckduckgo.com/?q=%s" } });
  assert.equal(x.elements.get("sj-search-engine").value, "https://duckduckgo.com/?q=%s");
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

test("embedded: reports the proxied site, and the start page on close, to the console parent", async () => {
  const x = setup({ embed: true });
  // On load it tells the parent it is on the start page.
  const J = (m) => JSON.stringify(m);
  assert.equal(J(x.posts.at(-1)), J({ saintsProxy: 1, type: "nav", url: "" }));
  await x.submit();
  await x.advance(4000);
  // The opened site is reported with its real (decoded) URL.
  assert.equal(J(x.posts.at(-1)), J({ saintsProxy: 1, type: "nav", url: "https://example.com/" }));
  await x.elements.get("sj-home-btn").dispatch("click");
  // Going home reports the start page again.
  assert.equal(J(x.posts.at(-1)), J({ saintsProxy: 1, type: "nav", url: "" }));
});

test("not embedded: nothing is posted to any parent", async () => {
  const x = setup();
  await x.submit();
  await x.advance(4000);
  assert.equal(x.posts.length, 0);
});

test("embedded: a search term the user types is reported to the console with the page", async () => {
  const x = setup({ embed: true });
  const J = (m) => JSON.stringify(m);
  x.elements.get("sj-address").value = "tiktok";          // plain words, not a URL
  await x.submit();
  await x.advance(4000);
  // The page URL and the search term both reach the console.
  assert.equal(J(x.posts.at(-1)), J({ saintsProxy: 1, type: "nav", url: "https://example.com/", query: "tiktok" }));
});

test("embedded: a typed web address is reported without a search term", async () => {
  const x = setup({ embed: true });
  const J = (m) => JSON.stringify(m);
  x.elements.get("sj-address").value = "tiktok.com";      // a domain
  await x.submit();
  await x.advance(4000);
  assert.equal(J(x.posts.at(-1)), J({ saintsProxy: 1, type: "nav", url: "https://example.com/" }));
});

test("embedded: the console can drive navigation, and a search term is reported", async () => {
  const x = setup({ embed: true });
  const J = (m) => JSON.stringify(m);
  x.navigate("funny cats");
  await x.advance(4000);
  assert.equal(x.frames.length, 1);
  assert.equal(J(x.posts.at(-1)), J({ saintsProxy: 1, type: "nav", url: "https://example.com/", query: "funny cats" }));
});

// ---- Chrome-style toolbar and saints://home ----

test("starts on saints://home with Back and Forward disabled", () => {
  const x = setup();
  assert.equal(x.initialAddress, "saints://home");
  assert.equal(x.elements.get("sj-home").hidden, false);
  assert.equal(x.elements.get("sj-view").hidden, true);
  assert.equal(x.elements.get("sj-back").disabled, true);
  assert.equal(x.elements.get("sj-forward").disabled, true);
});

test("the address bar selects everything on focus, so typing replaces saints://home", () => {
  const x = setup();
  const bar = x.elements.get("sj-address");
  bar.value = "saints://home";
  let selected = null;
  bar.select = () => { selected = bar.value; };
  bar.dispatch("focus");
  assert.equal(selected, "saints://home");
});

test("typing saints://home while on a site goes back to the home page", async () => {
  const x = setup();
  await x.submit();
  await x.advance(4000);
  x.elements.get("sj-address").value = "saints://home";
  await x.submit();
  assert.equal(x.frames[0].removed, true);
  assert.equal(x.elements.get("sj-home").hidden, false);
  assert.equal(x.elements.get("sj-address").value, "saints://home");
});

test("the address bar shows the real site, a new address reuses the frame, and Back/Forward walk it", async () => {
  const x = setup({ realUrls: true });
  await x.submit();
  await x.advance(4000);
  const bar = x.elements.get("sj-address");
  assert.equal(bar.value, "https://example.com");
  assert.equal(x.elements.get("sj-back").disabled, false, "Back is on: it returns to saints://home");
  assert.equal(x.elements.get("sj-forward").disabled, true);
  bar.value = "youtube.com";
  await x.submit();
  await x.advance(4000);
  assert.equal(x.frames.length, 1, "the same frame navigates (history kept)");
  assert.equal(bar.value, "https://youtube.com");
  await x.elements.get("sj-back").dispatch("click");
  assert.equal(bar.value, "https://example.com");
  assert.equal(x.elements.get("sj-forward").disabled, false);
  await x.elements.get("sj-forward").dispatch("click");
  assert.equal(bar.value, "https://youtube.com");
  await x.elements.get("sj-back").dispatch("click");
  await x.elements.get("sj-back").dispatch("click");
  // Back from the first page lands on saints://home — never past it.
  assert.equal(x.frames[0].removed, true);
  assert.equal(bar.value, "saints://home");
  assert.equal(x.elements.get("sj-forward").disabled, false, "Forward from home reopens the site");
  await x.elements.get("sj-forward").dispatch("click");
  await x.advance(4000);
  assert.equal(x.frames.length, 2);
  assert.equal(x.elements.get("sj-home").hidden, true);
});

test("Reload reloads the page in place", async () => {
  const x = setup();
  await x.submit();
  await x.advance(4000);
  const frame = x.frames[0];
  await x.elements.get("sj-reload").dispatch("click");
  assert.equal(x.frames.length, 1);
  assert.equal(x.transports.length, 1);
});

test("the proxied page sits in the page area below the toolbar, never under it", () => {
  const css = readFileSync(new URL("../public/index.css", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(css, /\.sb-view \{[^}]*top: calc\(var\(--chrome-h\) \+ 1px\)/);
  assert.match(css, /\.sj-frame \{[^}]*width: 100%; height: 100%/);
  assert.doesNotMatch(css.match(/\.sj-frame \{[^}]*\}/)[0], /position/);
  assert.ok(html.indexOf('id="sj-toolbar"') < html.indexOf('id="sj-view"'));
});

test("not embedded: no Close or Fullscreen buttons", () => {
  const x = setup();
  assert.equal(x.elements.get("sj-exit").hidden, true);
  assert.equal(x.elements.get("sj-fs").hidden, true);
});

test("embedded: the toolbar has the console's Close, and Fullscreen when the console offers it", async () => {
  const x = setup({ embed: true });
  const J = (m) => JSON.stringify(m);
  assert.equal(x.elements.get("sj-exit").hidden, false);
  assert.equal(x.elements.get("sj-fs").hidden, true);
  x.elements.get("sj-exit").dispatch("click");
  assert.equal(J(x.posts.at(-1)), J({ saintsProxy: 1, type: "close" }));
  x.chrome({ close: true, fullscreen: true, fullscreenOn: false });
  assert.equal(x.elements.get("sj-fs").hidden, false);
  x.elements.get("sj-fs").dispatch("click");
  assert.equal(J(x.posts.at(-1)), J({ saintsProxy: 1, type: "fullscreen" }));
  x.chrome({ close: true, fullscreen: false });
  assert.equal(x.elements.get("sj-fs").hidden, true);
});

// ---- Tabs ----
const tabsOf = (x) => (x.elements.get("sj-tabs").items || []).map((t) => ({
  label: t.children[1].textContent, active: t.attrs["aria-selected"] === "true", el: t,
  close: () => t.children[2].dispatch("click"), open: () => t.dispatch("click"),
}));

test("tabs: starts with one saints://home tab", () => {
  const x = setup();
  const t = tabsOf(x);
  assert.equal(t.length, 1);
  assert.equal(t[0].label, "Saints Search");
  assert.equal(t[0].active, true);
});

test("tabs: + opens a new saints://home tab and keeps the other tab's page", async () => {
  const x = setup({ realUrls: true });
  await x.submit();
  await x.advance(4000);
  x.elements.get("sj-newtab").dispatch("click");
  let t = tabsOf(x);
  assert.equal(t.length, 2);
  assert.equal(t[1].active, true);
  assert.equal(t[1].label, "Saints Search");
  assert.equal(t[0].label, "example.com", "the first tab still shows its site");
  assert.equal(x.elements.get("sj-address").value, "saints://home");
  assert.equal(x.elements.get("sj-home").hidden, false);
  assert.equal(x.frames[0].style.display, "none", "the other tab's page is kept, just hidden");
  assert.equal(x.frames[0].removed, false);
  // Back to the first tab: its page and address come back.
  t[0].open();
  assert.equal(x.elements.get("sj-address").value, "https://example.com");
  assert.equal(x.elements.get("sj-view").hidden, false);
  assert.equal(x.frames[0].style.display, "");
});

test("tabs: each tab has its own history", async () => {
  const x = setup({ realUrls: true });
  await x.submit();                                   // tab 1: example.com
  await x.advance(4000);
  x.elements.get("sj-newtab").dispatch("click");
  x.elements.get("sj-address").value = "youtube.com"; // tab 2: youtube.com
  await x.submit();
  await x.advance(4000);
  assert.equal(x.frames.length, 2);
  assert.equal(tabsOf(x)[1].label, "youtube.com");
  // Back in tab 2 goes to its saints://home, not to tab 1's page.
  await x.elements.get("sj-back").dispatch("click");
  assert.equal(x.elements.get("sj-address").value, "saints://home");
  assert.equal(x.frames[1].removed, true);
  assert.equal(x.frames[0].removed, false);
  tabsOf(x)[0].open();
  assert.equal(x.elements.get("sj-address").value, "https://example.com");
});

test("tabs: closing the active tab shows its neighbour and frees its page", async () => {
  const x = setup({ realUrls: true });
  await x.submit();
  await x.advance(4000);
  x.elements.get("sj-newtab").dispatch("click");
  x.elements.get("sj-address").value = "youtube.com";
  await x.submit();
  await x.advance(4000);
  tabsOf(x)[1].close();
  const t = tabsOf(x);
  assert.equal(t.length, 1);
  assert.equal(t[0].active, true);
  assert.equal(x.frames[1].removed, true);
  assert.equal(x.elements.get("sj-address").value, "https://example.com");
});

test("tabs: closing a background tab leaves the current one alone", async () => {
  const x = setup({ realUrls: true });
  await x.submit();
  await x.advance(4000);
  x.elements.get("sj-newtab").dispatch("click");
  tabsOf(x)[0].close();
  const t = tabsOf(x);
  assert.equal(t.length, 1);
  assert.equal(t[0].label, "Saints Search");
  assert.equal(t[0].active, true);
  assert.equal(x.frames[0].removed, true);
  assert.equal(x.elements.get("sj-address").value, "saints://home");
});

test("tabs: closing the last tab goes back to saints://home instead", async () => {
  const x = setup();
  await x.submit();
  await x.advance(4000);
  tabsOf(x)[0].close();
  const t = tabsOf(x);
  assert.equal(t.length, 1);
  assert.equal(x.frames[0].removed, true);
  assert.equal(x.elements.get("sj-home").hidden, false);
  assert.equal(x.elements.get("sj-address").value, "saints://home");
  assert.equal(x.elements.get("sj-forward").disabled, true, "a closed tab can't be reopened with Forward");
});

test("tabs: at most 12", () => {
  const x = setup();
  for (let i = 0; i < 15; i++) x.elements.get("sj-newtab").dispatch("click");
  assert.equal(tabsOf(x).length, 12);
  assert.equal(x.elements.get("sj-newtab").disabled, true);
});

test("embedded: switching tabs tells the console which site is showing", async () => {
  const x = setup({ embed: true });
  const J = (m) => JSON.stringify(m);
  await x.submit();
  await x.advance(4000);
  x.elements.get("sj-newtab").dispatch("click");
  assert.equal(J(x.posts.at(-1)), J({ saintsProxy: 1, type: "nav", url: "" }));
  tabsOf(x)[0].open();
  assert.equal(J(x.posts.at(-1)), J({ saintsProxy: 1, type: "nav", url: "https://example.com/" }));
});

test("the Home button stays visible on phones", () => {
  const css = readFileSync(new URL("../public/index.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.sb-home-btn\s*\{[^}]*display:\s*none/);
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /<button[^>]*id="sj-home-btn"[^>]*aria-label="Home \(saints:\/\/home\)"/);
});
