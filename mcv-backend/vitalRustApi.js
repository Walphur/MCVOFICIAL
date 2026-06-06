"use strict";

const axios = require("axios");
const { authAdmin, timingSafeEqualStr, authUser } = require("./auth");
const { getSiteUserById } = require("./siteUsers");
const {
    computeTierScoresForRoster,
    getTierScoreConfig,
    listTierScoreConfigs,
    listExtraPointCatalog,
    normalizeExtraCounts,
    expandExtraKeysFromCounts,
    resolveTierScoreConfig,
    roundScore
} = require("./vitalScoreTiers");
const { syncPlaytimeFromChannel } = require("./playtimeSync");

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
const STEAM_API_KEY = String(process.env.STEAM_API_KEY || "").trim();

async function fetchSteamSummariesBatch(steamIds) {
    const map = new Map();
    const ids = [...new Set((steamIds || []).map((id) => normalizeSteamId64(id)).filter(Boolean))];
    if (!STEAM_API_KEY || !ids.length) return map;
    for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        try {
            const { data } = await axios.get("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/", {
                params: { key: STEAM_API_KEY, steamids: chunk.join(",") },
                timeout: 12000
            });
            for (const p of data?.response?.players || []) {
                const sid = normalizeSteamId64(p.steamid);
                if (!sid) continue;
                map.set(sid, {
                    avatarUrl: p.avatarfull || p.avatarmedium || p.avatar || "",
                    personaName: String(p.personaname || "").trim().slice(0, 120)
                });
            }
        } catch (e) {
            console.warn("fetchSteamSummariesBatch:", e.message);
        }
    }
    return map;
}

async function fetchSteamAvatarsBatch(steamIds) {
    const summaries = await fetchSteamSummariesBatch(steamIds);
    const map = new Map();
    for (const [sid, row] of summaries) {
        if (row?.avatarUrl) map.set(sid, row.avatarUrl);
    }
    return map;
}

async function applySteamSummariesToPlayerInfo(pool, steamIds) {
    const ids = [...new Set((steamIds || []).map((id) => normalizeSteamId64(id)).filter(Boolean))];
    if (!ids.length) return { updated: 0, steamConfigured: Boolean(STEAM_API_KEY) };
    const ready = await ensurePlayerInfoTable(pool);
    if (!ready) return { updated: 0, steamConfigured: Boolean(STEAM_API_KEY) };
    const summaries = await fetchSteamSummariesBatch(ids);
    let updated = 0;
    for (const sid of ids) {
        const summary = summaries.get(sid);
        const personaName = summary?.personaName || "";
        if (!personaName) continue;
        const r = await pool.query(
            `UPDATE player_info_profiles
             SET display_name = CASE
               WHEN COALESCE(TRIM(display_name), '') = ''
                 OR display_name = steam_id64
                 OR display_name ~ '^[0-9]{17}$'
               THEN $2
               ELSE display_name
             END,
             updated_at = NOW()
             WHERE steam_id64 = $1
               AND (
                 COALESCE(TRIM(display_name), '') = ''
                 OR display_name = steam_id64
                 OR display_name ~ '^[0-9]{17}$'
               )
             RETURNING steam_id64`,
            [sid, personaName]
        );
        if (r.rowCount) updated += 1;
    }
    return { updated, steamConfigured: Boolean(STEAM_API_KEY) };
}

function enrichExtrasWithSteamSummaries(players, summaryMap) {
    return (players || []).map((p) => {
        const summary = summaryMap.get(p.steamId64);
        return {
            ...p,
            personaName: summary?.personaName || p.personaName || "",
            avatarUrl: summary?.avatarUrl || p.avatarUrl || ""
        };
    });
}

const cache = new Map();
let lastUpstreamAt = 0;
let lastVitalNetworkFetchAt = 0;
let lastVitalResponseFromCache = false;

function buildVitalCacheMeta() {
    const ttlMs = cacheTtlMs();
    const at = lastVitalNetworkFetchAt || null;
    const ageSec = at ? Math.max(0, Math.round((Date.now() - at) / 1000)) : null;
    return {
        cacheTtlSec: Math.round(ttlMs / 1000),
        lastFetchAt: at ? new Date(at).toISOString() : null,
        lastFetchAgeSec: ageSec,
        servedFromCache: lastVitalResponseFromCache,
        suggestRefreshAfterSec: Math.round(ttlMs / 1000)
    };
}

function markVitalFetchResult(cached) {
    lastVitalResponseFromCache = Boolean(cached);
    if (!cached) {
        lastVitalNetworkFetchAt = Date.now();
    }
}
const PLAYER_INFO_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS player_info_profiles (
    steam_id64 VARCHAR(17) PRIMARY KEY,
    display_name VARCHAR(120),
    bm_url TEXT,
    status_tag VARCHAR(24) NOT NULL DEFAULT 'wipe_guest'
        CHECK (status_tag IN ('admin', 'mcv_active', 'mcv_inactive', 'mcv_strikes', 'wipe_guest')),
    role_label VARCHAR(160),
    strikes SMALLINT NOT NULL DEFAULT 0 CHECK (strikes >= 0 AND strikes <= 3),
    strike_notes TEXT,
    entry_date DATE,
    vouch_by VARCHAR(120),
    wipe_phase VARCHAR(24) NOT NULL DEFAULT 'unknown'
        CHECK (wipe_phase IN ('inicio', 'late', 'no_juega', 'unknown')),
    hours_played INT,
    combats_lost INT NOT NULL DEFAULT 0 CHECK (combats_lost >= 0 AND combats_lost <= 9999),
    minis_lost INT NOT NULL DEFAULT 0 CHECK (minis_lost >= 0 AND minis_lost <= 9999),
    performance_score INT NOT NULL DEFAULT 0,
    contribution TEXT,
    warnings TEXT,
    mt_team BOOLEAN NOT NULL DEFAULT FALSE,
    paused_outside_wipe BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_player_info_status ON player_info_profiles (status_tag, updated_at DESC);
`;
const BATTLEMETRICS_TOKEN = String(process.env.BATTLEMETRICS_TOKEN || "").trim();

function vitalPublicAccessKey() {
    return String(process.env.VITAL_PUBLIC_ACCESS_KEY || "").trim();
}

function isVitalPublicConfigured() {
    const k = vitalPublicAccessKey();
    return Boolean(k && k.length >= 12);
}

function authVitalPublic(req, res, next) {
    const expected = vitalPublicAccessKey();
    if (!isVitalPublicConfigured()) {
        return res.status(503).json({
            error: "Acceso público Vital no configurado",
            hint: "Definí VITAL_PUBLIC_ACCESS_KEY en el servidor (mín. 12 caracteres)."
        });
    }
    const key = String(req.query.key || req.headers["x-vital-access-key"] || "").trim();
    if (!key || !timingSafeEqualStr(key, expected)) {
        return res.status(401).json({ error: "Clave de acceso inválida o faltante" });
    }
    next();
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
        markVitalFetchResult(true);
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
    markVitalFetchResult(false);
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
            markVitalFetchResult(true);
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
    markVitalFetchResult(false);
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
    const gathered = farming.gathered || {};
    const playerInfo = row.player || {};
    const buildingRaw = row.statistics?.building || row.building || {};
    return {
        steamId64,
        name: String(playerInfo.name ?? row.name ?? row.username ?? row.displayName ?? row.persona ?? "").trim(),
        avatar: String(playerInfo.avatarMedium ?? playerInfo.avatar ?? playerInfo.avatarFull ?? "").trim(),
        kills,
        deaths,
        killsT30: num(combat.killsT3 ?? combat.killsT30 ?? row.killsT30 ?? row.kills_t30),
        kdr,
        rocketsFired: num(raiding.rockets ?? row.rocketsFired ?? row.rockets_fired ?? row.rockets),
        farmSulfur: farmGathered(gathered, ["sulfur.ore", "sulfur"]),
        farmMetal: farmGathered(gathered, ["metal.ore", "metal"]),
        farmHqMetal: farmGathered(gathered, ["hq.metal.ore", "hq.metal"]),
        farmWood: farmGathered(gathered, ["wood"]),
        scrapLooted: scrapLooted(farming),
        scrapRecycled: scrapRecycled(pve),
        building: buildingTotalFromVital(buildingRaw),
        buildingDetail: buildingRaw
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
    const startRaw = row.startTime || row.startedAt || row.startDate || row.wipeStart || null;
    let startMs = null;
    if (startRaw) {
        const d = new Date(startRaw);
        if (!Number.isNaN(d.getTime())) startMs = d.getTime();
    }
    return {
        id,
        label,
        current: Boolean(row.current || row.isCurrent || row.active || row.isActive),
        startMs
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

/** Scrap loteado: farming.looted.scrap (como en vitalrust.com → SCRAP LOOTED) */
function scrapLooted(farming) {
    if (!farming || typeof farming !== "object") {
        return 0;
    }
    const looted = farming.looted || {};
    return num(looted.scrap);
}

function scrapRecycled(pve) {
    if (!pve || typeof pve !== "object") {
        return 0;
    }
    return num(pve.scrapRecycled);
}

function sumNumericObjectValues(obj) {
    if (!obj || typeof obj !== "object") {
        return 0;
    }
    let total = 0;
    for (const v of Object.values(obj)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) {
            total += n;
        }
    }
    return total;
}

function buildingTotalFromVital(building) {
    if (!building || typeof building !== "object") {
        return 0;
    }
    let total = sumNumericObjectValues(building.buildings);
    total += sumNumericObjectValues(building.deployables);
    for (const [key, val] of Object.entries(building)) {
        if (key === "buildings" || key === "deployables") {
            continue;
        }
        const n = Number(val);
        if (Number.isFinite(n) && n > 0) {
            total += n;
        }
    }
    return Math.round(total);
}

function parsePlayerIncludes() {
    /** Vital API: includes en minúsculas (combat, raiding, farming, pve). "Combat" devuelve data vacía o 400. */
    const raw = String(process.env.VITAL_API_PLAYER_INCLUDES || "combat,raiding,farming,pve,building").trim();
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
    return [...new Set([...base, "combat", "raiding", "farming", "pve", "building"])];
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

function normalizeStatusTag(raw) {
    const v = String(raw || "").trim().toLowerCase();
    const allowed = new Set(["admin", "mcv_active", "mcv_inactive", "mcv_strikes", "wipe_guest"]);
    return allowed.has(v) ? v : "wipe_guest";
}

function normalizeWipePhase(raw) {
    const v = String(raw || "").trim().toLowerCase();
    const allowed = new Set(["inicio", "late", "no_juega", "unknown"]);
    return allowed.has(v) ? v : "unknown";
}

function normalizePlayerStatCount(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
        return 0;
    }
    return Math.min(9999, Math.round(n));
}

async function ensurePlayerInfoTable(pool) {
    if (!pool) return false;
    try {
        await pool.query(PLAYER_INFO_TABLE_SQL);
        await pool.query(
            `ALTER TABLE player_info_profiles
             ADD COLUMN IF NOT EXISTS paused_outside_wipe BOOLEAN NOT NULL DEFAULT FALSE`
        );
        await pool.query(
            `ALTER TABLE player_info_profiles
             ADD COLUMN IF NOT EXISTS combats_lost INT NOT NULL DEFAULT 0`
        );
        await pool.query(
            `ALTER TABLE player_info_profiles
             ADD COLUMN IF NOT EXISTS minis_lost INT NOT NULL DEFAULT 0`
        );
        try {
            await pool.query(
                `UPDATE player_info_profiles
                 SET combats_lost = broken_attacks
                 WHERE combats_lost = 0 AND broken_attacks > 0`
            );
        } catch (eMigrate) {
            /* broken_attacks puede no existir en instalaciones nuevas */
        }
        await pool.query(
            `ALTER TABLE player_info_profiles
             ADD COLUMN IF NOT EXISTS performance_score INT NOT NULL DEFAULT 0`
        );
        return true;
    } catch (e) {
        console.error("ensure player_info_profiles:", e.message);
        return false;
    }
}

const VITAL_ROLES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS mcv_vital_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mcv_vital_roles_sort ON mcv_vital_roles (sort_order ASC, name ASC);
`;

const PLAYER_INFO_ROLE_LINKS_SQL = `
CREATE TABLE IF NOT EXISTS player_info_role_links (
    steam_id64 VARCHAR(17) NOT NULL,
    role_name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (steam_id64, role_name)
);
CREATE INDEX IF NOT EXISTS idx_player_info_role_links_role ON player_info_role_links (role_name);
`;

const PLAYER_EXTRA_POINT_LINKS_SQL = `
CREATE TABLE IF NOT EXISTS player_extra_point_links (
    steam_id64 VARCHAR(17) NOT NULL,
    extra_key VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (steam_id64, extra_key)
);
CREATE INDEX IF NOT EXISTS idx_player_extra_point_links_key ON player_extra_point_links (extra_key);
`;

const PLAYER_SCORE_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS player_score_events (
    id SERIAL PRIMARY KEY,
    steam_id64 VARCHAR(17) NOT NULL,
    delta INT NOT NULL,
    reason TEXT,
    category VARCHAR(32) NOT NULL DEFAULT 'manual',
    balance_after INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_player_score_events_steam ON player_score_events (steam_id64, created_at DESC);
`;

const DEFAULT_VITAL_ROLES = [
    "BUILDERS / RAID BASE",
    "ELEC",
    "HUERTO",
    "OUTPOST/VENDING",
    "BASE BITCH",
    "MAIN COMPS",
    "MAIN FARMERS",
    "IGL RAIDS / WIPE",
    "IGL FIGHTS",
    "COMBAT"
];

function normalizePerformanceScore(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.max(-99999, Math.min(99999, roundScore(n)));
}

async function ensureVitalRolesTable(pool) {
    if (!pool) {
        return false;
    }
    try {
        await pool.query(VITAL_ROLES_TABLE_SQL);
        const c = await pool.query(`SELECT COUNT(*)::int AS n FROM mcv_vital_roles`);
        if ((c.rows[0]?.n || 0) === 0) {
            for (let i = 0; i < DEFAULT_VITAL_ROLES.length; i += 1) {
                await pool.query(`INSERT INTO mcv_vital_roles (name, sort_order) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`, [
                    DEFAULT_VITAL_ROLES[i],
                    i + 1
                ]);
            }
        }
        return true;
    } catch (e) {
        console.error("ensure mcv_vital_roles:", e.message);
        return false;
    }
}

async function ensureScoreEventsTable(pool) {
    if (!pool) {
        return false;
    }
    try {
        await pool.query(PLAYER_SCORE_EVENTS_SQL);
        await pool.query(`ALTER TABLE player_score_events ALTER COLUMN delta TYPE NUMERIC(10,2) USING delta::numeric`).catch(() => {});
        await pool.query(`ALTER TABLE player_score_events ALTER COLUMN balance_after TYPE NUMERIC(12,2) USING balance_after::numeric`).catch(() => {});
        await pool.query(`ALTER TABLE player_info_profiles ALTER COLUMN performance_score TYPE NUMERIC(12,2) USING performance_score::numeric`).catch(() => {});
        return true;
    } catch (e) {
        console.error("ensure player_score_events:", e.message);
        return false;
    }
}

function parseRoleLabelsInput(raw) {
    if (Array.isArray(raw)) {
        return [...new Set(raw.map((s) => String(s || "").trim()).filter(Boolean))].slice(0, 12);
    }
    const text = String(raw || "").trim();
    if (!text) {
        return [];
    }
    return [...new Set(text.split(/[,;|/]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 12);
}

async function ensurePlayerRoleLinksTable(pool) {
    if (!pool) {
        return false;
    }
    try {
        await pool.query(PLAYER_INFO_ROLE_LINKS_SQL);
        return true;
    } catch (e) {
        console.error("ensure player_info_role_links:", e.message);
        return false;
    }
}

async function ensurePlayerExtraPointLinksTable(pool) {
    if (!pool) {
        return false;
    }
    try {
        await pool.query(PLAYER_EXTRA_POINT_LINKS_SQL);
        await pool
            .query(`ALTER TABLE player_extra_point_links ADD COLUMN IF NOT EXISTS qty INT NOT NULL DEFAULT 1`)
            .catch(() => {});
        return true;
    } catch (e) {
        console.error("ensure player_extra_point_links:", e.message);
        return false;
    }
}

async function loadExtraPointCountsMap(pool, steamIds) {
    const map = new Map();
    if (!pool || !steamIds.length) {
        return map;
    }
    await ensurePlayerExtraPointLinksTable(pool);
    try {
        const r = await pool.query(
            `SELECT steam_id64, extra_key, COALESCE(qty, 1)::int AS qty
             FROM player_extra_point_links
             WHERE steam_id64 = ANY($1::varchar[])
             ORDER BY extra_key ASC`,
            [steamIds]
        );
        for (const row of r.rows) {
            const sid = normalizeSteamId64(row.steam_id64);
            if (!sid) continue;
            if (!map.has(sid)) {
                map.set(sid, {});
            }
            const key = String(row.extra_key || "").trim();
            const qty = Math.max(1, Math.min(99, Number(row.qty) || 1));
            if (key) {
                map.get(sid)[key] = qty;
            }
        }
    } catch (e) {
        console.warn("loadExtraPointCountsMap:", e.message);
    }
    return map;
}

async function loadExtraPointKeysMap(pool, steamIds) {
    const countsMap = await loadExtraPointCountsMap(pool, steamIds);
    const map = new Map();
    for (const [sid, counts] of countsMap.entries()) {
        map.set(sid, expandExtraKeysFromCounts(counts));
    }
    return map;
}

async function syncPlayerExtraPointLinks(pool, steamId64, extraKeys, extraCounts) {
    await ensurePlayerExtraPointLinksTable(pool);
    const catalog = new Set(listExtraPointCatalog().map((e) => e.key));
    const counts = normalizeExtraCounts(extraKeys, extraCounts);
    const filtered = {};
    for (const [key, qty] of Object.entries(counts)) {
        if (catalog.has(key) && qty > 0) {
            filtered[key] = qty;
        }
    }
    await pool.query(`DELETE FROM player_extra_point_links WHERE steam_id64 = $1`, [steamId64]);
    for (const [key, qty] of Object.entries(filtered)) {
        await pool.query(
            `INSERT INTO player_extra_point_links (steam_id64, extra_key, qty) VALUES ($1, $2, $3)
             ON CONFLICT (steam_id64, extra_key) DO UPDATE SET qty = EXCLUDED.qty`,
            [steamId64, key.slice(0, 64), qty]
        );
    }
    return {
        counts: filtered,
        extraKeys: expandExtraKeysFromCounts(filtered)
    };
}

async function loadRoleLabelsMap(pool, steamIds) {
    const map = new Map();
    if (!pool || !steamIds.length) {
        return map;
    }
    await ensurePlayerRoleLinksTable(pool);
    try {
        const r = await pool.query(
            `SELECT steam_id64, role_name FROM player_info_role_links
             WHERE steam_id64 = ANY($1::varchar[])
             ORDER BY role_name ASC`,
            [steamIds]
        );
        for (const row of r.rows) {
            const sid = normalizeSteamId64(row.steam_id64);
            if (!sid) continue;
            if (!map.has(sid)) {
                map.set(sid, []);
            }
            map.get(sid).push(String(row.role_name || "").trim());
        }
    } catch (e) {
        console.warn("loadRoleLabelsMap:", e.message);
    }
    return map;
}

async function syncPlayerRoleLinks(pool, steamId64, roleLabels) {
    await ensurePlayerRoleLinksTable(pool);
    const labels = parseRoleLabelsInput(roleLabels);
    await pool.query(`DELETE FROM player_info_role_links WHERE steam_id64 = $1`, [steamId64]);
    for (const name of labels) {
        await pool.query(
            `INSERT INTO player_info_role_links (steam_id64, role_name) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [steamId64, name.slice(0, 120)]
        );
    }
    return labels;
}

async function loadVitalRolesFromDb(pool) {
    if (!pool) {
        return [];
    }
    await ensureVitalRolesTable(pool);
    const r = await pool.query(`SELECT id, name, sort_order, created_at FROM mcv_vital_roles ORDER BY sort_order ASC, name ASC`);
    return r.rows.map((row) => ({
        id: row.id,
        name: String(row.name || "").trim(),
        sortOrder: Number(row.sort_order) || 0,
        createdAt: row.created_at
    }));
}

async function applyPlayerScoreDelta(pool, steamId64, delta, reason, category) {
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) {
        throw new Error("El ajuste de puntos debe ser distinto de cero");
    }
    await ensurePlayerInfoTable(pool);
    await ensureScoreEventsTable(pool);
    const cur = await pool.query(`SELECT performance_score FROM player_info_profiles WHERE steam_id64 = $1`, [steamId64]);
    if (!cur.rowCount) {
        throw new Error("Jugador no encontrado en Info jugadores");
    }
    const prev = normalizePerformanceScore(cur.rows[0].performance_score);
    const next = normalizePerformanceScore(prev + d);
    const cat = String(category || "manual").trim().slice(0, 32) || "manual";
    const note = String(reason || "").trim().slice(0, 500);
    await pool.query(`UPDATE player_info_profiles SET performance_score = $2, updated_at = NOW() WHERE steam_id64 = $1`, [
        steamId64,
        next
    ]);
    const ins = await pool.query(
        `INSERT INTO player_score_events (steam_id64, delta, reason, category, balance_after)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, steam_id64, delta, reason, category, balance_after, created_at`,
        [steamId64, roundScore(d), note || null, cat, next]
    );
    return {
        steamId64,
        delta: roundScore(d),
        balanceBefore: prev,
        balanceAfter: next,
        event: ins.rows[0]
    };
}

async function recalcPlayerPerformanceScore(pool, steamId64) {
    const sum = await pool.query(
        `SELECT COALESCE(SUM(delta), 0)::numeric AS total FROM player_score_events WHERE steam_id64 = $1`,
        [steamId64]
    );
    const total = normalizePerformanceScore(sum.rows[0]?.total);
    await pool.query(`UPDATE player_info_profiles SET performance_score = $2, updated_at = NOW() WHERE steam_id64 = $1`, [
        steamId64,
        total
    ]);
    return total;
}

async function applyTierScoreResults(pool, tierResult, { serverLabel }) {
    await ensurePlayerInfoTable(pool);
    await ensureScoreEventsTable(pool);
    let applied = 0;
    let skipped = 0;
    let skippedNoWipe = 0;
    const label = String(serverLabel || tierResult.periodLabel || tierResult.configLabel || "Vital").trim();

    for (const player of tierResult.players || []) {
        const steamId64 = normalizeSteamId64(player.steamId64);
        if (!steamId64) {
            skipped += 1;
            continue;
        }
        if (player.skipped) {
            skippedNoWipe += 1;
            const existsSkipped = await pool.query(`SELECT steam_id64 FROM player_info_profiles WHERE steam_id64 = $1`, [
                steamId64
            ]);
            if (existsSkipped.rowCount) {
                await pool.query(`DELETE FROM player_score_events WHERE steam_id64 = $1 AND category LIKE 'tier_%'`, [
                    steamId64
                ]);
                const manualSum = await pool.query(
                    `SELECT COALESCE(SUM(delta), 0)::numeric AS total FROM player_score_events WHERE steam_id64 = $1`,
                    [steamId64]
                );
                const balance = normalizePerformanceScore(manualSum.rows[0]?.total);
                await pool.query(
                    `UPDATE player_info_profiles SET performance_score = $2, updated_at = NOW() WHERE steam_id64 = $1`,
                    [steamId64, balance]
                );
            }
            continue;
        }
        const exists = await pool.query(`SELECT steam_id64 FROM player_info_profiles WHERE steam_id64 = $1`, [steamId64]);
        if (!exists.rowCount) {
            skipped += 1;
            continue;
        }

        await pool.query(`DELETE FROM player_score_events WHERE steam_id64 = $1 AND category LIKE 'tier_%'`, [steamId64]);

        const manualSum = await pool.query(
            `SELECT COALESCE(SUM(delta), 0)::numeric AS total FROM player_score_events WHERE steam_id64 = $1`,
            [steamId64]
        );
        let balance = normalizePerformanceScore(manualSum.rows[0]?.total);

        for (const line of player.breakdown || []) {
            const pts = Number(line.points);
            if (!Number.isFinite(pts) || pts === 0) {
                continue;
            }
            const rawNote =
                line.raw != null && Number.isFinite(Number(line.raw))
                    ? ` (${Number(line.raw).toLocaleString("es-AR")}${line.isLeader ? ", líder" : ""})`
                    : line.isLeader
                      ? " (líder)"
                      : "";
            const reason = `${line.label}${rawNote} · ${label}`;
            const category = `tier_${String(line.id || "misc").slice(0, 28)}`;
            balance = normalizePerformanceScore(balance + pts);
            await pool.query(
                `INSERT INTO player_score_events (steam_id64, delta, reason, category, balance_after)
                 VALUES ($1, $2, $3, $4, $5)`,
                [steamId64, roundScore(pts), reason.slice(0, 500), category, balance]
            );
        }

        await pool.query(`UPDATE player_info_profiles SET performance_score = $2, updated_at = NOW() WHERE steam_id64 = $1`, [
            steamId64,
            balance
        ]);
        applied += 1;
    }

    return {
        applied,
        skipped,
        skippedNoWipe,
        serverKey: tierResult.serverKey,
        configKey: tierResult.configKey,
        serverLabel: label
    };
}

async function resetPlayerScore(pool, steamId64) {
    await ensurePlayerInfoTable(pool);
    await ensureScoreEventsTable(pool);
    await ensurePlayerExtraPointLinksTable(pool);
    const cur = await pool.query(`SELECT steam_id64 FROM player_info_profiles WHERE steam_id64 = $1`, [steamId64]);
    if (!cur.rowCount) {
        throw new Error("Jugador no encontrado en Info jugadores");
    }
    await pool.query(`DELETE FROM player_score_events WHERE steam_id64 = $1`, [steamId64]);
    await pool.query(`DELETE FROM player_extra_point_links WHERE steam_id64 = $1`, [steamId64]);
    await pool.query(`UPDATE player_info_profiles SET performance_score = 0, updated_at = NOW() WHERE steam_id64 = $1`, [
        steamId64
    ]);
    return { steamId64, performanceScore: 0 };
}

function resolvePlayerInfoHoursInput(body, fallbackHours = null) {
    const src = body && typeof body === "object" ? body : {};
    const hasHoursPlayed = Object.prototype.hasOwnProperty.call(src, "hoursPlayed");
    const hasHoursSnake = Object.prototype.hasOwnProperty.call(src, "hours_played");
    const hasField = hasHoursPlayed || hasHoursSnake;
    if (!hasField) {
        return { hasField: false, hoursPlayed: fallbackHours != null ? fallbackHours : null };
    }
    const raw = hasHoursPlayed ? src.hoursPlayed : src.hours_played;
    if (raw === null || raw === "") {
        return { hasField: true, hoursPlayed: null };
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
        return { hasField: true, hoursPlayed: fallbackHours != null ? fallbackHours : null };
    }
    return { hasField: true, hoursPlayed: Math.max(0, Math.round(n)) };
}

function normalizePlayerInfoRow(row) {
    const steamId64 = normalizeSteamId64(row.steam_id64 || row.steamId64 || row.steamId);
    if (!steamId64) return null;
    return {
        steamId64,
        displayName: String(row.display_name || row.displayName || "").trim(),
        bmUrl: String(row.bm_url || row.bmUrl || "").trim(),
        statusTag: normalizeStatusTag(row.status_tag || row.statusTag),
        roleLabel: String(row.role_label || row.roleLabel || "").trim(),
        roleLabels: Array.isArray(row.roleLabels)
            ? row.roleLabels.map((s) => String(s || "").trim()).filter(Boolean)
            : parseRoleLabelsInput(row.role_label || row.roleLabel || ""),
        strikes: Math.max(0, Math.min(3, num(row.strikes))),
        strikeNotes: String(row.strike_notes || row.strikeNotes || "").trim(),
        entryDate: row.entry_date || row.entryDate || null,
        vouchBy: String(row.vouch_by || row.vouchBy || "").trim(),
        wipePhase: normalizeWipePhase(row.wipe_phase || row.wipePhase),
        hoursPlayed: Number.isFinite(Number(row.hours_played ?? row.hoursPlayed)) ? Number(row.hours_played ?? row.hoursPlayed) : null,
        combatsLost: normalizePlayerStatCount(row.combats_lost ?? row.combatsLost ?? row.broken_attacks ?? row.brokenAttacks),
        minisLost: normalizePlayerStatCount(row.minis_lost ?? row.minisLost),
        performanceScore: normalizePerformanceScore(row.performance_score ?? row.performanceScore),
        contribution: String(row.contribution || "").trim(),
        warnings: String(row.warnings || "").trim(),
        mtTeam: Boolean(row.mt_team ?? row.mtTeam),
        pausedOutsideWipe:
            Boolean(row.paused_outside_wipe ?? row.pausedOutsideWipe) ||
            normalizeWipePhase(row.wipe_phase || row.wipePhase) === "no_juega",
        updatedAt: row.updated_at || row.updatedAt || null
    };
}

function extractBattleMetricsId(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    if (/^\d+$/.test(s)) return s;
    const m = s.match(/battlemetrics\.com\/players\/(\d+)/i) || s.match(/battlemetrics\.com\/rcon\/players\/(\d+)/i);
    return m ? m[1] : "";
}

function battlemetricsHeaders() {
    const h = { Accept: "application/vnd.api+json" };
    if (BATTLEMETRICS_TOKEN) h.Authorization = `Bearer ${BATTLEMETRICS_TOKEN}`;
    return h;
}

function collectNumericCandidates(obj, out = []) {
    if (obj == null) return out;
    if (typeof obj === "number" && Number.isFinite(obj)) {
        out.push(obj);
        return out;
    }
    if (typeof obj !== "object") return out;
    for (const [k, v] of Object.entries(obj)) {
        const lk = String(k).toLowerCase();
        if (/time|play|hour|min/i.test(lk) && typeof v === "number" && Number.isFinite(v)) {
            out.push(v);
        }
        collectNumericCandidates(v, out);
    }
    return out;
}

function parseImportBool(v) {
    const s = String(v == null ? "" : v).trim().toLowerCase();
    return s === "1" || s === "true" || s === "si" || s === "sí" || s === "yes" || s === "mt";
}

function parsePlayerInfoImportText(raw) {
    const text = String(raw || "").replace(/\r\n/g, "\n").trim();
    if (!text) return [];
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];

    const first = lines[0];
    const delim = first.includes("\t") ? "\t" : (first.includes(";") ? ";" : ",");
    const headers = first.split(delim).map((h) => h.trim().toLowerCase());
    const idx = (names) => headers.findIndex((h) => names.includes(h));
    const cSteam = idx(["steam id", "steamid", "steam_id", "steam_id64", "steamid64", "steam"]);
    if (cSteam < 0) return [];
    const cName = idx(["nombre", "name", "display_name", "display"]);
    const cBm = idx(["bm", "battlemetrics", "battlemetrics url", "bm url", "bm_url"]);
    const cRole = idx(["rol", "role", "role_label"]);
    const cStrikes = idx(["strikes", "strike"]);
    const cNotes = idx(["notas", "notes", "warnings", "avisos", "strike_notes"]);
    const cEntry = idx(["entrada", "entry", "entry_date", "ingreso"]);
    const cVouch = idx(["vouch", "vouched", "vouch_by"]);
    const cStatus = idx(["status", "estado", "color", "status_tag"]);
    const cWipe = idx(["wipe", "wipe_phase", "fase_wipe", "wipe phase"]);
    const cHours = idx(["hours", "horas", "hours_played"]);
    const cCombatsLost = idx([
        "combats perdidos",
        "combats_perdidos",
        "combates perdidos",
        "combates_perdidos",
        "combats_lost",
        "combats lost",
        "ataques rotos",
        "ataques_rotos",
        "broken_attacks"
    ]);
    const cMinisLost = idx(["minis perdidos", "minis_perdidos", "minis_lost", "minis lost"]);
    const cContrib = idx(["aportacion", "aporte", "contribution"]);
    const cMt = idx(["mt", "mt team", "mt_team"]);
    const cPaused = idx(["pausado", "paused", "pause", "paused_outside_wipe"]);

    const mapStatus = (rawStatus) => {
        const s = String(rawStatus || "").trim().toLowerCase();
        if (["verde", "green", "admin"].includes(s)) return "admin";
        if (["violeta", "purple", "mcv", "mcv_active", "active"].includes(s)) return "mcv_active";
        if (["negro", "black", "mcv_inactive", "inactive"].includes(s)) return "mcv_inactive";
        if (["rojo", "red", "mcv_strikes", "strikes"].includes(s)) return "mcv_strikes";
        if (["blanco", "white", "wipe_guest", "guest"].includes(s)) return "wipe_guest";
        return "wipe_guest";
    };

    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
        const cols = lines[i].split(delim).map((c) => c.trim());
        const steamId64 = normalizeSteamId64(cols[cSteam]);
        if (!steamId64) continue;
        const entryRaw = cEntry >= 0 ? cols[cEntry] : "";
        const entryDate = /^\d{4}-\d{2}-\d{2}$/.test(entryRaw)
            ? entryRaw
            : (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(entryRaw)
                ? entryRaw.split("/").reverse().join("-")
                : null);
        rows.push(
            normalizePlayerInfoRow({
                steam_id64: steamId64,
                display_name: cName >= 0 ? cols[cName] : "",
                bm_url: cBm >= 0 ? cols[cBm] : "",
                status_tag: cStatus >= 0 ? mapStatus(cols[cStatus]) : "wipe_guest",
                role_label: cRole >= 0 ? cols[cRole] : "",
                roleLabels: parseRoleLabelsInput(cRole >= 0 ? cols[cRole] : ""),
                strikes: cStrikes >= 0 ? cols[cStrikes] : 0,
                strike_notes: cNotes >= 0 ? cols[cNotes] : "",
                entry_date: entryDate,
                vouch_by: cVouch >= 0 ? cols[cVouch] : "",
                wipe_phase: cWipe >= 0 ? cols[cWipe] : "unknown",
                hours_played: cHours >= 0 ? cols[cHours] : null,
                combats_lost: cCombatsLost >= 0 ? cols[cCombatsLost] : 0,
                minis_lost: cMinisLost >= 0 ? cols[cMinisLost] : 0,
                contribution: cContrib >= 0 ? cols[cContrib] : "",
                warnings: cNotes >= 0 ? cols[cNotes] : "",
                mt_team: cMt >= 0 ? parseImportBool(cols[cMt]) : false,
                paused_outside_wipe:
                    cPaused >= 0
                        ? parseImportBool(cols[cPaused])
                        : normalizeWipePhase(cWipe >= 0 ? cols[cWipe] : "unknown") === "no_juega"
            })
        );
    }
    return rows.filter(Boolean);
}

const ENSURE_VITAL_EXTRA_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS vital_extra_steam_ids (
    steam_id64 VARCHAR(17) PRIMARY KEY,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vital_extra_created ON vital_extra_steam_ids (created_at DESC);
`;

async function ensureVitalExtraTable(pool) {
    if (!pool) {
        return false;
    }
    try {
        await pool.query(ENSURE_VITAL_EXTRA_TABLE_SQL);
        return true;
    } catch (e) {
        console.error("ensure vital_extra_steam_ids:", e.message);
        return false;
    }
}

async function loadManualSteamIdsFromDb(pool) {
    const rows = [];
    if (!pool) {
        return rows;
    }
    try {
        await ensureVitalExtraTable(pool);
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

/** Crea fichas en Info jugadores para SteamID del extras roster que aún no existen. */
async function ensurePlayerInfoForExtraSteamIds(pool, entries) {
    const ready = await ensurePlayerInfoTable(pool);
    if (!ready) {
        throw new Error("No se pudo preparar player_info_profiles");
    }
    let created = 0;
    const list = Array.isArray(entries) ? entries : [];
    for (const entry of list) {
        const steamId64 = normalizeSteamId64(entry?.steamId64 || entry?.steam_id64 || entry);
        if (!steamId64) continue;
        const label = String(entry?.label || "").trim().slice(0, 120);
        const displayName = label || null;
        const r = await pool.query(
            `INSERT INTO player_info_profiles (steam_id64, display_name, status_tag, vouch_by, wipe_phase)
             VALUES ($1, $2, 'wipe_guest', $3, 'unknown')
             ON CONFLICT (steam_id64) DO NOTHING
             RETURNING steam_id64`,
            [steamId64, displayName, label || null]
        );
        if (r.rowCount) created += 1;
    }
    return created;
}

async function countExtrasMissingPlayerInfo(pool, extras) {
    const list = Array.isArray(extras) ? extras : [];
    if (!list.length) return 0;
    const ids = list.map((p) => p.steamId64).filter(Boolean);
    const r = await pool.query(`SELECT steam_id64 FROM player_info_profiles WHERE steam_id64 = ANY($1::text[])`, [ids]);
    const have = new Set(r.rows.map((row) => row.steam_id64));
    return ids.filter((id) => !have.has(id)).length;
}

async function loadActivePlayerInfoSteamIds(pool) {
    if (!pool) {
        return [];
    }
    try {
        const ready = await ensurePlayerInfoTable(pool);
        if (!ready) {
            return [];
        }
        const r = await pool.query(
            `SELECT steam_id64, status_tag, wipe_phase, paused_outside_wipe
             FROM player_info_profiles
             WHERE steam_id64 IS NOT NULL
               AND COALESCE(paused_outside_wipe, false) = false
               AND wipe_phase IS DISTINCT FROM 'no_juega'
               AND status_tag NOT IN ('mcv_inactive')
               AND (
                   status_tag IN ('admin', 'mcv_active', 'mcv_strikes')
                   OR (status_tag = 'wipe_guest' AND wipe_phase IN ('inicio', 'late'))
               )`
        );
        const ids = [];
        for (const row of r.rows) {
            const id = normalizeSteamId64(row.steam_id64);
            if (id) {
                ids.push(id);
            }
        }
        return [...new Set(ids)];
    } catch (e) {
        console.warn("vital clan player_info:", e.message);
        return [];
    }
}

async function loadClanSteamIds(getPool) {
    const manualSet = new Set();
    const mcvSet = new Set();
    const playerInfoSet = new Set();

    const envExtra = parseSteamIdsInput(process.env.VITAL_CLAN_EXTRA_STEAMS || "");
    envExtra.forEach((s) => manualSet.add(s));

    const pool = getPool();
    const dbManual = await loadManualSteamIdsFromDb(pool);
    dbManual.forEach((row) => manualSet.add(row.steamId64));

    const useWipe = String(process.env.VITAL_API_USE_WIPE_LIST || "1").trim() !== "0";
    const useRoster = String(process.env.VITAL_API_USE_TEAM_ROSTER || "1").trim() !== "0";
    const usePlayerInfo = String(process.env.VITAL_API_USE_PLAYER_INFO || "1").trim() !== "0";

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

    if (pool && usePlayerInfo) {
        const fromInfo = await loadActivePlayerInfoSteamIds(pool);
        fromInfo.forEach((id) => {
            playerInfoSet.add(id);
            mcvSet.add(id);
        });
    }

    const all = new Set([...mcvSet, ...manualSet]);
    return {
        ids: [...all],
        mcvIds: [...mcvSet],
        manualIds: [...manualSet].filter((id) => !mcvSet.has(id)),
        manualOnlyCount: [...manualSet].filter((id) => !mcvSet.has(id)).length,
        mcvCount: mcvSet.size,
        playerInfoCount: playerInfoSet.size,
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

function isComplianceReportPlayer(row) {
    if (!row) return false;
    if (String(row.statusTag || "") === "mcv_inactive") return false;
    if (row.pausedOutsideWipe || normalizeWipePhase(row.wipePhase) === "no_juega") return false;
    return true;
}

function complianceRowFromProfile(p) {
    return {
        steamId64: p.steamId64,
        displayName: String(p.displayName || "").trim() || p.steamId64,
        statusTag: p.statusTag,
        wipePhase: normalizeWipePhase(p.wipePhase)
    };
}

async function loadSteamDiscordLinksMap(pool, steamIds) {
    const map = new Map();
    const ids = [...new Set((steamIds || []).map((id) => normalizeSteamId64(id)).filter(Boolean))];
    if (!pool || !ids.length) return map;
    const r = await pool.query(
        `SELECT steam_id64, discord_user_id, discord_username, persona_name
         FROM wipe_list_members
         WHERE steam_id64 = ANY($1::varchar[])
           AND discord_user_id NOT LIKE 'wipehx:%'
           AND discord_user_id NOT LIKE 'paste:%'
           AND discord_user_id ~ '^[0-9]{16,20}$'`,
        [ids]
    );
    for (const row of r.rows) {
        const sid = normalizeSteamId64(row.steam_id64);
        if (!sid) continue;
        map.set(sid, {
            discordUserId: String(row.discord_user_id || "").trim(),
            discordUsername: String(row.discord_username || row.persona_name || "").trim()
        });
    }
    return map;
}

async function buildComplianceReport(pool, options = {}) {
    const ready = await ensurePlayerInfoTable(pool);
    if (!ready) {
        throw new Error("No se pudo preparar player_info_profiles");
    }
    const r = await pool.query(
        `SELECT steam_id64, display_name, status_tag, wipe_phase, paused_outside_wipe, bm_url
         FROM player_info_profiles
         ORDER BY LOWER(COALESCE(display_name, steam_id64)), steam_id64`
    );
    const profiles = r.rows.map(normalizePlayerInfoRow).filter(Boolean);
    const inScope = profiles.filter(isComplianceReportPlayer);
    const linkMap = await loadSteamDiscordLinksMap(
        pool,
        inScope.map((p) => p.steamId64)
    );

    const noDiscordSteam = [];
    const noWipePhase = [];
    const noBattleMetrics = [];

    for (const p of inScope) {
        const base = complianceRowFromProfile(p);
        if (!linkMap.has(p.steamId64)) {
            noDiscordSteam.push({
                ...base,
                reason: "Sin vincular Discord con Steam (/mcv-wipe)"
            });
        }
        if (normalizeWipePhase(p.wipePhase) === "unknown") {
            noWipePhase.push({
                ...base,
                reason: "Fase wipe sin definir (—)"
            });
        }
        if (!extractBattleMetricsId(p.bmUrl)) {
            noBattleMetrics.push({
                ...base,
                reason: "Sin link BattleMetrics"
            });
        }
    }

    let discordHoursNoSteam = [];
    let discordScan = { attempted: false, ok: false, error: null, scanned: 0 };
    if (options.scanDiscord) {
        discordScan.attempted = true;
        const client = options.discordClient;
        const channelId = String(options.playtimeChannelId || "").trim();
        if (!client?.isReady?.()) {
            discordScan.error = "Bot de Discord no conectado";
        } else if (!channelId) {
            discordScan.error = "Falta DISCORD_PLAYTIME_CHANNEL_ID";
        } else {
            try {
                const result = await syncPlaytimeFromChannel(client, pool, channelId, {
                    maxMessages: options.maxMessages || 400
                });
                discordScan.ok = true;
                discordScan.scanned = result.scanned || 0;
                discordHoursNoSteam = (result.unmatchedPlayers || []).map((u) => ({
                    discordUserId: u.discordUserId,
                    discordUsername: u.discordUsername || u.discordUserId,
                    hours: u.hours,
                    reason: "Posteó horas en Discord pero no tiene /mcv-wipe"
                }));
            } catch (e) {
                discordScan.error = e.message || "Error leyendo canal de horas";
            }
        }
    }

    return {
        generatedAt: new Date().toISOString(),
        scopeCount: inScope.length,
        totalProfiles: profiles.length,
        noDiscordSteam,
        noWipePhase,
        noBattleMetrics,
        discordHoursNoSteam,
        discordScan
    };
}

async function resolveCurrentWipeId(paths, serverId) {
    if (!paths.wipesCurrent) {
        return null;
    }
    try {
        const curUrl = fillTemplate(paths.wipesCurrent, buildVars(serverId, "null", 0, 1));
        const { data } = await fetchUpstream(curUrl);
        return String(data?.data?.id || "").trim() || null;
    } catch (e) {
        console.warn("resolveCurrentWipeId:", e.message);
        return null;
    }
}

async function fetchTierScoresPayload(getPool, { serverKey, wipeIdRaw, refresh, at } = {}) {
    if (!vitalEnabled()) {
        throw new Error("Vital API deshabilitada");
    }
    const server = resolveServer(serverKey);
    if (!server?.configured) {
        throw new Error("Servidor Vital inválido o sin serverId");
    }
    const scoredAt = at instanceof Date && !Number.isNaN(at.getTime()) ? at : new Date();
    const resolved = resolveTierScoreConfig({ serverKey: server.key, at: scoredAt });
    const paths = apiPaths();
    if (!paths.playersOverviewPost) {
        throw new Error("Sin VITAL_API_PLAYERS_OVERVIEW_POST");
    }
    let wipeId = String(wipeIdRaw || "").trim();
    if (!wipeId || wipeId === "current") {
        wipeId = (await resolveCurrentWipeId(paths, server.serverId)) || "null";
    }
    const roster = await loadClanSteamIds(getPool);
    const clanIds = roster.ids;
    if (!clanIds.length) {
        return {
            server,
            wipeId,
            rosterSize: 0,
            vitalMatched: 0,
            notFound: [],
            tierResult: computeTierScoresForRoster({ serverKey: server.key, players: [], at: scoredAt })
        };
    }
    if (refresh) {
        for (const k of [...cache.keys()]) {
            if (k.startsWith("POST ")) {
                cache.delete(k);
            }
        }
    }
    const matched = await fetchClanPlayersPost(paths, server.serverId, wipeId, clanIds, { refresh });
    const bySteam = new Map(matched.map((p) => [p.steamId64, p]));
    const notFound = clanIds.filter((id) => !bySteam.has(id));

    const pool = getPool();
    if (!pool) {
        throw new Error("Base de datos no configurada");
    }
    await ensurePlayerInfoTable(pool);
    const profilesRes = await pool.query(`SELECT * FROM player_info_profiles WHERE steam_id64 = ANY($1::varchar[])`, [
        clanIds
    ]);
    const profileMap = new Map(
        profilesRes.rows
            .map((r) => normalizePlayerInfoRow(r))
            .filter(Boolean)
            .map((p) => [p.steamId64, p])
    );
    const extraCountsMap = await loadExtraPointCountsMap(pool, [...profileMap.keys()]);

    const playersForScoring = [...profileMap.keys()].map((sid) => {
        const profile = profileMap.get(sid);
        const vital = bySteam.get(sid) || {};
        const extraCounts = extraCountsMap.get(sid) || profile.extraCounts || {};
        const extraKeys = expandExtraKeysFromCounts(extraCounts);
        return {
            steamId64: sid,
            name: profile.displayName || vital.name || "",
            vital,
            profile,
            extraKeys,
            extraCounts
        };
    });

    const tierResult = computeTierScoresForRoster({ serverKey: server.key, players: playersForScoring, at: scoredAt });

    return {
        server,
        wipeId,
        rosterSize: clanIds.length,
        vitalMatched: matched.length,
        scoredPlayers: playersForScoring.length,
        notFound,
        tierResult,
        resolved: {
            serverKey: resolved.serverKey,
            configKey: resolved.configKey,
            configLabel: resolved.config.label,
            period: resolved.period,
            periodLabel: resolved.label
        },
        vitalCache: buildVitalCacheMeta()
    };
}

function registerVitalRustApi(app, { getPool, getDiscordClient, getPlaytimeChannelId }) {
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
            wipes.sort(function (a, b) {
                if (a.current !== b.current) return a.current ? -1 : 1;
                return (b.startMs || 0) - (a.startMs || 0);
            });
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
            const ready = await ensureVitalExtraTable(pool);
            if (!ready) {
                return res.status(503).json({ error: "No se pudo preparar la tabla vital_extra_steam_ids" });
            }
            const players = await loadManualSteamIdsFromDb(pool);
            const roster = await loadClanSteamIds(getPool);
            const mcvSet = new Set(roster.mcvIds);
            const missingInPlayerInfo = await countExtrasMissingPlayerInfo(pool, players);
            const steamMap = await fetchSteamSummariesBatch(players.map((p) => p.steamId64));
            const enriched = enrichExtrasWithSteamSummaries(players, steamMap).map((p) => ({
                ...p,
                alsoInMcv: mcvSet.has(p.steamId64)
            }));
            return res.json({
                persisted: true,
                total: players.length,
                missingInPlayerInfo,
                steamConfigured: Boolean(STEAM_API_KEY),
                players: enriched
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
            const ready = await ensureVitalExtraTable(pool);
            if (!ready) {
                return res.status(503).json({ error: "No se pudo preparar la tabla vital_extra_steam_ids" });
            }
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
            const playerInfoCreated = await ensurePlayerInfoForExtraSteamIds(
                pool,
                added.map((steamId64) => ({ steamId64, label }))
            );
            const steamSync = await applySteamSummariesToPlayerInfo(pool, added);
            const saved = await loadManualSteamIdsFromDb(pool);
            return res.json({
                ok: true,
                added,
                count: added.length,
                persisted: true,
                totalSaved: saved.length,
                playerInfoCreated,
                steamNamesUpdated: steamSync.updated,
                steamConfigured: steamSync.steamConfigured
            });
        } catch (e) {
            console.error("vital extra add:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo guardar" });
        }
    });

    app.post("/api/admin/vital/extra-players/sync-steam", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no configurada" });
        }
        if (!STEAM_API_KEY) {
            return res.status(503).json({
                error: "Falta STEAM_API_KEY en el servidor para consultar perfiles de Steam"
            });
        }
        try {
            const ready = await ensureVitalExtraTable(pool);
            if (!ready) {
                return res.status(503).json({ error: "No se pudo preparar la tabla vital_extra_steam_ids" });
            }
            const extras = await loadManualSteamIdsFromDb(pool);
            const steamSync = await applySteamSummariesToPlayerInfo(
                pool,
                extras.map((p) => p.steamId64)
            );
            return res.json({
                ok: true,
                totalExtras: extras.length,
                steamNamesUpdated: steamSync.updated,
                message:
                    steamSync.updated > 0
                        ? `${steamSync.updated} nombre(s) actualizados desde Steam.`
                        : "No había nombres pendientes de actualizar (o Steam no devolvió datos)."
            });
        } catch (e) {
            console.error("vital extra sync steam:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo sincronizar con Steam" });
        }
    });

    app.post("/api/admin/vital/extra-players/sync-player-info", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no configurada" });
        }
        try {
            const ready = await ensureVitalExtraTable(pool);
            if (!ready) {
                return res.status(503).json({ error: "No se pudo preparar la tabla vital_extra_steam_ids" });
            }
            const extras = await loadManualSteamIdsFromDb(pool);
            const playerInfoCreated = await ensurePlayerInfoForExtraSteamIds(pool, extras);
            const steamSync = await applySteamSummariesToPlayerInfo(
                pool,
                extras.map((p) => p.steamId64)
            );
            return res.json({
                ok: true,
                totalExtras: extras.length,
                playerInfoCreated,
                steamNamesUpdated: steamSync.updated,
                steamConfigured: steamSync.steamConfigured,
                message:
                    playerInfoCreated > 0
                        ? `${playerInfoCreated} jugador(es) agregados a Info jugadores.`
                        : steamSync.updated > 0
                          ? `${steamSync.updated} nombre(s) actualizados desde Steam.`
                          : "Todos los extras ya tenían ficha en Jugadores."
            });
        } catch (e) {
            console.error("vital extra sync player-info:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo sincronizar con Jugadores" });
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

    app.get("/api/admin/vital/roles", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        try {
            const roles = await loadVitalRolesFromDb(pool);
            return res.json({ roles });
        } catch (e) {
            console.error("vital roles list:", e.message);
            return res.status(500).json({ error: e.message || "Error al listar roles" });
        }
    });

    app.post("/api/admin/vital/roles", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const name = String(body.name || "").trim().slice(0, 120);
        if (!name) return res.status(400).json({ error: "Indicá el nombre del rol" });
        const sortOrder = Number(body.sortOrder ?? body.sort_order);
        try {
            const ready = await ensureVitalRolesTable(pool);
            if (!ready) return res.status(503).json({ error: "No se pudo preparar mcv_vital_roles" });
            const r = await pool.query(
                `INSERT INTO mcv_vital_roles (name, sort_order) VALUES ($1, $2)
                 ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order
                 RETURNING id, name, sort_order, created_at`,
                [name, Number.isFinite(sortOrder) ? sortOrder : 999]
            );
            return res.json({ ok: true, role: { id: r.rows[0].id, name: r.rows[0].name, sortOrder: r.rows[0].sort_order } });
        } catch (e) {
            console.error("vital roles add:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo guardar el rol" });
        }
    });

    app.patch("/api/admin/vital/roles/:id", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "ID de rol inválido" });
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const name = body.name != null ? String(body.name).trim().slice(0, 120) : null;
        const sortOrder = body.sortOrder != null || body.sort_order != null ? Number(body.sortOrder ?? body.sort_order) : null;
        try {
            const sets = [];
            const params = [];
            if (name) {
                params.push(name);
                sets.push(`name = $${params.length}`);
            }
            if (sortOrder != null && Number.isFinite(sortOrder)) {
                params.push(sortOrder);
                sets.push(`sort_order = $${params.length}`);
            }
            if (!sets.length) return res.status(400).json({ error: "Nada que actualizar" });
            params.push(id);
            const r = await pool.query(
                `UPDATE mcv_vital_roles SET ${sets.join(", ")} WHERE id = $${params.length}
                 RETURNING id, name, sort_order`,
                params
            );
            if (!r.rowCount) return res.status(404).json({ error: "Rol no encontrado" });
            return res.json({ ok: true, role: { id: r.rows[0].id, name: r.rows[0].name, sortOrder: r.rows[0].sort_order } });
        } catch (e) {
            console.error("vital roles patch:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo editar el rol" });
        }
    });

    app.delete("/api/admin/vital/roles/:id", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "ID de rol inválido" });
        try {
            const r = await pool.query(`DELETE FROM mcv_vital_roles WHERE id = $1 RETURNING id, name`, [id]);
            if (!r.rowCount) return res.status(404).json({ error: "Rol no encontrado" });
            return res.json({ ok: true, deleted: r.rows[0] });
        } catch (e) {
            console.error("vital roles delete:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo eliminar el rol" });
        }
    });

    app.get("/api/admin/vital/scoreboard", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const ready = await ensurePlayerInfoTable(pool);
        if (!ready) return res.status(503).json({ error: "No se pudo preparar player_info_profiles" });
        try {
            const r = await pool.query(
                `SELECT steam_id64, display_name, role_label, performance_score, status_tag
                 FROM player_info_profiles
                 ORDER BY performance_score DESC, display_name ASC NULLS LAST
                 LIMIT 200`
            );
            return res.json({
                players: r.rows.map((row) => normalizePlayerInfoRow(row)).filter(Boolean)
            });
        } catch (e) {
            console.error("vital scoreboard:", e.message);
            return res.status(500).json({ error: e.message || "Error al cargar puntajes" });
        }
    });

    app.get("/api/admin/vital/player-info/:steamId64/score-events", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const steamId64 = normalizeSteamId64(req.params.steamId64);
        if (!steamId64) return res.status(400).json({ error: "SteamID64 inválido" });
        const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 40));
        try {
            await ensureScoreEventsTable(pool);
            const r = await pool.query(
                `SELECT id, steam_id64, delta, reason, category, balance_after, created_at
                 FROM player_score_events
                 WHERE steam_id64 = $1
                 ORDER BY created_at DESC
                 LIMIT $2`,
                [steamId64, limit]
            );
            const prof = await pool.query(`SELECT performance_score FROM player_info_profiles WHERE steam_id64 = $1`, [steamId64]);
            return res.json({
                steamId64,
                performanceScore: prof.rowCount ? normalizePerformanceScore(prof.rows[0].performance_score) : 0,
                events: r.rows.map((row) => ({
                    id: row.id,
                    delta: row.delta,
                    reason: row.reason,
                    category: row.category,
                    balanceAfter: row.balance_after,
                    createdAt: row.created_at
                }))
            });
        } catch (e) {
            console.error("vital score events:", e.message);
            return res.status(500).json({ error: e.message || "Error al listar movimientos" });
        }
    });

    app.post("/api/admin/vital/player-info/:steamId64/score", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const steamId64 = normalizeSteamId64(req.params.steamId64);
        if (!steamId64) return res.status(400).json({ error: "SteamID64 inválido" });
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const delta = Number(body.delta);
        if (!Number.isFinite(delta) || delta === 0) {
            return res.status(400).json({ error: "Indicá un ajuste de puntos distinto de cero" });
        }
        try {
            const result = await applyPlayerScoreDelta(pool, steamId64, delta, body.reason, body.category);
            const profile = await pool.query(`SELECT * FROM player_info_profiles WHERE steam_id64 = $1`, [steamId64]);
            return res.json({
                ok: true,
                ...result,
                profile: profile.rowCount ? normalizePlayerInfoRow(profile.rows[0]) : null
            });
        } catch (e) {
            console.error("vital score adjust:", e.message);
            return res.status(e.message === "Jugador no encontrado en Info jugadores" ? 404 : 500).json({
                error: e.message || "No se pudo ajustar puntos"
            });
        }
    });

    app.post("/api/admin/vital/player-info/:steamId64/reset-score", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const steamId64 = normalizeSteamId64(req.params.steamId64);
        if (!steamId64) return res.status(400).json({ error: "SteamID64 inválido" });
        const body = req.body && typeof req.body === "object" ? req.body : {};
        try {
            await resetPlayerScore(pool, steamId64);
            const profile = await pool.query(`SELECT * FROM player_info_profiles WHERE steam_id64 = $1`, [steamId64]);
            return res.json({
                ok: true,
                steamId64,
                performanceScore: 0,
                profile: profile.rowCount ? normalizePlayerInfoRow(profile.rows[0]) : null
            });
        } catch (e) {
            console.error("vital reset player score:", e.message);
            return res.status(e.message === "Jugador no encontrado en Info jugadores" ? 404 : 500).json({
                error: e.message || "No se pudo reiniciar puntos"
            });
        }
    });

    app.delete("/api/admin/vital/score-events/:eventId", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const eventId = Number(req.params.eventId);
        if (!Number.isFinite(eventId) || eventId < 1) {
            return res.status(400).json({ error: "ID de movimiento inválido" });
        }
        try {
            await ensureScoreEventsTable(pool);
            const del = await pool.query(
                `DELETE FROM player_score_events WHERE id = $1 RETURNING steam_id64`,
                [eventId]
            );
            if (!del.rowCount) {
                return res.status(404).json({ error: "Movimiento no encontrado" });
            }
            const steamId64 = normalizeSteamId64(del.rows[0].steam_id64);
            const sum = await pool.query(
                `SELECT COALESCE(SUM(delta), 0)::numeric AS total FROM player_score_events WHERE steam_id64 = $1`,
                [steamId64]
            );
            const total = normalizePerformanceScore(sum.rows[0]?.total);
            await pool.query(`UPDATE player_info_profiles SET performance_score = $2, updated_at = NOW() WHERE steam_id64 = $1`, [
                steamId64,
                total
            ]);
            const profile = await pool.query(`SELECT * FROM player_info_profiles WHERE steam_id64 = $1`, [steamId64]);
            return res.json({
                ok: true,
                steamId64,
                performanceScore: total,
                profile: profile.rowCount ? normalizePlayerInfoRow(profile.rows[0]) : null
            });
        } catch (e) {
            console.error("vital delete score event:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo borrar el movimiento" });
        }
    });

    app.post("/api/admin/vital/reset-all-scores", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const ready = await ensurePlayerInfoTable(pool);
        if (!ready) return res.status(503).json({ error: "No se pudo preparar player_info_profiles" });
        try {
            await ensureScoreEventsTable(pool);
            await ensurePlayerExtraPointLinksTable(pool);
            const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM player_info_profiles`);
            await pool.query(`UPDATE player_info_profiles SET performance_score = 0, updated_at = NOW()`);
            await pool.query(`DELETE FROM player_score_events`);
            const extraPts = await pool.query(`DELETE FROM player_extra_point_links`);
            return res.json({
                ok: true,
                playersReset: countRes.rows[0]?.n || 0,
                extraPointsCleared: extraPts.rowCount || 0,
                message:
                    "Puntos reiniciados para todo el roster (puntaje, movimientos y puntos extra manuales)."
            });
        } catch (e) {
            console.error("vital reset all scores:", e.message);
            return res.status(500).json({ error: e.message || "No se pudieron reiniciar los puntos" });
        }
    });

    app.post("/api/admin/vital/reset-all-hours", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const ready = await ensurePlayerInfoTable(pool);
        if (!ready) return res.status(503).json({ error: "No se pudo preparar player_info_profiles" });
        try {
            const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM player_info_profiles`);
            const r = await pool.query(
                `UPDATE player_info_profiles SET hours_played = NULL, updated_at = NOW() RETURNING steam_id64`
            );
            return res.json({
                ok: true,
                playersReset: r.rowCount || countRes.rows[0]?.n || 0,
                message: "Horas borradas para todo el roster (nuevo wipe)."
            });
        } catch (e) {
            console.error("vital reset all hours:", e.message);
            return res.status(500).json({ error: e.message || "No se pudieron reiniciar las horas" });
        }
    });

    app.get("/api/admin/vital/tier-score-config", authAdmin, (req, res) => {
        const serverKey = String(req.query.server || "").trim();
        if (serverKey) {
            const resolved = resolveTierScoreConfig({ serverKey, at: new Date() });
            const cfg = listTierScoreConfigs().find((c) => c.key === resolved.configKey);
            if (!cfg) {
                return res.status(400).json({ error: "Servidor inválido (eu-medium o eu-monthly)" });
            }
            return res.json({
                config: cfg,
                resolved: {
                    serverKey: resolved.serverKey,
                    configKey: resolved.configKey,
                    configLabel: resolved.config.label,
                    period: resolved.period,
                    periodLabel: resolved.label,
                    at: resolved.at
                }
            });
        }
        return res.json({ configs: listTierScoreConfigs() });
    });

    app.get("/api/admin/vital/extra-points-catalog", authAdmin, (req, res) => {
        return res.json({ catalog: listExtraPointCatalog() });
    });

    app.get("/api/admin/vital/player-info/:steamId64/extra-points", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const steamId64 = normalizeSteamId64(req.params.steamId64);
        if (!steamId64) return res.status(400).json({ error: "SteamID64 inválido" });
        try {
            const countsMap = await loadExtraPointCountsMap(pool, [steamId64]);
            const extraCounts = countsMap.get(steamId64) || {};
            return res.json({
                steamId64,
                extraKeys: expandExtraKeysFromCounts(extraCounts),
                extraCounts
            });
        } catch (e) {
            console.error("extra-points get:", e.message);
            return res.status(500).json({ error: e.message || "Error al leer extras" });
        }
    });

    app.put("/api/admin/vital/player-info/:steamId64/extra-points", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const steamId64 = normalizeSteamId64(req.params.steamId64);
        if (!steamId64) return res.status(400).json({ error: "SteamID64 inválido" });
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const extraKeys = Array.isArray(body.extraKeys) ? body.extraKeys : [];
        const extraCounts = body.extraCounts && typeof body.extraCounts === "object" ? body.extraCounts : null;
        try {
            await ensurePlayerInfoTable(pool);
            const exists = await pool.query(`SELECT steam_id64 FROM player_info_profiles WHERE steam_id64 = $1`, [steamId64]);
            if (!exists.rowCount) {
                return res.status(404).json({ error: "Jugador no encontrado en Info jugadores" });
            }
            const saved = await syncPlayerExtraPointLinks(pool, steamId64, extraKeys, extraCounts);
            return res.json({ ok: true, steamId64, extraKeys: saved.extraKeys, extraCounts: saved.counts });
        } catch (e) {
            console.error("extra-points put:", e.message);
            return res.status(500).json({ error: e.message || "Error al guardar extras" });
        }
    });

    app.get("/api/admin/vital/compliance-report", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const scanDiscord =
            String(req.query.scanDiscord || req.query.discord || "").trim() === "1" ||
            String(req.query.scanDiscord || "").toLowerCase() === "true";
        try {
            const report = await buildComplianceReport(pool, {
                scanDiscord,
                discordClient: getDiscordClient?.(),
                playtimeChannelId: getPlaytimeChannelId?.(),
                maxMessages: Number(req.query.maxMessages) || 400
            });
            return res.json({ ok: true, report });
        } catch (e) {
            console.error("vital compliance-report:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo generar el reporte" });
        }
    });

    app.get("/api/admin/vital/player-info", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const ready = await ensurePlayerInfoTable(pool);
        if (!ready) return res.status(503).json({ error: "No se pudo preparar la tabla player_info_profiles" });
        try {
            const statusTag = String(req.query.status || "").trim();
            const q = String(req.query.q || "").trim().toLowerCase();
            const params = [];
            const where = [];
            if (statusTag) {
                params.push(normalizeStatusTag(statusTag));
                where.push(`status_tag = $${params.length}`);
            }
            if (q) {
                params.push(`%${q}%`);
                where.push(
                    `(LOWER(COALESCE(display_name, '')) LIKE $${params.length} OR LOWER(steam_id64) LIKE $${params.length} OR LOWER(COALESCE(vouch_by, '')) LIKE $${params.length})`
                );
            }
            const sql =
                `SELECT * FROM player_info_profiles` +
                (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
                ` ORDER BY updated_at DESC NULLS LAST, created_at DESC`;
            const r = await pool.query(sql, params);
            const profiles = r.rows.map(normalizePlayerInfoRow).filter(Boolean);
            const roleMap = await loadRoleLabelsMap(
                pool,
                profiles.map((p) => p.steamId64)
            );
            const extraCountsMap = await loadExtraPointCountsMap(
                pool,
                profiles.map((p) => p.steamId64)
            );
            profiles.forEach((p) => {
                const extra = roleMap.get(p.steamId64);
                if (extra && extra.length) {
                    p.roleLabels = extra;
                    p.roleLabel = extra.join(", ");
                }
                const extraCounts = extraCountsMap.get(p.steamId64) || {};
                p.extraCounts = extraCounts;
                p.extraKeys = expandExtraKeysFromCounts(extraCounts);
            });
            const avatarMap = await fetchSteamAvatarsBatch(profiles.map((p) => p.steamId64));
            profiles.forEach((p) => {
                p.avatarUrl = avatarMap.get(p.steamId64) || "";
            });
            return res.json({ profiles });
        } catch (e) {
            console.error("player-info list:", e.message);
            return res.status(500).json({ error: e.message || "Error listando player-info" });
        }
    });

    app.post("/api/admin/vital/player-info/bm-hours", authAdmin, async (req, res) => {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const steamId64 = normalizeSteamId64(body.steamId64 || body.steam_id64);
        let bmId = extractBattleMetricsId(body.bmId || body.bmUrl || body.battlemetricsUrl);
        if (!bmId && !steamId64) {
            return res.status(400).json({ error: "Pasá steamId64 o bmUrl" });
        }
        if (!BATTLEMETRICS_TOKEN) {
            return res.status(503).json({ error: "Falta BATTLEMETRICS_TOKEN para consultar horas en BattleMetrics" });
        }
        try {
            if (!bmId && steamId64) {
                const search = await axios.get(`https://api.battlemetrics.com/players?filter[search]=${steamId64}`, {
                    timeout: 12000,
                    headers: battlemetricsHeaders()
                });
                const first = Array.isArray(search.data?.data) ? search.data.data[0] : null;
                if (!first?.id) {
                    return res.status(404).json({ error: "No encontré player BM para ese SteamID64" });
                }
                bmId = String(first.id);
            }

            const [playerRes, relRes] = await Promise.allSettled([
                axios.get(`https://api.battlemetrics.com/players/${bmId}`, {
                    timeout: 12000,
                    headers: battlemetricsHeaders()
                }),
                axios.get(`https://api.battlemetrics.com/players/${bmId}/relationships/servers`, {
                    timeout: 12000,
                    headers: battlemetricsHeaders()
                })
            ]);

            const playerPayload = playerRes.status === "fulfilled" ? playerRes.value.data : null;
            const relPayload = relRes.status === "fulfilled" ? relRes.value.data : null;
            const candidates = [];
            collectNumericCandidates(playerPayload, candidates);
            collectNumericCandidates(relPayload, candidates);

            // BattleMetrics can expose time values in minutes or seconds; take plausible maxima.
            const sane = candidates.filter((n) => n > 0);
            const asHours = sane
                .map((n) => (n > 100000 ? n / 3600 : n > 2000 ? n / 60 : n))
                .filter((n) => Number.isFinite(n) && n > 0);
            const hours = asHours.length ? Math.round(Math.max(...asHours)) : null;

            if (!hours) {
                return res.status(404).json({
                    error: "BattleMetrics no devolvió horas jugadas en este momento",
                    bmId
                });
            }
            return res.json({ ok: true, bmId, hoursPlayed: hours });
        } catch (e) {
            const detail = e?.response?.data?.errors?.[0]?.detail || e?.message || "Error consultando BattleMetrics";
            return res.status(500).json({ error: detail });
        }
    });

    app.post("/api/admin/vital/player-info", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const ready = await ensurePlayerInfoTable(pool);
        if (!ready) return res.status(503).json({ error: "No se pudo preparar la tabla player_info_profiles" });
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const steamId64 = normalizeSteamId64(body.steamId64 || body.steam_id64);
        if (!steamId64) return res.status(400).json({ error: "SteamID64 inválido" });
        const incomingWipe = normalizeWipePhase(body.wipePhase);
        const pausedOutsideWipe = Boolean(body.pausedOutsideWipe) || incomingWipe === "no_juega";
        const roleLabels = parseRoleLabelsInput(body.roleLabels || body.roleLabel);
        const hoursResolved = resolvePlayerInfoHoursInput(body, null);
        const row = normalizePlayerInfoRow({
            steam_id64: steamId64,
            display_name: body.displayName,
            bm_url: body.bmUrl,
            status_tag: body.statusTag,
            role_label: roleLabels.length ? roleLabels.join(", ") : body.roleLabel,
            roleLabels,
            strikes: body.strikes,
            strike_notes: body.strikeNotes,
            entry_date: body.entryDate || null,
            vouch_by: body.vouchBy,
            wipe_phase: pausedOutsideWipe ? "no_juega" : incomingWipe,
            hours_played: hoursResolved.hasField ? hoursResolved.hoursPlayed : null,
            combats_lost: body.combatsLost,
            minis_lost: body.minisLost,
            contribution: body.contribution,
            warnings: body.warnings,
            mt_team: body.mtTeam,
            paused_outside_wipe: pausedOutsideWipe
        });
        try {
            const r = await pool.query(
                `INSERT INTO player_info_profiles (
                    steam_id64, display_name, bm_url, status_tag, role_label, strikes, strike_notes, entry_date, vouch_by, wipe_phase,
                    hours_played, combats_lost, minis_lost, contribution, warnings, mt_team, paused_outside_wipe, updated_at
                 ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW()
                 )
                 ON CONFLICT (steam_id64) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    bm_url = EXCLUDED.bm_url,
                    status_tag = EXCLUDED.status_tag,
                    role_label = EXCLUDED.role_label,
                    strikes = EXCLUDED.strikes,
                    strike_notes = EXCLUDED.strike_notes,
                    entry_date = EXCLUDED.entry_date,
                    vouch_by = EXCLUDED.vouch_by,
                    wipe_phase = EXCLUDED.wipe_phase,
                    hours_played = CASE WHEN $18 THEN EXCLUDED.hours_played ELSE player_info_profiles.hours_played END,
                    combats_lost = EXCLUDED.combats_lost,
                    minis_lost = EXCLUDED.minis_lost,
                    contribution = EXCLUDED.contribution,
                    warnings = EXCLUDED.warnings,
                    mt_team = EXCLUDED.mt_team,
                    paused_outside_wipe = EXCLUDED.paused_outside_wipe,
                    updated_at = NOW()
                 RETURNING *`,
                [
                    row.steamId64,
                    row.displayName || null,
                    row.bmUrl || null,
                    row.statusTag,
                    row.roleLabel || null,
                    row.strikes,
                    row.strikeNotes || null,
                    row.entryDate || null,
                    row.vouchBy || null,
                    row.wipePhase,
                    row.hoursPlayed,
                    row.combatsLost,
                    row.minisLost,
                    row.contribution || null,
                    row.warnings || null,
                    row.mtTeam,
                    row.pausedOutsideWipe,
                    hoursResolved.hasField
                ]
            );
            const savedRoles = await syncPlayerRoleLinks(pool, steamId64, roleLabels);
            const profile = normalizePlayerInfoRow(r.rows[0]);
            profile.roleLabels = savedRoles;
            profile.roleLabel = savedRoles.join(", ");
            return res.json({ ok: true, profile });
        } catch (e) {
            console.error("player-info upsert:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo guardar player-info" });
        }
    });

    app.post("/api/admin/vital/player-info/import", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const ready = await ensurePlayerInfoTable(pool);
        if (!ready) return res.status(503).json({ error: "No se pudo preparar la tabla player_info_profiles" });
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const rows = parsePlayerInfoImportText(body.text || body.csv || "");
        if (!rows.length) return res.status(400).json({ error: "No se detectaron filas válidas con SteamID64" });
        try {
            let saved = 0;
            for (const row of rows) {
                const importRoles = row.roleLabels && row.roleLabels.length ? row.roleLabels : parseRoleLabelsInput(row.roleLabel);
                if (importRoles.length) {
                    row.roleLabel = importRoles.join(", ");
                }
                await pool.query(
                    `INSERT INTO player_info_profiles (
                        steam_id64, display_name, bm_url, status_tag, role_label, strikes, strike_notes, entry_date, vouch_by, wipe_phase,
                        hours_played, combats_lost, minis_lost, contribution, warnings, mt_team, paused_outside_wipe, updated_at
                     ) VALUES (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW()
                     )
                     ON CONFLICT (steam_id64) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        bm_url = EXCLUDED.bm_url,
                        status_tag = EXCLUDED.status_tag,
                        role_label = EXCLUDED.role_label,
                        strikes = EXCLUDED.strikes,
                        strike_notes = EXCLUDED.strike_notes,
                        entry_date = EXCLUDED.entry_date,
                        vouch_by = EXCLUDED.vouch_by,
                        wipe_phase = EXCLUDED.wipe_phase,
                        hours_played = EXCLUDED.hours_played,
                        combats_lost = EXCLUDED.combats_lost,
                        minis_lost = EXCLUDED.minis_lost,
                        contribution = EXCLUDED.contribution,
                        warnings = EXCLUDED.warnings,
                        mt_team = EXCLUDED.mt_team,
                        paused_outside_wipe = EXCLUDED.paused_outside_wipe,
                        updated_at = NOW()`,
                    [
                        row.steamId64,
                        row.displayName || null,
                        row.bmUrl || null,
                        row.statusTag,
                        row.roleLabel || null,
                        row.strikes,
                        row.strikeNotes || null,
                        row.entryDate || null,
                        row.vouchBy || null,
                        row.wipePhase,
                        row.hoursPlayed,
                        row.combatsLost,
                        row.minisLost,
                        row.contribution || null,
                        row.warnings || null,
                        row.mtTeam,
                        row.pausedOutsideWipe
                    ]
                );
                await syncPlayerRoleLinks(pool, row.steamId64, importRoles);
                saved += 1;
            }
            return res.json({ ok: true, imported: saved });
        } catch (e) {
            console.error("player-info import:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo importar player-info" });
        }
    });

    app.delete("/api/admin/vital/player-info/:steamId64", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const steamId64 = normalizeSteamId64(req.params.steamId64);
        if (!steamId64) return res.status(400).json({ error: "SteamID64 inválido" });
        try {
            await pool.query(`DELETE FROM player_info_role_links WHERE steam_id64 = $1`, [steamId64]).catch(() => {});
            const r = await pool.query(`DELETE FROM player_info_profiles WHERE steam_id64 = $1 RETURNING steam_id64`, [steamId64]);
            if (!r.rowCount) return res.status(404).json({ error: "No existe ese SteamID en player-info" });
            return res.json({ ok: true, steamId64 });
        } catch (e) {
            console.error("player-info delete:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo eliminar player-info" });
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
                    message:
                        "Sin SteamID64 en Info jugadores (activos en wipe), lista wipe, roster aprobado ni extras manuales."
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
            matched.sort((a, b) => b.killsT30 - a.killsT30 || b.kills - a.kills || b.kdr - a.kdr);

            const hint =
                clanIds.length && !matched.length
                    ? "Vital no devolvió filas para este wipe/servidor. Probá el wipe ★ actual, otro servidor (Monthly/Medium), o agregá el SteamID64 en extras manuales."
                    : null;

            return res.json({
                server,
                wipeId,
                rosterSize: clanIds.length,
                mcvCount: roster.mcvCount,
                playerInfoCount: roster.playerInfoCount || 0,
                manualCount: roster.manualOnlyCount,
                players: matched,
                notFound,
                hint,
                vitalIncludes: parsePlayerIncludes(),
                vitalCache: buildVitalCacheMeta()
            });
        } catch (e) {
            console.error("vital clan:", e.message);
            return res.status(502).json({ error: e.message || "Error Vital", hint: "Revisá paths y headers en Render" });
        }
    });

    app.get("/api/public/vital/status", (req, res) => {
        const configured = isVitalPublicConfigured();
        return res.json({
            enabled: vitalEnabled() && configured,
            linkAccess: configured,
            hint: configured
                ? null
                : "Definí VITAL_PUBLIC_ACCESS_KEY en Render (mín. 12 caracteres) y redeploy del backend."
        });
    });

    async function probeVitalApiQuick() {
        if (!vitalEnabled()) {
            return { ok: false, error: "Vital API deshabilitada (VITAL_API_ENABLED=0)" };
        }
        const paths = apiPaths();
        if (!paths.wipes || !paths.playersOverviewPost) {
            return { ok: false, error: "Faltan paths de Vital en el servidor" };
        }
        const server = resolveServer(DEFAULT_SERVER_KEY);
        if (!server?.configured) {
            return { ok: false, error: "Servidor Vital por defecto sin serverId" };
        }
        try {
            const url = fillTemplate(paths.wipes, buildVars(server.serverId, "null", 1, 1));
            const { data, cached } = await fetchUpstream(url);
            const wipes = extractWipesList(data);
            return {
                ok: true,
                cached,
                wipeCount: wipes.length,
                serverKey: server.key
            };
        } catch (e) {
            return { ok: false, error: e.message || "Error al consultar Vital" };
        }
    }

    app.post("/api/admin/vital/tier-scores/preview", authAdmin, async (req, res) => {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const serverKey = String(req.query.server || body.server || DEFAULT_SERVER_KEY).trim();
        const wipeIdRaw = String(req.query.wipeId || body.wipeId || "current").trim();
        const refresh = String(req.query.refresh || body.refresh || "").trim() === "1";
        try {
            const payload = await fetchTierScoresPayload(getPool, { serverKey, wipeIdRaw, refresh });
            return res.json({ ok: true, preview: true, ...payload });
        } catch (e) {
            console.error("vital tier preview:", e.message);
            return res.status(e.message.includes("inválid") ? 400 : 502).json({ error: e.message || "Error al calcular tiers" });
        }
    });

    app.post("/api/admin/vital/tier-scores/apply", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no configurada" });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const serverKey = String(req.query.server || body.server || DEFAULT_SERVER_KEY).trim();
        const wipeIdRaw = String(req.query.wipeId || body.wipeId || "current").trim();
        const refresh = String(req.query.refresh || body.refresh || "").trim() === "1";
        try {
            const payload = await fetchTierScoresPayload(getPool, { serverKey, wipeIdRaw, refresh });
            const applyResult = await applyTierScoreResults(pool, payload.tierResult, {
                serverLabel: payload.tierResult.serverLabel
            });
            return res.json({
                ok: true,
                applied: applyResult.applied,
                skipped: applyResult.skipped,
                skippedNoWipe: applyResult.skippedNoWipe,
                server: payload.server,
                wipeId: payload.wipeId,
                rosterSize: payload.rosterSize,
                vitalMatched: payload.vitalMatched,
                scoredPlayers: payload.scoredPlayers,
                notFound: payload.notFound,
                resolved: payload.resolved,
                tierResult: payload.tierResult,
                vitalCache: payload.vitalCache
            });
        } catch (e) {
            console.error("vital tier apply:", e.message);
            return res.status(e.message.includes("inválid") ? 400 : 502).json({ error: e.message || "Error al aplicar tiers" });
        }
    });

    app.get("/api/admin/vital/health", authAdmin, async (req, res) => {
        const pool = getPool();
        let database = { ok: false, error: "DATABASE_URL no configurada" };
        if (pool) {
            try {
                await pool.query("SELECT 1");
                database = { ok: true };
            } catch (e) {
                database = { ok: false, error: e.message || "Error de BD" };
            }
        }
        const paths = apiPaths();
        const vitalProbe = await probeVitalApiQuick();
        let roster = { size: 0, playerInfoCount: 0, manualExtraCount: 0 };
        try {
            roster = await loadClanSteamIds(getPool);
        } catch (e) {
            roster.error = e.message;
        }
        return res.json({
            ok: database.ok && vitalEnabled() && Boolean(paths.playersOverviewPost),
            database,
            vitalApi: {
                enabled: vitalEnabled(),
                configured: Boolean(paths.playersOverviewPost && paths.overview),
                reachable: vitalProbe.ok,
                detail: vitalProbe.ok ? vitalProbe : { error: vitalProbe.error }
            },
            publicAccess: {
                configured: isVitalPublicConfigured()
            },
            roster: {
                size: roster.ids?.length || 0,
                playerInfoCount: roster.playerInfoCount || 0,
                manualExtraCount: roster.manualOnlyCount || 0
            },
            vitalCache: buildVitalCacheMeta()
        });
    });

    app.post("/api/admin/vital/sync-display-names", authAdmin, async (req, res) => {
        if (!vitalEnabled()) {
            return res.status(503).json({ error: "Vital API deshabilitada" });
        }
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no configurada" });
        }
        const ready = await ensurePlayerInfoTable(pool);
        if (!ready) {
            return res.status(503).json({ error: "No se pudo preparar player_info_profiles" });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const server = resolveServer(req.query.server || body.server || DEFAULT_SERVER_KEY);
        if (!server?.configured) {
            return res.status(503).json({ error: "Servidor Vital inválido o sin serverId" });
        }
        let wipeId = String(req.query.wipeId || body.wipeId || "").trim();
        const paths = apiPaths();
        if (!paths.playersOverviewPost) {
            return res.status(503).json({ error: "Sin VITAL_API_PLAYERS_OVERVIEW_POST" });
        }
        if (!wipeId || wipeId === "current") {
            wipeId = (await resolveCurrentWipeId(paths, server.serverId)) || "null";
        }
        try {
            const roster = await loadClanSteamIds(getPool);
            const clanIds = roster.ids;
            if (!clanIds.length) {
                return res.json({ ok: true, updated: 0, skipped: 0, message: "Roster vacío" });
            }
            const refresh = String(req.query.refresh || body.refresh || "").trim() === "1";
            if (refresh) {
                for (const k of [...cache.keys()]) {
                    if (k.startsWith("POST ")) {
                        cache.delete(k);
                    }
                }
            }
            const matched = await fetchClanPlayersPost(paths, server.serverId, wipeId, clanIds, { refresh });
            const bySteam = new Map(matched.map((p) => [p.steamId64, p]));
            const emptyRes = await pool.query(
                `SELECT steam_id64, display_name FROM player_info_profiles
                 WHERE steam_id64 = ANY($1::varchar[])
                   AND (display_name IS NULL OR BTRIM(display_name) = '')`,
                [clanIds]
            );
            let updated = 0;
            let skipped = 0;
            for (const row of emptyRes.rows) {
                const sid = normalizeSteamId64(row.steam_id64);
                const vital = bySteam.get(sid);
                const name = String(vital?.name || "").trim();
                if (!sid || !name) {
                    skipped += 1;
                    continue;
                }
                await pool.query(
                    `UPDATE player_info_profiles SET display_name = $2, updated_at = NOW() WHERE steam_id64 = $1`,
                    [sid, name.slice(0, 120)]
                );
                updated += 1;
            }
            return res.json({
                ok: true,
                server,
                wipeId,
                updated,
                skipped,
                vitalPlayers: matched.length,
                vitalCache: buildVitalCacheMeta()
            });
        } catch (e) {
            console.error("vital sync-display-names:", e.message);
            return res.status(502).json({ error: e.message || "Error al sincronizar nombres" });
        }
    });

    app.get("/api/admin/vital/public-access", authAdmin, async (req, res) => {
        const configured = isVitalPublicConfigured();
        let roster = { ids: [], mcvCount: 0, manualOnlyCount: 0 };
        try {
            roster = await loadClanSteamIds(getPool);
        } catch (e) {
            console.warn("vital public-access roster:", e.message);
        }
        const origin = String(req.headers["x-forwarded-host"] || req.get("host") || "").trim();
        const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
        const siteBase = origin ? `${proto}://${origin}`.replace(/\/$/, "") : "";
        return res.json({
            configured,
            publicPath: "/vital-rust.html",
            publicUrl: siteBase ? `${siteBase}/vital-rust.html` : "vital-rust.html",
            rosterSize: roster.ids.length,
            mcvCount: roster.mcvCount,
            playerInfoCount: roster.playerInfoCount || 0,
            manualExtraCount: roster.manualOnlyCount,
            hint: configured
                ? "Compartí el link con ?key= y la misma clave que VITAL_PUBLIC_ACCESS_KEY en Render."
                : "Falta VITAL_PUBLIC_ACCESS_KEY en Render (mín. 12 caracteres). Sin eso la página pública responde 503."
        });
    });

    app.get("/api/public/vital/config", authVitalPublic, (req, res) => {
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
            cacheTtlSec: cacheTtlMs() / 1000,
            disclaimer:
                "Estadísticas del clan MCV vía Vital Rust (API no oficial). Solo lectura; los datos pueden demorar en actualizarse.",
            publicView: true
        });
    });

    app.get("/api/public/vital/wipes", authVitalPublic, async (req, res) => {
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
            wipes.sort(function (a, b) {
                if (a.current !== b.current) return a.current ? -1 : 1;
                return (b.startMs || 0) - (a.startMs || 0);
            });
            return res.json({ server, wipes, cached });
        } catch (e) {
            console.error("vital public wipes:", e.message);
            return res.status(502).json({ error: e.message || "Error al listar wipes" });
        }
    });

    app.get("/api/public/vital/clan", authVitalPublic, async (req, res) => {
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
            const manualOnlySet = new Set(roster.manualIds);
            if (!clanIds.length) {
                return res.json({
                    server,
                    wipeId,
                    rosterSize: 0,
                    players: [],
                    notFound: [],
                    message: "Sin jugadores en el roster del clan."
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
            matched.sort((a, b) => b.killsT30 - a.killsT30 || b.kills - a.kills || b.kdr - a.kdr);
            const hint =
                clanIds.length && !matched.length
                    ? "Vital no devolvió filas para este wipe/servidor. Probá el wipe actual u otro servidor."
                    : null;
            return res.json({
                server,
                wipeId,
                rosterSize: clanIds.length,
                playerInfoCount: roster.playerInfoCount || 0,
                players: matched,
                notFound,
                hint,
                vitalCache: buildVitalCacheMeta()
            });
        } catch (e) {
            console.error("vital public clan:", e.message);
            return res.status(502).json({ error: e.message || "Error Vital" });
        }
    });

    app.get("/api/auth/user/vital-stats", authUser, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        if (!vitalEnabled()) {
            return res.json({
                configured: false,
                steamLinked: false,
                player: null,
                message: "Stats de Vital no disponibles en este momento."
            });
        }
        try {
            const userRow = await getSiteUserById(pool, req.userAuth.userId);
            const steamId = normalizeSteamId64(userRow?.steam_id64);
            if (!steamId) {
                return res.json({
                    configured: true,
                    steamLinked: false,
                    player: null,
                    message: "Iniciá sesión con Steam para ver tus stats en Vital."
                });
            }
            const paths = apiPaths();
            if (!paths.playersOverviewPost) {
                return res.json({
                    configured: false,
                    steamLinked: true,
                    player: null,
                    message: "API de Vital sin configurar en el servidor."
                });
            }
            const preferred = String(req.query.server || DEFAULT_SERVER_KEY).trim();
            const serverKeys = [
                ...new Set([preferred, ...parseServers().map((s) => s.key).filter(Boolean)])
            ];
            let found = null;
            for (const sk of serverKeys) {
                const srv = resolveServer(sk);
                if (!srv?.configured) {
                    continue;
                }
                const wipeCandidates = [];
                let currentWipe = null;
                if (String(req.query.wipeId || "").trim() && String(req.query.wipeId).trim() !== "current") {
                    wipeCandidates.push(String(req.query.wipeId).trim());
                } else {
                    currentWipe = (await resolveCurrentWipeId(paths, srv.serverId)) || null;
                    if (currentWipe) {
                        wipeCandidates.push(currentWipe);
                    }
                    wipeCandidates.push("null");
                }
                for (const wipeId of wipeCandidates) {
                    const matched = await fetchClanPlayersPost(paths, srv.serverId, wipeId, [steamId], {});
                    if (matched[0]) {
                        found = { server: srv, wipeId, player: matched[0] };
                        break;
                    }
                }
                if (found) {
                    break;
                }
            }
            const roster = await loadClanSteamIds(getPool);
            const inClanRoster = roster.ids.includes(steamId);
            if (found) {
                return res.json({
                    configured: true,
                    steamLinked: true,
                    steamId64: steamId,
                    server: { key: found.server.key, label: found.server.label, serverId: found.server.serverId },
                    wipeId: found.wipeId,
                    player: found.player,
                    inClanRoster,
                    vitalPublicConfigured: isVitalPublicConfigured(),
                    message: null
                });
            }
            const fallbackServer = resolveServer(preferred) || resolveServer(DEFAULT_SERVER_KEY);
            return res.json({
                configured: true,
                steamLinked: true,
                steamId64: steamId,
                server: fallbackServer
                    ? { key: fallbackServer.key, label: fallbackServer.label, serverId: fallbackServer.serverId }
                    : null,
                wipeId: null,
                player: null,
                inClanRoster,
                vitalPublicConfigured: isVitalPublicConfigured(),
                message:
                    "No hay stats de Vital para tu Steam en los servidores MCV (EU Monthly / EU Medium). Jugá en wipe activo o revisá más tarde."
            });
        } catch (e) {
            console.error("GET /api/auth/user/vital-stats:", e.message);
            return res.status(502).json({ error: e.message || "Error al cargar stats Vital" });
        }
    });
}

module.exports = {
    registerVitalRustApi,
    authVitalPublic,
    vitalPublicAccessKey,
    isVitalPublicConfigured,
    ensurePlayerInfoTable,
    loadClanSteamIds,
    normalizeSteamId64,
    normalizePlayerStatCount,
    resolvePlayerInfoHoursInput,
    buildVitalCacheMeta,
    buildingTotalFromVital,
    fetchTierScoresPayload
};
