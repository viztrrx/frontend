import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { patchLibcurlTransport } from "./patch-libcurl.mjs";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

// Which Scramjet to build: 1 (Scramjet 1.1 + BareMux, production) or 2
// (Scramjet 2 alpha, the beta Worker; see wrangler.beta.jsonc).
const engine = process.env.SCRAMJET_ENGINE === "2" ? 2 : 1;

const out = new URL("../dist/", import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// Scramjet 2's packages are installed under aliases (package.json) next to
// the Scramjet 1.1 ones.
const modules = (name) => new URL("../node_modules/" + name + "/dist/", import.meta.url);
const assets = engine === 2
  ? [
      [modules("scramjet2"), "scram/"],
      [modules("scramjet-controller2"), "controller/"],
      [modules("libcurl-transport2"), "libcurl/"],
      [modules("epoxy-transport3"), "epoxy/"],
    ]
  : [
      [scramjetPath, "scram/"],
      [libcurlPath, "libcurl/"],
      [epoxyPath, "epoxy/"],
      [baremuxPath, "baremux/"],
    ];
for (const [from, dest] of [[new URL("../public/", import.meta.url), ""], ...assets]) {
  if (!(await stat(from)).isDirectory()) throw new Error("Not a directory: " + from);
  await cp(from, new URL(dest, out), { recursive: true });
}

if (engine === 1) {
  for (const file of ["index.mjs", "index.js", "index.cjs"]) {
    const path = new URL("libcurl/" + file, out);
    await writeFile(path, patchLibcurlTransport(await readFile(path, "utf8")));
  }
  await rm(new URL("engine2.js", out));
  await rm(new URL("sw2.js", out));
} else {
  // Scramjet 2's worker and page scripts in place of Scramjet 1.1's.
  await rm(new URL("sw.js", out));
  await rename(new URL("sw2.js", out), new URL("sw.js", out));
  const V1_SCRIPTS = '<script src="/scram/scramjet.all.js"></script>\n\t\t<script src="/baremux/index.js"></script>';
  const V2_SCRIPTS = '<script src="/scram/scramjet.js"></script>\n\t\t<script src="/controller/controller.api.js"></script>\n\t\t<script src="/engine2.js"></script>';
  const index = await readFile(new URL("index.html", out), "utf8");
  if (!index.includes(V1_SCRIPTS)) throw new Error("public/index.html's Scramjet script tags changed; update scripts/build.mjs.");
  await writeFile(new URL("index.html", out), index.replace(V1_SCRIPTS, V2_SCRIPTS));
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
  engine,
  commit: [process.env.WORKERS_CI_COMMIT_SHA, git("rev-parse", "HEAD")].find(isCommit) || "",
  branch: process.env.WORKERS_CI_BRANCH || git("rev-parse", "--abbrev-ref", "HEAD"),
  message: git("log", "-1", "--format=%s"),
  committedAt: git("log", "-1", "--format=%cI"),
  builtAt: new Date().toISOString(),
};
await writeFile(new URL("version.json", out), JSON.stringify(version, null, 2) + "\n");
console.log("Scramjet " + (engine === 2 ? "2" : "1.1") + " frontend assets prepared in dist/ (" + (version.commit.slice(0, 7) || "unknown commit") + ")");
