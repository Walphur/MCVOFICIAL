"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePlaytimeHours, collectLatestPlaytimeByAuthor } = require("../playtimeSync");

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
