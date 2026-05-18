"use strict";

const axios = require("axios");
const jwt = require("jsonwebtoken");
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

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

async function fetchSteamProfile(steamApiKey, steamId64) {
    if (!steamApiKey) {
        return null;
    }
    try {
        const { data } = await axios.get(
            "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
            {
                params: { key: steamApiKey, steamids: steamId64 },
                timeout: 12000
            }
        );
        const p = data?.response?.players?.[0];
        if (!p) {
            return null;
        }
        return {
            persona: p.personaname || steamId64,
            avatar: p.avatarfull || p.avatarmedium || p.avatar || "",
            profileUrl: p.profileurl || `https://steamcommunity.com/profiles/${steamId64}`
        };
    } catch (e) {
        console.warn("fetchSteamProfile:", e.message);
        return null;
    }
}

async function upsertMember(pool, { discordUserId, steamId64, discordLabel, steamApiKey }) {
    const steam = await fetchSteamProfile(steamApiKey, steamId64);
    const persona = steam?.persona || steamId64;
    const avatar = steam?.avatar || "";
    await pool.query(
        `INSERT INTO wipe_list_members (discord_user_id, steam_id64, persona_name, avatar_url, discord_username, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (discord_user_id) DO UPDATE SET
       steam_id64 = EXCLUDED.steam_id64,
       persona_name = EXCLUDED.persona_name,
       avatar_url = EXCLUDED.avatar_url,
       discord_username = EXCLUDED.discord_username,
       updated_at = NOW()`,
        [discordUserId, steamId64, persona, avatar, discordLabel || null]
    );
    return { persona, avatar };
}

function registerWipeListApi(app, { getPool, steamApiKey }) {
    app.get("/api/wipe-list", async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        try {
            const r = await pool.query(
                `SELECT discord_user_id, steam_id64, persona_name, avatar_url, discord_username, updated_at
         FROM wipe_list_members
         ORDER BY LOWER(COALESCE(persona_name, '')) ASC, steam_id64 ASC`
            );
            return res.json({ members: r.rows });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "wipe-list" });
        }
    });

    app.delete("/api/admin/wipe-list", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        try {
            await pool.query("DELETE FROM wipe_list_members");
            return res.json({ ok: true, cleared: true });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "wipe-list-clear" });
        }
    });
}

async function registerSlashCommands(client, guildId) {
    const token = String(process.env.DISCORD_BOT_TOKEN || "").trim();
    if (!token || !guildId) {
        return;
    }
    const appId = client.application?.id || client.user?.id;
    if (!appId) {
        return;
    }
    const cmd = new SlashCommandBuilder()
        .setName("mcv-wipe")
        .setDescription("Vinculá tu SteamID64 para el wipe MCV (aparecés en mcvoficial.com/jugadores.html)")
        .addStringOption((o) =>
            o
                .setName("steam64")
                .setDescription("Tu SteamID64 (17 dígitos)")
                .setRequired(true)
                .setMinLength(17)
                .setMaxLength(22)
        )
        .toJSON();

    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: [cmd] });
    console.log("Discord: comando /mcv-wipe registrado en el servidor.");
}

function attachWipeListDiscord(client, { getPool, steamApiKey, guildId }) {
    const onReady = async () => {
        try {
            await registerSlashCommands(client, guildId);
        } catch (e) {
            console.warn("Discord: no se pudo registrar /mcv-wipe:", e.message);
        }
    };
    if (client.isReady()) {
        onReady().catch((e) => console.warn("Discord wipe ready:", e.message));
    } else {
        client.once("ready", () => onReady().catch((e) => console.warn("Discord wipe ready:", e.message)));
    }

    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand()) {
            return;
        }
        if (interaction.commandName !== "mcv-wipe") {
            return;
        }
        const pool = getPool();
        if (!pool) {
            await interaction.reply({ content: "El servidor no tiene base de datos configurada.", ephemeral: true });
            return;
        }
        const raw = String(interaction.options.getString("steam64", true) || "").replace(/\D/g, "");
        if (raw.length !== 17) {
            await interaction.reply({
                content: "SteamID64 inválido: tenés que pegar **17 números** (perfil Steam → copiar ID).",
                ephemeral: true
            });
            return;
        }
        const discordLabel = [interaction.user.globalName, interaction.user.username].filter(Boolean).join(" · ");
        await interaction.deferReply({ ephemeral: true });
        try {
            const { persona } = await upsertMember(pool, {
                discordUserId: interaction.user.id,
                steamId64: raw,
                discordLabel,
                steamApiKey
            });
            await interaction.editReply({
                content: `Listo: **${persona}** quedó vinculado a tu Discord. Mirá **mcvoficial.com/jugadores.html** (puede tardar unos segundos en el CDN).`
            });
        } catch (e) {
            console.error(e);
            await interaction.editReply({
                content: "No se pudo guardar. Probá de nuevo o avisá a staff si sigue fallando."
            });
        }
    });
}

/**
 * En un canal dedicado, mensajes tipo: !mcvsteam 76561198…
 * Config: DISCORD_WIPE_REGISTER_CHANNEL_ID
 */
function attachWipeListMessageHook(client, { getPool, steamApiKey, channelId }) {
    if (!channelId) {
        return;
    }
    client.on("messageCreate", async (message) => {
        try {
            if (!message.guild || message.author.bot) {
                return;
            }
            if (message.channelId !== channelId) {
                return;
            }
            const text = String(message.content || "").trim();
            const m = text.match(/^!mcvsteam\s+(\d{10,20})\b/i);
            if (!m) {
                return;
            }
            const raw = m[1].replace(/\D/g, "");
            if (raw.length !== 17) {
                await message.react("❌").catch(() => {});
                return;
            }
            const pool = getPool();
            if (!pool) {
                return;
            }
            const discordLabel = [message.author.globalName, message.author.username].filter(Boolean).join(" · ");
            await upsertMember(pool, {
                discordUserId: message.author.id,
                steamId64: raw,
                discordLabel,
                steamApiKey
            });
            await message.react("✅").catch(() => {});
        } catch (e) {
            console.warn("wipeList message hook:", e.message);
        }
    });
}

module.exports = {
    registerWipeListApi,
    attachWipeListDiscord,
    attachWipeListMessageHook,
    fetchSteamProfile
};
