"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    buildWipeReportEmbeds,
    formatPlayerLine,
    filterReport,
    buildSinHorasPingChunks,
    collectPendingDiscordUserIds,
    filterReportToPlayingWipe
} = require("../wipeReport");

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

test("buildSinHorasPingChunks etiqueta Discord IDs reales", () => {
    const report = {
        pendingHours: [
            { persona_name: "Kami", discordUserId: "111111111111111111", hoursPlayed: null },
            { persona_name: "Checha", discordUserId: "222222222222222222", hoursPlayed: 0 },
            { persona_name: "Hex", discordUserId: "wipehx:abc", hoursPlayed: null }
        ]
    };
    assert.deepEqual(collectPendingDiscordUserIds(report), [
        "111111111111111111",
        "222222222222222222"
    ]);
    const { chunks, totalPending } = buildSinHorasPingChunks(report);
    assert.equal(totalPending, 3);
    assert.match(chunks[0].content, /<@111111111111111111>/);
    assert.match(chunks[0].content, /<@222222222222222222>/);
    assert.equal(chunks[0].userIds.length, 2);
    assert.match(chunks[0].content, /mcv-horas/);
});

test("buildSinHorasPingChunks sin pendientes", () => {
    const { chunks, totalPending } = buildSinHorasPingChunks({ pendingHours: [] });
    assert.equal(totalPending, 0);
    assert.match(chunks[0].content, /Todos los que juegan el wipe/);
});

test("buildSinHorasPingChunks sin_etiquetar lista nombres", () => {
    const { chunks } = buildSinHorasPingChunks(
        {
            pendingHours: [{ personaName: "Tato", discordUserId: "333333333333333333" }]
        },
        { noMentions: true }
    );
    assert.match(chunks[0].content, /Tato/);
    assert.doesNotMatch(chunks[0].content, /@/);
});

test("filterReportToPlayingWipe excluye pausados y no_juega", () => {
    const raw = {
        totalLinked: 4,
        rows: [
            {
                personaName: "Activo",
                discordUserId: "111111111111111111",
                hoursPlayed: null,
                wipePhase: "inicio",
                statusTag: "mcv_active",
                pausedOutsideWipe: false
            },
            {
                personaName: "Pausado",
                discordUserId: "222222222222222222",
                hoursPlayed: null,
                wipePhase: "inicio",
                statusTag: "mcv_active",
                pausedOutsideWipe: true
            },
            {
                personaName: "NoJuega",
                discordUserId: "333333333333333333",
                hoursPlayed: null,
                wipePhase: "no_juega",
                statusTag: "wipe_guest",
                pausedOutsideWipe: false
            },
            {
                personaName: "ConHoras",
                discordUserId: "444444444444444444",
                hoursPlayed: 40,
                wipePhase: "late",
                statusTag: "admin",
                pausedOutsideWipe: false
            }
        ],
        withHours: [],
        pendingHours: []
    };
    raw.pendingHours = raw.rows.filter((r) => !r.hoursPlayed);
    raw.withHours = raw.rows.filter((r) => r.hoursPlayed > 0);
    const filtered = filterReportToPlayingWipe(raw);
    assert.equal(filtered.totalLinked, 2);
    assert.equal(filtered.pendingHours.length, 1);
    assert.equal(filtered.pendingHours[0].personaName, "Activo");
    assert.equal(filtered.withHours.length, 1);
    assert.equal(filtered.withHours[0].personaName, "ConHoras");
    const { chunks } = buildSinHorasPingChunks(filtered);
    assert.match(chunks[0].content, /<@111111111111111111>/);
    assert.doesNotMatch(chunks[0].content, /<@222222222222222222>/);
    assert.doesNotMatch(chunks[0].content, /<@333333333333333333>/);
});
