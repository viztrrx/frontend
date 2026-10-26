import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/index.js", import.meta.url), "utf8");
const blockSource = readFileSync(new URL("../public/blocked.js", import.meta.url), "utf8");
const spotifySource = readFileSync(new URL("../public/spotify.js", import.meta.url), "utf8");

function setup({ games = null, epoxyFails = false, libcurlFails = false, wispUrl = "wss://backend-rust-qr67.onrender.com/wisp/", socketFails = false, controllerFails = false, workerHang = false, transportHang = false, blankFrame = false, noLoad = false, storage = {}, versionFetch, embed = false, realUrls = false, engine = 1 } = {}) {
  const posts = [];
  const winMessage = { fns: [], fn: (event) => winMessage.fns.forEach((f) => f(event)) };
  const elements = new Map();
  const frames = [];
  const made = [];   // every frame Scramjet created, attached or not
  const windowAudio = { type: "auto" };
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
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      style: {},
      remove() { this.removed = true; },
    };
    elements.set(id, element);
    return element;
  };
  for (const id of ["sj-form", "sj-address", "sj-search-engine", "sj-error", "sj-error-code", "sj-progress", "sj-toolbar", "sj-toolbar-status", "sj-loading", "sj-loading-status", "sj-home-btn", "sj-reload", "sj-back", "sj-forward", "sj-show-page", "sj-version", "sj-home", "sj-view", "sj-home-form", "sj-home-q", "sj-omni-ic", "sj-fs", "sj-exit", "sj-tabs", "sj-newtab", "sj-block", "sj-block-title", "sj-block-msg", "sj-block-site", "sj-block-home", "sj-block-console", "sj-games", "sj-games-grid", "sj-games-q", "sj-games-status", "sj-games-count", "sj-games-open", "sj-games-form", "sj-alt-search"]) makeElement(id);
  elements.get("sj-alt-search").hidden = true;
  elements.get("sj-games").hidden = true;
  elements.get("sj-games-grid").replaceChildren = function (...items) { this.items = items; this.children = items; };
  elements.get("sj-games-grid").querySelector = function () { return (this.items || [])[0] || null; };
  for (const id of ["sj-block", "sj-block-console"]) elements.get(id).hidden = true;
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
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        // Every listener runs, as in a browser (a Spotify frame has two for "load").
        addEventListener(kind, fn) { callbacks.set(kind, [...(callbacks.get(kind) || []), fn]); },
        dispatch(kind, event = {}) { for (const fn of callbacks.get(kind) || []) fn({ preventDefault() {}, stopPropagation() {}, ...event }); },
        append(...nodes) { this.children.push(...nodes); },
        appendChild(n) { this.children.push(n); },
        remove() { this.removed = true; },
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
      el.contentWindow = { navigator: { audioSession: { type: "auto" } }, location: { href: blankFrame ? "about:blank" : "https://frontend.viztrrx.workers.dev/scramjet/test" } };
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
      if (epoxyFails && args[0] === "/epoxy/index.mjs") throw new Error("Importing a module script failed.");
      if (libcurlFails && args[0] === "/libcurl/index.mjs") throw new Error("Importing a module script failed.");
      transports.push(args);
    }
    async getTransport() {
      if (workerHang) return new Promise(() => {});
      return transports.length ? transports.at(-1)[0] : "";
    }
  }
  const ctx = {
    document,
    window: { navigator: { audioSession: windowAudio }, BareMux: { BareMuxConnection }, addEventListener: (kind, fn) => { if (kind === 'message') winMessage.fns.push(fn); if (kind === 'load') winMessage.load = fn; }, ...(embed ? { parent: { postMessage: (message) => posts.push(message) } } : {}) },
    navigator: { serviceWorker: {
      ready: Promise.resolve(),
      addEventListener(kind, fn) { swCallbacks.set(kind, fn); }
    } },
    _CONFIG: { wispUrl },
    $scramjetLoadController: () => ({ ScramjetController }),
    registerSW: async () => {},
    search: (value) => "https://" + value,
    URL,
    URLSearchParams,
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
    ...(versionFetch || games ? { fetch: async (url, options) => {
      if (games && String(url) === "/games/games.json") return new Response(JSON.stringify(games));
      if (versionFetch) return versionFetch(url, options);
      return new Response("", { status: 404 });
    } } : {}),
    console,
    setTimeout(fn, milliseconds) {
      const id = ++timerId;
      if (milliseconds === 2500) queueMicrotask(fn);
      else timers.set(id, { fn, milliseconds });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  // The Scramjet 2 beta build's engine2.js says so; production has no saintsEngine.
  if (engine === 2) ctx.saintsEngine = { version: 2 };
  runInNewContext(blockSource, ctx, { filename: "public/blocked.js" });
  runInNewContext(spotifySource, ctx, { filename: "public/spotify.js" });
  runInNewContext(source, ctx, { filename: "public/index.js" });
  const initialAddress = elements.get("sj-address").value;
  elements.get("sj-address").value = "example.com";   // what the tests type
  return {
    initialAddress,
    elements, frames, transports, timers, assigned, storage, posts, windowAudio,
    load: () => winMessage.load?.(),
    message: (event) => winMessage.fn(event),
    navigate: (query) => winMessage.fn?.({ source: ctx.window.parent, data: { saintsProxy: 1, type: "navigate", query } }),
    chrome: (opts) => winMessage.fn?.({ source: ctx.window.parent, data: { saintsProxy: 1, type: "chrome", ...opts } }),
    websocketCount: () => websocketCount,
    submit: () => elements.get("sj-form").dispatch("submit"),
    sendNavStatusFor(path, status, message = "") {
      swCallbacks.get("message")?.({ data: { type: "scramjet-navigation-status", path, status, message } });
    },
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
  assert.equal(x.transports[0][0], "/libcurl/index.mjs", "libcurl, proven on iPhone");
  assert.equal(x.transports[0][1][0].websocket, "wss://backend-rust-qr67.onrender.com/wisp/");
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
  assert.match(x.elements.get("sj-error-code").textContent, /Cannot connect to wss:\/\/backend-rust-qr67/);
});

test("controller initialization failure is shown without masking the page", async () => {
  const x = setup({ controllerFails: true });
  await x.submit();
  assert.equal(x.frames.length, 0);
  assert.match(x.elements.get("sj-error-code").textContent, /Wasm init failed/);
});

test("a connection failure retries once with the other transport, then Reload reconnects", async () => {
  const x = setup();
  await x.submit();
  x.sendNavStatus(0, "Upstream service unavailable");
  await new Promise((resolve) => setImmediate(resolve));
  // Retried by itself with Epoxy.
  assert.equal(x.transports.length, 2);
  assert.equal(x.transports[1][0], "/epoxy/index.mjs");
  assert.equal(x.transports[1][1][0].wisp, "wss://backend-rust-qr67.onrender.com/wisp/");
  assert.equal(x.frames.length, 2);
  assert.equal(x.frames[0].removed, true);
  // The retry fails too: the failure is shown, no endless retrying.
  x.sendNavStatus(0, "Upstream service unavailable");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(x.frames.length, 2);
  assert.equal(x.elements.get("sj-toolbar-status").textContent, "Website request failed");
  // Reload reconnects from scratch.
  await x.elements.get("sj-reload").dispatch("click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(x.transports.length, 3);
  assert.equal(x.frames.length, 3);
});

test("Epoxy's \"tls handshake eof\" proxy error retries with the other transport", async () => {
  const x = setup();
  await x.submit();
  x.sendNavStatus(500, "Hyper client: hyper_util::client::legacy::Error(Connect, Io(Custom { kind: UnexpectedEof, error: \"tls handshake eof\" }))");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(x.transports.length, 2);
  assert.equal(x.frames.length, 2);
});

test("a site's own error page (HTTP 500 without a connection error) isn't retried", async () => {
  const x = setup();
  await x.submit();
  x.sendNavStatus(500, "");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(x.frames.length, 1);
  assert.equal(x.transports.length, 1);
});

test("after a redirect, the page it leads to is watched", async () => {
  const x = setup();
  await x.submit();
  x.sendNavStatus(301);
  assert.equal(x.elements.get("sj-toolbar-status").textContent, "Website responded (HTTP 301)");
  // The redirected page (another address) reports its own status.
  x.sendNavStatusFor("/scramjet/" + encodeURIComponent("https://paper-io.com/en/"), 404);
  assert.match(x.elements.get("sj-toolbar-status").textContent, /404/);
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

test("transport setup timeout names the transport rather than hiding the whole page", async () => {
  const x = setup({ transportHang: true });
  const pending = x.submit();
  await x.advance(18000);   // libcurl times out; Epoxy is tried next
  await x.advance(18000);
  await pending;
  assert.equal(x.frames.length, 0);
  assert.match(x.elements.get("sj-error-code").textContent, /epoxy transport did not initialize/);
  assert.equal(x.elements.get("sj-progress").hidden, true);
});

test("blank about:blank iframe never counts as website loaded", async () => {
  const x = setup({ blankFrame: true });
  await x.submit();
  assert.equal(x.elements.get("sj-loading").hidden, false);
  await x.advance(35000);   // the one retry with the other transport
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
  await x.advance(0);   // the one automatic retry
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
const tabsOf = (x) => (x.elements.get("sj-tabs").items || []).filter((t) => t.dataset && t.dataset.tab).map((t) => ({
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

test("typing an AI site shows the notice instead of the site", async () => {
  const x = setup({ embed: true });
  x.elements.get("sj-address").value = "gemini.google.com/app";
  await x.submit();
  await x.advance(4000);
  assert.equal(x.frames.length, 0, "no page is loaded");
  assert.equal(x.websocketCount(), 0, "the backend isn't even contacted");
  assert.equal(x.elements.get("sj-block").hidden, false);
  assert.equal(x.elements.get("sj-view").hidden, false);
  assert.equal(x.elements.get("sj-block-site").textContent, "gemini.google.com");
  assert.equal(x.elements.get("sj-block-title").textContent, "AI isn\u2019t allowed here");
  assert.match(x.elements.get("sj-block-msg").textContent, /unsafe and inaccurate/);
  assert.equal(x.elements.get("sj-address").value, "https://gemini.google.com/app", "the bar shows the blocked address");
  assert.equal(x.elements.get("sj-block-console").hidden, false, "in the console: Use Saints Service AI");
  x.elements.get("sj-block-console").dispatch("click");
  assert.equal(x.posts.at(-1).type, "open-ai");
  x.elements.get("sj-block-home").dispatch("click");
  assert.equal(x.elements.get("sj-block").hidden, true);
  assert.equal(x.elements.get("sj-address").value, "saints://home");
});

test("a page that leads to an AI site is replaced by the notice", async () => {
  const x = setup({ realUrls: true });
  await x.submit();
  await x.advance(4000);
  const frame = x.frames[0];
  // A link or redirect inside the page lands on ChatGPT.
  frame.url = "https://chatgpt.com/";
  frame.contentWindow.location.href = "https://frontend.viztrrx.workers.dev/scramjet/" + encodeURIComponent(frame.url);
  frame.dispatch("load");
  assert.equal(frame.removed, true, "the AI page is gone, so it can't be used");
  assert.equal(x.elements.get("sj-block").hidden, false);
  assert.equal(x.elements.get("sj-address").value, "https://chatgpt.com/");
});

test("searching for an AI by name still searches", async () => {
  const x = setup();
  x.elements.get("sj-address").value = "www.google.com/search?q=chatgpt";
  await x.submit();
  await x.advance(4000);
  assert.equal(x.frames.length, 1);
  assert.equal(x.elements.get("sj-block").hidden, true);
});

test("Continue with Google on a site just goes to Google (no notice)", async () => {
  const x = setup({ realUrls: true, embed: true });
  x.elements.get("sj-address").value = "www.example.com/login";
  await x.submit();
  await x.advance(4000);
  const frame = x.frames[0];
  frame.url = "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=x";
  frame.contentWindow.location.href = "https://frontend.viztrrx.workers.dev/scramjet/" + encodeURIComponent(frame.url);
  frame.dispatch("load");
  assert.equal(x.elements.get("sj-block").hidden, true);
  assert.equal(frame.removed, false);
  assert.match(x.elements.get("sj-address").value, /^https:\/\/accounts\.google\.com\//);
});

test("opening another site reuses the live connection instead of reconnecting", async () => {
  const x = setup();
  await x.submit();
  await x.advance(4000);
  x.elements.get("sj-home-btn").dispatch("click");
  x.elements.get("sj-address").value = "youtube.com";
  await x.submit();
  await x.advance(4000);
  assert.equal(x.websocketCount(), 1, "no second backend probe");
  assert.equal(x.transports.length, 1, "the transport isn't rebuilt");
  assert.equal(x.frames.at(-1).url, "https://youtube.com");
});

test("the connection warms up as soon as the page loads", async () => {
  const x = setup();
  x.load();
  await x.advance(0);
  assert.equal(x.websocketCount(), 1, "the backend is woken before anything is opened");
  assert.equal(x.transports.length, 1);
  assert.equal(x.frames.length, 0, "nothing opens by itself");
  await x.submit();
  await x.advance(4000);
  assert.equal(x.websocketCount(), 1, "the first site uses the warmed-up connection");
  assert.equal(x.transports.length, 1);
  assert.equal(x.frames.length, 1);
});

test("a browser that can't set up a transport switches to the other at once and keeps it", async () => {
  const x = setup({ libcurlFails: true });
  await x.submit();
  await x.advance(4000);
  assert.equal(x.frames.length, 1, "the site still opens");
  assert.equal(x.elements.get("sj-error").textContent, "");
  assert.deepEqual(x.transports.map((t) => t[0]), ["/epoxy/index.mjs"]);
  assert.equal(x.storage["sj-transport"], "epoxy", "remembered on this device");
  const again = setup({ libcurlFails: true, storage: { "sj-transport": "epoxy" } });
  await again.submit();
  await again.advance(4000);
  assert.deepEqual(again.transports.map((t) => t[0]), ["/epoxy/index.mjs"]);
  // And the other way round: a remembered Epoxy that fails goes back to libcurl.
  const back = setup({ epoxyFails: true, storage: { "sj-transport": "epoxy" } });
  await back.submit();
  await back.advance(4000);
  assert.deepEqual(back.transports.map((t) => t[0]), ["/libcurl/index.mjs"]);
  assert.equal(back.storage["sj-transport"], "libcurl");
});

test("opening a site during the warm-up shows the setup steps", async () => {
  const x = setup({ transportHang: true });
  x.load();
  await x.advance(0);
  const pending = x.submit();
  await x.advance(0);
  assert.equal(x.elements.get("sj-loading-status").textContent, "Configuring browser transport…");
  await x.advance(18000);
  await x.advance(18000);
  await pending;
});

test("sound: the frame may autoplay, and pages ask iPhone Safari for playback audio", async () => {
  const x = setup();
  assert.equal(x.windowAudio.type, "playback", "Saints Search itself");
  await x.submit();
  await x.advance(4000);
  const frame = x.frames[0];
  assert.match(frame.attrs.allow, /autoplay/);
  assert.match(frame.attrs.allow, /fullscreen/);
  assert.equal(frame.contentWindow.navigator.audioSession.type, "playback", "the site in the frame");
});

const GAMES = [
  { slug: "2048", title: "2048", image: "/games/thumbnails/2048.jpg", path: "/games/public/2048/" },
  { slug: "1v1-lol", title: "1v1.LOL", image: "/games/thumbnails/1v1-lol.jpg", url: "https://1v1.lol/" },
  { slug: "slope", title: "Slope", image: "/games/thumbnails/slope.jpg", path: "/games/public/slope/" },
];
const tiles = (x) => x.elements.get("sj-games-grid").items || [];
const tileFor = (x, slug) => tiles(x).find((t) => t.dataset.slug === slug);

test("games: the Games button opens saints://games with every game", async () => {
  const x = setup({ games: GAMES });
  x.elements.get("sj-games-open").dispatch("click");
  await x.advance(0);
  assert.equal(x.elements.get("sj-games").hidden, false);
  assert.equal(x.elements.get("sj-home").hidden, true);
  assert.equal(x.elements.get("sj-address").value, "saints://games");
  assert.equal(tiles(x).length, 3);
  assert.equal(x.elements.get("sj-tabs").items[0].title, "Games");
  // Searching narrows the list.
  x.elements.get("sj-games-q").value = "slo";
  x.elements.get("sj-games-q").dispatch("input");
  assert.deepEqual(tiles(x).map((t) => t.dataset.slug), ["slope"]);
});

test("games: a game plays in the page area, and Back returns to saints://games", async () => {
  const x = setup({ games: GAMES });
  x.elements.get("sj-games-open").dispatch("click");
  await x.advance(0);
  tileFor(x, "2048").dispatch("click");
  const frame = x.frames.at(-1);
  assert.equal(frame.src, "/games/public/2048/");
  assert.match(frame.attrs.allow, /autoplay/);
  assert.equal(x.websocketCount(), 0, "games don't need the proxy backend");
  assert.equal(x.elements.get("sj-view").hidden, false);
  assert.equal(x.elements.get("sj-address").value, "saints://games/2048");
  assert.equal(x.elements.get("sj-tabs").items[0].title, "2048");
  assert.equal(x.elements.get("sj-back").disabled, false);
  // Reload restarts the game.
  frame.src = "about:blank";
  x.elements.get("sj-reload").dispatch("click");
  assert.equal(frame.src, "/games/public/2048/");
  x.elements.get("sj-back").dispatch("click");
  assert.equal(x.elements.get("sj-view").hidden, true, "the game is closed");
  assert.equal(x.elements.get("sj-games").hidden, false);
  assert.equal(x.elements.get("sj-address").value, "saints://games");
  // Home goes to saints://home.
  x.elements.get("sj-home-btn").dispatch("click");
  assert.equal(x.elements.get("sj-home").hidden, false);
  assert.equal(x.elements.get("sj-games").hidden, true);
  assert.equal(x.elements.get("sj-address").value, "saints://home");
});

test("games: online games open their real site through the proxy", async () => {
  const x = setup({ games: GAMES });
  x.elements.get("sj-games-open").dispatch("click");
  await x.advance(0);
  tileFor(x, "1v1-lol").dispatch("click");
  await x.advance(4000);
  assert.equal(x.transports.length, 1);
  assert.equal(x.frames.at(-1).url, "https://1v1.lol/");
});

test("games: typing saints://games/<slug> opens that game", async () => {
  const x = setup({ games: GAMES });
  x.elements.get("sj-address").value = "saints://games/slope";
  await x.submit();
  await x.advance(0);
  assert.equal(x.frames.at(-1).src, "/games/public/slope/");
  assert.equal(x.elements.get("sj-address").value, "saints://games/slope");
  x.elements.get("sj-address").value = "saints://games";
  await x.submit();
  assert.equal(x.elements.get("sj-games").hidden, false);
});

test("a site that never answers gets one retry with the other transport", async () => {
  const x = setup({ blankFrame: true });
  await x.submit();
  await x.advance(35000);
  assert.equal(x.transports.length, 2, "retried with the other transport");
  assert.equal(x.transports[1][0], "/epoxy/index.mjs");
  await x.advance(35000);
  assert.equal(x.transports.length, 2, "only once");
  assert.match(x.elements.get("sj-loading-status").textContent, /No completed proxied webpage/);
});

test("games: Eaglercraft launches the Saints Worker's game frame like the console", async () => {
  const eagler = { slug: "eaglercraft", title: "Eaglercraft", image: "/games/thumbnails/eaglercraft.svg", frame: "https://donnajbe.viztrrx.workers.dev/eagler/?autoPack=1" };
  const x = setup({ games: [...GAMES, eagler] });
  x.elements.get("sj-games-open").dispatch("click");
  await x.advance(0);
  tileFor(x, "eaglercraft").dispatch("click");
  const frame = x.frames.at(-1);
  assert.equal(frame.src, eagler.frame);
  assert.equal(frame.attrs.allow, "fullscreen; autoplay; gamepad; clipboard-read; clipboard-write");
  assert.equal(frame.attrs.referrerpolicy, "no-referrer");
  assert.equal(x.websocketCount(), 0, "no proxy needed");
  assert.equal(x.elements.get("sj-loading").hidden, false);
  assert.equal(x.elements.get("sj-loading-status").textContent, "Starting Eaglercraft\u2026");
  assert.equal(x.elements.get("sj-address").value, "saints://games/eaglercraft");
  const posted = [];
  frame.contentWindow = { postMessage: (m, origin) => posted.push([m.type, origin]) };
  const origin = "https://donnajbe.viztrrx.workers.dev";
  // Messages from anywhere else are ignored.
  x.message({ source: frame.contentWindow, origin: "https://evil.example", data: { eagler: 1, type: "started" } });
  assert.equal(x.elements.get("sj-loading").hidden, false);
  x.message({ source: frame.contentWindow, origin, data: { eagler: 1, type: "loading" } });
  assert.match(x.elements.get("sj-loading-status").textContent, /through the Saints Worker/);
  x.message({ source: frame.contentWindow, origin, data: { eagler: 1, type: "started" } });
  assert.equal(x.elements.get("sj-loading").hidden, true, "the game is showing");
  assert.deepEqual(posted, [["focus", origin]]);
  // The game's own errors are shown in plain words.
  x.message({ source: frame.contentWindow, origin, data: { eagler: 1, type: "error", message: "WebGL 2.0 isn't available." } });
  assert.equal(x.elements.get("sj-loading").hidden, false);
  assert.equal(x.elements.get("sj-loading-status").textContent, "WebGL 2.0 isn't available.");
});

test("games: in the console, a game takes the keyboard and the console is told while it shows", async () => {
  const x = setup({ games: GAMES, embed: true });
  x.elements.get("sj-games-open").dispatch("click");
  await x.advance(0);
  tileFor(x, "2048").dispatch("click");
  const games = () => x.posts.filter((p) => p.type === "game").map((p) => p.playing);
  assert.deepEqual(games(), [true], "the console keeps Esc for the game");
  const frame = x.frames.at(-1);
  let focused = 0;
  frame.focus = () => { focused++; };
  frame.contentWindow = {};
  frame.dispatch("load");
  assert.equal(focused, 1, "the game frame has the keyboard once it loads");
  assert.ok(x.posts.some((p) => p.type === "focus"), "the console focuses Saints Search's frame");
  x.elements.get("sj-back").dispatch("click");
  assert.deepEqual(games(), [true, false], "and lets Esc go when the game closes");
  // Not a game: nothing sent.
  x.elements.get("sj-home-btn").dispatch("click");
  assert.deepEqual(games(), [true, false]);
});

test("a blank Google results page offers the same search on DuckDuckGo", async () => {
  const x = setup({ realUrls: true });
  x.elements.get("sj-address").value = "www.google.com/search?q=tiktok";
  await x.submit();
  const frame = x.frames[0];
  // Google's page loaded but shows nothing (held back from the proxy).
  frame.contentDocument.body.innerText = "";
  frame.contentDocument.body.querySelector = () => ({});   // invisible scripts/svgs count as "content"
  frame.dispatch("load");
  await x.advance(6000);
  const alt = x.elements.get("sj-alt-search");
  assert.equal(alt.hidden, false);
  assert.equal(x.elements.get("sj-loading").hidden, false);
  assert.match(x.elements.get("sj-loading-status").textContent, /Google didn\u2019t show results/);
  alt.dispatch("click");
  assert.equal(frame.url, "https://duckduckgo.com/?q=tiktok");
  assert.equal(alt.hidden, true);
});

test("Google results that do show aren't interrupted", async () => {
  const x = setup({ realUrls: true });
  x.elements.get("sj-address").value = "www.google.com/search?q=cats";
  await x.submit();
  x.frames[0].contentDocument.body.innerText = "About 1,000,000 results. Cats are small domesticated carnivorous mammals...";
  x.frames[0].dispatch("load");
  await x.advance(6000);
  assert.equal(x.elements.get("sj-alt-search").hidden, true);
  assert.equal(x.elements.get("sj-loading").hidden, true);
});

test("Google stays the default search engine", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /<option value="https:\/\/www\.google\.com\/search\?q=%s">Google<\/option>/);
  assert.doesNotMatch(html, /selected>/);
});

test("tabs: the + button comes right after the last tab", async () => {
  const x = setup();
  const items = () => x.elements.get("sj-tabs").items;
  assert.equal(items().at(-1), x.elements.get("sj-newtab"));
  x.elements.get("sj-newtab").dispatch("click");
  assert.equal(items().length, 3, "two tabs, then +");
  assert.equal(items().at(-1), x.elements.get("sj-newtab"));
});

// ---- Spotify on Scramjet 2 (public/s2/) ---------------------------------------
// The /s2/ page's window.saintsS2 (host.js), on a frame index.js made for Spotify.
function hostSpotify(frame, { url = "https://open.spotify.com/", text = "Spotify – Web Player", title = "Spotify" } = {}) {
  const inner = { contentDocument: { URL: "x", title, body: { innerText: text, querySelector: () => null } } };
  const calls = [];
  let onUrl = null;
  const host = {
    url: () => host.at,
    at: "",
    frame: () => inner,
    go: (u) => calls.push(["go", u]),
    back: () => calls.push(["back"]),
    forward: () => calls.push(["forward"]),
    reload: () => calls.push(["reload"]),
    onUrlChange: (fn) => { onUrl = fn; },
  };
  frame.contentWindow = { saintsS2: host, navigator: {}, location: { href: "https://frontend.viztrrx.workers.dev/s2/" } };
  frame.dispatch("load");
  return { host, inner, calls, land(u) { host.at = u; onUrl?.(u); } };
}

test("spotify.js: Spotify's domains, and nothing that only looks like them", () => {
  const ctx = { URL };
  runInNewContext(spotifySource, ctx);
  const { isSpotify } = ctx.saintsSpotify;
  for (const url of ["https://open.spotify.com/", "https://accounts.spotify.com/login", "https://www.spotify.com/us/", "https://spotify.com",
    "https://spotify.link/abc", "https://spoti.fi/x", "https://spotify.app.link/x", "https://i.scdn.co/image/1", "https://OPEN.SPOTIFY.COM./track/1"]) {
    assert.equal(isSpotify(url), true, url);
  }
  for (const url of ["https://example.com/", "https://notspotify.com/", "https://spotify.com.evil.example/", "https://example.com/?q=spotify.com",
    "https://www.google.com/search?q=spotify", "not a url", ""]) {
    assert.equal(isSpotify(url), false, url);
  }
});

test("Spotify opens with Scramjet 2 at /s2/, without Scramjet 1.1's transport", async () => {
  const x = setup();
  x.elements.get("sj-address").value = "open.spotify.com";
  await x.submit();
  assert.equal(x.elements.get("sj-error-code").textContent, "");
  assert.equal(x.frames.length, 1);
  const frame = x.frames[0];
  assert.equal(frame.dataset.engine, "2");
  const src = new URL(frame.attrs.src, "https://frontend.viztrrx.workers.dev/");
  assert.equal(src.pathname, "/s2/");
  const params = new URLSearchParams(src.hash.slice(1));
  assert.equal(params.get("url"), "https://open.spotify.com");
  assert.equal(params.get("transport"), "libcurl");
  assert.equal(x.transports.length, 0, "Scramjet 1.1's BareMux transport isn't set up for Spotify");
  assert.equal(x.websocketCount(), 1, "the backend is still woken first");

  const s = hostSpotify(frame);
  s.land("https://open.spotify.com/");
  await x.advance(4000);
  assert.equal(x.elements.get("sj-address").value, "https://open.spotify.com/");
  assert.equal(x.elements.get("sj-loading").hidden, true, "Spotify's own page counts as content");
  assert.equal(x.elements.get("sj-tabs").items[0].title, "Spotify", "the tab takes Spotify's title");

  // Inside Spotify, links and the address bar stay on Scramjet 2 in the same frame.
  x.elements.get("sj-address").value = "open.spotify.com/search";
  await x.submit();
  assert.deepEqual(s.calls.at(-1), ["go", "https://open.spotify.com/search"]);
  assert.equal(x.frames.length, 1);
  s.land("https://open.spotify.com/search");
  await x.elements.get("sj-back").dispatch("click");
  assert.deepEqual(s.calls.at(-1), ["back"]);
  await x.elements.get("sj-reload").dispatch("click");
  assert.deepEqual(s.calls.at(-1), ["reload"]);
});

test("leaving Spotify for another site goes back to Scramjet 1.1", async () => {
  const x = setup({ realUrls: true });
  x.elements.get("sj-address").value = "open.spotify.com";
  await x.submit();
  const spotify = x.frames[0];
  hostSpotify(spotify).land("https://open.spotify.com/");
  x.elements.get("sj-address").value = "example.com";
  await x.submit();
  await x.advance(4000);
  assert.equal(spotify.removed, true, "Spotify's Scramjet 2 page is closed");
  assert.equal(x.frames.length, 2);
  assert.equal(x.frames[1].dataset?.engine, undefined);
  assert.equal(x.frames[1].url, "https://example.com");
  assert.equal(x.transports[0][0], "/libcurl/index.mjs", "Scramjet 1.1 connects through BareMux as before");
});

test("a Scramjet 1.1 page that goes to Spotify reopens it on Scramjet 2", async () => {
  const x = setup({ realUrls: true });
  await x.submit();
  await x.advance(4000);
  const frame = x.frames[0];
  // A link in a search result leads to Spotify.
  frame.url = "https://open.spotify.com/track/1";
  frame.contentWindow.location.href = "https://frontend.viztrrx.workers.dev/scramjet/" + encodeURIComponent(frame.url);
  frame.dispatch("load");
  await x.advance(4000);
  assert.equal(frame.removed, true);
  const spotify = x.frames.at(-1);
  assert.equal(spotify.dataset.engine, "2");
  assert.equal(new URLSearchParams(new URL(spotify.attrs.src, "https://f/").hash.slice(1)).get("url"), "https://open.spotify.com/track/1");
});

test("Spotify failing to connect retries once with the other transport", async () => {
  const x = setup();
  x.elements.get("sj-address").value = "open.spotify.com";
  await x.submit();
  x.sendNavStatusFor("/s2/", 0, "hyper client error");
  await x.advance(4000);
  const retry = x.frames.at(-1);
  assert.notEqual(retry, x.frames[0]);
  assert.equal(retry.dataset.engine, "2");
  assert.equal(new URLSearchParams(new URL(retry.attrs.src, "https://f/").hash.slice(1)).get("transport"), "epoxy");
});

test("the Scramjet 2 beta build keeps Spotify in its own frames", async () => {
  const x = setup({ engine: 2 });
  x.elements.get("sj-address").value = "open.spotify.com";
  await x.submit();
  assert.equal(x.frames[0].dataset?.engine, undefined);
  assert.equal(x.frames[0].url, "https://open.spotify.com");
});

test("games: an online game takes the keyboard once its page loads", async () => {
  const games = [{ slug: "paper-io", title: "Paper.io", url: "https://paperio.site/" }];
  const x = setup({ games });
  x.elements.get("sj-address").value = "saints://games/paper-io";
  await x.submit();
  await x.advance(4000);
  const frame = x.frames.at(-1);
  let focused = false;
  frame.focus = () => { focused = true; };
  frame.dispatch("load");
  assert.equal(focused, true, "WASD and arrows go to the game without a click first");
});
