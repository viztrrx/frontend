// Static frontend Worker; assets are produced by scripts/build.mjs.

// Only plausible public hostnames, and the value is only ever handed to a
// favicon service (never fetched directly), so there is no SSRF surface.
function validIconDomain(d) {
  return d.length >= 4 && d.length <= 100 && /^[a-z0-9.-]+$/.test(d) &&
    d.includes(".") && !/^[.-]|[.-]$|\.\.|--/.test(d);
}

// /icon?d=<domain> — fetch that site's own published favicon live from a
// favicon service and return it from this origin, so a cross-origin-isolated
// (COEP) page can show it. No logo artwork is stored here; the home page
// falls back to a monogram when this 404s.
async function iconResponse(url) {
  const d = (url.searchParams.get("d") || "").toLowerCase();
  if (!validIconDomain(d)) return new Response("bad domain", { status: 400 });
  const sources = [
    // Google's faviconV2 returns a clean 64px icon for most sites; the others
    // are fallbacks if it has none.
    "https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=64&url=https://" + d,
    "https://icons.duckduckgo.com/ip3/" + d + ".ico",
    "https://www.google.com/s2/favicons?sz=64&domain=" + d,
  ];
  for (const src of sources) {
    try {
      const r = await fetch(src, { cf: { cacheTtl: 86400, cacheEverything: true } });
      const type = r.headers.get("content-type") || "";
      if (r.ok && type.startsWith("image/")) {
        const headers = new Headers();
        headers.set("content-type", type);
        headers.set("cross-origin-resource-policy", "same-origin");
        headers.set("cache-control", "public, max-age=86400");
        return new Response(r.body, { status: 200, headers });
      }
    } catch (e) {
      /* try the next source */
    }
  }
  return new Response("no icon", { status: 404 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/icon") return iconResponse(url);

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    // Match the isolation headers used by Scramjet-App's original server.
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    // Avoid stale configuration, boot scripts and service worker code after deployment.
    if (["/config.js", "/index.js", "/register-sw.js", "/sw.js", "/version.json"].includes(url.pathname)) {
      headers.set("Cache-Control", "no-store");
    }
    return new Response(response.body, { status: response.status, headers });
  },
};
