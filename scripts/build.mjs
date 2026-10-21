import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
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
// Record which commit this build came from, so the page can show what is live.
// Cloudflare Workers Builds sets WORKERS_CI_COMMIT_SHA and WORKERS_CI_BRANCH.
function git(...args) {
  try {
    return execFileSync("git", args, { cwd: new URL("..", import.meta.url), encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
const version = {
  commit: process.env.WORKERS_CI_COMMIT_SHA || git("rev-parse", "HEAD"),
  branch: process.env.WORKERS_CI_BRANCH || git("rev-parse", "--abbrev-ref", "HEAD"),
  message: git("log", "-1", "--format=%s"),
  committedAt: git("log", "-1", "--format=%cI"),
  builtAt: new Date().toISOString(),
};
await writeFile(new URL("version.json", out), JSON.stringify(version, null, 2) + "\n");
console.log("Scramjet frontend assets prepared in dist/ (" + (version.commit.slice(0, 7) || "unknown commit") + ")");
