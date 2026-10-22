import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import worker from "../src/index.js";
import GAME_PARTS from "../src/game-parts.js";

const pub = (path) => new URL("../public" + path, import.meta.url);
const games = JSON.parse(readFileSync(pub("/games/games.json"), "utf8"));

test("every game in the list has its files and thumbnail", () => {
  assert.ok(games.length >= 43);
  assert.equal(new Set(games.map((g) => g.slug)).size, games.length, "slugs are unique");
  for (const g of games) {
    assert.ok(g.title, g.slug);
    if (g.image) assert.ok(existsSync(pub(g.image)), g.image);
    if (g.url) {
      assert.match(g.url, /^https:\/\/[a-z0-9.-]+\/$/, g.slug);
    } else if (g.frame) {
      assert.match(g.frame, /^https:\/\/[a-z0-9.-]+\//, g.slug);
    } else {
      assert.match(g.path, /^\/games\/public\/[^/]+\//, g.slug);
      assert.ok(existsSync(pub(g.path.split("#")[0] + "index.html")), g.path);
    }
  }
});

test("no game file is over Cloudflare's 25 MiB limit, and no Git LFS stubs are left", () => {
  // Spot-check the Unity games that came from Git LFS.
  for (const file of ["/games/public/slope/Build/slope_data.unityweb", "/games/public/ducklife/dl1.data.unityweb"]) {
    const head = readFileSync(pub(file)).subarray(0, 40).toString("latin1");
    assert.doesNotMatch(head, /git-lfs/, file);
  }
});

test("split files rebuild the original data exactly", () => {
  for (const [path, entry] of Object.entries(GAME_PARTS)) {
    assert.ok(!existsSync(pub(path)), "only the parts are stored: " + path);
    const hash = createHash("sha256");
    let size = 0;
    for (let i = 0; i < entry.parts; i++) {
      const part = pub(path + ".part" + i);
      assert.ok(statSync(part).size <= 25 * 1024 * 1024, path + ".part" + i);
      const data = readFileSync(part);
      size += data.length;
      hash.update(data);
    }
    assert.equal(size, entry.size, path);
    assert.equal(hash.digest("hex"), entry.sha256, path);
  }
});

test("the Worker streams a split file back as one", async () => {
  const path = "/games/public/ducklife4/Build/WebGL.data.unityweb";
  const env = { ASSETS: { fetch: async (url) => {
    const p = new URL(url).pathname;
    return existsSync(pub(p)) ? new Response(readFileSync(pub(p))) : new Response("missing", { status: 404 });
  } } };
  const response = await worker.fetch(new Request("https://frontend.example" + path), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-length"), String(GAME_PARTS[path].size));
  assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(body).digest("hex"), GAME_PARTS[path].sha256);
});

test("Eaglercraft replaces Minecraft Classic and launches the Saints Worker's game frame", () => {
  assert.equal(games.find((g) => g.slug === "minecraft"), undefined);
  assert.ok(!existsSync(pub("/games/public/mc-classic/index.html")), "the old files are gone");
  const e = games.find((g) => g.slug === "eaglercraft");
  assert.equal(e.title, "Eaglercraft");
  assert.equal(e.frame, "https://donnajbe.viztrrx.workers.dev/eagler/?autoPack=1", "the same frame as the console's Eaglercraft tab");
  assert.match(readFileSync(pub(e.image), "utf8"), /^<svg/);
});
