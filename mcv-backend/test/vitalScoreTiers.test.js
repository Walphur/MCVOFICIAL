"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    computeTierScoresForRoster,
    computeManualExtraPoints,
    getTierScoreConfig,
    scoreFromTiers,
    shouldScorePlayerProfile
} = require("../vitalScoreTiers");

test("scoreFromTiers asigna el tier más alto alcanzado", () => {
    const tiers = [
        { min: 0, points: -3 },
        { min: 10, points: -2 },
        { min: 20, points: 0 },
        { min: 30, points: 1 }
    ];
    assert.equal(scoreFromTiers(0, tiers), -3);
    assert.equal(scoreFromTiers(19, tiers), -2);
    assert.equal(scoreFromTiers(25, tiers), 0);
    assert.equal(scoreFromTiers(100, tiers), 1);
});

test("computeTierScoresForRoster marca líder en T3 kills (Medium)", () => {
    const result = computeTierScoresForRoster({
        serverKey: "eu-medium",
        players: [
            {
                steamId64: "76561198000000001",
                name: "Alpha",
                vital: { killsT30: 80, kdr: 2, farmWood: 500000 },
                profile: { hoursPlayed: 40, statusTag: "mcv_active" },
                extraKeys: ["locker"]
            },
            {
                steamId64: "76561198000000002",
                name: "Beta",
                vital: { killsT30: 30, kdr: 1, farmWood: 100000 },
                profile: { hoursPlayed: 30, statusTag: "mcv_active" },
                extraKeys: []
            }
        ]
    });

    assert.equal(result.configKey, "eu-medium");
    const alpha = result.players.find((p) => p.steamId64.endsWith("001"));
    const beta = result.players.find((p) => p.steamId64.endsWith("002"));
    assert.ok(alpha.total > beta.total);
    const alphaKills = alpha.breakdown.find((b) => b.id === "killsT30");
    assert.equal(alphaKills.points, 5);
    assert.equal(alphaKills.isLeader, true);
});

test("computeManualExtraPoints suma extras marcados por admin", () => {
    const extra = computeManualExtraPoints(["locker", "open_core", "romper_mini"]);
    assert.equal(extra.total, 7.75);
    assert.ok(extra.hits.some((h) => h.label === "LOCKER"));
    assert.ok(extra.hits.some((h) => h.label === "OPEN CORE"));
});

test("computeManualExtraPoints incluye horse +6", () => {
    const extra = computeManualExtraPoints(["horse", "locker"]);
    assert.equal(extra.total, 8);
    assert.ok(extra.hits.some((h) => h.key === "horse" && h.points === 6));
});

test("computeManualExtraPoints acumula romper mini y combat en el mismo wipe", () => {
    const extra = computeManualExtraPoints([], { romper_mini: 4, romper_combat: 2 });
    assert.equal(extra.total, -2);
    const mini = extra.hits.find((h) => h.key === "romper_mini");
    const combat = extra.hits.find((h) => h.key === "romper_combat");
    assert.equal(mini.points, -1);
    assert.equal(mini.qty, 4);
    assert.equal(combat.points, -1);
    assert.equal(combat.qty, 2);
});

test("computeTierScoresForRoster suma romper mini repetido", () => {
    const result = computeTierScoresForRoster({
        serverKey: "eu-medium",
        players: [
            {
                steamId64: "76561198000000009",
                vital: { killsT30: 0, kdr: 0, farmWood: 0, farmMetal: 0, farmSulfur: 0, scrapLooted: 0, building: 0 },
                profile: { statusTag: "mcv_active", hoursPlayed: 40 },
                extraCounts: { romper_mini: 3 }
            }
        ]
    });
    const p = result.players[0];
    assert.equal(p.extraTotal, -0.75);
    const mini = p.breakdown.find((b) => b.id === "extra_romper_mini");
    assert.equal(mini.points, -0.75);
    assert.equal(mini.label, "Extra: ROMPER MINI ×3");
});

test("jugador no_juega no recibe puntos", () => {
    const result = computeTierScoresForRoster({
        serverKey: "eu-medium",
        players: [
            {
                steamId64: "76561198000000005",
                vital: { killsT30: 80, farmMetal: 500000 },
                profile: { wipePhase: "no_juega", pausedOutsideWipe: true, statusTag: "mcv_active" },
                extraKeys: ["locker"]
            }
        ]
    });
    const p = result.players[0];
    assert.equal(p.skipped, true);
    assert.equal(p.total, 0);
    assert.equal(p.skipReason, "no_juega_wipe");
});

test("wipe_guest sin fase inicio/late no recibe puntos", () => {
    const result = computeTierScoresForRoster({
        serverKey: "eu-medium",
        players: [
            {
                steamId64: "76561198000000007",
                vital: { killsT30: 50 },
                profile: { statusTag: "wipe_guest", wipePhase: "unknown" }
            }
        ]
    });
    assert.equal(result.players[0].skipped, true);
});

test("building Monthly no resta puntos por debajo de 6k", () => {
    const cfg = getTierScoreConfig("eu-monthly");
    const buildingTiers = cfg.categories.building.tiers;
    assert.equal(scoreFromTiers(0, buildingTiers), 0);
    assert.equal(scoreFromTiers(2201, buildingTiers), 0);
    assert.equal(scoreFromTiers(5999, buildingTiers), 0);
    assert.equal(scoreFromTiers(15000, buildingTiers), 1);
});

test("building viene de Vital (bloques estructurales)", () => {
    const result = computeTierScoresForRoster({
        serverKey: "eu-medium",
        players: [
            {
                steamId64: "76561198000000008",
                vital: { building: 2500, killsT30: 0, kdr: 0, farmWood: 0, farmMetal: 0, farmSulfur: 0, scrapLooted: 0 },
                profile: { statusTag: "mcv_active", hoursPlayed: 0 }
            }
        ]
    });
    const building = result.players[0].breakdown.find((b) => b.id === "building");
    assert.equal(building.raw, 2500);
    assert.ok(building.points >= 2);
});

test("shouldScorePlayerProfile respeta pausa, no_juega e inactivos", () => {
    assert.equal(shouldScorePlayerProfile({ statusTag: "mcv_active", wipePhase: "inicio" }), true);
    assert.equal(shouldScorePlayerProfile({ statusTag: "wipe_guest", wipePhase: "inicio" }), true);
    assert.equal(shouldScorePlayerProfile({ statusTag: "wipe_guest", wipePhase: "unknown" }), false);
    assert.equal(shouldScorePlayerProfile({ wipePhase: "no_juega" }), false);
    assert.equal(shouldScorePlayerProfile({ pausedOutsideWipe: true, statusTag: "mcv_active" }), false);
    assert.equal(shouldScorePlayerProfile({ statusTag: "mcv_inactive" }), false);
});

test("madera no resta puntos bajo 500k (Medium)", () => {
    const cfg = getTierScoreConfig("eu-medium");
    const woodTiers = cfg.categories.farmWood.tiers;
    assert.equal(scoreFromTiers(0, woodTiers), 0);
    assert.equal(scoreFromTiers(150000, woodTiers), 0);
    assert.equal(scoreFromTiers(499999, woodTiers), 0);
    assert.equal(scoreFromTiers(500000, woodTiers), 1);
    assert.equal(scoreFromTiers(10000000, woodTiers), 4);

    const result = computeTierScoresForRoster({
        serverKey: "eu-medium",
        players: [
            {
                steamId64: "76561198000000004",
                vital: { farmWood: 100000 },
                profile: { statusTag: "mcv_active" }
            }
        ]
    });
    const wood = result.players[0].breakdown.find((b) => b.id === "farmWood");
    assert.equal(wood.points, 0);
});

test("Monthly en ventana 2.º-4.º jueves usa tabla Medium", () => {
    const result = computeTierScoresForRoster({
        serverKey: "eu-monthly",
        at: new Date(2026, 4, 20, 12, 0, 0),
        players: [
            {
                steamId64: "76561198000000006",
                vital: { killsT30: 40, farmMetal: 200000 },
                profile: { hoursPlayed: 35, statusTag: "mcv_active" }
            }
        ]
    });
    assert.equal(result.configKey, "eu-medium");
    assert.equal(result.period, "monthly-medium-window");
});
