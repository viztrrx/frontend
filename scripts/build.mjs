import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { patchLibcurlTransport } from "./patch-libcurl.mjs";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const out = new URL("../dist/", import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const [from, dest] of [
  [new URL("../public/", import.meta.url), new URL("../dist/", import.meta.url)],
  [scramjetPath, new URL("../dist/scram/", import.meta.url)],
  [libcurlPath, new URL("../dist/libcurl/", import.meta.url)],
  [baremuxPath, new URL("../dist/baremux/", import.meta.url)],
]) {
  if (!(await stat(from)).isDirectory()) throw new Error("Not a directory: " + from);
  await cp(from, dest, { recursive: true });
}
for (const file of ["index.mjs", "index.js", "index.cjs"]) {
  const path = new URL("libcurl/" + file, out);
  await writeFile(path, patchLibcurlTransport(await readFile(path, "utf8")));
}

// Record which commit this build came from, so the page can show what is live.
// Cloudflare Workers Builds sets WORKERS_CI_COMMIT_SHA and WORKERS_CI_BRANCH.
function git(...args) {
  try {
    return execFileSync("git", args, { cwd: new URL("..", import.meta.url), encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
// Only accept a real commit hash: Workers Builds has been seen to pass "main" here.
const isCommit = (value) => /^[0-9a-f]{7,40}$/i.test(value || "");
const version = {
  commit: [process.env.WORKERS_CI_COMMIT_SHA, git("rev-parse", "HEAD")].find(isCommit) || "",
  branch: process.env.WORKERS_CI_BRANCH || git("rev-parse", "--abbrev-ref", "HEAD"),
  message: git("log", "-1", "--format=%s"),
  committedAt: git("log", "-1", "--format=%cI"),
  builtAt: new Date().toISOString(),
};
await writeFile(new URL("version.json", out), JSON.stringify(version, null, 2) + "\n");
console.log("Scramjet frontend assets prepared in dist/ (" + (version.commit.slice(0, 7) || "unknown commit") + ")");
