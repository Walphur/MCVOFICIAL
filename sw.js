/* MCV — service worker mínimo (estáticos + offline básico) */
const CACHE = "mcv-static-v25";
const PRECACHE = [
    "./",
    "./index.html",
    "./style.css",
    "./mcv-layout.js",
    "./logo.png",
    "./manifest.webmanifest"
];

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
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) {
                return k !== CACHE;
            }).map(function (k) {
                return caches.delete(k);
            }));
        }).then(function () {
            return self.clients.claim();
        })
    );
});

self.addEventListener("fetch", function (event) {
    var req = event.request;
    if (req.method !== "GET") return;
    var url = new URL(req.url);
    if (url.pathname.indexOf("/api/") !== -1) return;
    if (url.origin !== self.location.origin) return;
  /* Admin/login siempre red: evita quedar sin pestaña Vital tras deploy */
    if (/^\/(admin|login)\.html$/i.test(url.pathname)) {
        event.respondWith(fetch(new Request(req, { cache: "no-store" })));
        return;
    }

    event.respondWith(
        caches.match(req).then(function (cached) {
            if (cached) return cached;
            return fetch(req)
                .then(function (res) {
                    if (!res || res.status !== 200 || res.type !== "basic") return res;
                    var copy = res.clone();
                    caches.open(CACHE).then(function (c) {
                        c.put(req, copy);
                    });
                    return res;
                })
                .catch(function () {
                    return caches.match("./index.html");
                });
        })
    );
});
