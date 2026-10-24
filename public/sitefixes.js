"use strict";

// Fixes for specific sites' scripts, applied to proxied JavaScript after
// Scramjet has rewritten it. Loaded by sw.js (Scramjet 1.1) and by the page
// for engine2.js (Scramjet 2).
//
// ShadyDOM (the web components polyfill; YouTube forces it on with
// ShadyDOM = {force: true}) ends its setup with `window.ShadowRoot = <its own
// class>`. Through the proxy, a page that has done that crashes Chrome's tab
// ("Aw, Snap!", error code 5 / STATUS_BREAKPOINT) a few seconds later; without
// that one assignment it doesn't. The polyfill and pages use the global to
// tell shadow roots apart (`x instanceof ShadowRoot`), so the assignment is
// replaced with a Symbol.hasInstance on the browser's own ShadowRoot that
// also recognises the polyfill's roots: instanceof answers as before, and
// the global stays the browser's.
(function (scope) {
  const SHADOWROOT_ASSIGNMENT = /\bwindow\.ShadowRoot\s*=\s*([A-Za-z_$][\w$]*)(?=\s*[;},)\n])/;
  const keepNativeShadowRoot = (polyfillClass) =>
    "(function(N,S){try{Object.defineProperty(N,Symbol.hasInstance,{configurable:!0,value:function(o){" +
    "return o instanceof S||Function.prototype[Symbol.hasInstance].call(N,o)}})}catch(e){}})(window.ShadowRoot," + polyfillClass + ")";

  // The script's text with any fixes applied (the same text if none apply).
  function fixScript(text) {
    if (typeof text !== "string" || !text.includes("ShadyDOM") || !text.includes("ShadowRoot")) return text;
    return text.replace(SHADOWROOT_ASSIGNMENT, (_, polyfillClass) => keepNativeShadowRoot(polyfillClass));
  }

  scope.saintsSiteFixes = { fixScript };
})(typeof self !== "undefined" ? self : globalThis);
