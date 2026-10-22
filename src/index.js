// Static frontend Worker; assets are produced by scripts/build.mjs.
import { handleSessions } from "./sessions.js";

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

// ---- Keeping the Render backend awake --------------------------------------
// Render's free plan puts the backend to sleep after 15 idle minutes, and the
// next visitor waits up to a minute for it. A cron trigger (wrangler.jsonc,
// every 10 minutes) calls its /health so it never gets there. The address is
// read from config.js, the file the browser uses, so moving the backend only
// means changing wispUrl there.
const FALLBACK_HEALTH_URL = "https://backend-ivvq.onrender.com/health";
export async function backendHealthUrl(env) {
  try {
    const r = await env.ASSETS.fetch("https://assets.local/config.js");
    const m = /wispUrl\s*:\s*["']([^"']+)["']/.exec(await r.text());
    if (m) {
      const u = new URL(m[1]);
      if (u.protocol === "wss:" || u.protocol === "ws:") {
        u.protocol = u.protocol === "wss:" ? "https:" : "http:";
        return u.origin + "/health";
      }
    }
  } catch {}
  return FALLBACK_HEALTH_URL;
}
export async function pingBackend(env) {
  const url = await backendHealthUrl(env);
  const started = Date.now();
  try {
    // Waking from sleep can take most of a minute.
    const r = await fetch(url, { headers: { "user-agent": "saints-service-keepalive" }, signal: AbortSignal.timeout(90000) });
    console.log("Backend " + url + " answered " + r.status + " in " + (Date.now() - started) + " ms");
    return r.status;
  } catch (cause) {
    console.error("Backend " + url + " didn't answer:", cause && cause.message);
    return 0;
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pingBackend(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/icon") return iconResponse(url);
    if (url.pathname === "/sessions" || url.pathname.startsWith("/sessions/")) {
      return handleSessions(request, env, url);
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    // Match the isolation headers used by Scramjet-App's original server.
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    // Avoid stale configuration, boot scripts and service worker code after deployment.
    if (["/config.js", "/index.js", "/sessions.js", "/blocked.js", "/register-sw.js", "/sw.js", "/version.json"].includes(url.pathname)) {
      headers.set("Cache-Control", "no-store");
    }
    return new Response(response.body, { status: response.status, headers });
  },
};
