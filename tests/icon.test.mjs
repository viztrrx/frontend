import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.js";

const env = { ASSETS: { fetch: async () => new Response("asset", { status: 200 }) } };
const call = (path, realFetch) => {
  const saved = globalThis.fetch;
  if (realFetch) globalThis.fetch = realFetch;
  return worker.fetch(new Request("https://frontend.test" + path), env).finally(() => { globalThis.fetch = saved; });
};

test("/icon returns a site's favicon from this origin (CORP), monogram fallback on failure", async () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  let requested = "";
  const fakeFetch = async (input) => {
    requested = String(input);
    return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
  };
  const r = await call("/icon?d=tiktok.com", fakeFetch);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.equal(r.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.match(requested, /tiktok\.com/);
});

test("/icon rejects non-domains and never fetches them", async () => {
  let fetched = false;
  const spy = async () => { fetched = true; return new Response("", { status: 200 }); };
  for (const bad of ["", "localhost", "no-dot", "javascript:alert(1)", "a..b.com", "../etc", "http://x.com"]) {
    const r = await call("/icon?d=" + encodeURIComponent(bad), spy);
    assert.equal(r.status, 400, bad);
  }
  assert.equal(fetched, false, "a rejected domain is never fetched");
});

test("/icon 404s (not 500) when the favicon services have no image", async () => {
  const miss = async () => new Response("nope", { status: 404, headers: { "content-type": "text/plain" } });
  const r = await call("/icon?d=example.com", miss);
  assert.equal(r.status, 404);
});
