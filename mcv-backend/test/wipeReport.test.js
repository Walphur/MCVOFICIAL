"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    buildWipeReportEmbeds,
    formatPlayerLine,
    filterReport,
    effectiveHoursForWindow
} = require("../wipeReport");
const { resolvePlaytimeSyncWindow } = require("../vitalWipeCalendar");

test("effectiveHoursForWindow oculta horas del wipe Monthly al leer ventana Medium", () => {
    const window = resolvePlaytimeSyncWindow({ wipeStartAt: new Date(2026, 5, 12, 18, 0, 0) });
    assert.equal(
        effectiveHoursForWindow(
            { hours_played: 57, hours_updated_at: new Date(2026, 5, 10, 12, 0, 0) },
            window
        ),
        null
    );
    assert.equal(
        effectiveHoursForWindow(
            { hours_played: 31, hours_updated_at: new Date(2026, 5, 19, 12, 0, 0) },
            window
        ),
        31
    );
});

test("formatPlayerLine muestra horas, puntos y sin @discord", () => {
    const line = formatPlayerLine(
        { persona_name: "Kami", hoursPlayed: 59, performanceScore: 42 },
        { showHours: true }
    );
    assert.match(line, /59h/);
    assert.match(line, /42 pts/);
    assert.doesNotMatch(line, /@/);
    assert.match(
        formatPlayerLine(
            { persona_name: "Checha", hoursPlayed: null, performanceScore: 0 },
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
        withHours: [{ persona_name: "A", hoursPlayed: 10, performanceScore: 5 }],
        pendingHours: [{ persona_name: "B", hoursPlayed: null, performanceScore: 0 }],
        rows: []
    };
    const onlyHours = filterReport(report, "con_horas");
    assert.equal(onlyHours.withHours.length, 1);
    assert.equal(onlyHours.pendingHours.length, 0);
    const onlyPending = filterReport(report, "sin_horas");
    assert.equal(onlyPending.withHours.length, 0);
    assert.equal(onlyPending.pendingHours.length, 1);
});

test("displayName usa campos camelCase del reporte", () => {
    assert.equal(
        formatPlayerLine(
            { personaName: "Walphur", hoursPlayed: 31, performanceScore: 10 },
            { showHours: true }
        ),
        "• **Walphur** — **31h** · **10 pts**"
    );
});

test("buildWipeReportEmbeds incluye resumen y listas", () => {
    const embeds = buildWipeReportEmbeds({
        totalLinked: 2,
        withHoursCount: 1,
        pendingHoursCount: 1,
        withPointsCount: 1,
        withHours: [{ persona_name: "Kami", hoursPlayed: 59, performanceScore: 80 }],
        pendingHours: [{ persona_name: "Checha", hoursPlayed: null, performanceScore: 0 }],
        rows: []
    });
    assert.ok(embeds.length >= 2);
    const allText = embeds.map((e) => JSON.stringify(e.data || e)).join(" ");
    assert.match(allText, /Vinculados Discord/);
    assert.match(allText, /Kami/);
    assert.match(allText, /80 pts/);
});
