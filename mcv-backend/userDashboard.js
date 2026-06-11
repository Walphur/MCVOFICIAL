"use strict";

const { authUser } = require("./auth");
const { getSiteUserById, serializeSiteUser } = require("./siteUsers");

const TICKET_TYPE_LABELS = {
    recruit: "Reclutamiento",
    tournament: "Torneo",
    report: "Reporte",
    other: "Otro"
};

const STATUS_LABELS = {
    pending: "Pendiente",
    accepted: "Aceptado",
    declined: "Rechazado"
};

function serializeTicket(row) {
    return {
        id: row.id,
        ticketType: row.ticket_type,
        ticketTypeLabel: TICKET_TYPE_LABELS[row.ticket_type] || row.ticket_type,
        status: row.status,
        statusLabel: STATUS_LABELS[row.status] || row.status,
        discordUser: row.discord_user,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function serializeRegistration(row) {
    return {
        id: row.id,
        teamName: row.team_name,
        teamTag: row.team_tag || null,
        captainName: row.captain_name,
        status: row.status,
        statusLabel: STATUS_LABELS[row.status] || row.status,
        createdAt: row.created_at,
        tournamentTitle: row.tournament_title,
        tournamentSlug: row.tournament_slug,
        tournamentStartsAt: row.starts_at,
        tournamentStatus: row.tournament_status
    };
}

async function fetchUserTickets(pool, userId) {
    const r = await pool.query(
        `SELECT id, ticket_type, status, discord_user, created_at, updated_at
         FROM support_tickets
         WHERE site_user_id = $1
         ORDER BY created_at DESC
         LIMIT 40`,
        [userId]
    );
    return r.rows.map(serializeTicket);
}

async function fetchUserRegistrations(pool, steamId64) {
    if (!steamId64 || !/^\d{17}$/.test(String(steamId64))) {
        return [];
    }
    const r = await pool.query(
        `SELECT r.id, r.team_name, r.team_tag, r.captain_name, r.status, r.created_at,
                t.title AS tournament_title, t.slug AS tournament_slug,
                t.starts_at, t.status AS tournament_status
         FROM tournament_registrations r
         JOIN tournaments t ON t.id = r.tournament_id
         WHERE EXISTS (
             SELECT 1 FROM jsonb_array_elements(COALESCE(r.roster, '[]'::jsonb)) AS elem
             WHERE elem->>'steamId64' = $1
         )
         ORDER BY r.created_at DESC
         LIMIT 30`,
        [String(steamId64)]
    );
    return r.rows.map(serializeRegistration);
}

function registerUserDashboardRoutes(app, { getPool }) {
    app.get("/api/auth/user/dashboard", authUser, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        const userId = Number(req.userAuth.userId);
        try {
            const userRow = await getSiteUserById(pool, userId);
            if (!userRow) {
                return res.status(404).json({ error: "Usuario no encontrado" });
            }
            const [tickets, registrations] = await Promise.all([
                fetchUserTickets(pool, userId),
                fetchUserRegistrations(pool, userRow.steam_id64)
            ]);
            return res.json({
                user: serializeSiteUser(userRow),
                tickets,
                registrations,
                steamLinked: Boolean(userRow.steam_id64)
            });
        } catch (e) {
            console.error("GET /api/auth/user/dashboard:", e.message);
            return res.status(500).json({ error: "No se pudo cargar tu cuenta" });
        }
    });
}

module.exports = {
    registerUserDashboardRoutes,
    fetchUserTickets,
    fetchUserRegistrations
};
