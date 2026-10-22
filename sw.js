// UBBW service worker: makes the installed app open fast and keeps working on bad venue Wi-Fi.
//   /_next/static, icons, fonts → cache first (file names are content-hashed)
//   pages                        → network first, last good copy when offline, then /offline
//   /api                         → never cached here (the app keeps its own copy of your pass)
// Works at the site root or under a base path (the GitHub Pages demo lives at /ubbw-2026/).
const BASE = self.location.pathname.replace(/sw\.js$/, ""); // "/" or "/ubbw-2026/"
const SLASH = new URL(self.location.href).searchParams.get("slash") === "1"; // static build: folder/index.html URLs
const VERSION = "ubbw-v3";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE = `${BASE}offline${SLASH ? "/" : ""}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const rel = "/" + url.pathname.slice(BASE.length); // path inside the app, e.g. "/app/scan"
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE) || rel.startsWith("/api/")) return;

  if (rel.startsWith("/_next/static/") || rel.startsWith("/icons/") || /\.(woff2?|png|svg|ico)$/.test(rel)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Crew pages are personal and need the server anyway, so they're never kept.
          if (res.ok && !res.redirected && !rel.startsWith("/staff")) caches.open(PAGES).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match(OFFLINE))),
    );
  }
});
