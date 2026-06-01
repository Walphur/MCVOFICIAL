"use strict";

const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const HEX_WIPE_DISCORD_PREFIX = "wipehx:";
const PASTE_WIPE_DISCORD_PREFIX = "paste:";

const STATUS_LABELS = {
    accepted: { emoji: "✅", label: "Accepted" },
    declined: { emoji: "❌", label: "Declined" },
    late: { emoji: "🕒", label: "Late" }
};

function parsePollId(customId, prefix) {
    if (!customId || !customId.startsWith(prefix)) {
        return null;
    }
    const id = Number(customId.slice(prefix.length));
    return Number.isFinite(id) && id > 0 ? id : null;
}

function canManageAttendance(interaction) {
    const perms = interaction.memberPermissions;
    if (!perms) {
        return false;
    }
    if (perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild)) {
        return true;
    }
    const staffRoleId = String(process.env.DISCORD_ATTENDANCE_STAFF_ROLE_ID || "").trim();
    if (staffRoleId && interaction.member?.roles?.cache?.has(staffRoleId)) {
        return true;
    }
    return false;
}

async function loadPoll(pool, pollId) {
    const r = await pool.query(`SELECT * FROM wipe_attendance_polls WHERE id = $1`, [pollId]);
    return r.rows[0] || null;
}

async function loadResponses(pool, pollId) {
    const r = await pool.query(
        `SELECT discord_user_id, discord_username, status, excuse_text, responded_at
         FROM wipe_attendance_responses WHERE poll_id = $1 ORDER BY responded_at ASC`,
        [pollId]
    );
    return r.rows || [];
}

async function loadWipeListDiscordIds(pool) {
    const r = await pool.query(
        `SELECT discord_user_id FROM wipe_list_members
         WHERE discord_user_id NOT LIKE $1 AND discord_user_id NOT LIKE $2`,
        [`${HEX_WIPE_DISCORD_PREFIX}%`, `${PASTE_WIPE_DISCORD_PREFIX}%`]
    );
    return (r.rows || []).map((row) => String(row.discord_user_id)).filter(Boolean);
}

async function loadRoleDiscordIds(guild) {
    const roleId = String(process.env.DISCORD_ATTENDANCE_ROLE_ID || "").trim();
    if (!roleId || !guild) {
        return [];
    }
    try {
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
            return [];
        }
        if (role.members.size === 0) {
            await guild.members.fetch().catch(() => {});
        }
        return [...role.members.values()]
            .filter((m) => m.user && !m.user.bot)
            .map((m) => m.id);
    } catch (e) {
        console.warn("loadRoleDiscordIds:", e.message);
        return [];
    }
}

async function loadExpectedDiscordIds(pool, guild, rosterSource) {
    const src = String(rosterSource || "wipe_list").trim();
    if (src === "discord_role") {
        return loadRoleDiscordIds(guild);
    }
    return loadWipeListDiscordIds(pool);
}

function displayMention(userId, username) {
    const name = String(username || "").trim();
    return name ? `<@${userId}> (${name})` : `<@${userId}>`;
}

function chunkFieldText(lines, maxLen) {
    const chunks = [];
    let cur = "";
    for (const line of lines) {
        const next = cur ? `${cur}\n${line}` : line;
        if (next.length > maxLen) {
            if (cur) {
                chunks.push(cur);
            }
            cur = line.length > maxLen ? line.slice(0, maxLen - 1) + "…" : line;
        } else {
            cur = next;
        }
    }
    if (cur) {
        chunks.push(cur);
    }
    return chunks.length ? chunks : ["_vacío_"];
}

function formatResponseLines(responses, status) {
    const filtered = responses.filter((r) => r.status === status);
    if (!filtered.length) {
        return ["_nadie_"];
    }
    return filtered.map((r) => {
        const base = displayMention(r.discord_user_id, r.discord_username);
        const excuse = String(r.excuse_text || "").trim();
        if (excuse) {
            return `${base}\n> _${excuse.slice(0, 200)}_`;
        }
        return base;
    });
}

function buildAttendanceEmbed(poll, responses, expectedIds) {
    const respondedIds = new Set(responses.map((r) => r.discord_user_id));
    const pendingIds = expectedIds.filter((id) => !respondedIds.has(id));
    const counts = {
        accepted: responses.filter((r) => r.status === "accepted").length,
        declined: responses.filter((r) => r.status === "declined").length,
        late: responses.filter((r) => r.status === "late").length,
        pending: pendingIds.length
    };

    const embed = new EmbedBuilder()
        .setColor(poll.closed_at ? 0x95a5a6 : 0x5865f2)
        .setTitle(`📝 ${poll.title}`)
        .setFooter({
            text: poll.closed_at
                ? `Encuesta cerrada · ID ${poll.id}`
                : `Encuesta #${poll.id} · Aceptá, decliná o marcá Late`
        });

    if (poll.event_note) {
        embed.setDescription(`**Fecha / hora**\n${poll.event_note}`);
    }

    for (const key of ["accepted", "declined", "late"]) {
        const meta = STATUS_LABELS[key];
        const lines = formatResponseLines(responses, key);
        const chunks = chunkFieldText(lines, 1000);
        chunks.forEach((chunk, idx) => {
            embed.addFields({
                name: idx === 0 ? `${meta.emoji} ${meta.label} (${counts[key]})` : `${meta.emoji} ${meta.label} (cont.)`,
                value: chunk,
                inline: false
            });
        });
    }

    if (pendingIds.length) {
        const pendingLines = pendingIds.slice(0, 40).map((id) => `<@${id}>`);
        const extra = pendingIds.length > 40 ? `\n_…y ${pendingIds.length - 40} más_` : "";
        embed.addFields({
            name: `⏳ Sin responder (${counts.pending})`,
            value: chunkFieldText(pendingLines, 1000)[0] + extra,
            inline: false
        });
    }

    return embed;
}

function buildAttendanceComponents(pollId, closed) {
    if (closed) {
        return [];
    }
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`att:a:${pollId}`).setLabel("Accept").setStyle(ButtonStyle.Success).setEmoji("✅"),
        new ButtonBuilder().setCustomId(`att:d:${pollId}`).setLabel("Decline").setStyle(ButtonStyle.Danger).setEmoji("❌"),
        new ButtonBuilder().setCustomId(`att:l:${pollId}`).setLabel("Late").setStyle(ButtonStyle.Secondary).setEmoji("🕒")
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`att:r:${pollId}`)
            .setLabel("Recordar pendientes")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📢"),
        new ButtonBuilder()
            .setCustomId(`att:x:${pollId}`)
            .setLabel("Cerrar encuesta")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⚙️")
    );
    return [row1, row2];
}

function buildExcuseModal(pollId, status) {
    const isLate = status === "late";
    return new ModalBuilder()
        .setCustomId(`att:md:${status === "late" ? "l" : "d"}:${pollId}`)
        .setTitle(isLate ? "Llegás tarde — excusa" : "Declinar — motivo (opcional)")
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("excuse")
                    .setLabel(isLate ? "¿Por qué llegás tarde?" : "Motivo (opcional)")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(isLate)
                    .setMaxLength(500)
                    .setPlaceholder(isLate ? "Ej: laburo hasta las 15, entro 1h después del wipe" : "Opcional")
            )
        );
}

async function refreshPollMessage(client, pool, poll) {
    if (!poll?.discord_channel_id || !poll?.discord_message_id) {
        return;
    }
    const responses = await loadResponses(pool, poll.id);
    const guild = client.guilds.cache.get(
        String(process.env.DISCORD_WIPE_GUILD_ID || process.env.DISCORD_GUILD_ID || "").split(/[\s,]+/)[0] || ""
    );
    const channel = await client.channels.fetch(poll.discord_channel_id).catch(() => null);
    if (!channel?.isTextBased()) {
        return;
    }
    const expectedIds = await loadExpectedDiscordIds(pool, channel.guild || guild, poll.roster_source);
    const embed = buildAttendanceEmbed(poll, responses, expectedIds);
    const components = buildAttendanceComponents(poll.id, !!poll.closed_at);
    const msg = await channel.messages.fetch(poll.discord_message_id).catch(() => null);
    if (msg) {
        await msg.edit({ embeds: [embed], components });
    }
}

async function upsertResponse(pool, { pollId, discordUserId, discordUsername, status, excuseText }) {
    await pool.query(
        `INSERT INTO wipe_attendance_responses (poll_id, discord_user_id, discord_username, status, excuse_text, responded_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (poll_id, discord_user_id) DO UPDATE SET
           discord_username = EXCLUDED.discord_username,
           status = EXCLUDED.status,
           excuse_text = EXCLUDED.excuse_text,
           responded_at = NOW()`,
        [pollId, discordUserId, discordUsername || null, status, excuseText || null]
    );
}

function buildMentionChunks(userIds, maxLen) {
    const lim = typeof maxLen === "number" && maxLen > 0 ? maxLen : 1900;
    const chunks = [];
    let cur = "";
    for (const id of userIds) {
        const m = `<@${id}>`;
        const next = cur ? `${cur} ${m}` : m;
        if (next.length > lim) {
            if (cur) {
                chunks.push(cur);
            }
            cur = m;
        } else {
            cur = next;
        }
    }
    if (cur) {
        chunks.push(cur);
    }
    return chunks.length ? chunks : [];
}

async function sendNonResponderReminders(channel, pendingIds, pollTitle) {
    if (!pendingIds.length) {
        return { sent: 0, pending: 0 };
    }
    const chunks = buildMentionChunks(pendingIds);
    let sent = 0;
    for (let i = 0; i < chunks.length; i++) {
        const header =
            i === 0
                ? `📢 **${pollTitle}** — faltan **${pendingIds.length}** respuesta(s). Tocá los botones arriba (✅ Accept / ❌ Decline / 🕒 Late):\n\n`
                : `📢 _(continuación ${i + 1}/${chunks.length})_\n\n`;
        await channel.send({ content: header + chunks[i], allowedMentions: { users: pendingIds } });
        sent += 1;
    }
    return { sent, pending: pendingIds.length };
}

async function resolvePollForRemind(pool, guildId, channelId, pollIdOpt) {
    if (pollIdOpt) {
        return loadPoll(pool, pollIdOpt);
    }
    const r = await pool.query(
        `SELECT * FROM wipe_attendance_polls
         WHERE discord_channel_id = $1 AND closed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [channelId]
    );
    return r.rows[0] || null;
}

function buildMcAsistenciaSlashCommand() {
    return new SlashCommandBuilder()
        .setName("mcv-asistencia")
        .setDescription("Encuesta de asistencia al wipe (staff)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sc) =>
            sc
                .setName("crear")
                .setDescription("Publica encuesta con botones Accept / Decline / Late")
                .addStringOption((o) =>
                    o.setName("titulo").setDescription("Nombre del evento (ej. FORCED JUNE)").setRequired(true).setMaxLength(120)
                )
                .addStringOption((o) =>
                    o.setName("fecha").setDescription("Texto libre: día y hora del wipe").setRequired(false).setMaxLength(200)
                )
                .addStringOption((o) =>
                    o
                        .setName("lista")
                        .setDescription("A quién recordar si no responde")
                        .setRequired(false)
                        .addChoices(
                            { name: "Roster wipe (/mcv-wipe)", value: "wipe_list" },
                            { name: "Rol del clan (DISCORD_ATTENDANCE_ROLE_ID)", value: "discord_role" }
                        )
                )
        )
        .addSubcommand((sc) =>
            sc
                .setName("recordar")
                .setDescription("Mensaje etiquetando a quienes no respondieron")
                .addIntegerOption((o) =>
                    o.setName("encuesta").setDescription("ID de encuesta (vacío = última activa del canal)").setRequired(false)
                )
        )
        .addSubcommand((sc) =>
            sc
                .setName("cerrar")
                .setDescription("Cierra la encuesta y desactiva botones")
                .addIntegerOption((o) =>
                    o.setName("encuesta").setDescription("ID de encuesta (vacío = última activa del canal)").setRequired(false)
                )
        )
        .toJSON();
}

function attachWipeAttendanceDiscord(client, { getPool }) {
    client.on("interactionCreate", async (interaction) => {
        const pool = getPool();

        if (interaction.isChatInputCommand() && interaction.commandName === "mcv-asistencia") {
            if (!canManageAttendance(interaction)) {
                await interaction.reply({
                    content: "Solo staff puede usar `/mcv-asistencia`.",
                    ephemeral: true
                });
                return;
            }
            if (!pool) {
                await interaction.reply({ content: "Base de datos no disponible.", ephemeral: true });
                return;
            }
            const sub = interaction.options.getSubcommand();
            if (sub === "crear") {
                const title = interaction.options.getString("titulo", true);
                const fecha = interaction.options.getString("fecha") || "";
                const lista = interaction.options.getString("lista") || "wipe_list";
                const channel = interaction.channel;
                if (!channel?.isTextBased()) {
                    await interaction.reply({ content: "Usá el comando en un canal de texto.", ephemeral: true });
                    return;
                }
                await interaction.deferReply({ ephemeral: true });
                try {
                    const ins = await pool.query(
                        `INSERT INTO wipe_attendance_polls (
                            title, event_note, discord_channel_id, discord_message_id,
                            roster_source, created_by_discord_id
                         ) VALUES ($1, $2, $3, 'pending', $4, $5)
                         RETURNING *`,
                        [title, fecha || null, channel.id, lista, interaction.user.id]
                    );
                    const poll = ins.rows[0];
                    const expectedIds = await loadExpectedDiscordIds(pool, interaction.guild, lista);
                    const embed = buildAttendanceEmbed(poll, [], expectedIds);
                    const components = buildAttendanceComponents(poll.id, false);
                    const msg = await channel.send({ embeds: [embed], components });
                    await pool.query(
                        `UPDATE wipe_attendance_polls SET discord_message_id = $2 WHERE id = $1`,
                        [poll.id, msg.id]
                    );
                    poll.discord_message_id = msg.id;
                    await interaction.editReply({
                        content: `Encuesta **${title}** publicada (ID **${poll.id}**). ${expectedIds.length} en la lista esperada.`
                    });
                } catch (e) {
                    console.error("mcv-asistencia crear:", e.message);
                    await interaction.editReply({ content: "No se pudo crear la encuesta." });
                }
                return;
            }

            if (sub === "recordar" || sub === "cerrar") {
                const pollIdOpt = interaction.options.getInteger("encuesta");
                await interaction.deferReply({ ephemeral: true });
                try {
                    const poll = await resolvePollForRemind(pool, interaction.guildId, interaction.channelId, pollIdOpt);
                    if (!poll) {
                        await interaction.editReply({ content: "No hay encuesta activa en este canal." });
                        return;
                    }
                    if (sub === "cerrar") {
                        await pool.query(`UPDATE wipe_attendance_polls SET closed_at = NOW() WHERE id = $1`, [poll.id]);
                        poll.closed_at = new Date();
                        await refreshPollMessage(client, pool, poll);
                        await interaction.editReply({ content: `Encuesta **#${poll.id}** cerrada.` });
                        return;
                    }
                    const responses = await loadResponses(pool, poll.id);
                    const responded = new Set(responses.map((r) => r.discord_user_id));
                    const expectedIds = await loadExpectedDiscordIds(pool, interaction.guild, poll.roster_source);
                    const pending = expectedIds.filter((id) => !responded.has(id));
                    if (!pending.length) {
                        await interaction.editReply({ content: "Todos en la lista ya respondieron." });
                        return;
                    }
                    const channel = interaction.channel;
                    const result = await sendNonResponderReminders(channel, pending, poll.title);
                    await interaction.editReply({
                        content: `Enviado recordatorio a **${result.pending}** persona(s) (${result.sent} mensaje(s)).`
                    });
                } catch (e) {
                    console.error("mcv-asistencia", sub, e.message);
                    await interaction.editReply({ content: "Error al procesar el comando." });
                }
            }
            return;
        }

        if (interaction.isButton()) {
            const pollIdAccept = parsePollId(interaction.customId, "att:a:");
            const pollIdDecline = parsePollId(interaction.customId, "att:d:");
            const pollIdLate = parsePollId(interaction.customId, "att:l:");
            const pollIdRemind = parsePollId(interaction.customId, "att:r:");
            const pollIdClose = parsePollId(interaction.customId, "att:x:");
            const pollId = pollIdAccept || pollIdDecline || pollIdLate || pollIdRemind || pollIdClose;
            if (!pollId || !pool) {
                return;
            }

            const poll = await loadPoll(pool, pollId);
            if (!poll) {
                await interaction.reply({ content: "Encuesta no encontrada.", ephemeral: true }).catch(() => {});
                return;
            }
            if (poll.closed_at && !pollIdRemind && !pollIdClose) {
                await interaction.reply({ content: "Esta encuesta ya está cerrada.", ephemeral: true }).catch(() => {});
                return;
            }

            if (pollIdRemind || pollIdClose) {
                if (!canManageAttendance(interaction)) {
                    await interaction.reply({ content: "Solo staff.", ephemeral: true }).catch(() => {});
                    return;
                }
                await interaction.deferReply({ ephemeral: true });
                try {
                    if (pollIdClose) {
                        await pool.query(`UPDATE wipe_attendance_polls SET closed_at = NOW() WHERE id = $1`, [pollId]);
                        poll.closed_at = new Date();
                        await refreshPollMessage(client, pool, poll);
                        await interaction.editReply({ content: `Encuesta **#${pollId}** cerrada.` });
                        return;
                    }
                    const responses = await loadResponses(pool, pollId);
                    const responded = new Set(responses.map((r) => r.discord_user_id));
                    const channel = await interaction.channel?.fetch?.().catch(() => interaction.channel);
                    const expectedIds = await loadExpectedDiscordIds(pool, interaction.guild, poll.roster_source);
                    const pending = expectedIds.filter((id) => !responded.has(id));
                    if (!pending.length) {
                        await interaction.editReply({ content: "Todos respondieron." });
                        return;
                    }
                    const result = await sendNonResponderReminders(channel, pending, poll.title);
                    await refreshPollMessage(client, pool, poll);
                    await interaction.editReply({
                        content: `Recordatorio enviado a **${result.pending}** (${result.sent} msg).`
                    });
                } catch (e) {
                    console.warn("attendance remind:", e.message);
                    await interaction.editReply({ content: "No se pudo enviar el recordatorio." }).catch(() => {});
                }
                return;
            }

            if (pollIdDecline || pollIdLate) {
                const status = pollIdLate ? "late" : "declined";
                await interaction.showModal(buildExcuseModal(pollId, status));
                return;
            }

            if (pollIdAccept) {
                await interaction.deferReply({ ephemeral: true });
                try {
                    const label = [interaction.user.globalName, interaction.user.username].filter(Boolean).join(" · ");
                    await upsertResponse(pool, {
                        pollId,
                        discordUserId: interaction.user.id,
                        discordUsername: label,
                        status: "accepted",
                        excuseText: null
                    });
                    await refreshPollMessage(client, pool, poll);
                    await interaction.editReply({ content: "✅ Tu respuesta quedó en **Accepted**." });
                } catch (e) {
                    console.warn("attendance accept:", e.message);
                    await interaction.editReply({ content: "No se pudo guardar." }).catch(() => {});
                }
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            const pollIdLate = parsePollId(interaction.customId, "att:md:l:");
            const pollIdDecline = parsePollId(interaction.customId, "att:md:d:");
            const pollId = pollIdLate || pollIdDecline;
            if (!pollId || !pool) {
                return;
            }
            const status = pollIdLate ? "late" : "declined";
            const excuse = String(interaction.fields.getTextInputValue("excuse") || "").trim();
            await interaction.deferReply({ ephemeral: true });
            try {
                const poll = await loadPoll(pool, pollId);
                if (!poll || poll.closed_at) {
                    await interaction.editReply({ content: "Encuesta cerrada." });
                    return;
                }
                const label = [interaction.user.globalName, interaction.user.username].filter(Boolean).join(" · ");
                await upsertResponse(pool, {
                    pollId,
                    discordUserId: interaction.user.id,
                    discordUsername: label,
                    status,
                    excuseText: excuse || null
                });
                await refreshPollMessage(client, pool, poll);
                const meta = STATUS_LABELS[status];
                await interaction.editReply({
                    content: `${meta.emoji} Respuesta guardada: **${meta.label}**${excuse ? `\n> _${excuse.slice(0, 300)}_` : ""}`
                });
            } catch (e) {
                console.warn("attendance modal:", e.message);
                await interaction.editReply({ content: "No se pudo guardar." }).catch(() => {});
            }
        }
    });
}

module.exports = {
    buildMcAsistenciaSlashCommand,
    attachWipeAttendanceDiscord,
    buildAttendanceEmbed,
    buildMentionChunks,
    loadExpectedDiscordIds,
    loadWipeListDiscordIds,
    canManageAttendance
};
