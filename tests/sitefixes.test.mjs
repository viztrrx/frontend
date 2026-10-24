import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/sitefixes.js", import.meta.url), "utf8");
const sandbox = {};
vm.runInNewContext(source, { self: sandbox });
const { fixScript } = sandbox.saintsSiteFixes;

// The end of YouTube's webcomponents-sd.js (desktop build dc0b62b0).
const YOUTUBE_TAIL = 'w.noPatch?w.ra&&B(Element.prototype,Bc):(Pc(),Lb());Gb();window.Event=Ib;window.CustomEvent=Jb;window.MouseEvent=Kb;window.ShadowRoot=zc};';
const YOUTUBE = "var w=window.ShadyDOM||{};if(w.inUse){window.ShadyDOM={inUse:w.inUse};" + YOUTUBE_TAIL;

test("ShadyDOM's window.ShadowRoot assignment keeps the browser's ShadowRoot", () => {
  const fixed = fixScript(YOUTUBE);
  assert.notEqual(fixed, YOUTUBE);
  assert.doesNotMatch(fixed, /window\.ShadowRoot=zc/);
  assert.match(fixed, /window\.MouseEvent=Kb;\(function\(N,S\)\{.*\}\)\(window\.ShadowRoot,zc\)\};$/);
  assert.doesNotThrow(() => new vm.Script(fixed), "still valid JavaScript");
});

test("instanceof ShadowRoot is true for the browser's and the polyfill's roots", () => {
  class NativeShadowRoot {}
  class ShadyRoot {}
  const window = { ShadowRoot: NativeShadowRoot };
  const code = fixScript("/*ShadyDOM*/window.ShadowRoot=zc;");
  vm.runInNewContext(code, { window, zc: ShadyRoot, Object, Symbol, Function });
  assert.equal(window.ShadowRoot, NativeShadowRoot, "the global stays the browser's");
  assert.equal(new ShadyRoot() instanceof window.ShadowRoot, true);
  assert.equal(new NativeShadowRoot() instanceof window.ShadowRoot, true);
  assert.equal({} instanceof window.ShadowRoot, false);
});

test("inside the polyfill, its own reads of ShadowRoot get its class", () => {
  const polyfill = 'function y(a){return a instanceof ShadowRoot}var z={attachShadow:function(a){b.__proto__=ShadowRoot.prototype}};' +
    'var names=["ShadowRoot"],o={ShadowRoot:1},p=window.ShadowRoot;var w=window.ShadyDOM;if(w){window.ShadowRoot=zc}';
  const fixed = fixScript(polyfill);
  assert.match(fixed, /return a instanceof \(window\.__saintsShadyRoot\|\|ShadowRoot\)\}/);
  assert.match(fixed, /b\.__proto__=\(window\.__saintsShadyRoot\|\|ShadowRoot\)\.prototype/);
  assert.match(fixed, /names=\["ShadowRoot"\]/, "strings are left alone");
  assert.match(fixed, /o=\{ShadowRoot:1\}/, "object keys are left alone");
  assert.match(fixed, /p=window\.ShadowRoot;/, "window.ShadowRoot reads are left alone");

  class NativeShadowRoot {}
  class ShadyRoot { Aa() { return "polyfill method"; } }
  const window = { ShadowRoot: NativeShadowRoot, ShadyDOM: {} };
  const b = {};
  vm.runInNewContext(fixed + ";z.attachShadow(1);", { window, zc: ShadyRoot, b, Object, Symbol, Function });
  assert.equal(b.Aa(), "polyfill method", "a shady root built by the polyfill has its methods");
  assert.equal(window.ShadowRoot, NativeShadowRoot);
});

test("other scripts are returned unchanged", () => {
  for (const text of ["window.ShadowRoot=x;", "var ShadyDOM={};", "console.log(1)", ""]) {
    assert.equal(fixScript(text), text);
  }
  assert.equal(fixScript(null), null);
});

test("both engines apply the fixes to scripts", () => {
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(sw, /importScripts\([^)]*"\/sitefixes\.js"\)/);
  assert.match(sw, /destination === "script"\) response = await fixScriptResponse\(response\)/);
  const engine2 = readFileSync(new URL("../public/engine2.js", import.meta.url), "utf8");
  assert.match(engine2, /destination === "script" && self\.saintsSiteFixes\) fixScriptBody\(props\.response\)/);
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /<script src="sitefixes\.js" defer><\/script>/);
});
