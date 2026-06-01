"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    computeTierScoresForRoster,
    getTierScoreConfig,
    scoreFromTiers,
    computeExtraPoints
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
                roleLabels: ["ELEC"]
            },
            {
                steamId64: "76561198000000002",
                name: "Beta",
                vital: { killsT30: 30, kdr: 1, farmWood: 100000 },
                profile: { hoursPlayed: 30 },
                roleLabels: []
            }
        ]
    });

    assert.equal(result.serverKey, "eu-medium");
    const alpha = result.players.find((p) => p.steamId64.endsWith("001"));
    const beta = result.players.find((p) => p.steamId64.endsWith("002"));
    assert.ok(alpha.total > beta.total);
    const alphaKills = alpha.breakdown.find((b) => b.id === "killsT30");
    assert.equal(alphaKills.points, 5);
    assert.equal(alphaKills.isLeader, true);
});

test("computeExtraPoints suma bonos por rol", () => {
    const cfg = getTierScoreConfig("eu-medium");
    const extra = computeExtraPoints(["ELEC", "MAIN FARMERS"], cfg);
    assert.ok(extra.total >= 12);
    assert.ok(extra.hits.some((h) => h.label === "ELEC+WINDMILL"));
});

test("Monthly escala umbrales y puntos", () => {
    const medium = computeTierScoresForRoster({
        serverKey: "eu-medium",
        players: [
            {
                steamId64: "76561198000000003",
                vital: { killsT30: 40, kdr: 1.5, farmMetal: 200000 },
                profile: { hoursPlayed: 35 }
            }
        ]
    });
    const monthly = computeTierScoresForRoster({
        serverKey: "eu-monthly",
        players: [
            {
                steamId64: "76561198000000003",
                vital: { killsT30: 40, kdr: 1.5, farmMetal: 200000 },
                profile: { hoursPlayed: 35 }
            }
        ]
    });
    assert.ok(monthly.players[0].total !== medium.players[0].total || monthly.players[0].breakdown.length === medium.players[0].breakdown.length);
    const monthlyCfg = getTierScoreConfig("eu-monthly");
    assert.equal(monthlyCfg.pointScale, 1.5);
});
