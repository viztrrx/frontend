import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { handleSessions } from "../src/sessions.js";

// An in-memory stand-in for the R2 binding (only what src/sessions.js uses).
function fakeBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, opts) { objects.set(key, { value, customMetadata: opts.customMetadata }); },
    async get(key) {
      const o = objects.get(key);
      return o ? { json: async () => JSON.parse(o.value), text: async () => o.value, customMetadata: o.customMetadata } : null;
    },
    async head(key) { return objects.has(key) ? { key } : null; },
    async delete(key) { objects.delete(key); },
    async list({ prefix }) {
      return {
        truncated: false,
        objects: [...objects].filter(([k]) => k.startsWith(prefix))
          .map(([key, o]) => ({ key, size: o.value.length, customMetadata: o.customMetadata })),
      };
    },
  };
}

// The Saints Worker. Console tokens "tok-<name>" and proxy-only tokens
// "px<name>.signature" (Saints Search's own sign-in) belong to account
// <name>; "nosid" has no student number yet; anything else is signed out.
const realFetch = globalThis.fetch;
let authCalls = 0;
const authLog = [];
globalThis.fetch = async (url, init) => {
  const path = String(url).replace("https://donnajbe.viztrrx.workers.dev", "");
  assert.ok(["/auth/proxy-me", "/auth/proxy-logout"].includes(path), "unexpected " + url);
  authCalls++;
  const token = init.headers["X-GPA-Session"];
  authLog.push(path + " " + token);
  if (path === "/auth/proxy-logout") return new Response(JSON.stringify({ ok: true }));
  const consoleTok = /^tok-(\w+)(\.\w+)?$/.exec(token);
  const proxyTok = /^px(\w+)\.signature\d*$/.exec(token);
  const name = (consoleTok || proxyTok || [])[1];
  return name
    ? new Response(JSON.stringify({ ok: true, kind: proxyTok ? "proxy" : "console",
      account: { user: name === "ivan" ? "Ivan" : name, needsStudentId: name === "nosid" } }))
    : new Response(JSON.stringify({ ok: false, error: "not signed in", reason: "invalid_or_expired" }), { status: 401 });
};
test.after(() => { globalThis.fetch = realFetch; });

function call(env, method, path, token, body, headers = {}) {
  const url = new URL("https://frontend.viztrrx.workers.dev" + path);
  const h = { ...headers };
  if (token) h["X-GPA-Session"] = token;
  return send(env, url, method, h, body);
}
// Saints Search on its own: no header, the cookie (if any) from /sessions/auth.
function callCookie(env, method, path, cookie, body) {
  const url = new URL("https://frontend.viztrrx.workers.dev" + path);
  return send(env, url, method, cookie ? { Cookie: "other=1; saints_px=" + cookie } : {}, body);
}
function send(env, url, method, h, body) {
  const request = new Request(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return handleSessions(request, env, url).then(async (r) => ({ status: r.status, data: await r.json(), headers: r.headers }));
}

test("sessions are created, saved, listed and resumed per account", async () => {
  const env = { SESSIONS: fakeBucket() };
  const created = await call(env, "POST", "/sessions", "tok-ivan", { name: "School" });
  assert.equal(created.status, 200);
  const id = created.data.session.id;
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(created.data.session.name, "School");

  const cookies = JSON.stringify({ ".google.com@/@SID": { name: "SID", value: "x", domain: ".google.com", path: "/" } });
  const saved = await call(env, "PUT", "/sessions/" + id, "tok-ivan", {
    cookies, storage: { "www.google.com@pref": "1" }, sites: ["google.com", "bad site!"],
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.session.sites, ["google.com"]);

  const list = await call(env, "GET", "/sessions", "tok-ivan");
  assert.equal(list.data.user, "ivan", "account names are case-insensitive");
  assert.equal(list.data.sessions.length, 1);
  assert.equal(list.data.sessions[0].name, "School");
  assert.deepEqual(list.data.sessions[0].sites, ["google.com"]);
  assert.equal(list.headers.get("cache-control"), "no-store");

  const full = await call(env, "GET", "/sessions/" + id, "tok-ivan");
  assert.equal(full.data.session.cookies, cookies);
  assert.deepEqual(full.data.session.storage, { "www.google.com@pref": "1" });

  for (const key of env.SESSIONS.objects.keys()) assert.match(key, /^proxy-sessions\/[0-9a-f]{64}\/[0-9a-f]{32}\.json$/);
});

test("another account can't see, read, change or delete someone's session", async () => {
  const env = { SESSIONS: fakeBucket() };
  const id = (await call(env, "POST", "/sessions", "tok-ivan", { name: "Mine" })).data.session.id;
  assert.equal((await call(env, "GET", "/sessions", "tok-maria")).data.sessions.length, 0);
  assert.equal((await call(env, "GET", "/sessions/" + id, "tok-maria")).status, 404);
  assert.equal((await call(env, "PUT", "/sessions/" + id, "tok-maria", { name: "x" })).status, 404);
  await call(env, "DELETE", "/sessions/" + id, "tok-maria");
  assert.equal((await call(env, "GET", "/sessions/" + id, "tok-ivan")).status, 200, "still there");
});

test("requests without a valid sign-in are refused", async () => {
  const env = { SESSIONS: fakeBucket() };
  assert.equal((await call(env, "GET", "/sessions", "")).status, 401);
  assert.equal((await call(env, "GET", "/sessions", "expired")).status, 401);
  assert.equal(env.SESSIONS.objects.size, 0);
});

test("cross-site requests and bad ids are refused", async () => {
  const env = { SESSIONS: fakeBucket() };
  const r = await call(env, "GET", "/sessions", "tok-ivan", undefined, { Origin: "https://evil.example" });
  assert.equal(r.status, 403);
  assert.equal((await call(env, "GET", "/sessions/..%2F..%2Fmusic%2Fx", "tok-ivan")).status, 404);
  assert.equal((await call(env, "GET", "/sessions/notanid", "tok-ivan")).status, 404);
});

test("deleting a session removes it", async () => {
  const env = { SESSIONS: fakeBucket() };
  const id = (await call(env, "POST", "/sessions", "tok-ivan", {})).data.session.id;
  assert.equal((await call(env, "DELETE", "/sessions/" + id, "tok-ivan")).status, 200);
  assert.equal((await call(env, "GET", "/sessions", "tok-ivan")).data.sessions.length, 0);
});

test("the sign-in check is cached for repeated requests", async () => {
  const env = { SESSIONS: fakeBucket() };
  const before = authCalls;
  await call(env, "GET", "/sessions", "tok-cached");
  await call(env, "GET", "/sessions", "tok-cached");
  assert.equal(authCalls - before, 1);
});

test("without the R2 binding the API says so instead of failing", async () => {
  const r = await call({}, "GET", "/sessions", "tok-ivan");
  assert.equal(r.status, 503);
});

test("SESSIONS_PREFIX keeps the beta Worker's sessions apart", async () => {
  const bucket = fakeBucket();
  const prod = { SESSIONS: bucket };
  const beta = { SESSIONS: bucket, SESSIONS_PREFIX: "proxy-sessions-beta/" };
  assert.equal((await call(beta, "POST", "/sessions", "tok-ivan", { name: "Beta" })).status, 200);
  assert.ok([...bucket.objects.keys()].every((k) => k.startsWith("proxy-sessions-beta/")));
  assert.equal((await call(prod, "GET", "/sessions", "tok-ivan")).data.sessions.length, 0);
  assert.equal((await call(beta, "GET", "/sessions", "tok-ivan")).data.sessions.length, 1);
});

test("a refused sign-in says why, and a non-JSON answer is reported as unreachable", async () => {
  const env = { SESSIONS: fakeBucket(), AUTH_BASE: "https://auth.test" };
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: "not signed in", reason: "signed_in_elsewhere" }), { status: 401 });
    let r = await call(env, "GET", "/sessions", "tok-elsewhere");
    assert.equal(r.status, 401);
    assert.match(r.data.error, /signed in somewhere else/);
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, reason: "invalid_or_expired" }), { status: 401 });
    r = await call(env, "GET", "/sessions", "tok-expired");
    assert.match(r.data.error, /expired/);
    // Cloudflare's error page (e.g. 1042, a Worker fetching another on the same subdomain).
    globalThis.fetch = async () => new Response("<html>error code: 1042</html>", { status: 403, headers: { "content-type": "text/html" } });
    r = await call(env, "GET", "/sessions", "tok-1042");
    assert.equal(r.status, 502);
    assert.match(r.data.error, /HTTP 403/);
  } finally {
    globalThis.fetch = saved;
  }
});

test("Spotify's Scramjet 2 cookie jar (cookies2) is saved and resumed with the session", async () => {
  const env = { SESSIONS: fakeBucket() };
  const id = (await call(env, "POST", "/sessions", "tok-ivan", { name: "Music" })).data.session.id;
  assert.equal((await call(env, "GET", "/sessions/" + id, "tok-ivan")).data.session.cookies2, "{}", "a new session starts with an empty jar");
  const cookies2 = JSON.stringify({ "open.spotify.com@/@sp_t": { name: "sp_t", value: "y", domain: "open.spotify.com", path: "/" } });
  assert.equal((await call(env, "PUT", "/sessions/" + id, "tok-ivan", { cookies2, sites: ["spotify.com"] })).status, 200);
  const full = (await call(env, "GET", "/sessions/" + id, "tok-ivan")).data.session;
  assert.equal(full.cookies2, cookies2);
  assert.equal(full.cookies, "{}", "saving one jar leaves the other alone");
  assert.equal((await call(env, "PUT", "/sessions/" + id, "tok-ivan", { cookies2: { not: "a string" } })).status, 400);
});

// ---- Saints Search's own sign-in (proxy-only tokens, the cookie) -------------
const cookieOf = (r) => {
  const m = /^saints_px=([^;]*)/.exec(r.headers.get("set-cookie") || "");
  return m ? m[1] : null;
};

test("Saints Search's own sign-in: the token goes in an HttpOnly cookie for /sessions only", async () => {
  const env = { SESSIONS: fakeBucket() };
  const signed = await call(env, "POST", "/sessions/auth", "", { token: "pxivan.signature" });
  assert.equal(signed.status, 200);
  assert.equal(signed.data.user, "ivan");
  const header = signed.headers.get("set-cookie");
  assert.match(header, /^saints_px=pxivan\.signature; Path=\/sessions; HttpOnly; Secure; SameSite=Strict; Max-Age=1209600$/);
  assert.ok(!JSON.stringify(signed.data).includes("pxivan.signature"), "the token isn't sent back to the page");

  const cookie = cookieOf(signed);
  const who = await callCookie(env, "GET", "/sessions/whoami", cookie);
  assert.deepEqual(who.data, { ok: true, user: "ivan", kind: "proxy" });
  assert.equal((await callCookie(env, "GET", "/sessions/whoami", "")).status, 401, "no cookie: signed out");
  assert.equal((await callCookie(env, "POST", "/sessions", cookie, { name: "Bare site" })).status, 200);

  // The console (its own token, same account) sees the same list.
  const fromConsole = await call(env, "GET", "/sessions", "tok-ivan");
  assert.deepEqual(fromConsole.data.sessions.map((x) => x.name), ["Bare site"]);
  // A cookie request never takes another account's header-less sessions either.
  assert.equal((await callCookie(env, "GET", "/sessions", "pxmaria.signature")).data.sessions.length, 0);
});

test("only Saints Search's proxy-only tokens are kept, and only with a student number", async () => {
  const env = { SESSIONS: fakeBucket() };
  const consoleTok = await call(env, "POST", "/sessions/auth", "", { token: "tok-ivan.signature" });
  assert.equal(consoleTok.status, 400, "not a proxy-only token (and not shaped like one)");
  assert.equal(cookieOf(consoleTok), null);
  assert.equal((await call(env, "POST", "/sessions/auth", "", { token: "expired.signature" })).status, 401);
  const noSid = await call(env, "POST", "/sessions/auth", "", { token: "pxnosid.signature" });
  assert.equal(noSid.status, 403);
  assert.match(noSid.data.error, /student number/);
  assert.equal(cookieOf(noSid), null);
  // Same rule on every request (a console token without one too).
  assert.equal((await call(env, "GET", "/sessions", "tok-nosid")).status, 403);
  assert.equal((await call(env, "POST", "/sessions/auth", "", { token: "pxivan.signature" }, { Origin: "https://evil.example" })).status, 403, "cross-site");
});

test("a cookie that stopped working is cleared, and signing out ends the token", async () => {
  const env = { SESSIONS: fakeBucket() };
  const stale = await callCookie(env, "GET", "/sessions/whoami", "revoked.signature");
  assert.equal(stale.status, 401);
  assert.equal(cookieOf(stale), "", "cleared, so the page shows the sign-in form");
  assert.match(stale.headers.get("set-cookie"), /Max-Age=0/);

  const before = authLog.length;
  const out = await callCookie(env, "POST", "/sessions/auth/logout", "pxivan.signature2");
  assert.equal(out.status, 200);
  assert.equal(cookieOf(out), "");
  assert.deepEqual(authLog.slice(before), ["/auth/proxy-logout pxivan.signature2"], "the Saints Worker ends that token");
});

test("a renewed proxy-only token replaces the cookie", async () => {
  const env = { SESSIONS: fakeBucket(), AUTH_BASE: "https://auth.test" };
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, kind: "proxy", account: { user: "ivan" }, token: "pxivan.renewed1" }));
    const r = await callCookie(env, "GET", "/sessions", "pxivan.oldtoken1");
    assert.equal(r.status, 200);
    assert.equal(cookieOf(r), "pxivan.renewed1");
  } finally {
    globalThis.fetch = saved;
  }
});

test("a Saints Worker without /auth/proxy-me still checks console tokens with /auth/me", async () => {
  const env = { SESSIONS: fakeBucket(), AUTH_BASE: "https://old-auth.test" };
  const saved = globalThis.fetch;
  const asked = [];
  try {
    globalThis.fetch = async (url) => {
      asked.push(String(url));
      if (String(url).endsWith("/auth/proxy-me")) return new Response(JSON.stringify({ ok: false, error: "not found" }), { status: 404 });
      return new Response(JSON.stringify({ ok: true, account: { user: "Old" } }));
    };
    const r = await call(env, "GET", "/sessions/whoami", "tok-old-worker");
    assert.deepEqual(r.data, { ok: true, user: "old", kind: "console" });
    assert.deepEqual(asked, ["https://old-auth.test/auth/proxy-me", "https://old-auth.test/auth/me"]);
  } finally {
    globalThis.fetch = saved;
  }
});

test("sessions in the old public bucket move to the private one when their account is seen", async () => {
  const legacy = fakeBucket();
  const env = { SESSIONS: fakeBucket(), SESSIONS_LEGACY: legacy };
  // Ivan's two sessions and Maria's one, saved before the move.
  const old = { SESSIONS: legacy };
  const a = (await call(old, "POST", "/sessions", "tok-ivan", { name: "School" })).data.session.id;
  await call(old, "PUT", "/sessions/" + a, "tok-ivan", { cookies: "{\"x\":1}", sites: ["google.com"] });
  await call(old, "POST", "/sessions", "tok-ivan", { name: "Music" });
  await call(old, "POST", "/sessions", "tok-maria", { name: "Hers" });
  assert.equal(legacy.objects.size, 3);

  const list = await call(env, "GET", "/sessions", "tok-ivan");
  assert.deepEqual(list.data.sessions.map((x) => x.name).sort(), ["Music", "School"]);
  assert.equal(env.SESSIONS.objects.size, 2);
  assert.equal(legacy.objects.size, 1, "Ivan's are gone from the public bucket; Maria's wait for her");
  const full = await call(env, "GET", "/sessions/" + a, "tok-ivan");
  assert.equal(full.data.session.cookies, "{\"x\":1}");
  assert.deepEqual(full.data.session.sites, ["google.com"]);
  await call(env, "GET", "/sessions", "tok-maria");
  assert.equal(legacy.objects.size, 0);
  assert.equal(env.SESSIONS.objects.size, 3);
});

test("the Workers keep saved sessions in a private bucket, apart from the public one", () => {
  const strip = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
  for (const file of ["wrangler.jsonc", "wrangler.beta.jsonc"]) {
    const config = strip(readFileSync(new URL("../" + file, import.meta.url), "utf8"));
    const buckets = Object.fromEntries(config.r2_buckets.map((b) => [b.binding, b.bucket_name]));
    assert.equal(buckets.SESSIONS, "saints-proxy-sessions", file);
    assert.equal(buckets.SESSIONS_LEGACY, "donnajbe-eaglercraft-client", file);
  }
});
