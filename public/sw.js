/* TravelBuddy stores its public app shell only. Location, APIs, and map tiles
   are deliberately excluded from the service-worker cache. */
const CACHE_NAME = 'travelbuddy-shell-v3';
const CACHE_PREFIX = 'travelbuddy-shell-';
const STATIC_PATH = /\.(?:js|css|svg|png|webp|jpe?g|ico|webmanifest|woff2?)$/i;
const PHOTO_MANIFEST = '/photos/attribution.json';
const READY_KEY = '/__travelbuddy_offline_ready__';
const BOOT_FILES = ['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/istanbul-map.svg', PHOTO_MANIFEST];
let offlinePreparation = null;
const progressPorts = new Set();

function isPublicStatic(url) {
  return url.origin === self.location.origin && (
    BOOT_FILES.includes(url.pathname) || ((url.pathname.startsWith('/assets/') || url.pathname.startsWith('/photos/')) && STATIC_PATH.test(url.pathname))
  );
}

async function cachePage(cache, response) {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('App shell unavailable');
  const html = await response.clone().text();
  const paths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter(isPublicStatic)
    .map((url) => url.href);
  // Download the versioned build assets before making its HTML the offline shell.
  await Promise.all([...new Set(paths)].map(async (url) => {
    if (await cache.match(url, { ignoreVary: true })) return;
    const asset = await fetch(url, { cache: 'reload' });
    if (!asset.ok) throw new Error('App asset unavailable');
    await cache.put(url, asset);
  }));
  await cache.put('/', response);
}

function photoPaths(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Photo list unavailable');
  const paths = Object.values(manifest).map((photo) => {
    if (!photo || typeof photo.url !== 'string') throw new Error('Photo list unavailable');
    const url = new URL(photo.url, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith('/photos/') || !/\.(?:webp|jpe?g|png)$/i.test(url.pathname)) throw new Error('Photo list unavailable');
    return url.pathname + url.search;
  });
  if (!paths.length) throw new Error('Photo list unavailable');
  return [...new Set(paths)];
}

async function inspectOffline(cache) {
  const manifest = await cache.match(PHOTO_MANIFEST, { ignoreVary: true });
  if (!manifest) return { status: 'not-ready', cachedPhotos: 0, totalPhotos: 0, message: 'Prepare offline to download your app and venue photos.' };
  const paths = photoPaths(await manifest.json());
  const saved = await Promise.all(paths.map((path) => cache.match(path, { ignoreVary: true })));
  const cachedPhotos = saved.filter(Boolean).length;
  const marker = await cache.match(READY_KEY);
  const shell = await cache.match('/');
  let shellComplete = false;
  if (shell) {
    const html = await shell.text();
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => new URL(match[1], self.location.origin)).filter(isPublicStatic).map((url) => url.href);
    const required = [...new Set([...BOOT_FILES, ...assets])];
    shellComplete = (await Promise.all(required.map((path) => cache.match(path, { ignoreVary: true })))).every(Boolean);
  }
  const stamp = marker ? await marker.json() : null;
  const ready = stamp?.version === CACHE_NAME && stamp.totalPhotos === paths.length && shellComplete && cachedPhotos === paths.length;
  return { status: ready ? 'ready' : 'not-ready', cachedPhotos, totalPhotos: paths.length, message: ready ? 'Offline ready. Your app, guide, map, and venue photos are downloaded.' : 'Prepare offline to finish downloading the app and every venue photo.' };
}

async function prepareOffline() {
  const cache = await caches.open(CACHE_NAME);
  let existing;
  try { existing = await inspectOffline(cache); } catch { /* Refresh malformed cached metadata below. */ }
  if (existing?.status === 'ready') return existing;
  await cache.delete(READY_KEY);
  // Refresh the current public shell before declaring this version complete.
  await cachePage(cache, await fetch('/', { cache: 'reload' }));
  for (const path of BOOT_FILES) {
    if (path !== PHOTO_MANIFEST && await cache.match(path, { ignoreVary: true })) continue;
    const response = await fetch(path, { cache: 'reload' });
    if (!response.ok) throw new Error('A required offline file could not be downloaded.');
    await cache.put(path, response);
  }
  const manifest = await cache.match(PHOTO_MANIFEST, { ignoreVary: true });
  const paths = photoPaths(await manifest.json());
  let cachedPhotos = 0;
  const queue = [...paths];
  const progress = () => {
    const update = { type: 'OFFLINE_PROGRESS', status: 'preparing', cachedPhotos, totalPhotos: paths.length, message: `Downloading venue photos: ${cachedPhotos} of ${paths.length}.` };
    progressPorts.forEach((port) => port.postMessage(update));
  };
  progress();
  await Promise.all(Array.from({ length: Math.min(3, paths.length) }, async () => {
    while (queue.length) {
      const path = queue.shift();
      if (!await cache.match(path, { ignoreVary: true })) {
        const response = await fetch(path, { cache: 'reload' });
        if (!response.ok || response.type === 'opaque' || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('A venue photo could not be downloaded.');
        await cache.put(path, response);
      }
      cachedPhotos += 1;
      progress();
    }
  }));
  await cache.put(READY_KEY, new Response(JSON.stringify({ version: CACHE_NAME, totalPhotos: paths.length }), { headers: { 'content-type': 'application/json' } }));
  const result = await inspectOffline(cache);
  if (result.status !== 'ready') throw new Error('Offline files are incomplete. Please try again.');
  return result;
}

self.addEventListener('message', (event) => {
  const port = event.ports?.[0];
  if (!port) return;
  if (event.data?.type === 'GET_OFFLINE_STATUS') {
    event.waitUntil(caches.open(CACHE_NAME).then(inspectOffline).then((status) => port.postMessage({ type: 'OFFLINE_STATUS', ...status })).catch(() => port.postMessage({ type: 'OFFLINE_ERROR', status: 'error', cachedPhotos: 0, totalPhotos: 0, message: 'Offline storage is unavailable. Please try again.' })));
  } else if (event.data?.type === 'CACHE_OFFLINE_IMAGES') {
    progressPorts.add(port);
    if (!offlinePreparation) offlinePreparation = prepareOffline().finally(() => { offlinePreparation = null; });
    event.waitUntil(offlinePreparation.then((status) => port.postMessage({ type: 'OFFLINE_READY', ...status })).catch(() => port.postMessage({ type: 'OFFLINE_ERROR', status: 'error', cachedPhotos: 0, totalPhotos: 0, message: 'Offline preparation did not finish. Connect to the internet and try again; completed downloads are kept.' })).finally(() => progressPorts.delete(port)));
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const page = await fetch('/', { cache: 'reload' });
    await cachePage(cache, page);
    await cache.addAll(BOOT_FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (!response.ok) throw new Error('Navigation unavailable');
        event.waitUntil(cachePage(cache, response.clone()).catch(() => undefined));
        return response;
      } catch {
        return (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (isPublicStatic(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      // Vite preview varies CORS headers by Origin. The HTML's crossorigin
      // scripts/styles differ from install-time fetches, but these public
      // assets have identical bodies. Keep exact URL/query matching.
      const saved = await cache.match(request, { ignoreVary: true });
      // Fingerprinted builds are immutable. Stable manifest/icon URLs can change
      // on a deployment and use the network when it is available.
      if (saved && !BOOT_FILES.includes(url.pathname)) return saved;
      try {
        const response = await fetch(request);
        if (!response.ok) return saved || response;
        if (response.type !== 'opaque') await cache.put(request, response.clone());
        return response;
      } catch {
        return saved || Response.error();
      }
    })());
  }
});
