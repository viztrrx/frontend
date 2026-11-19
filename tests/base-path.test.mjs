// The site served under a path (BASE=/px): scripts/base-path.mjs moves its
// absolute paths in the built copy, and src/index.js's frontendFetch serves it
// from there (the Saints Worker mounts it at /px/).
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeBase, rewriteText, BASE_PATHS } from "../scripts/base-path.mjs";
import { frontendFetch } from "../src/index.js";

const root = new URL("..", import.meta.url);

test("normalizeBase accepts /px-style paths only", () => {
  assert.equal(normalizeBase(""), "");
  assert.equal(normalizeBase("/px/"), "/px");
  assert.equal(normalizeBase("/a/b-c"), "/a/b-c");
  for (const bad of ["px", "/", "/px?x", "//px", "/p x", "https://x/px"]) {
    if (bad === "/") { assert.equal(normalizeBase(bad), ""); continue; }
    assert.throws(() => normalizeBase(bad), /BASE must look like/, bad);
  }
});

test("rewriteText moves each quoted path once, longest prefix first", () => {
  const src = `a("/scram/x.js"); b('/scramjet/'); c(\`/scram/y\`); d("see /scram/z in docs"); e("/scramjet/" + "/scram/q");`;
  const { text, changed } = rewriteText(src, ["/scram/", "/scramjet/"], "/px");
  assert.equal(text, `a("/px/scram/x.js"); b('/px/scramjet/'); c(\`/px/scram/y\`); d("see /scram/z in docs"); e("/px/scramjet/" + "/px/scram/q");`);
  assert.equal(changed, 5);
  // Running it again would move them again, so the build runs it once on a fresh copy.
  assert.match(rewriteText(text, ["/px/"], "/px").text, /"\/px\/px\//);
});

test("rewriteText refuses a listed path that is no longer there", () => {
  assert.throws(() => rewriteText(`x("/scram/a")`, ["/scram/", "/baremux/"], "/px", "index.js"), /index\.js has no "\/baremux\/"/);
});

test("BASE=/px builds the site under px/ with every own path moved", () => {
  const out = mkdtempSync(join(tmpdir(), "frontend-px-"));
  try {
    execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: root, env: { ...process.env, BASE: "/px", OUT_DIR: out, SCRAMJET_ENGINE: "" }, stdio: "ignore" });
    const read = (p) => readFileSync(join(out, "px", p), "utf8");
    assert.ok(!existsSync(join(out, "index.html")), "nothing at the root");
    assert.equal(JSON.parse(read("version.json")).base, "/px");
    assert.match(read("index.html"), /<script src="\/px\/scram\/scramjet\.all\.js"><\/script>/);
    assert.match(read("index.js"), /prefix: "\/px\/scramjet\/"/);
    assert.match(read("index.js"), /new window\.BareMux\.BareMuxConnection\("\/px\/baremux\/worker\.js"\)/);
    assert.match(read("sw.js"), /importScripts\("\/px\/scram\/scramjet\.all\.js", "\/px\/baremux\/index\.js", "\/px\/config\.js"/);
    assert.match(read("sw.js"), /const PROXY_PREFIX = "\/px\/scramjet\/";/);
    assert.match(read("sessions.js"), /fetch\("\/px\/sessions\/whoami"/);
    assert.match(read("s2/index.html"), /self\.saintsEngine2Base = "\/px\/s2";/);
    assert.match(read("404.html"), /<base href="\/px\/" \/>/);
    assert.match(read("games/games.json"), /"\/px\/games\/public\//);
    // engine2.js builds its own paths from saintsEngine2Base: left alone.
    assert.match(read("s2/engine2.js"), /scramjetPath: BASE \+ "\/scram\/scramjet\.js"/);
    // No own path left at the root, none moved twice.
    const own = /["'`]\/(?:scram|scramjet|baremux|libcurl|epoxy|games|icon|s2|version\.json|config\.js|blocked\.js|sitefixes\.js|sessions)\b/;
    for (const file of Object.keys(BASE_PATHS)) {
      const text = read(file);
      assert.doesNotMatch(text, own, file + " still has a root path");
      assert.doesNotMatch(text, /\/px\/px\//, file + " moved a path twice");
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

// ---- frontendFetch under /px ----
function env() {
  const asked = [];
  return {
    asked,
    ASSETS: { fetch: async (req) => { const url = new URL(req.url || req); asked.push(url.pathname); return new Response("asset " + url.pathname, { headers: { "content-type": "text/plain" } }); } },
    SESSIONS: {},
  };
}

test("frontendFetch under /px: other paths are left to the host Worker", async () => {
  const e = env();
  assert.equal(await frontendFetch(new Request("https://w.example/chat/poll"), e, { base: "/px" }), null);
  assert.equal(await frontendFetch(new Request("https://w.example/pxx/a"), e, { base: "/px" }), null);
  const r = await frontendFetch(new Request("https://w.example/px?a=1"), e, { base: "/px" });
  assert.equal(r.status, 308);
  assert.equal(r.headers.get("location"), "https://w.example/px/?a=1");
});

test("frontendFetch under /px: files come from px/ with the isolation and no-store headers", async () => {
  const e = env();
  const sw = await frontendFetch(new Request("https://w.example/px/sw.js"), e, { base: "/px" });
  assert.equal(await sw.text(), "asset /px/sw.js");
  assert.equal(sw.headers.get("cache-control"), "no-store");
  assert.equal(sw.headers.get("cross-origin-embedder-policy"), "require-corp");
  const css = await frontendFetch(new Request("https://w.example/px/index.css"), e, { base: "/px" });
  assert.equal(css.headers.get("cache-control"), null);
});

test("frontendFetch under /px: the sessions API and its cookie stay under /px/sessions", async () => {
  const e = env();
  const r = await frontendFetch(new Request("https://w.example/px/sessions/auth/logout", { method: "POST" }), e, { base: "/px" });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie"), /; Path=\/px\/sessions;/);
  const root = await frontendFetch(new Request("https://w.example/sessions/auth/logout", { method: "POST" }), e);
  assert.match(root.headers.get("set-cookie"), /; Path=\/sessions;/);
});

test("frontendFetch under /px: logging out with a token keeps the cookie path, and AUTH_FETCH does the Saints call", async () => {
  const e = env();
  const calls = [];
  e.AUTH_FETCH = async (url, init) => { calls.push([url, init.method || "GET", init.headers["X-GPA-Session"]]); return new Response("{}"); };
  const r = await frontendFetch(new Request("https://w.example/px/sessions/auth/logout", { method: "POST", headers: { Cookie: "saints_px=tok123.sig456" } }), e, { base: "/px" });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie"), /; Path=\/px\/sessions;/);
  assert.deepEqual(calls, [["https://donnajbe.viztrrx.workers.dev/auth/proxy-logout", "POST", "tok123.sig456"]]);
});
