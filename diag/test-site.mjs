// Small test site for diag runs (port 8099): pages that reproduce one
// behaviour each. Run the lab server with LAB_LOCAL=1 so Wisp may reach it.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const WC = readFileSync(new URL("wc/orig.js", import.meta.url));
const TEXT = "This is a test page served by the diag test site so the proxy has something to load. ".repeat(6);
const page = (title, body, head = "") => `<!doctype html><html><head><title>${title}</title>${head}</head><body>${body}</body></html>`;
// rrweb's vQd(): borrow untouched natives from a throwaway iframe, then call them across realms.
const RRWEB = `<div id="out">handler did not run</div><div id="host"></div><script>
  function pristine(name) {
    const f = document.createElement("iframe");
    document.body.appendChild(f);
    const proto = f.contentWindow[name].prototype;
    document.body.removeChild(f);
    return proto;
  }
  const host = document.getElementById("host");
  const root = host.attachShadow({ mode: "open" });
  let n = 0;
  for (let i = 0; i < 200; i++) {
    const get = Object.getOwnPropertyDescriptor(pristine("ShadowRoot"), "host").get;
    try { if (get.call(root) === host) n++; } catch (e) {}
    const node = pristine("Node");
    node.contains.call(document.body, host);
    node.getRootNode.call(host);
  }
  document.getElementById("out").textContent = "handler ran: " + n + " ${TEXT}";
</script>`;
const SHADY = `<script>window.ShadyDOM={force:true,preferPerformance:true,noPatch:true};window.ShadyCSS={disableRuntime:true};</script><script src="/wc-sd.js"></script>`;
const ROUTES = {
  "/": page("Test home", `<h1>Test home</h1><p>${TEXT}</p>`),
  "/rrweb": page("rrweb", RRWEB),
  "/rrweb-shady": page("rrweb shady", RRWEB, SHADY),
};
createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/wc-sd.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(WC); }
  const body = ROUTES[path];
  res.writeHead(body ? 200 : 404, { "content-type": "text/html" });
  res.end(body || page("Not found", "<h1>404</h1>"));
}).listen(8099, () => console.log("test site on http://127.0.0.1:8099"));
