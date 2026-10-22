// libcurl-transport 1.5.2 creates its HTTPSession before the libcurl WASM
// runtime has loaded. BareMux calls init() on the first proxied request, so
// slower engines (WebKit/Safari) failed that request with "wasm not loaded
// yet". Upstream fixed the ordering in 2.0.x, which isn't compatible with
// bare-mux 2 / Scramjet 1.1. Applied at build time so it works with any pnpm.
const ORIGINAL = `  async init() {
    if (this.transport)
      libcurl.transport = this.transport;
    libcurl.set_websocket(this.wisp);
    this.session = new libcurl.HTTPSession({
      proxy: this.proxy
    });
    if (this.connections)
      this.session.set_connections(...this.connections);
    this.ready = libcurl.ready;
    if (this.ready) {
      console.log("running libcurl.js v" + libcurl.version.lib);
      return;
    }
    ;
    await new Promise((resolve, reject) => {
      libcurl.onload = () => {
        console.log("loaded libcurl.js v" + libcurl.version.lib);
        this.ready = true;
        resolve(null);
      };
    });
  }`;

const FIXED = `  async init() {
    if (this.transport)
      libcurl.transport = this.transport;
    // HTTPSession throws "wasm not loaded yet" until the WASM runtime is ready.
    // Listen for the load event so concurrent init() calls all resolve.
    if (!libcurl.ready) {
      await new Promise((resolve, reject) => {
        libcurl.events.addEventListener("libcurl_load", () => resolve(null), { once: true });
        libcurl.events.addEventListener("libcurl_abort", (event) => reject(event.detail), { once: true });
      });
    }
    if (!this.session) {
      libcurl.set_websocket(this.wisp);
      this.session = new libcurl.HTTPSession({
        proxy: this.proxy
      });
      if (this.connections)
        this.session.set_connections(...this.connections);
    }
    this.ready = true;
    console.log("running libcurl.js v" + libcurl.version.lib);
  }`;

export function patchLibcurlTransport(source) {
  if (source.includes(FIXED)) return source;
  if (!source.includes(ORIGINAL)) {
    throw new Error("libcurl-transport's init() no longer matches; review scripts/patch-libcurl.mjs.");
  }
  return source.replace(ORIGINAL, FIXED);
}
