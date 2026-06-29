/**
 * MCV 3.1 — capa de datos competitivos (cliente).
 * Agrega APIs públicas existentes sin modificar backend.
 */
(function (global) {
    "use strict";

    function apiBase() {
        return typeof global.mcvResolveApiBase === "function"
            ? global.mcvResolveApiBase()
            : String(global.location.origin || "").replace(/\/$/, "");
    }

    function esc(s) {
        if (typeof global.mcvEsc === "function") return global.mcvEsc(s);
        if (s == null) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function isSteamId64(s) {
        return /^7656119\d{10}$/.test(String(s || "").trim());
    }

    function resolveSteamIdFromLocation() {
        var qs = new URLSearchParams(global.location.search || "");
        var fromQs = qs.get("steamId") || qs.get("id") || qs.get("steam");
        if (isSteamId64(fromQs)) return fromQs.trim();
        var path = String(global.location.pathname || "").replace(/\\/g, "/").replace(/\/$/, "");
        var parts = path.split("/").filter(Boolean);
        for (var i = parts.length - 1; i >= 0; i--) {
            if (isSteamId64(parts[i])) return parts[i];
        }
        return null;
    }

    function fetchJson(url, opts) {
        opts = opts || {};
        return fetch(url, opts).then(function (r) {
            return r.json().then(function (d) {
                return { ok: r.ok, status: r.status, data: d };
            });
        });
    }

    function fetchTeamRoster() {
        return fetchJson(apiBase() + "/api/team-roster", { cache: "no-store" }).then(function (x) {
            if (!x.ok) return { members: [] };
            return { members: (x.data && x.data.members) || [] };
        });
    }

    function fetchTournaments() {
        return fetchJson(apiBase() + "/api/tournaments", { cache: "no-store" }).then(function (x) {
            if (!x.ok) return [];
            return (x.data && x.data.tournaments) || [];
        });
    }

    function fetchTournamentDetail(slug) {
        return fetchJson(apiBase() + "/api/tournaments/" + encodeURIComponent(slug), { cache: "no-store" }).then(
            function (x) {
                if (!x.ok) return null;
                return (x.data && x.data.tournament) || null;
            }
        );
    }

    function fetchTournamentBracket(slug) {
        return fetchJson(apiBase() + "/api/tournaments/" + encodeURIComponent(slug) + "/bracket", {
            cache: "no-store"
        }).then(function (x) {
            if (!x.ok) return null;
            return x.data || null;
        });
    }

    function fetchPlayerScout(steamId) {
        return fetchJson(apiBase() + "/escaner-rapido", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ link: String(steamId) })
        }).then(function (x) {
            if (!x.ok || !x.data || !x.data.success) return null;
            return x.data.jugador || null;
        });
    }

    function fetchWipeList() {
        return fetchJson(apiBase() + "/api/wipe-list", { cache: "no-store" }).then(function (x) {
            if (!x.ok) return [];
            return (x.data && x.data.members) || [];
        });
    }

    function findRosterMember(steamId, members) {
        var sid = String(steamId || "");
        for (var i = 0; i < (members || []).length; i++) {
            if (String(members[i].steam_id64 || "") === sid) return members[i];
        }
        return null;
    }

    function parseRosterJson(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === "string") {
            try {
                var p = JSON.parse(raw);
                return Array.isArray(p) ? p : [];
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    function rosterHasSteam(roster, steamId) {
        var sid = String(steamId || "");
        var list = parseRosterJson(roster);
        for (var i = 0; i < list.length; i++) {
            var p = list[i] || {};
            var s = String(p.steamId64 || p.steam_id64 || p.steam || "").replace(/\D/g, "");
            if (s === sid) return true;
        }
        return false;
    }

    function fmtDate(iso) {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            });
        } catch (e) {
            return "—";
        }
    }

    function fmtNum(n) {
        var x = Number(n);
        if (!Number.isFinite(x)) return "—";
        return x.toLocaleString(undefined, { maximumFractionDigits: 1 });
    }

    function fmtDateTime(iso) {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleString("es-AR", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit"
            });
        } catch (e) {
            return fmtDate(iso);
        }
    }

    function hoursUntil(iso) {
        if (!iso) return null;
        try {
            var ms = new Date(iso).getTime() - Date.now();
            if (ms <= 0) return null;
            return Math.max(1, Math.ceil(ms / 3600000));
        } catch (e) {
            return null;
        }
    }

    function fetchForSite() {
        return fetchJson(apiBase() + "/api/tournaments/for-site", { cache: "no-store" }).then(function (x) {
            if (!x.ok) return { mode: "empty", tournament: null };
            return x.data || { mode: "empty", tournament: null };
        });
    }

    function fetchTournamentStats() {
        return fetchJson(apiBase() + "/api/tournaments/stats", { cache: "no-store" }).then(function (x) {
            if (!x.ok) return null;
            return x.data;
        });
    }

    function fetchDiscordCounts(inviteCode) {
        inviteCode = inviteCode || "mBRrUA8wH6";
        return fetch("https://discord.com/api/v9/invites/" + inviteCode + "?with_counts=true")
            .then(function (r) {
                return r.json();
            })
            .catch(function () {
                return null;
            });
    }

    function checkStreamLive() {
        return fetchPublicPulse().then(function (p) {
            if (p && p.stream) return p.stream;
            return { kick: false, twitch: false, any: false };
        });
    }

    function fetchPublicEnvelope(path, query) {
        var url = apiBase() + "/api/public/v1" + path;
        if (query) {
            var qs = new URLSearchParams(query);
            url += "?" + qs.toString();
        }
        return fetchJson(url, { cache: "default" }).then(function (x) {
            if (!x.ok || !x.data || x.data.status !== "ok") {
                return { ok: false, status: x.status, data: null, pagination: null };
            }
            return {
                ok: true,
                status: x.status,
                data: x.data.data,
                pagination: x.data.pagination || null,
                metadata: x.data.metadata || null
            };
        });
    }

    function fetchPublicHome() {
        return fetchPublicEnvelope("/home").then(function (x) {
            return x.ok ? x.data : null;
        });
    }

    function fetchPublicPulse() {
        return fetchPublicEnvelope("/pulse").then(function (x) {
            return x.ok ? x.data : null;
        });
    }

    function fetchPublicPlayer(steamId) {
        return fetchPublicEnvelope("/player/" + encodeURIComponent(steamId)).then(function (x) {
            return x.ok ? x.data : null;
        });
    }

    function fetchPublicStandings(opts) {
        opts = opts || {};
        var q = {};
        if (opts.season) q.season = opts.season;
        if (opts.limit) q.limit = String(opts.limit);
        return fetchPublicEnvelope("/standings", q).then(function (x) {
            return x.ok ? x.data : null;
        });
    }

    function fetchPublicResults(opts) {
        opts = opts || {};
        var q = {};
        if (opts.season) q.season = opts.season;
        if (opts.slug) q.t = opts.slug;
        if (opts.limit) q.limit = String(opts.limit);
        if (opts.offset) q.offset = String(opts.offset);
        if (opts.bracket) q.bracket = "1";
        return fetchPublicEnvelope("/results", q).then(function (x) {
            return x.ok ? { results: (x.data && x.data.results) || [], pagination: x.pagination } : { results: [], pagination: null };
        });
    }

    function fetchPublicCalendar() {
        return fetchPublicEnvelope("/calendar").then(function (x) {
            return x.ok ? x.data : null;
        });
    }

    function fetchPublicSearch(query, limit) {
        return fetchPublicEnvelope("/search", { q: query, limit: String(limit || 12) }).then(function (x) {
            return x.ok ? x.data : { query: query, results: [] };
        });
    }

    function fetchPublicTeam(id) {
        return fetchPublicEnvelope("/team/" + encodeURIComponent(id || "mcv")).then(function (x) {
            return x.ok ? x.data : null;
        });
    }

    function fetchPublicTournament(slug, includeBracket) {
        var q = includeBracket === false ? { bracket: "0" } : { bracket: "1" };
        return fetchPublicEnvelope("/tournament/" + encodeURIComponent(slug), q).then(function (x) {
            return x.ok ? x.data : null;
        });
    }

    global.mcvCompeteCore = {
        apiBase: apiBase,
        esc: esc,
        isSteamId64: isSteamId64,
        resolveSteamIdFromLocation: resolveSteamIdFromLocation,
        fetchTeamRoster: fetchTeamRoster,
        fetchTournaments: fetchTournaments,
        fetchTournamentDetail: fetchTournamentDetail,
        fetchTournamentBracket: fetchTournamentBracket,
        fetchPlayerScout: fetchPlayerScout,
        fetchWipeList: fetchWipeList,
        fetchForSite: fetchForSite,
        fetchTournamentStats: fetchTournamentStats,
        fetchDiscordCounts: fetchDiscordCounts,
        checkStreamLive: checkStreamLive,
        fetchPublicEnvelope: fetchPublicEnvelope,
        fetchPublicHome: fetchPublicHome,
        fetchPublicPulse: fetchPublicPulse,
        fetchPublicPlayer: fetchPublicPlayer,
        fetchPublicStandings: fetchPublicStandings,
        fetchPublicResults: fetchPublicResults,
        fetchPublicCalendar: fetchPublicCalendar,
        fetchPublicSearch: fetchPublicSearch,
        fetchPublicTeam: fetchPublicTeam,
        fetchPublicTournament: fetchPublicTournament,
        findRosterMember: findRosterMember,
        parseRosterJson: parseRosterJson,
        rosterHasSteam: rosterHasSteam,
        fmtDate: fmtDate,
        fmtDateTime: fmtDateTime,
        fmtNum: fmtNum,
        hoursUntil: hoursUntil
    };
})(window);
