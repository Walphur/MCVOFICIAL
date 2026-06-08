"use strict";

const { resolveTierConfigKey } = require("./vitalWipeCalendar");

const TIER_RANKS = [-3, -2, -1, 0, 1, 2, 3, 4, 5];

function tiersFromMins(mins, pointRanks = TIER_RANKS) {
    return mins.map((min, i) => ({
        min: min === undefined || min === null || min === "-" ? (i === 0 ? 0 : Infinity) : min,
        points: pointRanks[i] ?? 0
    }));
}

function buildStandardTiers(mins) {
    const normalized = mins.map((m) => (m === Infinity || m === "Leader" || m === "Builder" ? Infinity : Number(m)));
    return tiersFromMins(normalized);
}

function buildWoodMediumTiers() {
    return [
        { points: 0, min: 0 },
        { points: 1, min: 500000 },
        { points: 2, min: 750000 },
        { points: 3, min: 2000000 },
        { points: 4, min: 10000000 },
        { points: 5, min: Infinity }
    ];
}

function buildWoodMonthlyTiers() {
    return [
        { points: 0, min: 0 },
        { points: 0, min: 500000 },
        { points: 1, min: 750000 },
        { points: 2, min: 1500000 },
        { points: 3, min: 4000000 },
        { points: 4, min: 15000000 },
        { points: 5, min: Infinity }
    ];
}

function buildBuildingMediumTiers() {
    return [
        { points: 0, min: 0 },
        { points: 1, min: 1000 },
        { points: 2, min: 1500 },
        { points: 3, min: 3000 },
        { points: 4, min: 10000 },
        { points: 5, min: Infinity }
    ];
}

function buildBuildingMonthlyTiers() {
    return [
        { points: 0, min: 0 },
        { points: 1, min: 2000 },
        { points: 2, min: 3000 },
        { points: 3, min: 6000 },
        { points: 4, min: 15000 },
        { points: 5, min: Infinity }
    ];
}

/** Extras manuales (admin toggles) — no se infieren de roles. */
const EXTRA_POINT_CATALOG = [
    { key: "nothing", label: "NOTHING", points: 0 },
    { key: "locker", label: "LOCKER", points: 2 },
    { key: "externals_turret", label: "EXTERNALS+TURRET", points: 4 },
    { key: "elec_windmill", label: "ELEC+WINDMILL", points: 4 },
    { key: "furnace_cp", label: "FURNACE CP", points: 3 },
    { key: "open_core", label: "OPEN CORE", points: 6 },
    { key: "doors", label: "DOORS", points: 2 },
    { key: "outpost_trade", label: "OUTPOST+TRADE", points: 2 },
    { key: "autocrafter", label: "AUTOCRAFTER", points: 3 },
    { key: "huerto", label: "HUERTERO", points: 6 },
    { key: "horse", label: "HORSE", points: 6 },
    { key: "crafter", label: "CRAFTER", points: 4 },
    { key: "turret", label: "TURRET", points: 4 },
    { key: "vending", label: "VENDING", points: 4 },
    { key: "chupona", label: "CHUPONA", points: 2 },
    { key: "volar_viajes", label: "VOLAR+VIAJES", points: 4 },
    { key: "leeeech", label: "LEEEEECH", points: -3 },
    { key: "romper_mini", label: "ROMPER MINI", points: -0.25, stackable: true },
    { key: "romper_combat", label: "ROMPER COMBAT", points: -0.5, stackable: true }
];

const EXTRA_BY_KEY = Object.fromEntries(EXTRA_POINT_CATALOG.filter((e) => e.key !== "nothing").map((e) => [e.key, e]));

const EU_MEDIUM_CONFIG = {
    key: "eu-medium",
    label: "EU Medium 2x",
    categories: {
        killsT30: {
            label: "Kill T3",
            leaderTier: true,
            tiers: buildStandardTiers([0, 10, 15, 20, 30, 40, 60, 80, Infinity])
        },
        kdr: {
            label: "K/D",
            leaderTier: false,
            tiers: buildStandardTiers([0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, Infinity])
        },
        hours: {
            label: "Horas",
            leaderTier: false,
            tiers: buildStandardTiers([0, 10, 15, 25, 30, 35, 45, 55, Infinity])
        },
        farmWood: {
            label: "Wood",
            leaderTier: true,
            leaderMin: 500000,
            tiers: buildWoodMediumTiers()
        },
        farmMetal: {
            label: "Metal",
            leaderTier: true,
            tiers: buildStandardTiers([0, 100000, 150000, 200000, 300000, 400000, 600000, 800000, Infinity])
        },
        farmSulfur: {
            label: "Sulfur",
            leaderTier: true,
            tiers: buildStandardTiers([0, 50000, 75000, 150000, 200000, 300000, 400000, 500000, Infinity])
        },
        scrapLooted: {
            label: "Scrap",
            leaderTier: true,
            tiers: buildStandardTiers([0, 1000, 2000, 2500, 4000, 6000, 8000, 10000, Infinity])
        },
        building: {
            label: "Building",
            leaderTier: false,
            tiers: buildBuildingMediumTiers()
        }
    }
};

const EU_MONTHLY_CONFIG = {
    key: "eu-monthly",
    label: "EU Monthly 2x",
    categories: {
        killsT30: {
            label: "Kill T3",
            leaderTier: true,
            tiers: buildStandardTiers([0, 20, 30, 40, 60, 80, 120, 160, Infinity])
        },
        kdr: {
            label: "K/D",
            leaderTier: false,
            tiers: buildStandardTiers([0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, Infinity])
        },
        hours: {
            label: "Horas",
            leaderTier: false,
            tiers: buildStandardTiers([0, 20, 30, 50, 60, 70, 85, 100, Infinity])
        },
        farmWood: {
            label: "Wood",
            leaderTier: true,
            leaderMin: 500000,
            tiers: buildWoodMonthlyTiers()
        },
        farmMetal: {
            label: "Metal",
            leaderTier: true,
            tiers: buildStandardTiers([0, 150000, 350000, 650000, 850000, 1000000, 1300000, 1700000, Infinity])
        },
        farmSulfur: {
            label: "Sulfur",
            leaderTier: true,
            tiers: buildStandardTiers([0, 100000, 250000, 400000, 600000, 700000, 900000, 1100000, Infinity])
        },
        scrapLooted: {
            label: "Scrap",
            leaderTier: true,
            tiers: buildStandardTiers([0, 2000, 3500, 5000, 7000, 8500, 10000, 15000, Infinity])
        },
        building: {
            label: "Building",
            leaderTier: false,
            tiers: buildBuildingMonthlyTiers()
        }
    }
};

const CONFIG_BY_KEY = {
    "eu-medium": EU_MEDIUM_CONFIG,
    "eu-monthly": EU_MONTHLY_CONFIG
};

function getTierScoreConfig(configKey) {
    const key = String(configKey || "eu-medium").trim();
    return CONFIG_BY_KEY[key] || null;
}

function resolveTierScoreConfig({ serverKey, at = new Date() }) {
    const resolved = resolveTierConfigKey({ serverKey, at });
    const config = getTierScoreConfig(resolved.configKey);
    if (!config) {
        throw new Error("Config de tiers inválida");
    }
    return { ...resolved, config };
}

function listTierScoreConfigs() {
    return Object.values(CONFIG_BY_KEY).map((c) => ({
        key: c.key,
        label: c.label,
        categories: Object.entries(c.categories).map(([id, cat]) => ({
            id,
            label: cat.label,
            leaderTier: cat.leaderTier,
            tiers: cat.tiers.filter((t) => Number.isFinite(t.min) && t.min !== Infinity)
        })),
        extraPoints: EXTRA_POINT_CATALOG.filter((e) => e.key !== "nothing")
    }));
}

function listExtraPointCatalog() {
    return EXTRA_POINT_CATALOG.filter((e) => e.key !== "nothing").map((e) => ({
        key: e.key,
        label: e.label,
        points: e.points,
        stackable: Boolean(e.stackable)
    }));
}

function isStackableExtraKey(key) {
    const item = EXTRA_BY_KEY[String(key || "").trim()];
    return Boolean(item?.stackable);
}

function normalizeExtraCounts(extraKeys, extraCounts) {
    const counts = {};
    if (extraCounts && typeof extraCounts === "object" && !Array.isArray(extraCounts)) {
        for (const [rawKey, rawQty] of Object.entries(extraCounts)) {
            const key = String(rawKey || "").trim();
            const item = EXTRA_BY_KEY[key];
            if (!item) {
                continue;
            }
            const qty = Math.max(0, Math.min(99, Math.floor(Number(rawQty) || 0)));
            if (qty > 0) {
                counts[key] = qty;
            }
        }
    }
    const keys = Array.isArray(extraKeys) ? extraKeys : [];
    for (const raw of keys) {
        const key = String(raw || "").trim();
        const item = EXTRA_BY_KEY[key];
        if (!item) {
            continue;
        }
        if (isStackableExtraKey(key)) {
            counts[key] = (counts[key] || 0) + 1;
        } else if (!counts[key]) {
            counts[key] = 1;
        }
    }
    return counts;
}

function expandExtraKeysFromCounts(extraCounts) {
    const counts = normalizeExtraCounts([], extraCounts);
    const keys = [];
    for (const [key, qty] of Object.entries(counts)) {
        for (let i = 0; i < qty; i += 1) {
            keys.push(key);
        }
    }
    return keys;
}

function num(raw) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}

function roundScore(n) {
    return Math.round(num(n) * 100) / 100;
}

function scoreFromTiers(value, tiers) {
    const v = num(value);
    let best = tiers[0]?.points ?? 0;
    for (const tier of tiers) {
        if (v >= tier.min) {
            best = tier.points;
        } else {
            break;
        }
    }
    return best;
}

function buildRosterLeaders(entries, config) {
    const leaders = {};
    for (const [catKey, cat] of Object.entries(config.categories)) {
        if (!cat.leaderTier) {
            continue;
        }
        let maxVal = -Infinity;
        const leaderMin = Number(cat.leaderMin);
        for (const e of entries) {
            const val = num(e.values[catKey]);
            if (Number.isFinite(leaderMin) && leaderMin > 0 && val < leaderMin) {
                continue;
            }
            if (val > maxVal) {
                maxVal = val;
            }
        }
        if (!Number.isFinite(maxVal) || maxVal <= 0) {
            leaders[catKey] = new Set();
            continue;
        }
        const set = new Set();
        for (const e of entries) {
            const val = num(e.values[catKey]);
            if (Number.isFinite(leaderMin) && leaderMin > 0 && val < leaderMin) {
                continue;
            }
            if (val >= maxVal) {
                set.add(e.steamId64);
            }
        }
        leaders[catKey] = set;
    }
    return leaders;
}

function leaderPointsForCategory(cat) {
    const topTier = cat.tiers[cat.tiers.length - 1];
    return topTier ? topTier.points : 5;
}

function scoreCategory(catKey, cat, value, steamId64, leaders) {
    const base = scoreFromTiers(value, cat.tiers);
    const leaderMin = Number(cat.leaderMin);
    const v = num(value);
    if (Number.isFinite(leaderMin) && leaderMin > 0 && v < leaderMin) {
        return base;
    }
    if (cat.leaderTier && leaders[catKey]?.has(steamId64)) {
        return Math.max(base, leaderPointsForCategory(cat));
    }
    return base;
}

function computeManualExtraPoints(extraKeys, extraCounts) {
    const counts = normalizeExtraCounts(extraKeys, extraCounts);
    const hits = [];
    let total = 0;
    for (const [key, qty] of Object.entries(counts)) {
        const item = EXTRA_BY_KEY[key];
        if (!item || item.points === 0) {
            continue;
        }
        const pts = roundScore(item.points * qty);
        const label = qty > 1 ? `${item.label} ×${qty}` : item.label;
        hits.push({ key: item.key, label, points: pts, qty });
        total += pts;
    }
    return { total: roundScore(total), hits, counts };
}

function extractPlayerValues(vitalPlayer, profile) {
    return {
        killsT30: num(vitalPlayer?.killsT30),
        kdr: num(vitalPlayer?.kdr),
        hours: num(profile?.hoursPlayed ?? profile?.hours_played),
        farmWood: num(vitalPlayer?.farmWood),
        farmMetal: num(vitalPlayer?.farmMetal),
        farmSulfur: num(vitalPlayer?.farmSulfur),
        scrapLooted: num(vitalPlayer?.scrapLooted),
        building: num(vitalPlayer?.building)
    };
}

function shouldScorePlayerProfile(profile) {
    if (!profile) {
        return false;
    }
    const paused = Boolean(profile.pausedOutsideWipe ?? profile.paused_outside_wipe);
    const phase = String(profile.wipePhase ?? profile.wipe_phase ?? "").trim();
    const status = String(profile.statusTag ?? profile.status_tag ?? "").trim();

    if (paused || phase === "no_juega") {
        return false;
    }
    if (status === "mcv_inactive") {
        return false;
    }

    const inWipePhase = phase === "inicio" || phase === "late";
    const coreMember = status === "admin" || status === "mcv_active" || status === "mcv_strikes";
    if (coreMember) {
        return true;
    }
    if (status === "wipe_guest" && inWipePhase) {
        return true;
    }
    return false;
}

function computeTierScoresForRoster({ serverKey, players, at = new Date() }) {
    const resolved = resolveTierScoreConfig({ serverKey, at });
    const config = resolved.config;
    const entries = (players || [])
        .map((p) => {
            const steamId64 = String(p.steamId64 || "").trim();
            if (!steamId64) {
                return null;
            }
            const profile = p.profile || p;
            const participates = p.participatesWipe != null ? Boolean(p.participatesWipe) : shouldScorePlayerProfile(profile);
            return {
                steamId64,
                name: String(p.name || p.displayName || profile?.displayName || "").trim(),
                values: extractPlayerValues(p.vital || p, profile),
                extraKeys: p.extraKeys || profile?.extraKeys || [],
                extraCounts: p.extraCounts || profile?.extraCounts || {},
                participatesWipe: participates
            };
        })
        .filter(Boolean);

    const scoringEntries = entries.filter((e) => e.participatesWipe);
    const leaders = buildRosterLeaders(scoringEntries, config);

    const results = entries.map((entry) => {
        if (!entry.participatesWipe) {
            return {
                steamId64: entry.steamId64,
                name: entry.name,
                total: 0,
                statTotal: 0,
                extraTotal: 0,
                skipped: true,
                skipReason: "no_juega_wipe",
                breakdown: [],
                values: entry.values,
                extraKeys: entry.extraKeys,
                extraCounts: entry.extraCounts
            };
        }

        const breakdown = [];
        let statTotal = 0;
        for (const [catKey, cat] of Object.entries(config.categories)) {
            const raw = entry.values[catKey];
            const pts = scoreCategory(catKey, cat, raw, entry.steamId64, leaders);
            const isLeader = Boolean(cat.leaderTier && leaders[catKey]?.has(entry.steamId64));
            breakdown.push({ id: catKey, label: cat.label, raw, points: pts, isLeader });
            statTotal += pts;
        }
        const extra = computeManualExtraPoints(entry.extraKeys, entry.extraCounts);
        for (const hit of extra.hits) {
            breakdown.push({
                id: "extra_" + hit.key,
                label: "Extra: " + hit.label,
                raw: hit.qty > 1 ? hit.qty : null,
                points: hit.points,
                isLeader: false
            });
        }
        const total = roundScore(statTotal + extra.total);
        return {
            steamId64: entry.steamId64,
            name: entry.name,
            total,
            statTotal,
            extraTotal: extra.total,
            skipped: false,
            breakdown,
            values: entry.values,
            extraKeys: entry.extraKeys,
            extraCounts: extra.counts
        };
    });

    results.sort((a, b) => b.total - a.total || b.statTotal - a.statTotal || a.name.localeCompare(b.name));

    return {
        serverKey: resolved.serverKey,
        configKey: resolved.configKey,
        configLabel: config.label,
        period: resolved.period,
        periodLabel: resolved.label,
        serverLabel: resolved.label,
        scoredAt: at.toISOString(),
        players: results
    };
}

module.exports = {
    getTierScoreConfig,
    resolveTierScoreConfig,
    resolveTierConfigKey,
    listTierScoreConfigs,
    listExtraPointCatalog,
    EXTRA_POINT_CATALOG,
    EXTRA_BY_KEY,
    computeTierScoresForRoster,
    computeManualExtraPoints,
    normalizeExtraCounts,
    expandExtraKeysFromCounts,
    isStackableExtraKey,
    scoreFromTiers,
    buildRosterLeaders,
    extractPlayerValues,
    shouldScorePlayerProfile,
    roundScore,
    EU_MEDIUM_CONFIG,
    EU_MONTHLY_CONFIG
};
