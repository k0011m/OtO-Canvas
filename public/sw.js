/* OtoCanvas network-first app-shell service worker. */
const CACHE_PREFIX = "oto-canvas-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const SCOPE_URL = new URL("./", self.location.href);
const APP_SHELL = [
  SCOPE_URL.href,
  new URL("index.html", SCOPE_URL).href,
  new URL("manifest.webmanifest", SCOPE_URL).href,
  new URL("icon.svg", SCOPE_URL).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
      ),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE_URL.href)) return;

  event.respondWith(
    fetch(request)
      .then(async (response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, copy);
          } catch {
            // A cache quota error must not block the live network response.
          }
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, {
          ignoreSearch: request.mode === "navigate",
        });
        if (cached) return cached;

        if (request.mode === "navigate") {
          const appShell = await caches.match(new URL("index.html", SCOPE_URL).href);
          if (appShell) return appShell;
        }

        return Response.error();
      }),
  );
});
