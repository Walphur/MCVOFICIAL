"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
    registerVitalRustApi,
    resolveTurretOperatorFromRequest,
    loadTurretRosterPlayers
} = require("../vitalRustApi");

const STEAM_OPERATOR = "76561198000000001";
const STEAM_OTHER = "76561198000000099";
const STEAM_PLAYER = "76561198000000002";

function mockPool(queryMap) {
    return {
        query: async (sql, params) => {
            if (sql.includes("FROM site_users WHERE id")) {
                const id = params && params[0];
                if (id === 1) {
                    return { rows: [{ id: 1, steam_id64: STEAM_OPERATOR, display_name: "Torretero" }] };
                }
                if (id === 2) {
                    return { rows: [{ id: 2, steam_id64: STEAM_OTHER, display_name: "Guest" }] };
                }
                return { rows: [] };
            }
            if (sql.includes("turret_operator_steam_ids")) {
                if (sql.includes("SELECT steam_id64")) {
                    return { rows: [{ steam_id64: STEAM_OPERATOR, label: "main", created_at: new Date() }] };
                }
                return { rows: [] };
            }
            if (sql.includes("FROM player_info_profiles")) {
                return {
                    rows: [
                        {
                            steam_id64: STEAM_PLAYER,
                            display_name: "Jugador A",
                            status_tag: "mcv_active",
                            wipe_phase: "inicio",
                            paused_outside_wipe: false
                        },
                        {
                            steam_id64: "76561198000000003",
                            display_name: "Jugador B",
                            status_tag: "mcv_active",
                            wipe_phase: "no_juega",
                            paused_outside_wipe: true
                        }
                    ]
                };
            }
            if (sql.includes("CREATE TABLE")) {
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

beforeEach(() => {
    process.env.TURRET_OPERATOR_STEAMS = "";
});

test("resolveTurretOperatorFromRequest permite Steam en allowlist", async () => {
    const pool = mockPool({});
    registerVitalRustApi(express(), {
        getPool: () => pool,
        getDiscordClient: () => null,
        getPlaytimeChannelId: () => null
    });

    const resolved = await resolveTurretOperatorFromRequest({ userAuth: { userId: 1 } });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.steamId64, STEAM_OPERATOR);
});

test("resolveTurretOperatorFromRequest niega Steam fuera de allowlist", async () => {
    const pool = mockPool({});
    registerVitalRustApi(express(), {
        getPool: () => pool,
        getDiscordClient: () => null,
        getPlaytimeChannelId: () => null
    });

    const resolved = await resolveTurretOperatorFromRequest({ userAuth: { userId: 2 } });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.status, 403);
});

test("loadTurretRosterPlayers marca juega wipe según perfil", async () => {
    const pool = mockPool({});
    const rows = await loadTurretRosterPlayers(pool);
    assert.equal(rows.length, 2);
    const playing = rows.find((r) => r.steamId64 === STEAM_PLAYER);
    const notPlaying = rows.find((r) => r.steamId64 === "76561198000000003");
    assert.equal(playing.playsWipe, true);
    assert.equal(notPlaying.playsWipe, false);
    assert.equal(notPlaying.wipePhaseLabel, "No juega");
});
