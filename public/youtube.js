"use strict";

// Opening YouTube through an Invidious instance instead of youtube.com.
//
// youtube.com's own site is a heavy web-components app that doesn't render
// through the proxy (the results feed stays blank). Invidious is a light,
// server-rendered YouTube frontend that renders and plays fine through the
// proxy, and the Invidious server fetches the video from YouTube itself, so
// YouTube sees the instance's IP, not this backend's.
//
// Public instances come and go (YouTube blocks them), so the instance is a
// setting the user controls: localStorage "sj-yt-instance" holds the base URL,
// empty turns the rewrite off (youtube.com is used as-is). self.saintsYouTube
// exposes the mapper and the setting for index.js and the home page control.
(function (scope) {
  const KEY = "sj-yt-instance";
  // A reasonable starting instance; change it when it stops working. The home
  // page field and the instances list (invidious.io) make that easy.
  const DEFAULT_INSTANCE = "https://yewtu.be";
  const YT_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|youtubekids\.com)$/i;

  function readInstance() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === null) return DEFAULT_INSTANCE;   // first run: on by default
      return v.trim();                           // "" = off
    } catch { return DEFAULT_INSTANCE; }
  }
  // Returns the cleaned https origin, or "" for off / invalid.
  function cleanInstance(value) {
    const v = String(value || "").trim();
    if (!v) return "";
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : "https://" + v);
      return u.protocol === "https:" && u.hostname.includes(".") ? u.origin : "";
    } catch { return ""; }
  }
  function writeInstance(value) {
    try { localStorage.setItem(KEY, cleanInstance(value)); } catch {}
  }

  // The 11-char YouTube video id from a youtube.com or youtu.be URL, or "".
  function videoId(u) {
    if (/(^|\.)youtu\.be$/i.test(u.hostname)) {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[\w-]{11}$/.test(id) ? id : "";
    }
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const m = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(u.pathname);
    return m ? m[1] : "";
  }

  // Maps a YouTube URL to the configured instance, or returns it unchanged
  // (not YouTube, rewrite off, or already on the instance).
  function mapYouTubeUrl(url, instanceOverride) {
    const base = instanceOverride === undefined ? readInstance() : cleanInstance(instanceOverride);
    if (!base) return url;
    let u;
    try { u = new URL(url); } catch { return url; }
    if (!YT_HOST.test(u.hostname)) return url;

    const inv = new URL(base);
    const id = videoId(u);
    if (id) {
      inv.pathname = "/watch";
      inv.searchParams.set("v", id);
      const t = u.searchParams.get("t") || u.searchParams.get("start");
      if (t) inv.searchParams.set("t", String(t).replace(/s$/i, ""));
      const list = u.searchParams.get("list");
      if (list) inv.searchParams.set("list", list);
      return inv.href;
    }
    if (u.pathname === "/results") {
      inv.pathname = "/search";
      const q = u.searchParams.get("search_query") || u.searchParams.get("q") || "";
      if (q) inv.searchParams.set("q", q);
      return inv.href;
    }
    // Channels, handles, playlists, feeds: carry the path over (Invidious
    // mirrors /channel, /@handle, /playlist, /feed/trending, …).
    if (u.pathname && u.pathname !== "/") {
      inv.pathname = u.pathname;
      u.searchParams.forEach((val, key) => inv.searchParams.set(key, val));
      return inv.href;
    }
    return inv.origin + "/";   // youtube.com/ or m.youtube.com/ → instance home
  }

  scope.saintsYouTube = { mapYouTubeUrl, readInstance, writeInstance, cleanInstance, DEFAULT_INSTANCE, KEY };
})(typeof self !== "undefined" ? self : globalThis);
