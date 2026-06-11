"use strict";

const axios = require("axios");
const { authAdmin } = require("./auth");

function normalizeOptionalUrl(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) {
        return null;
    }
    if (s.length > 512) {
        return null;
    }
    const lower = s.toLowerCase();
    if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
        return null;
    }
    if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
        return null;
    }
    return s;
}

function extractSteamId64(text) {
    const s = String(text || "").trim();
    if (!s) {
        return null;
    }
    // Prefer el bloque típico SteamID64 (7656119 + 10 dígitos) dentro de URLs o texto.
    const std = s.match(/\b7656119[0-9]{10}\b/);
    if (std) {
        return std[0];
    }
    const d = s.replace(/\D/g, "");
    if (d.length === 17) {
        return d;
    }
    if (d.length > 17) {
        let pos = 0;
        while ((pos = d.indexOf("7656119", pos)) !== -1) {
            const slice = d.slice(pos, pos + 17);
            if (slice.length === 17 && /^7656119\d{10}$/.test(slice)) {
                return slice;
            }
            pos += 1;
        }
    }
    return null;
}

/**
 * Resuelve SteamID64 desde texto, URL /profiles/765…, /profile/765… o /id/vanity con Steam API.
 */
async function resolveSteamId64FromInput(raw, steamApiKey) {
    const direct = extractSteamId64(raw);
    if (direct) {
        return direct;
    }
    const s = String(raw || "").trim();
    if (!steamApiKey || !s) {
        return null;
    }
    try {
        const urlStr = /^https?:\/\//i.test(s) ? s : `https://${s}`;
        const u = new URL(urlStr);
        const host = u.hostname.toLowerCase();
        if (host !== "steamcommunity.com" && host !== "www.steamcommunity.com") {
            return null;
        }
        const parts = u.pathname.split("/").filter(Boolean);
        const idIdx = parts.indexOf("id");
        if (idIdx >= 0 && parts[idIdx + 1]) {
            const vanity = String(parts[idIdx + 1]).split("?")[0].replace(/\/$/, "");
            if (!vanity || vanity.length > 64 || /^\d+$/.test(vanity)) {
                return null;
            }
            const { data } = await axios.get("https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/", {
                params: { key: steamApiKey, vanityurl: vanity, url_type: 1 },
                timeout: 12000
            });
            const sid = data?.response?.steamid;
            if (sid && String(sid).replace(/\D/g, "").length === 17) {
                return String(sid).replace(/\D/g, "").slice(0, 17);
            }
        }
    } catch (e) {
        console.warn("resolveSteamId64FromInput:", e.message);
    }
    return null;
}

async function fetchSteamProfile(steamApiKey, steamId64) {
    if (!steamApiKey || !steamId64) {
        return null;
    }
    try {
        const { data } = await axios.get(
            "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
            {
                params: { key: steamApiKey, steamids: steamId64 },
                timeout: 12000
            }
        );
        const p = data?.response?.players?.[0];
        if (!p) {
            return null;
        }
        return {
            persona: p.personaname || steamId64,
            avatar: p.avatarfull || p.avatarmedium || p.avatar || ""
        };
    } catch (e) {
        console.warn("teamRoster fetchSteamProfile:", e.message);
        return null;
    }
}

function registerTeamRosterApi(app, { getPool, steamApiKey }) {
    app.get("/api/team-roster", async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        try {
            const r = await pool.query(
                `SELECT id, display_name, role_label, steam_id64,
            twitch_url, kick_url, x_url, instagram_url, youtube_url, tiktok_url,
            persona_name, avatar_url
         FROM team_roster_submissions
         WHERE status = 'approved'
         ORDER BY LOWER(display_name) ASC, id ASC`
            );
            return res.json({ members: r.rows });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "team-roster" });
        }
    });

    app.post("/api/team-roster/submit", async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const displayName = String(req.body?.display_name ?? "").trim();
        if (!displayName || displayName.length > 120) {
            return res.status(400).json({ error: "Nombre visible obligatorio (máx. 120 caracteres)" });
        }
        const roleLabel = String(req.body?.role_label ?? "").trim();
        const roleFinal = roleLabel.length > 120 ? roleLabel.slice(0, 120) : roleLabel || null;

        const steamId64 = await resolveSteamId64FromInput(
            req.body?.steam_id64 ?? req.body?.steam ?? "",
            steamApiKey
        );
        const twitchUrl = normalizeOptionalUrl(req.body?.twitch_url);
        const kickUrl = normalizeOptionalUrl(req.body?.kick_url);
        const xUrl = normalizeOptionalUrl(req.body?.x_url ?? req.body?.twitter_url);
        const instagramUrl = normalizeOptionalUrl(req.body?.instagram_url);
        const youtubeUrl = normalizeOptionalUrl(req.body?.youtube_url);
        const tiktokUrl = normalizeOptionalUrl(req.body?.tiktok_url);

        const hasAnyLink = Boolean(
            twitchUrl || kickUrl || xUrl || instagramUrl || youtubeUrl || tiktokUrl
        );
        if (!steamId64 && !hasAnyLink) {
            return res.status(400).json({
                error: "Indicá al menos tu SteamID64 (o link de perfil Steam) o un link https de red social"
            });
        }

        let personaName = null;
        let avatarUrl = null;
        if (steamId64 && steamApiKey) {
            const sp = await fetchSteamProfile(steamApiKey, steamId64);
            if (sp) {
                personaName = sp.persona;
                avatarUrl = sp.avatar || null;
            }
        }

        try {
            const ins = await pool.query(
                `INSERT INTO team_roster_submissions (
            display_name, role_label, steam_id64,
            twitch_url, kick_url, x_url, instagram_url, youtube_url, tiktok_url,
            persona_name, avatar_url, status, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending', NOW())
          RETURNING id, status, created_at`,
                [
                    displayName,
                    roleFinal,
                    steamId64,
                    twitchUrl,
                    kickUrl,
                    xUrl,
                    instagramUrl,
                    youtubeUrl,
                    tiktokUrl,
                    personaName,
                    avatarUrl
                ]
            );
            const row = ins.rows[0];
            return res.status(201).json({
                ok: true,
                id: row.id,
                status: row.status,
                created_at: row.created_at
            });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "team-roster-submit" });
        }
    });

    app.get("/api/admin/team-roster/submissions", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        try {
            const r = await pool.query(
                `SELECT id, display_name, role_label, steam_id64,
            twitch_url, kick_url, x_url, instagram_url, youtube_url, tiktok_url,
            persona_name, avatar_url, status, created_at, updated_at
         FROM team_roster_submissions
         ORDER BY
           CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
           created_at DESC
         LIMIT 500`
            );
            return res.json({ submissions: r.rows });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "team-roster-admin-list" });
        }
    });

    app.patch("/api/admin/team-roster/submissions/:id", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const body = req.body || {};
        try {
            const curR = await pool.query(`SELECT * FROM team_roster_submissions WHERE id = $1`, [id]);
            if (!curR.rows.length) {
                return res.status(404).json({ error: "No encontrado" });
            }

            const updates = [];
            const vals = [];
            let p = 1;

            if (body.display_name !== undefined) {
                const v = String(body.display_name ?? "").trim();
                if (!v || v.length > 120) {
                    return res.status(400).json({ error: "display_name inválido (1–120 caracteres)" });
                }
                updates.push(`display_name = $${p++}`);
                vals.push(v);
            }
            if (body.role_label !== undefined) {
                let v = String(body.role_label ?? "").trim();
                if (v.length > 120) {
                    v = v.slice(0, 120);
                }
                updates.push(`role_label = $${p++}`);
                vals.push(v || null);
            }
            if (body.steam_id64 !== undefined) {
                const raw = body.steam_id64;
                let sid = null;
                if (raw != null && String(raw).trim() !== "") {
                    sid = await resolveSteamId64FromInput(String(raw), steamApiKey);
                    if (!sid) {
                        return res.status(400).json({ error: "SteamID64 o perfil Steam no reconocido" });
                    }
                }
                updates.push(`steam_id64 = $${p++}`);
                vals.push(sid);
            }

            const urlPairs = [
                ["twitch_url", "twitch_url"],
                ["kick_url", "kick_url"],
                ["x_url", "x_url"],
                ["instagram_url", "instagram_url"],
                ["youtube_url", "youtube_url"],
                ["tiktok_url", "tiktok_url"]
            ];
            for (const [key, col] of urlPairs) {
                if (body[key] !== undefined) {
                    updates.push(`${col} = $${p++}`);
                    vals.push(normalizeOptionalUrl(body[key]));
                }
            }

            if (body.status !== undefined) {
                const st = String(body.status).trim().toLowerCase();
                if (st !== "approved" && st !== "rejected" && st !== "pending") {
                    return res.status(400).json({ error: "status debe ser pending, approved o rejected" });
                }
                updates.push(`status = $${p++}`);
                vals.push(st);
            }

            if (!updates.length) {
                return res.status(400).json({ error: "Nada para actualizar" });
            }

            vals.push(id);
            await pool.query(
                `UPDATE team_roster_submissions SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${p}`,
                vals
            );

            const r2 = await pool.query(`SELECT * FROM team_roster_submissions WHERE id = $1`, [id]);
            const row = r2.rows[0];

            if (steamApiKey && row.steam_id64) {
                const sp = await fetchSteamProfile(steamApiKey, row.steam_id64);
                if (sp) {
                    await pool.query(
                        `UPDATE team_roster_submissions SET persona_name = $1, avatar_url = $2 WHERE id = $3`,
                        [sp.persona, sp.avatar || null, id]
                    );
                }
            }

            const r3 = await pool.query(`SELECT * FROM team_roster_submissions WHERE id = $1`, [id]);
            return res.json({ ok: true, submission: r3.rows[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "team-roster-admin-patch" });
        }
    });

    app.delete("/api/admin/team-roster/submissions/:id", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) {
            return res.status(400).json({ error: "ID inválido" });
        }
        try {
            const r = await pool.query(`DELETE FROM team_roster_submissions WHERE id = $1 RETURNING id`, [id]);
            if (!r.rows.length) {
                return res.status(404).json({ error: "No encontrado" });
            }
            return res.json({ ok: true, deleted: id });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "team-roster-admin-delete" });
        }
    });
}

module.exports = { registerTeamRosterApi };
