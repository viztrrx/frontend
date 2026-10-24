"use strict";

// Scramjet 2 for the beta build (SCRAMJET_ENGINE=2, see scripts/build.mjs).
//
// Scramjet 2 fetches and rewrites sites in this page (its controller) instead
// of the service worker, and talks to the Wisp backend through a transport
// object here instead of BareMux's SharedWorker. index.js was written for
// Scramjet 1.1 + BareMux, so this file gives it the same pieces it uses there:
//   $scramjetLoadController().ScramjetController  init(), createFrame(), decodeUrl()
//   a frame with .frame (the iframe), go/back/forward/reload and "urlchange"
//   BareMux.BareMuxConnection  getTransport()/setTransport(path, args)
//   BareMux.BareClient         fetch(url) through the transport
// and does in the page what sw.js does for Scramjet 1.1: refuses blocked sites
// (blocked.js) and reports each navigation's status to index.js.
(function () {
  const CONFIG = {
    prefix: "/~/sj/",
    scramjetPath: "/scram/scramjet.js",
    wasmPath: "/scram/scramjet.wasm",
    injectPath: "/controller/controller.inject.js",
  };
  // "/~/sj/<controller id>/<frame id>/<encoded URL>"
  const PROXIED = /^\/~\/sj\/[^/]+\/[^/]+\/(.+)$/;

  let controller = null;   // $scramjetController.Controller, made with the first transport
  let transport = null;
  let transportPath = "";
  let worker = null;

  function serviceWorker() {
    worker ??= (async () => {
      if (!navigator.serviceWorker) throw new Error("This browser can't run service workers.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        // First visit: the worker claims this page when it activates.
        await new Promise((resolve) => {
          navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
          setTimeout(resolve, 10000);
        });
      }
      const active = navigator.serviceWorker.controller || registration.active;
      if (!active) throw new Error("The proxy's service worker didn't start.");
      return active;
    })().catch((cause) => { worker = null; throw cause; });
    return worker;
  }

  async function setTransport(path, args) {
    const { default: Transport } = await import(path);
    const next = new Transport(...args);
    await next.init();
    if (controller) {
      controller.setTransport(next);
    } else {
      controller = new $scramjetController.Controller({
        serviceworker: await serviceWorker(),
        transport: next,
        config: CONFIG,
      });
      await controller.wait();
    }
    transport = next;
    transportPath = path;
  }

  function decodeUrl(href) {
    let u;
    try { u = new URL(href, location.href); } catch { return ""; }
    const m = u.origin === location.origin && PROXIED.exec(u.pathname);
    if (!m) return "";
    try {
      const real = new URL(decodeURIComponent(m[1]));
      // A hash the page sets later sits on the proxied address itself.
      if (u.hash && !real.hash) real.hash = u.hash;
      return real.href;
    } catch {
      return "";
    }
  }

  // index.js listens for these from sw.js under Scramjet 1.1.
  function reportNavigation(path, status, message) {
    navigator.serviceWorker?.dispatchEvent(new MessageEvent("message", {
      data: { type: "scramjet-navigation-status", path, status, message: message || "" },
    }));
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  // Pages written here go into frames of this cross-origin isolated page,
  // so they need COEP themselves.
  function ownPage(title, body, status) {
    const headers = new $scramjet.ScramjetHeaders();
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "no-store");
    headers.set("cross-origin-embedder-policy", "require-corp");
    headers.set("cross-origin-resource-policy", "same-origin");
    return {
      body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(title) + "</title>" +
        '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#131313;color:#e6e6e6;font:min(16px,4.2vw)/1.5 -apple-system,system-ui,sans-serif;text-align:center;padding:16px;box-sizing:border-box">' +
        '<div style="max-width:440px">' + body + "</div></body>",
      headers,
      status,
      statusText: status === 403 ? "Forbidden" : "Bad Gateway",
    };
  }

  const plugin = new $scramjet.Plugin("saints");
  function watchFrame(inner) {
    // Blocked sites (blocked.js): pages, pop-ups, frames and requests alike.
    plugin.tap(inner.hooks.fetch.intercept, (context, props) => {
      const site = context.parsed.url.href;
      const block = self.saintsBlock ? self.saintsBlock.check(site) : null;
      if (!block) return;
      if (context.request.mode === "navigate") reportNavigation(context.request.rawUrl.pathname, 403, block.title);
      props.response = ownPage(block.title,
        '<h1 style="font-size:1.35em;margin:0 0 10px">' + escapeHtml(block.title) + '</h1><p style="margin:0 0 8px">' +
        escapeHtml(block.message) + '</p><p style="margin:0;color:#9c9c9c;font-size:.8em">' + escapeHtml(context.parsed.url.hostname) + "</p>", 403);
    });
    plugin.tap(inner.hooks.fetch.response, (context, props) => {
      if (context.request.mode === "navigate") reportNavigation(context.request.rawUrl.pathname, props.response.status, "");
    });
    // The site couldn't be reached: index.js retries with the other transport,
    // then shows the message.
    plugin.tap(inner.hooks.error.request, (context, props) => {
      const request = context.rawrequest || {};
      if (request.mode !== "navigate") return;
      const message = context.error instanceof Error ? context.error.message : String(context.error);
      let path = "";
      try { path = new URL(request.rawUrl).pathname; } catch {}
      reportNavigation(path, 0, message);
      const page = ownPage("Website failed to load",
        '<h1 style="font-size:1.35em;margin:0 0 10px">Website failed to load</h1><p style="margin:0;word-break:break-word">' + escapeHtml(message) + "</p>", 502);
      props.setResponse = { body: page.body, status: page.status, statusText: page.statusText, headers: page.headers.toRawHeaders() };
    });
  }

  // What index.js gets from createFrame(): Scramjet 1.1's ScramjetFrame shape.
  class SaintsFrame extends EventTarget {
    constructor(inner) {
      super();
      this.inner = inner;
      this.frame = inner.element;
      this.url = "";
      // Scramjet 2 has no "urlchange" event: follow the frame's address,
      // including history.pushState changes, while the frame exists.
      let attached = false;
      const check = () => {
        if (this.frame.isConnected) attached = true;
        else if (attached) { clearInterval(timer); return; }
        let href = "";
        try { href = this.frame.contentWindow?.location?.href || ""; } catch {}
        const real = decodeUrl(href);
        if (real && real !== this.url) {
          this.url = real;
          const event = new Event("urlchange");
          event.url = real;
          this.dispatchEvent(event);
        }
      };
      const timer = setInterval(check, 300);
      this.frame.addEventListener("load", check);
    }
    go(url) { this.inner.go(url); }
    back() { this.inner.back(); }
    forward() { this.inner.forward(); }
    reload() { this.inner.reload(); }
  }

  class ScramjetController {
    constructor() {}
    async init() { await serviceWorker(); }
    createFrame() {
      if (!controller) throw new Error("The proxy isn't connected yet.");
      const inner = controller.createFrame();
      watchFrame(inner);
      return new SaintsFrame(inner);
    }
    decodeUrl(href) { return decodeUrl(href); }
  }

  self.$scramjetLoadController = () => ({ ScramjetController });
  self.BareMux = {
    BareMuxConnection: class {
      async getTransport() { return transportPath; }
      async setTransport(path, args) { await setTransport(path, args); }
    },
    BareClient: class {
      async fetch(url) {
        if (!transport) throw new Error("The proxy isn't connected yet.");
        return transport.request(new URL(url), "GET", null, [], undefined);
      }
    },
  };
  self.saintsEngine = { version: 2, decodeUrl };
})();
