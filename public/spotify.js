"use strict";

// Spotify only works through Scramjet 2, so Saints Search opens Spotify's
// sites with Scramjet 2 (public/s2/) and every other site with Scramjet 1.1.
// This decides which addresses are Spotify's.
(function () {
  // A site is Spotify's when its hostname is one of these or ends in "." + one.
  const SPOTIFY_DOMAINS = [
    "spotify.com",       // open., accounts., www., …
    "spotify.link",      // share links
    "spoti.fi",          // short links
    "spotify.app.link",  // app share links
    "scdn.co",           // Spotify's CDN (covers, previews)
    "spotifycdn.com",
    "spotifycdn.net",
    "pscdn.co",          // podcast CDN
  ];

  function isSpotify(url) {
    let host = "";
    try { host = new URL(String(url)).hostname.toLowerCase().replace(/\.$/, ""); } catch { return false; }
    return SPOTIFY_DOMAINS.some((domain) => host === domain || host.endsWith("." + domain));
  }

  globalThis.saintsSpotify = { isSpotify, domains: SPOTIFY_DOMAINS.slice() };
})();
