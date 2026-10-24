import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/youtube.js", import.meta.url), "utf8");
const scope = { localStorage: { _v: null, getItem() { return this._v; }, setItem(_k, v) { this._v = v; } }, URL };
vm.runInNewContext(source, scope);
const { mapYouTubeUrl, cleanInstance } = scope.saintsYouTube;
const INV = "https://yewtu.be";

test("video URLs map to the instance's /watch", () => {
  assert.equal(mapYouTubeUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw", INV), "https://yewtu.be/watch?v=jNQXAC9IVRw");
  assert.equal(mapYouTubeUrl("https://m.youtube.com/watch?v=jNQXAC9IVRw&feature=share", INV), "https://yewtu.be/watch?v=jNQXAC9IVRw");
  assert.equal(mapYouTubeUrl("https://youtu.be/jNQXAC9IVRw", INV), "https://yewtu.be/watch?v=jNQXAC9IVRw");
  assert.equal(mapYouTubeUrl("https://www.youtube.com/shorts/jNQXAC9IVRw", INV), "https://yewtu.be/watch?v=jNQXAC9IVRw");
  assert.equal(mapYouTubeUrl("https://www.youtube.com/embed/jNQXAC9IVRw", INV), "https://yewtu.be/watch?v=jNQXAC9IVRw");
});

test("timestamps and playlists carry over", () => {
  assert.equal(mapYouTubeUrl("https://youtu.be/jNQXAC9IVRw?t=42", INV), "https://yewtu.be/watch?v=jNQXAC9IVRw&t=42");
  assert.equal(mapYouTubeUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123", INV), "https://yewtu.be/watch?v=jNQXAC9IVRw&list=PL123");
});

test("search, home, channels and playlists map", () => {
  assert.equal(mapYouTubeUrl("https://www.youtube.com/results?search_query=dom+tracy+f150", INV), "https://yewtu.be/search?q=dom+tracy+f150");
  assert.equal(mapYouTubeUrl("https://www.youtube.com/", INV), "https://yewtu.be/");
  assert.equal(mapYouTubeUrl("https://m.youtube.com/", INV), "https://yewtu.be/");
  assert.equal(mapYouTubeUrl("https://www.youtube.com/@mkbhd", INV), "https://yewtu.be/@mkbhd");
  assert.equal(mapYouTubeUrl("https://www.youtube.com/playlist?list=PL123", INV), "https://yewtu.be/playlist?list=PL123");
});

test("non-YouTube URLs and 'off' are left unchanged", () => {
  assert.equal(mapYouTubeUrl("https://www.google.com/search?q=x", INV), "https://www.google.com/search?q=x");
  assert.equal(mapYouTubeUrl("https://notyoutube.com.evil.test/watch?v=x", INV), "https://notyoutube.com.evil.test/watch?v=x");
  assert.equal(mapYouTubeUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw", ""), "https://www.youtube.com/watch?v=jNQXAC9IVRw");
  assert.equal(mapYouTubeUrl("not a url", INV), "not a url");
});

test("an already-mapped instance URL is not mapped again", () => {
  assert.equal(mapYouTubeUrl("https://yewtu.be/watch?v=jNQXAC9IVRw", INV), "https://yewtu.be/watch?v=jNQXAC9IVRw");
});

test("instance strings are cleaned to an https origin or empty", () => {
  assert.equal(cleanInstance("yewtu.be"), "https://yewtu.be");
  assert.equal(cleanInstance("https://inv.nadeko.net/"), "https://inv.nadeko.net");
  assert.equal(cleanInstance("  "), "");
  assert.equal(cleanInstance("http://insecure.test"), "");
  assert.equal(cleanInstance("garbage"), "");
});
