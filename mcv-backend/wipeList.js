"use strict";

const axios = require("axios");
const { authAdmin } = require("./auth");
const {
    REST,
    Routes,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require("discord.js");
const { buildMcHorasSlashCommand } = require("./playtimeSync");
const { buildMcReporteSlashCommand } = require("./wipeReport");
const { buildMcYoSlashCommand, buildMcTopSlashCommand, assignWipeLinkedRole } = require("./wipeDiscordExtras");
const { buildMcAsistenciaSlashCommand } = require("./wipeAttendance");

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

/** Placeholders importados desde Hexaytron en canal (DISCORD_WIPE_REGISTER_CHANNEL_ID). */
const HEX_WIPE_DISCORD_PREFIX = "wipehx:";
/** Importación manual: panel admin o variable MCV_WIPE_IMPORT_STEAMS. */
const PASTE_WIPE_DISCORD_PREFIX = "paste:";
const TEAM_SUBMIT_MODAL_ID = "mcv-create-user-modal";
const TEAM_SUBMIT_INPUTS = {
    displayName: "mcv_create_display_name",
    steamId64: "mcv_create_steam_id64",
    roleLabel: "mcv_create_role_label",
    twitchUrl: "mcv_create_twitch_url",
    xUrl: "mcv_create_x_url"
};

function normalizeOptionalUrl(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) {
        return null;
    }
    if (s.length > 512) {
        return null;
    }
    const lower = s.toLowerCase();
    if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
        return null;
    }
    if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
        return null;
    }
    return s;
}

function buildCreateUserModal() {
    return new ModalBuilder()
        .setCustomId(TEAM_SUBMIT_MODAL_ID)
        .setTitle("Crear perfil MCV")
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(TEAM_SUBMIT_INPUTS.displayName)
                    .setLabel("Nombre visible")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(120)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(TEAM_SUBMIT_INPUTS.steamId64)
                    .setLabel("SteamID64 (17 dígitos)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(22)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(TEAM_SUBMIT_INPUTS.roleLabel)
                    .setLabel("Rol (opcional)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(120)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(TEAM_SUBMIT_INPUTS.twitchUrl)
                    .setLabel("Twitch URL (opcional)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(200)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(TEAM_SUBMIT_INPUTS.xUrl)
                    .setLabel("X/Twitter URL (opcional)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(200)
            )
        );
}

async function createTeamSubmissionFromDiscord(pool, steamApiKey, fields) {
    const displayName = String(fields.displayName || "").trim();
    if (!displayName || displayName.length > 120) {
        return { error: "Nombre visible obligatorio (máx. 120)." };
    }
    const steamId64 = String(fields.steamId64 || "").replace(/\D/g, "");
    if (steamId64.length !== 17) {
        return { error: "SteamID64 inválido: usá 17 dígitos." };
    }
    let roleLabel = String(fields.roleLabel || "").trim();
    if (roleLabel.length > 120) {
        roleLabel = roleLabel.slice(0, 120);
    }
    const twitchUrl = normalizeOptionalUrl(fields.twitchUrl);
    const xUrl = normalizeOptionalUrl(fields.xUrl);

    let personaName = null;
    let avatarUrl = null;
    if (steamApiKey) {
        const sp = await fetchSteamProfile(steamApiKey, steamId64);
        if (sp) {
            personaName = sp.persona;
            avatarUrl = sp.avatar || null;
        }
    }

    const ins = await pool.query(
        `INSERT INTO team_roster_submissions (
            display_name, role_label, steam_id64,
            twitch_url, x_url, persona_name, avatar_url, status, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending', NOW())
        RETURNING id`,
        [displayName, roleLabel || null, steamId64, twitchUrl, xUrl, personaName, avatarUrl]
    );
    return { ok: true, id: ins.rows[0]?.id ?? null, steamId64 };
}

function isAutoImportDiscordId(discordUserId) {
    const id = String(discordUserId || "");
    return id.startsWith(HEX_WIPE_DISCORD_PREFIX) || id.startsWith(PASTE_WIPE_DISCORD_PREFIX);
}

function parseCreatorSteamSet() {
    const raw = String(process.env.MCV_WIPE_CREATOR_STEAMS || "").trim();
    if (!raw) {
        return new Set();
    }
    const out = new Set();
    for (const part of raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)) {
        const d = part.replace(/\D/g, "");
        if (d.length === 17) {
            out.add(d);
        }
    }
    return out;
}

/** Nombres de persona Steam (minúsculas) que marcan creadores MCV si no pasás SteamIDs en MCV_WIPE_CREATOR_STEAMS. */
function parseCreatorNameSet() {
    const fromEnv = String(process.env.MCV_WIPE_CREATOR_NAMES || "").trim();
    if (fromEnv) {
        return new Set(fromEnv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
    }
    return new Set(["art of war", "ivaan"]);
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function personaMatchesCreatorName(personaLower, nameLower) {
    if (!nameLower || !personaLower) {
        return false;
    }
    if (personaLower === nameLower) {
        return true;
    }
    if (nameLower.includes(" ")) {
        return personaLower.includes(nameLower);
    }
    return new RegExp(`\\b${escapeRegExp(nameLower)}\\b`, "i").test(personaLower);
}

function memberIsMcvCreator(row, creatorSteams, creatorNames) {
    const steam = String(row.steam_id64 || "").trim();
    if (creatorSteams.size && creatorSteams.has(steam)) {
        return true;
    }
    if (!creatorNames.size) {
        return false;
    }
    const persona = String(row.persona_name || "").trim().toLowerCase();
    if (!persona) {
        return false;
    }
    for (const n of creatorNames) {
        if (personaMatchesCreatorName(persona, n)) {
            return true;
        }
    }
    return false;
}

function extractSteamIdsFromText(text, max) {
    const lim = typeof max === "number" && max > 0 ? max : 250;
    const s = String(text || "");
    const seen = new Set();
    const out = [];
    const re = /\b\d{17}\b/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        if (seen.has(m[0])) {
            continue;
        }
        seen.add(m[0]);
        out.push(m[0]);
        if (out.length >= lim) {
            break;
        }
    }
    return out;
}

async function upsertMember(pool, { discordUserId, steamId64, discordLabel, steamApiKey }) {
    if (isAutoImportDiscordId(discordUserId)) {
        const block = await pool.query(
            `SELECT 1 FROM wipe_list_members WHERE steam_id64 = $1 AND discord_user_id NOT LIKE $2 AND discord_user_id NOT LIKE $3 LIMIT 1`,
            [steamId64, `${HEX_WIPE_DISCORD_PREFIX}%`, `${PASTE_WIPE_DISCORD_PREFIX}%`]
        );
        if (block.rows.length) {
            return { persona: steamId64, avatar: "", skipped: true };
        }
    }
    await pool.query(
        `DELETE FROM wipe_list_members WHERE steam_id64 = $1 AND (discord_user_id LIKE $2 OR discord_user_id LIKE $3)`,
        [steamId64, `${HEX_WIPE_DISCORD_PREFIX}%`, `${PASTE_WIPE_DISCORD_PREFIX}%`]
    );
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
            const creatorSteams = parseCreatorSteamSet();
            const creatorNames = parseCreatorNameSet();
            const members = r.rows.map((row) => ({
                ...row,
                mcv_creator: memberIsMcvCreator(row, creatorSteams, creatorNames)
            }));
            return res.json({ members });
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

    app.post("/api/admin/wipe-list/import", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const text = String(req.body?.text ?? "");
        const mode = req.body?.mode === "replace_auto" ? "replace_auto" : "merge";
        const label = String(req.body?.label ?? "").trim() || null;
        const ids = extractSteamIdsFromText(text, 250);
        if (!ids.length) {
            return res.status(400).json({ error: "Sin SteamID64 de 17 dígitos en el texto" });
        }
        try {
            if (mode === "replace_auto") {
                await pool.query(
                    `DELETE FROM wipe_list_members WHERE discord_user_id LIKE $1 OR discord_user_id LIKE $2`,
                    [`${HEX_WIPE_DISCORD_PREFIX}%`, `${PASTE_WIPE_DISCORD_PREFIX}%`]
                );
            }
            let applied = 0;
            for (const sid of ids) {
                await upsertMember(pool, {
                    discordUserId: `${PASTE_WIPE_DISCORD_PREFIX}${sid}`,
                    steamId64: sid,
                    discordLabel: label,
                    steamApiKey
                });
                applied += 1;
            }
            const r2 = await pool.query(`SELECT COUNT(*)::int AS c FROM wipe_list_members`);
            return res.json({
                ok: true,
                imported: applied,
                totalMembers: r2.rows[0]?.c ?? 0,
                mode
            });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "wipe-list-import" });
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
    const cmdWipe = new SlashCommandBuilder()
        .setName("mcv-wipe")
        .setDescription("Vinculá tu SteamID64 (17 dígitos) al roster interno del wipe MCV.")
        .addStringOption((o) =>
            o
                .setName("steam64")
                .setDescription("Tu SteamID64 (17 dígitos)")
                .setRequired(true)
                .setMinLength(17)
                .setMaxLength(22)
        )
        .toJSON();
    const cmdCreateUser = new SlashCommandBuilder()
        .setName("mcv-crear-usuario")
        .setDescription("Abrí un formulario para enviar tu perfil del equipo (queda pendiente de aprobación).")
        .toJSON();
    const cmdHoras = buildMcHorasSlashCommand();
    const cmdReporte = buildMcReporteSlashCommand();
    const cmdYo = buildMcYoSlashCommand();
    const cmdTop = buildMcTopSlashCommand();
    const cmdAsistencia = buildMcAsistenciaSlashCommand();

    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationGuildCommands(appId, guildId), {
        body: [cmdWipe, cmdCreateUser, cmdHoras, cmdReporte, cmdYo, cmdTop, cmdAsistencia]
    });
    console.log(`Discord: comandos wipe/perfil/asistencia registrados en guild ${guildId}.`);
}

/** Si DISCORD_WIPE_GUILD_ID está definido, el slash solo (o también) va a ese servidor — ej. clan privado. Si no, usa el guild principal. */
function collectWipeSlashGuildIds(mainGuildId) {
    const raw = String(process.env.DISCORD_WIPE_GUILD_ID || "").trim();
    if (raw) {
        const parts = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
        return [...new Set(parts)];
    }
    const main = String(mainGuildId || "").trim();
    return main ? [main] : [];
}

function attachWipeListDiscord(client, { getPool, steamApiKey, guildId }) {
    const guildIds = collectWipeSlashGuildIds(guildId);
    const onReady = async () => {
        for (const gid of guildIds) {
            try {
                await registerSlashCommands(client, gid);
            } catch (e) {
                console.warn(`Discord: no se pudo registrar /mcv-wipe en guild ${gid}:`, e.message);
            }
        }
    };
    if (client.isReady()) {
        onReady().catch((e) => console.warn("Discord wipe ready:", e.message));
    } else {
        client.once("ready", () => onReady().catch((e) => console.warn("Discord wipe ready:", e.message)));
    }

    client.on("interactionCreate", async (interaction) => {
        if (interaction.isModalSubmit() && interaction.customId === TEAM_SUBMIT_MODAL_ID) {
            const pool = getPool();
            if (!pool) {
                await interaction.reply({ content: "El servidor no tiene base de datos configurada.", ephemeral: true });
                return;
            }
            await interaction.deferReply({ ephemeral: true });
            try {
                const result = await createTeamSubmissionFromDiscord(pool, steamApiKey, {
                    displayName: interaction.fields.getTextInputValue(TEAM_SUBMIT_INPUTS.displayName),
                    steamId64: interaction.fields.getTextInputValue(TEAM_SUBMIT_INPUTS.steamId64),
                    roleLabel: interaction.fields.getTextInputValue(TEAM_SUBMIT_INPUTS.roleLabel),
                    twitchUrl: interaction.fields.getTextInputValue(TEAM_SUBMIT_INPUTS.twitchUrl),
                    xUrl: interaction.fields.getTextInputValue(TEAM_SUBMIT_INPUTS.xUrl)
                });
                if (!result.ok) {
                    await interaction.editReply({ content: result.error || "No se pudo crear la solicitud." });
                    return;
                }
                await interaction.editReply({
                    content:
                        `Solicitud creada (ID #${result.id || "?"}) y marcada como **pending** para revisión del staff.\n` +
                        `Steam guardado: \`${result.steamId64}\``
                });
            } catch (e) {
                console.error("mcv-crear-usuario modal:", e.message);
                await interaction.editReply({ content: "No se pudo crear la solicitud. Probá de nuevo." });
            }
            return;
        }
        if (!interaction.isChatInputCommand()) {
            return;
        }
        if (interaction.commandName === "mcv-crear-usuario") {
            await interaction.showModal(buildCreateUserModal());
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
            const roleOk = await assignWipeLinkedRole(interaction);
            const roleNote = roleOk ? "\n\n✅ Rol de wipe asignado." : "";
            await interaction.editReply({
                content:
                    `Listo: **${persona}** quedó vinculado a tu Discord.${roleNote}\n\n` +
                    `Cargá horas con **\`/mcv-horas\`** o en #playtime. Mirá tu resumen con **\`/mcv-yo\`**. ` +
                    `Para la ficha pública con redes: **mcvoficial.com/equipo/solicitud/**`
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
            let raw = "";
            const mcmd = text.match(/^!mcvsteam\s+(\d{10,20})\b/i);
            if (mcmd) {
                raw = mcmd[1].replace(/\D/g, "");
            } else {
                const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                const bare = lines.length === 1 && /^\d{17}$/.test(lines[0]) ? lines[0] : "";
                if (bare) {
                    raw = bare;
                }
            }
            if (raw.length !== 17) {
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

/**
 * Mensajes del bot Hexaytron en DISCORD_WIPE_REGISTER_CHANNEL_ID: si hay SteamID64 en el embed/texto,
 * se agrega al roster del wipe (lista interna; las fichas públicas en /equipo/ las aprueba el admin; el formulario está en /equipo/solicitud/).
 */
async function upsertWipeFromHexaytronChannel(pool, { steamApiKey, steamId64, botTag }) {
    if (!pool || !/^\d{17}$/.test(String(steamId64 || ""))) {
        return;
    }
    const taken = await pool.query(
        `SELECT 1 FROM wipe_list_members WHERE steam_id64 = $1 AND discord_user_id NOT LIKE $2 AND discord_user_id NOT LIKE $3 LIMIT 1`,
        [steamId64, `${HEX_WIPE_DISCORD_PREFIX}%`, `${PASTE_WIPE_DISCORD_PREFIX}%`]
    );
    if (taken.rows.length) {
        return;
    }
    const pseudoId = `${HEX_WIPE_DISCORD_PREFIX}${steamId64}`;
    const label = botTag ? `Hexaytron · ${botTag}` : "Hexaytron";
    await upsertMember(pool, {
        discordUserId: pseudoId,
        steamId64,
        discordLabel: label,
        steamApiKey
    });
}

async function applyEnvWipeSteamImport({ getPool, steamApiKey }) {
    try {
        const raw = String(process.env.MCV_WIPE_IMPORT_STEAMS || "").trim();
        if (!raw) {
            return;
        }
        const pool = getPool();
        if (!pool) {
            return;
        }
        const ids = extractSteamIdsFromText(raw, 500);
        if (!ids.length) {
            return;
        }
        for (const sid of ids) {
            await upsertMember(pool, {
                discordUserId: `${PASTE_WIPE_DISCORD_PREFIX}${sid}`,
                steamId64: sid,
                discordLabel: null,
                steamApiKey
            });
        }
        console.log(`Wipe: ${ids.length} Steam desde variable MCV_WIPE_IMPORT_STEAMS.`);
    } catch (e) {
        console.warn("applyEnvWipeSteamImport:", e.message);
    }
}

module.exports = {
    registerWipeListApi,
    attachWipeListDiscord,
    attachWipeListMessageHook,
    fetchSteamProfile,
    upsertWipeFromHexaytronChannel,
    applyEnvWipeSteamImport
};
