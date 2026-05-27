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

function postResponseHasRows(data) {
    return extractPlayersList(data?.data != null ? data : { data }).length > 0;
}

async function fetchUpstreamPost(url, body, { skipCache = false } = {}) {
    const key = `POST ${url} ${JSON.stringify(body)}`;
    if (!skipCache) {
        const hit = cache.get(key);
        if (hit && hit.expires > Date.now()) {
            return { data: hit.data, cached: true };
        }
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
    if (!skipCache && postResponseHasRows(data)) {
        cache.set(key, { data, expires: Date.now() + cacheTtlMs() });
    }
    return { data, cached: false };
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function normalizeSteamId64(raw) {
    const d = String(raw == null ? "" : raw).replace(/\D/g, "");
    return /^7656119\d{10}$/.test(d) ? d : null;
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
        const id = normalizeSteamId64(c);
        if (id) {
            return id;
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
    const farming = row.statistics?.farming || row.farming || {};
    const pve = row.statistics?.pve || row.pve || {};
    const kills = num(combat.kills ?? row.kills);
    const deaths = num(combat.deaths ?? row.deaths);
    let kdr = num(combat.kdr ?? row.kdr);
    if (!kdr && deaths > 0) {
        kdr = Math.round((kills / deaths) * 100) / 100;
    } else if (!kdr && kills > 0 && deaths === 0) {
        kdr = kills;
    }
    const gamblingWagered = num(pve.scrapWheelWagered) + num(pve.scrapSlotsWagered);
    const gamblingWon = num(pve.scrapWheelWon) + num(pve.scrapSlotsWon);
    const gathered = farming.gathered || {};
    const playerInfo = row.player || {};
    return {
        steamId64,
        name: String(playerInfo.name ?? row.name ?? row.username ?? row.displayName ?? row.persona ?? "").trim(),
        avatar: String(playerInfo.avatarMedium ?? playerInfo.avatar ?? playerInfo.avatarFull ?? "").trim(),
        killsT30: num(combat.killsT3 ?? combat.killsT30 ?? row.killsT30 ?? row.kills_t30),
        kdr,
        rocketsFired: num(raiding.rockets ?? row.rocketsFired ?? row.rockets_fired ?? row.rockets),
        farmSulfur: farmGathered(gathered, ["sulfur.ore", "sulfur"]),
        farmHqMetal: farmGathered(gathered, ["hq.metal.ore", "hq.metal"]),
        farmWood: farmGathered(gathered, ["wood"]),
        gamblingWagered,
        gamblingWon
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

function sumResourceMap(obj) {
    if (!obj || typeof obj !== "object") {
        return 0;
    }
    let total = 0;
    for (const v of Object.values(obj)) {
        total += num(v);
    }
    return total;
}

/** Cantidad farmeada por clave Vital en statistics.farming.gathered */
function farmGathered(gathered, keys) {
    if (!gathered || typeof gathered !== "object") {
        return 0;
    }
    let total = 0;
    for (const key of keys) {
        total += num(gathered[key]);
    }
    return total;
}

function parsePlayerIncludes() {
    /** Vital API: includes en minúsculas (combat, raiding, farming, pve). "Combat" devuelve data vacía o 400. */
    const raw = String(process.env.VITAL_API_PLAYER_INCLUDES || "combat,raiding,farming,pve").trim();
    return raw
        .split(/[,]+/)
        .map((s) => s.trim().toLowerCase())
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

async function postPlayersOverview(url, serverId, wipeId, playerIds, includes, opts = {}) {
    /** SteamID64 > MAX_SAFE_INTEGER: Number() corrompe IDs y Vital devuelve data: []. */
    const body = {
        serverId: Number(serverId),
        playerIds: playerIds.map((s) => normalizeSteamId64(s)).filter(Boolean),
        includes: includes.map((s) => String(s).toLowerCase())
    };
    if (wipeId && wipeId !== "null") {
        body.wipeId = wipeId;
    }
    const { data } = await fetchUpstreamPost(url, body, opts);
    return extractPlayersList(data?.data != null ? data : { data });
}

function clanPlayerIncludes() {
    const base = parsePlayerIncludes();
    return [...new Set([...base, "combat", "raiding", "farming", "pve"])];
}

async function fetchClanPlayersPost(paths, serverId, wipeId, steamIds, { refresh = false } = {}) {
    const url = fillTemplate(paths.playersOverviewPost, {});
    const preferred = clanPlayerIncludes();
    const chunkSize = 100;
    const matched = [];
    const postOpts = refresh ? { skipCache: true } : {};

    for (let i = 0; i < steamIds.length; i += chunkSize) {
        const batch = steamIds.slice(i, i + chunkSize);
        let rows = await postPlayersOverview(url, serverId, wipeId, batch, preferred, postOpts);
        if (!rows.length && !preferred.every((x) => x === "combat")) {
            rows = await postPlayersOverview(url, serverId, wipeId, batch, ["combat", "raiding"], postOpts);
        }
        if (!rows.length) {
            rows = await postPlayersOverview(url, serverId, wipeId, batch, ["combat"], postOpts);
        }
        if (!rows.length) {
            rows = await postPlayersOverview(
                url,
                serverId,
                wipeId,
                batch,
                ["combat", "raiding", "farming", "pve"],
                postOpts
            );
        }
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

function parseSteamIdsInput(raw) {
    const out = [];
    const seen = new Set();
    const parts = String(raw || "")
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    for (const part of parts) {
        const id = normalizeSteamId64(part);
        if (id && !seen.has(id)) {
            seen.add(id);
            out.push(id);
        }
    }
    return out;
}

async function loadManualSteamIdsFromDb(pool) {
    const rows = [];
    if (!pool) {
        return rows;
    }
    try {
        const r = await pool.query(
            `SELECT steam_id64, label, created_at FROM vital_extra_steam_ids ORDER BY created_at DESC`
        );
        return r.rows.map((row) => ({
            steamId64: normalizeSteamId64(row.steam_id64),
            label: String(row.label || "").trim(),
            createdAt: row.created_at
        })).filter((row) => row.steamId64);
    } catch (e) {
        console.warn("vital extra steam ids:", e.message);
        return [];
    }
}

async function loadClanSteamIds(getPool) {
    const manualSet = new Set();
    const mcvSet = new Set();

    const envExtra = parseSteamIdsInput(process.env.VITAL_CLAN_EXTRA_STEAMS || "");
    envExtra.forEach((s) => manualSet.add(s));

    const pool = getPool();
    const dbManual = await loadManualSteamIdsFromDb(pool);
    dbManual.forEach((row) => manualSet.add(row.steamId64));

    const useWipe = String(process.env.VITAL_API_USE_WIPE_LIST || "1").trim() !== "0";
    const useRoster = String(process.env.VITAL_API_USE_TEAM_ROSTER || "1").trim() !== "0";

    if (pool && useWipe) {
        try {
            const r = await pool.query(`SELECT steam_id64 FROM wipe_list_members`);
            r.rows.forEach((row) => {
                const id = normalizeSteamId64(row.steam_id64);
                if (id) {
                    mcvSet.add(id);
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
                const id = normalizeSteamId64(row.steam_id64);
                if (id) {
                    mcvSet.add(id);
                }
            });
        } catch (e) {
            console.warn("vital clan roster:", e.message);
        }
    }

    const all = new Set([...mcvSet, ...manualSet]);
    return {
        ids: [...all],
        mcvIds: [...mcvSet],
        manualIds: [...manualSet].filter((id) => !mcvSet.has(id)),
        manualOnlyCount: [...manualSet].filter((id) => !mcvSet.has(id)).length,
        mcvCount: mcvSet.size,
        manualLabels: Object.fromEntries(dbManual.map((r) => [r.steamId64, r.label]).filter(([id]) => id))
    };
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
                "MCV: EU Monthly = serverId 16, EU Medium = 19. POST /players/overview: playerIds como string (no Number). Includes: combat,raiding."
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

    app.get("/api/admin/vital/extra-players", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no configurada" });
        }
        try {
            const players = await loadManualSteamIdsFromDb(pool);
            const roster = await loadClanSteamIds(getPool);
            const mcvSet = new Set(roster.mcvIds);
            return res.json({
                players: players.map((p) => ({
                    ...p,
                    alsoInMcv: mcvSet.has(p.steamId64)
                }))
            });
        } catch (e) {
            console.error("vital extra list:", e.message);
            return res.status(500).json({ error: e.message || "Error al listar extras" });
        }
    });

    app.post("/api/admin/vital/extra-players", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no configurada" });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const label = String(body.label || body.note || "").trim().slice(0, 120);
        const ids = [
            ...parseSteamIdsInput(body.steamId64 || body.steam_id64 || ""),
            ...parseSteamIdsInput(body.steamIds || body.steams || body.input || "")
        ];
        const unique = [...new Set(ids)];
        if (!unique.length) {
            return res.status(400).json({ error: "Indicá al menos un SteamID64 válido (17 dígitos)" });
        }
        try {
            const added = [];
            for (const steamId64 of unique) {
                await pool.query(
                    `INSERT INTO vital_extra_steam_ids (steam_id64, label)
                     VALUES ($1, $2)
                     ON CONFLICT (steam_id64) DO UPDATE SET label = COALESCE(NULLIF(EXCLUDED.label, ''), vital_extra_steam_ids.label)`,
                    [steamId64, label || null]
                );
                added.push(steamId64);
            }
            return res.json({ ok: true, added, count: added.length });
        } catch (e) {
            console.error("vital extra add:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo guardar" });
        }
    });

    app.delete("/api/admin/vital/extra-players/:steamId64", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no configurada" });
        }
        const steamId64 = normalizeSteamId64(req.params.steamId64);
        if (!steamId64) {
            return res.status(400).json({ error: "SteamID64 inválido" });
        }
        try {
            const r = await pool.query(`DELETE FROM vital_extra_steam_ids WHERE steam_id64 = $1 RETURNING steam_id64`, [
                steamId64
            ]);
            if (!r.rowCount) {
                return res.status(404).json({ error: "No estaba en la lista extra" });
            }
            return res.json({ ok: true, steamId64 });
        } catch (e) {
            console.error("vital extra delete:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo eliminar" });
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
        try {
            const roster = await loadClanSteamIds(getPool);
            const clanIds = roster.ids;
            const mcvSet = new Set(roster.mcvIds);
            const manualOnlySet = new Set(roster.manualIds);
            if (!clanIds.length) {
                return res.json({
                    server,
                    wipeId,
                    rosterSize: 0,
                    mcvCount: 0,
                    manualCount: 0,
                    players: [],
                    notFound: [],
                    message: "Sin SteamID64 en lista wipe, perfiles aprobados ni extras manuales."
                });
            }
            const refresh = String(req.query.refresh || "").trim() === "1";
            if (refresh) {
                for (const k of [...cache.keys()]) {
                    if (k.startsWith("POST ")) {
                        cache.delete(k);
                    }
                }
            }
            const matched = await fetchClanPlayersPost(paths, server.serverId, wipeId, clanIds, { refresh });

            const foundSet = new Set(matched.map((p) => p.steamId64));
            const notFound = clanIds.filter((id) => !foundSet.has(id));
            for (const p of matched) {
                if (manualOnlySet.has(p.steamId64)) {
                    p.rosterSource = "manual";
                    const note = roster.manualLabels[p.steamId64];
                    if (note) {
                        p.rosterNote = note;
                    }
                } else {
                    p.rosterSource = "mcv";
                }
            }
            matched.sort((a, b) => b.killsT30 - a.killsT30 || b.kdr - a.kdr);

            const hint =
                clanIds.length && !matched.length
                    ? "Vital no devolvió filas para este wipe/servidor. Probá el wipe ★ actual, otro servidor (Monthly/Medium), o agregá el SteamID64 en extras manuales."
                    : null;

            return res.json({
                server,
                wipeId,
                rosterSize: clanIds.length,
                mcvCount: roster.mcvCount,
                manualCount: roster.manualOnlyCount,
                players: matched,
                notFound,
                hint,
                vitalIncludes: parsePlayerIncludes()
            });
        } catch (e) {
            console.error("vital clan:", e.message);
            return res.status(502).json({ error: e.message || "Error Vital", hint: "Revisá paths y headers en Render" });
        }
    });
}

module.exports = { registerVitalRustApi };
