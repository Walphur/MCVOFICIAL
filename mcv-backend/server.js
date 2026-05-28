"use strict";

require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { getPool, initDb } = require("./db");
const { registerTournamentApi } = require("./tournamentApi");
const {
    registerWipeListApi,
    attachWipeListDiscord,
    attachWipeListMessageHook,
    upsertWipeFromHexaytronChannel,
    applyEnvWipeSteamImport
} = require("./wipeList");
const { registerTeamRosterApi } = require("./teamRoster");
const { registerTicketsApi } = require("./ticketsApi");
const { registerYoutubeFeedApi } = require("./youtubeFeed");
const { registerTiktokFeedApi } = require("./tiktokFeed");
const { registerVitalRustApi } = require("./vitalRustApi");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = path.join(__dirname, "..");
/** Pósteres y subidas: en Render sin disco persistente usar MCV_UPLOAD_ROOT apuntando a un volume montado. */
const MCV_UPLOAD_ROOT_ENV = String(process.env.MCV_UPLOAD_ROOT || "").trim();
const UPLOAD_ROOT = MCV_UPLOAD_ROOT_ENV ? path.resolve(MCV_UPLOAD_ROOT_ENV) : path.join(ROOT_DIR, "uploads");
try {
    fs.mkdirSync(path.join(UPLOAD_ROOT, "tournaments"), { recursive: true });
} catch (e) {
    console.warn("MCV uploads dir:", e.message);
}
if (MCV_UPLOAD_ROOT_ENV) {
    console.log(`Uploads en disco persistente: ${UPLOAD_ROOT}`);
}

/**
 * CORS: refleja cualquier Origin http(s) válido (equivalente a cors `origin: true`).
 * La API no usa cookies cross-site; login va por JSON + JWT en storage.
 * Lista blanca opcional: CORS_STRICT=1 + CORS_ORIGINS (coma) para restringir.
 */
function parseStrictOrigins() {
    const set = new Set([
        "https://mcvoficial.com",
        "https://www.mcvoficial.com",
        "http://mcvoficial.com",
        "http://www.mcvoficial.com"
    ]);
    String(process.env.CORS_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((o) => {
            try {
                if (o.startsWith("http://") || o.startsWith("https://")) {
                    set.add(new URL(o.replace(/\/$/, "")).origin);
                } else {
                    set.add(o);
                }
            } catch (_) {
                /* ignore */
            }
        });
    for (const key of ["PUBLIC_API_URL", "RENDER_EXTERNAL_URL"]) {
        const raw = String(process.env[key] || "").trim();
        if (!raw) continue;
        try {
            set.add(new URL(raw.replace(/\/$/, "")).origin);
        } catch (_) {
            /* ignore */
        }
    }
    return set;
}

const STRICT_CORS = String(process.env.CORS_STRICT || "").trim() === "1";
const STRICT_ORIGINS = parseStrictOrigins();

function applyCors(req, res) {
    const origin = String(req.headers.origin || "").trim();
    let allow = false;
    if (origin && /^https?:\/\/.+/i.test(origin)) {
        if (!STRICT_CORS) {
            allow = true;
        } else if (STRICT_ORIGINS.has(origin)) {
            allow = true;
        }
    }
    if (allow) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    const reqHdr = req.headers["access-control-request-headers"];
    res.setHeader(
        "Access-Control-Allow-Headers",
        reqHdr || "Content-Type, Authorization, X-Requested-With"
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Max-Age", "86400");
}

app.use((req, res, next) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }
    next();
});

app.use(express.json());

const STEAM_API_KEY = String(process.env.STEAM_API_KEY || "").trim();
const DISCORD_WEBHOOK = String(process.env.DISCORD_WEBHOOK || process.env.DISCORD_WEBHOOK_URL || "").trim();
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const DISCORD_LOOKUP_CHANNEL_ID = process.env.DISCORD_LOOKUP_CHANNEL_ID || "";
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const HEXAYTRON_BOT_ID = process.env.HEXAYTRON_BOT_ID || "";
const DISCORD_WIPE_REGISTER_CHANNEL_ID = String(process.env.DISCORD_WIPE_REGISTER_CHANNEL_ID || "").trim();
const BATTLEMETRICS_TOKEN = String(process.env.BATTLEMETRICS_TOKEN || "").trim();

/** BattleMetrics JSON API: el token JWT mejora límites y acceso; sin token algunos endpoints siguen públicos limitados. */
function battlemetricsHeaders() {
    const h = {
        Accept: "application/vnd.api+json"
    };
    if (BATTLEMETRICS_TOKEN) {
        h.Authorization = `Bearer ${BATTLEMETRICS_TOKEN}`;
    }
    return h;
}

registerTournamentApi(app, {
    getPool,
    steamApiKey: STEAM_API_KEY,
    uploadRoot: UPLOAD_ROOT
});

registerWipeListApi(app, {
    getPool,
    steamApiKey: STEAM_API_KEY
});

registerTeamRosterApi(app, {
    getPool,
    steamApiKey: STEAM_API_KEY
});

registerTicketsApi(app, { getPool });

registerVitalRustApi(app, { getPool });

registerYoutubeFeedApi(app);
registerTiktokFeedApi(app);

const cache = new Map();
const CACHE_TIME = 1000 * 60 * 10;

const discordBMCache = new Map();

function getCache(id) {
    const data = cache.get(id);
    if (!data) {
        return null;
    }

    if (Date.now() - data.timestamp > CACHE_TIME) {
        cache.delete(id);
        return null;
    }

    return data.value;
}

function setCache(id, value) {
    cache.set(id, {
        value,
        timestamp: Date.now()
    });
}

function setDiscordBM(steamId, bmId) {
    discordBMCache.set(steamId, bmId);

    const cached = getCache(steamId);
    if (cached) {
        cached.bmId = bmId;
        cached.bmUrl = `https://www.battlemetrics.com/players/${bmId}`;
        setCache(steamId, cached);
    }
}

function getDiscordBM(steamId) {
    return discordBMCache.get(steamId) || null;
}

function calcularScore({ horas, vacBans, gameBans, kdr, headshotPct }) {
    let score = 0;

    if (vacBans > 0) {
        score += 80;
    }
    if (gameBans > 0) {
        score += 50;
    }

    if (typeof horas === "number" && horas < 200) {
        score += 25;
    }
    if (typeof horas === "number" && horas < 100) {
        score += 40;
    }

    if (Number(kdr) > 3) {
        score += 20;
    }
    if (Number(kdr) > 5) {
        score += 35;
    }

    if (Number(headshotPct) > 40) {
        score += 15;
    }
    if (Number(headshotPct) > 60) {
        score += 30;
    }

    return Math.min(score, 100);
}

function parseHexaytronMessage(message) {
    const raw = messageToSearchableRaw(message);

    const steamMatch = raw.match(/\b\d{17}\b/);

    const bmMatch =
        raw.match(/battlemetrics\.com\/players\/(\d+)/i) ||
        raw.match(/battlemetrics\.com\/rcon\/players\/(\d+)/i);

    if (!steamMatch || !bmMatch) {
        if (message.author?.tag?.toLowerCase().includes("hexaytron")) {
            console.log("DEBUG Hexaytron sin match:");
            console.log(raw);
        }

        return null;
    }

    return {
        steamId: steamMatch[0],
        bmId: bmMatch[1]
    };
}

/** Texto buscable de un mensaje (contenido + embeds + componentes). */
function messageToSearchableRaw(message) {
    const parts = [];

    parts.push(message.content || "");

    for (const embed of message.embeds || []) {
        const json = embed.toJSON();

        parts.push(JSON.stringify(json));

        if (json.title) {
            parts.push(json.title);
        }
        if (json.description) {
            parts.push(json.description);
        }
        if (json.url) {
            parts.push(json.url);
        }

        if (json.author?.name) {
            parts.push(json.author.name);
        }
        if (json.author?.url) {
            parts.push(json.author.url);
        }

        if (json.fields) {
            for (const field of json.fields) {
                parts.push(field.name || "");
                parts.push(field.value || "");
            }
        }
    }

    for (const row of message.components || []) {
        if (typeof row.toJSON === "function") {
            parts.push(JSON.stringify(row.toJSON()));
        }
    }

    return parts.join("\n");
}

/**
 * Si el mensaje menciona este SteamID64 y un link de BattleMetrics, devuelve el id BM.
 * Sirve para releer el canal cuando la API de BM no resuelve por Steam.
 */
function extractBmIdForSteamMessage(message, steamId) {
    if (!steamId || !/^\d{17}$/.test(String(steamId))) {
        return null;
    }
    const raw = messageToSearchableRaw(message);
    if (!new RegExp(`\\b${steamId}\\b`).test(raw)) {
        return null;
    }
    const bmMatch =
        raw.match(/battlemetrics\.com\/players\/(\d+)/i) ||
        raw.match(/battlemetrics\.com\/rcon\/players\/(\d+)/i);
    return bmMatch ? bmMatch[1] : null;
}

/**
 * Busca en los últimos mensajes del canal de lookup si Hexaytron (u otro) ya publicó el link BM para este Steam.
 */
async function resolveBmFromChannelHistory(steamId) {
    if (!steamId || !discordClient.isReady() || !DISCORD_LOOKUP_CHANNEL_ID) {
        return null;
    }
    try {
        const channel = await discordClient.channels.fetch(DISCORD_LOOKUP_CHANNEL_ID).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return null;
        }
        const msgs = await channel.messages.fetch({ limit: 100 });
        const sorted = [...msgs.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
        for (const m of sorted) {
            if (HEXAYTRON_BOT_ID && m.author?.bot && m.author.id !== HEXAYTRON_BOT_ID) {
                continue;
            }
            const bmId = extractBmIdForSteamMessage(m, steamId);
            if (bmId) {
                console.log(`BM desde historial Discord (${m.author?.tag || "?"}): ${steamId} -> ${bmId}`);
                setDiscordBM(steamId, bmId);
                return bmId;
            }
        }
    } catch (e) {
        console.log("resolveBmFromChannelHistory:", e.message);
    }
    return null;
}

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel]
});

async function syncWipeRegisterChannelHistory() {
    const cid = DISCORD_WIPE_REGISTER_CHANNEL_ID;
    if (!cid || !discordClient.isReady()) {
        return;
    }
    const poolW = getPool();
    if (!poolW) {
        return;
    }
    try {
        const ch = await discordClient.channels.fetch(cid).catch(() => null);
        if (!ch || !ch.isTextBased()) {
            return;
        }
        let before;
        let imported = 0;
        let scanned = 0;
        const maxScan = 400;
        const maxImport = 100;
        while (scanned < maxScan && imported < maxImport) {
            const batch = await ch.messages.fetch({ limit: 100, before });
            if (!batch.size) {
                break;
            }
            const arr = [...batch.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            for (const m of arr) {
                scanned += 1;
                if (!m.author?.bot) {
                    continue;
                }
                if (HEXAYTRON_BOT_ID && m.author.id !== HEXAYTRON_BOT_ID) {
                    continue;
                }
                const raw = messageToSearchableRaw(m);
                const sm = raw.match(/\b\d{17}\b/);
                if (!sm) {
                    continue;
                }
                await upsertWipeFromHexaytronChannel(poolW, {
                    steamApiKey: STEAM_API_KEY,
                    steamId64: sm[0],
                    botTag: m.author?.tag || m.author?.username || ""
                });
                imported += 1;
                if (imported >= maxImport) {
                    break;
                }
            }
            before = batch.last()?.id;
            if (batch.size < 100) {
                break;
            }
        }
        if (imported) {
            console.log(`Wipe: ${imported} filas desde historial del canal de registro (${cid}).`);
        }
    } catch (e) {
        console.warn("syncWipeRegisterChannelHistory:", e.message);
    }
}

discordClient.on("ready", () => {
    console.log(`Discord bot conectado como ${discordClient.user.tag}`);
    syncWipeRegisterChannelHistory().catch((e) => console.warn("sync wipe canal:", e.message));
});

async function handleBotMessage(message) {
    try {
        if (message.partial) {
            message = await message.fetch();
        }

        if (!message.author?.bot) {
            return;
        }

        if (discordClient.user && message.author.id === discordClient.user.id) {
            return;
        }

        if (HEXAYTRON_BOT_ID && message.author.id !== HEXAYTRON_BOT_ID) {
            return;
        }

        if (DISCORD_WIPE_REGISTER_CHANNEL_ID && message.channelId === DISCORD_WIPE_REGISTER_CHANNEL_ID) {
            const rawWipe = messageToSearchableRaw(message);
            const steamW = rawWipe.match(/\b\d{17}\b/);
            if (steamW) {
                const poolW = getPool();
                if (poolW) {
                    await upsertWipeFromHexaytronChannel(poolW, {
                        steamApiKey: STEAM_API_KEY,
                        steamId64: steamW[0],
                        botTag: message.author?.tag || message.author?.username || ""
                    }).catch((e) => console.warn("Import wipe desde canal Hexaytron:", e.message));
                }
            }
        }

        const parsed = parseHexaytronMessage(message);

        if (!parsed) {
            console.log(`Mensaje bot detectado pero sin BM parseable: ${message.author.tag}`);
            return;
        }

        setDiscordBM(parsed.steamId, parsed.bmId);

        console.log(`BM guardado desde Hexaytron: ${parsed.steamId} -> ${parsed.bmId}`);
    } catch (err) {
        console.log("Error leyendo Hexaytron:", err.message);
    }
}

discordClient.on("messageCreate", handleBotMessage);

discordClient.on("messageUpdate", async (oldMessage, newMessage) => {
    await handleBotMessage(newMessage);
});

if (DISCORD_BOT_TOKEN && DISCORD_BOT_TOKEN !== "TOKEN_DE_TU_BOT") {
    attachWipeListDiscord(discordClient, {
        getPool,
        steamApiKey: STEAM_API_KEY,
        guildId: DISCORD_GUILD_ID
    });
    attachWipeListMessageHook(discordClient, {
        getPool,
        steamApiKey: STEAM_API_KEY,
        channelId: DISCORD_WIPE_REGISTER_CHANNEL_ID
    });
    discordClient.login(DISCORD_BOT_TOKEN).catch((e) => {
        console.warn("Discord bot login falló:", e.message);
    });
} else {
    console.warn("DISCORD_BOT_TOKEN no configurado: bot inactivo");
}

async function enviarDiscord(jugador) {
    try {
        if (!DISCORD_WEBHOOK || DISCORD_WEBHOOK === "TU_DISCORD_WEBHOOK_OPCIONAL") {
            return;
        }

        const embed = {
            embeds: [
                {
                    title: `MCV Scan - ${jugador.nombre}`,
                    color:
                        jugador.riskScore >= 60 ? 16711680 : jugador.riskScore >= 30 ? 16753920 : 5763719,
                    thumbnail: { url: jugador.avatar },
                    fields: [
                        { name: "SteamID", value: jugador.steamId },
                        { name: "Horas", value: String(jugador.horas), inline: true },
                        { name: "K/D", value: String(jugador.kdr), inline: true },
                        { name: "HS%", value: jugador.headshotPct + "%", inline: true },
                        { name: "Bans", value: `VAC: ${jugador.vacBans} | Game: ${jugador.gameBans}` },
                        { name: "Risk Score", value: jugador.riskScore + "/100" },
                        {
                            name: "Links",
                            value: `[Steam](https://steamcommunity.com/profiles/${jugador.steamId}) | ${
                                jugador.bmId
                                    ? `[BattleMetrics](https://www.battlemetrics.com/players/${jugador.bmId})`
                                    : `[Buscar BM](https://www.battlemetrics.com/players?filter[search]=${jugador.steamId})`
                            }`
                        }
                    ],
                    footer: { text: "MCV Anti-Cheat" },
                    timestamp: new Date().toISOString()
                }
            ]
        };

        await axios.post(DISCORD_WEBHOOK, embed);
    } catch (err) {
        console.log("Discord webhook error:", err.message);
    }
}

async function getRustRecentHours(steamId) {
    if (!STEAM_API_KEY) {
        return { rust2WeeksMinutes: null, rust2WeeksHours: null };
    }
    try {
        const { data } = await axios.get(
            `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/`,
            {
                timeout: 12000,
                params: {
                    key: STEAM_API_KEY,
                    steamid: steamId,
                    format: "json"
                }
            }
        );

        const games = data.response?.games || [];
        const rust = games.find((g) => g.appid === 252490);

        if (!rust) {
            return {
                rust2WeeksMinutes: 0,
                rust2WeeksHours: 0
            };
        }

        const minutes = rust.playtime_2weeks || 0;

        return {
            rust2WeeksMinutes: minutes,
            rust2WeeksHours: Math.round(minutes / 60)
        };
    } catch (err) {
        console.log("Steam recent games error:", err.message);

        return {
            rust2WeeksMinutes: null,
            rust2WeeksHours: null
        };
    }
}

async function getBattleMetricsServers(bmId) {
    if (!bmId) {
        return [];
    }

    try {
        const { data } = await axios.get(`https://api.battlemetrics.com/players/${bmId}/relationships/servers`, {
            timeout: 12000,
            headers: battlemetricsHeaders()
        });

        const included = data.included || [];
        const dataServers = data.data || [];

        const servers = included.length > 0 ? included : dataServers;

        return servers.slice(0, 10).map((server) => ({
            id: server.id,
            name: server.attributes?.name || "Servidor desconocido",
            address: server.attributes?.address || null,
            port: server.attributes?.port || null,
            players: server.attributes?.players ?? null,
            maxPlayers: server.attributes?.maxPlayers ?? null,
            rank: server.attributes?.rank ?? null,
            status: server.attributes?.status || null,
            country: server.attributes?.country || null,
            url: `https://www.battlemetrics.com/servers/rust/${server.id}`
        }));
    } catch (err) {
        console.log("BattleMetrics servers error:", err.response?.status, err.message);
        return [];
    }
}

app.post("/api/battlemetrics/manual", (req, res) => {
    const steamRaw = String(req.body?.steamId || "");
    const urlRaw = String(req.body?.battleMetricsUrl || req.body?.battlemetricsUrl || "");
    const steamMatch = steamRaw.match(/\d{17}/);
    const bmMatch =
        urlRaw.match(/battlemetrics\.com\/players\/(\d+)/i) ||
        urlRaw.match(/battlemetrics\.com\/rcon\/players\/(\d+)/i);
    if (!steamMatch || !bmMatch) {
        return res.status(400).json({
            success: false,
            error: "SteamID64 o URL de BattleMetrics inválidos"
        });
    }
    const steamId = steamMatch[0];
    const bmId = bmMatch[1];
    setDiscordBM(steamId, bmId);
    return res.json({ success: true, bmId });
});

app.post("/escaner-rapido", async (req, res) => {
    try {
        if (!STEAM_API_KEY) {
            return res.status(503).json({
                success: false,
                error: "STEAM_API_KEY no configurada en el servidor"
            });
        }

        const { link } = req.body;

        const match = String(link || "").match(/\d{17}/);
        if (!match) {
            return res.status(400).json({
                success: false,
                error: "SteamID64 invalido"
            });
        }

        const steamId = match[0];

        const cached = getCache(steamId);
        if (cached) {
            if (!cached.bmId) {
                let bmFix = getDiscordBM(steamId) || (await resolveBmFromChannelHistory(steamId));
                if (bmFix) {
                    cached.bmId = bmFix;
                    cached.bmUrl = `https://www.battlemetrics.com/players/${bmFix}`;
                    cached.servidoresBM = await getBattleMetricsServers(bmFix);
                    setCache(steamId, cached);
                }
            }

            return res.json({ success: true, jugador: cached });
        }

        let bmId = getDiscordBM(steamId);
        if (!bmId) {
            bmId = await resolveBmFromChannelHistory(steamId);
        }

        if (!bmId) {
            try {
                const bmRes = await axios.get(
                    `https://api.battlemetrics.com/players?filter[search]=${steamId}`,
                    { timeout: 12000, headers: battlemetricsHeaders() }
                );

                if (bmRes.data?.data?.length > 0) {
                    bmId = bmRes.data.data[0].id;
                    console.log("BM directo API:", bmId);
                }
            } catch {
                /* ignore */
            }
        }

        const [bansRes, gamesRes, infoRes, statsRes] = await Promise.all([
            axios.get(
                `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${STEAM_API_KEY}&steamids=${steamId}`
            ),
            axios.get(
                `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&format=json`
            ),
            axios.get(
                `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`
            ),
            axios
                .get(
                    `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/?appid=252490&key=${STEAM_API_KEY}&steamid=${steamId}`
                )
                .catch(() => ({ data: { playerstats: { stats: [] } } }))
        ]);

        const bans = bansRes.data.players?.[0] || {};
        const games = gamesRes.data.response?.games || [];
        const info = infoRes.data.response?.players?.[0] || {};

        const rawStats = statsRes.data.playerstats?.stats || [];
        const statMap = new Map(rawStats.map((s) => [s.name, s.value]));

        const kills = statMap.get("kill_player") || 0;
        const deaths = statMap.get("deaths") || 0;
        const headshots = statMap.get("headshot") || 0;
        const hit = statMap.get("bullet_hit_player") || 0;
        const fired = statMap.get("bullet_fired") || 0;

        const kdr = deaths > 0 ? Number((kills / deaths).toFixed(2)) : kills;

        const headshotPct =
            kills > 0 && headshots <= kills ? Number(((headshots / kills) * 100).toFixed(1)) : 0;

        const accuracy = fired > 0 ? Number(((hit / fired) * 100).toFixed(1)) : 0;

        const rust = games.find((g) => g.appid === 252490);
        const horas = rust ? Math.round(rust.playtime_forever / 60) : "Privado";

        const riskScore = calcularScore({
            horas,
            vacBans: bans.NumberOfVACBans || 0,
            gameBans: bans.NumberOfGameBans || 0,
            kdr,
            headshotPct
        });

        const recentRust = await getRustRecentHours(steamId);
        const servidoresBM = await getBattleMetricsServers(bmId);

        const discordChannelPath =
            DISCORD_GUILD_ID && DISCORD_LOOKUP_CHANNEL_ID
                ? `https://discord.com/channels/${DISCORD_GUILD_ID}/${DISCORD_LOOKUP_CHANNEL_ID}`
                : DISCORD_LOOKUP_CHANNEL_ID
                  ? `https://discord.com/channels/@me/${DISCORD_LOOKUP_CHANNEL_ID}`
                  : "";

        const jugador = {
            steamId,
            bmId,
            bmUrl: bmId ? `https://www.battlemetrics.com/players/${bmId}` : null,
            bmSearchUrl: `https://www.battlemetrics.com/players?filter[search]=${steamId}`,
            discordChannelUrl: discordChannelPath,
            hexaytronCommand: `/player identifier: ${steamId}`,

            rust2WeeksHours: recentRust.rust2WeeksHours,
            rust2WeeksMinutes: recentRust.rust2WeeksMinutes,
            servidoresBM,

            nombre: info.personaname || "Desconocido",
            avatar: info.avatarfull || "",

            horas,
            vacBans: bans.NumberOfVACBans || 0,
            gameBans: bans.NumberOfGameBans || 0,

            kills,
            deaths,
            kdr,
            headshotPct,
            accuracy,

            hsRaw: headshots,
            hitRaw: hit,
            firedRaw: fired,

            npcs: statMap.get("kill_npc") || 0,
            animals: statMap.get("kill_animal") || 0,

            wood: "0K",
            stone: "0K",
            metal: "0K",
            structures: 0,
            crafted: 0,
            barrels: 0,

            riskScore
        };

        await enviarDiscord(jugador);

        setCache(steamId, jugador);

        res.json({ success: true, jugador });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.get("/discord-status", (req, res) => {
    res.json({
        ready: discordClient.isReady(),
        user: discordClient.user?.tag || null,
        channelId: DISCORD_LOOKUP_CHANNEL_ID || null,
        lookupChannelForBmHistory: Boolean(DISCORD_LOOKUP_CHANNEL_ID),
        cachedPlayers: discordBMCache.size
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        build: "2026-05-28-vital-info-saas-premium-v1",
        db: Boolean(getPool()),
        steam: Boolean(STEAM_API_KEY),
        discordBot: discordClient.isReady(),
        battlemetricsAuth: Boolean(BATTLEMETRICS_TOKEN)
    });
});

app.get("/test", (req, res) => {
    res.send("Servidor funcionando");
});

/** Sirve el logo como favicon (Chrome pide /favicon.ico aunque haya link rel icon). */
const logoPath = path.join(ROOT_DIR, "logo.png");
app.get("/favicon.ico", (req, res) => {
    if (fs.existsSync(logoPath)) {
        res.type("image/png");
        return res.sendFile(logoPath);
    }
    res.status(204).end();
});

/**
 * Para cuando el HTML está en un dominio estático pero el API está en Render:
 * en login.html cargá <script src="https://TU-SERVICIO.onrender.com/mcv-api-config.js"></script>
 * antes de mcv-api-base.js. Usa RENDER_EXTERNAL_URL (automático en Render) o PUBLIC_API_URL.
 */
app.get("/mcv-api-config.js", (req, res) => {
    res.type("application/javascript; charset=utf-8");
    res.set("Cache-Control", "private, max-age=120");
    const base = String(process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || "")
        .trim()
        .replace(/\/$/, "");
    if (!base) {
        return res.send(
            "// MCV: sin PUBLIC_API_URL ni RENDER_EXTERNAL_URL. En Render suele existir RENDER_EXTERNAL_URL solo en el servicio desplegado.\n"
        );
    }
    res.send(`window.MCV_API_BASE=${JSON.stringify(base)};\n`);
});

/** 404 JSON para /api sin ruta (evita que static se coma rutas y el navegador vea CORS “vacío”). */
app.use((req, res, next) => {
    const pathOnly = String(req.path || "").split("?")[0];
    if (pathOnly.startsWith("/api")) {
        applyCors(req, res);
        return res.status(404).json({ error: "not_found", path: pathOnly });
    }
    next();
});

app.use("/uploads", express.static(UPLOAD_ROOT));
/** Admin: sin caché agresiva (Cloudflare/navegador); así aparece Vital Rust tras deploy. */
app.use((req, res, next) => {
    const p = String(req.path || "");
    if (p === "/admin.html" || p === "/login.html" || p === "/sw.js") {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        res.setHeader("Pragma", "no-cache");
    }
    next();
});
app.use(express.static(ROOT_DIR));

async function boot() {
    await initDb().catch((e) => {
        console.warn("initDb:", e.message);
    });
    await applyEnvWipeSteamImport({ getPool, steamApiKey: STEAM_API_KEY }).catch((e) =>
        console.warn("applyEnvWipeSteamImport:", e.message)
    );
    app.listen(PORT, () => {
        console.log(`MCV backend en http://localhost:${PORT} (estáticos desde ${ROOT_DIR})`);
    });
}

boot();
