/**
 * MCV 3.1 — Búsqueda global (command palette)
 * Índice cliente desde APIs públicas existentes.
 */
(function (global) {
    "use strict";

    var index = null;
    var indexPromise = null;
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
            s.src = base() + "mcv-compete-core.js?v=" + (global.MCV_ASSET_V || "2026-06-20-v7");
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

    function buildIndexInner(C) {
        return Promise.all([C.fetchTournaments(), C.fetchTeamRoster()]).then(function (res) {
            var items = [];
            var tournaments = res[0] || [];
            var roster = (res[1] && res[1].members) || [];
            tournaments.forEach(function (t) {
                items.push({
                    type: "torneo",
                    label: t.title || t.slug,
                    sub: t.status || "",
                    href: base() + "tournament.html?slug=" + encodeURIComponent(t.slug)
                });
                if (t.status === "finished") {
                    items.push({
                        type: "resultado",
                        label: "Resultado — " + (t.title || t.slug),
                        sub: t.winner_display_name || t.winner_team_name || "",
                        href: base() + "results/?t=" + encodeURIComponent(t.slug)
                    });
                }
            });
            roster.forEach(function (m) {
                if (!m.steam_id64) return;
                items.push({
                    type: "jugador",
                    label: m.display_name || "Jugador",
                    sub: m.role_label || "MCV",
                    href: base() + "player/?steamId=" + encodeURIComponent(m.steam_id64)
                });
            });
            items.push(
                { type: "página", label: "Ranking", sub: "Standings", href: base() + "standings/" },
                { type: "página", label: "Calendario", sub: "Eventos", href: base() + "calendar/" },
                { type: "página", label: "Resultados", sub: "Hub histórico", href: base() + "results/" }
            );
            index = items;
            return items;
        });
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

    function renderResults(q) {
        if (!resultsEl) return;
        q = String(q || "")
            .trim()
            .toLowerCase();
        var list = (index || []).filter(function (it) {
            if (!q) return true;
            return (
                String(it.label || "")
                    .toLowerCase()
                    .indexOf(q) !== -1 ||
                String(it.sub || "")
                    .toLowerCase()
                    .indexOf(q) !== -1 ||
                String(it.type || "")
                    .toLowerCase()
                    .indexOf(q) !== -1
            );
        });
        activeIdx = list.length ? 0 : -1;
        if (!list.length) {
            resultsEl.innerHTML = '<p class="mcv-search-hint">Sin resultados.</p>';
            return;
        }
        resultsEl.innerHTML = list
            .slice(0, 12)
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
