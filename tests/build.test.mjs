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
