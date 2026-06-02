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

function googleOAuthRedirectUris(base) {
    const b = String(base || "").trim().replace(/\/$/, "");
    if (!b) {
        return { admin: "", user: "" };
    }
    return {
        admin: `${b}/api/auth/google/callback`,
        user: `${b}/api/auth/user/google/callback`
    };
}

function recommendedGoogleRedirectBases() {
    const bases = new Set();
    const envBase = String(process.env.OAUTH_PUBLIC_BASE_URL || process.env.PUBLIC_API_URL || "")
        .trim()
        .replace(/\/$/, "");
    if (envBase) {
        bases.add(envBase);
    }
    bases.add("https://mcvoficial.com");
    bases.add("https://www.mcvoficial.com");
    const renderUrl = String(process.env.RENDER_EXTERNAL_URL || "").trim().replace(/\/$/, "");
    if (renderUrl) {
        bases.add(renderUrl);
    }
    return [...bases].filter(Boolean);
}

function recommendedGoogleRedirectUris() {
    const uris = new Set();
    for (const base of recommendedGoogleRedirectBases()) {
        const pair = googleOAuthRedirectUris(base);
        if (pair.admin) uris.add(pair.admin);
        if (pair.user) uris.add(pair.user);
    }
    return [...uris].sort();
}

function logOAuthSetupHints() {
    const hasGoogle = Boolean(
        String(process.env.GOOGLE_CLIENT_ID || "").trim() && String(process.env.GOOGLE_CLIENT_SECRET || "").trim()
    );
    if (!hasGoogle) {
        return;
    }
    const envBase = String(process.env.OAUTH_PUBLIC_BASE_URL || "").trim();
    if (!envBase) {
        console.warn(
            "OAuth Google: falta OAUTH_PUBLIC_BASE_URL (ej. https://mcvoficial.com). Sin eso, redirect_uri puede no coincidir con Google Console."
        );
    }
    console.log("OAuth Google — agregá estas Authorized redirect URIs en Google Cloud Console:");
    for (const uri of recommendedGoogleRedirectUris()) {
        console.log("  •", uri);
    }
}

function oauthSetupPayload(req) {
    const base = oauthPublicBase(req);
    const current = googleOAuthRedirectUris(base);
    return {
        oauthBaseUrl: base,
        googleAdminRedirectUri: current.admin,
        googleUserRedirectUri: current.user,
        recommendedInGoogleConsole: recommendedGoogleRedirectUris(),
        oauthPublicBaseConfigured: Boolean(String(process.env.OAUTH_PUBLIC_BASE_URL || "").trim())
    };
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
    googleOAuthRedirectUris,
    recommendedGoogleRedirectUris,
    logOAuthSetupHints,
    oauthSetupPayload,
    signOAuthState,
    verifyOAuthState,
    setOAuthStateCookie,
    readOAuthStateCookie,
    clearOAuthStateCookie
};
