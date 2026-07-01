"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    canUserVouch,
    buildWipeUpdateFields,
    normalizeBmUrl,
    serializeVouchRequest
} = require("../playerAccountApi");

test("canUserVouch permite activos que juegan el wipe", () => {
    assert.equal(canUserVouch({ statusTag: "mcv_active", wipePhase: "inicio", pausedOutsideWipe: false }), true);
    assert.equal(canUserVouch({ statusTag: "admin", wipePhase: "late", pausedOutsideWipe: false }), true);
    assert.equal(canUserVouch({ statusTag: "mcv_strikes", wipePhase: "inicio", pausedOutsideWipe: false }), true);
});

test("canUserVouch rechaza no_juega, pausa e invitados", () => {
    assert.equal(canUserVouch({ statusTag: "mcv_active", wipePhase: "no_juega" }), false);
    assert.equal(canUserVouch({ statusTag: "mcv_active", wipePhase: "inicio", pausedOutsideWipe: true }), false);
    assert.equal(canUserVouch({ statusTag: "wipe_guest", wipePhase: "inicio" }), false);
    assert.equal(canUserVouch(null), false);
});

test("buildWipeUpdateFields valida late y horas", () => {
    assert.deepEqual(buildWipeUpdateFields({ participation: "no_juega" }), {
        wipePhase: "no_juega",
        hoursBand: null,
        lateReason: null,
        pausedOutsideWipe: true
    });
    assert.equal(buildWipeUpdateFields({ participation: "inicio" }).error, "Indicá si vas a jugar pocas horas o muchas.");
    assert.deepEqual(buildWipeUpdateFields({ participation: "inicio", hoursBand: "heavy" }), {
        wipePhase: "inicio",
        hoursBand: "heavy",
        lateReason: null,
        pausedOutsideWipe: false
    });
    assert.equal(buildWipeUpdateFields({ participation: "late", hoursBand: "light" }).error, "Si entrás late, contanos brevemente por qué.");
    assert.deepEqual(buildWipeUpdateFields({ participation: "late", hoursBand: "light", lateReason: "Trabajo" }), {
        wipePhase: "late",
        hoursBand: "light",
        lateReason: "Trabajo",
        pausedOutsideWipe: false
    });
});

test("normalizeBmUrl exige link BattleMetrics", () => {
    assert.equal(normalizeBmUrl("https://www.battlemetrics.com/players/123"), "https://www.battlemetrics.com/players/123");
    assert.equal(normalizeBmUrl("https://google.com"), null);
    assert.equal(normalizeBmUrl(""), null);
});

test("serializeVouchRequest expone voucher", () => {
    const row = serializeVouchRequest({
        id: 1,
        candidate_steam_id64: "76561198000000001",
        candidate_display_name: "Nuevo",
        candidate_discord: "nuevo#0",
        candidate_bm_url: "https://www.battlemetrics.com/players/1",
        voucher_steam_id64: "76561198000000002",
        voucher_display_name: "Voucher",
        note: "ok",
        status: "pending",
        reviewed_by: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01"
    });
    assert.equal(row.voucherDisplayName, "Voucher");
    assert.equal(row.candidateSteamId64, "76561198000000001");
});
