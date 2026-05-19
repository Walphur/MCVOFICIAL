"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const axios = require("axios");

function makePosterUpload(uploadRoot) {
    if (!uploadRoot) {
        return null;
    }
    const dest = path.join(uploadRoot, "tournaments");
    const storage = multer.diskStorage({
        destination(req, file, cb) {
            fs.mkdirSync(dest, { recursive: true });
            cb(null, dest);
        },
        filename(req, file, cb) {
            const ext = path.extname(file.originalname || "").toLowerCase();
            const ok = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
            const suffix = ok.includes(ext) ? ext : ".webp";
            cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${suffix}`);
        }
    });
    return multer({
        storage,
        limits: { fileSize: 15 * 1024 * 1024 },
        fileFilter(req, file, cb) {
            if (file.mimetype.startsWith("image/")) {
                cb(null, true);
                return;
            }
            const name = String(file.originalname || "").toLowerCase();
            if (file.mimetype === "application/octet-stream" && /\.(png|jpe?g|webp|gif)$/i.test(name)) {
                cb(null, true);
                return;
            }
            cb(new Error("Solo imágenes (PNG, JPG, WebP, GIF)"));
        }
    });
}

/** URL absoluta para póster (Imgur, Discord CDN, etc.). Rechaza data:/javascript:. Acepta host sin esquema y añade https:// */
function normalizeExternalPosterUrl(raw) {
    let s = String(raw == null ? "" : raw).trim();
    if (!s) {
        return null;
    }
    if (s.length > 2048) {
        return null;
    }
    if (s.startsWith("/") && !s.startsWith("//")) {
        if (s.includes("..")) {
            return null;
        }
        if (/^\/uploads\/tournaments\//i.test(s)) {
            return s;
        }
        return null;
    }
    if (s.startsWith("//")) {
        s = `https:${s}`;
    } else if (!/^https?:\/\//i.test(s)) {
        if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(s)) {
            s = `https://${s}`;
        } else {
            return null;
        }
    }
    const lower = s.toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
        return null;
    }
    return s;
}

/** Vacío → null; si viene texto, debe ser ISO parseable por JS/Postgres. */
function optTimestamp(val) {
    const s = String(val == null ? "" : val).trim();
    if (!s) return null;
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) {
        return false;
    }
    return s;
}

function slugifyTitle(title) {
    const base = String(title || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
    return (base || "torneo") + "-" + crypto.randomBytes(3).toString("hex");
}

function jwtSecret() {
    const s = String(process.env.JWT_SECRET || "").trim();
    if (!s || s.length < 12) {
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

/** Hash de álbum o galería Imgur desde URL pública (sin auth). */
function extractImgurAlbumHashFromUrl(url) {
    const s = String(url || "").trim();
    const m = s.match(/imgur\.com\/(?:a|gallery)\/([a-zA-Z0-9]+)/i);
    return m ? m[1] : null;
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

function registerTournamentApi(app, { getPool, steamApiKey, uploadRoot }) {
    const posterUpload = makePosterUpload(uploadRoot || null);

    function optionalPosterMultipart(req, res, next) {
        if (posterUpload) {
            return posterUpload.single("poster")(req, res, (err) => {
                if (err) {
                    const code = err.code;
                    const msg =
                        code === "LIMIT_FILE_SIZE"
                            ? "Imagen demasiado grande (máx. 15 MB). Probá comprimir o exportar WebP/JPEG."
                            : err.message || "upload";
                    res.status(400).json({ error: msg });
                    return;
                }
                next();
            });
        }
        return multer().none()(req, res, next);
    }

    /**
     * Resuelve la primera imagen (o cover) de un álbum/galería Imgur para usar <img> en la web
     * (evita iframe con marco blanco y botón Share). Opcional: IMGUR_CLIENT_ID en env; si no hay,
     * se usa un Client-ID anónimo de solo lectura (puede fallar por rate limit).
     */
    app.get("/api/public/imgur-album-cover", async (req, res) => {
        const raw = String(req.query.url || req.query.u || "").trim();
        const hash = extractImgurAlbumHashFromUrl(raw);
        if (!hash) {
            return res.status(400).json({ error: "URL de álbum Imgur inválida" });
        }
        const clientId =
            String(process.env.IMGUR_CLIENT_ID || "").trim() || "546c25a59c58ad7";
        const headers = { Authorization: `Client-ID ${clientId}` };
        const opts = { headers, timeout: 12000, validateStatus: () => true };
        try {
            let ax = await axios.get(`https://api.imgur.com/3/album/${encodeURIComponent(hash)}`, opts);
            if (ax.status !== 200 || !ax.data || ax.data.success === false) {
                ax = await axios.get(`https://api.imgur.com/3/gallery/${encodeURIComponent(hash)}`, opts);
            }
            if (ax.status !== 200 || !ax.data || ax.data.success === false) {
                return res.status(404).json({ error: "Álbum no encontrado" });
            }
            const data = ax.data.data;
            let link = null;
            if (Array.isArray(data.images) && data.images.length > 0) {
                const coverId = data.cover;
                let pick = data.images[0];
                if (coverId) {
                    const found = data.images.find((im) => String(im.id) === String(coverId));
                    if (found) {
                        pick = found;
                    }
                }
                link = pick.link || pick.mp4 || pick.gifv || null;
            } else if (data.link) {
                link = data.link;
            }
            if (!link || typeof link !== "string") {
                return res.status(404).json({ error: "Sin imagen en el álbum" });
            }
            res.set("Cache-Control", "public, max-age=600");
            return res.json({ directUrl: link });
        } catch (e) {
            console.error("imgur-album-cover:", e.message);
            return res.status(500).json({ error: "imgur" });
        }
    });

    app.get("/api/auth/status", (req, res) => {
        const rawJwt = String(process.env.JWT_SECRET || "");
        const jwtTrim = rawJwt.trim();
        const hasAdminPassword = Boolean(String(process.env.ADMIN_PASSWORD || "").trim());
        const hasJwtSecret = Boolean(jwtTrim);
        const jwtLengthOk = jwtTrim.length >= 12;
        const loginPossible = hasAdminPassword && jwtLengthOk;
        return res.json({
            loginPossible,
            hasAdminPassword,
            hasJwtSecret,
            jwtLengthOk,
            jwtHadWhitespace: rawJwt.length !== jwtTrim.length,
            hasDatabaseUrl: Boolean(String(process.env.DATABASE_URL || "").trim())
        });
    });

    app.post("/api/auth/login", (req, res) => {
        const adminPw = String(process.env.ADMIN_PASSWORD || "").trim();
        const secret = jwtSecret();
        if (!adminPw || !secret) {
            return res.status(503).json({ error: "ADMIN_PASSWORD o JWT_SECRET no configurados" });
        }
        const given = String(req.body?.password || "").trim();
        if (given !== adminPw) {
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }
        const token = jwt.sign({ role: "admin" }, secret, { expiresIn: "12h" });
        return res.json({ token });
    });

    app.get("/api/tournaments/stats", async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        try {
            const [finishedQ, listedQ, teams] = await Promise.all([
                pool.query(`SELECT COUNT(*)::int AS c FROM tournaments WHERE status = 'finished'`),
                pool.query(
                    `SELECT COUNT(*)::int AS c FROM tournaments WHERE status IN ('finished','open','closed','draft')`
                ),
                pool.query(`SELECT COUNT(*)::int AS c FROM tournament_registrations`)
            ]);
            const rawWipe = String(process.env.MCV_HOME_WIPE_PLAYERS || "").trim();
            const wipeParsed = rawWipe === "" ? NaN : Number.parseInt(rawWipe, 10);
            let wipePlayersConfirmed =
                Number.isFinite(wipeParsed) && wipeParsed >= 0 ? wipeParsed : null;
            if (wipePlayersConfirmed == null) {
                try {
                    const wc = await pool.query(`SELECT COUNT(*)::int AS c FROM wipe_list_members`);
                    const c = wc.rows[0].c;
                    if (c > 0) {
                        wipePlayersConfirmed = c;
                    }
                } catch (_) {
                    /* tabla aún no existe en BD vieja */
                }
            }

            let teamRosterApproved = null;
            try {
                const tr = await pool.query(
                    `SELECT COUNT(*)::int AS c FROM team_roster_submissions WHERE status = 'approved'`
                );
                teamRosterApproved = tr.rows[0].c;
            } catch (_) {
                /* team_roster_submissions no existe en BD vieja */
            }

            const tournamentsFinished = finishedQ.rows[0].c;
            const tournamentsOnSite = listedQ.rows[0].c;
            return res.json({
                tournamentsFinished,
                tournamentsOnSite,
                teamsRegistered: teams.rows[0].c,
                /** @deprecated misma semántica que tournamentsOnSite */
                eventsHosted: tournamentsOnSite,
                wipePlayersConfirmed,
                /** Perfiles aprobados en /equipo/ (público) */
                teamRosterApproved
            });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "stats" });
        }
    });

    app.get("/api/tournaments/for-site", async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        try {
            const openQ = await pool.query(
                `SELECT t.*,
            (SELECT COUNT(*)::int FROM tournament_registrations r
              WHERE r.tournament_id = t.id AND r.status IN ('pending','accepted')) AS active_count,
            (SELECT COUNT(*)::int FROM tournament_registrations r
              WHERE r.tournament_id = t.id AND r.status = 'accepted') AS accepted_count,
            (SELECT COUNT(*)::int FROM tournament_registrations r
              WHERE r.tournament_id = t.id AND r.status = 'pending') AS pending_count,
            (SELECT COUNT(*)::int FROM tournament_registrations r
              WHERE r.tournament_id = t.id AND r.status = 'declined') AS declined_count,
            (SELECT team_name FROM tournament_registrations w WHERE w.id = t.winner_registration_id) AS winner_team_name,
            COALESCE(NULLIF(TRIM(t.winner_override_name), ''), (SELECT team_name FROM tournament_registrations w2 WHERE w2.id = t.winner_registration_id)) AS winner_display_name
           FROM tournaments t WHERE t.status = 'open'
           ORDER BY t.starts_at DESC NULLS LAST, t.id DESC LIMIT 1`
            );
            if (openQ.rows.length > 0) {
                return res.json({ mode: "live", tournament: openQ.rows[0] });
            }
            const finQ = await pool.query(
                `SELECT t.*,
            (SELECT COUNT(*)::int FROM tournament_registrations r
              WHERE r.tournament_id = t.id AND r.status IN ('pending','accepted')) AS active_count,
            (SELECT COUNT(*)::int FROM tournament_registrations r
              WHERE r.tournament_id = t.id AND r.status = 'accepted') AS accepted_count,
            (SELECT COUNT(*)::int FROM tournament_registrations r
              WHERE r.tournament_id = t.id AND r.status = 'pending') AS pending_count,
            (SELECT COUNT(*)::int FROM tournament_registrations r
              WHERE r.tournament_id = t.id AND r.status = 'declined') AS declined_count,
            (SELECT team_name FROM tournament_registrations w WHERE w.id = t.winner_registration_id) AS winner_team_name,
            COALESCE(NULLIF(TRIM(t.winner_override_name), ''), (SELECT team_name FROM tournament_registrations w2 WHERE w2.id = t.winner_registration_id)) AS winner_display_name
           FROM tournaments t WHERE t.status = 'finished'
           ORDER BY t.ended_at DESC NULLS LAST, t.id DESC LIMIT 1`
            );
            if (finQ.rows.length > 0) {
                return res.json({ mode: "recap", tournament: finQ.rows[0] });
            }
            return res.json({ mode: "empty", tournament: null });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "for-site" });
        }
    });

    app.get("/api/tournaments", async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        try {
            const r = await pool.query(
                `SELECT t.slug, t.title, t.status, t.starts_at, t.ended_at, t.format_label, t.prize_pool_text,
            t.poster_url, t.winner_registration_id, t.winner_override_name,
            (SELECT team_name FROM tournament_registrations w WHERE w.id = t.winner_registration_id) AS winner_team_name,
            COALESCE(NULLIF(TRIM(t.winner_override_name), ''), (SELECT team_name FROM tournament_registrations w2 WHERE w2.id = t.winner_registration_id)) AS winner_display_name
           FROM tournaments t
           WHERE t.status IN ('open','closed','finished','draft')
           ORDER BY (t.status = 'open') DESC, (t.status = 'draft') DESC, t.starts_at DESC NULLS LAST, t.id DESC`
            );
            return res.json({ tournaments: r.rows });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "list" });
        }
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
          (SELECT team_name FROM tournament_registrations w WHERE w.id = t.winner_registration_id) AS winner_team_name,
          COALESCE(NULLIF(TRIM(t.winner_override_name), ''), (SELECT team_name FROM tournament_registrations w2 WHERE w2.id = t.winner_registration_id)) AS winner_display_name,
          COALESCE(
            t.winner_roster_snapshot,
            (SELECT r.roster FROM tournament_registrations r WHERE r.id = t.winner_registration_id)
          ) AS winner_roster
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
                return res.status(400).json({ error: "El torneo no acepta registros (solo estado abierto)" });
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

    app.post("/api/admin/tournaments/:slug/registrations", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const { slug } = req.params;
        const { teamName, teamTag, captainName, players, status, skipBansCheck } = req.body || {};

        if (!teamName || !captainName || !Array.isArray(players) || players.length !== 5) {
            return res.status(400).json({
                error: "Datos inválidos: teamName, captainName y 5 jugadores requeridos"
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

        const regStatus = ["pending", "accepted", "declined"].includes(status) ? status : "accepted";

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
            const { id: tournamentId, max_teams: maxTeams, status: tStatus } = tr.rows[0];
            if (tStatus === "finished") {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "No se pueden agregar equipos a un torneo finalizado" });
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

            const doBanCheck = !skipBansCheck;
            const ban = await rosterBansCheck(steamIds, doBanCheck ? steamApiKey : "");
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
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         RETURNING id, team_name, status, created_at`,
                [
                    tournamentId,
                    String(teamName).trim(),
                    teamTag ? String(teamTag).trim() : null,
                    String(captainName).trim(),
                    JSON.stringify(roster),
                    regStatus
                ]
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

    app.patch("/api/admin/registrations/:id", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const id = Number(req.params.id);
        const status = req.body?.status;
        const adminNotes = req.body?.adminNotes;
        const rosterBody = req.body?.roster;
        const hasStatus = status !== undefined && status !== null && String(status).length > 0;
        const hasRoster = rosterBody !== undefined;

        if (!hasStatus && !hasRoster) {
            return res.status(400).json({ error: "Enviá status y/o roster (array de 5 jugadores)" });
        }
        if (hasStatus && !["pending", "accepted", "declined"].includes(status)) {
            return res.status(400).json({ error: "status debe ser pending, accepted o declined" });
        }

        let rosterJson = null;
        if (hasRoster) {
            if (!Array.isArray(rosterBody) || rosterBody.length < 1 || rosterBody.length > 5) {
                return res.status(400).json({ error: "roster debe ser un array de 1 a 5 jugadores" });
            }
            const roster = [];
            const steamIds = [];
            const seenSteam = new Set();
            for (let i = 0; i < rosterBody.length; i++) {
                const p = rosterBody[i] || {};
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
            rosterJson = JSON.stringify(roster);
        }

        try {
            if (hasStatus && hasRoster && adminNotes !== undefined) {
                const r = await pool.query(
                    `UPDATE tournament_registrations
         SET status = $1, roster = $2::jsonb, admin_notes = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
                    [status, rosterJson, String(adminNotes), id]
                );
                if (r.rows.length === 0) {
                    return res.status(404).json({ error: "Registro no encontrado" });
                }
                return res.json({ registration: r.rows[0] });
            }
            if (hasStatus && hasRoster) {
                const r = await pool.query(
                    `UPDATE tournament_registrations
         SET status = $1, roster = $2::jsonb, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
                    [status, rosterJson, id]
                );
                if (r.rows.length === 0) {
                    return res.status(404).json({ error: "Registro no encontrado" });
                }
                return res.json({ registration: r.rows[0] });
            }
            if (hasRoster) {
                const r = await pool.query(
                    `UPDATE tournament_registrations
         SET roster = $1::jsonb, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
                    [rosterJson, id]
                );
                if (r.rows.length === 0) {
                    return res.status(404).json({ error: "Registro no encontrado" });
                }
                return res.json({ registration: r.rows[0] });
            }
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

    app.get("/api/admin/tournaments", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        try {
            const r = await pool.query(
                `SELECT t.*,
            (SELECT team_name FROM tournament_registrations w WHERE w.id = t.winner_registration_id) AS winner_team_name,
            COALESCE(NULLIF(TRIM(t.winner_override_name), ''), (SELECT team_name FROM tournament_registrations w2 WHERE w2.id = t.winner_registration_id)) AS winner_display_name
           FROM tournaments t ORDER BY t.id DESC`
            );
            return res.json({ tournaments: r.rows });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "list admin" });
        }
    });

    app.post("/api/admin/tournaments", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const b = req.body || {};
        let slug = String(b.slug || "")
            .trim()
            .toLowerCase();
        if (!slug) {
            slug = slugifyTitle(b.title || "torneo");
        }
        if (!/^[a-z0-9-]{2,64}$/.test(slug)) {
            return res.status(400).json({ error: "slug: 2-64 caracteres, minúsculas, números y guiones" });
        }
        if (!String(b.title || "").trim()) {
            return res.status(400).json({ error: "title requerido" });
        }
        const status = ["draft", "open", "closed", "finished"].includes(b.status) ? b.status : "draft";
        const startsAt = optTimestamp(b.starts_at);
        const regCloses = optTimestamp(b.registration_closes_at);
        if (startsAt === false || regCloses === false) {
            return res.status(400).json({
                error: "Fecha inválida en Starts o Cierre inscripciones (ISO 8601, ej. 2026-05-16T18:00:00+02). Dejá ambos vacíos si no los usás."
            });
        }
        try {
            const ins = await pool.query(
                `INSERT INTO tournaments (
            slug, title, description, format_label, max_teams, starts_at, status,
            prize_pool_text, prize_sub_text, registration_closes_at, match_day_display,
            check_in_display, format_server_text, marquee_text, twitch_channel
          ) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9,$10::timestamptz,$11,$12,$13,$14,$15)
          RETURNING *`,
                [
                    slug,
                    String(b.title).trim(),
                    b.description ? String(b.description) : null,
                    b.format_label ? String(b.format_label) : "5v5",
                    Number(b.max_teams) > 0 ? Number(b.max_teams) : 30,
                    startsAt,
                    status,
                    b.prize_pool_text ? String(b.prize_pool_text) : null,
                    b.prize_sub_text ? String(b.prize_sub_text) : null,
                    regCloses,
                    b.match_day_display ? String(b.match_day_display) : null,
                    b.check_in_display ? String(b.check_in_display) : null,
                    b.format_server_text ? String(b.format_server_text) : null,
                    b.marquee_text ? String(b.marquee_text) : null,
                    b.twitch_channel ? String(b.twitch_channel) : "mcvteam"
                ]
            );
            return res.status(201).json({ tournament: ins.rows[0] });
        } catch (e) {
            if (e.code === "23505") {
                return res.status(409).json({ error: "Ese slug ya existe" });
            }
            console.error(e);
            return res.status(500).json({ error: "create tournament" });
        }
    });

    const allowedPatch = new Set([
        "title",
        "description",
        "status",
        "format_label",
        "max_teams",
        "starts_at",
        "prize_pool_text",
        "prize_sub_text",
        "registration_closes_at",
        "match_day_display",
        "check_in_display",
        "format_server_text",
        "marquee_text",
        "twitch_channel",
        "poster_url",
        "winner_override_name",
        "display_slots_num",
        "display_slots_max"
    ]);

    app.patch("/api/admin/tournaments/:slug", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const { slug } = req.params;
        const b = req.body || {};
        const sets = [];
        const vals = [];
        let i = 1;
        for (const key of Object.keys(b)) {
            if (!allowedPatch.has(key)) {
                continue;
            }
            if (key === "max_teams") {
                const n = Number(b[key]);
                if (n > 0) {
                    sets.push(`max_teams = $${i++}`);
                    vals.push(n);
                }
                continue;
            }
            if (key === "display_slots_num" || key === "display_slots_max") {
                const raw = b[key];
                if (raw === null || raw === undefined || String(raw).trim() === "") {
                    sets.push(`${key} = NULL`);
                } else {
                    const n = Number(raw);
                    if (Number.isFinite(n) && n >= 0) {
                        sets.push(`${key} = $${i++}`);
                        vals.push(Math.floor(n));
                    }
                }
                continue;
            }
            if (key === "starts_at" || key === "registration_closes_at") {
                sets.push(`${key} = $${i++}::timestamptz`);
                vals.push(b[key] || null);
                continue;
            }
            sets.push(`${key} = $${i++}`);
            vals.push(b[key] == null ? null : String(b[key]));
        }
        if (!sets.length) {
            return res.status(400).json({ error: "Nada para actualizar" });
        }
        vals.push(slug);
        try {
            const q = `UPDATE tournaments SET ${sets.join(", ")} WHERE slug = $${i} RETURNING *`;
            const r = await pool.query(q, vals);
            if (!r.rows.length) {
                return res.status(404).json({ error: "Torneo no encontrado" });
            }
            return res.json({ tournament: r.rows[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "patch tournament" });
        }
    });

    app.delete("/api/admin/tournaments/:slug", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const { slug } = req.params;
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const tid = await client.query("SELECT id FROM tournaments WHERE slug = $1", [slug]);
            if (tid.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ error: "Torneo no encontrado" });
            }
            const id = tid.rows[0].id;
            await client.query("UPDATE tournaments SET winner_registration_id = NULL WHERE id = $1", [id]);
            await client.query("DELETE FROM tournament_matches WHERE tournament_id = $1", [id]);
            await client.query("DELETE FROM tournament_registrations WHERE tournament_id = $1", [id]);
            await client.query("DELETE FROM tournaments WHERE id = $1", [id]);
            await client.query("COMMIT");
            return res.json({ ok: true, deletedSlug: slug });
        } catch (e) {
            await client.query("ROLLBACK");
            console.error(e);
            return res.status(500).json({ error: "delete tournament" });
        } finally {
            client.release();
        }
    });

    app.post(
        "/api/admin/tournaments/:slug/poster",
        authAdmin,
        (req, res, next) => {
            const pool0 = getPool();
            if (!pool0) {
                return res.status(503).json({ error: "Base de datos no disponible" });
            }
            optionalPosterMultipart(req, res, next);
        },
        async (req, res) => {
            const pool = getPool();
            if (!pool) {
                return res.status(503).json({ error: "Base de datos no disponible" });
            }
            const { slug } = req.params;
            const extUrl = normalizeExternalPosterUrl(req.body?.posterUrl);
            const uploaded = req.file ? `/uploads/tournaments/${req.file.filename}` : null;
            const nextUrl = extUrl || uploaded;
            if (!nextUrl) {
                return res.status(400).json({
                    error: "Pegá una URL https://… en posterUrl o subí un archivo de imagen (prioridad: URL si ambos)."
                });
            }
            try {
                const r = await pool.query(`UPDATE tournaments SET poster_url = $1 WHERE slug = $2 RETURNING *`, [
                    nextUrl,
                    slug
                ]);
                if (!r.rows.length) {
                    return res.status(404).json({ error: "Torneo no encontrado" });
                }
                return res.json({ tournament: r.rows[0], poster_url: nextUrl });
            } catch (e) {
                console.error(e);
                return res.status(500).json({ error: "poster" });
            }
        }
    );

    app.patch("/api/admin/tournaments/:slug/winner-roster", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const { slug } = req.params;
        const rosterBody = req.body?.roster;
        if (!Array.isArray(rosterBody) || rosterBody.length < 1 || rosterBody.length > 5) {
            return res.status(400).json({ error: "roster debe ser un array de 1 a 5 jugadores" });
        }
        const roster = [];
        const seenSteam = new Set();
        for (let i = 0; i < rosterBody.length; i++) {
            const p = rosterBody[i] || {};
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
            roster.push({ name, steamId64: steam, discord });
        }
        const rosterJson = JSON.stringify(roster);
        try {
            const r = await pool.query(
                `UPDATE tournaments SET winner_roster_snapshot = $1::jsonb WHERE slug = $2 RETURNING *`,
                [rosterJson, slug]
            );
            if (!r.rows.length) {
                return res.status(404).json({ error: "Torneo no encontrado" });
            }
            return res.json({ tournament: r.rows[0], winner_roster: roster });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "winner-roster" });
        }
    });

    app.post(
        "/api/admin/tournaments/:slug/finish",
        authAdmin,
        (req, res, next) => {
            const pool0 = getPool();
            if (!pool0) {
                return res.status(503).json({ error: "Base de datos no disponible" });
            }
            optionalPosterMultipart(req, res, next);
        },
        async (req, res) => {
            const pool = getPool();
            if (!pool) {
                return res.status(503).json({ error: "Base de datos no disponible" });
            }
            const { slug } = req.params;
            const widRaw = req.body?.winnerRegistrationId;
            let winnerId = null;
            if (widRaw !== undefined && widRaw !== null && String(widRaw).trim() !== "") {
                const n = Number(widRaw);
                if (!Number.isFinite(n) || n < 1) {
                    return res.status(400).json({ error: "winnerRegistrationId inválido" });
                }
                winnerId = n;
            }
            const extPoster = normalizeExternalPosterUrl(req.body?.posterUrl);
            const uploaded = req.file ? `/uploads/tournaments/${req.file.filename}` : null;
            const newPoster = extPoster || uploaded;
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                const t = await client.query(
                    `SELECT id, winner_registration_id, winner_override_name, poster_url
           FROM tournaments WHERE slug = $1 FOR UPDATE`,
                    [slug]
                );
                if (!t.rows.length) {
                    await client.query("ROLLBACK");
                    return res.status(404).json({ error: "Torneo no encontrado" });
                }
                const row = t.rows[0];
                const tid = row.id;
                const nextWin = winnerId != null ? winnerId : row.winner_registration_id;
                if (winnerId != null) {
                    const check = await client.query(
                        `SELECT id FROM tournament_registrations
             WHERE id = $1 AND tournament_id = $2 AND status = 'accepted'`,
                        [winnerId, tid]
                    );
                    if (!check.rows.length) {
                        await client.query("ROLLBACK");
                        return res.status(400).json({
                            error:
                                "ID de registro ganador inválido o no está aceptado en este torneo. Dejá el campo ID vacío y usá solo «Nombre campeón» (manual), o poné el ID real del equipo en la lista de Equipos."
                        });
                    }
                }
                let nextOverride = row.winner_override_name;
                if (Object.prototype.hasOwnProperty.call(req.body, "winnerOverrideName")) {
                    const trimmed = String(req.body.winnerOverrideName || "").trim();
                    nextOverride = trimmed || null;
                }
                const nextPoster = newPoster || row.poster_url;
                const clearRegs = String(req.body?.clearData || "") === "1";
                let winnerRosterSnap = null;
                if (nextWin != null) {
                    const snapQ = await client.query(
                        `SELECT roster FROM tournament_registrations WHERE id = $1 AND tournament_id = $2`,
                        [nextWin, tid]
                    );
                    if (snapQ.rows.length && snapQ.rows[0].roster != null) {
                        winnerRosterSnap = snapQ.rows[0].roster;
                    }
                }
                await client.query(
                    `UPDATE tournaments SET
            status = 'finished',
            ended_at = COALESCE(ended_at, NOW()),
            winner_registration_id = $2,
            winner_override_name = COALESCE(
              NULLIF(TRIM($3::text), ''),
              NULLIF(TRIM(winner_override_name), ''),
              (SELECT tr.team_name FROM tournament_registrations tr WHERE tr.id = $2)
            ),
            poster_url = $4,
            winner_roster_snapshot = CASE
              WHEN $5::jsonb IS NOT NULL THEN $5::jsonb
              ELSE winner_roster_snapshot
            END
           WHERE id = $1`,
                    [tid, nextWin, nextOverride, nextPoster, winnerRosterSnap]
                );
                if (clearRegs) {
                    await client.query("DELETE FROM tournament_matches WHERE tournament_id = $1", [tid]);
                    await client.query("DELETE FROM tournament_registrations WHERE tournament_id = $1", [tid]);
                }
                await client.query("COMMIT");
                return res.json({ success: true, cleared: clearRegs });
            } catch (e) {
                await client.query("ROLLBACK");
                console.error(e);
                return res.status(500).json({ error: "finish tournament" });
            } finally {
                client.release();
            }
        }
    );

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
