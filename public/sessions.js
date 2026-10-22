"use strict";

// Saved sessions on saints://home: pick one of your account's sessions and
// carry on signed in to the sites you used in it, Rammerhead-style.
//
// What signs you in to a proxied site lives on this origin: Scramjet's cookie
// jar (in the service worker, see sw.js) and the site's localStorage, which
// Scramjet keeps here under "<host>@<key>". A session is a snapshot of both,
// saved per Saints account in R2 by the Worker (src/sessions.js). Resuming one
// closes every tab, swaps the jar and the storage, and the next site you open
// sees that session's sign-ins. The active session is saved again as you
// browse (only when something changed).
//
// The account comes from the Saints console that frames this page: it posts
// {saintsProxy:1, type:"account", user, token} whenever its sign-in changes.
// The token is only ever sent back to this origin's /sessions API.
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
  let account = null;        // { user, token } from the console
  let sessions = [];         // this account's saved sessions (metadata)
  let loaded = false;        // list fetched for the current account
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
    const init = { method, headers: { "X-GPA-Session": account.token }, cache: "no-store" };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const r = await fetch("/sessions" + path, init);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) {
      const err = new Error(d.error || "The server answered HTTP " + r.status + ".");
      err.status = r.status;
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
    const storage = readStorage();
    const sites = new Set();
    try { for (const c of Object.values(JSON.parse(cookies || "{}"))) if (c && c.domain) sites.add(siteOf(c.domain)); } catch {}
    for (const k of Object.keys(storage)) sites.add(siteOf(k.slice(0, k.indexOf("@"))));
    sites.delete("");
    return { cookies: cookies || "{}", storage, sites: [...sites].sort() };
  }

  // Saves the active session if it belongs to the signed-in account and
  // something changed. Quiet unless it fails.
  function save() {
    saving ??= (async () => {
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
    })().catch((cause) => { say("Couldn't save your session: " + cause.message, true); })
      .finally(() => { saving = null; });
    return saving;
  }

  // ---- Actions --------------------------------------------------------------
  function browserBusy() {
    return !!(globalThis.saintsBrowser && globalThis.saintsBrowser.isBusy());
  }
  async function run(label, fn) {
    if (working || !account) return;
    if (browserBusy()) { say("Wait for the page to finish opening, then try again.", true); return; }
    working = true;
    render();
    say(label);
    try {
      await fn();
    } catch (cause) {
      say(cause.message || String(cause), true);
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
      replaceStorage(d.session.storage || {});
      writeActive({ user: account.user, id: s.id, name: d.session.name });
      lastSaved = JSON.stringify({ cookies: d.session.cookies || "{}", storage: d.session.storage || {}, sites: d.session.sites || [] });
      say("“" + d.session.name + "” is open. Sites you open now use its sign-ins.");
    });
  }
  function startNew() {
    return run("Starting a new session…", async () => {
      const active = readActive();
      if (mine(active)) await save();
      const d = await api("POST", "", {});
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
    return run("Saving…", async () => {
      const d = await api("POST", "", {});
      writeActive({ user: account.user, id: d.session.id, name: d.session.name });
      sessions.unshift(d.session);
      lastSaved = "";
      await save();
      say("Saved as “" + d.session.name + "”.");
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
      const active = readActive();
      if (mine(active) && !sessions.some((s) => s.id === active.id)) writeActive(null);
    } catch (cause) {
      say(cause.message, true);
    }
    render();
  }
  async function setAccount(user, token) {
    const next = user && token ? { user: String(user).toLowerCase(), token: String(token) } : null;
    const changedUser = (account && account.user) !== (next && next.user);
    account = next;
    if (!changedUser) { render(); return; }
    sessions = [];
    loaded = false;
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
      void setAccount(typeof d.user === "string" ? d.user : "", typeof d.token === "string" ? d.token : "");
    });
    // Ask for the account in case the console's message came before this ran.
    try { window.parent.postMessage({ saintsProxy: 1, type: "account?" }, "*"); } catch {}
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
  function render() {
    section.hidden = false;
    if (!account) {
      whoEl.textContent = "";
      actionsEl.hidden = true;
      listEl.replaceChildren();
      currentEl.textContent = embedded
        ? "Sign in to the Saints console to save your sign-ins and pick them up here next time."
        : "Open Saints Search from the Saints console while signed in to use saved sessions.";
      return;
    }
    whoEl.textContent = account.user;
    actionsEl.hidden = false;
    const active = readActive();
    const activeId = mine(active) ? active.id : "";
    newBtn.disabled = working;
    saveBtn.hidden = !!activeId;
    saveBtn.disabled = working;
    currentEl.textContent = !loaded ? "Loading your sessions…"
      : activeId ? "Using “" + (sessions.find((s) => s.id === activeId) || active).name + "”. New sign-ins are saved to it automatically."
      : sessions.length ? "Pick a session to continue where you left off, or start a new one."
      : "No saved sessions yet. Start one and the sites you sign in to stay signed in next time.";

    const items = sessions.map((s) => {
      const li = document.createElement("li");
      li.className = "ss-sess" + (s.id === activeId ? " is-active" : "");
      const info = document.createElement("div");
      info.className = "ss-sess-info";
      const name = document.createElement("span");
      name.className = "ss-sess-name";
      name.textContent = s.name;
      const meta = document.createElement("span");
      meta.className = "ss-sess-meta";
      const sites = (s.sites || []).slice(0, 4).join(", ") + ((s.sites || []).length > 4 ? " +" + (s.sites.length - 4) : "");
      meta.textContent = (sites || "No sites yet") + (s.updatedAt ? " · " + ago(s.updatedAt) : "");
      info.append(name, meta);
      const buttons = document.createElement("div");
      buttons.className = "ss-sess-btns";
      buttons.append(
        s.id === activeId
          ? Object.assign(document.createElement("span"), { className: "ss-sess-badge", textContent: "Active" })
          : button("Resume", "is-primary", () => resume(s), working),
        button("Rename", "", () => rename(s), working),
        button("Delete", "is-danger", () => remove(s), working),
      );
      li.append(info, buttons);
      return li;
    });
    listEl.replaceChildren(...items);
  }

  newBtn.addEventListener("click", () => startNew());
  saveBtn.addEventListener("click", () => saveCurrent());

  // Keep the active session saved: on a timer while browsing, when the tab is
  // hidden, and when the browser goes back to saints://home (index.js).
  setInterval(() => { if (!working && mine(readActive())) void save(); }, AUTOSAVE_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && !working && mine(readActive())) void save();
  });
  globalThis.saintsSessions = { changed: () => { if (!working && mine(readActive())) void save(); } };

  render();
})();
