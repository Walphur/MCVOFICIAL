"use strict";

const jwt = require("jsonwebtoken");
const axios = require("axios");

function jwtSecret() {
    const s = process.env.JWT_SECRET;
    if (!s || String(s).length < 12) {
        return null;
    }
    return s;
}

function authAdmin(req, res, next) {
    const secret = jwtSecret();
    if (!secret) {
        return res.status(503).json({ error: "JWT_SECRET no configurado (mín. 12 caracteres)" });
    }
    const h = req.headers.authorization;
    if (!h || !h.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No autorizado" });
    }
    try {
        const decoded = jwt.verify(h.slice(7), secret);
        if (!decoded || decoded.role !== "admin") {
            return res.status(403).json({ error: "Prohibido" });
        }
        next();
    } catch {
        return res.status(401).json({ error: "Token inválido o expirado" });
    }
}

function nextPow2(n) {
    let p = 1;
    while (p < n) {
        p <<= 1;
    }
    return p;
}

async function rosterBansCheck(steamIds, steamApiKey) {
    if (!steamApiKey) {
        return { ok: true, skipped: true, dirty: [] };
    }
    const batch = steamIds.slice(0, 100).join(",");
    const { data } = await axios.get(
        `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${steamApiKey}&steamids=${batch}`,
        { timeout: 15000 }
    );
    const players = data.players || [];
    const dirty = [];
    for (const p of players) {
        if ((p.NumberOfVACBans || 0) > 0 || (p.NumberOfGameBans || 0) > 0) {
            dirty.push({
                steamId: p.SteamId,
                vac: p.NumberOfVACBans,
                game: p.NumberOfGameBans
            });
        }
    }
    return { ok: dirty.length === 0, skipped: false, dirty };
}

function registerTournamentApi(app, { getPool, steamApiKey }) {
    app.post("/api/auth/login", (req, res) => {
        const adminPw = process.env.ADMIN_PASSWORD;
        const secret = jwtSecret();
        if (!adminPw || !secret) {
            return res.status(503).json({ error: "ADMIN_PASSWORD o JWT_SECRET no configurados" });
        }
        if (String(req.body?.password || "") !== adminPw) {
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }
        const token = jwt.sign({ role: "admin" }, secret, { expiresIn: "12h" });
        return res.json({ token });
    });

    app.get("/api/tournaments/:slug", async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const { slug } = req.params;
        try {
            const t = await pool.query(
                `SELECT t.*,
          (SELECT COUNT(*)::int FROM tournament_registrations r
            WHERE r.tournament_id = t.id AND r.status IN ('pending','accepted')) AS active_count,
          (SELECT COUNT(*)::int FROM tournament_registrations r
            WHERE r.tournament_id = t.id AND r.status = 'accepted') AS accepted_count,
          (SELECT COUNT(*)::int FROM tournament_registrations r
            WHERE r.tournament_id = t.id AND r.status = 'pending') AS pending_count,
          (SELECT COUNT(*)::int FROM tournament_registrations r
            WHERE r.tournament_id = t.id AND r.status = 'declined') AS declined_count,
          (SELECT team_name FROM tournament_registrations w WHERE w.id = t.winner_registration_id) AS winner_team_name
         FROM tournaments t WHERE t.slug = $1`,
                [slug]
            );
            if (t.rows.length === 0) {
                return res.status(404).json({ error: "Torneo no encontrado" });
            }
            return res.json({ tournament: t.rows[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "Error leyendo torneo" });
        }
    });

    app.post("/api/tournaments/:slug/register", async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const { slug } = req.params;
        const { teamName, teamTag, captainName, players } = req.body || {};

        if (!teamName || !captainName || !Array.isArray(players) || players.length !== 5) {
            return res.status(400).json({
                error: "Datos inválidos: teamName, captainName y 5 players requeridos"
            });
        }

        const roster = [];
        const steamIds = [];
        const seenSteam = new Set();
        for (let i = 0; i < players.length; i++) {
            const p = players[i] || {};
            const name = String(p.name || "").trim();
            const steam = String(p.steamId64 || "").replace(/\D/g, "");
            const discord = String(p.discord || "").trim();
            if (!name || steam.length !== 17 || !discord) {
                return res.status(400).json({
                    error: `Jugador ${i + 1}: nombre, SteamID64 (17 dígitos) y Discord requeridos`
                });
            }
            if (seenSteam.has(steam)) {
                return res.status(400).json({ error: "SteamID64 duplicado en el roster" });
            }
            seenSteam.add(steam);
            steamIds.push(steam);
            roster.push({ name, steamId64: steam, discord });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const tr = await client.query(
                "SELECT id, max_teams, status FROM tournaments WHERE slug = $1 FOR UPDATE",
                [slug]
            );
            if (tr.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ error: "Torneo no encontrado" });
            }
            const { id: tournamentId, max_teams: maxTeams, status } = tr.rows[0];
            if (status !== "open") {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "El torneo no acepta registros" });
            }

            const cnt = await client.query(
                `SELECT COUNT(*)::int AS c FROM tournament_registrations
         WHERE tournament_id = $1 AND status IN ('pending','accepted')`,
                [tournamentId]
            );
            if (cnt.rows[0].c >= maxTeams) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "Cupo de equipos completo" });
            }

            const ban = await rosterBansCheck(steamIds, steamApiKey);
            if (!ban.ok) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    error: "VAC o Game ban detectado en el roster",
                    dirty: ban.dirty
                });
            }

            const ins = await client.query(
                `INSERT INTO tournament_registrations
          (tournament_id, team_name, team_tag, captain_name, roster, status)
         VALUES ($1, $2, $3, $4, $5::jsonb, 'pending')
         RETURNING id, team_name, status, created_at`,
                [tournamentId, String(teamName).trim(), teamTag ? String(teamTag).trim() : null, String(captainName).trim(), JSON.stringify(roster)]
            );
            await client.query("COMMIT");
            return res.status(201).json({
                success: true,
                registration: ins.rows[0],
                bansCheckSkipped: ban.skipped
            });
        } catch (e) {
            await client.query("ROLLBACK");
            console.error(e);
            return res.status(500).json({ error: "No se pudo guardar el registro" });
        } finally {
            client.release();
        }
    });

    app.get("/api/admin/registrations", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const slug = String(req.query.slug || "");
        if (!slug) {
            return res.status(400).json({ error: "Query slug requerido" });
        }
        try {
            const r = await pool.query(
                `SELECT r.*, t.slug AS tournament_slug, t.title AS tournament_title
         FROM tournament_registrations r
         JOIN tournaments t ON t.id = r.tournament_id
         WHERE t.slug = $1
         ORDER BY r.created_at DESC`,
                [slug]
            );
            return res.json({ registrations: r.rows });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "Error listando registros" });
        }
    });

    app.patch("/api/admin/registrations/:id", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const id = Number(req.params.id);
        const status = req.body?.status;
        const adminNotes = req.body?.adminNotes;
        if (!["pending", "accepted", "declined"].includes(status)) {
            return res.status(400).json({ error: "status debe ser pending, accepted o declined" });
        }
        try {
            const r =
                adminNotes === undefined
                    ? await pool.query(
                          `UPDATE tournament_registrations
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
                          [status, id]
                      )
                    : await pool.query(
                          `UPDATE tournament_registrations
         SET status = $1, admin_notes = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
                          [status, String(adminNotes), id]
                      );
            if (r.rows.length === 0) {
                return res.status(404).json({ error: "Registro no encontrado" });
            }
            return res.json({ registration: r.rows[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "Error actualizando" });
        }
    });

    app.patch("/api/admin/tournaments/:slug/winner", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const { slug } = req.params;
        const wid = req.body?.winnerRegistrationId;
        if (wid !== null && wid !== undefined && (Number.isNaN(Number(wid)) || Number(wid) < 1)) {
            return res.status(400).json({ error: "winnerRegistrationId inválido" });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const t = await client.query("SELECT id FROM tournaments WHERE slug = $1 FOR UPDATE", [slug]);
            if (t.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ error: "Torneo no encontrado" });
            }
            const tid = t.rows[0].id;
            let winnerId = null;
            if (wid !== null && wid !== undefined && wid !== "") {
                const check = await client.query(
                    `SELECT id FROM tournament_registrations
           WHERE id = $1 AND tournament_id = $2 AND status = 'accepted'`,
                    [Number(wid), tid]
                );
                if (check.rows.length === 0) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({
                        error: "El ganador debe ser un registro aceptado de este torneo"
                    });
                }
                winnerId = Number(wid);
            }
            await client.query(
                `UPDATE tournaments SET winner_registration_id = $1 WHERE id = $2`,
                [winnerId, tid]
            );
            await client.query("COMMIT");
            return res.json({ success: true, winnerRegistrationId: winnerId });
        } catch (e) {
            await client.query("ROLLBACK");
            console.error(e);
            return res.status(500).json({ error: "Error guardando ganador" });
        } finally {
            client.release();
        }
    });

    app.post("/api/admin/tournaments/:slug/bracket/generate", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const { slug } = req.params;
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const t = await client.query("SELECT id FROM tournaments WHERE slug = $1 FOR UPDATE", [slug]);
            if (t.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ error: "Torneo no encontrado" });
            }
            const tournamentId = t.rows[0].id;

            const acc = await client.query(
                `SELECT id FROM tournament_registrations
         WHERE tournament_id = $1 AND status = 'accepted'
         ORDER BY random()`,
                [tournamentId]
            );
            const ids = acc.rows.map((row) => row.id);
            if (ids.length < 2) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: "Se necesitan al menos 2 equipos aceptados para generar bracket"
                });
            }

            await client.query("DELETE FROM tournament_matches WHERE tournament_id = $1", [tournamentId]);

            const B = nextPow2(ids.length);
            const padded = ids.slice();
            while (padded.length < B) {
                padded.push(null);
            }

            let slot = 0;
            for (let i = 0; i < B / 2; i++) {
                const a = padded[i];
                const b = padded[B - 1 - i];
                let winner = null;
                if (a && !b) {
                    winner = a;
                } else if (!a && b) {
                    winner = b;
                }
                await client.query(
                    `INSERT INTO tournament_matches
            (tournament_id, round_no, slot_no, registration_a_id, registration_b_id, winner_registration_id)
           VALUES ($1, 1, $2, $3, $4, $5)`,
                    [tournamentId, slot, a, b, winner]
                );
                slot += 1;
            }

            await client.query("COMMIT");
            return res.json({ success: true, round1Matches: B / 2 });
        } catch (e) {
            await client.query("ROLLBACK");
            console.error(e);
            return res.status(500).json({ error: "Error generando bracket" });
        } finally {
            client.release();
        }
    });

    app.patch("/api/admin/matches/:id/winner", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const matchId = Number(req.params.id);
        const winnerRid = Number(req.body?.winnerRegistrationId);
        if (!winnerRid) {
            return res.status(400).json({ error: "winnerRegistrationId requerido" });
        }
        try {
            const m = await pool.query("SELECT * FROM tournament_matches WHERE id = $1", [matchId]);
            if (m.rows.length === 0) {
                return res.status(404).json({ error: "Match no encontrado" });
            }
            const row = m.rows[0];
            const a = row.registration_a_id;
            const b = row.registration_b_id;
            if (!a || !b) {
                return res.status(400).json({ error: "Este match no requiere resultado (bye)" });
            }
            if (winnerRid !== a && winnerRid !== b) {
                return res.status(400).json({ error: "El ganador debe ser uno de los dos equipos" });
            }
            const u = await pool.query(
                `UPDATE tournament_matches SET winner_registration_id = $1 WHERE id = $2 RETURNING *`,
                [winnerRid, matchId]
            );
            return res.json({ match: u.rows[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "Error guardando resultado" });
        }
    });

    app.post("/api/admin/tournaments/:slug/bracket/next-round", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const { slug } = req.params;
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const t = await client.query("SELECT id FROM tournaments WHERE slug = $1 FOR UPDATE", [slug]);
            if (t.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ error: "Torneo no encontrado" });
            }
            const tournamentId = t.rows[0].id;

            const maxR = await client.query(
                "SELECT COALESCE(MAX(round_no), 0)::int AS mx FROM tournament_matches WHERE tournament_id = $1",
                [tournamentId]
            );
            const prevRound = maxR.rows[0].mx;
            if (prevRound < 1) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "No hay bracket: generá la ronda 1 primero" });
            }

            const open = await client.query(
                `SELECT id FROM tournament_matches
         WHERE tournament_id = $1 AND round_no = $2 AND winner_registration_id IS NULL
           AND registration_a_id IS NOT NULL AND registration_b_id IS NOT NULL`,
                [tournamentId, prevRound]
            );
            if (open.rows.length > 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: `Completá todos los resultados de la ronda ${prevRound} antes de avanzar`
                });
            }

            const prev = await client.query(
                `SELECT slot_no, winner_registration_id, registration_a_id, registration_b_id
         FROM tournament_matches
         WHERE tournament_id = $1 AND round_no = $2
         ORDER BY slot_no`,
                [tournamentId, prevRound]
            );

            const winners = [];
            for (const row of prev.rows) {
                let w = row.winner_registration_id;
                if (!w) {
                    if (row.registration_a_id && !row.registration_b_id) {
                        w = row.registration_a_id;
                    } else if (!row.registration_a_id && row.registration_b_id) {
                        w = row.registration_b_id;
                    }
                }
                if (w) {
                    winners.push(w);
                }
            }

            if (winners.length <= 1) {
                if (winners.length === 1) {
                    await client.query(
                        `UPDATE tournaments SET winner_registration_id = $1 WHERE id = $2`,
                        [winners[0], tournamentId]
                    );
                }
                await client.query("COMMIT");
                return res.json({
                    finished: true,
                    championRegistrationId: winners[0] || null
                });
            }

            const B = nextPow2(winners.length);
            const padded = winners.slice();
            while (padded.length < B) {
                padded.push(null);
            }

            const nextRound = prevRound + 1;
            const existing = await client.query(
                "SELECT 1 FROM tournament_matches WHERE tournament_id = $1 AND round_no = $2 LIMIT 1",
                [tournamentId, nextRound]
            );
            if (existing.rows.length > 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "La siguiente ronda ya existe" });
            }

            let slot = 0;
            for (let i = 0; i < B / 2; i++) {
                const a = padded[i];
                const b = padded[B - 1 - i];
                let winner = null;
                if (a && !b) {
                    winner = a;
                } else if (!a && b) {
                    winner = b;
                }
                await client.query(
                    `INSERT INTO tournament_matches
            (tournament_id, round_no, slot_no, registration_a_id, registration_b_id, winner_registration_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
                    [tournamentId, nextRound, slot, a, b, winner]
                );
                slot += 1;
            }

            await client.query("COMMIT");
            return res.json({ success: true, round: nextRound, matches: B / 2 });
        } catch (e) {
            await client.query("ROLLBACK");
            console.error(e);
            return res.status(500).json({ error: "Error creando siguiente ronda" });
        } finally {
            client.release();
        }
    });

    app.get("/api/tournaments/:slug/bracket", async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const { slug } = req.params;
        try {
            const t = await pool.query("SELECT id, winner_registration_id FROM tournaments WHERE slug = $1", [slug]);
            if (t.rows.length === 0) {
                return res.status(404).json({ error: "Torneo no encontrado" });
            }
            const tournamentId = t.rows[0].id;
            const m = await pool.query(
                `SELECT m.*,
            ta.team_name AS side_a_name,
            tb.team_name AS side_b_name,
            tw.team_name AS winner_name
           FROM tournament_matches m
           LEFT JOIN tournament_registrations ta ON ta.id = m.registration_a_id
           LEFT JOIN tournament_registrations tb ON tb.id = m.registration_b_id
           LEFT JOIN tournament_registrations tw ON tw.id = m.winner_registration_id
           WHERE m.tournament_id = $1
           ORDER BY m.round_no, m.slot_no`,
                [tournamentId]
            );
            return res.json({
                winnerRegistrationId: t.rows[0].winner_registration_id,
                matches: m.rows
            });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "Error leyendo bracket" });
        }
    });

    app.post("/verificar-equipo", async (req, res) => {
        const { steamIDs } = req.body || {};
        if (!Array.isArray(steamIDs) || steamIDs.length === 0) {
            return res.status(400).json({ success: false, error: "steamIDs requerido" });
        }
        const cleaned = steamIDs.map((s) => String(s).replace(/\D/g, "")).filter((s) => s.length === 17);
        if (cleaned.length !== steamIDs.length) {
            return res.status(400).json({ success: false, error: "SteamID64 inválido" });
        }
        try {
            const ban = await rosterBansCheck(cleaned, steamApiKey);
            return res.json({
                success: true,
                rechazado: !ban.ok,
                dirty: ban.dirty,
                skipped: ban.skipped
            });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ success: false, error: e.message });
        }
    });
}

module.exports = { registerTournamentApi, authAdmin };
