"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePlaytimeHours, collectLatestPlaytimeByAuthor, resolveSyncWindowFromOptions } = require("../playtimeSync");
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
