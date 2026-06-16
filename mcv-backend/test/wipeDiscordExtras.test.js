"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTopEmbed, buildYoEmbed, dedupeTopLeaderboardRows, prepareTopLeaderboardRows } = require("../wipeDiscordExtras");
const { loadPlayerStatsForDiscord, displayName } = require("../wipeReport");

test("buildYoEmbed sin vincular muestra instrucciones", () => {
    const embed = buildYoEmbed(null);
    assert.match(embed.data.description, /mcv-wipe/);
});

test("buildYoEmbed con stats muestra horas y puntos admin", () => {
    const embed = buildYoEmbed({
        personaName: "Kami",
        steamId64: "76561198123456789",
        hoursPlayed: 59,
        performanceScore: 85
    });
    assert.match(embed.data.description, /59h/);
    assert.match(embed.data.description, /85 pts/);
});

test("buildTopEmbed ordena por puntos", () => {
    const embed = buildTopEmbed(
        [
            { personaName: "A", performanceScore: 10, hoursPlayed: 5 },
            { personaName: "B", performanceScore: 90, hoursPlayed: 20 },
            { personaName: "C", performanceScore: 50, hoursPlayed: 10 }
        ],
        10
    );
    const desc = embed.data.description;
    const posB = desc.indexOf("B");
    const posC = desc.indexOf("C");
    const posA = desc.indexOf("A");
    assert.ok(posB < posC && posC < posA);
});

test("loadPlayerStatsForDiscord devuelve null si no hay fila", async () => {
    const pool = {
        query: async () => ({ rows: [] })
    };
    const stats = await loadPlayerStatsForDiscord(pool, "123");
    assert.equal(stats, null);
});

test("displayName prefiere persona Steam", () => {
    assert.equal(displayName({ personaName: "Kami", discordUsername: "kami#0" }), "Kami");
});

test("dedupeTopLeaderboardRows fusiona mismo Steam con dos Discord", () => {
    const rows = dedupeTopLeaderboardRows([
        {
            personaName: "Art of War",
            steamId64: "76561198111111111",
            discordUserId: "111111111111111111",
            performanceScore: 16,
            hoursPlayed: 104,
            linkedAt: "2026-06-01T00:00:00.000Z"
        },
        {
            personaName: "Art of War",
            steamId64: "76561198111111111",
            discordUserId: "222222222222222222",
            performanceScore: 16,
            hoursPlayed: 104,
            linkedAt: "2026-05-01T00:00:00.000Z"
        }
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].discordUserId, "111111111111111111");
});

test("dedupeTopLeaderboardRows fusiona mismo nombre con distinto Steam", () => {
    const rows = dedupeTopLeaderboardRows([
        {
            personaName: "Art of War",
            steamId64: "76561198111111111",
            discordUserId: "111111111111111111",
            performanceScore: 16,
            hoursPlayed: 104
        },
        {
            personaName: "Art of War",
            steamId64: "76561198222222222",
            discordUserId: "333333333333333333",
            performanceScore: 16,
            hoursPlayed: 104
        }
    ]);
    assert.equal(rows.length, 1);
});

test("prepareTopLeaderboardRows excluye Discord baneados", () => {
    const rows = prepareTopLeaderboardRows(
        [
            {
                personaName: "Art of War",
                steamId64: "76561198111111111",
                discordUserId: "111111111111111111",
                performanceScore: 16,
                hoursPlayed: 104
            },
            {
                personaName: "isiahkrus",
                discordUsername: "isiahkrus",
                steamId64: "76561198222222222",
                discordUserId: "444444444444444444",
                performanceScore: 16,
                hoursPlayed: 104
            }
        ],
        { bannedDiscordIds: new Set(["111111111111111111"]) }
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].discordUsername, "isiahkrus");
});
