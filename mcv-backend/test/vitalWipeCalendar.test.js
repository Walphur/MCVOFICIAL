"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getNthThursdayOfMonth, resolveMonthlyPeriod, resolveTierConfigKey, resolvePlaytimeSyncWindow } = require("../vitalWipeCalendar");

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

test("resolveMonthlyPeriod mantiene Monthly todo el 2.º jueves hasta 23:59", () => {
    const lastDay = resolveMonthlyPeriod(new Date(2026, 4, 14, 20, 30, 0));
    assert.equal(lastDay.configKey, "eu-monthly");
    assert.equal(lastDay.period, "monthly-main");

    const fridayStart = resolveMonthlyPeriod(new Date(2026, 4, 15, 0, 0, 1));
    assert.equal(fridayStart.configKey, "eu-medium");
    assert.equal(fridayStart.period, "monthly-medium-window");
});

test("resolveMonthlyPeriod usa tabla Medium del viernes post 2.º jueves al rewipe", () => {
    const midMonth = resolveMonthlyPeriod(new Date(2026, 4, 20, 12, 0, 0));
    assert.equal(midMonth.configKey, "eu-medium");
    assert.equal(midMonth.period, "monthly-medium-window");

    const rewipe = resolveMonthlyPeriod(new Date(2026, 4, 29, 12, 0, 0));
    assert.equal(rewipe.configKey, "eu-medium");
    assert.equal(rewipe.period, "monthly-medium-window");
});

test("resolvePlaytimeSyncWindow: wipe 04/06–11/06 lee horas del 10/06 al 17/06", () => {
    const w = resolvePlaytimeSyncWindow({ wipeStartAt: new Date(2026, 5, 4, 18, 44, 0) });
    assert.ok(w);
    assert.equal(w.phase, "monthly-main");
    assert.equal(new Date(w.windowStartMs).getDate(), 10);
    assert.equal(new Date(w.windowStartMs).getMonth(), 5);
    assert.equal(new Date(w.windowEndMs).getDate(), 17);
    assert.equal(new Date(w.windowEndMs).getMonth(), 5);
    assert.equal(new Date(w.monthlyWipeEnd).getDate(), 11);
});

test("resolvePlaytimeSyncWindow: Medium/rewipe fin 28/06 lee horas del 27/06 al 01/07", () => {
    const w = resolvePlaytimeSyncWindow({ wipeStartAt: new Date(2026, 5, 12, 18, 0, 0) });
    assert.ok(w);
    assert.equal(w.phase, "monthly-medium-window");
    assert.equal(new Date(w.windowStartMs).getDate(), 27);
    assert.equal(new Date(w.windowStartMs).getMonth(), 5);
    assert.equal(new Date(w.windowEndMs).getDate(), 1);
    assert.equal(new Date(w.windowEndMs).getMonth(), 6);
});

test("resolvePlaytimeSyncWindow: off-season entre rewipe y próximo Monthly", () => {
    const w = resolvePlaytimeSyncWindow({ at: new Date(2026, 5, 29, 12, 0, 0) });
    assert.equal(w.phase, "off-season");
    assert.equal(w.windowStartMs, null);
    assert.match(w.label, /Sin ventana activa/i);
});

test("resolveTierConfigKey siempre Medium en eu-medium", () => {
    const r = resolveTierConfigKey({ serverKey: "eu-medium", at: new Date(2026, 4, 10) });
    assert.equal(r.configKey, "eu-medium");
    assert.equal(r.period, "medium-server");
});
