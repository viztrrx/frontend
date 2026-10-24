import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import worker, { backendHealthUrl } from "../src/index.js";

const config = readFileSync(new URL("../public/config.js", import.meta.url), "utf8");
const assets = (text) => ({ fetch: async () => new Response(text) });

test("the backend's /health address comes from config.js", async () => {
  assert.equal(await backendHealthUrl({ ASSETS: assets(config) }), "https://backend-rust-qr67.onrender.com/health");
  // After moving the backend, only wispUrl in config.js changes.
  const moved = 'let _CONFIG = { wispUrl: "wss://saints-backend-va.onrender.com/wisp/" };';
  assert.equal(await backendHealthUrl({ ASSETS: assets(moved) }), "https://saints-backend-va.onrender.com/health");
  assert.equal(await backendHealthUrl({ ASSETS: assets("garbage") }), "https://backend-rust-qr67.onrender.com/health");
});

test("the cron trigger pings the backend's /health", async () => {
  const realFetch = globalThis.fetch;
  const pinged = [];
  globalThis.fetch = async (url) => { pinged.push(String(url)); return new Response("ok"); };
  const quiet = console.log;
  console.log = () => {};
  try {
    const waits = [];
    await worker.scheduled({ cron: "*/10 * * * *" }, { ASSETS: assets(config) }, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  } finally {
    globalThis.fetch = realFetch;
    console.log = quiet;
  }
  assert.deepEqual(pinged, ["https://backend-rust-qr67.onrender.com/health"]);
});

test("wrangler.jsonc runs the keep-awake job every 10 minutes", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.deepEqual(config.triggers.crons, ["*/10 * * * *"]);
});
