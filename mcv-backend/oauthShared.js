"use strict";

const jwt = require("jsonwebtoken");
const { jwtSecret } = require("./auth");

function oauthPublicBase(req) {
    const env = String(process.env.OAUTH_PUBLIC_BASE_URL || process.env.PUBLIC_API_URL || "").trim().replace(
        /\/$/,
        ""
    );
    if (env) {
        return env;
    }
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
    const host = String(req.headers["x-forwarded-host"] || req.get("host") || "").split(",")[0].trim();
    return host ? `${proto}://${host}` : "";
}

function signOAuthState(payload) {
    const secret = jwtSecret();
    if (!secret) {
        return null;
    }
    return jwt.sign(payload, secret, { expiresIn: "10m" });
}

function verifyOAuthState(token) {
    const secret = jwtSecret();
    if (!secret || !token) {
        return null;
    }
    try {
        return jwt.verify(String(token), secret);
    } catch {
        return null;
    }
}

function setOAuthStateCookie(res, state) {
    res.setHeader(
        "Set-Cookie",
        `mcv_oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    );
}

function readOAuthStateCookie(req) {
    const raw = String(req.headers.cookie || "");
    for (const p of raw.split(";").map((s) => s.trim())) {
        if (p.startsWith("mcv_oauth_state=")) {
            return decodeURIComponent(p.slice("mcv_oauth_state=".length));
        }
    }
    return "";
}

function clearOAuthStateCookie(res) {
    res.setHeader("Set-Cookie", "mcv_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}

module.exports = {
    oauthPublicBase,
    signOAuthState,
    verifyOAuthState,
    setOAuthStateCookie,
    readOAuthStateCookie,
    clearOAuthStateCookie
};
