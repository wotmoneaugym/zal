// Service worker: keeps the app usable offline (design §9, §16).
// Cache-first for this site's own files only; requests to other origins (api.github.com) are never touched.
// build.ts (Task 16) fills in the two placeholders below: the build stamp and the list of app shell files.
const CACHE_VERSION = "20261014T110317Z";
const CACHE_PREFIX = "workout-app-";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const PRECACHE = ["./","core/dates.js","core/merge.js","core/parse-note.js","core/parse-result.js","core/plan-reader.js","core/previous.js","core/render-note.js","core/state.js","core/validate.js","core/workout.js","icons/icon-180.png","icons/icon-192.png","icons/icon-512.png","index.html","manifest.webmanifest","src/controller.js","src/github.js","src/main.js","src/sender.js","src/storage.js","src/view.js","styles.css"];

function absolute(path) {
  return new URL(path, self.location.href).href;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const path of PRECACHE) {
      const url = absolute(path);
      // `cache: "reload"` skips the browser's HTTP cache; the version query also gets past GitHub Pages' CDN,
      // which may still hold the previous build. The copy is stored under the plain URL the page asks for.
      const response = await fetch(url + "?v=" + CACHE_VERSION, { cache: "reload" });
      if (!response.ok) throw new Error("precache " + path + ": " + response.status);
      await cache.put(url, response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached ?? fetch(request);
  })());
});
