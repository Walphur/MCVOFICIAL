/**
 * Base URL del backend (Express + API).
 *
 * Orden de prioridad:
 * 1) ?api=https://tu-render.onrender.com en la URL (se guarda en localStorage)
 * 2) localStorage / sessionStorage "mcv_api_base"
 * 3) <meta name="mcv-api" content="https://..."> en el HTML (útil si el dominio público es solo estático)
 * 4) window.MCV_API_BASE (podés setearlo con mcv-local-api.js; ver mcv-local-api.example.js)
 * 5) mcvoficial.com (solo estático) → https://mcv-oficial.onrender.com (debe coincidir con el nombre del Web Service en Render)
 * 6) window.location.origin (Node sirve el mismo sitio)
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

        /* Sitio estático en mcvoficial.com: la API vive en Render (renombrá la URL si cambiaste el servicio). */
        if (isStaticMcv) {
            return "https://mcv-oficial.onrender.com";
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
