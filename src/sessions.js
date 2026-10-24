// Saved proxy sessions, per Saints account, kept in R2.
//
// A session is what keeps someone signed in to sites they opened through the
// proxy: Scramjet's cookie jar plus each site's localStorage. The page
// (public/sessions.js) uploads a snapshot and downloads it again to resume.
// Every request carries the Saints console sign-in token (X-GPA-Session); the
// donnajbe Worker's /auth/me says which account it belongs to, and a request
// only ever sees that account's sessions. Objects live at
//   proxy-sessions/<sha256(account)>/<id>.json
// with the name, dates and sites in customMetadata so listing is one call.

const DEFAULT_AUTH_BASE = "https://donnajbe.viztrrx.workers.dev";
const PREFIX = "proxy-sessions/";
const MAX_SESSIONS = 20;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_NAME = 60;
const AUTH_CACHE_MS = 60 * 1000;
const ID_RE = /^[0-9a-f]{32}$/;

// token -> { user, until } (per isolate; a revoked sign-in lasts a minute at most)
const authCache = new Map();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const fail = (status, error) => json({ ok: false, error }, status);

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomId() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The account a sign-in token belongs to, or null.
async function accountFor(token, env) {
  if (!token || token.length > 4096) return null;
  const cached = authCache.get(token);
  if (cached && cached.until > Date.now()) return cached.user;
  const base = String(env.AUTH_BASE || DEFAULT_AUTH_BASE).replace(/\/+$/, "");
  let user = null;
  try {
    const r = await fetch(base + "/auth/me", { headers: { "X-GPA-Session": token } });
    const d = await r.json().catch(() => null);
    if (r.ok && d && d.ok && d.account && typeof d.account.user === "string" && d.account.user) {
      user = d.account.user.toLowerCase();
    }
  } catch {
    throw new Error("auth unreachable");
  }
  if (authCache.size > 500) authCache.clear();
  if (user) authCache.set(token, { user, until: Date.now() + AUTH_CACHE_MS });
  return user;
}

function cleanName(value, fallback) {
  const name = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return name || fallback;
}
// Hostnames the session has data for, shown in the list ("signed in to …").
function cleanSites(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((s) => typeof s === "string" && /^[a-z0-9.-]{1,100}(:\d{1,5})?$/i.test(s)))].slice(0, 30);
}
function metaOf(object) {
  const m = object.customMetadata || {};
  let sites = [];
  try { sites = JSON.parse(m.sites || "[]"); } catch {}
  return {
    id: object.key.slice(object.key.lastIndexOf("/") + 1, -".json".length),
    name: m.name || "Session",
    createdAt: Number(m.createdAt) || 0,
    updatedAt: Number(m.updatedAt) || 0,
    sites: cleanSites(sites),
    size: object.size || 0,
  };
}

async function listSessions(bucket, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor, include: ["customMetadata"] });
    for (const object of page.objects) if (object.key.endsWith(".json")) out.push(metaOf(object));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function readBody(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return { error: "too large" };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: "too large" };
  try {
    const data = JSON.parse(text || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? { data } : { error: "bad json" };
  } catch {
    return { error: "bad json" };
  }
}

async function write(bucket, key, record) {
  await bucket.put(key, JSON.stringify(record), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      name: record.name,
      createdAt: String(record.createdAt),
      updatedAt: String(record.updatedAt),
      sites: JSON.stringify(record.sites),
    },
  });
}

// /sessions               GET list · POST create {name}
// /sessions/<id>          GET snapshot · PUT save {name?, cookies?, storage?, sites?} · DELETE
export async function handleSessions(request, env, url) {
  const bucket = env.SESSIONS;
  if (!bucket) return fail(503, "Saved sessions aren't set up on this server (no SESSIONS bucket).");
  if (request.headers.get("Origin") && request.headers.get("Origin") !== url.origin) return fail(403, "forbidden");

  let user;
  try {
    user = await accountFor(request.headers.get("X-GPA-Session") || "", env);
  } catch {
    return fail(502, "Can't reach the Saints sign-in server right now.");
  }
  if (!user) return fail(401, "Sign in to Saints to use saved sessions.");

  // SESSIONS_PREFIX keeps another deployment's sessions apart (the beta Worker).
  const prefix = (env.SESSIONS_PREFIX || PREFIX) + (await sha256Hex(user)) + "/";
  const rest = url.pathname.slice("/sessions".length).replace(/^\/+/, "");

  if (!rest) {
    if (request.method === "GET") return json({ ok: true, user, sessions: await listSessions(bucket, prefix) });
    if (request.method === "POST") {
      const body = await readBody(request);
      if (body.error) return fail(400, body.error);
      const existing = await listSessions(bucket, prefix);
      if (existing.length >= MAX_SESSIONS) return fail(409, "You have " + MAX_SESSIONS + " saved sessions. Delete one first.");
      const now = Date.now();
      const record = {
        v: 1, name: cleanName(body.data.name, "Session " + (existing.length + 1)),
        createdAt: now, updatedAt: now, sites: [], cookies: "{}", storage: {},
      };
      const id = randomId();
      await write(bucket, prefix + id + ".json", record);
      return json({ ok: true, session: { id, name: record.name, createdAt: now, updatedAt: now, sites: [], size: 0 } });
    }
    return fail(405, "method not allowed");
  }

  if (!ID_RE.test(rest)) return fail(404, "not found");
  const key = prefix + rest + ".json";

  if (request.method === "GET") {
    const object = await bucket.get(key);
    if (!object) return fail(404, "That session no longer exists.");
    const record = await object.json();
    return json({ ok: true, session: { id: rest, ...record } });
  }
  if (request.method === "PUT") {
    const body = await readBody(request);
    if (body.error) return fail(body.error === "too large" ? 413 : 400, body.error === "too large" ? "This session is too large to save (over 5 MB)." : body.error);
    const object = await bucket.get(key);
    if (!object) return fail(404, "That session no longer exists.");
    const record = await object.json();
    const d = body.data;
    if (d.name !== undefined) record.name = cleanName(d.name, record.name);
    if (d.cookies !== undefined) {
      if (typeof d.cookies !== "string") return fail(400, "cookies must be a string");
      record.cookies = d.cookies;
    }
    if (d.storage !== undefined) {
      if (!d.storage || typeof d.storage !== "object" || Array.isArray(d.storage)) return fail(400, "storage must be an object");
      record.storage = d.storage;
    }
    if (d.sites !== undefined) record.sites = cleanSites(d.sites);
    record.updatedAt = Date.now();
    await write(bucket, key, record);
    return json({ ok: true, session: { id: rest, name: record.name, createdAt: record.createdAt, updatedAt: record.updatedAt, sites: record.sites } });
  }
  if (request.method === "DELETE") {
    await bucket.delete(key);
    return json({ ok: true });
  }
  return fail(405, "method not allowed");
}
