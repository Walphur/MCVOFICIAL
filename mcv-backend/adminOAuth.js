"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const openid = require("openid");
const { jwtSecret, clientIp } = require("./auth");

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

function googleClientId() {
    return String(process.env.GOOGLE_CLIENT_ID || "").trim();
}

function googleClientSecret() {
    return String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
}

function isGoogleOAuthEnabled() {
    return Boolean(googleClientId() && googleClientSecret());
}

function steamAllowlist() {
    return String(process.env.ADMIN_OAUTH_STEAM_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d{17}$/.test(s));
}

function googleAllowlist() {
    return String(process.env.ADMIN_OAUTH_GOOGLE_EMAILS || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

function isSteamOAuthEnabled() {
    return steamAllowlist().length > 0;
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

function issueAdminToken() {
    const secret = jwtSecret();
    if (!secret) {
        return null;
    }
    return jwt.sign({ role: "admin", via: "oauth" }, secret, { expiresIn: "12h" });
}

function redirectLoginSuccess(res, base, token) {
    const url = `${base}/admin.html?token=${encodeURIComponent(token)}`;
    return res.redirect(302, url);
}

function redirectLoginError(res, base, code) {
    const url = `${base}/login.html?oauth_error=${encodeURIComponent(code)}`;
    return res.redirect(302, url);
}

function setOAuthStateCookie(res, state) {
    res.setHeader(
        "Set-Cookie",
        `mcv_oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    );
}

function readOAuthStateCookie(req) {
    const raw = String(req.headers.cookie || "");
    const parts = raw.split(";").map((s) => s.trim());
    for (const p of parts) {
        if (p.startsWith("mcv_oauth_state=")) {
            return decodeURIComponent(p.slice("mcv_oauth_state=".length));
        }
    }
    return "";
}

function clearOAuthStateCookie(res) {
    res.setHeader("Set-Cookie", "mcv_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}

function registerAdminOAuthRoutes(app) {
    app.get("/api/auth/oauth-options", (req, res) => {
        return res.json({
            googleEnabled: isGoogleOAuthEnabled() && googleAllowlist().length > 0,
            steamEnabled: isSteamOAuthEnabled()
        });
    });

    app.get("/api/auth/google/start", (req, res) => {
        const base = oauthPublicBase(req);
        if (!base || !isGoogleOAuthEnabled() || !googleAllowlist().length) {
            return res.status(503).json({ error: "Google OAuth no configurado" });
        }
        const state = signOAuthState({ provider: "google", ip: clientIp(req) });
        if (!state) {
            return res.status(503).json({ error: "JWT_SECRET no configurado" });
        }
        const redirectUri = `${base}/api/auth/google/callback`;
        const q = new URLSearchParams({
            client_id: googleClientId(),
            redirect_uri: redirectUri,
            response_type: "code",
            scope: "openid email profile",
            state,
            prompt: "select_account"
        });
        return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${q}`);
    });

    app.get("/api/auth/google/callback", async (req, res) => {
        const base = oauthPublicBase(req);
        const errCode = String(req.query.error || "").trim();
        if (errCode) {
            return redirectLoginError(res, base, errCode);
        }
        const state = verifyOAuthState(req.query.state);
        if (!state || state.provider !== "google") {
            return redirectLoginError(res, base, "invalid_state");
        }
        const code = String(req.query.code || "").trim();
        if (!code || !base) {
            return redirectLoginError(res, base, "missing_code");
        }
        const redirectUri = `${base}/api/auth/google/callback`;
        try {
            const tokenRes = await axios.post(
                "https://oauth2.googleapis.com/token",
                new URLSearchParams({
                    code,
                    client_id: googleClientId(),
                    client_secret: googleClientSecret(),
                    redirect_uri: redirectUri,
                    grant_type: "authorization_code"
                }),
                { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
            );
            const accessToken = tokenRes.data && tokenRes.data.access_token;
            if (!accessToken) {
                return redirectLoginError(res, base, "token_exchange");
            }
            const { data: profile } = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 15000
            });
            const email = String(profile?.email || "")
                .trim()
                .toLowerCase();
            const allowed = googleAllowlist();
            if (!email || !allowed.includes(email)) {
                console.warn("google oauth denied:", email || "(sin email)");
                return redirectLoginError(res, base, "not_allowed");
            }
            const token = issueAdminToken();
            if (!token) {
                return redirectLoginError(res, base, "jwt");
            }
            console.log("google oauth login ok:", email);
            return redirectLoginSuccess(res, base, token);
        } catch (e) {
            console.error("google oauth:", e.message);
            return redirectLoginError(res, base, "google_failed");
        }
    });

    const steamRealm = () => String(process.env.STEAM_OPENID_REALM || "").trim();

    app.get("/api/auth/steam/start", (req, res) => {
        const base = oauthPublicBase(req);
        const allow = steamAllowlist();
        if (!base || !allow.length) {
            return res.status(503).json({ error: "Steam OAuth no configurado (ADMIN_OAUTH_STEAM_IDS)" });
        }
        const realm = steamRealm() || base;
        const returnTo = `${base}/api/auth/steam/callback`;
        const relyingParty = new openid.RelyingParty(returnTo, realm, true, false, []);
        relyingParty.authenticate("https://steamcommunity.com/openid", false, (err, authUrl) => {
            if (err || !authUrl) {
                console.error("steam openid start:", err?.message);
                return res.status(502).json({ error: "No se pudo iniciar Steam OpenID" });
            }
            const state = signOAuthState({ provider: "steam", ip: clientIp(req) });
            if (!state) {
                return res.status(503).json({ error: "JWT_SECRET no configurado" });
            }
            setOAuthStateCookie(res, state);
            return res.redirect(302, authUrl);
        });
    });

    app.get("/api/auth/steam/callback", (req, res) => {
        const base = oauthPublicBase(req);
        const stateRaw = readOAuthStateCookie(req) || String(req.query.state || "");
        clearOAuthStateCookie(res);
        const state = verifyOAuthState(stateRaw);
        if (!state || state.provider !== "steam") {
            return redirectLoginError(res, base, "invalid_state");
        }
        const realm = steamRealm() || base;
        const returnTo = `${base}/api/auth/steam/callback`;
        const relyingParty = new openid.RelyingParty(returnTo, realm, true, false, []);
        relyingParty.verifyAssertion(req, (err, result) => {
            if (err || !result || !result.authenticated) {
                console.error("steam openid verify:", err?.message);
                return redirectLoginError(res, base, "steam_verify");
            }
            const claimed = String(result.claimedIdentifier || "");
            const m = claimed.match(/(\d{17})$/);
            const steamId = m ? m[1] : "";
            const allow = steamAllowlist();
            if (!steamId || !allow.includes(steamId)) {
                console.warn("steam oauth denied:", steamId || claimed);
                return redirectLoginError(res, base, "not_allowed");
            }
            const token = issueAdminToken();
            if (!token) {
                return redirectLoginError(res, base, "jwt");
            }
            console.log("steam oauth login ok:", steamId);
            return redirectLoginSuccess(res, base, token);
        });
    });
}

module.exports = {
    registerAdminOAuthRoutes,
    isGoogleOAuthEnabled,
    isSteamOAuthEnabled,
    googleAllowlist,
    steamAllowlist
};
