"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTopEmbed, buildYoEmbed } = require("../wipeDiscordExtras");
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
