"use strict";

/**
 * Roster Discord → roles MCV (wipe actual).
 * Se matchea por display_name en player_info_profiles (sin SteamID en este listado).
 */
const DISCORD_WIPE_ROSTER = {
    "BUILDERS / RAID BASE": [
        "Craza",
        "Fuego",
        "TDM",
        "Ivansfy",
        "Provider",
        "Milan",
        "anxoo98",
        "Sway"
    ],
    EXTERNALS: ["Kitus", "Dariioo"],
    ELEC: ["titus", "Shudex", "Miguelin", "pupu-Mutki", "KINGI", "Jordi", "SHARK"],
    HUERTO: ["Sani"],
    "OUTPOST/VENDING": ["ryota", "Pegatina"],
    "BASE BITCH": ["Shudex", "pupu-Mutki", "Checha", "Pegatina", "MK33", "WALPHUR", "SHARK"],
    "MAIN COMPS": [
        "cRiS",
        "Ivansfy",
        "MK33",
        "bASIK",
        "Art of War",
        "menfis",
        "Shudex",
        "DANI",
        "ivaan",
        "SERGIO",
        "miki123",
        "sami",
        "Dariioo",
        "Overcast",
        "Vissity",
        "tato",
        "spring kys"
    ],
    "MAIN FARMERS": [
        "bxmb",
        "unity458",
        "titus",
        "Miguelin",
        "sami",
        "ryota",
        "Fuego",
        "blz",
        "Kitus",
        "Milan",
        "SILXNT",
        "Deathz",
        "x1ps",
        "Brc",
        "anxoo98",
        "L$T Have Fun",
        "Kami"
    ],
    "IGL RAIDS / WIPE": ["Art of War", "ivaan"],
    "IGL FIGHTS": ["ivaan", "Art of War"],
    COMBAT: ["BIDEN", "Milan", "SILXNT"]
};

function normalizeNameKey(raw) {
    let s = String(raw || "")
        .replace(/^[@!]+/g, "")
        .replace(/\s*\/\/.*$/g, "")
        .trim();
    s = s.split(/\s*[-–—]\s*/)[0].trim();
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

function nameKeysFromLabel(label) {
    const keys = new Set();
    const raw = String(label || "").trim();
    if (!raw) return keys;

    const add = (part) => {
        const p = String(part || "").trim();
        if (!p) return;
        keys.add(normalizeNameKey(p));
        const noSuffix = p.split(/\s*[-–—]\s*/)[0].trim();
        if (noSuffix) keys.add(normalizeNameKey(noSuffix));
    };

    add(raw);
    raw.split(/\s*[\/|]\s*/).forEach(add);
    return keys;
}

function buildProfileIndex(profiles) {
    const index = new Map();
    for (const profile of profiles || []) {
        const steamId64 = String(profile.steamId64 || profile.steam_id64 || "").trim();
        if (!steamId64) continue;
        const displayName = String(profile.displayName || profile.display_name || "").trim();
        const keys = nameKeysFromLabel(displayName);
        keys.forEach((k) => {
            if (k.length < 2) return;
            if (!index.has(k)) index.set(k, []);
            const list = index.get(k);
            if (!list.some((p) => p.steamId64 === steamId64)) {
                list.push({ steamId64, displayName });
            }
        });
    }
    return index;
}

function findProfileForDiscordNick(index, discordLabel) {
    const dkeys = nameKeysFromLabel(discordLabel);
    const candidates = new Map();

    for (const dk of dkeys) {
        if (dk.length < 2) continue;
        const exact = index.get(dk);
        if (exact) {
            exact.forEach((p) => candidates.set(p.steamId64, p));
        }
    }

    if (candidates.size === 1) {
        return [...candidates.values()][0];
    }

    if (candidates.size > 1) {
        const dkLong = [...dkeys].sort((a, b) => b.length - a.length)[0];
        for (const p of candidates.values()) {
            const pk = normalizeNameKey(p.displayName);
            if (pk === dkLong || pk.startsWith(dkLong) || dkLong.startsWith(pk)) {
                return p;
            }
        }
        return [...candidates.values()][0];
    }

    for (const dk of dkeys) {
        if (dk.length < 4) continue;
        for (const [pk, list] of index.entries()) {
            if (pk.length < 4) continue;
            if (pk === dk || pk.startsWith(dk) || dk.startsWith(pk)) {
                if (list.length === 1) return list[0];
            }
        }
    }

    return null;
}

function mergeRoleLabels(existing, toAdd) {
    const set = new Set();
    (existing || []).forEach((r) => {
        const v = String(r || "").trim();
        if (v) set.add(v);
    });
    (toAdd || []).forEach((r) => {
        const v = String(r || "").trim();
        if (v) set.add(v);
    });
    return [...set];
}

/**
 * @param {object} deps
 * @param {() => import('pg').Pool|null} deps.getPool
 * @param {Function} deps.ensurePlayerInfoTable
 * @param {Function} deps.ensureVitalRolesTable
 * @param {Function} deps.loadRoleLabelsMap
 * @param {Function} deps.syncPlayerRoleLinks
 * @param {object} [deps.roster] - override roster (tests)
 */
async function syncDiscordWipeRoles(deps) {
    const pool = deps.getPool();
    if (!pool) {
        throw new Error("Base de datos no disponible");
    }
    const ready = await deps.ensurePlayerInfoTable(pool);
    if (!ready) {
        throw new Error("No se pudo preparar player_info_profiles");
    }
    await deps.ensureVitalRolesTable(pool);

    const roster = deps.roster || DISCORD_WIPE_ROSTER;
    const r = await pool.query(
        `SELECT steam_id64, display_name FROM player_info_profiles ORDER BY LOWER(COALESCE(display_name, steam_id64))`
    );
    const profiles = r.rows.map((row) => ({
        steamId64: row.steam_id64,
        displayName: row.display_name
    }));
    const index = buildProfileIndex(profiles);
    const roleMap = await deps.loadRoleLabelsMap(
        pool,
        profiles.map((p) => p.steamId64)
    );

    const steamRoles = new Map();
    const matched = [];
    const notMatched = [];

    for (const [roleName, nickList] of Object.entries(roster)) {
        for (const nick of nickList) {
            const found = findProfileForDiscordNick(index, nick);
            if (!found) {
                notMatched.push({ role: roleName, discordNick: nick });
                continue;
            }
            matched.push({
                role: roleName,
                discordNick: nick,
                steamId64: found.steamId64,
                displayName: found.displayName
            });
            const cur = steamRoles.get(found.steamId64) || {
                steamId64: found.steamId64,
                displayName: found.displayName,
                roles: new Set(roleMap.get(found.steamId64) || [])
            };
            cur.roles.add(roleName);
            steamRoles.set(found.steamId64, cur);
        }
    }

    let updated = 0;
    const updatedPlayers = [];

    for (const entry of steamRoles.values()) {
        const roles = [...entry.roles];
        const roleLabel = roles.join(", ");
        await pool.query(
            `UPDATE player_info_profiles SET role_label = $2, updated_at = NOW() WHERE steam_id64 = $1`,
            [entry.steamId64, roleLabel]
        );
        await deps.syncPlayerRoleLinks(pool, entry.steamId64, roles);
        updated += 1;
        updatedPlayers.push({
            steamId64: entry.steamId64,
            displayName: entry.displayName,
            roles
        });
    }

    const uniqueNotMatched = [];
    const seen = new Set();
    for (const row of notMatched) {
        const key = `${row.role}::${row.discordNick}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniqueNotMatched.push(row);
    }

    return {
        ok: true,
        profilesInDb: profiles.length,
        playersUpdated: updated,
        assignmentsMatched: matched.length,
        assignmentsNotMatched: uniqueNotMatched.length,
        updatedPlayers,
        notMatched: uniqueNotMatched
    };
}

module.exports = {
    DISCORD_WIPE_ROSTER,
    normalizeNameKey,
    nameKeysFromLabel,
    buildProfileIndex,
    findProfileForDiscordNick,
    syncDiscordWipeRoles
};
