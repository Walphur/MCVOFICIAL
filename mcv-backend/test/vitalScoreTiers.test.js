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
                profile: { hoursPlayed: 40 },
                extraKeys: ["locker"]
            },
            {
                steamId64: "76561198000000002",
                name: "Beta",
                vital: { killsT30: 30, kdr: 1, farmWood: 100000 },
                profile: { hoursPlayed: 30 },
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

test("jugador no_juega no recibe puntos", () => {
    const result = computeTierScoresForRoster({
        serverKey: "eu-medium",
        players: [
            {
                steamId64: "76561198000000005",
                vital: { killsT30: 80, farmMetal: 500000 },
                profile: { wipePhase: "no_juega", pausedOutsideWipe: true },
                extraKeys: ["locker"]
            }
        ]
    });
    const p = result.players[0];
    assert.equal(p.skipped, true);
    assert.equal(p.total, 0);
    assert.equal(p.skipReason, "no_juega_wipe");
});

test("shouldScorePlayerProfile respeta pausa y no_juega", () => {
    assert.equal(shouldScorePlayerProfile({ wipePhase: "inicio" }), true);
    assert.equal(shouldScorePlayerProfile({ wipePhase: "no_juega" }), false);
    assert.equal(shouldScorePlayerProfile({ pausedOutsideWipe: true }), false);
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
                profile: {}
            }
        ]
    });
    const wood = result.players[0].breakdown.find((b) => b.id === "farmWood");
    assert.equal(wood.points, 0);
});

test("Monthly en rewipe usa tabla Medium", () => {
    const result = computeTierScoresForRoster({
        serverKey: "eu-monthly",
        at: new Date(2026, 4, 29, 12, 0, 0),
        players: [
            {
                steamId64: "76561198000000006",
                vital: { killsT30: 40, farmMetal: 200000 },
                profile: { hoursPlayed: 35 }
            }
        ]
    });
    assert.equal(result.configKey, "eu-medium");
    assert.equal(result.period, "monthly-rewipe");
});
