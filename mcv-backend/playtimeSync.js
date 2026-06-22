"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { resolvePlaytimeSyncWindow, isTimestampInPlaytimeWindow } = require("./vitalWipeCalendar");

const HEX_WIPE_DISCORD_PREFIX = "wipehx:";
const PASTE_WIPE_DISCORD_PREFIX = "paste:";

const PLAYER_INFO_UPSERT_HOURS_SQL = `
INSERT INTO player_info_profiles (steam_id64, display_name, hours_played, updated_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (steam_id64) DO UPDATE SET
  hours_played = EXCLUDED.hours_played,
  display_name = COALESCE(NULLIF(player_info_profiles.display_name, ''), EXCLUDED.display_name),
  updated_at = NOW()
RETURNING steam_id64, hours_played, display_name
`;

/**
 * Parsea horas desde mensajes del canal playtime: "14h", "59hr", "57 horitas", "31", etc.
 */
function parsePlaytimeHours(text) {
    const raw = String(text || "").trim();
    if (!raw) {
        return null;
    }
    const cleaned = raw.replace(/\((?:editado|edited)\)/gi, "").trim();
    const firstLine = cleaned.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "";
    if (!firstLine) {
        return null;
    }

    const withUnit =
        firstLine.match(/\b(\d{1,4})\s*(?:horitas?|hrs?|horas?)\b/i) || firstLine.match(/\b(\d{1,4})\s*h\b/i);
    if (withUnit) {
        const n = Number(withUnit[1]);
        if (Number.isFinite(n) && n >= 0 && n <= 2000) {
            return Math.round(n);
        }
    }

    if (/^\d{1,4}$/.test(firstLine)) {
        const n = Number(firstLine);
        if (Number.isFinite(n) && n >= 0 && n <= 2000) {
            return Math.round(n);
        }
    }

    return null;
}

function isRealDiscordUserId(id) {
    const s = String(id || "").trim();
    return /^\d{16,20}$/.test(s);
}

function discordLabelFromUser(user) {
    if (!user) {
        return "";
    }
    return [user.globalName, user.username].filter(Boolean).join(" · ") || user.username || "";
}

async function lookupSteamForDiscordUser(pool, discordUserId) {
    if (!pool || !isRealDiscordUserId(discordUserId)) {
        return null;
    }
    const r = await pool.query(
        `SELECT steam_id64, persona_name, discord_username
         FROM wipe_list_members
         WHERE discord_user_id = $1
           AND discord_user_id NOT LIKE $2
           AND discord_user_id NOT LIKE $3
         LIMIT 1`,
        [discordUserId, `${HEX_WIPE_DISCORD_PREFIX}%`, `${PASTE_WIPE_DISCORD_PREFIX}%`]
    );
    return r.rows[0] || null;
}

async function upsertPlayerHours(pool, { steamId64, hours, displayName }) {
    if (!pool || !/^\d{17}$/.test(String(steamId64 || ""))) {
        throw new Error("SteamID64 inválido");
    }
    const h = Number(hours);
    if (!Number.isFinite(h) || h < 0 || h > 2000) {
        throw new Error("Horas inválidas");
    }
    const name = String(displayName || "").trim().slice(0, 120) || null;
    const r = await pool.query(PLAYER_INFO_UPSERT_HOURS_SQL, [steamId64, name, Math.round(h)]);
    return r.rows[0] || { steam_id64: steamId64, hours_played: Math.round(h), display_name: name };
}

async function applyPlaytimeFromMessage(pool, message) {
    if (!message?.author || message.author.bot) {
        return { applied: false, reason: "bot_or_empty" };
    }
    const hours = parsePlaytimeHours(message.content);
    if (hours == null) {
        return { applied: false, reason: "no_hours" };
    }
    const link = await lookupSteamForDiscordUser(pool, message.author.id);
    if (!link) {
        return {
            applied: false,
            reason: "no_steam_link",
            discordUserId: message.author.id,
            discordUsername: discordLabelFromUser(message.author),
            hours
        };
    }
    const saved = await upsertPlayerHours(pool, {
        steamId64: link.steam_id64,
        hours,
        displayName: link.persona_name || link.discord_username || discordLabelFromUser(message.author)
    });
    return {
        applied: true,
        steamId64: saved.steam_id64,
        hoursPlayed: saved.hours_played,
        displayName: saved.display_name,
        discordUserId: message.author.id,
        discordUsername: discordLabelFromUser(message.author)
    };
}

/**
 * Agrupa mensajes por autor y conserva el más reciente con horas parseables (opcional: ventana de fechas).
 */
function collectLatestPlaytimeByAuthor(messages, window = null) {
    const byAuthor = new Map();
    const sorted = [...messages].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const m of sorted) {
        if (!m?.author || m.author.bot) {
            continue;
        }
        if (!isTimestampInPlaytimeWindow(m.createdTimestamp, window)) {
            continue;
        }
        if (byAuthor.has(m.author.id)) {
            continue;
        }
        const hours = parsePlaytimeHours(m.content);
        if (hours == null) {
            continue;
        }
        byAuthor.set(m.author.id, {
            message: m,
            hours,
            discordUserId: m.author.id,
            discordUsername: discordLabelFromUser(m.author),
            messageId: m.id,
            createdAt: m.createdAt?.toISOString?.() || null,
            createdTimestamp: m.createdTimestamp
        });
    }
    return byAuthor;
}

function resolveSyncWindowFromOptions(options = {}) {
    const sinceMs = options.sinceMs ?? (options.since ? new Date(options.since).getTime() : null);
    const untilMs = options.untilMs ?? (options.until ? new Date(options.until).getTime() : null);
    if (Number.isFinite(sinceMs) && Number.isFinite(untilMs)) {
        return {
            windowStartMs: sinceMs,
            windowEndMs: untilMs,
            windowStart: new Date(sinceMs).toISOString(),
            windowEnd: new Date(untilMs).toISOString(),
            label: "Ventana manual"
        };
    }
    if (options.useCalendarWindow === false) {
        return null;
    }
    return resolvePlaytimeSyncWindow({
        wipeStartAt: options.wipeStartAt,
        wipeStartMs: options.wipeStartMs,
        referenceDate: options.referenceDate
    });
}

async function fetchChannelMessages(client, channelId, options = {}) {
    const lim = Math.min(Math.max(Number(options.maxMessages) || 400, 50), 2000);
    const windowStartMs = options.window?.windowStartMs;
    const ch = await client.channels.fetch(String(channelId)).catch(() => null);
    if (!ch || !ch.isTextBased()) {
        throw new Error("Canal de Discord inválido o inaccesible");
    }
    const out = [];
    let before;
    while (out.length < lim) {
        const batchSize = Math.min(100, lim - out.length);
        const batch = await ch.messages.fetch({ limit: batchSize, before });
        if (!batch.size) {
            break;
        }
        out.push(...batch.values());
        if (windowStartMs) {
            const oldest = batch.last();
            if (oldest && oldest.createdTimestamp < windowStartMs) {
                break;
            }
        }
        before = batch.last()?.id;
        if (batch.size < batchSize) {
            break;
        }
    }
    return out;
}

function filterDbPlaytimeHoursInWindow(dbRows, window) {
    if (!window || window.windowStartMs == null || window.windowEndMs == null) {
        return dbRows || [];
    }
    return (dbRows || []).filter((row) => {
        if (!row?.updated_at) {
            return false;
        }
        const ts = new Date(row.updated_at).getTime();
        return isTimestampInPlaytimeWindow(ts, window);
    });
}

async function loadWipeRosterSteamIds(pool) {
    if (!pool) {
        return [];
    }
    const r = await pool.query(
        `SELECT DISTINCT steam_id64
         FROM wipe_list_members
         WHERE steam_id64 ~ '^[0-9]{17}$'
           AND discord_user_id NOT LIKE $1
           AND discord_user_id NOT LIKE $2`,
        [`${HEX_WIPE_DISCORD_PREFIX}%`, `${PASTE_WIPE_DISCORD_PREFIX}%`]
    );
    return (r.rows || []).map((row) => String(row.steam_id64 || "").trim()).filter(Boolean);
}

async function clearStalePlaytimeHours(pool, activeSteamIds) {
    const active = new Set((activeSteamIds || []).map((id) => String(id || "").trim()).filter(Boolean));
    const roster = await loadWipeRosterSteamIds(pool);
    let cleared = 0;
    for (const steamId64 of roster) {
        if (active.has(steamId64)) {
            continue;
        }
        const r = await pool.query(
            `UPDATE player_info_profiles
             SET hours_played = NULL, updated_at = NOW()
             WHERE steam_id64 = $1 AND hours_played IS NOT NULL
             RETURNING steam_id64`,
            [steamId64]
        );
        if (r.rowCount) {
            cleared += 1;
        }
    }
    return cleared;
}

async function loadDbPlaytimeHours(pool) {
    if (!pool) {
        return [];
    }
    const r = await pool.query(
        `SELECT steam_id64, display_name, hours_played, updated_at
         FROM player_info_profiles
         WHERE hours_played IS NOT NULL AND hours_played >= 0`
    );
    return r.rows;
}

/**
 * Une horas del canal #playtime (ventana de fechas) con las ya guardadas en BD (/mcv-horas, admin).
 * Por jugador usa el valor más alto entre ambas fuentes.
 */
function mergePlaytimeBySteam(dbRows, channelBySteam) {
    const merged = new Map();

    for (const row of dbRows || []) {
        const steamId64 = String(row.steam_id64 || "").trim();
        const hours = Number(row.hours_played);
        if (!/^\d{17}$/.test(steamId64) || !Number.isFinite(hours) || hours < 0) {
            continue;
        }
        merged.set(steamId64, {
            steamId64,
            hours: Math.round(hours),
            sources: new Set(["saved"]),
            displayName: String(row.display_name || "").trim() || null,
            savedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        });
    }

    for (const [steamId64, ch] of (channelBySteam || new Map()).entries()) {
        const prev = merged.get(steamId64);
        const chHours = Number(ch.hours);
        if (!Number.isFinite(chHours) || chHours < 0) {
            continue;
        }
        if (!prev || chHours >= prev.hours) {
            const sources = new Set(prev?.sources || []);
            sources.add("channel");
            merged.set(steamId64, {
                steamId64,
                hours: Math.round(chHours),
                sources,
                displayName: ch.displayName || prev?.displayName || null,
                postedAt: ch.postedAt || null,
                savedAt: prev?.savedAt || null,
                discordUsername: ch.discordUsername || null
            });
        } else if (prev) {
            prev.sources.add("channel");
        }
    }

    return merged;
}

function formatPlaytimeSource(sources) {
    const hasChannel = sources.has("channel");
    const hasSaved = sources.has("saved");
    if (hasChannel && hasSaved) {
        return "both";
    }
    if (hasChannel) {
        return "channel";
    }
    return "saved";
}

async function syncPlaytimeFromChannel(client, pool, channelId, options = {}) {
    if (!client?.isReady?.()) {
        throw new Error("Bot de Discord no conectado");
    }
    if (!pool) {
        throw new Error("Base de datos no disponible");
    }
    const window = resolveSyncWindowFromOptions(options);
    const maxMessages = options.maxMessages || (window ? 2000 : 400);
    const messages = await fetchChannelMessages(client, channelId, { maxMessages, window });
    const inWindowMessages = window
        ? messages.filter((m) => isTimestampInPlaytimeWindow(m.createdTimestamp, window))
        : messages;
    const latest = collectLatestPlaytimeByAuthor(inWindowMessages, window);

    const channelBySteam = new Map();
    const unmatched = [];
    for (const entry of latest.values()) {
        const link = await lookupSteamForDiscordUser(pool, entry.discordUserId);
        if (!link) {
            unmatched.push({
                discordUserId: entry.discordUserId,
                discordUsername: entry.discordUsername,
                hours: entry.hours,
                messageId: entry.messageId,
                postedAt: entry.createdAt
            });
            continue;
        }
        channelBySteam.set(link.steam_id64, {
            hours: entry.hours,
            displayName: link.persona_name || link.discord_username || entry.discordUsername,
            postedAt: entry.createdAt,
            discordUsername: entry.discordUsername
        });
    }

    const dbRowsRaw = await loadDbPlaytimeHours(pool);
    const dbRows =
        window && window.phase !== "off-season"
            ? filterDbPlaytimeHoursInWindow(dbRowsRaw, window)
            : dbRowsRaw;
    const mergedBySteam = mergePlaytimeBySteam(dbRows, channelBySteam);

    const updated = [];
    let skipped = 0;
    let fromChannelOnly = 0;
    let fromSavedOnly = 0;
    let fromBoth = 0;

    for (const item of mergedBySteam.values()) {
        const source = formatPlaytimeSource(item.sources);
        if (source === "channel") {
            fromChannelOnly += 1;
        } else if (source === "saved") {
            fromSavedOnly += 1;
        } else {
            fromBoth += 1;
        }
        try {
            const saved = await upsertPlayerHours(pool, {
                steamId64: item.steamId64,
                hours: item.hours,
                displayName: item.displayName
            });
            updated.push({
                steamId64: saved.steam_id64,
                displayName: saved.display_name || item.displayName,
                hoursPlayed: saved.hours_played,
                discordUsername: item.discordUsername || null,
                postedAt: item.postedAt || null,
                savedAt: item.savedAt || null,
                source
            });
        } catch {
            skipped += 1;
        }
    }

    let clearedStale = 0;
    if (window && window.phase !== "off-season") {
        clearedStale = await clearStalePlaytimeHours(
            pool,
            updated.map((row) => row.steamId64)
        );
    }

    return {
        ok: true,
        scanned: messages.length,
        inWindow: inWindowMessages.length,
        ignoredOutsideWindow: window && window.phase !== "off-season" ? Math.max(0, messages.length - inWindowMessages.length) : messages.length,
        window: window
            ? {
                  phase: window.phase,
                  start: window.windowStart,
                  end: window.windowEnd,
                  label: window.label,
                  hint: window.hint || null
              }
            : null,
        parsedAuthors: latest.size,
        fromChannel: fromChannelOnly + fromBoth,
        fromSaved: fromSavedOnly + fromBoth,
        fromChannelOnly,
        fromSavedOnly,
        fromBoth,
        updated: updated.length,
        clearedStale,
        unmatched: unmatched.length,
        skipped,
        players: updated,
        unmatchedPlayers: unmatched,
        message:
            window?.phase === "off-season"
                ? window.hint || "Sin ventana activa entre rewipe y próximo Monthly."
                : null
    };
}

function buildMcHorasSlashCommand() {
    return new SlashCommandBuilder()
        .setName("mcv-horas")
        .setDescription("Reportá cuántas horas jugaste en el wipe (requiere /mcv-wipe previo)")
        .addIntegerOption((o) =>
            o.setName("horas").setDescription("Horas jugadas en el wipe").setRequired(true).setMinValue(0).setMaxValue(2000)
        )
        .toJSON();
}

function attachPlaytimeDiscord(client, { getPool, channelId, onSlashGuildIds }) {
    const guildIds = Array.isArray(onSlashGuildIds) ? onSlashGuildIds.filter(Boolean) : [];

    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand() || interaction.commandName !== "mcv-horas") {
            return;
        }
        const pool = getPool();
        if (!pool) {
            await interaction.reply({ content: "El servidor no tiene base de datos configurada.", ephemeral: true });
            return;
        }
        const hours = interaction.options.getInteger("horas", true);
        await interaction.deferReply({ ephemeral: true });
        try {
            const link = await lookupSteamForDiscordUser(pool, interaction.user.id);
            if (!link) {
                await interaction.editReply({
                    content:
                        "Primero vinculá tu Steam con **`/mcv-wipe`** (SteamID64 de 17 dígitos). Después podés usar `/mcv-horas`."
                });
                return;
            }
            const saved = await upsertPlayerHours(pool, {
                steamId64: link.steam_id64,
                hours,
                displayName: link.persona_name || discordLabelFromUser(interaction.user)
            });
            await interaction.editReply({
                content: `Listo: **${saved.display_name || link.persona_name}** — **${saved.hours_played}h** registradas para el wipe.`
            });
        } catch (e) {
            console.error("mcv-horas:", e.message);
            await interaction.editReply({ content: "No se pudieron guardar las horas. Probá de nuevo o avisá a staff." });
        }
    });

    if (!channelId) {
        return { guildIds };
    }

    async function handlePlaytimeMessage(message) {
        try {
            if (!message.guild || message.channelId !== channelId || message.author?.bot) {
                return;
            }
            if (message.partial) {
                message = await message.fetch();
            }
            const pool = getPool();
            if (!pool) {
                return;
            }
            const window = resolveSyncWindowFromOptions({ useCalendarWindow: true, referenceDate: new Date() });
            if (!window || window.phase === "off-season" || !isTimestampInPlaytimeWindow(message.createdTimestamp, window)) {
                return;
            }
            const result = await applyPlaytimeFromMessage(pool, message);
            if (result.applied) {
                console.log(
                    `Playtime: ${result.discordUsername} → ${result.steamId64} = ${result.hoursPlayed}h`
                );
            }
        } catch (e) {
            console.warn("playtime message:", e.message);
        }
    }

    client.on("messageCreate", (message) => {
        handlePlaytimeMessage(message).catch(() => {});
    });
    client.on("messageUpdate", (_old, message) => {
        handlePlaytimeMessage(message).catch(() => {});
    });

    return { guildIds, channelId };
}

function registerPlaytimeAdminApi(app, { getPool, authAdmin, getDiscordClient, getPlaytimeChannelId }) {
    app.post("/api/admin/vital/player-info/sync-discord-playtime", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no configurada" });
        }
        const client = getDiscordClient?.();
        if (!client?.isReady?.()) {
            return res.status(503).json({ error: "Bot de Discord no conectado" });
        }
        const channelId =
            String(req.body?.channelId || req.query?.channelId || getPlaytimeChannelId?.() || "").trim();
        if (!channelId) {
            return res.status(400).json({
                error: "Falta DISCORD_PLAYTIME_CHANNEL_ID (canal donde postean las horas)"
            });
        }
        try {
            const body = req.body && typeof req.body === "object" ? req.body : {};
            const maxMessages = Number(body.maxMessages) || 2000;
            const useCalendarWindow = body.useCalendarWindow !== false;
            const wipeStartMs = Number(body.wipeStartMs || body.wipeStart || 0) || null;
            const result = await syncPlaytimeFromChannel(client, pool, channelId, {
                maxMessages,
                useCalendarWindow,
                wipeStartMs,
                wipeStartAt: body.wipeStartAt,
                since: body.since,
                until: body.until
            });
            return res.json(result);
        } catch (e) {
            console.error("sync-discord-playtime:", e.message);
            return res.status(500).json({ error: e.message || "Error sincronizando playtime" });
        }
    });
}

module.exports = {
    parsePlaytimeHours,
    collectLatestPlaytimeByAuthor,
    mergePlaytimeBySteam,
    filterDbPlaytimeHoursInWindow,
    formatPlaytimeSource,
    resolveSyncWindowFromOptions,
    syncPlaytimeFromChannel,
    applyPlaytimeFromMessage,
    buildMcHorasSlashCommand,
    attachPlaytimeDiscord,
    registerPlaytimeAdminApi
};
