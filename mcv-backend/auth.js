"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function jwtSecret() {
    const s = String(process.env.JWT_SECRET || "").trim();
    if (!s || s.length < 12) {
        return null;
    }
    return s;
}

function timingSafeEqualStr(a, b) {
    const sa = String(a || "");
    const sb = String(b || "");
    const ba = Buffer.from(sa, "utf8");
    const bb = Buffer.from(sb, "utf8");
    if (ba.length !== bb.length) {
        crypto.timingSafeEqual(ba, ba);
        return false;
    }
    return crypto.timingSafeEqual(ba, bb);
}

function clientIp(req) {
    const cf = String(req.headers["cf-connecting-ip"] || "").trim();
    if (cf) {
        return cf;
    }
    const raw = String(req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "")
        .split(",")[0]
        .trim();
    return raw || "unknown";
}

function adminIpAllowlist() {
    return String(process.env.ADMIN_IP_ALLOWLIST || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

function authAdminIpAllowlist(req, res, next) {
    const list = adminIpAllowlist();
    if (!list.length) {
        return next();
    }
    const ip = clientIp(req);
    if (list.includes(ip)) {
        return next();
    }
    console.warn("admin IP blocked:", ip, req.path);
    return res.status(403).json({ error: "IP no autorizada para admin" });
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
        req.adminAuth = decoded;
        next();
    } catch {
        return res.status(401).json({ error: "Token inválido o expirado" });
    }
}

function signUserJwt(userRow) {
    const secret = jwtSecret();
    if (!secret || !userRow) {
        return null;
    }
    return jwt.sign(
        {
            role: "user",
            userId: userRow.id,
            steamId64: userRow.steam_id64 || null,
            email: userRow.google_email || null,
            displayName: userRow.display_name || ""
        },
        secret,
        { expiresIn: "30d" }
    );
}

function authUser(req, res, next) {
    const secret = jwtSecret();
    if (!secret) {
        return res.status(503).json({ error: "JWT_SECRET no configurado" });
    }
    const h = req.headers.authorization;
    if (!h || !h.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Iniciá sesión con Steam o Google" });
    }
    try {
        const decoded = jwt.verify(h.slice(7), secret);
        if (!decoded || decoded.role !== "user" || !decoded.userId) {
            return res.status(403).json({ error: "Sesión de usuario inválida" });
        }
        req.userAuth = decoded;
        next();
    } catch {
        return res.status(401).json({ error: "Sesión expirada. Volvé a iniciar sesión." });
    }
}

function verifyUserJwt(token) {
    const secret = jwtSecret();
    if (!secret || !token) {
        return null;
    }
    try {
        const decoded = jwt.verify(String(token), secret);
        if (!decoded || decoded.role !== "user" || !decoded.userId) {
            return null;
        }
        return decoded;
    } catch {
        return null;
    }
}

module.exports = {
    jwtSecret,
    timingSafeEqualStr,
    clientIp,
    authAdmin,
    authAdminIpAllowlist,
    authUser,
    signUserJwt,
    verifyUserJwt
};
