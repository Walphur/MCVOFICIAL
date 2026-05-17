/**
 * Base URL del backend (Express + API).
 *
 * Orden de prioridad:
 * 1) ?api=https://tu-render.onrender.com en la URL (se guarda en localStorage)
 * 2) <meta name="mcv-api" content="https://...">
 * 3) window.MCV_API_BASE (mcv-local-api.js, etc.)
 * 4) En mcvoficial.com (y www): por defecto mismo origen (https://mcvoficial.com/…) — así funciona con dominio custom en Render.
 *    localStorage solo si apunta a *.onrender.com válido (p. ej. preview). Si el HTML es solo estático en otro CDN con este dominio, poné meta mcv-api o ?api= al backend.
 * 5) Otros hosts: localStorage mcv_api_base (si no es el mismo origen que la página)
 * 6) window.location.origin (mismo host que el Node)
 */
(function (w) {
    var KEY = "mcv_api_base";

    /** Hostname antiguo en docs; en Render no hay servicio en esa URL. */
    function isWrongRenderApiHost(hostname) {
        return String(hostname || "").toLowerCase() === "mcv-oficial.onrender.com";
    }

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
            if (isWrongRenderApiHost(new URL(strip(origin)).hostname)) return;
        } catch (e0) {
            /* ignore */
        }
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

        /* mcvoficial.com: mismo host que el Web Service en Render (custom domain) → API en el mismo origen. */
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
                    if (h2.endsWith(".onrender.com") && !isWrongRenderApiHost(h2)) {
                        return st2;
                    }
                } catch (e3) {
                    /* ignore */
                }
            }
            var oStatic = strip(w.location.origin || "");
            if (oStatic && !/^file:/i.test(w.location.protocol || "")) {
                return oStatic;
            }
            return "https://mcvoficial.onrender.com";
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
            var badStored = false;
            try {
                badStored = isWrongRenderApiHost(new URL(st).hostname);
            } catch (eBad) {
                badStored = false;
            }
            if (!badStored && !(isStaticMcv && st === strip(w.location.origin))) {
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
