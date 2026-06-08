/**
 * Vital Rust clan stats — vista pública (acceso por ?key= en URL).
 */
(function (global) {
    "use strict";

    var STORAGE_KEY = "mcv_vital_public_key_v1";
    var STATS_CACHE_KEY = "mcv_vital_stats_cache_v1";
    var WIPE_PREF_KEY = "mcv_vital_wipe_pref_v1";
    var sortKey = "killsT30";
    var sortDir = "desc";
    var clanRows = [];
    var configLoaded = false;
    var forceRefreshNext = false;
    var clientStatsCache = {};
    var loadSeq = 0;

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function fmtNum(n) {
        var x = Number(n);
        if (!Number.isFinite(x)) return "0";
        return x.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }

    function apiBase() {
        return typeof global.mcvResolveApiBase === "function"
            ? global.mcvResolveApiBase()
            : String(global.location.origin || "").replace(/\/$/, "");
    }

    function accessKey() {
        try {
            var fromUrl = new URLSearchParams(global.location.search).get("key");
            if (fromUrl && String(fromUrl).trim()) {
                var k = String(fromUrl).trim();
                global.sessionStorage.setItem(STORAGE_KEY, k);
                return k;
            }
        } catch (e) {}
        try {
            return global.sessionStorage.getItem(STORAGE_KEY) || "";
        } catch (e2) {
            return "";
        }
    }

    function accessKeyIssue(key) {
        var k = String(key || "").trim();
        if (!k) return "Falta la clave. Abrí el link completo que te pasó el staff (?key=…).";
        if (k.length < 12) {
            return "La clave es demasiado corta (mín. 12 caracteres). Pedí el link actualizado al staff; no uses claves de prueba tipo abc123.";
        }
        return "";
    }

    function formatApiError(x, fallback) {
        var d = (x && x.d) || {};
        var msg = d.error || d.message || fallback || "Error";
        if (d.hint) msg += " " + d.hint;
        return msg;
    }

    function vitalFetch(path, opts) {
        opts = opts || {};
        var key = accessKey();
        var sep = path.indexOf("?") >= 0 ? "&" : "?";
        var url = apiBase() + path + sep + "key=" + encodeURIComponent(key);
        return fetch(url, {
            method: opts.method || "GET",
            headers: opts.headers || {},
            cache: "no-store"
        }).then(function (r) {
            return r.json().then(function (d) {
                return { ok: r.ok, status: r.status, d: d };
            });
        });
    }

    function showGate(show) {
        var gate = document.getElementById("vital-rust-gate");
        var app = document.getElementById("vital-rust-app");
        if (gate) gate.hidden = !show;
        if (app) app.hidden = show;
    }

    function banner(msg, isErr) {
        var el = document.getElementById("vital-rust-banner");
        if (!el) return;
        el.textContent = msg || "";
        el.className = "vital-rust-banner" + (isErr ? " is-error" : " is-ok");
        el.hidden = !msg;
    }

    function formatCacheMeta(cache) {
        if (!cache) return "";
        var age = cache.lastFetchAgeSec;
        var ttl = cache.suggestRefreshAfterSec || cache.cacheTtlSec;
        if (age == null) {
            return "Aún no se consultó Vital en esta sesión.";
        }
        var line = "Última consulta a Vital: hace " + String(age) + " s";
        if (cache.servedFromCache) {
            line += " (desde caché del servidor)";
        }
        if (ttl && age >= ttl) {
            line += ". Conviene actualizar de nuevo.";
        } else if (ttl) {
            line += ". Caché del servidor ~" + String(ttl) + " s.";
        }
        line += " Cambiar wipe usa datos guardados; «Forzar Vital» consulta Vital de nuevo.";
        return line;
    }

    function loadPersistedStatsCache() {
        try {
            var raw = global.sessionStorage.getItem(STATS_CACHE_KEY);
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                clientStatsCache = parsed;
            }
        } catch (e) {
            clientStatsCache = {};
        }
    }

    function persistStatsCache() {
        try {
            global.sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify(clientStatsCache));
        } catch (e) {
            try {
                var keys = Object.keys(clientStatsCache);
                if (keys.length <= 1) return;
                keys.sort(function (a, b) {
                    return (clientStatsCache[a].savedAt || 0) - (clientStatsCache[b].savedAt || 0);
                });
                delete clientStatsCache[keys[0]];
                global.sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify(clientStatsCache));
            } catch (e2) {}
        }
    }

    function savedWipePref(serverKey) {
        try {
            var raw = global.sessionStorage.getItem(WIPE_PREF_KEY);
            if (!raw) return null;
            var map = JSON.parse(raw);
            return map && map[serverKey] ? String(map[serverKey]) : null;
        } catch (e) {
            return null;
        }
    }

    function saveWipePref(serverKey, wipeId) {
        if (!serverKey || !wipeId) return;
        try {
            var map = {};
            var raw = global.sessionStorage.getItem(WIPE_PREF_KEY);
            if (raw) {
                map = JSON.parse(raw) || {};
            }
            map[String(serverKey)] = String(wipeId);
            global.sessionStorage.setItem(WIPE_PREF_KEY, JSON.stringify(map));
        } catch (e) {}
    }

    function setCacheMeta(cache) {
        var el = document.getElementById("vital-cache-meta");
        if (!el) return;
        var text = formatCacheMeta(cache);
        el.textContent = text;
        el.hidden = !text;
    }

    function statsCacheKey() {
        var sel = document.getElementById("vital-server-select");
        var wipeSel = document.getElementById("vital-wipe-select");
        return String(sel && sel.value ? sel.value : "") + "|" + String(wipeSel && wipeSel.value ? wipeSel.value : "");
    }

    function applyClanPayload(data, sel) {
        var meta = document.getElementById("vital-roster-meta");
        if (meta) {
            meta.textContent =
                (data.players || []).length +
                " de " +
                (data.rosterSize || 0) +
                " jugadores con datos · " +
                ((data.server && data.server.label) || (sel && sel.value) || "");
        }
        renderCards(data.players || []);
        var nf = document.getElementById("vital-not-found");
        if (nf) {
            nf.textContent =
                data.notFound && data.notFound.length ? data.notFound.join(", ") : "Todos con datos en Vital.";
        }
        setCacheMeta(data.vitalCache);
    }

    function rememberClientCache(data) {
        var key = statsCacheKey();
        if (!key || key.endsWith("|")) return;
        clientStatsCache[key] = {
            players: data.players || [],
            rosterSize: data.rosterSize || 0,
            server: data.server || null,
            notFound: data.notFound || [],
            hint: data.hint || null,
            vitalCache: data.vitalCache || null,
            savedAt: Date.now()
        };
        persistStatsCache();
    }

    function paintClientCache(key) {
        var hit = clientStatsCache[key];
        if (!hit) return false;
        var sel = document.getElementById("vital-server-select");
        applyClanPayload(hit, sel);
        return true;
    }

    function statCard(label, value, highlight) {
        var cls = "vital-stat-card" + (highlight ? " vital-stat-card--hi" : "");
        return (
            '<div class="' + cls + '"><span class="vital-stat-label">' + esc(label) + "</span>" +
            '<strong class="vital-stat-value">' + esc(String(value)) + "</strong></div>"
        );
    }

    function sortValue(p, key) {
        if (key === "name") {
            return String(p.name || p.steamId64 || "").toLowerCase();
        }
        var n = Number(p[key]);
        return Number.isFinite(n) ? n : 0;
    }

    function sortPlayers(rows) {
        var key = sortKey;
        var asc = sortDir === "asc";
        return (rows || []).slice().sort(function (a, b) {
            if (key === "name") {
                var c = String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
                return asc ? c : -c;
            }
            var va = sortValue(a, key);
            var vb = sortValue(b, key);
            if (va !== vb) return asc ? va - vb : vb - va;
            return String(a.name || "").localeCompare(String(b.name || ""));
        });
    }

    function renderCards(players) {
        var box = document.getElementById("vital-clan-players");
        var sortBar = document.getElementById("vital-sort-bar");
        if (!box) return;
        clanRows = players || [];
        if (!clanRows.length) {
            if (sortBar) sortBar.hidden = true;
            box.innerHTML = '<p class="empty-hint">Sin datos para este servidor/wipe.</p>';
            return;
        }
        if (sortBar) sortBar.hidden = false;
        var keySel = document.getElementById("vital-sort-key");
        var dirSel = document.getElementById("vital-sort-dir");
        if (keySel) keySel.value = sortKey;
        if (dirSel) dirSel.value = sortDir;
        var sorted = sortPlayers(clanRows);
        var hi = sortKey;
        var html = "";
        sorted.forEach(function (p, idx) {
            var vitalUrl = "https://vitalrust.com/statistics/player-overview?userId=" + encodeURIComponent(p.steamId64);
            html += '<article class="vital-player-card">';
            html += '<header class="vital-player-head">';
            html += '<span class="vital-player-rank">#' + String(idx + 1) + "</span>";
            if (p.avatar) {
                html += '<img class="vital-player-avatar" src="' + esc(p.avatar) + '" alt="" width="48" height="48" loading="lazy" referrerpolicy="no-referrer">';
            }
            html += '<div class="vital-player-ident">';
            html += '<h4 class="vital-player-name">' + esc(p.name || "—");
            if (p.rosterSource === "manual") {
                html += ' <span class="vital-player-badge">Extra</span>';
            }
            html += "</h4>";
            if (p.rosterNote) {
                html += '<span class="vital-player-note">' + esc(p.rosterNote) + "</span>";
            }
            html += '<a class="vital-player-steam" href="' + esc(vitalUrl) + '" target="_blank" rel="noopener">' + esc(p.steamId64) + "</a>";
            html += "</div></header>";
            html += '<div class="vital-player-body">';
            html += '<section class="vital-stat-group vital-stat-group--combat"><h5 class="vital-stat-group-title">Combate</h5><div class="vital-stat-group-grid">';
            html += statCard("K/D", p.kdr, hi === "kdr");
            html += statCard("Kills", fmtNum(p.kills), hi === "kills");
            html += statCard("Deaths", fmtNum(p.deaths), hi === "deaths");
            html += statCard("Kill T3", fmtNum(p.killsT30), hi === "killsT30");
            html += statCard("Rockets", fmtNum(p.rocketsFired), hi === "rocketsFired");
            html += "</div></section>";
            html += '<section class="vital-stat-group vital-stat-group--farm"><h5 class="vital-stat-group-title">Farming</h5><div class="vital-stat-group-grid">';
            html += statCard("Azufre", fmtNum(p.farmSulfur), hi === "farmSulfur");
            html += statCard("Metal", fmtNum(p.farmMetal), hi === "farmMetal");
            html += statCard("HQ", fmtNum(p.farmHqMetal), hi === "farmHqMetal");
            html += statCard("Madera", fmtNum(p.farmWood), hi === "farmWood");
            html += "</div></section>";
            html += '<section class="vital-stat-group"><h5 class="vital-stat-group-title">Scrap</h5><div class="vital-stat-group-grid">';
            html += statCard("Loteado", fmtNum(p.scrapLooted), hi === "scrapLooted");
            html += statCard("Reciclado", fmtNum(p.scrapRecycled), hi === "scrapRecycled");
            html += "</div></section>";
            html += '<section class="vital-stat-group vital-stat-group--build"><h5 class="vital-stat-group-title">Building</h5><div class="vital-stat-group-grid">';
            html += statCard("Bloques", fmtNum(p.building), hi === "building");
            html += "</div></section>";
            html += '<section class="vital-stat-group vital-stat-group--deploy"><h5 class="vital-stat-group-title">Base</h5><div class="vital-stat-group-grid">';
            html += statCard("Torretas", fmtNum(p.deployableAutoturrets), hi === "deployableAutoturrets");
            html += statCard("Huerto", fmtNum(p.deployablePlantation), hi === "deployablePlantation");
            html += statCard("Colocación", fmtNum(p.deployableCraftPlace), hi === "deployableCraftPlace");
            html += "</div></section></div></article>";
        });
        box.innerHTML = html;
    }

    function loadWipes() {
        var sel = document.getElementById("vital-server-select");
        var wipeSel = document.getElementById("vital-wipe-select");
        if (!sel || !wipeSel) return Promise.resolve();
        return vitalFetch("/api/public/vital/wipes?server=" + encodeURIComponent(sel.value)).then(function (x) {
            if (!x.ok) throw new Error((x.d && x.d.error) ? x.d.error : "wipes");
            var html = '<option value="null">Total</option>';
            (x.d.wipes || []).forEach(function (w) {
                html += '<option value="' + esc(w.id) + '">' + esc(w.label) + (w.current ? " ★" : "") + "</option>";
            });
            wipeSel.innerHTML = html;
            var pref = savedWipePref(sel.value);
            if (pref && wipeSel.querySelector('option[value="' + pref.replace(/"/g, "") + '"]')) {
                wipeSel.value = pref;
            } else {
                var current = (x.d.wipes || []).find(function (w) {
                    return w.current;
                });
                if (current) wipeSel.value = current.id;
            }
        });
    }

    function loadConfig() {
        return vitalFetch("/api/public/vital/config").then(function (x) {
            if (x.status === 401) {
                try {
                    global.sessionStorage.removeItem(STORAGE_KEY);
                } catch (e) {}
                showGate(true);
                throw new Error("Clave incorrecta. Pedí el link actualizado al staff.");
            }
            if (!x.ok) throw new Error(formatApiError(x, "config"));
            showGate(false);
            var sel = document.getElementById("vital-server-select");
            var disclaimer = document.getElementById("vital-config-banner");
            if (sel) {
                sel.innerHTML = (x.d.servers || []).map(function (s) {
                    return '<option value="' + esc(s.key) + '">' + esc(s.label) + "</option>";
                }).join("");
                var defKey = x.d.defaultServerKey || "eu-monthly";
                if (defKey && sel.querySelector('option[value="' + defKey.replace(/"/g, "") + '"]')) {
                    sel.value = defKey;
                }
                sel.onchange = function () {
                    loadWipes()
                        .then(function () {
                            return loadClanStats({ forceRefresh: false });
                        })
                        .catch(function () {});
                };
            }
            if (disclaimer && x.d.disclaimer) {
                disclaimer.textContent = x.d.disclaimer;
                disclaimer.hidden = false;
            }
            configLoaded = true;
            return loadWipes();
        });
    }

    function loadClanStats(opts) {
        opts = opts || {};
        var sel = document.getElementById("vital-server-select");
        var wipeSel = document.getElementById("vital-wipe-select");
        var box = document.getElementById("vital-clan-players");
        if (!sel || !wipeSel || !box) return Promise.resolve();
        var wipeId = wipeSel.value;
        if (!wipeId) {
            banner("Elegí un wipe.", true);
            return Promise.resolve();
        }
        var refresh = !!(opts.forceRefresh || forceRefreshNext);
        forceRefreshNext = false;
        var cacheKey = statsCacheKey();
        var seq = ++loadSeq;

        saveWipePref(sel.value, wipeId);

        if (!refresh && paintClientCache(cacheKey)) {
            banner(
                "Datos guardados de este wipe (sin consultar Vital). Usá «Forzar Vital» para actualizar.",
                false
            );
            return Promise.resolve();
        }

        box.innerHTML = '<p class="empty-hint">Cargando estadísticas…</p>';
        banner(refresh ? "Consultando Vital Rust (forzado)…" : "Cargando stats…", false);

        var q =
            "?server=" +
            encodeURIComponent(sel.value) +
            "&wipeId=" +
            encodeURIComponent(wipeId) +
            "&refresh=" +
            (refresh ? "1" : "0") +
            "&_=" +
            Date.now();
        return vitalFetch("/api/public/vital/clan" + q).then(function (x) {
            if (seq !== loadSeq) return;
            if (x.status === 401) {
                showGate(true);
                throw new Error("Clave inválida");
            }
            if (!x.ok) {
                var errMsg = formatApiError(x, "Error al cargar stats");
                if (x.d && x.d.hint) errMsg += " " + x.d.hint;
                throw new Error(errMsg);
            }
            rememberClientCache(x.d);
            applyClanPayload(x.d, sel);
            if (x.d.hint && !(x.d.players || []).length) {
                banner(x.d.hint, true);
            } else if (refresh) {
                banner("Datos actualizados desde Vital.", false);
            } else {
                banner("Datos cargados y guardados para este wipe.", false);
            }
        }).catch(function (e) {
            if (seq !== loadSeq) return;
            if (paintClientCache(cacheKey)) {
                banner(
                    ((e && e.message) ? e.message : "Error al cargar") +
                        " — se muestra la última versión guardada de este wipe.",
                    true
                );
                return;
            }
            renderCards([]);
            box.innerHTML =
                '<p class="empty-hint">' + esc((e && e.message) ? e.message : "Error al cargar") + "</p>";
            banner((e && e.message) ? e.message : "Error", true);
        });
    }

    function applySort() {
        var keySel = document.getElementById("vital-sort-key");
        var dirSel = document.getElementById("vital-sort-dir");
        if (keySel) sortKey = keySel.value || "killsT30";
        if (dirSel) sortDir = dirSel.value || "desc";
        if (clanRows.length) renderCards(clanRows);
    }

    function exportCsv() {
        if (!clanRows.length) return;
        var h = [
            "name", "steamId64", "kdr", "kills", "deaths", "killsT30", "rocketsFired",
            "farmSulfur", "farmMetal", "farmHqMetal", "farmWood", "scrapLooted", "scrapRecycled",
            "building", "deployableAutoturrets", "deployablePlantation", "deployableCraftPlace"
        ];
        var rows = sortPlayers(clanRows).map(function (p) {
            return h.map(function (k) {
                return '"' + String(p[k] != null ? p[k] : "").replace(/"/g, '""') + '"';
            }).join(",");
        });
        var blob = new Blob([[h.join(","), rows.join("\n")].join("\n")], { type: "text/csv" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "mcv-vital-clan.csv";
        a.click();
    }

    function tryUnlock(fromInput) {
        var key = String(fromInput || accessKey()).trim();
        var keyErr = accessKeyIssue(key);
        if (keyErr) {
            banner(keyErr, true);
            showGate(true);
            return Promise.resolve();
        }
        try {
            global.sessionStorage.setItem(STORAGE_KEY, key);
        } catch (e) {}
        if (fromInput) {
            var u = new URL(global.location.href);
            u.searchParams.set("key", key);
            global.history.replaceState({}, "", u.pathname + u.search);
        }
        return loadConfig().then(function () {
            return loadClanStats({ forceRefresh: false });
        }).catch(function (e) {
            banner((e && e.message) ? e.message : "No se pudo acceder", true);
        });
    }

    function init() {
        loadPersistedStatsCache();
        var gateForm = document.getElementById("vital-rust-gate-form");
        var btnRefresh = document.getElementById("btn-vital-refresh");
        var btnExport = document.getElementById("btn-vital-export");
        var keySel = document.getElementById("vital-sort-key");
        var dirSel = document.getElementById("vital-sort-dir");

        if (gateForm) {
            gateForm.addEventListener("submit", function (ev) {
                ev.preventDefault();
                var input = document.getElementById("vital-rust-key-input");
                tryUnlock(input ? input.value : "");
            });
        }
        if (btnRefresh) {
            btnRefresh.addEventListener("click", function () {
                forceRefreshNext = true;
                if (!configLoaded) {
                    loadConfig().then(function () {
                        return loadClanStats({ forceRefresh: true });
                    }).catch(function () {});
                } else {
                    loadClanStats({ forceRefresh: true });
                }
            });
        }
        if (btnExport) btnExport.addEventListener("click", exportCsv);
        if (keySel) keySel.addEventListener("change", applySort);
        if (dirSel) dirSel.addEventListener("change", applySort);
        var wipeSel = document.getElementById("vital-wipe-select");
        if (wipeSel) {
            wipeSel.addEventListener("change", function () {
                loadClanStats({ forceRefresh: false }).catch(function () {});
            });
        }

        vitalFetch("/api/public/vital/status").then(function (x) {
            if (x.ok && x.d && !x.d.enabled) {
                var hint = document.getElementById("vital-rust-gate-hint");
                if (hint) {
                    hint.textContent = x.d.hint || "El acceso por link aún no está activo en el servidor (falta VITAL_PUBLIC_ACCESS_KEY en Render).";
                }
            }
        }).catch(function () {});

        if (accessKey()) {
            tryUnlock().catch(function () {
                showGate(true);
            });
        } else {
            showGate(true);
        }
    }

    global.McvVitalRust = { init: init, accessKey: accessKey };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(typeof window !== "undefined" ? window : globalThis);
