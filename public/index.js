"use strict";

// Report backend and frame failures instead of covering the screen with a black iframe.
const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");
const progress = document.getElementById("sj-progress");
const toolbar = document.getElementById("sj-toolbar");
const toolbarStatus = document.getElementById("sj-toolbar-status");
const loading = document.getElementById("sj-loading");
const loadingStatus = document.getElementById("sj-loading-status");
const closeButton = document.getElementById("sj-close");
const reloadButton = document.getElementById("sj-reload");

const TRANSPORT = "/libcurl/index.mjs";
const WISP_TIMEOUT_MS = 25000;
const BAREMUX_RESPONSE_TIMEOUT_MS = 8000;
const TRANSPORT_RESPONSE_TIMEOUT_MS = 18000;

// BareMux's worker request/response paths have no upper bound when a worker
// stops answering. Fail visibly rather than leaving mobile users stuck forever.
async function withTimeout(operation, ms, detail) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(detail)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
let controllerPromise;
let currentFrame = null;
let lastUrl = "";
let loadingTimer = null;
let pageCheckTimer = null;
let currentNavigationPath = null;
let navigationResponseStatus = null;
let navigationError = null;
let busy = false;

function inspectPage(element) {
  try {
    const doc = element.contentDocument;
    if (!doc || doc.URL === "about:blank") return false;
    const body = doc.body;
    if (!body) return false;
    if ((body.innerText || body.textContent || "").trim().length > 0) return true;
    return !!body.querySelector?.("img, video, canvas, svg, iframe");
  } catch {
    // Some browser versions deny inspecting a proxied child frame.
    return null;
  }
}

function reportNavigationFailure(details) {
  navigationError = details;
  toolbarStatus.textContent = "Website request failed";
  loadingStatus.textContent = details;
  loading.hidden = false;
}

// The Service Worker sends the actual response status of document requests.
// An iframe "load" event alone can fire for about:blank or error pages.
navigator.serviceWorker?.addEventListener?.("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "scramjet-navigation-status" ||
      !currentFrame || data.path !== currentNavigationPath) return;
  if (typeof data.status !== "number") return;
  navigationResponseStatus = data.status;
  if (data.status === 0 || data.status >= 400) {
    reportNavigationFailure(
      "Scramjet could not load the remote document" +
      (data.status ? " (HTTP " + data.status + ")" : "") +
      ". " + (data.message || "Check the Render logs and retry.")
    );
  } else {
    toolbarStatus.textContent = "Website responded (HTTP " + data.status + ")";
  }
});

function showProgress(message) {
  progress.textContent = message;
  progress.hidden = !message;
  loadingStatus.textContent = message;
  toolbarStatus.textContent = message || "Scramjet";
}

function showError(message, details = "") {
  error.textContent = message;
  errorCode.textContent = details;
  showProgress("");
}

function getWispUrl() {
  const value = typeof _CONFIG === "object" && typeof _CONFIG?.wispUrl === "string"
    ? _CONFIG.wispUrl.trim()
    : "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "wss:" || parsed.pathname !== "/wisp/" ||
      parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("invalid URL");
    }
    return parsed.href;
  } catch {
    throw new Error("The secure Wisp backend URL is missing or invalid in config.js.");
  }
}

async function initializeController() {
  if (!controllerPromise) {
    controllerPromise = (async () => {
      if (typeof $scramjetLoadController !== "function") {
        throw new Error("Scramjet browser assets did not load. Check /scram/scramjet.all.js.");
      }
      const { ScramjetController } = $scramjetLoadController();
      const instance = new ScramjetController({
        files: {
          wasm: "/scram/scramjet.wasm.wasm",
          all: "/scram/scramjet.all.js",
          sync: "/scram/scramjet.sync.js",
        },
      });
      await instance.init();
      return instance;
    })();
  }
  try {
    return await controllerPromise;
  } catch (cause) {
    controllerPromise = undefined;
    throw cause;
  }
}

function websocketProbe(url, timeoutMs = WISP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let socket;
    let finished = false;
    let timer;
    function finish(cause) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (socket && socket.readyState === WebSocket.OPEN) socket.close();
      if (cause) reject(cause);
      else resolve();
    }
    try {
      socket = new WebSocket(url);
      timer = setTimeout(() => finish(new Error("WebSocket handshake timed out.")), timeoutMs);
      socket.addEventListener("open", () => finish());
      socket.addEventListener("error", () => finish(new Error("WebSocket handshake failed.")));
      socket.addEventListener("close", () => finish(new Error("The backend closed the WebSocket before it connected.")));
    } catch (cause) {
      finish(cause);
    }
  });
}

async function waitForWisp(url) {
  // Free Render instances may take 50+ seconds to wake.
  for (let attempt = 1; attempt <= 3; attempt++) {
    showProgress(attempt === 1 ? "Connecting to backend…" : "Waking backend (attempt " + attempt + "/3)…");
    try {
      await websocketProbe(url);
      return;
    } catch (cause) {
      if (attempt === 3) throw new Error("Cannot connect to " + url + ": " + cause.message);
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
}

function closeFrame() {
  if (loadingTimer !== null) {
    clearTimeout(loadingTimer);
    loadingTimer = null;
  }
  if (pageCheckTimer !== null) {
    clearTimeout(pageCheckTimer);
    pageCheckTimer = null;
  }
  currentNavigationPath = null;
  navigationResponseStatus = null;
  navigationError = null;
  if (currentFrame) {
    currentFrame.remove();
    currentFrame = null;
  }
  toolbar.hidden = true;
  loading.hidden = true;
  busy = false;
  address.disabled = false;
  showProgress("");
}

async function openUrl(url) {
  if (busy) return;
  busy = true;
  address.disabled = true;
  showError("");
  closeFrame();
  busy = true;
  address.disabled = true;
  lastUrl = url;

  try {
    const wispUrl = getWispUrl();
    await waitForWisp(wispUrl);
    showProgress("Initializing Scramjet…");
    const scramjet = await initializeController();

    if (typeof registerSW !== "function") throw new Error("Service worker bootstrap was not loaded.");
    await registerSW();
    await navigator.serviceWorker.ready;

    if (!window.BareMux?.BareMuxConnection) {
      throw new Error("BareMux browser assets did not load. Check /baremux/index.js.");
    }
    if (typeof SharedWorker === "undefined") {
      throw new Error("This browser has no SharedWorker support, which BareMux requires. Try the latest Safari or a desktop browser.");
    }

    showProgress("Checking BareMux worker…");
    const connection = new window.BareMux.BareMuxConnection("/baremux/worker.js");
    await withTimeout(
      connection.getTransport(),
      BAREMUX_RESPONSE_TIMEOUT_MS,
      "The BareMux SharedWorker isn't responding. Safari may block this worker, or /baremux/worker.js may be failing to start. Check the browser's developer console and deployed worker asset."
    );

    showProgress("Configuring browser transport…");
    // A persistent SharedWorker can retain an old URL despite matching getTransport().
    await withTimeout(
      connection.setTransport(TRANSPORT, [{ websocket: wispUrl }]),
      TRANSPORT_RESPONSE_TIMEOUT_MS,
      "The libcurl transport did not initialize within 18 seconds. The backend WebSocket connected, but BareMux couldn't activate /libcurl/index.mjs. Check Safari compatibility and the SharedWorker console."
    );
    const transportName = await withTimeout(
      connection.getTransport(),
      BAREMUX_RESPONSE_TIMEOUT_MS,
      "The BareMux worker stopped responding after transport initialization."
    );
    if (transportName !== TRANSPORT) {
      throw new Error("BareMux reports an unexpected transport: " + String(transportName));
    }

    showProgress("Loading website…");
    const frame = scramjet.createFrame();
    if (!frame || !frame.frame) throw new Error("Scramjet did not create a browser frame.");
    const element = frame.frame;
    element.id = "sj-frame";
    element.setAttribute("title", "Scramjet browsing frame");
    currentFrame = element;
    toolbar.hidden = false;
    loading.hidden = false;
    let loaded = false;
    element.addEventListener("load", () => {
      if (currentFrame !== element || navigationError) return;

      // Ignore the initial blank document; it's not a website response.
      let href = "";
      try { href = element.contentWindow?.location?.href || ""; } catch {}
      if (href === "about:blank") return;
      loaded = true;
      toolbarStatus.textContent = navigationResponseStatus === null
        ? "Checking website content…"
        : "Website responded (HTTP " + navigationResponseStatus + ")";

      if (pageCheckTimer !== null) clearTimeout(pageCheckTimer);
      pageCheckTimer = setTimeout(() => {
        if (currentFrame !== element || navigationError) return;
        const content = inspectPage(element);
        if (content === false) {
          loading.hidden = false;
          loadingStatus.textContent = navigationResponseStatus === null
            ? "The iframe navigated but is still blank, with no confirmed Scramjet document response. The service worker may not be intercepting the request."
            : "The website responded (HTTP " + navigationResponseStatus + "), but the frame shows no visible content. Safari/Scramjet rendering may be incompatible.";
          toolbarStatus.textContent = "Blank website";
        } else {
          loading.hidden = true;
          showProgress("");
          toolbarStatus.textContent = content === true
            ? "Website content detected"
            : "Navigation finished (content could not be inspected)";
        }
      }, 4000);
    });
    element.addEventListener("error", () => {
      if (currentFrame === element) {
        reportNavigationFailure("The iframe navigation failed. Try Retry or use Back.");
      }
    });

    // Set src before attaching the iframe to avoid a spurious about:blank load.
    frame.go(url);
    const frameSource = element.getAttribute?.("src") || element.src;
    if (!frameSource) throw new Error("Scramjet did not set an iframe navigation URL.");
    currentNavigationPath = new URL(frameSource, location.href).pathname;
    document.body.appendChild(element);

    loadingTimer = setTimeout(() => {
      if (currentFrame !== element || navigationError) return;
      if (!loaded || inspectPage(element) === false) {
        loading.hidden = false;
        loadingStatus.textContent = navigationResponseStatus === null
          ? "No completed proxied webpage was detected. The iframe may not be intercepted by Scramjet's service worker. Try Retry or check browser developer tools."
          : "The website responded (HTTP " + navigationResponseStatus + ") but is still blank. Try another website or test in desktop Chrome.";
        toolbarStatus.textContent = "Website still blank";
      }
    }, 35000);
  } catch (cause) {
    closeFrame();
    showError("Unable to open the page. Your original screen is still available.",
      cause instanceof Error ? cause.message : String(cause));
  } finally {
    busy = false;
    address.disabled = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  let url;
  try {
    url = search(address.value, searchEngine.value);
    if (!url) throw new Error("Enter a website address or search term.");
  } catch (cause) {
    showError("That address could not be opened.", cause.message || String(cause));
    return;
  }
  await openUrl(url);
});

closeButton.addEventListener("click", () => closeFrame());
reloadButton.addEventListener("click", () => {
  const url = lastUrl;
  if (url && !busy) void openUrl(url);
});
