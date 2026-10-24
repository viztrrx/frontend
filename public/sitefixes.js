"use strict";

// Fixes for specific sites' scripts, applied to proxied JavaScript after
// Scramjet has rewritten it. Loaded by sw.js (Scramjet 1.1) and by the page
// for engine2.js (Scramjet 2).
//
// ShadyDOM (the web components polyfill; YouTube forces it on with
// ShadyDOM = {force: true}) ends its setup with `window.ShadowRoot = <its own
// class>`. Through the proxy, a page that has done that crashes Chrome's tab
// ("Aw, Snap!", error code 5 / STATUS_BREAKPOINT) a few seconds later; without
// that one assignment it doesn't. So the global stays the browser's
// ShadowRoot, and:
// - inside the polyfill, its own reads of the global ShadowRoot (instanceof
//   checks, `x.__proto__ = ShadowRoot.prototype`) get its class, as before;
// - everywhere else, `x instanceof ShadowRoot` also recognises the polyfill's
//   roots (Symbol.hasInstance), as it did when the global was the polyfill's.
(function (scope) {
  const SHADOWROOT_ASSIGNMENT = /\bwindow\.ShadowRoot\s*=\s*([A-Za-z_$][\w$]*)(?=\s*[;},)\n])/;
  // A bare ShadowRoot identifier: not a property (.ShadowRoot), not inside a
  // string, not an object key.
  const SHADOWROOT_READ = /(?<![\w$.'"`])ShadowRoot(?![\w$'"`]|\s*:)/g;
  const POLYFILL_CLASS = "window.__saintsShadyRoot";
  const keepNativeShadowRoot = (polyfillClass) =>
    "(function(N,S){try{Object.defineProperty(window,\"__saintsShadyRoot\",{value:S,configurable:!0});" +
    "Object.defineProperty(N,Symbol.hasInstance,{configurable:!0,value:function(o){" +
    "return o instanceof S||Function.prototype[Symbol.hasInstance].call(N,o)}})}catch(e){}})(window.ShadowRoot," + polyfillClass + ")";

  // The script's text with any fixes applied (the same text if none apply).
  function fixScript(text) {
    if (typeof text !== "string" || !text.includes("ShadyDOM") || !text.includes("ShadowRoot")) return text;
    const match = SHADOWROOT_ASSIGNMENT.exec(text);
    if (!match) return text;
    const before = text.slice(0, match.index).replace(SHADOWROOT_READ, "(" + POLYFILL_CLASS + "||ShadowRoot)");
    const after = text.slice(match.index + match[0].length).replace(SHADOWROOT_READ, "(" + POLYFILL_CLASS + "||ShadowRoot)");
    return before + keepNativeShadowRoot(match[1]) + after;
  }

  scope.saintsSiteFixes = { fixScript };
})(typeof self !== "undefined" ? self : globalThis);
