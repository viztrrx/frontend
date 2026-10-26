// Saved proxy sessions, per Saints account, kept in R2.
//
// A session is what keeps someone signed in to sites they opened through the
// proxy: Scramjet's cookie jar (cookies), Spotify's Scramjet 2 cookie jar
// (cookies2, production only) and each site's localStorage. The page
// (public/sessions.js) uploads a snapshot and downloads it again to resume.
//
// Who is asking comes from a Saints sign-in token, checked with the donnajbe
// Worker's /auth/proxy-me (/auth/me before it had that), so a request only
// ever sees that account's sessions:
//   * framed by the Saints console: its sign-in token, in X-GPA-Session;
//   * Saints Search on its own: a proxy-only token from /auth/proxy-login
//     (the same name and PIN; the console stays signed in), handed to
//     /sessions/auth and kept in an HttpOnly cookie for /sessions only, so
//     scripts on this origin (proxied sites run here) can't read it.
// Both lead to the same objects, so one list follows the account everywhere:
//   proxy-sessions/<sha256(account)>/<id>.json
// with the name, dates and sites in customMetadata so listing is one call.
// They're in a private bucket (SESSIONS); sessions saved earlier in the old,
// public one (SESSIONS_LEGACY) move over the first time their account is seen.

const DEFAULT_AUTH_BASE = "https://donnajbe.viztrrx.workers.dev";
const COOKIE = "saints_px";
const COOKIE_MAX_AGE = 14 * 24 * 3600;   // the token's own lifetime
const PREFIX = "proxy-sessions/";
const MAX_SESSIONS = 20;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_NAME = 60;
const AUTH_CACHE_MS = 60 * 1000;
const ID_RE = /^[0-9a-f]{32}$/;

// token -> { user, kind, needsStudentId, until } (per isolate; a revoked
// sign-in lasts a minute at most)
const authCache = new Map();
// Accounts whose old public-bucket sessions were already moved (per isolate).
const migrated = new Set();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
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

// The account a sign-in token belongs to: { user, kind, needsStudentId,
// renewed } or { user: null, reason } (the Saints Worker's reason for
// refusing it). kind is "console" or "proxy" (a proxy-only token). Throws
// when the Saints Worker can't be reached or doesn't answer with JSON.
async function accountFor(token, env) {
  if (!token || token.length > 4096) return { user: null, reason: "no_session" };
  const cached = authCache.get(token);
  if (cached && cached.until > Date.now()) return { user: cached.user, kind: cached.kind, needsStudentId: cached.needsStudentId, renewed: null };
  const base = String(env.AUTH_BASE || DEFAULT_AUTH_BASE).replace(/\/+$/, "");
  const ask = async (path) => {
    let r;
    try {
      r = await fetch(base + path, { headers: { "X-GPA-Session": token } });
    } catch (cause) {
      throw new Error("unreachable (" + (cause && cause.message || cause) + ")");
    }
    const d = await r.json().catch(() => null);
    if (!d || typeof d !== "object") throw new Error("HTTP " + r.status + " without an answer");
    return { r, d };
  };
  let { r, d } = await ask("/auth/proxy-me");
  // A Saints Worker from before proxy-only sign-ins: console tokens only.
  if (r.status === 404 && d.error === "not found") ({ r, d } = await ask("/auth/me"));
  if (r.ok && d.ok && d.account && typeof d.account.user === "string" && d.account.user) {
    const user = d.account.user.toLowerCase();
    const kind = d.kind === "proxy" ? "proxy" : "console";
    const needsStudentId = d.account.needsStudentId === true;
    if (authCache.size > 500) authCache.clear();
    authCache.set(token, { user, kind, needsStudentId, until: Date.now() + AUTH_CACHE_MS });
    return { user, kind, needsStudentId, renewed: kind === "proxy" && typeof d.token === "string" && d.token ? d.token : null };
  }
  return { user: null, reason: String(d.reason || d.error || "HTTP " + r.status).slice(0, 120) };
}
// What the page shows when the Saints Worker refused the sign-in.
function signInMessage(reason) {
  if (reason === "signed_in_elsewhere") return "Your Saints account signed in somewhere else, which signed this one out. Sign in again in the Saints console.";
  if (reason === "invalid_or_expired" || reason === "revoked") return "Your Saints sign-in has expired. Sign in again in the Saints console.";
  if (reason === "no_session") return "Sign in to Saints to use saved sessions.";
  if (reason === "student_id") return "Add your school student number first (the Saints console asks for it when you sign in).";
  return "Saints didn't accept this sign-in (" + reason + "). Sign in again in the Saints console.";
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

// ---- The sign-in cookie (Saints Search on its own) ------------------------
function cookieToken(request) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return "";
}
// HttpOnly: no script on this origin can read it. Path=/sessions: it only
// ever goes to this API, never to proxied pages (/scramjet/, /s2/).
function setCookie(token, url) {
  const secure = url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1" ? "; Secure" : "";
  return COOKIE + "=" + token + "; Path=/sessions; HttpOnly" + secure + "; SameSite=Strict; Max-Age=" + (token ? COOKIE_MAX_AGE : 0);
}
// Tokens are "<base64url payload>.<base64url signature>".
const TOKEN_RE = /^[A-Za-z0-9_-]{4,3000}\.[A-Za-z0-9_-]{4,200}$/;

// ---- Moving sessions out of the old public bucket ---------------------------
// Each object of this account's prefix in SESSIONS_LEGACY is copied into
// SESSIONS (unless it's there already) and then deleted from the old bucket.
async function moveLegacy(env, prefix) {
  const legacy = env.SESSIONS_LEGACY;
  if (!legacy || legacy === env.SESSIONS || migrated.has(prefix)) return;
  let cursor;
  do {
    const page = await legacy.list({ prefix, cursor, include: ["customMetadata", "httpMetadata"] });
    for (const object of page.objects) {
      if (!(await env.SESSIONS.head(object.key))) {
        const full = await legacy.get(object.key);
        if (!full) continue;
        await env.SESSIONS.put(object.key, await full.text(), {
          httpMetadata: { contentType: "application/json" },
          customMetadata: full.customMetadata || object.customMetadata || {},
        });
      }
      await legacy.delete(object.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  migrated.add(prefix);
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
// /sessions/<id>          GET snapshot · PUT save {name?, cookies?, cookies2?, storage?, sites?} · DELETE
// /sessions/whoami        GET who the sign-in (header or cookie) is
// /sessions/auth          POST {token}: keep a proxy-only token in the cookie
// /sessions/auth/logout   POST: end that token and clear the cookie
export async function handleSessions(request, env, url) {
  const bucket = env.SESSIONS;
  if (!bucket) return fail(503, "Saved sessions aren't set up on this server (no SESSIONS bucket).");
  if (request.headers.get("Origin") && request.headers.get("Origin") !== url.origin) return fail(403, "forbidden");
  const rest = url.pathname.slice("/sessions".length).replace(/^\/+/, "");

  if (rest === "auth" || rest === "auth/logout") {
    if (request.method !== "POST") return fail(405, "method not allowed");
    if (rest === "auth/logout") {
      const token = cookieToken(request);
      if (token) {
        authCache.delete(token);
        const base = String(env.AUTH_BASE || DEFAULT_AUTH_BASE).replace(/\/+$/, "");
        try { await fetch(base + "/auth/proxy-logout", { method: "POST", headers: { "X-GPA-Session": token } }); } catch {}
      }
      return json({ ok: true }, 200, { "set-cookie": setCookie("", url) });
    }
    const body = await readBody(request);
    if (body.error) return fail(400, body.error);
    const token = typeof body.data.token === "string" ? body.data.token : "";
    if (!TOKEN_RE.test(token)) return fail(400, "bad token");
    let auth;
    try {
      auth = await accountFor(token, env);
    } catch (cause) {
      return fail(502, "Can't check your Saints sign-in right now (" + cause.message + ").");
    }
    if (!auth.user) return fail(401, signInMessage(auth.reason));
    // Only Saints Search's own proxy-only tokens are kept: a console token
    // stays with the console.
    if (auth.kind !== "proxy") return fail(400, "Sign in with your name and PIN here.");
    if (auth.needsStudentId) return fail(403, signInMessage("student_id"));
    return json({ ok: true, user: auth.user }, 200, { "set-cookie": setCookie(auth.renewed || token, url) });
  }

  // The console's token (framed by it) comes first, then Saints Search's own cookie.
  const headerToken = request.headers.get("X-GPA-Session") || "";
  const viaCookie = !headerToken;
  const token = headerToken || cookieToken(request);
  let auth;
  try {
    auth = await accountFor(token, env);
  } catch (cause) {
    console.error("Saints sign-in check failed:", cause.message);
    return fail(502, "Can't check your Saints sign-in right now (" + cause.message + ").");
  }
  // A cookie that no longer works is cleared, so the page shows the sign-in form.
  const clear = viaCookie && token ? { "set-cookie": setCookie("", url) } : {};
  if (!auth.user) return json({ ok: false, error: signInMessage(auth.reason) }, 401, clear);
  // The console's rule: everyone but the owner has a student number on file.
  if (auth.needsStudentId) return json({ ok: false, error: signInMessage("student_id"), studentId: true }, 403, clear);
  const user = auth.user;
  // A proxy-only token past half its life comes back renewed: keep the new one.
  const renew = viaCookie && auth.renewed ? { "set-cookie": setCookie(auth.renewed, url) } : {};
  const answer = (data, status = 200) => json(data, status, renew);

  // SESSIONS_PREFIX keeps another deployment's sessions apart (the beta Worker).
  const prefix = (env.SESSIONS_PREFIX || PREFIX) + (await sha256Hex(user)) + "/";
  try {
    await moveLegacy(env, prefix);
  } catch (cause) {
    console.error("Moving saved sessions to the private bucket failed:", cause && cause.message);
  }

  if (rest === "whoami") {
    if (request.method !== "GET") return fail(405, "method not allowed");
    return answer({ ok: true, user, kind: auth.kind });
  }
  if (!rest) {
    if (request.method === "GET") return answer({ ok: true, user, sessions: await listSessions(bucket, prefix) });
    if (request.method === "POST") {
      const body = await readBody(request);
      if (body.error) return fail(400, body.error);
      const existing = await listSessions(bucket, prefix);
      if (existing.length >= MAX_SESSIONS) return fail(409, "You have " + MAX_SESSIONS + " saved sessions. Delete one first.");
      const now = Date.now();
      const record = {
        v: 1, name: cleanName(body.data.name, "Session " + (existing.length + 1)),
        createdAt: now, updatedAt: now, sites: [], cookies: "{}", cookies2: "{}", storage: {},
      };
      const id = randomId();
      await write(bucket, prefix + id + ".json", record);
      return answer({ ok: true, session: { id, name: record.name, createdAt: now, updatedAt: now, sites: [], size: 0 } });
    }
    return fail(405, "method not allowed");
  }

  if (!ID_RE.test(rest)) return fail(404, "not found");
  const key = prefix + rest + ".json";

  if (request.method === "GET") {
    const object = await bucket.get(key);
    if (!object) return fail(404, "That session no longer exists.");
    const record = await object.json();
    return answer({ ok: true, session: { id: rest, ...record } });
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
    if (d.cookies2 !== undefined) {
      if (typeof d.cookies2 !== "string") return fail(400, "cookies2 must be a string");
      record.cookies2 = d.cookies2;
    }
    if (d.storage !== undefined) {
      if (!d.storage || typeof d.storage !== "object" || Array.isArray(d.storage)) return fail(400, "storage must be an object");
      record.storage = d.storage;
    }
    if (d.sites !== undefined) record.sites = cleanSites(d.sites);
    record.updatedAt = Date.now();
    await write(bucket, key, record);
    return answer({ ok: true, session: { id: rest, name: record.name, createdAt: record.createdAt, updatedAt: record.updatedAt, sites: record.sites } });
  }
  if (request.method === "DELETE") {
    await bucket.delete(key);
    return answer({ ok: true });
  }
  return fail(405, "method not allowed");
}
