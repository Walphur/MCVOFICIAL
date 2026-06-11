"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { registerVitalRustApi, resolveVitalMemberFromRequest } = require("../vitalRustApi");

const STEAM_ROSTER = "76561198000000001";
const STEAM_OTHER = "76561198000000099";

function mockPool(queryMap) {
    return {
        query: async (sql, params) => {
            if (sql.includes("FROM site_users WHERE id")) {
                const id = params && params[0];
                if (id === 1) {
                    return {
                        rows: [{ id: 1, steam_id64: STEAM_ROSTER, display_name: "Roster Player" }]
                    };
                }
                if (id === 2) {
                    return { rows: [{ id: 2, steam_id64: STEAM_OTHER, display_name: "Guest" }] };
                }
                return { rows: [] };
            }
            for (const [needle, result] of Object.entries(queryMap)) {
                if (sql.includes(needle)) {
                    return typeof result === "function" ? result(sql) : result;
                }
            }
            return { rows: [] };
        }
    };
}

function bindVitalPool(pool) {
    const app = express();
    registerVitalRustApi(app, {
        getPool: () => pool,
        getDiscordClient: () => null,
        getPlaytimeChannelId: () => null
    });
}

beforeEach(() => {
    process.env.VITAL_API_USE_WIPE_LIST = "1";
    process.env.VITAL_API_USE_TEAM_ROSTER = "0";
    process.env.VITAL_API_USE_PLAYER_INFO = "0";
    process.env.VITAL_CLAN_EXTRA_STEAMS = "";
});

test("resolveVitalMemberFromRequest permite Steam en roster", async () => {
    const pool = mockPool({
        "vital_extra_steam_ids": { rows: [] },
        "wipe_list_members": { rows: [{ steam_id64: STEAM_ROSTER }] }
    });
    bindVitalPool(pool);

    const resolved = await resolveVitalMemberFromRequest({ userAuth: { userId: 1 } });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.steamId64, STEAM_ROSTER);
});

test("resolveVitalMemberFromRequest niega Steam fuera del roster", async () => {
    const pool = mockPool({
        "vital_extra_steam_ids": { rows: [] },
        "wipe_list_members": { rows: [{ steam_id64: STEAM_ROSTER }] }
    });
    bindVitalPool(pool);

    const resolved = await resolveVitalMemberFromRequest({ userAuth: { userId: 2 } });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.status, 403);
    assert.match(resolved.error, /roster/i);
});
