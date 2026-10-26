import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);

test("build records the deployed commit in dist/version.json", () => {
  const env = { ...process.env, WORKERS_CI_COMMIT_SHA: "", WORKERS_CI_BRANCH: "" };
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: root, env, stdio: "ignore" });
  const version = JSON.parse(readFileSync(new URL("dist/version.json", root), "utf8"));
  assert.equal(version.commit, execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim());
  assert.ok(version.message.length > 0);
  assert.ok(!isNaN(new Date(version.builtAt)));
  for (const file of ["index.mjs", "index.js", "index.cjs"]) {
    const built = readFileSync(new URL("dist/libcurl/" + file, root), "utf8");
    assert.match(built, /libcurl\.events\.addEventListener\("libcurl_load"/, file + " has the WASM readiness fix");
  }
  // Epoxy, the faster transport, ships next to libcurl.
  for (const file of ["index.mjs", "index.js"]) assert.ok(readFileSync(new URL("dist/epoxy/" + file, root), "utf8").length > 1000, "dist/epoxy/" + file);
});

test("Cloudflare's commit variable takes precedence", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: root, env: { ...process.env, WORKERS_CI_COMMIT_SHA: sha, WORKERS_CI_BRANCH: "main" }, stdio: "ignore",
  });
  const version = JSON.parse(readFileSync(new URL("dist/version.json", root), "utf8"));
  assert.equal(version.commit, sha);
  assert.equal(version.branch, "main");
});

test("a branch name in Cloudflare's commit variable falls back to git", () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: root, env: { ...process.env, WORKERS_CI_COMMIT_SHA: "main", WORKERS_CI_BRANCH: "main" }, stdio: "ignore",
  });
  const version = JSON.parse(readFileSync(new URL("dist/version.json", root), "utf8"));
  assert.equal(version.commit, execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim());
});

test("renamed repository matches Cloudflare Worker configuration", () => {
  const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  const config = JSON.parse(readFileSync(new URL("wrangler.jsonc", root), "utf8"));
  const worker = readFileSync(new URL("src/index.js", root), "utf8");

  assert.equal(pkg.name, "frontend");
  assert.equal(config.name, pkg.name);
  assert.equal(config.main, "./src/index.js");
  assert.equal(config.workers_dev, true);
  assert.equal(config.assets.directory, "./dist");
  assert.equal(config.assets.binding, "ASSETS");
  assert.equal(config.assets.run_worker_first, true);
  assert.match(worker, /env\.ASSETS\.fetch\(request\)/);
});

test("SCRAMJET_ENGINE=2 builds the Scramjet 2 beta; the default build is Scramjet 1.1", () => {
  const build = (engine) => execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: root, env: { ...process.env, SCRAMJET_ENGINE: engine }, stdio: "ignore",
  });
  const read = (path) => readFileSync(new URL("dist/" + path, root), "utf8");
  const exists = (path) => { try { readFileSync(new URL("dist/" + path, root)); return true; } catch { return false; } };
  try {
    build("2");
    assert.equal(JSON.parse(read("version.json")).engine, 2);
    const html = read("index.html");
    assert.match(html, /<script src="\/scram\/scramjet\.js"><\/script>\s*<script src="\/controller\/controller\.api\.js"><\/script>\s*<script src="\/engine2\.js"><\/script>/);
    assert.doesNotMatch(html, /baremux|scramjet\.all\.js/);
    assert.match(read("sw.js"), /importScripts\("\/controller\/controller\.sw\.js"\)/);
    assert.ok(!exists("sw2.js") && !exists("baremux/index.js"));
    assert.ok(!exists("s2/index.html") && !exists("s2/scram/scramjet.js"), "the beta is Scramjet 2 throughout: no separate /s2/");
    for (const file of ["scram/scramjet.js", "scram/scramjet.wasm", "controller/controller.api.js", "controller/controller.sw.js", "controller/controller.inject.js", "libcurl/index.mjs", "epoxy/index.mjs"]) {
      assert.ok(exists(file), file);
    }
  } finally {
    build("");
  }
  assert.equal(JSON.parse(read("version.json")).engine, 1);
  assert.match(read("index.html"), /scramjet\.all\.js/);
  assert.ok(!exists("engine2.js") && !exists("sw2.js"));
  assert.match(read("sw.js"), /ScramjetServiceWorker/);
});

test("production also ships Scramjet 2 at /s2/, for Spotify only", () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: root, env: { ...process.env, SCRAMJET_ENGINE: "" }, stdio: "ignore" });
  const read = (path) => readFileSync(new URL("dist/" + path, root), "utf8");
  const exists = (path) => { try { readFileSync(new URL("dist/" + path, root)); return true; } catch { return false; } };
  for (const file of ["s2/index.html", "s2/host.js", "s2/sw.js", "s2/engine2.js", "s2/scram/scramjet.js", "s2/scram/scramjet.wasm",
    "s2/controller/controller.api.js", "s2/controller/controller.sw.js", "s2/controller/controller.inject.js", "s2/libcurl/index.mjs", "s2/epoxy/index.mjs", "spotify.js"]) {
    assert.ok(exists(file), file);
  }
  // Scramjet 1.1 keeps "/" (its worker, scripts and BareMux) for every other site.
  assert.match(read("index.html"), /<script src="\/scram\/scramjet\.all\.js"><\/script>/);
  assert.match(read("index.html"), /<script src="spotify\.js" defer><\/script>[\s\S]*<script src="index\.js" defer><\/script>/);
  assert.match(read("sw.js"), /ScramjetServiceWorker/);
  assert.match(read("s2/sw.js"), /importScripts\("\/s2\/controller\/controller\.sw\.js"\)/);
  const host = read("s2/index.html");
  assert.match(host, /saintsEngine2Base = "\/s2"[\s\S]*\/s2\/scram\/scramjet\.js[\s\S]*\/s2\/controller\/controller\.api\.js[\s\S]*\/s2\/engine2\.js/);
  assert.doesNotMatch(host, /baremux|scramjet\.all\.js/);
  assert.match(read("s2/engine2.js"), /register\(BASE \+ "\/sw\.js", \{ scope: BASE \+ "\/" \}\)/);
});

test("the beta Worker is the same Worker code with its own name and sessions", () => {
  const strip = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
  const prod = strip(readFileSync(new URL("wrangler.jsonc", root), "utf8"));
  const beta = strip(readFileSync(new URL("wrangler.beta.jsonc", root), "utf8"));
  assert.equal(beta.name, "frontend-beta");
  assert.equal(beta.main, prod.main);
  assert.deepEqual(beta.assets, prod.assets);
  assert.deepEqual(beta.r2_buckets, prod.r2_buckets);
  assert.equal(beta.vars.SESSIONS_PREFIX, "proxy-sessions-beta/");
  assert.equal(beta.triggers, undefined, "production's cron already keeps the backend awake");
});

test("both Workers may fetch the Saints Worker on the same workers.dev subdomain", () => {
  const strip = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
  for (const file of ["wrangler.jsonc", "wrangler.beta.jsonc"]) {
    const config = strip(readFileSync(new URL(file, root), "utf8"));
    assert.ok((config.compatibility_flags || []).includes("global_fetch_strictly_public"), file);
  }
});
