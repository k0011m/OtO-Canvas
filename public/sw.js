/* ビルド時に必須ファイルと内容ハッシュを埋め込む。開発サーバーでは登録しない。 */
const BUILD = /* OTO_PRECACHE */ null;
const CACHE_PREFIX = "oto-canvas-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD?.version ?? "unbuilt"}`;
const SCOPE_URL = new URL("./", self.location.href);
const SHELL_URL = SCOPE_URL.href;
const FILES = (BUILD?.files ?? []).map((file) => new URL(file, SCOPE_URL).href);

/** 全ファイルが揃った版だけインストールし、通信失敗時は稼働中の版を残す。 */
async function installShell() {
  if (!BUILD || !FILES.length) throw new Error("Offline manifest is missing");
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(FILES.map((url) => new Request(url, { cache: "reload" })));
  // 旧版は転送済みHTMLを返して起動自体に失敗する。操作不能な版に限り修正版を即時適用する。
  const oldKeys = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME);
  for (const key of oldKeys) {
    const oldCache = await caches.open(key);
    const oldShell = await oldCache.match(new URL("index.html", SCOPE_URL).href);
    if (oldShell?.redirected) {
      // 障害の印も修復し、次回以降の正常な更新まで自動適用してしまわないようにする。
      await oldCache.put(new URL("index.html", SCOPE_URL).href,
        new Response(oldShell.body, { status: oldShell.status, statusText: oldShell.statusText, headers: oldShell.headers }));
      await self.skipWaiting();
    }
  }
}

/** 実ファイルを照合し、不完全なキャッシュを準備完了と表示しない。 */
async function shellReady() {
  const cache = await caches.open(CACHE_NAME);
  const matches = await Promise.all(FILES.map((url) => cache.match(url)));
  return FILES.length > 0 && matches.every(Boolean);
}

self.addEventListener("install", (event) => event.waitUntil(installShell()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** 整理しても稼働中の必須データは残し、オフライン再起動を妨げない。 */
async function cleanOldCaches() {
  if (!(await shellReady())) await installShell();
  if (self.registration.waiting) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") { event.waitUntil(self.skipWaiting()); return; }
  if (!["OFFLINE_STATUS", "CLEAN_OLD_CACHES", "REPAIR_SHELL"].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === "REPAIR_SHELL") await installShell();
      if (event.data.type === "CLEAN_OLD_CACHES") await cleanOldCaches();
      event.ports[0]?.postMessage({ ready: await shellReady(), version: BUILD.version });
    } catch { event.ports[0]?.postMessage({ ready: false, error: true }); }
  })());
});

/** HTMLとJS/CSSは同じ版を返し、更新途中の混在と通信待ちを避ける。 */
async function respond(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    if (request.mode === "navigate") {
      const shell = await cache.match(SHELL_URL);
      // ナビゲーションに転送済みResponseを返すとChromiumがERR_FAILEDにするため、本文を新しい応答にする。
      if (shell) return new Response(shell.body, { status: shell.status, statusText: shell.statusText, headers: shell.headers });
    } else {
      const cached = await cache.match(request);
      if (cached) return cached;
      // 更新前から開いている画面の遅延ロードも支える。旧版は保護者の整理で削除する。
      if (new URL(request.url).pathname.includes("/assets/")) {
        const old = await caches.match(request);
        if (old) return old;
      }
    }
  } catch {
    // 保存領域の利用拒否だけで、通信可能なサイトまで開けなくしない。
  }
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // 回答と管理APIはオフラインキャッシュを経由させず、常にサーバーへ送る。
  if (url.pathname.startsWith("/api/")) return;
  if (request.method !== "GET" || request.headers.has("range") || url.origin !== SCOPE_URL.origin || !url.href.startsWith(SCOPE_URL.href)) return;
  event.respondWith(respond(request));
});
