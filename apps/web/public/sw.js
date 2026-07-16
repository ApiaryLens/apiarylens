const CACHE = 'apiarylens-shell-0.1.0-preview.1';
const BASE = new URL('./', self.registration.scope);
const SHELL = [
  BASE.pathname,
  new URL('index.html', BASE).pathname,
  new URL('manifest.webmanifest', BASE).pathname,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const shellResponse = await fetch(BASE.pathname);
      const shell = await shellResponse.clone().text();
      const assets = [...shell.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map((match) => new URL(match[1], BASE).pathname)
        .filter((pathname) => pathname.startsWith(BASE.pathname));
      await cache.addAll([...new Set([...SHELL, ...assets])]);
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/'))
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(async (cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return (
              (await caches.match(BASE.pathname)) ??
              caches.match(new URL('index.html', BASE).pathname)
            );
          }
          return undefined;
        }),
      ),
  );
});
