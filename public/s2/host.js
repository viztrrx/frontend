"use strict";

// Saints Search opens Spotify in a frame on this page (index.js): Spotify only
// works through Scramjet 2, which runs here, under /s2/, while the rest of
// Saints Search keeps Scramjet 1.1. engine2.js supplies the same controller
// and frame shapes index.js uses with Scramjet 1.1.
//
// The page's address says where to go: /s2/#url=<site>&transport=libcurl|epoxy.
// index.js reaches the open page through window.saintsS2 (same origin):
// frame() (the site's iframe), url() (its real address), go, back, forward,
// reload and onUrlChange. Navigation statuses go to index.js the way sw.js
// sends them for Scramjet 1.1, with this page's path.
(function () {
  const status = document.getElementById("s2-status");
  const params = new URLSearchParams(location.hash.slice(1));
  const startUrl = params.get("url") || "https://open.spotify.com/";
  const TRANSPORTS = {
    libcurl: { path: "/s2/libcurl/index.mjs", args: (wisp) => [{ websocket: wisp }] },
    epoxy: { path: "/s2/epoxy/index.mjs", args: (wisp) => [{ wisp }] },
  };
  const first = params.get("transport") === "epoxy" ? "epoxy" : "libcurl";
  const TRANSPORT_TIMEOUT_MS = 18000;

  // Saints Search embeds this page; opened on its own, it simply shows Spotify.
  const embedder = window.parent !== window ? window.parent : null;
  function tellEmbedder(data) {
    try {
      const container = embedder && embedder.navigator.serviceWorker;
      if (container) container.dispatchEvent(new embedder.MessageEvent("message", { data: { ...data, path: location.pathname } }));
    } catch {}
  }
  // engine2.js reports each navigation on this page's service worker container.
  navigator.serviceWorker?.addEventListener("message", (event) => {
    const data = event.data;
    if (data && data.type === "scramjet-navigation-status") tellEmbedder(data);
  });

  function showStatus(text) {
    status.textContent = text;
    status.hidden = !text;
  }

  function withTimeout(operation, ms, detail) {
    let timer;
    return Promise.race([
      Promise.resolve(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(detail)), ms); }),
    ]).finally(() => clearTimeout(timer));
  }

  // Sound plays like a normal tab even with an iPhone's ringer on silent (as index.js does).
  function playbackAudio(win) {
    try {
      const session = win && win.navigator && win.navigator.audioSession;
      if (session && session.type !== "playback") session.type = "playback";
    } catch {}
  }
  playbackAudio(window);

  let sj = null;
  const listeners = [];
  const ready = (async () => {
    const wisp = typeof _CONFIG === "object" && _CONFIG ? _CONFIG.wispUrl : "";
    if (!wisp) throw new Error("The Wisp backend URL is missing from config.js.");
    const { ScramjetController } = $scramjetLoadController();
    const controller = new ScramjetController();
    await controller.init();
    const connection = new BareMux.BareMuxConnection();
    let failure = null;
    for (const kind of [first, first === "libcurl" ? "epoxy" : "libcurl"]) {
      const transport = TRANSPORTS[kind];
      try {
        await withTimeout(connection.setTransport(transport.path, transport.args(wisp)), TRANSPORT_TIMEOUT_MS,
          "The " + kind + " transport didn't start within 18 seconds.");
        failure = null;
        break;
      } catch (cause) {
        failure = cause;
        console.warn("Scramjet 2: " + kind + " transport failed:", cause);
      }
    }
    if (failure) throw failure;

    sj = controller.createFrame();
    sj.frame.setAttribute("title", "Spotify");
    sj.frame.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
    const tell = (url) => { for (const fn of listeners) { try { fn(url); } catch {} } };
    sj.addEventListener("urlchange", (event) => tell(event.url));
    // Each page that finishes loading is told too, so index.js reads its title.
    sj.frame.addEventListener("load", () => {
      playbackAudio(sj.frame.contentWindow);
      if (sj.url) tell(sj.url);
    });
    sj.go(startUrl);
    document.body.appendChild(sj.frame);
    showStatus("");
  })();
  ready.catch((cause) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error("Scramjet 2 couldn't start:", cause);
    showStatus("Spotify couldn't start: " + message);
    tellEmbedder({ type: "scramjet-navigation-status", status: 0, message });
  });

  const later = (run) => { ready.then(run, () => {}); };
  window.saintsS2 = {
    ready,
    frame: () => (sj ? sj.frame : null),
    url: () => (sj ? sj.url : ""),
    go: (url) => later(() => sj.go(url)),
    back: () => later(() => sj.back()),
    forward: () => later(() => sj.forward()),
    reload: () => later(() => sj.reload()),
    onUrlChange: (fn) => { listeners.push(fn); },
  };
})();
