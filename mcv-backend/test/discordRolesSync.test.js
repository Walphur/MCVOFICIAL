"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    findProfileForDiscordNick,
    buildProfileIndex,
    normalizeNameKey,
    syncDiscordWipeRoles
} = require("../discordRolesSync");

test("normalizeNameKey limpia caracteres Discord", () => {
    assert.equal(normalizeNameKey("! WALPHUR - MESSI"), "walphur");
    assert.equal(normalizeNameKey("anxoo98 - terminator"), "anxoo98");
});

test("findProfileForDiscordNick matchea por alias", () => {
    const profiles = [
        { steamId64: "76561198000000001", displayName: "WALPHUR" },
        { steamId64: "76561198000000002", displayName: "anxoo" },
        { steamId64: "76561198000000003", displayName: "Art of War" }
    ];
    const index = buildProfileIndex(profiles);
    assert.equal(findProfileForDiscordNick(index, "WALPHUR").steamId64, "76561198000000001");
    assert.equal(findProfileForDiscordNick(index, "anxoo98").steamId64, "76561198000000002");
    assert.equal(findProfileForDiscordNick(index, "Art of War").steamId64, "76561198000000003");
});

test("syncDiscordWipeRoles merge roles sin pisar", async () => {
    const updates = [];
    const pool = {
        query: async (sql, params) => {
            if (sql.includes("FROM player_info_profiles ORDER BY")) {
                return {
                    rows: [
                        { steam_id64: "76561198000000001", display_name: "Kitus" },
                        { steam_id64: "76561198000000002", display_name: "Shudex" }
                    ]
                };
            }
            if (sql.includes("UPDATE player_info_profiles SET role_label")) {
                updates.push({ steam: params[0], roles: params[1] });
                return { rowCount: 1 };
            }
            if (sql.includes("INSERT INTO mcv_vital_roles")) {
                return { rowCount: 1 };
            }
            return { rows: [] };
        }
    };

    const roleLinks = new Map([["76561198000000002", ["COMBAT"]]]);

    const result = await syncDiscordWipeRoles({
        getPool: () => pool,
        ensurePlayerInfoTable: async () => true,
        ensureVitalRolesTable: async () => true,
        loadRoleLabelsMap: async () => roleLinks,
        syncPlayerRoleLinks: async (_pool, steamId64, roles) => {
            roleLinks.set(steamId64, roles);
        },
        roster: {
            EXTERNALS: ["Kitus"],
            ELEC: ["Shudex"],
            COMBAT: ["Shudex"]
        }
    });

    assert.equal(result.playersUpdated, 2);
    assert.ok(roleLinks.get("76561198000000001").includes("EXTERNALS"));
    assert.ok(roleLinks.get("76561198000000002").includes("COMBAT"));
    assert.ok(roleLinks.get("76561198000000002").includes("ELEC"));
});
