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
