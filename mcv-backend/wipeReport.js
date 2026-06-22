"use strict";

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { shouldScorePlayerProfile } = require("./vitalScoreTiers");
const { resolvePlaytimeSyncWindow, isTimestampInPlaytimeWindow } = require("./vitalWipeCalendar");

const HEX_WIPE_DISCORD_PREFIX = "wipehx:";
const PASTE_WIPE_DISCORD_PREFIX = "paste:";

const WIPE_REPORT_SQL = `
SELECT
    w.discord_user_id,
    w.discord_username,
    w.persona_name,
    w.steam_id64,
    w.updated_at AS linked_at,
    p.hours_played,
    p.updated_at AS hours_updated_at,
    p.performance_score,
    p.display_name AS info_name,
    p.paused_outside_wipe,
    p.wipe_phase,
    p.status_tag
FROM wipe_list_members w
LEFT JOIN player_info_profiles p ON p.steam_id64 = w.steam_id64
WHERE w.discord_user_id NOT LIKE $1
  AND w.discord_user_id NOT LIKE $2
ORDER BY
    COALESCE(p.performance_score, 0) DESC,
    COALESCE(p.hours_played, -1) DESC,
    LOWER(COALESCE(w.persona_name, w.discord_username, w.steam_id64)) ASC
`;

const PLAYER_STATS_SQL = `
SELECT
    w.discord_user_id,
    w.discord_username,
    w.persona_name,
    w.steam_id64,
    w.updated_at AS linked_at,
    p.hours_played,
    p.updated_at AS hours_updated_at,
    p.performance_score,
    p.display_name AS info_name,
    p.paused_outside_wipe,
    p.wipe_phase,
    p.status_tag
FROM wipe_list_members w
LEFT JOIN player_info_profiles p ON p.steam_id64 = w.steam_id64
WHERE w.discord_user_id = $1
LIMIT 1
`;

function displayName(row) {
    const name =
        row.personaName ||
        row.persona_name ||
        row.infoName ||
        row.info_name ||
        row.discordUsername ||
        row.discord_username ||
        row.steamId64 ||
        row.steam_id64 ||
        "Jugador";
    return String(name).trim() || "Jugador";
}

function normalizeHours(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
        return null;
    }
    return Math.round(n);
}

function normalizeScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.round(n);
}

function formatPointsSuffix(row) {
    const score = normalizeScore(row.performanceScore ?? row.performance_score);
    return ` · **${score} pts**`;
}

function resolveActivePlaytimeWindow() {
    return resolvePlaytimeSyncWindow({ at: new Date() });
}

function effectiveHoursForWindow(row, window) {
    const hours = normalizeHours(row.hours_played);
    if (hours == null) {
        return null;
    }
    if (!window || window.phase === "off-season" || window.windowStartMs == null) {
        return hours;
    }
    const updatedRaw = row.hours_updated_at || row.hoursUpdatedAt;
    if (!updatedRaw) {
        return null;
    }
    const ts = new Date(updatedRaw).getTime();
    if (!isTimestampInPlaytimeWindow(ts, window)) {
        return null;
    }
    return hours;
}

function mapWipePlayerRow(row, window = null) {
    const activeWindow = window === undefined ? resolveActivePlaytimeWindow() : window;
    const wipePhase = String(row.wipe_phase || "unknown").trim() || "unknown";
    const pausedOutsideWipe =
        Boolean(row.paused_outside_wipe) || wipePhase === "no_juega";
    return {
        discordUserId: String(row.discord_user_id || ""),
        discordUsername: String(row.discord_username || ""),
        personaName: String(row.persona_name || ""),
        steamId64: String(row.steam_id64 || ""),
        linkedAt: row.linked_at || null,
        hoursPlayed: effectiveHoursForWindow(row, activeWindow),
        hoursUpdatedAt: row.hours_updated_at || null,
        performanceScore: normalizeScore(row.performance_score),
        infoName: String(row.info_name || ""),
        wipePhase,
        statusTag: String(row.status_tag || "").trim(),
        pausedOutsideWipe
    };
}

function isPlayingWipePlayer(row) {
    if (!row) {
        return false;
    }
    return shouldScorePlayerProfile({
        pausedOutsideWipe: row.pausedOutsideWipe,
        wipePhase: row.wipePhase,
        statusTag: row.statusTag
    });
}

/** Solo jugadores que juegan el wipe (no pausados / no_juega / inactivos). */
function filterReportToPlayingWipe(report) {
    const rows = (report?.rows || []).filter(isPlayingWipePlayer);
    const withHours = rows.filter((row) => row.hoursPlayed != null && row.hoursPlayed > 0);
    const pendingHours = rows.filter((row) => row.hoursPlayed == null || row.hoursPlayed <= 0);
    const withPoints = rows.filter((row) => row.performanceScore !== 0);
    const totalPoints = rows.reduce((sum, row) => sum + row.performanceScore, 0);
    return {
        ...report,
        totalLinked: rows.length,
        withHoursCount: withHours.length,
        pendingHoursCount: pendingHours.length,
        withPointsCount: withPoints.length,
        totalPoints,
        withHours,
        pendingHours,
        rows
    };
}

async function loadPlayerStatsForDiscord(pool, discordUserId) {
    if (!pool) {
        throw new Error("Base de datos no disponible");
    }
    const id = String(discordUserId || "").trim();
    if (!id) {
        return null;
    }
    const r = await pool.query(PLAYER_STATS_SQL, [id]);
    if (!r.rows.length) {
        return null;
    }
    return mapWipePlayerRow(r.rows[0], resolveActivePlaytimeWindow());
}

async function loadWipeHoursReport(pool) {
    if (!pool) {
        throw new Error("Base de datos no disponible");
    }
    const r = await pool.query(WIPE_REPORT_SQL, [`${HEX_WIPE_DISCORD_PREFIX}%`, `${PASTE_WIPE_DISCORD_PREFIX}%`]);
    const window = resolveActivePlaytimeWindow();
    const rows = (r.rows || []).map((row) => mapWipePlayerRow(row, window));
    const withHours = rows.filter((row) => row.hoursPlayed != null && row.hoursPlayed > 0);
    const pendingHours = rows.filter((row) => row.hoursPlayed == null || row.hoursPlayed <= 0);
    const withPoints = rows.filter((row) => row.performanceScore !== 0);
    const totalPoints = rows.reduce((sum, row) => sum + row.performanceScore, 0);
    return {
        totalLinked: rows.length,
        withHoursCount: withHours.length,
        pendingHoursCount: pendingHours.length,
        withPointsCount: withPoints.length,
        totalPoints,
        withHours,
        pendingHours,
        rows
    };
}

function formatPlayerLine(row, { showHours }) {
    const name = displayName(row);
    const pts = formatPointsSuffix(row);
    if (showHours) {
        return `• **${name}** — **${row.hoursPlayed}h**${pts}`;
    }
    return `• **${name}** — Steam OK · _sin horas_${pts}`;
}

function chunkLines(lines, maxLen) {
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
    return chunks.length ? chunks : [""];
}

function buildWipeReportEmbeds(report) {
    const embeds = [];
    const summary = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📊 Reporte wipe MCV")
        .setDescription(
            `**Vinculados Discord:** ${report.totalLinked}\n` +
                `**Con horas:** ${report.withHoursCount}\n` +
                `**Steam OK, sin horas:** ${report.pendingHoursCount}\n` +
                `**Con puntos (≠0):** ${report.withPointsCount || 0}\n\n` +
                `_Usá \`/mcv-wipe\` para vincular Steam y \`/mcv-horas\` o #playtime para cargar horas._`
        );
    embeds.push(summary);

    if (report.withHours.length) {
        const lines = report.withHours.map((row, i) =>
            `${i + 1}. ${formatPlayerLine(row, { showHours: true }).replace(/^•\s*/, "")}`
        );
        chunkLines(lines, 1000).forEach((chunk, idx) => {
            embeds.push(
                new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle(idx === 0 ? "✅ Horas + puntos" : `✅ Horas + puntos (${idx + 1})`)
                    .setDescription(chunk)
            );
        });
    }

    if (report.pendingHours.length) {
        const lines = report.pendingHours.map((row) => formatPlayerLine(row, { showHours: false }));
        chunkLines(lines, 1000).forEach((chunk, idx) => {
            embeds.push(
                new EmbedBuilder()
                    .setColor(0xfaa61a)
                    .setTitle(idx === 0 ? "⏳ Sin horas aún" : `⏳ Sin horas (${idx + 1})`)
                    .setDescription(chunk)
            );
        });
    }

    if (!report.totalLinked) {
        embeds.length = 0;
        embeds.push(
            new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("📊 Reporte wipe MCV")
                .setDescription("Todavía nadie vinculó Steam con `/mcv-wipe`.")
        );
    }

    return embeds.slice(0, 10);
}

function buildMcReporteSlashCommand() {
    return new SlashCommandBuilder()
        .setName("mcv-reporte")
        .setDescription("Horas y puntos del wipe: quién vinculó Steam y cuánto tiene cada uno")
        .addStringOption((o) =>
            o
                .setName("filtro")
                .setDescription("Qué jugadores mostrar")
                .setRequired(false)
                .addChoices(
                    { name: "Todos", value: "todos" },
                    { name: "Solo con horas", value: "con_horas" },
                    { name: "Solo sin horas", value: "sin_horas" }
                )
        )
        .addBooleanOption((o) =>
            o.setName("privado").setDescription("Si true, solo vos ves el reporte").setRequired(false)
        )
        .toJSON();
}

function buildMcSinHorasSlashCommand() {
    return new SlashCommandBuilder()
        .setName("mcv-sin-horas")
        .setDescription("Etiqueta a quien juega el wipe y no cargó horas (excluye pausados)")
        .setDescriptionLocalizations({
            "en-US": "Tag active wipe players who haven't submitted hours (excludes paused)",
            "en-GB": "Tag active wipe players who haven't submitted hours (excludes paused)"
        })
        .addBooleanOption((o) =>
            o
                .setName("privado")
                .setDescription("Si true, solo vos ves el mensaje (sin ping en el canal)")
                .setDescriptionLocalizations({
                    "en-US": "If true, only you see the message (no channel ping)",
                    "en-GB": "If true, only you see the message (no channel ping)"
                })
                .setRequired(false)
        )
        .addBooleanOption((o) =>
            o
                .setName("sin_etiquetar")
                .setDescription("Solo listar nombres, sin @mentions")
                .setDescriptionLocalizations({
                    "en-US": "List names only, no @mentions",
                    "en-GB": "List names only, no @mentions"
                })
                .setRequired(false)
        )
        .toJSON();
}

function buildMcNoHoursSlashCommand() {
    return new SlashCommandBuilder()
        .setName("mcv-no-hours")
        .setDescription("Tag active wipe players who haven't submitted hours (excludes paused)")
        .setDescriptionLocalizations({
            "es-ES": "Etiqueta a quien juega el wipe y no cargó horas (excluye pausados)",
            "es-419": "Etiqueta a quien juega el wipe y no cargó horas (excluye pausados)"
        })
        .addBooleanOption((o) =>
            o
                .setName("private")
                .setDescription("If true, only you see the message (no channel ping)")
                .setDescriptionLocalizations({
                    "es-ES": "Si true, solo vos ves el mensaje (sin ping en el canal)",
                    "es-419": "Si true, solo vos ves el mensaje (sin ping en el canal)"
                })
                .setRequired(false)
        )
        .addBooleanOption((o) =>
            o
                .setName("no_mentions")
                .setDescription("List names only, no @mentions")
                .setDescriptionLocalizations({
                    "es-ES": "Solo listar nombres, sin @mentions",
                    "es-419": "Solo listar nombres, sin @mentions"
                })
                .setRequired(false)
        )
        .toJSON();
}

const SIN_HORAS_UI = {
    allDone:
        "✅ Todos los que juegan el wipe ya tienen horas cargadas.\n✅ Everyone actively on wipe already has hours logged.",
    noData: "Sin datos. / No data.",
    noPerm:
        "No tenés permiso para este comando. Pedí a staff si lo necesitás.\nYou don't have permission for this command. Ask staff if you need it.",
    noDb:
        "El servidor no tiene base de datos configurada.\nDatabase is not configured on this server.",
    error:
        "No se pudo generar el listado. Probá de nuevo en unos segundos.\nCould not build the list. Try again in a few seconds."
};

function sinHorasHeader(n) {
    return (
        `⏰ **Faltan cargar horas** (${n} jugador${n === 1 ? "" : "es"})\n` +
        `⏰ **Hours missing** (${n} player${n === 1 ? "" : "s"})\n\n`
    );
}

function sinHorasCont(n) {
    return `⏰ **Sin horas / Missing hours** (${n})\n\n`;
}

function sinHorasContMore(n) {
    return `⏰ **Sin horas / Missing hours** (continuación ${n} / continued ${n})\n\n`;
}

function sinHorasFooter() {
    return (
        "\n\nUsá **`/mcv-horas`** o posteá en #playtime (ej. `31h`). Sin Steam: **`/mcv-wipe`**\n" +
        "Use **`/mcv-horas`** or post in #playtime (e.g. `31h`). No Steam link: **`/mcv-wipe`**"
    );
}

function sinHorasNoDiscord() {
    return (
        "\n\n_Sin Discord vinculado para @ — usá `/mcv-wipe`._\n" +
        "_No Discord link for @ — use `/mcv-wipe`._"
    );
}

function sinHorasNoDiscordExtra(n) {
    return (
        `\n\n_${n} en la lista sin Discord real para etiquetar._\n` +
        `_${n} on the list without a valid Discord account to tag._`
    );
}

function sinHorasMoreNames(n) {
    return `\n_…y ${n} más / …and ${n} more_`;
}

function readSinHorasOptions(interaction, cmd) {
    if (cmd === "mcv-no-hours") {
        return {
            privado: interaction.options.getBoolean("private") === true,
            sinEtiquetar: interaction.options.getBoolean("no_mentions") === true
        };
    }
    return {
        privado: interaction.options.getBoolean("privado") === true,
        sinEtiquetar: interaction.options.getBoolean("sin_etiquetar") === true
    };
}

const DISCORD_MENTION_ID_RE = /^[0-9]{16,20}$/;

function collectPendingDiscordUserIds(report) {
    const pending = report?.pendingHours || [];
    const ids = pending
        .map((row) => String(row.discordUserId || row.discord_user_id || "").trim())
        .filter((id) => DISCORD_MENTION_ID_RE.test(id));
    return [...new Set(ids)];
}

/**
 * Genera uno o más mensajes con @mentions para quien falta cargar horas.
 * @returns {{ chunks: Array<{ content: string, userIds: string[] }>, totalPending: number }}
 */
function buildSinHorasPingChunks(report, { noMentions = false, maxMentionsPerChunk = 35 } = {}) {
    const pending = report?.pendingHours || [];
    const totalPending = pending.length;
    const footer = sinHorasFooter();

    if (!totalPending) {
        return {
            chunks: [{ content: SIN_HORAS_UI.allDone, userIds: [] }],
            totalPending: 0
        };
    }

    const header = sinHorasHeader(totalPending);

    if (noMentions) {
        const lines = pending.map((row) => `• **${displayName(row)}**`);
        const lineChunks = chunkLines(lines, 1550);
        const chunks = lineChunks.map((chunk, idx) => ({
            content:
                (idx === 0 ? header : sinHorasCont(idx + 1)) +
                chunk +
                (idx === lineChunks.length - 1 ? footer : ""),
            userIds: []
        }));
        return { chunks, totalPending };
    }

    const userIds = collectPendingDiscordUserIds(report);
    if (!userIds.length) {
        const names = pending
            .slice(0, 40)
            .map((row) => `• **${displayName(row)}**`)
            .join("\n");
        const extra = pending.length > 40 ? sinHorasMoreNames(pending.length - 40) : "";
        return {
            chunks: [
                {
                    content: `${header}${names}${extra}${footer}${sinHorasNoDiscord()}`,
                    userIds: []
                }
            ],
            totalPending
        };
    }

    const chunks = [];
    for (let i = 0; i < userIds.length; i += maxMentionsPerChunk) {
        const batch = userIds.slice(i, i + maxMentionsPerChunk);
        const isFirst = chunks.length === 0;
        const isLast = i + maxMentionsPerChunk >= userIds.length;
        let content =
            (isFirst ? header : sinHorasContMore(chunks.length + 1)) +
            batch.map((id) => `<@${id}>`).join(" ");
        if (isLast) {
            content += footer;
            if (pending.length > userIds.length) {
                content += sinHorasNoDiscordExtra(pending.length - userIds.length);
            }
        }
        chunks.push({ content, userIds: batch });
    }

    return { chunks, totalPending };
}

function canRunWipeReport(interaction) {
    if (String(process.env.MCV_WIPE_REPORT_STAFF_ONLY || "").trim() !== "1") {
        return true;
    }
    const perms = interaction.memberPermissions;
    if (!perms) {
        return false;
    }
    return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild);
}

function filterReport(report, filtro) {
    const f = String(filtro || "todos").trim();
    if (f === "con_horas") {
        return {
            ...report,
            pendingHours: [],
            pendingHoursCount: 0,
            totalLinked: report.withHoursCount,
            rows: report.withHours
        };
    }
    if (f === "sin_horas") {
        return {
            ...report,
            withHours: [],
            withHoursCount: 0,
            totalLinked: report.pendingHoursCount,
            rows: report.pendingHours
        };
    }
    return report;
}

function attachWipeReportDiscord(client, { getPool }) {
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand()) {
            return;
        }
        const cmd = interaction.commandName;
        if (cmd !== "mcv-reporte" && cmd !== "mcv-sin-horas" && cmd !== "mcv-no-hours") {
            return;
        }
        if (!canRunWipeReport(interaction)) {
            await interaction.reply({
                content:
                    cmd === "mcv-reporte"
                        ? "No tenés permiso para este comando. Pedí a staff si lo necesitás."
                        : SIN_HORAS_UI.noPerm,
                ephemeral: true
            });
            return;
        }
        const pool = getPool();
        if (!pool) {
            await interaction.reply({
                content:
                    cmd === "mcv-reporte"
                        ? "El servidor no tiene base de datos configurada."
                        : SIN_HORAS_UI.noDb,
                ephemeral: true
            });
            return;
        }

        if (cmd === "mcv-sin-horas" || cmd === "mcv-no-hours") {
            const opts = readSinHorasOptions(interaction, cmd);
            await interaction.deferReply({ ephemeral: opts.privado });
            try {
                const raw = await loadWipeHoursReport(pool);
                const report = filterReportToPlayingWipe(raw);
                const { chunks, totalPending } = buildSinHorasPingChunks(report, {
                    noMentions: opts.sinEtiquetar
                });
                const first = chunks[0] || { content: SIN_HORAS_UI.noData, userIds: [] };
                await interaction.editReply({
                    content: first.content,
                    allowedMentions: first.userIds.length ? { users: first.userIds } : { parse: [] }
                });
                for (let i = 1; i < chunks.length; i += 1) {
                    const part = chunks[i];
                    await interaction.followUp({
                        content: part.content,
                        allowedMentions: part.userIds.length ? { users: part.userIds } : { parse: [] },
                        ephemeral: opts.privado
                    });
                }
                if (totalPending > 0 && !opts.privado && !opts.sinEtiquetar && first.userIds.length) {
                    console.log(`mcv-sin-horas: ${totalPending} pendientes, ${collectPendingDiscordUserIds(report).length} mentions`);
                }
            } catch (e) {
                console.error("mcv-sin-horas:", e.message);
                await interaction.editReply({
                    content: SIN_HORAS_UI.error
                });
            }
            return;
        }

        const filtro = interaction.options.getString("filtro") || "todos";
        const privado = interaction.options.getBoolean("privado") === true;
        const ephemeral = privado;
        await interaction.deferReply({ ephemeral });
        try {
            const raw = await loadWipeHoursReport(pool);
            const report = filterReport(raw, filtro);
            const embeds = buildWipeReportEmbeds(report);
            await interaction.editReply({ embeds });
        } catch (e) {
            console.error("mcv-reporte:", e.message);
            await interaction.editReply({ content: "No se pudo generar el reporte. Probá de nuevo en unos segundos." });
        }
    });
}

module.exports = {
    loadWipeHoursReport,
    loadPlayerStatsForDiscord,
    displayName,
    buildWipeReportEmbeds,
    formatPlayerLine,
    buildMcReporteSlashCommand,
    buildMcSinHorasSlashCommand,
    buildMcNoHoursSlashCommand,
    buildSinHorasPingChunks,
    collectPendingDiscordUserIds,
    isPlayingWipePlayer,
    filterReportToPlayingWipe,
    attachWipeReportDiscord,
    canRunWipeReport,
    filterReport,
    effectiveHoursForWindow,
    resolveActivePlaytimeWindow
};
