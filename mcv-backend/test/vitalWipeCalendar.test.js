"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getNthThursdayOfMonth, resolveMonthlyPeriod, resolveTierConfigKey } = require("../vitalWipeCalendar");

test("getNthThursdayOfMonth encuentra el 1.er y 4.º jueves", () => {
    const first = getNthThursdayOfMonth(2026, 4, 1);
    const second = getNthThursdayOfMonth(2026, 4, 2);
    const fourth = getNthThursdayOfMonth(2026, 4, 4);
    assert.equal(first.getDate(), 7);
    assert.equal(second.getDate(), 14);
    assert.equal(fourth.getDate(), 28);
});

test("resolveMonthlyPeriod usa tabla Monthly entre 1.er y 2.º jueves", () => {
    const duringMain = resolveMonthlyPeriod(new Date(2026, 4, 10, 12, 0, 0));
    assert.equal(duringMain.configKey, "eu-monthly");
    assert.equal(duringMain.period, "monthly-main");
});

test("resolveMonthlyPeriod usa tabla Medium del 2.º al 4.º jueves", () => {
    const midMonth = resolveMonthlyPeriod(new Date(2026, 4, 20, 12, 0, 0));
    assert.equal(midMonth.configKey, "eu-medium");
    assert.equal(midMonth.period, "monthly-medium-window");

    const rewipe = resolveMonthlyPeriod(new Date(2026, 4, 29, 12, 0, 0));
    assert.equal(rewipe.configKey, "eu-medium");
    assert.equal(rewipe.period, "monthly-medium-window");
});

test("resolveTierConfigKey siempre Medium en eu-medium", () => {
    const r = resolveTierConfigKey({ serverKey: "eu-medium", at: new Date(2026, 4, 10) });
    assert.equal(r.configKey, "eu-medium");
    assert.equal(r.period, "medium-server");
});
