"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePlaytimeHours, collectLatestPlaytimeByAuthor, mergePlaytimeBySteam, formatPlaytimeSource, resolveSyncWindowFromOptions } = require("../playtimeSync");
const { resolvePlaytimeSyncWindow } = require("../vitalWipeCalendar");

test("parsePlaytimeHours acepta formatos del canal playtime", () => {
    assert.equal(parsePlaytimeHours("14h"), 14);
    assert.equal(parsePlaytimeHours("59hr (editado)"), 59);
    assert.equal(parsePlaytimeHours("39h (editado)"), 39);
    assert.equal(parsePlaytimeHours("31"), 31);
    assert.equal(parsePlaytimeHours("57 horitas"), 57);
    assert.equal(parsePlaytimeHours("59hrs"), 59);
    assert.equal(parsePlaytimeHours("  42 horas  "), 42);
});

test("parsePlaytimeHours ignora texto sin horas", () => {
    assert.equal(parsePlaytimeHours(""), null);
    assert.equal(parsePlaytimeHours("hola"), null);
    assert.equal(parsePlaytimeHours("captura abajo"), null);
});

test("collectLatestPlaytimeByAuthor ignora mensajes fuera de la ventana de wipe", () => {
    const window = resolvePlaytimeSyncWindow({ wipeStartAt: new Date(2026, 5, 4, 18, 44, 0) });
    const messages = [
        {
            author: { id: "111", bot: false, username: "old", globalName: null },
            content: "99h",
            id: "old",
            createdTimestamp: new Date(2026, 5, 5, 12, 0, 0).getTime()
        },
        {
            author: { id: "111", bot: false, username: "new", globalName: null },
            content: "14h",
            id: "new",
            createdTimestamp: new Date(2026, 5, 10, 15, 0, 0).getTime()
        },
        {
            author: { id: "222", bot: false, username: "late", globalName: null },
            content: "57 horitas",
            id: "late",
            createdTimestamp: new Date(2026, 5, 18, 12, 0, 0).getTime()
        }
    ];
    const map = collectLatestPlaytimeByAuthor(messages, window);
    assert.equal(map.size, 1);
    assert.equal(map.get("111").hours, 14);
});

test("mergePlaytimeBySteam combina canal y /mcv-horas guardado en BD", () => {
    const dbRows = [
        {
            steam_id64: "76561198000000001",
            display_name: "SlashUser",
            hours_played: 57,
            updated_at: new Date("2026-06-10T12:00:00Z")
        }
    ];
    const channelBySteam = new Map([
        [
            "76561198000000002",
            { hours: 31, displayName: "ChatUser", postedAt: "2026-06-11T10:00:00.000Z", discordUsername: "chat" }
        ],
        [
            "76561198000000003",
            { hours: 20, displayName: "BothUser", postedAt: "2026-06-11T11:00:00.000Z", discordUsername: "both" }
        ]
    ]);
    const dbBoth = dbRows.concat([
        {
            steam_id64: "76561198000000003",
            display_name: "BothUser",
            hours_played: 45,
            updated_at: new Date("2026-06-10T09:00:00Z")
        }
    ]);
    const merged = mergePlaytimeBySteam(dbBoth, channelBySteam);
    assert.equal(merged.size, 3);
    assert.equal(merged.get("76561198000000001").hours, 57);
    assert.equal(formatPlaytimeSource(merged.get("76561198000000001").sources), "saved");
    assert.equal(merged.get("76561198000000002").hours, 31);
    assert.equal(formatPlaytimeSource(merged.get("76561198000000002").sources), "channel");
    assert.equal(merged.get("76561198000000003").hours, 45);
    assert.equal(formatPlaytimeSource(merged.get("76561198000000003").sources), "both");
});

test("collectLatestPlaytimeByAuthor conserva el mensaje más reciente por autor", () => {
    const messages = [
        {
            author: { id: "111", bot: false, username: "dbss", globalName: null },
            content: "10h",
            id: "a",
            createdTimestamp: 100
        },
        {
            author: { id: "111", bot: false, username: "dbss", globalName: null },
            content: "14h",
            id: "b",
            createdTimestamp: 200
        },
        {
            author: { id: "222", bot: false, username: "Kami", globalName: null },
            content: "57 horitas",
            id: "c",
            createdTimestamp: 150
        },
        {
            author: { id: "999", bot: true, username: "bot", globalName: null },
            content: "99h",
            id: "d",
            createdTimestamp: 300
        }
    ];
    const map = collectLatestPlaytimeByAuthor(messages);
    assert.equal(map.size, 2);
    assert.equal(map.get("111").hours, 14);
    assert.equal(map.get("222").hours, 57);
});
