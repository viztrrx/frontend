"use strict";

// Saved sessions on saints://home: pick one of your account's sessions and
// carry on signed in to the sites you used in it, Rammerhead-style.
//
// What signs you in to a proxied site lives on this origin: Scramjet's cookie
// jar (in the service worker, see sw.js) and the site's localStorage, which
// Scramjet keeps here under "<host>@<key>". Production also runs Spotify on
// Scramjet 2 (public/s2/), which has a cookie jar of its own in IndexedDB and
// keeps localStorage the same way. A session is a snapshot of all of it,
// saved per Saints account in R2 by the Worker (src/sessions.js). Resuming one
// closes every tab, swaps the jar and the storage, and the next site you open
// sees that session's sign-ins. The active session is saved again as you
// browse (only when something changed).
//
// The account comes from the Saints console that frames this page: it posts
// {saintsProxy:1, type:"account", user, token} whenever its sign-in changes.
// The token is only ever sent back to this origin's /sessions API.
//
// Opened on its own, Saints Search signs in with the same Saints name and PIN
// (the form on saints://home). The PIN is turned into the console's verifier
// here and checked by the Saints Worker's /auth/proxy-login, which hands back
// a proxy-only token: the console stays signed in. The token goes straight to
// /sessions/auth, which keeps it in an HttpOnly cookie for /sessions, and is
// dropped from this page: proxied sites run on this origin, so no script here
// keeps it. Both ways lead to the account's one list of sessions.
//
// Framed by the console (in its tab or its about:blank window), the same form
// shows whenever the console hasn't handed over a sign-in it can use. That
// proxy-only token stays in memory for this frame, like the console's: the
// sign-in cookie is SameSite=Strict, so a frame on another site never gets it
// back.
(function () {
  const section = document.getElementById("sj-sessions");
  if (!section) return;
  const whoEl = document.getElementById("sj-sess-who");
  const currentEl = document.getElementById("sj-sess-current");
  const listEl = document.getElementById("sj-sess-list");
  const msgEl = document.getElementById("sj-sess-msg");
  const newBtn = document.getElementById("sj-sess-new");
  const saveBtn = document.getElementById("sj-sess-save");
  const actionsEl = document.getElementById("sj-sess-actions");

  const ACTIVE_KEY = "sj-active-session";
  // Scramjet's localStorage keys for proxied sites: "<host>@<key>".
  const PROXIED_KEY = /^[a-z0-9.-]+(:\d{1,5})?@/i;
  const MAX_VALUE = 512 * 1024;   // a single huge cache entry isn't worth saving
  const AUTOSAVE_MS = 30 * 1000;

  const embedded = window.parent && window.parent !== window;
  const AUTH_BASE = String((typeof _CONFIG === "object" && _CONFIG && _CONFIG.authUrl) || "https://donnajbe.viztrrx.workers.dev").replace(/\/+$/, "");
  // { user, token } from the console, { user, token: "", viaCookie: true }
  // when Saints Search signed in on its own (the token is in the cookie), or
  // { user, token, own: true } when it signed in on its own while framed.
  let account = null;
  // A console token /sessions refused: ignored until the console sends another.
  let refusedConsoleToken = "";
  let sessions = [];         // this account's saved sessions (metadata)
  let loaded = false;        // list fetched for the current account
  let loadError = false;     // the list couldn't be fetched (browsing isn't held up then)
  let working = false;       // a resume/new/delete is running
  let lastSaved = "";        // the snapshot last saved for the active session
  let saving = null;

  // ---- Small helpers --------------------------------------------------------
  function readActive() {
    try {
      const v = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
      return v && typeof v.id === "string" && typeof v.user === "string" ? v : null;
    } catch { return null; }
  }
  function writeActive(v) {
    try { v ? localStorage.setItem(ACTIVE_KEY, JSON.stringify(v)) : localStorage.removeItem(ACTIVE_KEY); } catch {}
  }
  const mine = (a) => !!(a && account && a.user === account.user);
  function say(text, isError) {
    msgEl.textContent = text || "";
    msgEl.classList.toggle("is-error", !!isError);
  }
  function ago(ms) {
    if (!ms) return "";
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return new Date(ms).toLocaleDateString();
  }
  // "accounts.google.com" and ".google.com" are both google.com in the list.
  function siteOf(host) {
    const parts = String(host).replace(/^\./, "").replace(/:\d+$/, "").toLowerCase().split(".").filter(Boolean);
    if (parts.length <= 2) return parts.join(".");
    const two = parts.slice(-2).join(".");
    return /^(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/.test(two) ? parts.slice(-3).join(".") : two;
  }

  // ---- The API (same origin; the Worker checks the token) ------------------
  async function api(method, path, body) {
    if (!account) throw new Error("Sign in to Saints first.");
    const init = { method, headers: account.token ? { "X-GPA-Session": account.token } : {}, cache: "no-store" };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const r = await fetch("/sessions" + path, init);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) {
      const err = new Error(d.error || "The server answered HTTP " + r.status + ".");
      err.status = r.status;
      // The sign-in ended (expired, revoked, signed out elsewhere): back to
      // the sign-in form. A console token that stopped working is set aside
      // so the form can take over until the console signs in again.
      if (account && (r.status === 401 || r.status === 403)) {
        if (!account.viaCookie && !account.own) refusedConsoleToken = account.token;
        signedOut(d.error);
      }
      throw err;
    }
    return d;
  }

  // ---- The service worker's cookie jar -------------------------------------
  async function worker(type, extra) {
    if (!globalThis.saintsBrowser || !navigator.serviceWorker) throw new Error("This browser can't run the proxy.");
    const reg = await globalThis.saintsBrowser.worker();
    const target = reg.active || navigator.serviceWorker.controller;
    if (!target) throw new Error("The proxy worker isn't running yet. Try again.");
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error("The proxy worker didn't answer. Try again.")), 10000);
      channel.port1.onmessage = (e) => {
        clearTimeout(timer);
        if (e.data && e.data.ok) resolve(e.data);
        else reject(new Error((e.data && e.data.error) || "The proxy worker failed."));
      };
      target.postMessage({ saintsSessions: 1, type, ...extra }, [channel.port2]);
    });
  }

  // ---- Spotify's cookie jar (Scramjet 2, public/s2/) -------------------------
  // Scramjet 2's controller keeps its jar in IndexedDB ("__scramjet_controller",
  // store "state", key "cookies": {updatedAt, cookies}) on this origin, and
  // reloads it in every open page when told on its BroadcastChannel. It's read
  // and written here directly, so it works on a device that never opened
  // Spotify yet. The Scramjet 2 beta build has no second jar: its service
  // worker's jar (worker() above) is this one.
  const JAR2_DB = "__scramjet_controller";
  const JAR2_STORE = "state";
  const JAR2_KEY = "cookies";
  const JAR2_CHANNEL = "__scramjet_controller_channel";
  const hasJar2 = () => globalThis.saintsEngine?.version !== 2 && !!globalThis.saintsSpotify && typeof indexedDB !== "undefined";
  function jar2Request(mode, run) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(JAR2_DB, 1);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(JAR2_STORE)) open.result.createObjectStore(JAR2_STORE);
      };
      open.onerror = () => reject(open.error || new Error("Spotify's cookie store couldn't be opened."));
      open.onsuccess = () => {
        const db = open.result;
        try {
          const tx = db.transaction(JAR2_STORE, mode);
          const result = run(tx.objectStore(JAR2_STORE));
          tx.oncomplete = () => { db.close(); resolve(result.result); };
          tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error("Spotify's cookie store transaction was aborted.")); };
        } catch (cause) { db.close(); reject(cause); }
      };
    });
  }
  async function dumpJar2() {
    const state = await jar2Request("readonly", (store) => store.get(JAR2_KEY));
    return state && typeof state.cookies === "string" ? state.cookies : "{}";
  }
  async function loadJar2(cookies) {
    let text = "{}";
    try {
      const parsed = JSON.parse(typeof cookies === "string" && cookies ? cookies : "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) text = JSON.stringify(parsed);
    } catch {}
    const current = await jar2Request("readonly", (store) => store.get(JAR2_KEY));
    // Newer than anything a controller has, so open pages take this one.
    const updatedAt = Math.max(Date.now(), ((current && current.updatedAt) || 0) + 1);
    await jar2Request("readwrite", (store) => store.put({ updatedAt, cookies: text }, JAR2_KEY));
    try { const channel = new BroadcastChannel(JAR2_CHANNEL); channel.postMessage({ updatedAt }); channel.close(); } catch {}
  }

  // ---- Proxied sites' localStorage -----------------------------------------
  function proxiedKeys() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && PROXIED_KEY.test(k)) keys.push(k);
      }
    } catch {}
    return keys;
  }
  function readStorage() {
    const out = {};
    for (const k of proxiedKeys()) {
      const v = localStorage.getItem(k);
      if (typeof v === "string" && v.length <= MAX_VALUE) out[k] = v;
    }
    return out;
  }
  function replaceStorage(map) {
    for (const k of proxiedKeys()) { try { localStorage.removeItem(k); } catch {} }
    for (const [k, v] of Object.entries(map || {})) {
      if (PROXIED_KEY.test(k) && typeof v === "string") { try { localStorage.setItem(k, v); } catch {} }
    }
  }

  async function snapshot() {
    const { cookies } = await worker("dump");
    const cookies2 = hasJar2() ? await dumpJar2() : undefined;
    const storage = readStorage();
    const sites = new Set();
    for (const jar of [cookies, cookies2]) {
      try { for (const c of Object.values(JSON.parse(jar || "{}"))) if (c && c.domain) sites.add(siteOf(c.domain)); } catch {}
    }
    for (const k of Object.keys(storage)) sites.add(siteOf(k.slice(0, k.indexOf("@"))));
    sites.delete("");
    return snap(cookies, cookies2, storage, [...sites].sort());
  }
  // A snapshot, in the same shape whether it was just taken or downloaded,
  // so comparing their JSON says whether anything changed. cookies2 (Spotify's
  // Scramjet 2 jar) is left out where there's no second jar (the beta build).
  function snap(cookies, cookies2, storage, sites) {
    const out = { cookies: cookies || "{}" };
    if (hasJar2()) out.cookies2 = cookies2 || "{}";
    out.storage = storage || {};
    out.sites = sites || [];
    return out;
  }

  // Saves the active session if it belongs to the signed-in account and
  // something changed. persist() throws on failure; save() only reports it.
  async function persist() {
      const active = readActive();
      if (!mine(active)) return;
      const snap = await snapshot();
      const text = JSON.stringify(snap);
      if (text === lastSaved) return;
      try {
        const d = await api("PUT", "/" + active.id, snap);
        lastSaved = text;
        const i = sessions.findIndex((s) => s.id === active.id);
        if (i >= 0) sessions[i] = { ...sessions[i], ...d.session };
        render();
      } catch (cause) {
        if (cause.status === 404) {
          // Deleted from another device: what's here is no longer saved anywhere.
          writeActive(null);
          lastSaved = "";
          await refresh();
          say("This session was deleted on another device. Save it again to keep these sign-ins.", true);
        } else throw cause;
      }
  }
  function save() {
    saving ??= persist()
      .catch((cause) => { say("Couldn't save your session: " + cause.message, true); })
      .finally(() => { saving = null; });
    return saving;
  }

  // ---- Actions --------------------------------------------------------------
  function browserBusy() {
    return !!(globalThis.saintsBrowser && globalThis.saintsBrowser.isBusy());
  }
  // Runs one action at a time; true when it finished without an error.
  async function run(label, fn) {
    if (working || !account) return false;
    if (browserBusy()) { say("Wait for the page to finish opening, then try again.", true); return false; }
    working = true;
    render();
    say(label);
    try {
      await fn();
      return true;
    } catch (cause) {
      say(cause.message || String(cause), true);
      return false;
    } finally {
      working = false;
      render();
    }
  }
  // Every tab closes before the jar changes, so no page keeps the old sign-ins.
  function closeTabs() {
    if (globalThis.saintsBrowser) globalThis.saintsBrowser.closeAllTabs();
  }
  async function clearHere() {
    await worker("clear");
    if (hasJar2()) await loadJar2("{}");
    replaceStorage({});
    lastSaved = "";
  }

  function resume(s) {
    return run("Opening “" + s.name + "”…", async () => {
      const active = readActive();
      if (mine(active) && active.id !== s.id) await save();
      const d = await api("GET", "/" + s.id);
      closeTabs();
      await worker("load", { cookies: d.session.cookies || "{}" });
      // Sessions saved before Spotify had its own jar have none: it starts empty.
      if (hasJar2()) await loadJar2(d.session.cookies2 || "{}");
      replaceStorage(d.session.storage || {});
      writeActive({ user: account.user, id: s.id, name: d.session.name });
      lastSaved = JSON.stringify(snap(d.session.cookies, d.session.cookies2, d.session.storage, d.session.sites));
      say("“" + d.session.name + "” is open. Sites you open now use its sign-ins.");
    });
  }
  function startNew(name) {
    return run("Starting “" + name + "”…", async () => {
      const active = readActive();
      if (mine(active)) await save();
      const d = await api("POST", "", { name });
      closeTabs();
      await clearHere();
      writeActive({ user: account.user, id: d.session.id, name: d.session.name });
      sessions.unshift(d.session);
      say("“" + d.session.name + "” started with no sign-ins. Sites you sign in to are saved to it.");
    });
  }
  // Keeps what's signed in right now (used before sessions existed, or after
  // leaving a session) as a new saved session.
  function saveCurrent() {
    const name = typeof prompt === "function" ? prompt("Name this session", "") : null;
    if (name === null || !name.trim()) return;
    return run("Saving…", async () => {
      const d = await api("POST", "", { name: name.trim() });
      writeActive({ user: account.user, id: d.session.id, name: d.session.name });
      sessions.unshift(d.session);
      lastSaved = "";
      await save();
      say("Saved as “" + d.session.name + "”.");
    });
  }
  // Stops using the active session: it's saved, every tab closes and the
  // sign-ins leave this browser until it's resumed. Nothing is cleared if the
  // save fails.
  function pause() {
    const active = readActive();
    if (!mine(active)) return;
    return run("Pausing “" + active.name + "”…", async () => {
      if (saving) await saving;
      await persist();
      closeTabs();
      await clearHere();
      writeActive(null);
      say("“" + active.name + "” is paused. Resume it to pick up where you left off.");
    });
  }
  function rename(s) {
    const name = typeof prompt === "function" ? prompt("Name this session", s.name) : null;
    if (name === null || !name.trim() || name.trim() === s.name) return;
    return run("Renaming…", async () => {
      const d = await api("PUT", "/" + s.id, { name });
      Object.assign(s, d.session);
      const active = readActive();
      if (mine(active) && active.id === s.id) writeActive({ ...active, name: d.session.name });
      say("");
    });
  }
  function remove(s) {
    const active = readActive();
    const isActive = mine(active) && active.id === s.id;
    const warning = "Delete “" + s.name + "”? Its saved sign-ins are erased" +
      (isActive ? " and every open tab closes." : ".");
    if (typeof confirm === "function" && !confirm(warning)) return;
    return run("Deleting…", async () => {
      await api("DELETE", "/" + s.id);
      sessions = sessions.filter((x) => x.id !== s.id);
      if (isActive) {
        closeTabs();
        await clearHere();
        writeActive(null);
      }
      say("Deleted “" + s.name + "”.");
    });
  }

  // ---- Account changes from the console -----------------------------------
  async function refresh() {
    if (!account) return;
    try {
      const d = await api("GET", "");
      sessions = d.sessions || [];
      loaded = true;
      loadError = false;
      const active = readActive();
      if (mine(active) && !sessions.some((s) => s.id === active.id)) writeActive(null);
    } catch (cause) {
      loadError = true;
      say(cause.message, true);
    }
    render();
  }
  async function setAccount(user, token, viaCookie, own) {
    const next = user && (token || viaCookie)
      ? { user: String(user).toLowerCase(), token: viaCookie ? "" : String(token), viaCookie: !!viaCookie, own: !!own }
      : null;
    const changedUser = (account && account.user) !== (next && next.user);
    account = next;
    if (!changedUser) { render(); return; }
    sessions = [];
    loaded = false;
    loadError = false;
    closePicker();
    say("");
    const active = readActive();
    if (account && active && active.user !== account.user) {
      // Someone else signed in on this device: don't hand them the last
      // person's sign-ins. That person's session is already saved.
      working = true;
      try { closeTabs(); await clearHere(); } catch {}
      working = false;
      writeActive(null);
    }
    render();
    await refresh();
  }

  if (embedded) {
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const d = event.data;
      if (!d || d.saintsProxy !== 1 || d.type !== "account") return;
      const user = typeof d.user === "string" ? d.user : "";
      const token = typeof d.token === "string" ? d.token : "";
      // The console has no sign-in this page can use: keep the one made here.
      if ((!token || token === refusedConsoleToken) && account && account.own) return;
      if (token && token === refusedConsoleToken) { if (!account) render(); return; }
      if (token) refusedConsoleToken = "";
      void setAccount(user, token);
    });
    // Ask for the account in case the console's message came before this ran.
    try { window.parent.postMessage({ saintsProxy: 1, type: "account?" }, "*"); } catch {}
  }

  // ---- Saints Search's own sign-in (not framed by the console) --------------
  // The console's PIN verifier: PBKDF2-SHA256 of "gpa-server|<name>|<PIN>",
  // salt "gpa-server-salt|<name>", 210000 rounds (script.js serverVerifier).
  async function verifierFor(user, pin) {
    const u = String(user).toLowerCase();
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode("gpa-server|" + u + "|" + pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("gpa-server-salt|" + u), iterations: 210000 }, key, 256);
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // This browser's id for the Saints Worker's device lockouts.
  function deviceId() {
    try {
      let id = localStorage.getItem("sj-device-id");
      if (!/^[0-9a-f]{32}$/.test(id || "")) {
        id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem("sj-device-id", id);
      }
      return id;
    } catch { return ""; }
  }
  async function authPost(path, body, token) {
    // text/plain, as the console sends it: no CORS preflight.
    const headers = { "Content-Type": "text/plain" };
    if (token) headers["X-GPA-Session"] = token;
    let r;
    try {
      r = await fetch(AUTH_BASE + path, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
    } catch {
      throw new Error("Couldn’t reach Saints to sign in. Check your connection and try again.");
    }
    const d = await r.json().catch(() => ({}));
    return { status: r.status, data: d };
  }
  // Keeps the proxy-only token in the sign-in cookie (/sessions/auth).
  async function keepToken(token) {
    const r = await fetch("/sessions/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || "Saints Search couldn’t keep your sign-in (HTTP " + r.status + ").");
    return d.user;
  }

  let signIn = null;   // the sign-in form's elements, built on first use
  function buildSignIn() {
    const form = document.createElement("form");
    form.className = "ss-signin";
    form.setAttribute("autocomplete", "off");
    form.innerHTML =
      '<p class="ss-pick-text">Sign in with your Saints account (the name and PIN you use in the Saints console) to save the sites you sign in to and pick them up on any device.</p>' +
      '<div class="ss-signin-fields">' +
      '<label class="ss-pick-label" for="ss-in-user">Name</label>' +
      '<input id="ss-in-user" class="ss-pick-input" type="text" maxlength="40" autocomplete="username" autocapitalize="off" spellcheck="false" />' +
      '<label class="ss-pick-label" for="ss-in-pin">PIN</label>' +
      '<input id="ss-in-pin" class="ss-pick-input" type="password" maxlength="64" autocomplete="current-password" inputmode="numeric" />' +
      "</div>" +
      '<div class="ss-sess-actions"><button type="submit" class="ss-sess-btn is-primary">Sign in</button></div>';
    const sid = document.createElement("form");
    sid.className = "ss-signin";
    sid.hidden = true;
    sid.setAttribute("autocomplete", "off");
    sid.innerHTML =
      '<p class="ss-pick-text">Your account needs your <b>school student number</b> before you can continue, as in the Saints console. It’s your 6-digit number (your school email is that number @alseducation.onmicrosoft.com), and it’s how you reset your PIN if you forget it. Type <b>your own</b> number: once it’s saved, only the owner can change it.</p>' +
      '<label class="ss-signin-check"><input type="checkbox" id="ss-sid-ok" /> The number I’m typing is my own student number.</label>' +
      '<div class="ss-signin-fields">' +
      '<label class="ss-pick-label" for="ss-sid-1">Student number</label>' +
      '<input id="ss-sid-1" class="ss-pick-input" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="off" />' +
      '<label class="ss-pick-label" for="ss-sid-2">Type it again</label>' +
      '<input id="ss-sid-2" class="ss-pick-input" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="off" />' +
      "</div>" +
      '<div class="ss-sess-actions"><button type="submit" class="ss-sess-btn is-primary">Save my student number</button><button type="button" class="ss-sess-btn ss-sid-cancel">Cancel</button></div>';
    currentEl.after(form, sid);
    signIn = { form, sid, user: form.querySelector("#ss-in-user"), pin: form.querySelector("#ss-in-pin"), pending: "", pendingUser: "" };
    form.addEventListener("submit", (event) => { event.preventDefault(); void submitSignIn(); });
    sid.addEventListener("submit", (event) => { event.preventDefault(); void submitStudentId(); });
    sid.querySelector(".ss-sid-cancel").addEventListener("click", () => {
      signIn.pending = "";
      sid.hidden = true;
      form.hidden = false;
      say("");
    });
    for (const input of sid.querySelectorAll("input[inputmode]")) {
      input.addEventListener("input", () => { const v = input.value.replace(/\D/g, "").slice(0, 6); if (v !== input.value) input.value = v; });
    }
  }
  function signInBusy(on) {
    working = on;
    for (const el of signIn.form.querySelectorAll("input, button")) el.disabled = on;
    for (const el of signIn.sid.querySelectorAll("input, button")) el.disabled = on;
  }
  async function submitSignIn() {
    if (working) return;
    const user = signIn.user.value.trim();
    const pin = signIn.pin.value;
    if (!user || !pin) { say("Type your Saints name and PIN.", true); return; }
    if (browserBusy()) { say("Wait for the page to finish opening, then try again.", true); return; }
    signInBusy(true);
    say("Signing in…");
    try {
      // No page keeps running while a token is in this page.
      closeTabs();
      const verifier = await verifierFor(user, pin);
      const r = await authPost("/auth/proxy-login", { user, verifier, device: deviceId() });
      if (r.status !== 200 || !r.data.ok || !r.data.token) {
        say(r.data.error || "Saints didn’t accept that sign-in (HTTP " + r.status + ").", true);
        return;
      }
      signIn.pin.value = "";
      const signedInAs = (r.data.account && r.data.account.user) || user;
      if (r.data.account && r.data.account.needsStudentId) {
        // Kept only until the number is saved (or this is cancelled).
        signIn.pending = r.data.token;
        signIn.pendingUser = signedInAs;
        signIn.form.hidden = true;
        signIn.sid.hidden = false;
        say("");
        return;
      }
      await finishSignIn(r.data.token, signedInAs);
    } catch (cause) {
      say(cause.message || String(cause), true);
    } finally {
      signInBusy(false);
    }
  }
  async function submitStudentId() {
    if (working || !signIn.pending) return;
    const a = signIn.sid.querySelector("#ss-sid-1").value;
    const b = signIn.sid.querySelector("#ss-sid-2").value;
    if (!signIn.sid.querySelector("#ss-sid-ok").checked) { say("Check the box first: the number must be your own.", true); return; }
    if (!/^\d{6}$/.test(a) || a !== b) { say("Type the same 6 digits in both boxes.", true); return; }
    signInBusy(true);
    say("Saving…");
    try {
      const r = await authPost("/auth/student-id", { studentId: a, confirm: b }, signIn.pending);
      if (!r.data.ok && !r.data.saved) { say(r.data.error || "Couldn’t save it. Try again.", true); return; }
      const token = signIn.pending;
      const user = signIn.pendingUser;
      signIn.pending = "";
      signIn.pendingUser = "";
      await finishSignIn(token, user);
    } catch (cause) {
      say(cause.message || String(cause), true);
    } finally {
      signInBusy(false);
    }
  }
  async function finishSignIn(token, user) {
    // Framed: the cookie wouldn't come back, so the token stays in memory.
    if (!embedded) user = await keepToken(token);
    signIn.sid.hidden = true;
    signIn.form.hidden = false;
    say("");
    working = false;
    if (embedded) await setAccount(user, token, false, true);
    else await setAccount(user, "", true);
  }
  // Pauses the active session (saved first), closes every tab, clears this
  // browser's sign-ins and ends the proxy-only token.
  function signOut() {
    if (!account || !(account.viaCookie || account.own)) return;
    return run("Signing out…", async () => {
      if (saving) await saving;
      if (mine(readActive())) await persist();
      closeTabs();
      await clearHere();
      writeActive(null);
      if (account.own) await authPost("/auth/proxy-logout", {}, account.token).catch(() => {});
      else await fetch("/sessions/auth/logout", { method: "POST", cache: "no-store" }).catch(() => {});
      account = null;
      sessions = [];
      loaded = false;
      say("Signed out. Your sessions are saved to your account.");
    });
  }
  // The sign-in cookie stopped working (the API said so).
  function signedOut(message) {
    account = null;
    sessions = [];
    loaded = false;
    closePicker();
    render();
    if (message) setTimeout(() => say(message, true), 0);
  }
  // Signed in here before? The cookie says who (or nothing).
  async function restoreSignIn() {
    try {
      const r = await fetch("/sessions/whoami", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok && d.user) { await setAccount(d.user, "", true); return; }
      if (d.error && r.status !== 401) say(d.error, true);
    } catch {}
    render();
  }

  // ---- Rendering ------------------------------------------------------------
  function button(label, cls, onClick, disabled) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ss-sess-btn" + (cls ? " " + cls : "");
    b.textContent = label;
    b.disabled = !!disabled;
    b.addEventListener("click", onClick);
    return b;
  }
  let signOutBtn = null;
  function render() {
    section.hidden = false;
    if (!signIn) buildSignIn();
    if (signIn) signIn.form.hidden = !!account || !signIn.sid.hidden;
    if (!account) {
      whoEl.textContent = "";
      actionsEl.hidden = true;
      listEl.replaceChildren();
      currentEl.textContent = "";
      return;
    }
    if (signIn) signIn.sid.hidden = true;
    whoEl.textContent = account.user;
    actionsEl.hidden = false;
    const ownSignIn = account.viaCookie || account.own;
    if (ownSignIn && !signOutBtn) {
      signOutBtn = button("Sign out", "", () => signOut(), false);
      actionsEl.appendChild(signOutBtn);
    }
    if (signOutBtn) { signOutBtn.hidden = !ownSignIn; signOutBtn.disabled = working; }
    const active = readActive();
    const activeId = mine(active) ? active.id : "";
    newBtn.disabled = working;
    saveBtn.hidden = !!activeId;
    saveBtn.disabled = working;
    currentEl.textContent = !loaded ? (loadError ? "Your sessions couldn't be loaded." : "Loading your sessions…")
      : activeId ? "Using “" + (sessions.find((s) => s.id === activeId) || active).name + "”. New sign-ins are saved to it automatically."
      : sessions.length ? "Resume a session or start a new one to start browsing."
      : "Start a session to start browsing: the sites you sign in to stay signed in next time.";

    listEl.replaceChildren(...sessions.map((s) => sessionItem(s, activeId, true)));
    if (picker && !picker.hidden) renderPicker();
  }

  // ---- Labels ---------------------------------------------------------------
  function when(ms) {
    if (!ms) return "";
    try { return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; }
  }
  function siteList(s) {
    const sites = s.sites || [];
    if (!sites.length) return "No sign-ins saved yet";
    return (sites.length === 1 ? "1 site: " : sites.length + " sites: ") + sites.slice(0, 4).join(", ") + (sites.length > 4 ? " +" + (sites.length - 4) + " more" : "");
  }
  // One session in a list: its name, status, when it was made and last used,
  // and the sites it has sign-ins for. full adds Pause/Rename/Delete.
  function sessionItem(s, activeId, full) {
    const li = document.createElement("li");
    const isActive = s.id === activeId;
    li.className = "ss-sess" + (isActive ? " is-active" : "");
    const info = document.createElement("div");
    info.className = "ss-sess-info";
    const name = document.createElement("span");
    name.className = "ss-sess-name";
    name.textContent = s.name;
    const badge = document.createElement("span");
    badge.className = "ss-sess-status" + (isActive ? " is-active" : "");
    badge.textContent = isActive ? "Active" : "Paused";
    name.append(" ", badge);
    const dates = document.createElement("span");
    dates.className = "ss-sess-meta";
    dates.textContent = [s.createdAt ? "Created " + when(s.createdAt) : "", s.updatedAt ? "last used " + ago(s.updatedAt) : ""].filter(Boolean).join(" · ");
    const sites = document.createElement("span");
    sites.className = "ss-sess-meta";
    sites.textContent = siteList(s);
    sites.title = (s.sites || []).join(", ");
    info.append(name, dates, sites);
    const buttons = document.createElement("div");
    buttons.className = "ss-sess-btns";
    if (isActive) {
      if (full) buttons.append(button("Pause", "", () => pause(), working));
    } else {
      buttons.append(button("Resume", "is-primary", () => resumeThenOpen(s), working));
    }
    if (full) buttons.append(button("Rename", "", () => rename(s), working), button("Delete", "is-danger", () => remove(s), working));
    li.append(info, buttons);
    return li;
  }

  // ---- Starting or resuming before browsing --------------------------------
  // Signed in from the console, sites only open inside a session, so what
  // people do is saved to one they can find again. The picker asks for a name
  // for a new session or offers the saved ones; the site they were opening
  // opens once one is active.
  let picker = null;
  let pendingOpen = null;
  function buildPicker() {
    picker = document.createElement("div");
    picker.className = "ss-pick";
    picker.hidden = true;
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-modal", "true");
    picker.setAttribute("aria-labelledby", "ss-pick-title");
    picker.innerHTML =
      '<div class="ss-pick-box">' +
      '<h2 id="ss-pick-title" class="ss-pick-title">Start a session</h2>' +
      '<p class="ss-pick-text">A session keeps your sign-ins and site data, so you can come back to it later. Name a new one, or resume one you started before.</p>' +
      '<form class="ss-pick-form"><label class="ss-pick-label" for="ss-pick-name">Session name</label>' +
      '<div class="ss-pick-row"><input id="ss-pick-name" class="ss-pick-input" type="text" maxlength="60" autocomplete="off" placeholder="For example: Homework, Music, Games" />' +
      '<button type="submit" class="ss-sess-btn is-primary">Start session</button></div>' +
      '<p class="ss-pick-error" role="alert"></p></form>' +
      '<div class="ss-pick-saved"><p class="ss-apps-label">Or resume</p><ul class="ss-sess-list"></ul></div>' +
      '<div class="ss-pick-foot"><button type="button" class="ss-sess-btn ss-pick-cancel">Cancel</button></div>' +
      "</div>";
    const form = picker.querySelector("form");
    const input = picker.querySelector("input");
    const error = picker.querySelector(".ss-pick-error");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = input.value.replace(/\s+/g, " ").trim();
      if (!name) { error.textContent = "Give the session a name."; input.focus(); return; }
      error.textContent = "";
      if (await startNew(name)) finishPicker();
      else error.textContent = msgEl.textContent || "The session couldn't be started.";
    });
    picker.querySelector(".ss-pick-cancel").addEventListener("click", () => closePicker());
    picker.addEventListener("keydown", (event) => { if (event.key === "Escape") closePicker(); });
    document.body.appendChild(picker);
  }
  function renderPicker() {
    const list = picker.querySelector(".ss-sess-list");
    list.replaceChildren(...sessions.map((s) => sessionItem(s, "", false)));
    picker.querySelector(".ss-pick-saved").hidden = !sessions.length;
    for (const el of picker.querySelectorAll("button, input")) el.disabled = working;
  }
  function openPicker(onReady) {
    if (!account) return;
    if (!picker) buildPicker();
    pendingOpen = typeof onReady === "function" ? onReady : null;
    picker.querySelector(".ss-pick-error").textContent = "";
    picker.querySelector("input").value = "";
    renderPicker();
    picker.hidden = false;
    picker.querySelector("input").focus();
  }
  function closePicker() {
    if (picker) picker.hidden = true;
    pendingOpen = null;
  }
  function finishPicker() {
    const next = pendingOpen;
    closePicker();
    if (next) next();
  }
  async function resumeThenOpen(s) {
    if (await resume(s) && picker && !picker.hidden) finishPicker();
  }
  // Whether opening a site has to wait for a session (index.js asks):
  // signed in (from the console or here), sites open inside one.
  function required() {
    return !!account && loaded && !loadError && !mine(readActive());
  }

  newBtn.addEventListener("click", () => openPicker(null));
  saveBtn.addEventListener("click", () => saveCurrent());

  // Keep the active session saved: on a timer while browsing, when the tab is
  // hidden, and when the browser goes back to saints://home (index.js).
  setInterval(() => { if (!working && mine(readActive())) void save(); }, AUTOSAVE_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && !working && mine(readActive())) void save();
  });
  globalThis.saintsSessions = {
    changed: () => { if (!working && mine(readActive())) void save(); },
    required,
    ask: (onReady) => openPicker(onReady),
  };

  render();
  if (!embedded) void restoreSignIn();
})();
