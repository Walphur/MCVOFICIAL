"use strict";

const rateLimit = require("express-rate-limit");

function numEnv(name, fallback) {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: numEnv("RATE_LIMIT_LOGIN_MAX", 10),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: "Demasiados intentos de login. Probá más tarde." }
});

const scannerRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: numEnv("RATE_LIMIT_SCANNER_MAX", 8),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas consultas al escáner. Esperá un minuto." }
});

const publicWriteRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: numEnv("RATE_LIMIT_PUBLIC_WRITE_MAX", 25),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes. Probá de nuevo en un minuto." }
});

const adminWriteRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: numEnv("RATE_LIMIT_ADMIN_WRITE_MAX", 120),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas operaciones admin. Esperá un momento." }
});

const PUBLIC_WRITE_PATHS = new Set([
    "/api/tickets",
    "/api/team-roster/submit",
    "/verificar-equipo"
]);

function isPublicWritePath(pathOnly) {
    if (PUBLIC_WRITE_PATHS.has(pathOnly)) {
        return true;
    }
    return /^\/api\/tournaments\/[^/]+\/register$/.test(pathOnly);
}

function publicWriteRateLimitMiddleware(req, res, next) {
    if (req.method !== "POST") {
        return next();
    }
    const pathOnly = String(req.path || "").split("?")[0];
    if (!isPublicWritePath(pathOnly)) {
        return next();
    }
    return publicWriteRateLimit(req, res, next);
}

module.exports = {
    loginRateLimit,
    scannerRateLimit,
    publicWriteRateLimit,
    adminWriteRateLimit,
    publicWriteRateLimitMiddleware,
    isPublicWritePath
};
