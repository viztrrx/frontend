// Static frontend Worker; assets are produced by scripts/build.mjs.
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    // Match the isolation headers used by Scramjet-App's original server.
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    const pathname = new URL(request.url).pathname;
    // Avoid stale configuration, boot scripts and service worker code after deployment.
    if (["/config.js", "/index.js", "/register-sw.js", "/sw.js", "/version.json"].includes(pathname)) {
      headers.set("Cache-Control", "no-store");
    }
    return new Response(response.body, { status: response.status, headers });
  },
};
