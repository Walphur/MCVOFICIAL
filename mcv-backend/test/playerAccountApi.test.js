"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    canUserVouch,
    buildWipeUpdateFields,
    normalizeBmUrl,
    serializeVouchRequest,
    formatLateIntentLabel
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

test("buildWipeUpdateFields valida late con tipo y detalle", () => {
    assert.deepEqual(buildWipeUpdateFields({ participation: "no_juega" }), {
        wipePhase: "no_juega",
        hoursBand: null,
        lateReasonType: null,
        lateReason: null,
        pausedOutsideWipe: true
    });
    assert.equal(
        buildWipeUpdateFields({ participation: "late" }).error,
        "Elegí por qué entrás late: no llegás al inicio o jugás pocas horas."
    );
    assert.deepEqual(
        buildWipeUpdateFields({ participation: "late", lateReasonType: "pocas_horas" }),
        {
            wipePhase: "late",
            hoursBand: "light",
            lateReasonType: "pocas_horas",
            lateReason: null,
            pausedOutsideWipe: false
        }
    );
    assert.equal(
        buildWipeUpdateFields({ participation: "late", lateReasonType: "no_llega", hoursBand: "heavy" }).error,
        "Contanos cuándo entrás o por qué no llegás al inicio."
    );
    assert.deepEqual(
        buildWipeUpdateFields({
            participation: "late",
            lateReasonType: "no_llega",
            hoursBand: "heavy",
            lateReason: "Entro el jueves"
        }),
        {
            wipePhase: "late",
            hoursBand: "heavy",
            lateReasonType: "no_llega",
            lateReason: "Entro el jueves",
            pausedOutsideWipe: false
        }
    );
    assert.deepEqual(buildWipeUpdateFields({ participation: "inicio", hoursBand: "heavy" }), {
        wipePhase: "inicio",
        hoursBand: "heavy",
        lateReasonType: null,
        lateReason: null,
        pausedOutsideWipe: false
    });
});

test("formatLateIntentLabel describe motivo late", () => {
    assert.equal(formatLateIntentLabel("pocas_horas", null), "Entro al wipe pero juego pocas horas");
    assert.equal(formatLateIntentLabel("no_llega", "Laburo"), "No llego al inicio del wipe: Laburo");
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
