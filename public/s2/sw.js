// Service worker for Spotify's Scramjet 2 frames (public/s2/), registered by
// engine2.js with scope /s2/, so it never handles Scramjet 1.1's pages at "/".
// Scramjet 2's controller does the fetching in the host page (host.js); this
// worker only hands proxied requests to it.
importScripts("/s2/controller/controller.sw.js");

self.addEventListener("fetch", (event) => {
  if ($scramjetController.shouldRoute(event)) event.respondWith($scramjetController.route(event));
});
