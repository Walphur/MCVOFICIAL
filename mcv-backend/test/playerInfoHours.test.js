"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolvePlayerInfoHoursInput } = require("../vitalRustApi");

test("resolvePlayerInfoHoursInput conserva horas si el campo no viene en el body", () => {
    const out = resolvePlayerInfoHoursInput({ strikes: 1 }, 44);
    assert.equal(out.hasField, false);
    assert.equal(out.hoursPlayed, 44);
});

test("resolvePlayerInfoHoursInput acepta horas explícitas incluyendo cero", () => {
    assert.deepEqual(resolvePlayerInfoHoursInput({ hoursPlayed: 0 }, 44), {
        hasField: true,
        hoursPlayed: 0
    });
    assert.deepEqual(resolvePlayerInfoHoursInput({ hours_played: "12.7" }, null), {
        hasField: true,
        hoursPlayed: 13
    });
});

test("resolvePlayerInfoHoursInput permite limpiar horas con null o vacío", () => {
    assert.deepEqual(resolvePlayerInfoHoursInput({ hoursPlayed: null }, 44), {
        hasField: true,
        hoursPlayed: null
    });
    assert.deepEqual(resolvePlayerInfoHoursInput({ hoursPlayed: "" }, 44), {
        hasField: true,
        hoursPlayed: null
    });
});
