"use strict";

const { EmbedBuilder } = require("discord.js");
const { getTierScoreConfig } = require("./vitalScoreTiers");
const { displayName } = require("./wipeReport");

function formatStatValue(key, raw) {
    if (raw == null || raw === "") return "—";
    const n = Number(raw);
    if (!Number.isFinite(n)) return String(raw);
    if (key === "kdr") return n.toFixed(2);
    if (key === "hours" || key === "killsT30" || key === "building") return String(Math.round(n));
    if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return String(Math.round(n));
}

function getStatTierProgress(cat, rawValue) {
    if (!cat?.tiers?.length) return { currentPts: 0, targetMin: null, targetPts: null };
    let value = Number(rawValue);
    if (!Number.isFinite(value)) value = 0;
    const tiers = cat.tiers.slice().sort((a, b) => a.min - b.min);
    let currentIdx = 0;
    for (let i = 0; i < tiers.length; i++) {
        if (value >= tiers[i].min) currentIdx = i;
        else break;
    }
    const currentPts = tiers[currentIdx] ? Number(tiers[currentIdx].points) : 0;
    let nextNeutral = null;
    let nextUp = null;
    for (const tier of tiers) {
        if (tier.min > value && tier.points >= 0 && !nextNeutral) nextNeutral = tier;
        if (tier.min > value && tier.points > currentPts && !nextUp) nextUp = tier;
    }
    const target = currentPts < 0 ? nextNeutral : nextUp;
    return {
        currentPts,
        targetMin: target ? target.min : null,
        targetPts: target ? target.points : null
    };
}

function statEmoji(points, isLeader) {
    const n = Number(points);
    if (isLeader && n > 0) return "✅";
    if (n > 0) return "✅";
    if (n < 0) return "❌";
    return "⚠️";
}

function formatPoints(points) {
    const n = Number(points);
    if (!Number.isFinite(n)) return "0 pts";
    const sign = n > 0 ? "+" : "";
    return `**${sign}${n} pts**`;
}

function formatBreakdownField(item, config) {
    const cat = config?.categories?.[item.id];
    const progress = cat ? getStatTierProgress(cat, item.raw) : null;
    const rawFmt = formatStatValue(item.id, item.raw);
    let progressText;
    if (progress?.targetMin != null) {
        progressText = `${rawFmt} / ${formatStatValue(item.id, progress.targetMin)} requeridos`;
    } else {
        progressText = `${rawFmt} logrado`;
    }
    const leader = item.isLeader ? " · _líder_" : "";
    const name = `${statEmoji(item.points, item.isLeader)} ${item.label}${leader}`;
    const value = `${progressText} · ${formatPoints(item.points)}`;
    return { name: name.slice(0, 256), value: value.slice(0, 1024), inline: false };
}

function formatExtraLine(item) {
    return `• **${item.label.replace(/^Extra:\s*/, "")}** · ${formatPoints(item.points)}`;
}

function buildYoNoLinkEmbed() {
    return new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("📋 Tu wipe MCV")
        .setDescription(
            "Todavía no vinculaste Steam.\n\n" +
                "1. Usá **`/mcv-wipe`** con tu SteamID64 (17 dígitos)\n" +
                "2. Después **`/mcv-horas`** o posteá tus horas en #playtime (`31h`)\n" +
                "3. Volvé acá con **`/mcv-yo`** para ver el desglose de puntos"
        );
}

function buildYoDetailEmbeds(stats, detail) {
    if (!stats) {
        return [buildYoNoLinkEmbed()];
    }

    const tierPlayer = detail?.tierPlayer || null;
    const resolved = detail?.resolved || null;
    const config = detail?.config || null;
    const vitalMissing = Boolean(detail?.vitalMissing);
    const name = displayName(stats);
    const hasHours = stats.hoursPlayed != null && stats.hoursPlayed > 0;
    const total = tierPlayer?.total ?? stats.performanceScore ?? 0;
    const color = total < 0 ? 0xed4245 : total > 0 ? 0x57f287 : 0xfaa61a;

    const descParts = [
        `**Steam:** \`${stats.steamId64}\``,
        `**Horas wipe:** ${hasHours ? `**${stats.hoursPlayed}h**` : "_sin cargar_ (`/mcv-horas` o #playtime)_"}`,
        `**Total puntos:** **${total} pts**`
    ];
    if (resolved?.configLabel) {
        descParts.push(`**Tabla:** ${resolved.configLabel}${resolved.periodLabel ? ` · ${resolved.periodLabel}` : ""}`);
    }
    if (vitalMissing) {
        descParts.push("_⚠️ Sin stats Vital en este wipe/servidor (farm/combate pueden estar en 0)._");
    }

    const summary = new EmbedBuilder().setColor(color).setTitle(`📋 ${name}`).setDescription(descParts.join("\n"));

    if (!tierPlayer) {
        summary.addFields({
            name: "Desglose",
            value: "No se pudo calcular el scoring. Probá de nuevo en unos minutos.",
            inline: false
        });
        return [summary];
    }

    if (tierPlayer.skipped) {
        summary.addFields({
            name: "⏸ Sin scoring automático",
            value:
                "Estás pausado o sin fase wipe (Inicio/Late). Pedí a staff que te active en el panel para sumar puntos por stats.",
            inline: false
        });
        return [summary];
    }

    const statFields = [];
    const extraLines = [];
    for (const item of tierPlayer.breakdown || []) {
        if (String(item.id || "").startsWith("extra_")) {
            extraLines.push(formatExtraLine(item));
        } else if (config) {
            statFields.push(formatBreakdownField(item, config));
        }
    }

    for (const field of statFields.slice(0, 25)) {
        summary.addFields(field);
    }

    const embeds = [summary];
    if (extraLines.length) {
        const chunks = [];
        let cur = "";
        for (const line of extraLines) {
            const next = cur ? `${cur}\n${line}` : line;
            if (next.length > 1000) {
                if (cur) chunks.push(cur);
                cur = line;
            } else {
                cur = next;
            }
        }
        if (cur) chunks.push(cur);
        chunks.forEach((chunk, idx) => {
            embeds.push(
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle(idx === 0 ? "⭐ Extras manuales" : `⭐ Extras (${idx + 1})`)
                    .setDescription(chunk)
            );
        });
    }

    return embeds.slice(0, 10);
}

async function loadPlayerYoDetail(getPool, fetchTierScoresPayloadFn, discordUserId, opts = {}) {
    const { loadPlayerStatsForDiscord } = require("./wipeReport");
    const { normalizeSteamId64 } = require("./vitalRustApi");
    const pool = getPool();
    if (!pool) {
        throw new Error("Base de datos no disponible");
    }
    const stats = await loadPlayerStatsForDiscord(pool, discordUserId);
    if (!stats) {
        return { stats: null, detail: null };
    }
    const steamId64 = normalizeSteamId64(stats.steamId64);
    const serverKey = String(opts.serverKey || process.env.VITAL_DEFAULT_SERVER_KEY || "eu-monthly").trim();
    let payload;
    try {
        payload = await fetchTierScoresPayloadFn(getPool, {
            serverKey,
            wipeIdRaw: opts.wipeId || "current",
            refresh: Boolean(opts.refresh)
        });
    } catch (e) {
        return {
            stats,
            detail: { tierPlayer: null, error: e.message || "Error al calcular puntos" }
        };
    }
    const tierPlayer = (payload.tierResult?.players || []).find((p) => p.steamId64 === steamId64) || null;
    const config = getTierScoreConfig(payload.tierResult?.configKey);
    const vitalMissing = Array.isArray(payload.notFound) && payload.notFound.includes(steamId64);
    return {
        stats,
        detail: {
            tierPlayer,
            config,
            resolved: payload.resolved,
            vitalMissing,
            error: null
        }
    };
}

module.exports = {
    formatStatValue,
    getStatTierProgress,
    buildYoDetailEmbeds,
    buildYoNoLinkEmbed,
    loadPlayerYoDetail
};
