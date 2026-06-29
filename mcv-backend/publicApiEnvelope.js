"use strict";

const API_VERSION = "1";

function buildTimestamps(extra) {
    return Object.assign({ generated_at: new Date().toISOString() }, extra || {});
}

function sendOk(res, { resource, data, metadata, pagination, cacheTtlSeconds }) {
    const ttl = Number.isFinite(cacheTtlSeconds) ? Math.max(0, cacheTtlSeconds) : 60;
    if (ttl > 0) {
        res.set("Cache-Control", `public, max-age=${ttl}, stale-while-revalidate=${Math.min(ttl * 2, 300)}`);
    } else {
        res.set("Cache-Control", "no-store");
    }
    return res.json({
        status: "ok",
        metadata: Object.assign(
            {
                version: API_VERSION,
                resource: resource || null,
                cache_ttl_seconds: ttl
            },
            metadata || {}
        ),
        data,
        pagination: pagination || null,
        timestamps: buildTimestamps()
    });
}

function sendError(res, statusCode, code, message, details) {
    res.set("Cache-Control", "no-store");
    return res.status(statusCode).json({
        status: "error",
        metadata: { version: API_VERSION },
        data: null,
        pagination: null,
        timestamps: buildTimestamps(),
        errors: [
            Object.assign(
                {
                    code: code || "error",
                    message: message || "Error"
                },
                details ? { details } : {}
            )
        ]
    });
}

function sendUnavailable(res) {
    return sendError(res, 503, "database_unavailable", "Base de datos no disponible");
}

function parsePaginationQuery(query, defaults) {
    defaults = defaults || {};
    const limitRaw = Number.parseInt(String(query.limit ?? defaults.limit ?? 20), 10);
    const offsetRaw = Number.parseInt(String(query.offset ?? defaults.offset ?? 0), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), defaults.maxLimit || 50) : 20;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
    return { limit, offset };
}

function paginationMeta(total, limit, offset) {
    return {
        total,
        limit,
        offset,
        has_more: offset + limit < total
    };
}

module.exports = {
    API_VERSION,
    sendOk,
    sendError,
    sendUnavailable,
    parsePaginationQuery,
    paginationMeta
};
