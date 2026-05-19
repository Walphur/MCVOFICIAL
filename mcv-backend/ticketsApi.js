"use strict";

const jwt = require("jsonwebtoken");

function jwtSecret() {
    const s = String(process.env.JWT_SECRET || "").trim();
    return s && s.length >= 12 ? s : null;
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

const TICKET_TYPES = new Set(["recruit", "tournament", "report", "other"]);
const TICKET_STATUSES = new Set(["pending", "accepted", "declined"]);

function registerTicketsApi(app, { getPool }) {
    app.post("/api/tickets", async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const body = req.body || {};
        const ticketType = String(body.ticketType || body.type || "").trim().toLowerCase();
        const discordUser = String(body.discordUser || body.discord || "").trim().slice(0, 120);
        const description = String(body.description || "").trim().slice(0, 4000);

        if (!TICKET_TYPES.has(ticketType)) {
            return res.status(400).json({ error: "Tipo de ticket inválido" });
        }
        if (!discordUser || discordUser.length < 2) {
            return res.status(400).json({ error: "Usuario de Discord requerido" });
        }
        if (!description || description.length < 8) {
            return res.status(400).json({ error: "Descripción demasiado corta (mín. 8 caracteres)" });
        }

        try {
            const r = await pool.query(
                `INSERT INTO support_tickets (ticket_type, discord_user, description, status)
                 VALUES ($1, $2, $3, 'pending')
                 RETURNING id, ticket_type, discord_user, status, created_at`,
                [ticketType, discordUser, description]
            );
            return res.status(201).json({ success: true, ticket: r.rows[0] });
        } catch (e) {
            console.error("POST /api/tickets:", e.message);
            return res.status(500).json({ error: "No se pudo registrar el ticket" });
        }
    });

    /** Estado público por ID (sin descripción). */
    app.get("/api/tickets/:id/status", async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const id = Number.parseInt(String(req.params.id || ""), 10);
        if (!Number.isFinite(id) || id < 1) {
            return res.status(400).json({ error: "ID inválido" });
        }
        try {
            const r = await pool.query(
                `SELECT id, ticket_type, status, created_at, updated_at
                 FROM support_tickets WHERE id = $1`,
                [id]
            );
            if (r.rows.length === 0) {
                return res.status(404).json({ error: "Ticket no encontrado" });
            }
            const row = r.rows[0];
            return res.json({
                ticket: {
                    id: row.id,
                    ticketType: row.ticket_type,
                    status: row.status,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                }
            });
        } catch (e) {
            console.error("GET /api/tickets/:id/status:", e.message);
            return res.status(500).json({ error: "No se pudo consultar el ticket" });
        }
    });

    app.get("/api/admin/tickets", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const status = String(req.query.status || "all").trim().toLowerCase();
        try {
            let q = `SELECT id, ticket_type, discord_user, description, status, admin_notes, created_at, updated_at
                     FROM support_tickets`;
            const params = [];
            if (status !== "all" && TICKET_STATUSES.has(status)) {
                q += " WHERE status = $1";
                params.push(status);
            }
            q += " ORDER BY created_at DESC LIMIT 500";
            const r = await pool.query(q, params);
            return res.json({ tickets: r.rows });
        } catch (e) {
            console.error("GET /api/admin/tickets:", e.message);
            return res.status(500).json({ error: "Error al cargar tickets" });
        }
    });

    app.patch("/api/admin/tickets/:id", authAdmin, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id) || id < 1) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const body = req.body || {};
        const status = body.status != null ? String(body.status).trim().toLowerCase() : null;
        const adminNotes =
            body.adminNotes != null ? String(body.adminNotes).trim().slice(0, 2000) : undefined;

        if (status && !TICKET_STATUSES.has(status)) {
            return res.status(400).json({ error: "Estado inválido" });
        }
        if (!status && adminNotes === undefined) {
            return res.status(400).json({ error: "Nada que actualizar" });
        }

        try {
            const cur = await pool.query(
                "SELECT id, status FROM support_tickets WHERE id = $1",
                [id]
            );
            if (!cur.rows.length) {
                return res.status(404).json({ error: "Ticket no encontrado" });
            }
            const nextStatus = status || cur.rows[0].status;
            const notes =
                adminNotes !== undefined ? adminNotes || null : undefined;
            let r;
            if (notes !== undefined) {
                r = await pool.query(
                    `UPDATE support_tickets SET status = $2, admin_notes = $3, updated_at = NOW()
                     WHERE id = $1
                     RETURNING *`,
                    [id, nextStatus, notes]
                );
            } else {
                r = await pool.query(
                    `UPDATE support_tickets SET status = $2, updated_at = NOW()
                     WHERE id = $1
                     RETURNING *`,
                    [id, nextStatus]
                );
            }
            return res.json({ success: true, ticket: r.rows[0] });
        } catch (e) {
            console.error("PATCH /api/admin/tickets:", e.message);
            return res.status(500).json({ error: "No se pudo actualizar" });
        }
    });
}

module.exports = { registerTicketsApi };
