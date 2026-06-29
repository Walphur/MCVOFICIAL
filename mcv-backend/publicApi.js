"use strict";

const {
    sendOk,
    sendError,
    sendUnavailable,
    parsePaginationQuery,
    paginationMeta
} = require("./publicApiEnvelope");
const svc = require("./publicDataService");

const CACHE = {
    home: 60,
    pulse: 30,
    player: 60,
    standings: 120,
    results: 120,
    calendar: 300,
    search: 30,
    team: 300,
    tournament: 60
};

function registerPublicApi(app, { getPool }) {
    const base = "/api/public/v1";

    app.get(`${base}/home`, async (req, res) => {
        const pool = getPool();
        if (!pool) return sendUnavailable(res);
        try {
            const includeStream = String(req.query.stream ?? "1") !== "0";
            const data = await svc.buildHomePublic(pool, { includeStream });
            return sendOk(res, { resource: "home", data, cacheTtlSeconds: CACHE.home });
        } catch (e) {
            console.error("public/home:", e.message);
            return sendError(res, 500, "home_failed", "Error generando home pública");
        }
    });

    app.get(`${base}/pulse`, async (req, res) => {
        const pool = getPool();
        if (!pool) return sendUnavailable(res);
        try {
            const data = await svc.buildPulsePublic(pool);
            return sendOk(res, { resource: "pulse", data, cacheTtlSeconds: CACHE.pulse });
        } catch (e) {
            console.error("public/pulse:", e.message);
            return sendError(res, 500, "pulse_failed", "Error generando pulse");
        }
    });

    app.get(`${base}/player/:steamId`, async (req, res) => {
        const pool = getPool();
        if (!pool) return sendUnavailable(res);
        const sid = svc.normalizeSteamId64(req.params.steamId);
        if (!sid) {
            return sendError(res, 400, "invalid_steam_id", "SteamID64 inválido");
        }
        try {
            const data = await svc.buildPlayerPublic(pool, sid);
            if (!data) {
                return sendError(res, 404, "player_not_found", "Jugador no encontrado");
            }
            return sendOk(res, { resource: "player", data, cacheTtlSeconds: CACHE.player });
        } catch (e) {
            console.error("public/player:", e.message);
            return sendError(res, 500, "player_failed", "Error leyendo jugador");
        }
    });

    app.get(`${base}/standings`, async (req, res) => {
        const pool = getPool();
        if (!pool) return sendUnavailable(res);
        try {
            const season = req.query.season ? String(req.query.season).trim() : null;
            const limit = Number.parseInt(String(req.query.limit || "50"), 10);
            const data = await svc.computeStandings(pool, { season, limit });
            return sendOk(res, {
                resource: "standings",
                data,
                metadata: { season: data.season },
                cacheTtlSeconds: CACHE.standings
            });
        } catch (e) {
            console.error("public/standings:", e.message);
            return sendError(res, 500, "standings_failed", "Error generando ranking");
        }
    });

    app.get(`${base}/results`, async (req, res) => {
        const pool = getPool();
        if (!pool) return sendUnavailable(res);
        try {
            const { limit, offset } = parsePaginationQuery(req.query, { limit: 20, maxLimit: 50 });
            const season = req.query.season ? String(req.query.season).trim() : null;
            const slug = req.query.t || req.query.slug || null;
            const includeBracket = String(req.query.bracket ?? "0") === "1";
            const pack = await svc.buildResultsPublic(pool, { season, slug, limit, offset, includeBracket });
            return sendOk(res, {
                resource: "results",
                data: { results: pack.results, season: season || "all" },
                pagination: paginationMeta(pack.total, limit, offset),
                cacheTtlSeconds: CACHE.results
            });
        } catch (e) {
            console.error("public/results:", e.message);
            return sendError(res, 500, "results_failed", "Error leyendo resultados");
        }
    });

    app.get(`${base}/calendar`, async (req, res) => {
        const pool = getPool();
        if (!pool) return sendUnavailable(res);
        try {
            const data = await svc.buildCalendarPublic(pool);
            return sendOk(res, { resource: "calendar", data, cacheTtlSeconds: CACHE.calendar });
        } catch (e) {
            console.error("public/calendar:", e.message);
            return sendError(res, 500, "calendar_failed", "Error generando calendario");
        }
    });

    app.get(`${base}/search`, async (req, res) => {
        const pool = getPool();
        if (!pool) return sendUnavailable(res);
        const q = String(req.query.q || "").trim();
        if (!q) {
            return sendError(res, 400, "query_required", "Parámetro q requerido (mín. 2 caracteres)");
        }
        if (q.length < 2) {
            return sendError(res, 400, "query_too_short", "La búsqueda debe tener al menos 2 caracteres");
        }
        try {
            const limit = Number.parseInt(String(req.query.limit || "12"), 10);
            const data = await svc.buildSearchPublic(pool, q, limit);
            return sendOk(res, { resource: "search", data, cacheTtlSeconds: CACHE.search });
        } catch (e) {
            console.error("public/search:", e.message);
            return sendError(res, 500, "search_failed", "Error en búsqueda");
        }
    });

    app.get(`${base}/team/:id`, async (req, res) => {
        const pool = getPool();
        if (!pool) return sendUnavailable(res);
        try {
            const data = await svc.buildTeamPublic(pool, req.params.id);
            if (!data) {
                return sendError(res, 404, "team_not_found", "Equipo no encontrado");
            }
            return sendOk(res, { resource: "team", data, cacheTtlSeconds: CACHE.team });
        } catch (e) {
            console.error("public/team:", e.message);
            return sendError(res, 500, "team_failed", "Error leyendo equipo");
        }
    });

    app.get(`${base}/tournament/:slug`, async (req, res) => {
        const pool = getPool();
        if (!pool) return sendUnavailable(res);
        try {
            const includeBracket = String(req.query.bracket ?? "1") !== "0";
            const data = await svc.buildTournamentPublic(pool, req.params.slug, includeBracket);
            if (!data) {
                return sendError(res, 404, "tournament_not_found", "Torneo no encontrado");
            }
            return sendOk(res, { resource: "tournament", data, cacheTtlSeconds: CACHE.tournament });
        } catch (e) {
            console.error("public/tournament:", e.message);
            return sendError(res, 500, "tournament_failed", "Error leyendo torneo");
        }
    });

    /* Aliases sin versión — redirigen conceptualmente al contrato v1 */
    app.get("/api/public/home", (req, res) => res.redirect(307, `${base}/home`));
    app.get("/api/public/pulse", (req, res) => res.redirect(307, `${base}/pulse`));
}

module.exports = { registerPublicApi, CACHE };
