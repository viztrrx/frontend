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
const homeButton = document.getElementById("sj-home-btn");
const reloadButton = document.getElementById("sj-reload");
const backButton = document.getElementById("sj-back");
const forwardButton = document.getElementById("sj-forward");
const showPageButton = document.getElementById("sj-show-page");
const homePage = document.getElementById("sj-home");
const view = document.getElementById("sj-view");
const homeForm = document.getElementById("sj-home-form");
const homeInput = document.getElementById("sj-home-q");
const omniIcon = document.getElementById("sj-omni-ic");
const fullscreenButton = document.getElementById("sj-fs");
const exitButton = document.getElementById("sj-exit");
const tabList = document.getElementById("sj-tabs");
const newTabButton = document.getElementById("sj-newtab");

// The start page has its own address, like chrome://settings. The address
// bar shows it on the home page; typing replaces it (it's selected on focus).
const HOME_URL = "saints://home";

// When this frontend runs inside the Saints Service console (an embedding
// parent frame), report the proxied site to that parent so the console can
// show which site is open and keep the owner's activity log. Only the site
// URL is sent, only to the parent window, and only when actually embedded.
const parentConsole =
  (typeof window !== "undefined" && window.parent && window.parent !== window &&
    typeof window.parent.postMessage === "function") ? window.parent : null;
let scramjetController = null;
let lastReportedUrl = null;
// What the user typed to reach the current page, when it was a search term
// rather than a web address (Scramjet then runs a search). Sent once with
// that page's report so the console can log the search ("tiktok"), since the
// resolved search URL loses the words. Cleared after it is reported.
let pendingQuery = "";
function reportToConsole(url, query = "") {
  if (!parentConsole) return;
  const value = typeof url === "string" ? url : "";
  if (value === lastReportedUrl && !query) return;
  lastReportedUrl = value;
  const message = { saintsProxy: 1, type: "nav", url: value };
  if (query) message.query = query;
  try { parentConsole.postMessage(message, "*"); } catch {}
}
// The page a load/navigation landed on, with the search term that reached it
// (once); link clicks and closing carry no term.
function reportPage(element) {
  const query = pendingQuery;
  pendingQuery = "";
  const url = frameRealUrl(element);
  pendingQuery = query;
  if (frameLanded(url)) return;
  pendingQuery = "";
  frameUrlChanged(url);
  reportToConsole(url, query);
}
// Does the input look like a web address (so Scramjet opens it directly),
// or a search term (so Scramjet searches for it)? Mirrors search.js.
function looksLikeUrl(input) {
  const value = String(input || "").trim();
  if (!value) return false;
  try { new URL(value); return true; } catch {}
  try { return new URL("http://" + value).hostname.includes("."); } catch {}
  return false;
}
// The console shows its own address bar over the frame (the Scramjet search
// box is covered once a site loads) and asks this page to navigate.
if (parentConsole && typeof window.addEventListener === "function") {
  window.addEventListener("message", (event) => {
    if (event.source !== parentConsole) return;
    const data = event.data;
    if (!data || data.saintsProxy !== 1) return;
    // Which window buttons the console wants in this toolbar (its own bar is
    // gone, so Close and Fullscreen live here).
    if (data.type === "chrome") {
      if (exitButton) exitButton.hidden = data.close === false;
      if (fullscreenButton) {
        fullscreenButton.hidden = !data.fullscreen;
        const label = data.fullscreenOn ? "Exit fullscreen" : "Fullscreen";
        fullscreenButton.title = label;
        fullscreenButton.setAttribute?.("aria-label", label);
      }
      return;
    }
    if (data.type !== "navigate" || typeof data.query !== "string") return;
    const typed = data.query.trim().slice(0, 500);
    if (!typed || busy) return;
    void go(typed);
  });
}
// Ask the console (when embedded) to close the proxy or toggle fullscreen.
function tellConsole(type) {
  if (!parentConsole) return;
  try { parentConsole.postMessage({ saintsProxy: 1, type }, "*"); } catch {}
}
if (exitButton) exitButton.hidden = !parentConsole;
exitButton?.addEventListener?.("click", () => tellConsole("close"));
fullscreenButton?.addEventListener?.("click", () => tellConsole("fullscreen"));
// The real site a Scramjet frame is on (it runs on this origin, so its
// encoded location is readable here), decoded back to the site's own URL.
function frameRealUrl(element) {
  let href = "";
  try { href = element?.contentWindow?.location?.href || ""; } catch {}
  if (!href || href === "about:blank") return "";
  if (scramjetController && typeof scramjetController.decodeUrl === "function") {
    try { const real = scramjetController.decodeUrl(href); if (real) return real; } catch {}
  }
  return href;
}

// ---- Blocked pages (blocked.js) --------------------------------------------
// AI sites, and signing in with Google, aren't shown: the page area says why
// instead. sw.js refuses their requests as well, so a link, redirect, pop-up
// or script inside a page can't reach them either.
//   AI: the page is removed; "Use Saints Service AI" (in the console) or home.
//   Google sign-in: the notice covers the page that had the Google button,
//   and Go back returns to it to sign in another way.
const blockPanel = document.getElementById("sj-block");
const blockTitle = document.getElementById("sj-block-title");
const blockMsg = document.getElementById("sj-block-msg");
const blockSite = document.getElementById("sj-block-site");
const blockBack = document.getElementById("sj-block-back");
const blockHome = document.getElementById("sj-block-home");
const blockConsole = document.getElementById("sj-block-console");
function blockOf(url) {
  try { return (url && globalThis.saintsBlock && globalThis.saintsBlock.check(url)) || null; } catch { return null; }
}
function renderBlock() {
  if (!blockPanel) return;
  blockPanel.hidden = !blocked;
  if (!blocked) return;
  if (blockTitle) blockTitle.textContent = blocked.title;
  if (blockMsg) blockMsg.textContent = blocked.message;
  if (blockSite) blockSite.textContent = hostOf(blocked.url) || blocked.url;
  if (blockBack) blockBack.hidden = !(blocked.kind === "googleSignIn" && currentFrame && currentSite);
  if (blockConsole) blockConsole.hidden = !(blocked.kind === "ai" && parentConsole);
}
function showBlock(url, info) {
  const query = pendingQuery;
  pendingQuery = "";
  if (info.kind === "googleSignIn" && currentFrame && currentSite) {
    // Keep the site that had the Google button, under the notice.
    if (loadingTimer !== null) { clearTimeout(loadingTimer); loadingTimer = null; }
    if (pageCheckTimer !== null) { clearTimeout(pageCheckTimer); pageCheckTimer = null; }
    loading.hidden = true;
    setLoading(false);
  } else {
    // Nothing to go back to (or an AI site): the page goes away entirely.
    closeFrame();
    homeForward = "";
    showView(true);
  }
  blocked = { url, kind: info.kind, title: info.title, message: info.message };
  toolbarStatus.textContent = info.title;
  renderBlock();
  showAddress();
  syncNav();
  // The console still logs the attempt for the owner.
  reportToConsole(url, query);
}
// The page that had the Google button, loaded again under the toolbar.
function goBackFromBlock() {
  if (!(currentFrame && currentSjFrame && currentSite)) { closeFrame(); return; }
  const site = currentSite;
  blocked = null;
  renderBlock();
  navigateFrame(site);
  showAddress();
}
// A page the active frame landed on: blocked, or clears a Google notice.
function frameLanded(url) {
  const info = blockOf(url);
  if (info) { showBlock(url, info); return true; }
  if (blocked && currentFrame) { blocked = null; renderBlock(); showAddress(); }
  return false;
}
blockBack?.addEventListener?.("click", () => goBackFromBlock());
blockHome?.addEventListener?.("click", () => closeFrame());
blockConsole?.addEventListener?.("click", () => tellConsole("open-ai"));

// How the browser reaches sites through the Wisp backend. Epoxy (TLS in
// Rust/WASM) is the faster one; libcurl is the fallback. A browser that can't
// load Epoxy at all (it failed on iPhone Safari with "Importing a module
// script failed.") switches to libcurl at once and keeps it on that device;
// a page that fails to load with Epoxy uses libcurl for the rest of the visit.
const TRANSPORTS = {
  epoxy: { path: "/epoxy/index.mjs", args: (wisp) => [{ wisp }] },
  libcurl: { path: "/libcurl/index.mjs", args: (wisp) => [{ websocket: wisp }] },
};
const TRANSPORT_KEY = "sj-transport";
let transportKind = "epoxy";
try { if (localStorage.getItem(TRANSPORT_KEY) === "libcurl") transportKind = "libcurl"; } catch {}
// Set once the proxy is connected in this page: later sites open straight
// away instead of probing the backend and rebuilding the transport again.
let proxyReady = false;
let preparing = null;
// Where setup progress is shown: nowhere during the warm-up, the loading
// cover once someone opens a site (even while the warm-up is still running).
let reportProgress = () => {};
let setupStep = "";   // the step setup is on, shown to someone who joins midway
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
let httpWarning = false;
let busy = false;
// The ScramjetFrame for the open site, and a simple history so Back from the
// first page returns to saints://home (never past it into the host page).
let currentSjFrame = null;
let currentSite = "";      // real URL of the page in the frame
let backCount = 0;         // pages behind the current one, inside the frame
let forwardCount = 0;
let historyMove = null;    // "back" | "forward" while that navigation lands
let homeForward = "";      // the site Forward reopens from saints://home
let frameTitle = "";       // the open page's own <title>, for its tab
let blocked = null;        // { url, kind, title, message } this tab won't show

// ---- Tabs ------------------------------------------------------------------
// Each tab keeps its own frame (hidden while another tab is shown), address
// and back/forward history. The variables above always hold the active tab;
// switching saves them into its tab object and loads the other one's.
const MAX_TABS = 12;
let tabs = [];
let activeTab = null;
let nextTabId = 1;
function newTabState() {
  return { id: nextTabId++, frame: null, sj: null, site: "", lastUrl: "", title: "", backCount: 0, forwardCount: 0,
    homeForward: "", navigationError: null, navigationResponseStatus: null, navigationPath: null, httpWarning: false,
    loadingHidden: true, loadingText: "", statusText: "", blocked: null };
}
function saveActiveTab() {
  const t = activeTab;
  if (!t) return;
  t.frame = currentFrame; t.sj = currentSjFrame; t.site = currentSite; t.lastUrl = lastUrl; t.title = frameTitle;
  t.backCount = backCount; t.forwardCount = forwardCount; t.homeForward = homeForward;
  t.navigationError = navigationError; t.navigationResponseStatus = navigationResponseStatus;
  t.navigationPath = currentNavigationPath; t.httpWarning = httpWarning;
  t.loadingHidden = loading.hidden; t.loadingText = loadingStatus.textContent; t.statusText = toolbarStatus.textContent;
  t.blocked = blocked;
}
function loadTab(t) {
  activeTab = t;
  currentFrame = t.frame; currentSjFrame = t.sj; currentSite = t.site; lastUrl = t.lastUrl; frameTitle = t.title;
  backCount = t.backCount; forwardCount = t.forwardCount; homeForward = t.homeForward;
  navigationError = t.navigationError; navigationResponseStatus = t.navigationResponseStatus;
  currentNavigationPath = t.navigationPath; httpWarning = t.httpWarning;
  blocked = t.blocked || null;
  historyMove = null;
  loadingStatus.textContent = t.loadingText; toolbarStatus.textContent = t.statusText;
}
// The tab a frame belongs to (its events keep coming while it's in the background).
function tabOfFrame(element) {
  if (element === currentFrame) return activeTab;
  return tabs.find((t) => t.frame === element) || null;
}
function switchTab(t) {
  if (!t || t === activeTab || busy) return;
  saveActiveTab();
  if (currentFrame) currentFrame.style.display = "none";
  if (loadingTimer !== null) { clearTimeout(loadingTimer); loadingTimer = null; }
  if (pageCheckTimer !== null) { clearTimeout(pageCheckTimer); pageCheckTimer = null; }
  loadTab(t);
  if (currentFrame) currentFrame.style.display = "";
  showView(!!currentFrame || !!blocked);
  renderBlock();
  // A page that finished while its tab was in the background is uncovered.
  let cover = !t.loadingHidden;
  if (cover && currentFrame && !navigationError && inspectPage(currentFrame) !== false) cover = false;
  loading.hidden = !cover;
  setLoading(cover);
  setWarning(!!(currentFrame && (httpWarning || navigationError)));
  showError("");
  showAddress();
  syncNav();
  renderTabs();
  reportToConsole(currentSite, "");
}
function newTab() {
  if (busy || tabs.length >= MAX_TABS) return;
  const t = newTabState();
  tabs.push(t);
  switchTab(t);
  // Ready to type, like a new browser tab.
  try { address.focus?.(); } catch {}
}
function closeTab(t) {
  if (!t || busy) return;
  const i = tabs.indexOf(t);
  if (i < 0) return;
  if (t === activeTab) {
    // The last tab doesn't close the browser: it goes back to saints://home.
    if (tabs.length === 1) { closeFrame(); homeForward = ""; syncNav(); renderTabs(); return; }
    switchTab(tabs[i + 1] || tabs[i - 1]);
  }
  if (t.frame) t.frame.remove();
  tabs.splice(tabs.indexOf(t), 1);
  renderTabs();
}
function tabLabel(t) {
  const isActive = t === activeTab;
  const frame = isActive ? currentFrame : t.frame;
  const site = isActive ? currentSite : t.site;
  const title = isActive ? frameTitle : t.title;
  if (!frame) return "Saints Search";
  return title || hostOf(site || (isActive ? lastUrl : t.lastUrl)) || "Loading…";
}
function renderTabs() {
  if (!tabList || typeof document.createElement !== "function") return;
  if (newTabButton) newTabButton.disabled = tabs.length >= MAX_TABS;
  const items = tabs.map((t) => {
    const isActive = t === activeTab;
    const frame = isActive ? currentFrame : t.frame;
    const site = isActive ? currentSite : t.site;
    const label = tabLabel(t);
    const tab = document.createElement("div");
    tab.className = "sb-tab" + (isActive ? " is-active" : "");
    tab.dataset.tab = String(t.id);
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.setAttribute("tabindex", isActive ? "0" : "-1");
    tab.title = label;
    const icon = document.createElement("span");
    icon.className = "sb-tab-ic" + (frame ? "" : " is-home");
    const host = frame ? hostOf(site) : "";
    if (host) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = "/icon?d=" + encodeURIComponent(host);
      img.addEventListener?.("error", () => img.remove());
      icon.appendChild(img);
    }
    const text = document.createElement("span");
    text.className = "sb-tab-title";
    text.textContent = label;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "sb-tab-close";
    close.setAttribute("aria-label", "Close tab: " + label);
    close.title = "Close tab";
    close.textContent = "\u00d7";
    close.addEventListener("click", (event) => { event.stopPropagation?.(); closeTab(t); });
    tab.append(icon, text, close);
    tab.addEventListener("click", () => switchTab(t));
    // Middle-click closes, as in Chrome.
    tab.addEventListener("auxclick", (event) => { if (event.button === 1) { event.preventDefault?.(); closeTab(t); } });
    return tab;
  });
  tabList.replaceChildren(...items);
  const current = items[tabs.indexOf(activeTab)];
  try { current?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); } catch {}
}
newTabButton?.addEventListener?.("click", () => newTab());
// Ctrl/⌘+Shift+? would collide with the browser's own tab keys; Alt works
// inside a page: Alt+T new tab, Alt+W close tab.
document.addEventListener?.("keydown", (event) => {
  if (!event.altKey || event.ctrlKey || event.metaKey) return;
  const key = String(event.key || "").toLowerCase();
  if (key === "t") { event.preventDefault?.(); newTab(); }
  else if (key === "w") { event.preventDefault?.(); closeTab(activeTab); }
});

// ---- Toolbar state -------------------------------------------------------
function setLoading(on) {
  try { toolbar.classList?.toggle("is-loading", !!on); } catch {}
  try { view?.classList?.toggle("is-loading", !!on); } catch {}
}
function setWarning(on) {
  try { view?.classList?.toggle("has-warning", !!on); } catch {}
}
// The address bar's resting text: saints://home, or the site's real address.
// Left alone while the user is typing in it.
function showAddress() {
  const text = blocked ? blocked.url : currentFrame ? (currentSite || lastUrl || "") : HOME_URL;
  if (document.activeElement !== address) address.value = text;
  if (omniIcon && omniIcon.dataset) omniIcon.dataset.kind = currentFrame || blocked ? "site" : "home";
  try { document.title = currentFrame && currentSite ? hostOf(currentSite) + " · Saints Search" : "Saints Search"; } catch {}
  renderTabs();
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function syncNav() {
  if (backButton) backButton.disabled = !currentFrame;
  if (forwardButton) forwardButton.disabled = currentFrame ? forwardCount <= 0 : !homeForward;
}
// Page area vs. saints://home.
function showView(on) {
  if (homePage) homePage.hidden = !!on;
  if (view) view.hidden = !on;
}
// A page the frame landed on (load or in-page URL change): history + bar.
function frameUrlChanged(url) {
  if (!url || url === currentSite) return;
  if (historyMove === "back") { backCount = Math.max(0, backCount - 1); forwardCount++; }
  else if (historyMove === "forward") { backCount++; forwardCount = Math.max(0, forwardCount - 1); }
  else if (currentSite) { backCount++; forwardCount = 0; }
  historyMove = null;
  currentSite = url;
  frameTitle = "";
  showAddress();
  syncNav();
}

// Remember the search engine; storage can be unavailable.
function loadPreference(key, apply) {
  try {
    const value = localStorage.getItem(key);
    if (value !== null) apply(value);
  } catch {}
}
function savePreference(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
loadPreference("sj-search-engine", (value) => {
  if ([...(searchEngine.options || [])].some((option) => option.value === value)) searchEngine.value = value;
});
searchEngine.addEventListener?.("change", () => savePreference("sj-search-engine", searchEngine.value));
// Sites always open under the toolbar, like Chrome: the old "full tab"
// option (it replaced this page, toolbar and all) is gone with its setting.
try { localStorage.removeItem("sj-fulltab"); } catch {}

function describeHttpStatus(status, message) {
  if (message) return "Proxy error (HTTP " + status + "): " + message;
  if (status === 429) return "HTTP 429: the site is rate-limiting the backend server. Try another search engine.";
  if (status === 403) return "HTTP 403: the site refused the backend server.";
  return "The site returned HTTP " + status + ".";
}

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
  // The next try reconnects from scratch, with libcurl if Epoxy was in use.
  proxyReady = false;
  if (transportKind === "epoxy") transportKind = "libcurl";
  setLoading(false);
  setWarning(true);
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
  if (data.status === 0) {
    reportNavigationFailure(
      "Scramjet could not load the remote document. " +
      (data.message || "Check the Render logs and retry.")
    );
  } else if (data.status >= 400) {
    // Show the delivered page (a captcha, consent page or Scramjet's error
    // details) and report the status in the toolbar instead of covering it.
    httpWarning = true;
    loading.hidden = true;
    setLoading(false);
    setWarning(true);
    toolbarStatus.textContent = describeHttpStatus(data.status, data.message);
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

async function waitForWisp(url, report = showProgress) {
  // Free Render instances may take 50+ seconds to wake.
  for (let attempt = 1; attempt <= 3; attempt++) {
    report(attempt === 1 ? "Connecting to backend…" : "Waking backend (attempt " + attempt + "/3)…");
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
  httpWarning = false;
  if (currentFrame) {
    // Forward on saints://home reopens the site that was just left.
    if (currentSite || lastUrl) homeForward = currentSite || lastUrl;
    currentFrame.remove();
    currentFrame = null;
  }
  currentSjFrame = null;
  currentSite = "";
  frameTitle = "";
  blocked = null;
  renderBlock();
  backCount = 0;
  forwardCount = 0;
  historyMove = null;
  loading.hidden = true;
  setLoading(false);
  setWarning(false);
  showView(false);
  busy = false;
  showProgress("");
  showAddress();
  syncNav();
  reportToConsole("");
  // Back on saints://home: the saved session (sessions.js) catches up.
  globalThis.saintsSessions?.changed?.();
}

// Everything the proxy needs before a site can open: the backend awake, Scramjet,
// the service worker and the BareMux transport. Runs once per page (shared by
// concurrent callers); later calls return at once while it still works.
async function prepareProxy() {
  const report = (message) => { setupStep = message; reportProgress(message); };
  const wispUrl = getWispUrl();
  let transport = TRANSPORTS[transportKind];
  if (proxyReady && scramjetController && window.BareMux?.BareMuxConnection) {
    // Already connected: just make sure the SharedWorker still has it.
    try {
      const connection = new window.BareMux.BareMuxConnection("/baremux/worker.js");
      const name = await withTimeout(connection.getTransport(), BAREMUX_RESPONSE_TIMEOUT_MS, "BareMux stopped responding.");
      if (name === transport.path) return scramjetController;
    } catch {}
    proxyReady = false;
  }
  await waitForWisp(wispUrl, report);
  report("Initializing Scramjet…");
  const scramjet = await initializeController();
  scramjetController = scramjet;

  if (typeof registerSW !== "function") throw new Error("Service worker bootstrap was not loaded.");
  await registerSW();
  await navigator.serviceWorker.ready;

  if (!window.BareMux?.BareMuxConnection) {
    throw new Error("BareMux browser assets did not load. Check /baremux/index.js.");
  }
  if (typeof SharedWorker === "undefined") {
    throw new Error("This browser has no SharedWorker support, which BareMux requires. Try the latest Safari or a desktop browser.");
  }

  report("Checking BareMux worker…");
  const connection = new window.BareMux.BareMuxConnection("/baremux/worker.js");
  await withTimeout(
    connection.getTransport(),
    BAREMUX_RESPONSE_TIMEOUT_MS,
    "The BareMux SharedWorker isn't responding. Safari may block this worker, or /baremux/worker.js may be failing to start. Check the browser's developer console and deployed worker asset."
  );

  report("Configuring browser transport…");
  try {
    await setTransport(connection, transport, wispUrl);
  } catch (cause) {
    if (transportKind !== "epoxy") throw cause;
    // This browser can't run Epoxy: use libcurl, now and from now on here.
    console.warn("Epoxy transport failed, switching to libcurl:", cause);
    transportKind = "libcurl";
    try { localStorage.setItem(TRANSPORT_KEY, "libcurl"); } catch {}
    transport = TRANSPORTS.libcurl;
    report("Configuring browser transport (compatibility mode)…");
    await setTransport(connection, transport, wispUrl);
  }
  proxyReady = true;
  return scramjet;
}
async function setTransport(connection, transport, wispUrl) {
  // A persistent SharedWorker can retain an old URL despite matching getTransport().
  await withTimeout(
    connection.setTransport(transport.path, transport.args(wispUrl)),
    TRANSPORT_RESPONSE_TIMEOUT_MS,
    "The " + transportKind + " transport did not initialize within 18 seconds. The backend WebSocket connected, but BareMux couldn't activate " + transport.path + ". Check Safari compatibility and the SharedWorker console."
  );
  const transportName = await withTimeout(
    connection.getTransport(),
    BAREMUX_RESPONSE_TIMEOUT_MS,
    "The BareMux worker stopped responding after transport initialization."
  );
  if (transportName !== transport.path) {
    throw new Error("BareMux reports an unexpected transport: " + String(transportName));
  }
}
function prepare(report) {
  if (report) reportProgress = report;
  preparing ??= prepareProxy().finally(() => { preparing = null; setupStep = ""; reportProgress = () => {}; });
  return preparing;
}
// Warm up as soon as Saints Search has loaded, so the first site opens without
// waiting (and a sleeping backend starts waking while people type). One small
// request through the proxy, to the backend's own /health, also starts the
// transport's TLS engine and its Wisp connection ahead of the first site.
async function warmUp() {
  try {
    await prepare();
    if (typeof window.BareMux?.BareClient !== "function") return;
    const health = new URL(getWispUrl());
    health.protocol = "https:";
    health.pathname = "/health";
    await new window.BareMux.BareClient().fetch(health.origin + "/health");
  } catch {
    // openUrl reports any problem when a site is opened
  }
}

async function openUrl(url) {
  if (busy) return;
  const block = blockOf(url);
  if (block) { showBlock(url, block); return; }
  busy = true;
  showError("");
  closeFrame();
  busy = true;
  lastUrl = url;
  homeForward = "";
  // Straight to the page area: the toolbar shows where we're going and the
  // loading cover reports the connection steps.
  showView(true);
  loading.hidden = false;
  setLoading(true);
  showAddress();
  if (document.activeElement !== address) address.value = url;
  syncNav();

  try {
    // A warm-up already under way carries on, now showing its steps here.
    if (preparing) showProgress(setupStep || "Connecting to backend…");
    const scramjet = await prepare(showProgress);

    showProgress("Loading website…");
    const frame = scramjet.createFrame();
    if (!frame || !frame.frame) throw new Error("Scramjet did not create a browser frame.");
    const element = frame.frame;
    element.className = "sj-frame";
    element.setAttribute("title", "Scramjet browsing frame");
    currentFrame = element;
    currentSjFrame = frame;
    frame.addEventListener?.("urlchange", (event) => {
      const u = event && typeof event.url === "string" && event.url ? event.url : frameRealUrl(element);
      if (!u) return;
      if (currentFrame !== element) { backgroundPage(element, u); return; }
      if (frameLanded(u)) return;
      frameUrlChanged(u); reportToConsole(u, "");
    });
    syncNav();
    loading.hidden = false;
    let loaded = false;
    // Hide the loading cover as soon as the page shows content, even before
    // its load event (slow sites such as YouTube render long before it fires).
    const watchContent = () => {
      if (currentFrame !== element || navigationError) return;
      const content = inspectPage(element);
      if (content !== false) {
        loading.hidden = true;
        setLoading(false);
        readTitle(element);
        progress.textContent = "";
        progress.hidden = true;
        if (!httpWarning) {
          toolbarStatus.textContent = content === true
            ? "Website content detected"
            : "Navigation finished (content could not be inspected)";
        }
        return;
      }
      if (loaded) {
        // A delivered document stays visible while it finishes rendering.
        loading.hidden = true;
        setLoading(false);
        if (!httpWarning) toolbarStatus.textContent = "Page loaded but still blank…";
      }
      pageCheckTimer = setTimeout(watchContent, 1000);
    };
    element.addEventListener("load", () => {
      // A tab in the background: just keep its tab's address and title current.
      if (currentFrame !== element) { backgroundPage(element, frameRealUrl(element)); return; }
      if (navigationError) return;

      // Ignore the initial blank document; it's not a website response.
      let href = "";
      try { href = element.contentWindow?.location?.href || ""; } catch {}
      if (href === "about:blank") return;
      loaded = true;
      reportPage(element);
      readTitle(element);
      if (!httpWarning) {
        toolbarStatus.textContent = navigationResponseStatus === null
          ? "Checking website content…"
          : "Website responded (HTTP " + navigationResponseStatus + ")";
      }
      if (pageCheckTimer !== null) clearTimeout(pageCheckTimer);
      watchContent();
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
    (view || document.body).appendChild(element);

    pageCheckTimer = setTimeout(watchContent, 1000);
    loadingTimer = setTimeout(() => {
      if (currentFrame !== element || navigationError || httpWarning) return;
      if (inspectPage(element) === false) {
        if (pageCheckTimer !== null) clearTimeout(pageCheckTimer);
        pageCheckTimer = null;
        loading.hidden = false;
        loadingStatus.textContent = navigationResponseStatus === null
          ? "No completed proxied webpage was detected. The iframe may not be intercepted by Scramjet's service worker. Try Retry or check browser developer tools."
          : "The website responded (HTTP " + navigationResponseStatus + ") but is still blank. Try Retry or another website.";
        toolbarStatus.textContent = "Website still blank";
      }
    }, 35000);
  } catch (cause) {
    closeFrame();
    showError("Unable to open the page. Your original screen is still available.",
      cause instanceof Error ? cause.message : String(cause));
  } finally {
    busy = false;
  }
}

// A background tab's page changed (a redirect, or a page that finished
// loading after its tab was left): update that tab only.
function backgroundPage(element, url) {
  const t = tabOfFrame(element);
  if (!t || t === activeTab) return;
  const block = blockOf(url);
  if (block) {
    const info = { url, kind: block.kind, title: block.title, message: block.message };
    if (block.kind === "googleSignIn" && t.site) {
      // Shown, with Go back, when the tab is opened again.
      t.blocked = info;
    } else {
      // A background tab wandered onto an AI site: drop its page now.
      element.remove();
      Object.assign(t, { frame: null, sj: null, site: "", title: "", blocked: info, backCount: 0, forwardCount: 0, loadingHidden: true });
    }
    renderTabs();
    return;
  }
  if (url && url !== "about:blank") t.site = url;
  try { t.title = String(element.contentDocument?.title || "").trim().slice(0, 80); } catch {}
  renderTabs();
}
// The page's own title for its tab (Scramjet pages are same-origin).
function readTitle(element) {
  if (currentFrame !== element) return;
  try {
    const title = String(element.contentDocument?.title || "").trim().slice(0, 80);
    if (title && title !== frameTitle) { frameTitle = title; renderTabs(); }
  } catch {}
}

// Somewhere new while a site is open: navigate the same frame, so Back
// returns to the page before it (a fresh frame would lose that).
function navigateFrame(url) {
  lastUrl = url;
  navigationError = null;
  navigationResponseStatus = null;
  httpWarning = false;
  setWarning(false);
  setLoading(true);
  toolbarStatus.textContent = "Loading website…";
  try { currentNavigationPath = new URL(scramjetController.encodeUrl(url), location.href).pathname; } catch {}
  currentSjFrame.go(url);
}

// What the address bar (or the home page box) was given: saints://home,
// a web address, or words to search for.
async function go(raw) {
  const text = String(raw || "").trim();
  if (!text) return;
  if (/^saints:(\/\/)?/i.test(text)) { closeFrame(); return; }
  let url;
  try {
    url = search(text, searchEngine.value);
    if (!url) throw new Error("Enter a website address or search term.");
  } catch (cause) {
    closeFrame();
    showError("That address could not be opened.", cause.message || String(cause));
    return;
  }
  // Remember a search term (not a web address) so the console logs it.
  pendingQuery = looksLikeUrl(text) ? "" : text.slice(0, 200);
  const block = blockOf(url);
  if (block) { showBlock(url, block); return; }
  if (currentFrame && currentSjFrame && scramjetController && !busy && !navigationError) {
    if (document.activeElement !== address) address.value = url;
    navigateFrame(url);
    return;
  }
  await openUrl(url);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const typed = address.value;
  address.blur?.();
  await go(typed);
});
homeForm?.addEventListener?.("submit", async (event) => {
  event.preventDefault();
  if (busy || !homeInput) return;
  const typed = homeInput.value;
  homeInput.value = "";
  homeInput.blur?.();
  await go(typed);
});

// The whole address is selected when the bar is focused, so typing replaces
// saints://home (or the site's address) without deleting anything first.
let selectOnMouseUp = false;
function selectAddress() {
  try { address.select?.(); address.setSelectionRange?.(0, address.value.length); } catch {}
}
address.addEventListener("focus", () => {
  selectAddress();
  selectOnMouseUp = true;
  // iOS places the caret after focus; select again once it settles.
  setTimeout(selectAddress, 0);
});
// A click that focused the bar would otherwise drop the selection on mouseup.
address.addEventListener("mouseup", (event) => {
  if (!selectOnMouseUp) return;
  selectOnMouseUp = false;
  event.preventDefault?.();
});
address.addEventListener("blur", () => { selectOnMouseUp = false; showAddress(); });
address.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { address.value = currentFrame ? (currentSite || lastUrl) : HOME_URL; address.blur?.(); }
});

// Show the deployed commit (written by scripts/build.mjs) so a new deployment
// can be confirmed from the page itself.
const versionLabel = document.getElementById("sj-version");
async function showVersion() {
  if (!versionLabel || typeof fetch !== "function") return;
  try {
    const response = await fetch("/version.json", { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const version = await response.json();
    const commit = typeof version.commit === "string" ? version.commit : "";
    if (!/^[0-9a-f]{7,40}$/.test(commit)) throw new Error("no commit");
    const when = new Date(version.committedAt || version.builtAt);
    const link = document.createElement("a");
    link.href = "https://github.com/viztrrx/scramjet-frontend/commit/" + commit;
    link.textContent = commit.slice(0, 7);
    link.target = "_blank";
    link.rel = "noopener";
    versionLabel.textContent = "Live version: ";
    versionLabel.append(link, " · " + (isNaN(when) ? "unknown date" : when.toLocaleString()) +
      (version.message ? " · " + version.message : ""));
  } catch {
    versionLabel.textContent = "Live version: unknown";
  }
}
void showVersion();

homeButton?.addEventListener?.("click", () => closeFrame());
showPageButton?.addEventListener?.("click", () => { loading.hidden = true; setLoading(false); });
// Coming back to this page through the back/forward cache: start on saints://home.
window.addEventListener?.("pageshow", (event) => { if (event.persisted) closeFrame(); });
// Reload the page; after a failure, reconnect from scratch (refreshes the
// Wisp transport). On saints://home there is nothing to reload.
reloadButton.addEventListener("click", () => {
  if (busy) return;
  if (currentFrame && currentSjFrame && !navigationError && typeof currentSjFrame.reload === "function") {
    setLoading(true);
    try { currentSjFrame.reload(); return; } catch {}
  }
  if (currentFrame && lastUrl) void openUrl(lastUrl);
});
backButton?.addEventListener?.("click", () => {
  if (!currentFrame || busy) return;
  // Under a Google sign-in notice: back to the page that had the button.
  if (blocked) { goBackFromBlock(); return; }
  // First page of this visit: Back goes to saints://home (never into the
  // history of the page hosting the proxy).
  if (backCount <= 0 || !currentSjFrame) { closeFrame(); return; }
  historyMove = "back";
  setLoading(true);
  try { currentSjFrame.back(); } catch { historyMove = null; setLoading(false); }
});
forwardButton?.addEventListener?.("click", () => {
  if (busy) return;
  if (!currentFrame) { if (homeForward) void openUrl(homeForward); return; }
  if (forwardCount <= 0 || !currentSjFrame) return;
  historyMove = "forward";
  setLoading(true);
  try { currentSjFrame.forward(); } catch { historyMove = null; setLoading(false); }
});

// Quick-launch app presets on the home page: a tile per popular site that
// opens it through the proxy in one tap. The tiles are original monogram
// avatars in each service's brand colour (not the services' own logos) with
// the name beside them.
const APPS = [
  { name: "YouTube", url: "https://m.youtube.com/", domain: "youtube.com", tag: "YT", bg: "#ff0000" },
  { name: "TikTok", url: "https://www.tiktok.com/", domain: "tiktok.com", tag: "TT", bg: "#111111", fg: "#ffffff" },
  { name: "Instagram", url: "https://www.instagram.com/", domain: "instagram.com", tag: "IG", bg: "linear-gradient(135deg,#feda75,#d62976 55%,#4f5bd5)" },
  { name: "Spotify", url: "https://open.spotify.com/", domain: "spotify.com", tag: "SP", bg: "#1db954", fg: "#0b2e18" },
  { name: "SoundCloud", url: "https://soundcloud.com/", domain: "soundcloud.com", tag: "SC", bg: "#ff5500" },
  { name: "Twitch", url: "https://m.twitch.tv/", domain: "twitch.tv", tag: "TV", bg: "#9146ff" },
  { name: "Reddit", url: "https://www.reddit.com/", domain: "reddit.com", tag: "RD", bg: "#ff4500" },
  { name: "Discord", url: "https://discord.com/app", domain: "discord.com", tag: "DC", bg: "#5865f2" },
  { name: "Netflix", url: "https://www.netflix.com/", domain: "netflix.com", tag: "NF", bg: "#111111", fg: "#e50914" },
  { name: "X", url: "https://x.com/", domain: "x.com", tag: "X", bg: "#111111", fg: "#ffffff" },
  { name: "Snapchat", url: "https://www.snapchat.com/", domain: "snapchat.com", tag: "SN", bg: "#fffc00", fg: "#111111" },
  { name: "Pinterest", url: "https://www.pinterest.com/", domain: "pinterest.com", tag: "PT", bg: "#e60023" },
];
const appsGrid = document.getElementById("sj-apps");
if (appsGrid) {
  for (const app of APPS) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "ss-app";
    tile.dataset.url = app.url;
    tile.setAttribute("aria-label", "Open " + app.name);
    const icon = document.createElement("span");
    icon.className = "ss-app-ic";
    icon.setAttribute("aria-hidden", "true");
    icon.style.background = app.bg;
    if (app.fg) icon.style.color = app.fg;
    icon.textContent = app.tag;
    // Show the site's own favicon when it loads; keep the monogram otherwise.
    if (app.domain) {
      const img = new Image();
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.className = "ss-app-img";
      img.addEventListener("load", () => {
        icon.textContent = "";
        icon.style.background = "#ffffff";
        icon.classList.add("has-img");
        icon.appendChild(img);
      });
      img.src = "/icon?d=" + encodeURIComponent(app.domain);
    }
    const label = document.createElement("span");
    label.className = "ss-app-name";
    label.textContent = app.name;
    tile.append(icon, label);
    tile.addEventListener("click", () => {
      if (busy) return;
      pendingQuery = "";
      void openUrl(app.url);
    });
    appsGrid.appendChild(tile);
  }
}

// Saved sessions (sessions.js) swap the cookie jar, so every tab closes
// first: no page keeps running with the previous session's sign-ins.
globalThis.saintsBrowser = {
  isBusy: () => busy,
  // The service worker, ready to answer. Scramjet's controller must run
  // first: it creates the IndexedDB stores the worker opens on start.
  async worker() {
    scramjetController = await initializeController();
    if (typeof registerSW !== "function") throw new Error("Service worker bootstrap was not loaded.");
    await registerSW();
    return navigator.serviceWorker.ready;
  },
  closeAllTabs() {
    if (busy) return false;
    for (const t of tabs) if (t !== activeTab && t.frame) t.frame.remove();
    tabs = activeTab ? [activeTab] : [];
    closeFrame();
    homeForward = "";
    syncNav();
    renderTabs();
    return true;
  },
};

window.addEventListener?.("load", () => setTimeout(() => void warmUp(), 0));

// Start with one tab on saints://home, and tell the console (when embedded) so.
activeTab = newTabState();
tabs.push(activeTab);
showAddress();
syncNav();
reportToConsole("");
