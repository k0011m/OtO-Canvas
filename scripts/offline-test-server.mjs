import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve("dist");
let revision = 0;
let fail = false;
let failures = 0;
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

/** 本番成果物を配信し、テストから更新失敗・復旧を再現するローカル専用サーバー。 */
async function handle(request, response) {
  const url = new URL(request.url, "http://127.0.0.1:4174");
  // 本番Cloudflare Pagesと同じ正規化を行い、転送応答のキャッシュ障害を検出する。
  if (url.pathname === "/index.html") { response.writeHead(308, { Location: "/" }); response.end(); return; }
  if (url.pathname === "/_test/state") {
    if (request.method === "POST") {
      let body = "";
      for await (const part of request) body += part;
      const value = JSON.parse(body); revision = value.revision ?? 0; fail = value.fail ?? false; failures = 0;
    }
    response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ revision, fail, failures })); return;
  }
  if (fail && url.pathname.endsWith("icon-512.png")) { failures++; response.writeHead(503); response.end("Simulated interrupted download"); return; }
  const path = resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
  try {
    let content = await readFile(path);
    if (url.pathname === "/sw.js" && revision === -1) {
      // 障害版と同じ「転送済みindex.htmlをそのまま返す」Workerで既存端末の移行を再現する。
      const config = JSON.parse(content.toString().match(/const BUILD = (\{[^\n]+\});/)[1]);
      const files = config.files.map((file) => file === "./" ? "index.html" : file);
      content = Buffer.from(`
        const name = 'oto-canvas-shell-broken-redirect';
        const files = ${JSON.stringify(files)}.map(file => new URL(file, self.location.href).href);
        self.addEventListener('install', event => event.waitUntil(caches.open(name).then(cache => cache.addAll(files))));
        self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
        self.addEventListener('fetch', event => event.respondWith((async () => {
          const cache = await caches.open(name);
          if (event.request.mode === 'navigate') return await cache.match(new URL('index.html', self.location.href).href);
          return await cache.match(event.request) || fetch(event.request);
        })()));
      `);
    }
    if (url.pathname === "/sw.js" && revision) content = Buffer.from(content.toString().replace(/"version":"([^"]+)"/, `"version":"$1-test-${revision}"`));
    response.setHeader("Content-Type", types[extname(path)] ?? "application/octet-stream");
    response.setHeader("Cache-Control", "no-store"); response.end(content);
  } catch { response.writeHead(404); response.end(); }
}

createServer((request, response) => { void handle(request, response).catch(() => { response.writeHead(500); response.end(); }); }).listen(4174, "127.0.0.1");
