"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getTierScoreConfig } = require("../vitalScoreTiers");
const { buildYoDetailEmbeds, getStatTierProgress, formatStatValue, getMcYoServerKey, getMcYoServerFallback } = require("../discordPlayerYo");

test("getMcYoServerKey usa eu-medium por defecto", () => {
    const prev = process.env.MCV_YO_SERVER_KEY;
    delete process.env.MCV_YO_SERVER_KEY;
    assert.equal(getMcYoServerKey(), "eu-medium");
    process.env.MCV_YO_SERVER_KEY = "eu-monthly";
    assert.equal(getMcYoServerKey(), "eu-monthly");
    if (prev == null) delete process.env.MCV_YO_SERVER_KEY;
    else process.env.MCV_YO_SERVER_KEY = prev;
});

test("getMcYoServerFallback alterna entre monthly y medium", () => {
    assert.equal(getMcYoServerFallback("eu-medium"), "eu-monthly");
    assert.equal(getMcYoServerFallback("eu-monthly"), "eu-medium");
});

test("formatStatValue formatea farm en k", () => {
    assert.equal(formatStatValue("farmWood", 42800), "42.8k");
});

test("getStatTierProgress apunta al siguiente umbral neutral si pts negativos", () => {
    const cfg = getTierScoreConfig("eu-monthly");
    const progress = getStatTierProgress(cfg.categories.scrapLooted, 86);
    assert.ok(progress.targetMin != null);
    assert.ok(progress.targetMin >= 2000);
});

test("buildYoDetailEmbeds muestra desglose de stats y extras", () => {
    const config = getTierScoreConfig("eu-monthly");
    const embeds = buildYoDetailEmbeds(
        {
            personaName: "Kami",
            steamId64: "76561198123456789",
            hoursPlayed: 45,
            performanceScore: -12
        },
        {
            tierPlayer: {
                total: -12,
                skipped: false,
                breakdown: [
                    { id: "killsT30", label: "Kill T3", raw: 0, points: -3, isLeader: false },
                    { id: "kdr", label: "K/D", raw: 1, points: 1, isLeader: false },
                    { id: "extra_locker", label: "Extra: LOCKER", raw: null, points: 2, isLeader: false }
                ]
            },
            config,
            resolved: { configLabel: "EU Monthly 2x", periodLabel: "Wipe actual" },
            vitalMissing: false
        }
    );
    assert.ok(embeds.length >= 2);
    const main = embeds[0].data;
    assert.match(main.description, /45h/);
    assert.match(main.description, /-12 pts/);
    assert.ok((main.fields || []).length >= 2);
    const extras = embeds[1].data;
    assert.match(extras.description || extras.title || "", /LOCKER|Extras/i);
});

test("buildYoDetailEmbeds sin vincular muestra /mcv-wipe", () => {
    const embeds = buildYoDetailEmbeds(null, null);
    assert.match(embeds[0].data.description, /mcv-wipe/);
});
