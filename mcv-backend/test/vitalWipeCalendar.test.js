"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getNthThursdayOfMonth, resolveMonthlyPeriod, resolveTierConfigKey } = require("../vitalWipeCalendar");

test("getNthThursdayOfMonth encuentra el 1.er y 4.º jueves", () => {
    // Mayo 2026: 1.er jueves = 7, 4.º jueves = 28
    const first = getNthThursdayOfMonth(2026, 4, 1);
    const fourth = getNthThursdayOfMonth(2026, 4, 4);
    assert.equal(first.getDate(), 7);
    assert.equal(fourth.getDate(), 28);
    assert.equal(first.getDay(), 4);
    assert.equal(fourth.getDay(), 4);
});

test("resolveMonthlyPeriod usa tabla Monthly entre 1.er y 4.º jueves", () => {
    const duringMain = resolveMonthlyPeriod(new Date(2026, 4, 15, 12, 0, 0));
    assert.equal(duringMain.configKey, "eu-monthly");
    assert.equal(duringMain.period, "monthly-main");
});

test("resolveMonthlyPeriod usa tabla Medium en rewipe del 4.º jueves", () => {
    const rewipe = resolveMonthlyPeriod(new Date(2026, 4, 29, 12, 0, 0));
    assert.equal(rewipe.configKey, "eu-medium");
    assert.equal(rewipe.period, "monthly-rewipe");
});

test("resolveTierConfigKey siempre Medium en eu-medium", () => {
    const r = resolveTierConfigKey({ serverKey: "eu-medium", at: new Date(2026, 4, 29) });
    assert.equal(r.configKey, "eu-medium");
    assert.equal(r.period, "medium-server");
});
