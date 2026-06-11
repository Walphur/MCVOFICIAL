"use strict";

const axios = require("axios");

async function fetchSteamProfile(steamApiKey, steamId64) {
    if (!steamApiKey || !steamId64) {
        return null;
    }
    try {
        const { data } = await axios.get("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/", {
            params: { key: steamApiKey, steamids: steamId64 },
            timeout: 12000
        });
        return data?.response?.players?.[0] || null;
    } catch (e) {
        console.warn("site user steam profile:", e.message);
        return null;
    }
}

async function upsertUserFromSteam(pool, steamId64, profile) {
    const displayName = String(profile?.personaname || steamId64).slice(0, 120);
    const avatarUrl = String(profile?.avatarfull || profile?.avatarmedium || "").slice(0, 512) || null;
    const r = await pool.query(
        `INSERT INTO site_users (steam_id64, display_name, avatar_url, auth_provider, last_login_at)
         VALUES ($1, $2, $3, 'steam', NOW())
         ON CONFLICT (steam_id64) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            avatar_url = COALESCE(EXCLUDED.avatar_url, site_users.avatar_url),
            last_login_at = NOW()
         RETURNING id, steam_id64, google_email, display_name, avatar_url, auth_provider, created_at, last_login_at`,
        [steamId64, displayName, avatarUrl]
    );
    return r.rows[0];
}

async function upsertUserFromGoogle(pool, googleSub, email, profile) {
    const displayName = String(profile?.name || profile?.given_name || email || "Usuario").slice(0, 120);
    const avatarUrl = String(profile?.picture || "").slice(0, 512) || null;
    const mail = String(email || "").slice(0, 254).toLowerCase() || null;
    const r = await pool.query(
        `INSERT INTO site_users (google_sub, google_email, display_name, avatar_url, auth_provider, last_login_at)
         VALUES ($1, $2, $3, $4, 'google', NOW())
         ON CONFLICT (google_sub) DO UPDATE SET
            google_email = COALESCE(EXCLUDED.google_email, site_users.google_email),
            display_name = EXCLUDED.display_name,
            avatar_url = COALESCE(EXCLUDED.avatar_url, site_users.avatar_url),
            last_login_at = NOW()
         RETURNING id, steam_id64, google_email, display_name, avatar_url, auth_provider, created_at, last_login_at`,
        [googleSub, mail, displayName, avatarUrl]
    );
    return r.rows[0];
}

async function linkSteamToUser(pool, userId, steamId64, profile) {
    const id = Number.parseInt(String(userId || ""), 10);
    if (!Number.isFinite(id) || id < 1) {
        throw new Error("invalid_user");
    }
    const steam = String(steamId64 || "").trim();
    if (!/^\d{17}$/.test(steam)) {
        throw new Error("invalid_steam");
    }
    const taken = await pool.query(`SELECT id FROM site_users WHERE steam_id64 = $1 AND id <> $2 LIMIT 1`, [
        steam,
        id
    ]);
    if (taken.rows.length) {
        const err = new Error("steam_taken");
        err.code = "steam_taken";
        throw err;
    }
    const displayName = String(profile?.personaname || "").slice(0, 120);
    const avatarUrl = String(profile?.avatarfull || profile?.avatarmedium || "").slice(0, 512) || null;
    const r = await pool.query(
        `UPDATE site_users
         SET steam_id64 = $2,
             display_name = CASE WHEN $3 <> '' THEN $3 ELSE display_name END,
             avatar_url = COALESCE($4, avatar_url),
             last_login_at = NOW()
         WHERE id = $1
         RETURNING id, steam_id64, google_email, display_name, avatar_url, auth_provider, created_at, last_login_at`,
        [id, steam, displayName, avatarUrl]
    );
    if (!r.rows.length) {
        throw new Error("user_not_found");
    }
    return r.rows[0];
}

async function getSiteUserById(pool, userId) {
    const id = Number.parseInt(String(userId || ""), 10);
    if (!Number.isFinite(id) || id < 1) {
        return null;
    }
    const r = await pool.query(
        `SELECT id, steam_id64, google_email, display_name, avatar_url, auth_provider, created_at, last_login_at
         FROM site_users WHERE id = $1`,
        [id]
    );
    return r.rows[0] || null;
}

async function getSiteUserBySteamId(pool, steamId64) {
    const steam = String(steamId64 || "").trim();
    if (!/^\d{17}$/.test(steam)) {
        return null;
    }
    const r = await pool.query(
        `SELECT id, steam_id64, google_email, display_name, avatar_url, auth_provider, created_at, last_login_at
         FROM site_users WHERE steam_id64 = $1`,
        [steam]
    );
    return r.rows[0] || null;
}

function serializeSiteUser(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        steamId64: row.steam_id64 || null,
        email: row.google_email || null,
        displayName: row.display_name || "",
        avatarUrl: row.avatar_url || null,
        authProvider: row.auth_provider,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at
    };
}

module.exports = {
    fetchSteamProfile,
    upsertUserFromSteam,
    upsertUserFromGoogle,
    linkSteamToUser,
    getSiteUserById,
    getSiteUserBySteamId,
    serializeSiteUser
};
