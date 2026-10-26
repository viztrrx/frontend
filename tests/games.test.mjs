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

test("fixed-size games are scaled to fill their frame", () => {
  // fit.js scales the game's box (keys and offsetX-based pointers still line up).
  const fitted = { "doodle-jump": ".container", spaceinvaders: "#game", dinosaur: ".runner-container" };
  for (const [dir, selector] of Object.entries(fitted)) {
    const html = readFileSync(pub("/games/public/" + dir + "/index.html"), "utf8");
    assert.ok(html.includes('<script src="/games/fit.js" data-fit="' + selector + '"></script>'), dir);
  }
  assert.ok(existsSync(pub("/games/fit.js")));
  // Drift Hunters' Unity player fills the frame instead of a fixed 960x600 box.
  assert.match(readFileSync(pub("/games/public/drift/index.html"), "utf8"), /id="gameContainer" style="width: 100vw; height: 100vh"/);
  // Chroma: the largest 8:5 box that fits, centred (not a fixed 960x600 set high).
  assert.match(readFileSync(pub("/games/public/chroma/game.min.css"), "utf8"), /width:min\(100vw,160vh\);height:min\(100vh,62\.5vw\);transform:translate\(-50%,-50%\)/);
  // Friendly Fire scales by any amount, not only whole numbers.
  assert.ok(readFileSync(pub("/games/public/friendlyfire/FriendlyFire.js"), "utf8").includes("const scale = Math.min(window.innerWidth / width, window.innerHeight / height);"));
});
