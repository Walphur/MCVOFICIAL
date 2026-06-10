/* MCV — service worker: solo imágenes en caché; HTML/CSS/JS siempre red */
const CACHE = "mcv-static-v54";
const PRECACHE = ["./logo.png", "./manifest.webmanifest"];

function isMutableAsset(pathname) {
    return (
        /\.(html?|css|js)$/i.test(pathname) ||
        pathname === "/" ||
        pathname === "" ||
        pathname.indexOf("/equipo") === 0
    );
}

self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE).then(function (cache) {
            return cache.addAll(PRECACHE).catch(function () {});
        })
    );
    self.skipWaiting();
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches
            .keys()
            .then(function (keys) {
                return Promise.all(
                    keys
                        .filter(function (k) {
                            return k !== CACHE;
                        })
                        .map(function (k) {
                            return caches.delete(k);
                        })
                );
            })
            .then(function () {
                return self.clients.claim();
            })
    );
});

self.addEventListener("fetch", function (event) {
    var req = event.request;
    if (req.method !== "GET") return;
    var url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.indexOf("/api/") !== -1) return;

    if (isMutableAsset(url.pathname)) {
        event.respondWith(
            fetch(new Request(req, { cache: "no-store" })).catch(function () {
                return caches.match(req);
            })
        );
        return;
    }

    event.respondWith(
        caches.match(req).then(function (cached) {
            if (cached) return cached;
            return fetch(req)
                .then(function (res) {
                    if (!res || res.status !== 200 || res.type !== "basic") return res;
                    if (/\.(png|jpg|jpeg|webp|ico|svg|woff2?)$/i.test(url.pathname)) {
                        var copy = res.clone();
                        caches.open(CACHE).then(function (c) {
                            c.put(req, copy);
                        });
                    }
                    return res;
                })
                .catch(function () {
                    return caches.match("./logo.png");
                });
        })
    );
});
