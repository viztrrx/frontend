import { cp, mkdir, rm, stat } from "node:fs/promises";
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
console.log("Scramjet frontend assets prepared in dist/");
