"use strict";

const axios = require("axios");
const jwt = require("jsonwebtoken");

/**
 * serverId según orden en vitalrust.com/statistics (EU 10x = 1 confirmado en DevTools).
 * MCV juega EU Monthly 2x y EU Medium 2x → ids 4 y 5 (verificar con ?serverId= al cambiar servidor).
 */
/** IDs oficiales: GET https://playerstatistics.vitalgamenetwork.com/servers */
const MCV_PRIMARY_SERVERS = [
    { key: "eu-monthly", label: "EU Monthly 2x", serverId: "16", mcvPrimary: true },
    { key: "eu-medium", label: "EU Medium 2x", serverId: "19", mcvPrimary: true }
];

const ALL_VITAL_SERVERS = [
    { key: "au-10x", label: "AU 10x", serverId: "1" },
    { key: "eu-10x", label: "EU 10x", serverId: "2" },
    { key: "us-10x", label: "US 10x", serverId: "3" },
    { key: "eu-mondays", label: "EU Mondays", serverId: "4" },
    ...MCV_PRIMARY_SERVERS,
    { key: "us-monthly", label: "US Monthly", serverId: "23" }
];

const DEFAULT_SERVER_KEY = String(process.env.VITAL_DEFAULT_SERVER_KEY || "eu-monthly").trim();

const cache = new Map();
let lastUpstreamAt = 0;

function jwtSecret() {
    const s = String(process.env.JWT_SECRET || "").trim();
    if (!s || s.length < 12) {
        return null;
    }
    return s;
}

function authAdmin(req, res, next) {
    const secret = jwtSecret();
    if (!secret) {
        return res.status(503).json({ error: "JWT_SECRET no configurado (mín. 12 caracteres)" });
    }
    const h = req.headers.authorization;
    if (!h || !h.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No autorizado" });
    }
    try {
        const decoded = jwt.verify(h.slice(7), secret);
        if (!decoded || decoded.role !== "admin") {
            return res.status(403).json({ error: "Prohibido" });
        }
        next();
    } catch {
        return res.status(401).json({ error: "Token inválido o expirado" });
    }
}

function vitalEnabled() {
    return String(process.env.VITAL_API_ENABLED || "1").trim() !== "0";
}

function cacheTtlMs() {
    const sec = Number(process.env.VITAL_CACHE_TTL_SEC || 300);
    return Math.max(30, Math.min(3600, Number.isFinite(sec) ? sec : 300)) * 1000;
}

function minIntervalMs() {
    const ms = Number(process.env.VITAL_API_MIN_INTERVAL_MS || 2500);
    return Math.max(500, Math.min(60000, Number.isFinite(ms) ? ms : 2500));
}

function parseMcvServerKeys() {
    const raw = String(process.env.MCV_VITAL_SERVER_KEYS || "eu-monthly,eu-medium").trim();
    return raw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function showAllVitalServers() {
    return String(process.env.VITAL_SHOW_ALL_SERVERS || "").trim() === "1";
}

function parseServers() {
    const raw = String(process.env.VITAL_SERVERS_JSON || "").trim();
    let list;
    if (raw) {
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length) {
                list = arr
                    .map((s) => ({
                        key: String(s.key || s.id || "").trim(),
                        label: String(s.label || s.name || "").trim(),
                        serverId: String(s.serverId || s.apiId || s.vitalId || "").trim(),
                        mcvPrimary: Boolean(s.mcvPrimary)
                    }))
                    .filter((s) => s.key && s.label);
            }
        } catch (e) {
            console.warn("VITAL_SERVERS_JSON inválido:", e.message);
        }
    }
    if (!list || !list.length) {
        list = showAllVitalServers() ? [...ALL_VITAL_SERVERS] : [...MCV_PRIMARY_SERVERS];
    }
    if (!showAllVitalServers()) {
        const mcvKeys = new Set(parseMcvServerKeys());
        const primary = list.filter((s) => mcvKeys.has(s.key));
        if (primary.length) {
            list = primary;
        }
    }
    return list;
}

function parseExtraHeaders() {
    const out = {};
    const bearer = String(process.env.VITAL_API_BEARER || "").trim();
    if (bearer) {
        out.Authorization = bearer.startsWith("Bearer ") ? bearer : `Bearer ${bearer}`;
    }
    const raw = String(process.env.VITAL_API_HEADERS_JSON || "").trim();
    if (raw) {
        try {
            const obj = JSON.parse(raw);
            if (obj && typeof obj === "object") {
                for (const [k, v] of Object.entries(obj)) {
                    if (v != null && String(k).trim()) {
                        out[String(k)] = String(v);
                    }
                }
            }
        } catch (e) {
            console.warn("VITAL_API_HEADERS_JSON inválido:", e.message);
        }
    }
    return out;
}

function apiPaths() {
    return {
        overview:
            String(process.env.VITAL_API_OVERVIEW_PATH || "").trim() ||
            "/servers/{serverId}/aggregations/overview?wipeId={wipeId}",
        overviewTotal:
            String(process.env.VITAL_API_OVERVIEW_TOTAL_PATH || "").trim() ||
            "/servers/total/aggregations/overview?serverId={serverId}",
        players:
            String(process.env.VITAL_API_PLAYERS_PATH || "").trim() ||
            "/servers/{serverId}/players?wipeId={wipeId}&perPage={limit}&page={page}&sortBy=kills&sortAscending=false&includes=Combat&includes=Raiding",
        wipes: String(process.env.VITAL_API_WIPES_PATH || "").trim() || "/servers/{serverId}/wipes",
        wipesCurrent:
            String(process.env.VITAL_API_WIPES_CURRENT_PATH || "").trim() ||
            "/servers/{serverId}/wipes/current",
        playersOverviewPost:
            String(process.env.VITAL_API_PLAYERS_OVERVIEW_POST || "").trim() || "/players/overview"
    };
}

function baseUrl() {
    return String(process.env.VITAL_API_BASE_URL || "https://playerstatistics.vitalgamenetwork.com")
        .trim()
        .replace(/\/$/, "");
}

function fillTemplate(tpl, vars) {
    let url = tpl;
    for (const [k, v] of Object.entries(vars)) {
        url = url.split(`{${k}}`).join(encodeURIComponent(v == null ? "" : String(v)));
    }
    if (url.startsWith("/")) {
        return baseUrl() + url;
    }
    if (!/^https?:\/\//i.test(url)) {
        return `${baseUrl()}/${url.replace(/^\//, "")}`;
    }
    return url;
}

async function throttleUpstream() {
    const wait = minIntervalMs() - (Date.now() - lastUpstreamAt);
    if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
    }
    lastUpstreamAt = Date.now();
}

function upstreamHeaders() {
    return {
        Accept: "application/json, text/plain, */*",
        "User-Agent":
            "Mozilla/5.0 (compatible; MCV-VitalProxy/1.2; +https://mcvoficial.com; admin-only)",
        Referer: "https://vitalrust.com/statistics",
        Origin: "https://vitalrust.com",
        ...parseExtraHeaders()
    };
}

async function fetchUpstream(url) {
    const key = `GET ${url}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
        return { data: hit.data, cached: true };
    }
    await throttleUpstream();
    const { data, status } = await axios.get(url, {
        timeout: 25000,
        headers: upstreamHeaders(),
        validateStatus: () => true
    });
    if (status >= 400) {
        const err = new Error(`Vital API respondió ${status}`);
        err.status = status;
        err.body = typeof data === "string" ? data.slice(0, 200) : data;
        throw err;
    }
    cache.set(key, { data, expires: Date.now() + cacheTtlMs() });
    return { data, cached: false };
}

async function fetchUpstreamPost(url, body) {
    const key = `POST ${url} ${JSON.stringify(body)}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
        return { data: hit.data, cached: true };
    }
    await throttleUpstream();
    const { data, status } = await axios.post(url, body, {
        timeout: 25000,
        headers: {
            ...upstreamHeaders(),
            "Content-Type": "application/json"
        },
        validateStatus: () => true
    });
    if (status >= 400) {
        const err = new Error(`Vital API respondió ${status}`);
        err.status = status;
        err.body = typeof data === "string" ? data.slice(0, 200) : data;
        throw err;
    }
    cache.set(key, { data, expires: Date.now() + cacheTtlMs() });
    return { data, cached: false };
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function pickSteamId(row) {
    if (!row || typeof row !== "object") {
        return null;
    }
    const ctx = row.context || {};
    const candidates = [
        ctx.userId,
        row.userId,
        row.user_id,
        row.steamId,
        row.steam_id,
        row.steamId64,
        row.steam_id64,
        row.steamid,
        row.id
    ];
    for (const c of candidates) {
        const d = String(c || "").replace(/\D/g, "");
        if (/^7656119\d{10}$/.test(d)) {
            return d;
        }
    }
    return null;
}

function normalizePlayer(row) {
    const steamId64 = pickSteamId(row);
    if (!steamId64) {
        return null;
    }
    const combat = row.statistics?.combat || row.combat || row;
    const raiding = row.statistics?.raiding || row.raiding || {};
    const kills = num(combat.kills ?? row.kills);
    const deaths = num(combat.deaths ?? row.deaths);
    let kdr = num(combat.kdr ?? row.kdr);
    if (!kdr && deaths > 0) {
        kdr = Math.round((kills / deaths) * 100) / 100;
    } else if (!kdr && kills > 0 && deaths === 0) {
        kdr = kills;
    }
    return {
        steamId64,
        name: String(row.player?.name ?? row.name ?? row.username ?? row.displayName ?? row.persona ?? "").trim(),
        kills,
        killsT30: num(combat.killsT3 ?? combat.killsT30 ?? row.killsT30 ?? row.kills_t30),
        deaths,
        kdr,
        rocketsFired: num(raiding.rockets ?? row.rocketsFired ?? row.rockets_fired ?? row.rockets),
        bulletsHit: num(combat.hits ?? row.bulletsHit ?? row.bullets_hit),
        bulletsFired: num(combat.shots ?? row.bulletsFired ?? row.bullets_fired),
        suicides: num(combat.suicides ?? row.suicides),
        wounds: num(combat.wounds ?? row.wounds),
        headshots: num(combat.headshots ?? row.headshots)
    };
}

function extractPlayersList(data) {
    if (!data) {
        return [];
    }
    if (Array.isArray(data)) {
        return data;
    }
    const paths = [
        data.players,
        data.results,
        data.items,
        data.rows,
        data.data,
        data.data?.players,
        data.data?.results,
        data.payload?.players
    ];
    for (const p of paths) {
        if (Array.isArray(p)) {
            return p;
        }
    }
    return [];
}

function extractOverview(data) {
    if (!data || typeof data !== "object") {
        return null;
    }
    const payload = data.data || data;
    const combat = payload.combat || payload;
    const raiding = payload.raiding || {};
    if (!combat || typeof combat !== "object") {
        return null;
    }
    const kills = num(combat.kills);
    const deaths = num(combat.deaths);
    let kdr = num(combat.kdr);
    if (!kdr && deaths > 0) {
        kdr = Math.round((kills / deaths) * 100) / 100;
    } else if (!kdr && kills > 0) {
        kdr = kills;
    }
    return {
        kdr,
        kills,
        killsT30: num(combat.killsT3 ?? combat.killsT30),
        deaths,
        rocketsFired: num(raiding.rockets ?? combat.rocketsFired),
        bulletsHit: num(combat.hits ?? combat.bulletsHit),
        suicides: num(combat.suicides),
        wounds: num(combat.wounds),
        headshots: num(combat.headshots),
        bulletsFired: num(combat.shots ?? combat.bulletsFired),
        currentPlayers: num(payload.currentPlayers ?? payload.playersOnline ?? payload.online)
    };
}

function normalizeScope(raw) {
    const s = String(raw || "wipe").toLowerCase();
    return s === "total" ? "total" : "wipe";
}

/** Vital usa wipeId=null en query para estadísticas "Total". */
function resolveWipeIdParam(req) {
    const explicit = String(req.query.wipeId ?? "").trim();
    if (explicit === "null" || explicit === "total" || explicit === "__total__") {
        return "null";
    }
    if (explicit) {
        return explicit;
    }
    if (normalizeScope(req.query.scope) === "total") {
        return "null";
    }
    return "";
}

function buildVars(serverId, wipeId, page, limit) {
    const wid = !wipeId || wipeId === "total" ? "null" : String(wipeId);
    return {
        serverId: String(serverId),
        wipeId: wid,
        scope: wid === "null" ? "total" : "wipe",
        page: page || 1,
        limit: limit || 100,
        sort: "kills",
        sortAscending: "false",
        category: "Player"
    };
}

function extractWipesList(data) {
    if (!data) {
        return [];
    }
    if (Array.isArray(data)) {
        return data;
    }
    const paths = [data.wipes, data.data, data.results, data.items];
    for (const p of paths) {
        if (Array.isArray(p)) {
            return p;
        }
    }
    return [];
}

function normalizeWipe(row) {
    if (!row || typeof row !== "object") {
        return null;
    }
    const id = String(row.id || row.wipeId || row.uuid || "").trim();
    if (!id) {
        return null;
    }
    let label = String(row.label || row.name || row.displayName || row.title || "").trim();
    if (!label && row.startTime) {
        try {
            const d = new Date(row.startTime);
            label = `${d.toLocaleDateString("es-AR")} — ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
        } catch {
            label = String(row.startTime);
        }
    }
    if (!label) {
        label = id;
    }
    return {
        id,
        label,
        current: Boolean(row.current || row.isCurrent || row.active || row.isActive)
    };
}

function parsePlayerIncludes() {
    const raw = String(process.env.VITAL_API_PLAYER_INCLUDES || "Combat,Raiding").trim();
    return raw
        .split(/[,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function overviewFetchUrl(paths, vars) {
    if (vars.wipeId === "null") {
        return fillTemplate(paths.overviewTotal, vars);
    }
    return fillTemplate(paths.overview, vars);
}

async function fetchServerOverview(paths, vars) {
    const url = overviewFetchUrl(paths, vars);
    const { data } = await fetchUpstream(url);
    return extractOverview(data);
}

async function fetchClanPlayersPost(paths, serverId, wipeId, steamIds) {
    const url = fillTemplate(paths.playersOverviewPost, {});
    const includes = parsePlayerIncludes();
    const chunkSize = 100;
    const matched = [];
    for (let i = 0; i < steamIds.length; i += chunkSize) {
        const batch = steamIds.slice(i, i + chunkSize);
        const body = {
            serverId: Number(serverId),
            playerIds: batch.map((s) => Number(s)),
            includes
        };
        if (wipeId && wipeId !== "null") {
            body.wipeId = wipeId;
        }
        const { data } = await fetchUpstreamPost(url, body);
        const rows = extractPlayersList(data);
        for (const row of rows) {
            const p = normalizePlayer(row);
            if (p) {
                matched.push(p);
            }
        }
    }
    const bySteam = new Map(matched.map((p) => [p.steamId64, p]));
    return steamIds.map((id) => bySteam.get(id)).filter(Boolean);
}

function resolveServer(serverKey) {
    const servers = parseServers();
    const key = String(serverKey || "").trim();
    const found = servers.find((s) => s.key === key) || servers[0];
    if (!found) {
        return null;
    }
    const serverId = String(found.serverId || "").trim();
    if (!serverId) {
        return { ...found, configured: false };
    }
    return { ...found, serverId, configured: true };
}

async function loadClanSteamIds(getPool) {
    const set = new Set();
    const extra = String(process.env.VITAL_CLAN_EXTRA_STEAMS || "")
        .split(/[\s,]+/)
        .map((s) => s.replace(/\D/g, ""))
        .filter((s) => /^7656119\d{10}$/.test(s));
    extra.forEach((s) => set.add(s));

    const useWipe = String(process.env.VITAL_API_USE_WIPE_LIST || "1").trim() !== "0";
    const useRoster = String(process.env.VITAL_API_USE_TEAM_ROSTER || "1").trim() !== "0";
    const pool = getPool();

    if (pool && useWipe) {
        try {
            const r = await pool.query(`SELECT steam_id64 FROM wipe_list_members`);
            r.rows.forEach((row) => {
                const id = String(row.steam_id64 || "").replace(/\D/g, "");
                if (/^7656119\d{10}$/.test(id)) {
                    set.add(id);
                }
            });
        } catch (e) {
            console.warn("vital clan wipe_list:", e.message);
        }
    }

    if (pool && useRoster) {
        try {
            const r = await pool.query(
                `SELECT steam_id64 FROM team_roster_submissions WHERE status = 'approved' AND steam_id64 IS NOT NULL`
            );
            r.rows.forEach((row) => {
                const id = String(row.steam_id64 || "").replace(/\D/g, "");
                if (/^7656119\d{10}$/.test(id)) {
                    set.add(id);
                }
            });
        } catch (e) {
            console.warn("vital clan roster:", e.message);
        }
    }

    return [...set];
}

async function fetchPlayersPage(paths, vars) {
    if (!paths.players) {
        return [];
    }
    const maxPages = Math.max(1, Math.min(20, Number(process.env.VITAL_API_MAX_PAGES || 5) || 5));
    const limit = Math.max(25, Math.min(100, Number(process.env.VITAL_API_PAGE_SIZE || 100) || 100));
    const all = [];
    for (let page = 0; page < maxPages; page += 1) {
        const url = fillTemplate(paths.players, { ...vars, page, limit });
        try {
            const { data, status } = await axios.get(url, {
                timeout: 25000,
                headers: upstreamHeaders(),
                validateStatus: () => true
            });
            if (status >= 500) {
                break;
            }
            if (status >= 400) {
                break;
            }
            const chunk = extractPlayersList(data).map(normalizePlayer).filter(Boolean);
            all.push(...chunk);
            if (chunk.length < limit) {
                break;
            }
        } catch {
            break;
        }
    }
    return all;
}

function aggregateOverview(players) {
    if (!players.length) {
        return null;
    }
    const sum = players.reduce(
        (acc, p) => {
            acc.kills += p.kills;
            acc.killsT30 += p.killsT30;
            acc.deaths += p.deaths;
            acc.rocketsFired += p.rocketsFired;
            acc.bulletsHit += p.bulletsHit;
            acc.bulletsFired += p.bulletsFired;
            acc.suicides += p.suicides;
            acc.wounds += p.wounds;
            acc.headshots += p.headshots;
            return acc;
        },
        {
            kills: 0,
            killsT30: 0,
            deaths: 0,
            rocketsFired: 0,
            bulletsHit: 0,
            bulletsFired: 0,
            suicides: 0,
            wounds: 0,
            headshots: 0
        }
    );
    sum.kdr = sum.deaths > 0 ? Math.round((sum.kills / sum.deaths) * 100) / 100 : sum.kills;
    sum.currentPlayers = players.length;
    return sum;
}

function registerVitalRustApi(app, { getPool }) {
    app.get("/api/admin/vital/config", authAdmin, (req, res) => {
        const paths = apiPaths();
        const servers = parseServers();
        const configuredCount = servers.filter((s) => s.serverId).length;
        return res.json({
            enabled: vitalEnabled(),
            configured: Boolean(paths.playersOverviewPost && paths.overview),
            servers,
            defaultServerKey: DEFAULT_SERVER_KEY,
            mcvServerKeys: parseMcvServerKeys(),
            serversConfigured: configuredCount,
            paths: {
                overview: Boolean(paths.overview),
                overviewTotal: Boolean(paths.overviewTotal),
                playersPost: Boolean(paths.playersOverviewPost),
                wipes: Boolean(paths.wipes)
            },
            apiHost: baseUrl(),
            cacheTtlSec: cacheTtlMs() / 1000,
            minIntervalMs: minIntervalMs(),
            disclaimer:
                "API no oficial (playerstatistics.vitalgamenetwork.com). Solo admins, con caché. Puede cambiar sin aviso.",
            setupHint:
                "MCV: EU Monthly = serverId 16, EU Medium = 19. Stats del clan vía POST /players/overview con SteamID64 del roster."
        });
    });

    app.get("/api/admin/vital/wipes", authAdmin, async (req, res) => {
        if (!vitalEnabled()) {
            return res.status(503).json({ error: "Vital API deshabilitada" });
        }
        const server = resolveServer(req.query.server);
        if (!server?.configured) {
            return res.status(503).json({
                error: server ? "Falta serverId en VITAL_SERVERS_JSON" : "Servidor inválido",
                server
            });
        }
        const paths = apiPaths();
        if (!paths.wipes) {
            return res.status(503).json({ error: "Sin VITAL_API_WIPES_PATH" });
        }
        try {
            const url = fillTemplate(paths.wipes, buildVars(server.serverId, "null", 1, 1));
            const { data, cached } = await fetchUpstream(url);
            let wipes = extractWipesList(data)
                .map(normalizeWipe)
                .filter(Boolean);
            try {
                const curUrl = fillTemplate(paths.wipesCurrent, buildVars(server.serverId, "null", 0, 1));
                const { data: curData } = await fetchUpstream(curUrl);
                const currentId = String(curData?.data?.id || "").trim();
                if (currentId) {
                    wipes = wipes.map((w) => ({ ...w, current: w.id === currentId }));
                }
            } catch (e) {
                console.warn("vital wipes/current:", e.message);
            }
            wipes.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0));
            return res.json({ server, wipes, cached });
        } catch (e) {
            console.error("vital wipes:", e.message);
            return res.status(502).json({
                error: e.message || "Error al listar wipes",
                hint: "Cloudflare puede bloquear el servidor; probá VITAL_API_HEADERS_JSON con Cookie de tu sesión."
            });
        }
    });

    app.get("/api/admin/vital/overview", authAdmin, async (req, res) => {
        if (!vitalEnabled()) {
            return res.status(503).json({ error: "Vital API deshabilitada (VITAL_API_ENABLED=0)" });
        }
        const server = resolveServer(req.query.server);
        if (!server) {
            return res.status(400).json({ error: "Servidor inválido" });
        }
        if (!server.configured) {
            return res.status(503).json({
                error: "Falta serverId en VITAL_SERVERS_JSON para este servidor",
                server
            });
        }
        const wipeId = resolveWipeIdParam(req);
        if (!wipeId) {
            return res.status(400).json({ error: "Falta wipeId (elegí wipe en el panel o scope=total)" });
        }
        const paths = apiPaths();
        const vars = buildVars(server.serverId, wipeId, 0, 100);
        try {
            const overview = await fetchServerOverview(paths, vars);
            return res.json({ server, wipeId, overview, source: "aggregations/overview" });
        } catch (e) {
            console.error("vital overview:", e.message);
            return res.status(e.status === 403 ? 403 : 502).json({
                error: e.message || "Error al consultar Vital",
                hint: "¿Cloudflare, cookie vencida o URL mal copiada?"
            });
        }
    });

    app.get("/api/admin/vital/clan", authAdmin, async (req, res) => {
        if (!vitalEnabled()) {
            return res.status(503).json({ error: "Vital API deshabilitada" });
        }
        const server = resolveServer(req.query.server);
        if (!server?.configured) {
            return res.status(503).json({
                error: server ? "Falta serverId en VITAL_SERVERS_JSON" : "Servidor inválido",
                server
            });
        }
        const wipeId = resolveWipeIdParam(req);
        if (!wipeId) {
            return res.status(400).json({ error: "Falta wipeId (elegí wipe en el panel)" });
        }
        const paths = apiPaths();
        const vars = buildVars(server.serverId, wipeId, 0, 100);
        try {
            let serverOverview = null;
            try {
                serverOverview = await fetchServerOverview(paths, vars);
            } catch (e) {
                console.warn("vital clan overview:", e.message);
            }

            const clanIds = await loadClanSteamIds(getPool);
            if (!clanIds.length) {
                return res.json({
                    server,
                    wipeId,
                    rosterSize: 0,
                    players: [],
                    notFound: [],
                    serverOverview,
                    message: "Sin SteamID64 en lista wipe ni perfiles aprobados."
                });
            }
            const matched = await fetchClanPlayersPost(paths, server.serverId, wipeId, clanIds);

            const foundSet = new Set(matched.map((p) => p.steamId64));
            const notFound = clanIds.filter((id) => !foundSet.has(id));
            matched.sort((a, b) => b.kills - a.kills || b.kdr - a.kdr);

            return res.json({
                server,
                wipeId,
                rosterSize: clanIds.length,
                players: matched,
                notFound,
                serverOverview,
                overview: aggregateOverview(matched)
            });
        } catch (e) {
            console.error("vital clan:", e.message);
            return res.status(502).json({ error: e.message || "Error Vital", hint: "Revisá paths y headers en Render" });
        }
    });
}

module.exports = { registerVitalRustApi };
