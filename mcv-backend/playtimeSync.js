"use strict";

const { SlashCommandBuilder } = require("discord.js");

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
 * Agrupa mensajes por autor y conserva el más reciente con horas parseables.
 */
function collectLatestPlaytimeByAuthor(messages) {
    const byAuthor = new Map();
    const sorted = [...messages].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const m of sorted) {
        if (!m?.author || m.author.bot) {
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
            createdAt: m.createdAt?.toISOString?.() || null
        });
    }
    return byAuthor;
}

async function fetchChannelMessages(client, channelId, maxMessages) {
    const lim = Math.min(Math.max(Number(maxMessages) || 400, 50), 1000);
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
        before = batch.last()?.id;
        if (batch.size < batchSize) {
            break;
        }
    }
    return out;
}

async function syncPlaytimeFromChannel(client, pool, channelId, options = {}) {
    if (!client?.isReady?.()) {
        throw new Error("Bot de Discord no conectado");
    }
    if (!pool) {
        throw new Error("Base de datos no disponible");
    }
    const maxMessages = options.maxMessages || 400;
    const messages = await fetchChannelMessages(client, channelId, maxMessages);
    const latest = collectLatestPlaytimeByAuthor(messages);

    const updated = [];
    const unmatched = [];
    let skipped = 0;

    for (const entry of latest.values()) {
        const link = await lookupSteamForDiscordUser(pool, entry.discordUserId);
        if (!link) {
            unmatched.push({
                discordUserId: entry.discordUserId,
                discordUsername: entry.discordUsername,
                hours: entry.hours,
                messageId: entry.messageId
            });
            continue;
        }
        try {
            const saved = await upsertPlayerHours(pool, {
                steamId64: link.steam_id64,
                hours: entry.hours,
                displayName: link.persona_name || link.discord_username || entry.discordUsername
            });
            updated.push({
                steamId64: saved.steam_id64,
                displayName: saved.display_name || link.persona_name,
                hoursPlayed: saved.hours_played,
                discordUsername: entry.discordUsername
            });
        } catch {
            skipped += 1;
        }
    }

    return {
        ok: true,
        scanned: messages.length,
        parsedAuthors: latest.size,
        updated: updated.length,
        unmatched: unmatched.length,
        skipped,
        players: updated,
        unmatchedPlayers: unmatched
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
            const maxMessages = Number(req.body?.maxMessages) || 400;
            const result = await syncPlaytimeFromChannel(client, pool, channelId, { maxMessages });
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
    syncPlaytimeFromChannel,
    applyPlaytimeFromMessage,
    buildMcHorasSlashCommand,
    attachPlaytimeDiscord,
    registerPlaytimeAdminApi
};
