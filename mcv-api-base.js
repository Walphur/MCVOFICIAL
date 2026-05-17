/**
 * Base URL del backend (Express + API).
 *
 * Orden de prioridad:
 * 1) ?api=https://tu-render.onrender.com en la URL (se guarda en localStorage)
 * 2) <meta name="mcv-api" content="https://...">
 * 3) window.MCV_API_BASE (mcv-local-api.js, etc.)
 * 4) En mcvoficial.com / www: localStorage solo si el host es *.onrender.com; si no, https://mcv-oficial.onrender.com
 * 5) Otros hosts: localStorage mcv_api_base (si no es el mismo origen que la página)
 * 6) window.location.origin (mismo host que el Node)
 */
(function (w) {
    var KEY = "mcv_api_base";

    function strip(s) {
        return String(s || "").replace(/\/$/, "");
    }

    function parseApiUrl(str) {
        var t = String(str || "").trim();
        if (!t) return null;
        try {
            var raw = /^\s*https?:\/\//i.test(t) ? t : "https://" + t;
            return new URL(raw).origin;
        } catch (e) {
            return null;
        }
    }

    function persist(origin) {
        if (!origin) return;
        try {
            w.localStorage.setItem(KEY, origin);
        } catch (e) {}
        try {
            w.sessionStorage.setItem(KEY, origin);
        } catch (e2) {}
    }

    w.mcvResolveApiBase = function mcvResolveApiBase() {
        var q = new URLSearchParams(w.location.search || "").get("api");
        if (q) {
            var fromQ = parseApiUrl(q);
            if (fromQ) {
                persist(fromQ);
                return strip(fromQ);
            }
        }

        var host = String(w.location.hostname || "").toLowerCase();
        var isStaticMcv = host === "mcvoficial.com" || host === "www.mcvoficial.com";

        if (typeof document !== "undefined") {
            var metaEl = document.querySelector('meta[name="mcv-api"]');
            var metaContent = metaEl && metaEl.getAttribute("content");
            var fromMeta = parseApiUrl(metaContent);
            if (fromMeta) {
                persist(fromMeta);
                return strip(fromMeta);
            }
        }

        if (w.MCV_API_BASE && String(w.MCV_API_BASE).trim()) {
            var fromG = parseApiUrl(w.MCV_API_BASE);
            if (fromG) {
                persist(fromG);
                return strip(fromG);
            }
        }

        /* Sitio estático MCV: no usar localStorage antes del default Render (evita URL vieja / mismo origen → 404). */
        if (isStaticMcv) {
            var stored2 = null;
            try {
                stored2 = w.localStorage.getItem(KEY) || w.sessionStorage.getItem(KEY);
            } catch (e2) {
                stored2 = null;
            }
            var st2 = strip(stored2 || "");
            if (st2) {
                try {
                    var h2 = new URL(st2).hostname.toLowerCase();
                    if (h2.endsWith(".onrender.com")) {
                        return st2;
                    }
                } catch (e3) {
                    /* ignore */
                }
            }
            return "https://mcv-oficial.onrender.com";
        }

        var stored =
            (function () {
                try {
                    return w.localStorage.getItem(KEY) || w.sessionStorage.getItem(KEY);
                } catch (e) {
                    return null;
                }
            })();
        if (stored && strip(stored)) {
            var st = strip(stored);
            if (!(isStaticMcv && st === strip(w.location.origin))) {
                return st;
            }
        }

        var o = w.location.origin;
        if (o && o !== "null" && !/^file:/i.test(w.location.protocol || "")) {
            return strip(o);
        }

        try {
            return strip(w.localStorage.getItem(KEY) || w.sessionStorage.getItem(KEY) || "");
        } catch (e) {
            return "";
        }
    };
})(window);
