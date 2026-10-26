"use strict";

// Scales a game that draws at a fixed size up to fill the frame it plays in
// (Saints Search's page area, the console's proxy tab, a fullscreen window),
// keeping its shape and centring it. Retro Bowl does the same for its canvas
// in its own page.
//
//   <script src="/games/fit.js" data-fit="#game"></script>
//
// data-fit is the element to scale: the game's box at its own size. It's
// scaled with a CSS transform, so its layout (and what the game measures of
// it) stays the game's own; it's measured again whenever the frame or the
// element changes size. Only for games whose input survives a transform:
// keys, clicks on page elements, and pointers read from offsetX or scaled by
// getBoundingClientRect.
(function () {
  const script = document.currentScript;
  const selector = script && script.dataset.fit;
  if (!selector) return;
  let el = null;
  let last = "";

  function fit() {
    el = el && el.isConnected ? el : document.querySelector(selector);
    if (!el) return;
    // offsetWidth/Height ignore transforms: the element's own size.
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!w || !h || !vw || !vh) return;
    const scale = Math.min(vw / w, vh / h);
    const left = Math.round((vw - w * scale) / 2), top = Math.round((vh - h * scale) / 2);
    const key = [w, h, vw, vh].join(" ");
    if (key === last) return;
    last = key;
    const s = el.style;
    s.position = "fixed";
    s.left = "0";
    s.top = "0";
    s.margin = "0";
    s.transformOrigin = "0 0";
    s.transform = "translate(" + left + "px, " + top + "px) scale(" + scale + ")";
  }

  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", fit);
  document.addEventListener("fullscreenchange", fit);
  if (window.ResizeObserver) {
    // The game resizing its own box (a new level, a menu) re-fits it.
    const ro = new ResizeObserver(fit);
    const watch = () => { const t = document.querySelector(selector); if (t) ro.observe(t); else setTimeout(watch, 200); };
    watch();
  }
  // Pages that build their box after this runs.
  document.addEventListener("DOMContentLoaded", fit);
  window.addEventListener("load", fit);
  fit();
})();
