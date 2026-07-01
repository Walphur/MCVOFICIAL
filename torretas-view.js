/**
 * Lista de jugadores para torreteros — acceso con Steam autorizado.
 */
(function (global) {
    "use strict";

    var rosterRows = [];

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function apiBase() {
        return typeof global.mcvResolveApiBase === "function"
            ? global.mcvResolveApiBase()
            : String(global.location.origin || "").replace(/\/$/, "");
    }

    function userAuthHeaders() {
        if (typeof global.mcvUserAuthHeaders === "function") {
            return global.mcvUserAuthHeaders();
        }
        return { "Content-Type": "application/json" };
    }

    function hasUserSession() {
        return typeof global.mcvUserToken === "function" && !!global.mcvUserToken();
    }

    function turretFetch(path) {
        return fetch(apiBase() + path, {
            method: "GET",
            headers: userAuthHeaders(),
            cache: "no-store"
        }).then(function (r) {
            return r.json().then(function (d) {
                return { ok: r.ok, status: r.status, d: d };
            });
        });
    }

    function setGateHint(msg, isErr) {
        var hint = document.getElementById("torretas-gate-hint");
        var denied = document.getElementById("torretas-gate-denied");
        if (hint && !isErr && msg) {
            hint.textContent = msg;
        }
        if (denied) {
            denied.hidden = !isErr;
            if (isErr && msg) denied.textContent = msg;
        }
    }

    function bindSteamLogin() {
        if (typeof global.mcvBindPublicOAuthButtons !== "function") return;
        global.mcvBindPublicOAuthButtons({
            api: apiBase(),
            next: "torretas",
            steamEl: "torretas-steam",
            steamEnabled: true,
            googleEnabled: false
        });
    }

    function showGate(show) {
        var gate = document.getElementById("torretas-gate");
        var app = document.getElementById("torretas-app");
        if (gate) gate.hidden = !show;
        if (app) app.hidden = show;
    }

    function setBanner(msg, isErr) {
        var el = document.getElementById("torretas-banner");
        if (!el) return;
        if (!msg) {
            el.hidden = true;
            el.textContent = "";
            return;
        }
        el.hidden = false;
        el.textContent = msg;
        el.className = "torretas-banner" + (isErr ? " is-error" : " is-ok");
    }

    function wipeBadge(row) {
        if (row.playsWipe) {
            return '<span class="torretas-badge torretas-badge--yes">Juega wipe</span>';
        }
        var label = esc(row.wipePhaseLabel || "No juega");
        return '<span class="torretas-badge torretas-badge--no">' + label + "</span>";
    }

    function filteredRows() {
        var q = String(document.getElementById("torretas-search")?.value || "")
            .trim()
            .toLowerCase();
        var mode = String(document.getElementById("torretas-filter")?.value || "playing");
        return rosterRows.filter(function (row) {
            if (mode === "playing" && !row.playsWipe) return false;
            if (mode === "not-playing" && row.playsWipe) return false;
            if (!q) return true;
            var hay = (row.displayName + " " + row.steamId64).toLowerCase();
            return hay.indexOf(q) !== -1;
        });
    }

    function renderTable() {
        var tbody = document.getElementById("torretas-tbody");
        if (!tbody) return;
        var rows = filteredRows();
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-hint">Sin jugadores para este filtro.</td></tr>';
            return;
        }
        tbody.innerHTML = rows
            .map(function (row) {
                return (
                    "<tr>" +
                    "<td><strong>" +
                    esc(row.displayName) +
                    "</strong></td>" +
                    '<td><code class="torretas-steam">' +
                    esc(row.steamId64) +
                    "</code></td>" +
                    "<td>" +
                    wipeBadge(row) +
                    "</td>" +
                    '<td><button type="button" class="btn-outline btn-sm torretas-copy-one" data-steam="' +
                    esc(row.steamId64) +
                    '">Copiar</button></td>' +
                    "</tr>"
                );
            })
            .join("");
        tbody.querySelectorAll(".torretas-copy-one").forEach(function (btn) {
            btn.addEventListener("click", function () {
                copyText(btn.getAttribute("data-steam") || "");
            });
        });
    }

    function copyText(text) {
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                setBanner("Copiado al portapapeles.", false);
            }).catch(function () {
                setBanner("No se pudo copiar.", true);
            });
            return;
        }
        setBanner(text, false);
    }

    function copyPlayingSteamIds() {
        var ids = rosterRows.filter(function (r) { return r.playsWipe; }).map(function (r) { return r.steamId64; });
        if (!ids.length) {
            setBanner("No hay jugadores que jueguen el wipe.", true);
            return;
        }
        copyText(ids.join("\n"));
    }

    function exportCsv() {
        var rows = filteredRows();
        if (!rows.length) {
            setBanner("Nada para exportar.", true);
            return;
        }
        var lines = ["nombre,steam_id64,juega_wipe,fase_wipe"];
        rows.forEach(function (r) {
            lines.push([
                '"' + String(r.displayName || "").replace(/"/g, '""') + '"',
                r.steamId64,
                r.playsWipe ? "si" : "no",
                r.wipePhaseLabel || r.wipePhase || ""
            ].join(","));
        });
        var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "mcv-torretas-roster.csv";
        a.click();
        URL.revokeObjectURL(url);
        setBanner("CSV descargado.", false);
    }

    function updateMeta(data) {
        var el = document.getElementById("torretas-meta");
        if (!el || !data) return;
        el.textContent =
            (data.total || 0) +
            " jugadores · " +
            (data.playingWipeCount || 0) +
            " juegan el wipe · " +
            (data.notPlayingCount || 0) +
            " no juegan";
    }

    function loadRoster() {
        return turretFetch("/api/auth/user/turret/roster").then(function (x) {
            if (!x.ok) {
                throw new Error((x.d && x.d.error) ? x.d.error : "Error al cargar roster");
            }
            rosterRows = Array.isArray(x.d.players) ? x.d.players : [];
            updateMeta(x.d);
            renderTable();
        });
    }

    function checkAccess() {
        if (typeof global.mcvCaptureUserTokenFromUrl === "function") {
            global.mcvCaptureUserTokenFromUrl();
        }
        bindSteamLogin();
        if (!hasUserSession()) {
            showGate(true);
            setGateHint("Entrá con Steam. Tu SteamID64 tiene que estar cargado por el staff como torretero.", false);
            return Promise.resolve();
        }
        return turretFetch("/api/auth/user/turret/access").then(function (x) {
            if (!x.ok && x.status >= 500) {
                setGateHint((x.d && x.d.error) ? x.d.error : "Error de servidor", true);
                showGate(true);
                return;
            }
            var d = x.d || {};
            if (!d.allowed) {
                showGate(true);
                setGateHint(d.hint || d.error || "Acceso denegado", true);
                return;
            }
            showGate(false);
            setGateHint("", false);
            return loadRoster();
        });
    }

    function bindUi() {
        var search = document.getElementById("torretas-search");
        var filter = document.getElementById("torretas-filter");
        if (search) search.addEventListener("input", renderTable);
        if (filter) filter.addEventListener("change", renderTable);

        var copyBtn = document.getElementById("torretas-copy-playing");
        if (copyBtn) copyBtn.addEventListener("click", copyPlayingSteamIds);

        var exportBtn = document.getElementById("torretas-export");
        if (exportBtn) exportBtn.addEventListener("click", exportCsv);

        var logoutBtn = document.getElementById("torretas-logout");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", function () {
                if (typeof global.mcvUserLogout === "function") {
                    global.mcvUserLogout();
                }
                rosterRows = [];
                showGate(true);
                setGateHint("Sesión cerrada.", false);
            });
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        bindUi();
        checkAccess().catch(function (e) {
            showGate(true);
            setGateHint((e && e.message) ? e.message : "Error al iniciar", true);
        });
    });
})(window);
