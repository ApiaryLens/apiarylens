const CACHE_PREFIX = 'apiarylens-shell-';
const CACHE = `${CACHE_PREFIX}0.1.0-preview.4-r1`;
const BASE = new URL('./', self.registration.scope);
const SHELL = [
  BASE.pathname,
  new URL('index.html', BASE).pathname,
  new URL('manifest.webmanifest', BASE).pathname,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const shellResponse = await fetch(BASE.pathname, { cache: 'reload' });
      if (!shellResponse.ok) throw new Error(`Shell fetch failed (${shellResponse.status})`);
      const shell = await shellResponse.clone().text();
      const assets = [...shell.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map((match) => new URL(match[1], shellResponse.url || BASE).pathname)
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
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/'))
    return;
  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (!response.ok && event.request.mode === 'navigate') {
          const cachedShell =
            (await caches.match(BASE.pathname)) ??
            (await caches.match(new URL('index.html', BASE).pathname));
          if (cachedShell) return cachedShell;
        }
        if (!response.ok) return response;
        const copy = response.clone();
        await caches.open(CACHE).then((cache) => cache.put(event.request, copy));
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
          return new Response('Offline resource unavailable', {
            status: 504,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        }),
      ),
  );
});
