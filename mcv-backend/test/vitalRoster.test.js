"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { loadClanSteamIds, normalizeSteamId64 } = require("../vitalRustApi");

function mockPool(queryMap) {
    return {
        query: async (sql) => {
            for (const [needle, result] of Object.entries(queryMap)) {
                if (sql.includes(needle)) {
                    return typeof result === "function" ? result(sql) : result;
                }
            }
            return { rows: [] };
        }
    };
}

const STEAM_A = "76561198000000001";
const STEAM_B = "76561198000000002";
const STEAM_C = "76561198000000003";

beforeEach(() => {
    process.env.VITAL_API_USE_WIPE_LIST = "1";
    process.env.VITAL_API_USE_TEAM_ROSTER = "0";
    process.env.VITAL_API_USE_PLAYER_INFO = "1";
    process.env.VITAL_CLAN_EXTRA_STEAMS = "";
});

test("normalizeSteamId64 acepta solo IDs válidos", () => {
    assert.equal(normalizeSteamId64(STEAM_A), STEAM_A);
    assert.equal(normalizeSteamId64("invalid"), null);
});

test("loadClanSteamIds une wipe list e Info jugadores activos", async () => {
    const pool = mockPool({
        "vital_extra_steam_ids": { rows: [] },
        "wipe_list_members": { rows: [{ steam_id64: STEAM_A }] },
        "player_info_profiles": {
            rows: [
                {
                    steam_id64: STEAM_B,
                    status_tag: "mcv_active",
                    wipe_phase: "inicio",
                    paused_outside_wipe: false
                }
            ]
        }
    });
    const roster = await loadClanSteamIds(() => pool);
    assert.equal(roster.ids.length, 2);
    assert.ok(roster.ids.includes(STEAM_A));
    assert.ok(roster.ids.includes(STEAM_B));
    assert.equal(roster.playerInfoCount, 1);
});

test("loadClanSteamIds omite Info jugadores si VITAL_API_USE_PLAYER_INFO=0", async () => {
    process.env.VITAL_API_USE_PLAYER_INFO = "0";
    const pool = mockPool({
        "vital_extra_steam_ids": { rows: [] },
        "wipe_list_members": { rows: [{ steam_id64: STEAM_C }] },
        "player_info_profiles": {
            rows: [
                {
                    steam_id64: STEAM_B,
                    status_tag: "mcv_active",
                    wipe_phase: "inicio",
                    paused_outside_wipe: false
                }
            ]
        }
    });
    const roster = await loadClanSteamIds(() => pool);
    assert.deepEqual(roster.ids, [STEAM_C]);
    assert.equal(roster.playerInfoCount, 0);
});

test("loadClanSteamIds incluye extras manuales de BD", async () => {
    const steamExtra = "76561198000000099";
    const pool = mockPool({
        "vital_extra_steam_ids": { rows: [{ steam_id64: steamExtra, label: "trial" }] },
        "wipe_list_members": { rows: [] },
        "player_info_profiles": { rows: [] }
    });
    const roster = await loadClanSteamIds(() => pool);
    assert.ok(roster.ids.includes(steamExtra));
    assert.equal(roster.manualOnlyCount, 1);
});
