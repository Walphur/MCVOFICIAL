"use strict";

/**
 * Sistema de puntos por tiers (referencia clan Medium).
 * EU Medium usa umbrales del wipe corto; EU Monthly escala umbrales y magnitud de puntos.
 */

function tierRow(points, min) {
    return { points, min };
}

const MEDIUM_TIER_POINTS = [-3, -2, -1, 0, 1, 2, 3, 4, 5];

function buildThresholdTiers(thresholds, pointScale = 1) {
    return thresholds.map((min, i) => ({
        min,
        points: Math.round(MEDIUM_TIER_POINTS[i] * pointScale)
    }));
}

function scaleThresholds(values, factor) {
    return values.map((v) => (v <= 0 ? v : Math.round(v * factor)));
}

const EU_MEDIUM_CONFIG = {
    key: "eu-medium",
    label: "EU Medium 2x",
    pointScale: 1,
    categories: {
        killsT30: {
            label: "T3 Kills",
            leaderTier: true,
            tiers: buildThresholdTiers([0, 10, 15, 20, 30, 40, 60, 80, Infinity])
        },
        kdr: {
            label: "K/D",
            leaderTier: false,
            tiers: buildThresholdTiers([0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, Infinity])
        },
        hours: {
            label: "Horas",
            leaderTier: false,
            tiers: buildThresholdTiers([0, 10, 15, 25, 30, 35, 45, 55, Infinity])
        },
        farmWood: {
            label: "Wood",
            leaderTier: true,
            tiers: buildThresholdTiers([0, 100000, 200000, 300000, 500000, 750000, 2000000, 10000000, Infinity])
        },
        farmMetal: {
            label: "Metal",
            leaderTier: true,
            tiers: buildThresholdTiers([0, 50000, 75000, 100000, 150000, 200000, 350000, 500000, Infinity])
        },
        farmSulfur: {
            label: "Sulfur",
            leaderTier: true,
            tiers: buildThresholdTiers([0, 50000, 75000, 100000, 150000, 200000, 350000, 500000, Infinity])
        },
        farmHqMetal: {
            label: "HQ",
            leaderTier: true,
            tiers: buildThresholdTiers([0, 167, 250, 333, 500, 667, 1167, 1667, Infinity])
        },
        building: {
            label: "Building",
            leaderTier: "builder",
            tiers: [
                { points: 0, min: 0 },
                { points: 1, min: 1000 },
                { points: 2, min: 1500 },
                { points: 3, min: 3000 },
                { points: 4, min: 10000 },
                { points: 5, min: Infinity }
            ]
        }
    },
    extraRoles: [
        { label: "ELEC+WINDMILL", points: 6, patterns: [/elec/i, /windmill/i] },
        { label: "OC", points: 6, patterns: [/huerto/i, /\boc\b/i, /outpost/i, /vending/i] },
        { label: "FARMBASE", points: 6, patterns: [/main farmers/i, /farmbase/i, /farm base/i] },
        { label: "TC SPAM", points: 4, patterns: [/tc spam/i, /builders/i, /raid base/i] },
        { label: "TURRET/TCS", points: 4, patterns: [/turret/i, /tcs/i] },
        { label: "CRAFTER", points: 4, patterns: [/\bcrafter\b/i], exclude: [/autocrafter/i] },
        { label: "FURNACE CP", points: 3, patterns: [/furnace/i] },
        { label: "AUTOCRAFTER", points: 3, patterns: [/autocrafter/i] },
        { label: "LOCKER", points: 2, patterns: [/locker/i, /base bitch/i] },
        { label: "DOORS", points: 2, patterns: [/doors/i, /door/i] },
        { label: "TRADE", points: 2, patterns: [/trade/i] },
        { label: "LEEECH", points: -3, patterns: [/leee?ch/i] }
    ]
};

/** Monthly: ~2.5× umbrales numéricos, ~1.5× magnitud de puntos por tier. */
const MONTHLY_THRESHOLD_FACTOR = 2.5;
const MONTHLY_POINT_SCALE = 1.5;

function cloneCategoryTiers(baseCats, thresholdFactor, pointScale) {
    const out = {};
    for (const [key, cat] of Object.entries(baseCats)) {
        if (key === "kdr") {
            out[key] = {
                label: cat.label,
                leaderTier: cat.leaderTier,
                tiers: cat.tiers.map((t) => ({ ...t, points: Math.round(t.points * pointScale) }))
            };
            continue;
        }
        if (key === "building") {
            out[key] = {
                label: cat.label,
                leaderTier: cat.leaderTier,
                tiers: cat.tiers.map((t, i) => ({
                    min: i === 0 ? 0 : Math.round(t.min * thresholdFactor),
                    points: Math.round(t.points * pointScale)
                }))
            };
            out[key].tiers[out[key].tiers.length - 1].min = Infinity;
            continue;
        }
        const mins = cat.tiers.map((t) => t.min);
        const scaled = scaleThresholds(mins.slice(0, -1), thresholdFactor).concat([Infinity]);
        out[key] = {
            label: cat.label,
            leaderTier: cat.leaderTier,
            tiers: buildThresholdTiers(scaled, pointScale)
        };
    }
    return out;
}

const EU_MONTHLY_CONFIG = {
    key: "eu-monthly",
    label: "EU Monthly 2x",
    pointScale: MONTHLY_POINT_SCALE,
    categories: cloneCategoryTiers(EU_MEDIUM_CONFIG.categories, MONTHLY_THRESHOLD_FACTOR, MONTHLY_POINT_SCALE),
    extraRoles: EU_MEDIUM_CONFIG.extraRoles.map((r) => ({
        ...r,
        points: r.points < 0 ? Math.round(r.points * MONTHLY_POINT_SCALE) : Math.round(r.points * MONTHLY_POINT_SCALE)
    }))
};

const CONFIG_BY_KEY = {
    "eu-medium": EU_MEDIUM_CONFIG,
    "eu-monthly": EU_MONTHLY_CONFIG
};

function getTierScoreConfig(serverKey) {
    const key = String(serverKey || "eu-medium").trim();
    return CONFIG_BY_KEY[key] || null;
}

function listTierScoreConfigs() {
    return Object.values(CONFIG_BY_KEY).map((c) => ({
        key: c.key,
        label: c.label,
        pointScale: c.pointScale,
        categories: Object.entries(c.categories).map(([id, cat]) => ({
            id,
            label: cat.label,
            leaderTier: cat.leaderTier,
            tiers: cat.tiers.filter((t) => Number.isFinite(t.min) && t.min !== Infinity)
        })),
        extraRoles: c.extraRoles.map((r) => ({ label: r.label, points: r.points }))
    }));
}

function num(raw) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
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
        for (const e of entries) {
            const val = num(e.values[catKey]);
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
            if (num(e.values[catKey]) >= maxVal) {
                set.add(e.steamId64);
            }
        }
        leaders[catKey] = set;
    }
    return leaders;
}

function leaderPointsForCategory(cat, config) {
    const topTier = cat.tiers[cat.tiers.length - 1];
    return topTier ? topTier.points : Math.round(5 * (config.pointScale || 1));
}

function scoreCategory(catKey, cat, value, steamId64, leaders, config) {
    const base = scoreFromTiers(value, cat.tiers);
    if (cat.leaderTier && leaders[catKey]?.has(steamId64)) {
        const leaderPts = leaderPointsForCategory(cat, config);
        return Math.max(base, leaderPts);
    }
    return base;
}

function matchExtraRoleBonus(roleText, rule) {
    const text = String(roleText || "");
    if (!text) {
        return false;
    }
    if (rule.exclude && rule.exclude.some((re) => re.test(text))) {
        return false;
    }
    return rule.patterns.some((re) => re.test(text));
}

function computeExtraPoints(roleLabels, config) {
    const roles = Array.isArray(roleLabels) ? roleLabels : [];
    const combined = roles.join(" | ");
    const hits = [];
    let total = 0;
    for (const rule of config.extraRoles) {
        const matched = roles.some((r) => matchExtraRoleBonus(r, rule)) || matchExtraRoleBonus(combined, rule);
        if (matched) {
            hits.push({ label: rule.label, points: rule.points });
            total += rule.points;
        }
    }
    return { total, hits };
}

function extractPlayerValues(vitalPlayer, profile) {
    return {
        killsT30: num(vitalPlayer?.killsT30),
        kdr: num(vitalPlayer?.kdr),
        hours: num(profile?.hoursPlayed ?? profile?.hours_played),
        farmWood: num(vitalPlayer?.farmWood),
        farmMetal: num(vitalPlayer?.farmMetal),
        farmSulfur: num(vitalPlayer?.farmSulfur),
        farmHqMetal: num(vitalPlayer?.farmHqMetal),
        building: num(profile?.buildingStat ?? profile?.building_stat ?? 0)
    };
}

/**
 * Calcula puntos por tiers para todo el roster.
 * @param {object} opts
 * @param {string} opts.serverKey
 * @param {Array<{steamId64:string,vital?:object,profile?:object,roleLabels?:string[]}>} opts.players
 */
function computeTierScoresForRoster({ serverKey, players }) {
    const config = getTierScoreConfig(serverKey);
    if (!config) {
        throw new Error("Servidor de tiers inválido (usá eu-medium o eu-monthly)");
    }
    const entries = (players || [])
        .map((p) => {
            const steamId64 = String(p.steamId64 || "").trim();
            if (!steamId64) {
                return null;
            }
            return {
                steamId64,
                name: String(p.name || p.displayName || p.profile?.displayName || "").trim(),
                values: extractPlayerValues(p.vital || p, p.profile || p),
                roleLabels: p.roleLabels || p.profile?.roleLabels || []
            };
        })
        .filter(Boolean);

    const leaders = buildRosterLeaders(entries, config);
    const results = entries.map((entry) => {
        const breakdown = [];
        let statTotal = 0;
        for (const [catKey, cat] of Object.entries(config.categories)) {
            const raw = entry.values[catKey];
            const pts = scoreCategory(catKey, cat, raw, entry.steamId64, leaders, config);
            const isLeader = Boolean(cat.leaderTier && leaders[catKey]?.has(entry.steamId64));
            breakdown.push({
                id: catKey,
                label: cat.label,
                raw,
                points: pts,
                isLeader
            });
            statTotal += pts;
        }
        const extra = computeExtraPoints(entry.roleLabels, config);
        if (extra.hits.length) {
            for (const hit of extra.hits) {
                breakdown.push({
                    id: "extra_" + hit.label.replace(/\W+/g, "_").toLowerCase(),
                    label: "Extra: " + hit.label,
                    raw: null,
                    points: hit.points,
                    isLeader: false
                });
            }
        }
        const total = statTotal + extra.total;
        return {
            steamId64: entry.steamId64,
            name: entry.name,
            total,
            statTotal,
            extraTotal: extra.total,
            breakdown,
            values: entry.values,
            roleLabels: entry.roleLabels
        };
    });

    results.sort((a, b) => b.total - a.total || b.statTotal - a.statTotal || a.name.localeCompare(b.name));

    return {
        serverKey: config.key,
        serverLabel: config.label,
        pointScale: config.pointScale,
        players: results
    };
}

module.exports = {
    getTierScoreConfig,
    listTierScoreConfigs,
    computeTierScoresForRoster,
    scoreFromTiers,
    buildRosterLeaders,
    computeExtraPoints,
    extractPlayerValues,
    EU_MEDIUM_CONFIG,
    EU_MONTHLY_CONFIG
};
