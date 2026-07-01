"use strict";

const axios = require("axios");
const { authAdmin, authUser } = require("./auth");
const { getSiteUserById } = require("./siteUsers");
const {
    ensurePlayerInfoTable,
    normalizeSteamId64,
    normalizePlayerInfoRow
} = require("./vitalRustApi");

const PLAYER_VOUCH_REQUESTS_SQL = `
CREATE TABLE IF NOT EXISTS player_vouch_requests (
    id SERIAL PRIMARY KEY,
    candidate_steam_id64 VARCHAR(17) NOT NULL,
    candidate_display_name VARCHAR(120),
    candidate_discord VARCHAR(120) NOT NULL,
    candidate_bm_url TEXT NOT NULL,
    voucher_steam_id64 VARCHAR(17) NOT NULL,
    voucher_display_name VARCHAR(120) NOT NULL,
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_player_vouch_status ON player_vouch_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_vouch_candidate ON player_vouch_requests (candidate_steam_id64);
`;

const VOUCHER_STATUS_TAGS = new Set(["admin", "mcv_active", "mcv_strikes"]);
const MAX_OPEN_VOUCHES_PER_USER = 5;
const LATE_REASON_LABELS = {
    no_llega: "No llego al inicio del wipe",
    pocas_horas: "Entro al wipe pero juego pocas horas",
    otro: "Otro motivo"
};

function normalizeOptionalUrl(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s || s.length > 512) return null;
    const lower = s.toLowerCase();
    if (!lower.startsWith("http://") && !lower.startsWith("https://")) return null;
    if (lower.startsWith("javascript:") || lower.startsWith("data:")) return null;
    return s;
}

function normalizeBmUrl(raw) {
    const url = normalizeOptionalUrl(raw);
    if (!url) return null;
    if (!/battlemetrics\.com\/players\/\d+/i.test(url)) return null;
    return url;
}

function normalizeHoursBand(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (v === "light" || v === "heavy") return v;
    return null;
}

function normalizeLateReasonType(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (v === "no_llega" || v === "pocas_horas" || v === "otro") return v;
    return null;
}

function formatLateIntentLabel(lateReasonType, lateReason) {
    const type = normalizeLateReasonType(lateReasonType);
    if (!type) return "";
    const base = LATE_REASON_LABELS[type] || type;
    const detail = String(lateReason || "").trim();
    if (detail && type !== "pocas_horas") return `${base}: ${detail}`;
    return base;
}

function normalizeWipeParticipation(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (v === "inicio" || v === "late" || v === "no_juega") return v;
    return null;
}

function normalizeDiscordHandle(raw) {
    return String(raw || "").trim().slice(0, 120);
}

function canUserVouch(profile) {
    if (!profile) return false;
    if (profile.pausedOutsideWipe) return false;
    if (profile.wipePhase === "no_juega") return false;
    return VOUCHER_STATUS_TAGS.has(profile.statusTag);
}

function wipeIntentFromProfile(row) {
    const profile = normalizePlayerInfoRow(row);
    if (!profile) return null;
    return {
        steamId64: profile.steamId64,
        displayName: profile.displayName,
        bmUrl: profile.bmUrl,
        discordHandle: String(row.discord_handle || row.discordHandle || "").trim(),
        wipePhase: profile.wipePhase,
        hoursBand: normalizeHoursBand(row.hours_band || row.hoursBand),
        lateReasonType: normalizeLateReasonType(row.late_reason_type || row.lateReasonType),
        lateReason: String(row.late_reason || row.lateReason || "").trim(),
        lateReasonLabel: formatLateIntentLabel(
            row.late_reason_type || row.lateReasonType,
            row.late_reason || row.lateReason
        ),
        vouchBy: profile.vouchBy,
        statusTag: profile.statusTag,
        canVouch: canUserVouch(profile),
        participatesWipe: profile.wipePhase === "inicio" || profile.wipePhase === "late"
    };
}

function buildWipeUpdateFields(body) {
    const participation = normalizeWipeParticipation(body.participation || body.wipePhase);
    if (!participation) {
        return { error: "Elegí si jugás desde inicio, late o no jugás este wipe." };
    }
    let hoursBand = normalizeHoursBand(body.hoursBand);
    const lateReason = String(body.lateReason || body.lateDetail || "").trim().slice(0, 240);
    const lateReasonType = normalizeLateReasonType(body.lateReasonType);
    if (participation === "no_juega") {
        return {
            wipePhase: "no_juega",
            hoursBand: null,
            lateReasonType: null,
            lateReason: null,
            pausedOutsideWipe: true
        };
    }
    if (participation === "late") {
        if (!lateReasonType) {
            return { error: "Elegí por qué entrás late: no llegás al inicio o jugás pocas horas." };
        }
        if (lateReasonType === "pocas_horas") {
            return {
                wipePhase: "late",
                hoursBand: "light",
                lateReasonType: "pocas_horas",
                lateReason: null,
                pausedOutsideWipe: false
            };
        }
        if (!hoursBand) {
            return { error: "Indicá si vas a jugar pocas horas o muchas." };
        }
        if (lateReasonType === "no_llega" && !lateReason) {
            return { error: "Contanos cuándo entrás o por qué no llegás al inicio." };
        }
        if (lateReasonType === "otro" && !lateReason) {
            return { error: "Contanos el motivo por el que entrás late." };
        }
        return {
            wipePhase: "late",
            hoursBand,
            lateReasonType,
            lateReason: lateReason || null,
            pausedOutsideWipe: false
        };
    }
    if (!hoursBand) {
        return { error: "Indicá si vas a jugar pocas horas o muchas." };
    }
    return {
        wipePhase: participation,
        hoursBand,
        lateReasonType: null,
        lateReason: null,
        pausedOutsideWipe: false
    };
}

function serializeVouchRequest(row) {
    return {
        id: row.id,
        candidateSteamId64: row.candidate_steam_id64,
        candidateDisplayName: row.candidate_display_name,
        candidateDiscord: row.candidate_discord,
        candidateBmUrl: row.candidate_bm_url,
        voucherSteamId64: row.voucher_steam_id64,
        voucherDisplayName: row.voucher_display_name,
        note: row.note,
        status: row.status,
        reviewedBy: row.reviewed_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function fetchSteamPersona(steamApiKey, steamId64) {
    if (!steamApiKey || !steamId64) return null;
    try {
        const { data } = await axios.get("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/", {
            params: { key: steamApiKey, steamids: steamId64 },
            timeout: 12000
        });
        const p = data?.response?.players?.[0];
        return p?.personaname ? String(p.personaname).trim().slice(0, 120) : null;
    } catch (e) {
        console.warn("playerAccount fetchSteamPersona:", e.message);
        return null;
    }
}

async function ensurePlayerVouchTable(pool) {
    if (!pool) return false;
    try {
        await pool.query(PLAYER_VOUCH_REQUESTS_SQL);
        return true;
    } catch (e) {
        console.error("ensure player_vouch_requests:", e.message);
        return false;
    }
}

async function ensurePlayerInfoExtendedColumns(pool) {
    const ready = await ensurePlayerInfoTable(pool);
    if (!ready) return false;
    try {
        await pool.query(`ALTER TABLE player_info_profiles ADD COLUMN IF NOT EXISTS hours_band VARCHAR(12)`);
        await pool.query(`ALTER TABLE player_info_profiles ADD COLUMN IF NOT EXISTS late_reason TEXT`);
        await pool.query(`ALTER TABLE player_info_profiles ADD COLUMN IF NOT EXISTS late_reason_type VARCHAR(24)`);
        await pool.query(`ALTER TABLE player_info_profiles ADD COLUMN IF NOT EXISTS discord_handle VARCHAR(120)`);
        return true;
    } catch (e) {
        console.error("ensure player_info extended columns:", e.message);
        return false;
    }
}

async function loadUserSteamContext(pool, userId) {
    const userRow = await getSiteUserById(pool, userId);
    if (!userRow) return { error: "Usuario no encontrado", status: 404 };
    const steamId64 = normalizeSteamId64(userRow.steam_id64);
    if (!steamId64) {
        return { userRow, steamId64: null, profile: null };
    }
    const r = await pool.query(`SELECT * FROM player_info_profiles WHERE steam_id64 = $1`, [steamId64]);
    const profile = r.rows[0] ? normalizePlayerInfoRow(r.rows[0]) : null;
    return { userRow, steamId64, profile, rawProfile: r.rows[0] || null };
}

async function approveVouchRequest(pool, requestRow, reviewedBy) {
    const candidateSteam = normalizeSteamId64(requestRow.candidate_steam_id64);
    if (!candidateSteam) {
        throw new Error("SteamID64 inválido en la solicitud");
    }
    const existing = await pool.query(`SELECT * FROM player_info_profiles WHERE steam_id64 = $1`, [candidateSteam]);
    const voucherName = String(requestRow.voucher_display_name || "").trim().slice(0, 120);
    const displayName = String(requestRow.candidate_display_name || "").trim().slice(0, 120) || candidateSteam;
    const bmUrl = String(requestRow.candidate_bm_url || "").trim();
    const discordHandle = String(requestRow.candidate_discord || "").trim().slice(0, 120);

    if (existing.rowCount) {
        const cur = existing.rows[0];
        const keepStatus = cur.status_tag && cur.status_tag !== "wipe_guest" ? cur.status_tag : "wipe_guest";
        await pool.query(
            `UPDATE player_info_profiles SET
                display_name = COALESCE(NULLIF($2, ''), display_name),
                bm_url = COALESCE(NULLIF($3, ''), bm_url),
                discord_handle = COALESCE(NULLIF($4, ''), discord_handle),
                vouch_by = $5,
                status_tag = $6,
                updated_at = NOW()
             WHERE steam_id64 = $1`,
            [candidateSteam, displayName, bmUrl, discordHandle, voucherName, keepStatus]
        );
    } else {
        await pool.query(
            `INSERT INTO player_info_profiles (
                steam_id64, display_name, bm_url, discord_handle, status_tag, vouch_by, wipe_phase, entry_date, updated_at
             ) VALUES ($1, $2, $3, $4, 'wipe_guest', $5, 'unknown', CURRENT_DATE, NOW())`,
            [candidateSteam, displayName, bmUrl, discordHandle, voucherName]
        );
    }

    await pool.query(
        `UPDATE player_vouch_requests
         SET status = 'approved', reviewed_by = $2, updated_at = NOW()
         WHERE id = $1`,
        [requestRow.id, reviewedBy]
    );
}

function registerPlayerAccountApi(app, { getPool, steamApiKey }) {
    app.get("/api/auth/user/wipe-profile", authUser, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no disponible" });
        const ready = await ensurePlayerInfoExtendedColumns(pool);
        if (!ready) return res.status(503).json({ error: "No se pudo preparar perfiles de jugador" });
        try {
            const ctx = await loadUserSteamContext(pool, Number(req.userAuth.userId));
            if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
            if (!ctx.steamId64) {
                return res.json({
                    steamLinked: false,
                    profile: null,
                    canVouch: false,
                    message: "Vinculá Steam para gestionar tu wipe y vouchear jugadores."
                });
            }
            if (!ctx.rawProfile) {
                return res.json({
                    steamLinked: true,
                    steamId64: ctx.steamId64,
                    profile: null,
                    canVouch: false,
                    message: "Tu Steam no está en Info jugadores todavía. Pedí que te agreguen o que te voucheen."
                });
            }
            const openVouchRes = await pool.query(
                `SELECT COUNT(*)::int AS n FROM player_vouch_requests
                 WHERE voucher_steam_id64 = $1 AND status = 'pending'`,
                [ctx.steamId64]
            );
            return res.json({
                steamLinked: true,
                steamId64: ctx.steamId64,
                profile: wipeIntentFromProfile(ctx.rawProfile),
                canVouch: canUserVouch(ctx.profile),
                openVouches: openVouchRes.rows[0]?.n || 0,
                maxOpenVouches: MAX_OPEN_VOUCHES_PER_USER
            });
        } catch (e) {
            console.error("GET /api/auth/user/wipe-profile:", e.message);
            return res.status(500).json({ error: "No se pudo cargar tu perfil de wipe" });
        }
    });

    app.patch("/api/auth/user/wipe-profile", authUser, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no disponible" });
        const ready = await ensurePlayerInfoExtendedColumns(pool);
        if (!ready) return res.status(503).json({ error: "No se pudo preparar perfiles de jugador" });
        const body = req.body && typeof req.body === "object" ? req.body : {};
        try {
            const ctx = await loadUserSteamContext(pool, Number(req.userAuth.userId));
            if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
            if (!ctx.steamId64) {
                return res.status(400).json({ error: "Vinculá Steam antes de actualizar tu wipe." });
            }
            if (!ctx.rawProfile) {
                return res.status(404).json({ error: "No tenés ficha en Info jugadores." });
            }

            const updates = [];
            const params = [ctx.steamId64];
            let p = 2;

            if (
                body.participation != null ||
                body.wipePhase != null ||
                body.hoursBand != null ||
                body.lateReason != null ||
                body.lateReasonType != null ||
                body.lateDetail != null
            ) {
                const wipeFields = buildWipeUpdateFields(body);
                if (wipeFields.error) return res.status(400).json({ error: wipeFields.error });
                updates.push(`wipe_phase = $${p++}`);
                params.push(wipeFields.wipePhase);
                updates.push(`hours_band = $${p++}`);
                params.push(wipeFields.hoursBand);
                updates.push(`late_reason_type = $${p++}`);
                params.push(wipeFields.lateReasonType);
                updates.push(`late_reason = $${p++}`);
                params.push(wipeFields.lateReason);
                updates.push(`paused_outside_wipe = $${p++}`);
                params.push(wipeFields.pausedOutsideWipe);
            }

            if (body.bmUrl != null) {
                const bmUrl = normalizeBmUrl(body.bmUrl);
                if (!bmUrl) return res.status(400).json({ error: "Link BattleMetrics inválido." });
                updates.push(`bm_url = $${p++}`);
                params.push(bmUrl);
            }

            if (!updates.length) {
                return res.status(400).json({ error: "Nada para actualizar." });
            }
            updates.push("updated_at = NOW()");
            const r = await pool.query(
                `UPDATE player_info_profiles SET ${updates.join(", ")} WHERE steam_id64 = $1 RETURNING *`,
                params
            );
            return res.json({ ok: true, profile: wipeIntentFromProfile(r.rows[0]) });
        } catch (e) {
            console.error("PATCH /api/auth/user/wipe-profile:", e.message);
            return res.status(500).json({ error: "No se pudo guardar tu perfil de wipe" });
        }
    });

    app.post("/api/auth/user/vouch", authUser, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no disponible" });
        const readyTable = await ensurePlayerVouchTable(pool);
        const readyProfiles = await ensurePlayerInfoExtendedColumns(pool);
        if (!readyTable || !readyProfiles) {
            return res.status(503).json({ error: "No se pudo preparar vouch" });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        try {
            const ctx = await loadUserSteamContext(pool, Number(req.userAuth.userId));
            if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
            if (!ctx.steamId64) {
                return res.status(400).json({ error: "Vinculá Steam para vouchear." });
            }
            if (!canUserVouch(ctx.profile)) {
                return res.status(403).json({
                    error: "Solo jugadores activos de MCV que juegan el wipe pueden vouchear."
                });
            }

            const candidateSteam = normalizeSteamId64(body.candidateSteamId64 || body.steamId64);
            if (!candidateSteam) {
                return res.status(400).json({ error: "SteamID64 del candidato inválido (17 dígitos)." });
            }
            if (candidateSteam === ctx.steamId64) {
                return res.status(400).json({ error: "No podés vouchearte a vos mismo." });
            }

            const candidateDiscord = normalizeDiscordHandle(body.candidateDiscord || body.discord);
            if (!candidateDiscord) {
                return res.status(400).json({ error: "Discord del candidato es obligatorio." });
            }
            const candidateBmUrl = normalizeBmUrl(body.candidateBmUrl || body.bmUrl);
            if (!candidateBmUrl) {
                return res.status(400).json({ error: "Link BattleMetrics del candidato es obligatorio." });
            }

            const existsProfile = await pool.query(`SELECT steam_id64 FROM player_info_profiles WHERE steam_id64 = $1`, [
                candidateSteam
            ]);
            if (existsProfile.rowCount) {
                return res.status(409).json({ error: "Ese jugador ya está en Info jugadores." });
            }

            const pendingDup = await pool.query(
                `SELECT id FROM player_vouch_requests
                 WHERE candidate_steam_id64 = $1 AND status = 'pending' LIMIT 1`,
                [candidateSteam]
            );
            if (pendingDup.rowCount) {
                return res.status(409).json({ error: "Ese jugador ya tiene un vouch pendiente." });
            }

            const openCount = await pool.query(
                `SELECT COUNT(*)::int AS n FROM player_vouch_requests
                 WHERE voucher_steam_id64 = $1 AND status = 'pending'`,
                [ctx.steamId64]
            );
            if ((openCount.rows[0]?.n || 0) >= MAX_OPEN_VOUCHES_PER_USER) {
                return res.status(429).json({ error: "Tenés demasiados vouch pendientes. Esperá a que los revisen." });
            }

            let candidateName = String(body.candidateDisplayName || "").trim().slice(0, 120);
            const steamName = await fetchSteamPersona(steamApiKey, candidateSteam);
            if (steamName) candidateName = steamName;
            if (!candidateName) candidateName = candidateSteam;

            const voucherName =
                String(ctx.profile?.displayName || ctx.userRow.display_name || ctx.userRow.persona_name || "").trim()
                    .slice(0, 120) || ctx.steamId64;
            const note = String(body.note || "").trim().slice(0, 500) || null;

            const ins = await pool.query(
                `INSERT INTO player_vouch_requests (
                    candidate_steam_id64, candidate_display_name, candidate_discord, candidate_bm_url,
                    voucher_steam_id64, voucher_display_name, note, status, updated_at
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',NOW())
                 RETURNING *`,
                [candidateSteam, candidateName, candidateDiscord, candidateBmUrl, ctx.steamId64, voucherName, note]
            );
            return res.status(201).json({
                ok: true,
                request: serializeVouchRequest(ins.rows[0]),
                message: "Vouch enviado. Staff lo revisará en admin."
            });
        } catch (e) {
            console.error("POST /api/auth/user/vouch:", e.message);
            return res.status(500).json({ error: "No se pudo enviar el vouch" });
        }
    });

    app.get("/api/auth/user/vouch-requests", authUser, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no disponible" });
        const ready = await ensurePlayerVouchTable(pool);
        if (!ready) return res.status(503).json({ error: "No se pudo preparar vouch" });
        try {
            const ctx = await loadUserSteamContext(pool, Number(req.userAuth.userId));
            if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
            if (!ctx.steamId64) return res.json({ requests: [] });
            const r = await pool.query(
                `SELECT * FROM player_vouch_requests
                 WHERE voucher_steam_id64 = $1
                 ORDER BY created_at DESC
                 LIMIT 20`,
                [ctx.steamId64]
            );
            return res.json({ requests: r.rows.map(serializeVouchRequest) });
        } catch (e) {
            console.error("GET /api/auth/user/vouch-requests:", e.message);
            return res.status(500).json({ error: "No se pudieron cargar tus vouch" });
        }
    });

    app.get("/api/admin/vital/vouch-requests", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const ready = await ensurePlayerVouchTable(pool);
        if (!ready) return res.status(503).json({ error: "No se pudo preparar vouch" });
        const status = String(req.query.status || "pending").trim().toLowerCase();
        const allowed = new Set(["pending", "approved", "rejected", "all"]);
        const filterStatus = allowed.has(status) ? status : "pending";
        try {
            const sql =
                filterStatus === "all"
                    ? `SELECT * FROM player_vouch_requests ORDER BY created_at DESC LIMIT 200`
                    : `SELECT * FROM player_vouch_requests WHERE status = $1 ORDER BY created_at DESC LIMIT 200`;
            const r =
                filterStatus === "all"
                    ? await pool.query(sql)
                    : await pool.query(sql, [filterStatus]);
            const pendingCount = await pool.query(
                `SELECT COUNT(*)::int AS n FROM player_vouch_requests WHERE status = 'pending'`
            );
            return res.json({
                requests: r.rows.map(serializeVouchRequest),
                pendingCount: pendingCount.rows[0]?.n || 0
            });
        } catch (e) {
            console.error("GET /api/admin/vital/vouch-requests:", e.message);
            return res.status(500).json({ error: "No se pudieron cargar vouch pendientes" });
        }
    });

    app.patch("/api/admin/vital/vouch-requests/:id", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const readyTable = await ensurePlayerVouchTable(pool);
        const readyProfiles = await ensurePlayerInfoExtendedColumns(pool);
        if (!readyTable || !readyProfiles) {
            return res.status(503).json({ error: "No se pudo preparar vouch" });
        }
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "ID inválido" });
        const action = String((req.body && req.body.action) || "").trim().toLowerCase();
        if (action !== "approve" && action !== "reject") {
            return res.status(400).json({ error: "Acción inválida (approve o reject)." });
        }
        try {
            const cur = await pool.query(`SELECT * FROM player_vouch_requests WHERE id = $1`, [id]);
            if (!cur.rowCount) return res.status(404).json({ error: "Solicitud no encontrada" });
            const row = cur.rows[0];
            if (row.status !== "pending") {
                return res.status(409).json({ error: "Esta solicitud ya fue revisada." });
            }
            const reviewer = String(req.adminAuth?.sub || req.adminAuth?.username || "admin").slice(0, 120);
            if (action === "reject") {
                await pool.query(
                    `UPDATE player_vouch_requests SET status = 'rejected', reviewed_by = $2, updated_at = NOW() WHERE id = $1`,
                    [id, reviewer]
                );
                const r2 = await pool.query(`SELECT * FROM player_vouch_requests WHERE id = $1`, [id]);
                return res.json({ ok: true, request: serializeVouchRequest(r2.rows[0]) });
            }
            await approveVouchRequest(pool, row, reviewer);
            const r2 = await pool.query(`SELECT * FROM player_vouch_requests WHERE id = $1`, [id]);
            return res.json({ ok: true, request: serializeVouchRequest(r2.rows[0]) });
        } catch (e) {
            console.error("PATCH /api/admin/vital/vouch-requests/:id:", e.message);
            return res.status(500).json({ error: e.message || "No se pudo revisar el vouch" });
        }
    });

    app.post("/api/admin/vital/reset-wipe-intent", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) return res.status(503).json({ error: "Base de datos no configurada" });
        const ready = await ensurePlayerInfoExtendedColumns(pool);
        if (!ready) return res.status(503).json({ error: "No se pudo preparar perfiles" });
        try {
            const r = await pool.query(
                `UPDATE player_info_profiles SET
                    wipe_phase = 'no_juega',
                    hours_band = NULL,
                    late_reason = NULL,
                    late_reason_type = NULL,
                    paused_outside_wipe = TRUE,
                    updated_at = NOW()
                 WHERE steam_id64 IS NOT NULL
                 RETURNING steam_id64`
            );
            return res.json({ ok: true, updated: r.rowCount || 0 });
        } catch (e) {
            console.error("POST /api/admin/vital/reset-wipe-intent:", e.message);
            return res.status(500).json({ error: "No se pudo resetear intención de wipe" });
        }
    });
}

module.exports = {
    registerPlayerAccountApi,
    ensurePlayerVouchTable,
    ensurePlayerInfoExtendedColumns,
    canUserVouch,
    buildWipeUpdateFields,
    normalizeBmUrl,
    normalizeLateReasonType,
    formatLateIntentLabel,
    LATE_REASON_LABELS,
    approveVouchRequest,
    serializeVouchRequest
};
