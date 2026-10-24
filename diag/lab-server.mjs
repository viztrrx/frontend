// Local stand-in for the deployed proxy, for diagnostics in CI:
//   http://localhost:8781  dist1/ (Scramjet 1.1 build)
//   http://localhost:8782  dist2/ (Scramjet 2 build)
//   wss://localhost:4443/wisp/  a Wisp server (wisp-js) with a self-signed certificate
// Both frontends get config.js pointing at that Wisp server and the Worker's
// isolation headers. Run Chrome with --ignore-certificate-errors.
//
//   node diag/lab-server.mjs <dist1> <dist2> <cert.pem> <key.pem>
import { createServer } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const [dist1, dist2, certPath, keyPath] = process.argv.slice(2).map((p) => resolve(p));
const { server: wisp, logging } = await import(process.env.WISP_JS_PATH || "@mercuryworkshop/wisp-js/server");
logging.set_level(logging.WARN);
Object.assign(wisp.options, { allow_udp_streams: false, dns_servers: null });
// LAB_LOCAL=1 lets it reach sites on this machine (testing the lab itself).
if (process.env.LAB_LOCAL === "1") Object.assign(wisp.options, { allow_loopback_ips: true, allow_private_ips: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
function frontend(root, port) {
  createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const headers = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp", "cache-control": "no-store" };
    if (url.pathname === "/config.js") {
      res.writeHead(200, { ...headers, "content-type": "text/javascript" });
      return res.end('let _CONFIG = { wispUrl: "wss://localhost:4443/wisp/" };\n');
    }
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) { res.writeHead(403); return res.end(); }
    try { if ((await stat(path)).isDirectory()) path = join(path, "index.html"); } catch {}
    try {
      const body = await readFile(path);
      res.writeHead(200, { ...headers, "content-type": TYPES[extname(path)] || "application/octet-stream" });
      res.end(body);
    } catch { res.writeHead(404, headers); res.end("not found"); }
  }).listen(port, () => console.log("frontend " + root + " on http://localhost:" + port));
}
frontend(dist1, 8781);
frontend(dist2, 8782);

const tls = createTlsServer({ cert: await readFile(certPath), key: await readFile(keyPath) }, (req, res) => { res.writeHead(200); res.end("ok"); });
tls.on("upgrade", (req, socket, head) => wisp.routeRequest(req, socket, head));
tls.listen(4443, () => console.log("wisp on wss://localhost:4443/wisp/"));
