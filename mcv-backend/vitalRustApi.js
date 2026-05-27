"use strict";

const axios = require("axios");
const jwt = require("jsonwebtoken");

/** serverId numérico interno de Vital (DevTools: ?serverId=1 en EU 10x). Completar el resto en VITAL_SERVERS_JSON. */
const DEFAULT_SERVERS = [
    { key: "au-10x", label: "AU 10x", serverId: "" },
    { key: "eu-10x", label: "EU 10x", serverId: "1" },
    { key: "us-10x", label: "US 10x", serverId: "" },
    { key: "eu-mondays", label: "EU Mondays", serverId: "" },
    { key: "eu-monthly", label: "EU Monthly", serverId: "" },
    { key: "eu-medium", label: "EU Medium", serverId: "" },
    { key: "us-monthly", label: "US Monthly", serverId: "" }
];

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

function parseServers() {
    const raw = String(process.env.VITAL_SERVERS_JSON || "").trim();
    if (raw) {
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length) {
                return arr
                    .map((s) => ({
                        key: String(s.key || s.id || "").trim(),
                        label: String(s.label || s.name || "").trim(),
                        serverId: String(s.serverId || s.apiId || s.vitalId || "").trim()
                    }))
                    .filter((s) => s.key && s.label);
            }
        } catch (e) {
            console.warn("VITAL_SERVERS_JSON inválido:", e.message);
        }
    }
    return DEFAULT_SERVERS;
}

function pathPrefix() {
    const p = String(process.env.VITAL_API_PATH_PREFIX || "/api/statistics").trim();
    if (!p) {
        return "/api/statistics";
    }
    return p.startsWith("/") ? p : `/${p}`;
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
    const prefix = pathPrefix();
    const defOverview = `${prefix}/overview?serverId={serverId}&wipeId={wipeId}`;
    const defPlayers =
        `${prefix}?serverId={serverId}&wipeId={wipeId}&category=Player&sortBy=kills&sortAscending=false&page={page}&limit={limit}`;
    const defWipes = `${prefix}/wipes?serverId={serverId}`;
    const defPlayer = `${prefix}/player-overview?userId={steamId64}&serverId={serverId}&wipeId={wipeId}`;
    return {
        overview: String(process.env.VITAL_API_OVERVIEW_PATH || defOverview).trim(),
        players: String(process.env.VITAL_API_PLAYERS_PATH || defPlayers).trim(),
        wipes: String(process.env.VITAL_API_WIPES_PATH || defWipes).trim(),
        player: String(process.env.VITAL_API_PLAYER_PATH || "").trim() || defPlayer
    };
}

function baseUrl() {
    return String(process.env.VITAL_API_BASE_URL || "https://vitalrust.com").trim().replace(/\/$/, "");
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

async function fetchUpstream(url) {
    const key = url;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
        return { data: hit.data, cached: true };
    }
    await throttleUpstream();
    const headers = {
        Accept: "application/json, text/plain, */*",
        "User-Agent":
            "Mozilla/5.0 (compatible; MCV-VitalProxy/1.1; +https://mcvoficial.com; admin-only)",
        Referer: "https://vitalrust.com/statistics",
        Origin: "https://vitalrust.com",
        ...parseExtraHeaders()
    };
    const { data, status } = await axios.get(url, {
        timeout: 25000,
        headers,
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
    const candidates = [
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
    const kills = num(row.kills ?? row.Kills);
    const deaths = num(row.deaths ?? row.Deaths);
    const kdrRaw = row.kdr ?? row.kdratio ?? row.kd;
    let kdr = num(kdrRaw);
    if (!kdrRaw && deaths > 0) {
        kdr = Math.round((kills / deaths) * 100) / 100;
    } else if (!kdrRaw && kills > 0 && deaths === 0) {
        kdr = kills;
    }
    return {
        steamId64,
        name: String(row.name ?? row.username ?? row.displayName ?? row.persona ?? "").trim(),
        kills,
        killsT30: num(row.killsT30 ?? row.kills_t30 ?? row.killsT3),
        deaths,
        kdr,
        rocketsFired: num(row.rocketsFired ?? row.rockets_fired ?? row.rockets),
        bulletsHit: num(row.bulletsHit ?? row.bullets_hit),
        bulletsFired: num(row.bulletsFired ?? row.bullets_fired),
        suicides: num(row.suicides),
        wounds: num(row.wounds),
        headshots: num(row.headshots)
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
    const src = data.overview || data.serverOverview || data.stats || data.summary || data;
    if (!src || typeof src !== "object" || Array.isArray(src)) {
        return null;
    }
    return {
        kdr: num(src.kdr),
        kills: num(src.kills),
        killsT30: num(src.killsT30 ?? src.kills_t30),
        deaths: num(src.deaths),
        rocketsFired: num(src.rocketsFired ?? src.rockets_fired),
        bulletsHit: num(src.bulletsHit ?? src.bullets_hit),
        suicides: num(src.suicides),
        wounds: num(src.wounds),
        headshots: num(src.headshots),
        bulletsFired: num(src.bulletsFired ?? src.bullets_fired),
        currentPlayers: num(src.currentPlayers ?? src.playersOnline ?? src.online)
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
    const label =
        String(
            row.label ||
                row.name ||
                row.displayName ||
                row.title ||
                row.startedAt ||
                row.startDate ||
                id
        ).trim() || id;
    return {
        id,
        label,
        current: Boolean(row.current || row.isCurrent || row.active || row.isActive)
    };
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
    const limit = Math.max(25, Math.min(500, Number(process.env.VITAL_API_PAGE_SIZE || 100) || 100));
    const all = [];
    for (let page = 1; page <= maxPages; page += 1) {
        const url = fillTemplate(paths.players, { ...vars, page, limit });
        const { data } = await fetchUpstream(url);
        const chunk = extractPlayersList(data).map(normalizePlayer).filter(Boolean);
        all.push(...chunk);
        if (chunk.length < limit) {
            break;
        }
    }
    return all;
}

async function fetchPlayerBySteam(paths, vars, steamId64) {
    if (!paths.player) {
        return null;
    }
    const url = fillTemplate(paths.player, { ...vars, steamId64 });
    const { data } = await fetchUpstream(url);
    const list = extractPlayersList(data);
    if (list.length) {
        return normalizePlayer(list[0]);
    }
    if (data && typeof data === "object") {
        return normalizePlayer(data.player || data.profile || data);
    }
    return null;
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
            configured: Boolean(paths.players || paths.player || paths.overview),
            servers,
            serversConfigured: configuredCount,
            paths: {
                overview: Boolean(paths.overview),
                players: Boolean(paths.players),
                wipes: Boolean(paths.wipes),
                player: Boolean(paths.player)
            },
            pathPrefix: pathPrefix(),
            baseUrl: baseUrl(),
            cacheTtlSec: cacheTtlMs() / 1000,
            minIntervalMs: minIntervalMs(),
            disclaimer:
                "API no oficial de Vital Rust. Solo uso admin, con caché y límites. Podés cambiar o romperse sin aviso; no hagas scraping del frontend.",
            setupHint:
                "Por defecto usa /api/statistics (overview, wipes, statistics?serverId=&wipeId=). Si falla, copiá la URL completa del XHR en DevTools a VITAL_API_*_PATH en Render."
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
            const wipes = extractWipesList(data)
                .map(normalizeWipe)
                .filter(Boolean)
                .sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0));
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
        if (!paths.overview && !paths.players && !paths.player) {
            return res.status(503).json({ error: "Configurá VITAL_API_*_PATH en el servidor (ver .env.example)" });
        }
        const vars = buildVars(server.serverId, wipeId, 1, 100);
        try {
            if (paths.overview) {
                const url = fillTemplate(paths.overview, vars);
                const { data, cached } = await fetchUpstream(url);
                const overview = extractOverview(data);
                return res.json({ server, wipeId, overview, cached, source: "overview" });
            }
            const clanIds = await loadClanSteamIds(getPool);
            let players = [];
            if (paths.players) {
                const all = await fetchPlayersPage(paths, vars);
                const idSet = new Set(clanIds);
                players = idSet.size ? all.filter((p) => idSet.has(p.steamId64)) : all.slice(0, 100);
            } else if (paths.player && clanIds.length) {
                const concurrency = 4;
                for (let i = 0; i < clanIds.length; i += concurrency) {
                    const batch = clanIds.slice(i, i + concurrency);
                    const rows = await Promise.all(
                        batch.map((sid) => fetchPlayerBySteam(paths, vars, sid).catch(() => null))
                    );
                    players.push(...rows.filter(Boolean));
                }
            }
            return res.json({
                server,
                wipeId,
                overview: aggregateOverview(players),
                clanSampleSize: players.length,
                source: "clan-aggregate"
            });
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
        if (!paths.players && !paths.player) {
            return res.status(503).json({ error: "Configurá VITAL_API_PLAYERS_PATH o VITAL_API_PLAYER_PATH" });
        }
        const vars = buildVars(server.serverId, wipeId, 1, 100);
        try {
            let serverOverview = null;
            if (paths.overview) {
                try {
                    const url = fillTemplate(paths.overview, vars);
                    const { data } = await fetchUpstream(url);
                    serverOverview = extractOverview(data);
                } catch (e) {
                    console.warn("vital clan overview:", e.message);
                }
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
            let matched = [];

            if (paths.players) {
                const all = await fetchPlayersPage(paths, vars);
                const byId = new Map(all.map((p) => [p.steamId64, p]));
                matched = clanIds.map((id) => byId.get(id)).filter(Boolean);
                if (matched.length < clanIds.length && paths.player) {
                    const missing = clanIds.filter((id) => !byId.has(id));
                    for (const sid of missing.slice(0, 80)) {
                        const row = await fetchPlayerBySteam(paths, vars, sid).catch(() => null);
                        if (row) {
                            matched.push(row);
                        }
                    }
                }
            } else {
                for (const sid of clanIds.slice(0, 120)) {
                    const row = await fetchPlayerBySteam(paths, vars, sid).catch(() => null);
                    if (row) {
                        matched.push(row);
                    }
                }
            }

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
