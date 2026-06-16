"use strict";

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { loadWipeHoursReport, loadPlayerStatsForDiscord, displayName, filterReportToPlayingWipe } = require("./wipeReport");
const { fetchTierScoresPayload } = require("./vitalRustApi");
const { buildYoDetailEmbeds, loadPlayerYoDetail } = require("./discordPlayerYo");

function buildMcYoSlashCommand() {
    return new SlashCommandBuilder()
        .setName("mcv-yo")
        .setDescription("Tu Steam, horas, puntos y desglose detallado (stats + extras)")
        .toJSON();
}

function buildMcTopSlashCommand() {
    return new SlashCommandBuilder()
        .setName("mcv-top")
        .setDescription("Top jugadores del wipe por puntos (scoring admin)")
        .addIntegerOption((o) =>
            o
                .setName("cantidad")
                .setDescription("Cuántos mostrar (5–25)")
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(25)
        )
        .toJSON();
}

/** @deprecated Usar buildYoDetailEmbeds — se mantiene para tests legacy */
function buildYoEmbed(stats) {
    return buildYoDetailEmbeds(stats, null)[0];
}

function buildTopEmbed(rows, limit) {
    const lim = Math.min(Math.max(limit || 10, 5), 25);
    const top = [...rows]
        .sort((a, b) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0) || (b.hoursPlayed ?? 0) - (a.hoursPlayed ?? 0))
        .slice(0, lim);

    if (!top.length) {
        return new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🏆 Top puntos wipe")
            .setDescription("Todavía no hay jugadores con Steam vinculado. Usá `/mcv-wipe` primero.");
    }

    const lines = top.map((row, i) => {
        const name = displayName(row);
        const pts = row.performanceScore ?? 0;
        const h = row.hoursPlayed != null && row.hoursPlayed > 0 ? ` · ${row.hoursPlayed}h` : "";
        return `**${i + 1}.** ${name} — **${pts} pts**${h}`;
    });

    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🏆 Top ${top.length} — puntos wipe`)
        .setDescription(lines.join("\n"))
        .setFooter({ text: "Puntos = performance_score del admin (scoring Vital + ajustes manuales)" });
}

async function assignWipeLinkedRole(interaction) {
    const roleId = String(process.env.DISCORD_WIPE_LINKED_ROLE_ID || "").trim();
    if (!roleId || !interaction.guild) {
        return false;
    }
    try {
        let member = interaction.member;
        if (!member?.roles?.cache) {
            member = await interaction.guild.members.fetch(interaction.user.id);
        }
        if (member.roles.cache.has(roleId)) {
            return true;
        }
        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
            console.warn(`Discord: rol wipe ${roleId} no encontrado`);
            return false;
        }
        await member.roles.add(role);
        return true;
    } catch (e) {
        console.warn("assignWipeLinkedRole:", e.message);
        return false;
    }
}

function buildReminderEmbed(report) {
    const pending = report.pendingHours || [];
    if (!pending.length) {
        return null;
    }
    const names = pending.slice(0, 25).map((r) => displayName(r)).join(", ");
    const extra = pending.length > 25 ? `\n_…y ${pending.length - 25} más_` : "";
    return new EmbedBuilder()
        .setColor(0xfaa61a)
        .setTitle("⏰ Recordatorio wipe — faltan horas")
        .setDescription(
            `**${pending.length}** jugador(es) tienen Steam OK pero **no cargaron horas**.\n\n` +
                `${names}${extra}\n\n` +
                `Usá **\`/mcv-horas\`** o posteá en #playtime (ej. \`31h\`).\n` +
                `Si no vinculaste Steam: **\`/mcv-wipe\`**`
        );
}

function startWipeReminderScheduler(client, { getPool, getChannelId }) {
    if (String(process.env.MCV_WIPE_REMINDER_ENABLED || "").trim() !== "1") {
        return;
    }
    const channelId = String(getChannelId?.() || "").trim();
    if (!channelId) {
        console.warn("MCV_WIPE_REMINDER_ENABLED=1 pero falta canal (DISCORD_WIPE_REMINDER_CHANNEL_ID o DISCORD_PLAYTIME_CHANNEL_ID)");
        return;
    }
    const hours = Math.max(6, Number(process.env.MCV_WIPE_REMINDER_INTERVAL_HOURS) || 24);
    const ms = hours * 3600 * 1000;

    async function tick() {
        if (!client.isReady?.()) {
            return;
        }
        const pool = getPool();
        if (!pool) {
            return;
        }
        try {
            const report = filterReportToPlayingWipe(await loadWipeHoursReport(pool));
            const embed = buildReminderEmbed(report);
            if (!embed) {
                return;
            }
            const ch = await client.channels.fetch(channelId).catch(() => null);
            if (!ch || !ch.isTextBased()) {
                return;
            }
            await ch.send({ embeds: [embed] });
            console.log(`Wipe reminder: ${report.pendingHoursCount} pendientes sin horas → canal ${channelId}`);
        } catch (e) {
            console.warn("wipe reminder:", e.message);
        }
    }

    setInterval(() => tick().catch(() => {}), ms);
    setTimeout(() => tick().catch(() => {}), 5 * 60 * 1000);
    console.log(`Wipe reminder activo: cada ${hours}h en canal ${channelId}`);
}

function attachWipeYoTopDiscord(client, { getPool }) {
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand()) {
            return;
        }
        const cmd = interaction.commandName;
        if (cmd !== "mcv-yo" && cmd !== "mcv-top") {
            return;
        }
        const pool = getPool();
        if (!pool) {
            await interaction.reply({ content: "El servidor no tiene base de datos configurada.", ephemeral: true });
            return;
        }
        if (cmd === "mcv-yo") {
            await interaction.deferReply({ ephemeral: true });
            try {
                const yo = await loadPlayerYoDetail(getPool, fetchTierScoresPayload, interaction.user.id);
                const embeds = buildYoDetailEmbeds(yo.stats, yo.detail);
                await interaction.editReply({ embeds });
            } catch (e) {
                console.error("mcv-yo:", e.message);
                await interaction.editReply({ content: "No se pudo cargar tu info. Probá de nuevo en unos segundos." });
            }
            return;
        }
        await interaction.deferReply();
        try {
            const limit = interaction.options.getInteger("cantidad") || 10;
            const report = await loadWipeHoursReport(pool);
            await interaction.editReply({ embeds: [buildTopEmbed(report.rows, limit)] });
        } catch (e) {
            console.error("mcv-top:", e.message);
            await interaction.editReply({ content: "No se pudo cargar el ranking. Probá de nuevo." });
        }
    });
}

module.exports = {
    buildMcYoSlashCommand,
    buildMcTopSlashCommand,
    buildYoEmbed,
    buildTopEmbed,
    assignWipeLinkedRole,
    startWipeReminderScheduler,
    attachWipeYoTopDiscord
};
