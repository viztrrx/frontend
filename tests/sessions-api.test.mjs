import assert from "node:assert/strict";
import { test } from "node:test";
import { handleSessions } from "../src/sessions.js";

// An in-memory stand-in for the R2 binding (only what src/sessions.js uses).
function fakeBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, opts) { objects.set(key, { value, customMetadata: opts.customMetadata }); },
    async get(key) {
      const o = objects.get(key);
      return o ? { json: async () => JSON.parse(o.value) } : null;
    },
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

// Tokens "tok-<name>" belong to account <name>; anything else is signed out.
const realFetch = globalThis.fetch;
let authCalls = 0;
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), "https://donnajbe.viztrrx.workers.dev/auth/me");
  authCalls++;
  const token = init.headers["X-GPA-Session"];
  const m = /^tok-(\w+)$/.exec(token);
  return m
    ? new Response(JSON.stringify({ ok: true, account: { user: m[1] === "ivan" ? "Ivan" : m[1] } }))
    : new Response(JSON.stringify({ ok: false, error: "expired" }), { status: 401 });
};
test.after(() => { globalThis.fetch = realFetch; });

function call(env, method, path, token, body, headers = {}) {
  const url = new URL("https://frontend.viztrrx.workers.dev" + path);
  const h = { ...headers };
  if (token) h["X-GPA-Session"] = token;
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
