"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    buildWipeReportEmbeds,
    formatPlayerLine,
    filterReport
} = require("../wipeReport");

test("formatPlayerLine muestra horas o pendiente", () => {
    assert.match(
        formatPlayerLine(
            { persona_name: "Kami", discord_username: "Kami", hoursPlayed: 59 },
            { showHours: true }
        ),
        /59h/
    );
    assert.match(
        formatPlayerLine(
            { persona_name: "Checha", discord_username: "Checha · x", hoursPlayed: null },
            { showHours: false }
        ),
        /sin horas/
    );
});

test("filterReport con_horas y sin_horas", () => {
    const report = {
        totalLinked: 3,
        withHoursCount: 2,
        pendingHoursCount: 1,
        withHours: [{ persona_name: "A", hoursPlayed: 10 }],
        pendingHours: [{ persona_name: "B", hoursPlayed: null }],
        rows: []
    };
    const onlyHours = filterReport(report, "con_horas");
    assert.equal(onlyHours.withHours.length, 1);
    assert.equal(onlyHours.pendingHours.length, 0);
    const onlyPending = filterReport(report, "sin_horas");
    assert.equal(onlyPending.withHours.length, 0);
    assert.equal(onlyPending.pendingHours.length, 1);
});

test("buildWipeReportEmbeds incluye resumen y listas", () => {
    const embeds = buildWipeReportEmbeds({
        totalLinked: 2,
        withHoursCount: 1,
        pendingHoursCount: 1,
        withHours: [{ persona_name: "Kami", discord_username: "Kami", hoursPlayed: 59 }],
        pendingHours: [{ persona_name: "Checha", discord_username: "Checha", hoursPlayed: null }],
        rows: []
    });
    assert.ok(embeds.length >= 2);
    const allText = embeds.map((e) => JSON.stringify(e.data || e)).join(" ");
    assert.match(allText, /Vinculados Discord/);
    assert.match(allText, /Kami/);
    assert.match(allText, /Checha/);
});
