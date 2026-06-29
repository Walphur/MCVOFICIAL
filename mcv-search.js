/**
 * MCV 3.1 — Búsqueda global (command palette)
 * Índice cliente desde APIs públicas existentes.
 */
(function (global) {
    "use strict";

    var index = null;
    var indexPromise = null;
    var searchTimer = null;
    var overlay = null;
    var input = null;
    var resultsEl = null;
    var activeIdx = -1;

    function base() {
        var p = String(location.pathname || "/").replace(/\\/g, "/");
        if (/\/(player|results|standings|calendar|equipo)(\/|$)/i.test(p)) return "../";
        if (p.indexOf("/equipo/solicitud/") !== -1) return "../../";
        if (p.indexOf("/equipo/") !== -1) return "../";
        return "";
    }

    function esc(s) {
        if (typeof global.mcvEsc === "function") return global.mcvEsc(s);
        return String(s == null ? "" : s);
    }

    function buildIndex() {
        if (indexPromise) return indexPromise;
        var C = global.mcvCompeteCore;
        if (!C) {
            var s = document.createElement("script");
            s.src = base() + "mcv-compete-core.js?v=" + (global.MCV_ASSET_V || "2026-06-20-v9");
            document.head.appendChild(s);
            indexPromise = new Promise(function (resolve) {
                s.onload = function () {
                    indexPromise = buildIndexInner(global.mcvCompeteCore);
                    indexPromise.then(resolve);
                };
            });
            return indexPromise;
        }
        indexPromise = buildIndexInner(C);
        return indexPromise;
    }

    function defaultNavItems() {
        return [
            { type: "página", label: "Ranking", sub: "Standings", href: base() + "standings/" },
            { type: "página", label: "Calendario", sub: "Eventos", href: base() + "calendar/" },
            { type: "página", label: "Resultados", sub: "Hub histórico", href: base() + "results/" },
            { type: "clan", label: "MCV Oficial", sub: "Home", href: base() || "./" }
        ];
    }

    function buildIndexInner(C) {
        index = defaultNavItems();
        return Promise.resolve(index);
    }

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement("div");
        overlay.className = "mcv-search-overlay";
        overlay.id = "mcv-search-overlay";
        overlay.innerHTML =
            '<div class="mcv-search-panel" role="dialog" aria-label="Búsqueda global">' +
            '<div class="mcv-search-input-row">' +
            '<i data-lucide="search"></i>' +
            '<input type="search" class="mcv-search-input" id="mcv-search-input" placeholder="Buscar jugadores, equipos, torneos…" autocomplete="off">' +
            '<kbd class="mcv-search-hint">Esc</kbd></div>' +
            '<div class="mcv-search-results" id="mcv-search-results"></div>' +
            '<p class="mcv-search-hint">↑↓ navegar · Enter abrir · ⌘K / Ctrl+K</p></div>';
        document.body.appendChild(overlay);
        input = overlay.querySelector("#mcv-search-input");
        resultsEl = overlay.querySelector("#mcv-search-results");
        overlay.addEventListener("click", function (e) {
            if (e.target === overlay) close();
        });
        input.addEventListener("input", function () {
            renderResults(input.value);
        });
        input.addEventListener("keydown", function (e) {
            if (e.key === "Escape") close();
            if (e.key === "ArrowDown") {
                e.preventDefault();
                moveActive(1);
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                moveActive(-1);
            }
            if (e.key === "Enter") {
                var active = resultsEl && resultsEl.querySelector(".mcv-search-result.is-active");
                if (active) {
                    location.href = active.getAttribute("href");
                    close();
                }
            }
        });
        return overlay;
    }

    function moveActive(delta) {
        var nodes = resultsEl ? resultsEl.querySelectorAll(".mcv-search-result") : [];
        if (!nodes.length) return;
        activeIdx = Math.max(0, Math.min(nodes.length - 1, activeIdx + delta));
        nodes.forEach(function (n, i) {
            n.classList.toggle("is-active", i === activeIdx);
        });
    }

    function resolveHref(href) {
        href = String(href || "#");
        if (/^https?:\/\//i.test(href)) return href;
        if (href.charAt(0) === "/") return base() + href.replace(/^\//, "");
        return href;
    }

    function renderResults(q) {
        if (!resultsEl) return;
        q = String(q || "").trim();
        var C = global.mcvCompeteCore;

        if (q.length < 2) {
            activeIdx = index && index.length ? 0 : -1;
            var defaults = index || defaultNavItems();
            if (!defaults.length) {
                resultsEl.innerHTML = '<p class="mcv-search-hint">Escribí al menos 2 caracteres…</p>';
                return;
            }
            resultsEl.innerHTML = defaults
                .slice(0, 8)
                .map(function (it, i) {
                    return (
                        '<a class="mcv-search-result' +
                        (i === 0 ? " is-active" : "") +
                        '" href="' +
                        esc(it.href) +
                        '"><span><strong>' +
                        esc(it.label) +
                        '</strong><br><span class="mcv-search-result__type">' +
                        esc(it.type) +
                        (it.sub ? " · " + esc(it.sub) : "") +
                        "</span></span><i data-lucide=\"arrow-right\"></i></a>"
                    );
                })
                .join("");
            if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
            return;
        }

        if (!C || !C.fetchPublicSearch) {
            resultsEl.innerHTML = '<p class="mcv-search-hint">Buscador no disponible.</p>';
            return;
        }

        clearTimeout(searchTimer);
        resultsEl.innerHTML = '<p class="mcv-search-hint">Buscando…</p>';
        searchTimer = setTimeout(function () {
            C.fetchPublicSearch(q, 12).then(function (data) {
                var list = (data && data.results) || [];
                activeIdx = list.length ? 0 : -1;
                if (!list.length) {
                    resultsEl.innerHTML = '<p class="mcv-search-hint">Sin resultados.</p>';
                    return;
                }
                resultsEl.innerHTML = list
                    .map(function (it, i) {
                        return (
                            '<a class="mcv-search-result' +
                            (i === 0 ? " is-active" : "") +
                            '" href="' +
                            esc(resolveHref(it.href)) +
                            '"><span><strong>' +
                            esc(it.label) +
                            '</strong><br><span class="mcv-search-result__type">' +
                            esc(it.type) +
                            (it.sub ? " · " + esc(it.sub) : "") +
                            "</span></span><i data-lucide=\"arrow-right\"></i></a>"
                        );
                    })
                    .join("");
                if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
            });
        }, 200);
    }

    function open() {
        ensureOverlay();
        buildIndex().then(function () {
            overlay.classList.add("is-open");
            input.value = "";
            renderResults("");
            input.focus();
            if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
        });
    }

    function close() {
        if (overlay) overlay.classList.remove("is-open");
    }

    function init() {
        var btn = document.getElementById("mcv-global-search-btn");
        if (btn) {
            btn.addEventListener("click", open);
        }
        document.addEventListener("keydown", function (e) {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                open();
            }
        });
    }

    global.mcvGlobalSearch = { open: open, close: close, init: init };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(window);
