// Static frontend Worker; assets are produced by scripts/build.mjs.
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    // Match the isolation headers used by Scramjet-App's original server.
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    return new Response(response.body, { status: response.status, headers });
  },
};
