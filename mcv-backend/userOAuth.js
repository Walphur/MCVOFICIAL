"use strict";

const axios = require("axios");
const openid = require("openid");
const { clientIp, signUserJwt, authUser, verifyUserJwt } = require("./auth");
const {
    oauthPublicBase,
    signOAuthState,
    verifyOAuthState,
    setOAuthStateCookie,
    readOAuthStateCookie,
    clearOAuthStateCookie,
    oauthSetupPayload
} = require("./oauthShared");
const {
    fetchSteamProfile,
    upsertUserFromSteam,
    upsertUserFromGoogle,
    linkSteamToUser,
    getSiteUserById,
    serializeSiteUser
} = require("./siteUsers");

function googleClientId() {
    return String(process.env.GOOGLE_CLIENT_ID || "").trim();
}

function googleClientSecret() {
    return String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
}

function isPublicGoogleEnabled() {
    return String(process.env.PUBLIC_USER_GOOGLE || "1").trim() !== "0" && Boolean(googleClientId() && googleClientSecret());
}

function isPublicSteamEnabled() {
    return String(process.env.PUBLIC_USER_STEAM || "1").trim() !== "0";
}

function isPublicUserAuthEnabled() {
    return isPublicGoogleEnabled() || isPublicSteamEnabled();
}

function redirectUserSuccess(res, base, token, nextPath) {
    const next = String(nextPath || "cuenta.html").replace(/^\/+/, "");
    const safeNext = /^[a-z0-9_.-]+\.html(\?[^#]*)?$/i.test(next) || /^equipo\//i.test(next) ? next : "cuenta.html";
    const url = `${base}/${safeNext}${safeNext.indexOf("?") >= 0 ? "&" : "?"}token=${encodeURIComponent(token)}`;
    return res.redirect(302, url);
}

function redirectUserError(res, base, code) {
    const url = `${base}/cuenta.html?oauth_error=${encodeURIComponent(code)}`;
    return res.redirect(302, url);
}

function registerPublicUserAuthRoutes(app, { getPool, steamApiKey }) {
    app.get("/api/auth/user/options", (req, res) => {
        const ticketsRequireAuth =
            String(process.env.REQUIRE_USER_AUTH_TICKETS || "1").trim() !== "0" && isPublicUserAuthEnabled();
        const setup = oauthSetupPayload(req);
        return res.json({
            enabled: isPublicUserAuthEnabled(),
            googleEnabled: isPublicGoogleEnabled(),
            steamEnabled: isPublicSteamEnabled(),
            ticketsRequireAuth,
            oauthBaseUrl: setup.oauthBaseUrl,
            googleUserRedirectUri: setup.googleUserRedirectUri,
            recommendedGoogleRedirectUris: setup.recommendedInGoogleConsole
        });
    });

    app.get("/api/auth/oauth-redirects", (req, res) => {
        const setup = oauthSetupPayload(req);
        return res.json({
            ...setup,
            hint: "Copiá recommendedInGoogleConsole en Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs"
        });
    });

    app.get("/api/auth/user/me", authUser, async (req, res) => {
        const pool = getPool();
        if (!pool) {
            return res.status(503).json({ error: "Base de datos no disponible" });
        }
        try {
            const row = await getSiteUserById(pool, req.userAuth.userId);
            if (!row) {
                return res.status(404).json({ error: "Usuario no encontrado" });
            }
            return res.json({ user: serializeSiteUser(row) });
        } catch (e) {
            console.error("GET /api/auth/user/me:", e.message);
            return res.status(500).json({ error: "Error al cargar perfil" });
        }
    });

    app.get("/api/auth/user/google/start", (req, res) => {
        const base = oauthPublicBase(req);
        if (!base || !isPublicGoogleEnabled()) {
            return res.status(503).json({ error: "Login con Google no disponible" });
        }
        const nextPath = String(req.query.next || "cuenta.html").slice(0, 120);
        const state = signOAuthState({ provider: "user-google", ip: clientIp(req), next: nextPath });
        if (!state) {
            return res.status(503).json({ error: "JWT_SECRET no configurado" });
        }
        setOAuthStateCookie(res, state);
        const redirectUri = `${base}/api/auth/user/google/callback`;
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

    app.get("/api/auth/user/google/callback", async (req, res) => {
        const base = oauthPublicBase(req);
        const stateRaw = readOAuthStateCookie(req) || String(req.query.state || "");
        clearOAuthStateCookie(res);
        const state = verifyOAuthState(stateRaw);
        if (!state || state.provider !== "user-google") {
            return redirectUserError(res, base, "invalid_state");
        }
        const pool = getPool();
        if (!pool) {
            return redirectUserError(res, base, "no_db");
        }
        const code = String(req.query.code || "").trim();
        if (!code || !base) {
            return redirectUserError(res, base, "missing_code");
        }
        const redirectUri = `${base}/api/auth/user/google/callback`;
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
                return redirectUserError(res, base, "token_exchange");
            }
            const { data: profile } = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 15000
            });
            const googleSub = String(profile?.id || "").trim();
            const email = String(profile?.email || "").trim();
            if (!googleSub) {
                return redirectUserError(res, base, "google_profile");
            }
            const userRow = await upsertUserFromGoogle(pool, googleSub, email, profile);
            const token = signUserJwt(userRow);
            if (!token) {
                return redirectUserError(res, base, "jwt");
            }
            console.log("public user google login:", userRow.id, email || googleSub);
            return redirectUserSuccess(res, base, token, state.next);
        } catch (e) {
            console.error("user google oauth:", e.message);
            return redirectUserError(res, base, "google_failed");
        }
    });

    const steamRealm = () => String(process.env.STEAM_OPENID_REALM || "").trim();

    app.get("/api/auth/user/steam/start", (req, res) => {
        const base = oauthPublicBase(req);
        if (!base || !isPublicSteamEnabled()) {
            return res.status(503).json({ error: "Login con Steam no disponible" });
        }
        const nextPath = String(req.query.next || "cuenta.html").slice(0, 120);
        const linkJwt = String(req.query.linkJwt || "").trim();
        const linkAuth = linkJwt ? verifyUserJwt(linkJwt) : null;
        const linkUserId = linkAuth && linkAuth.userId ? Number(linkAuth.userId) : null;
        const realm = steamRealm() || base;
        const returnTo = `${base}/api/auth/user/steam/callback`;
        const relyingParty = new openid.RelyingParty(returnTo, realm, true, false, []);
        relyingParty.authenticate("https://steamcommunity.com/openid", false, (err, authUrl) => {
            if (err || !authUrl) {
                console.error("user steam openid start:", err?.message);
                return res.status(502).json({ error: "No se pudo iniciar Steam" });
            }
            const state = signOAuthState({
                provider: "user-steam",
                ip: clientIp(req),
                next: nextPath,
                linkUserId: linkUserId || undefined
            });
            if (!state) {
                return res.status(503).json({ error: "JWT_SECRET no configurado" });
            }
            setOAuthStateCookie(res, state);
            return res.redirect(302, authUrl);
        });
    });

    app.get("/api/auth/user/steam/callback", (req, res) => {
        const base = oauthPublicBase(req);
        const stateRaw = readOAuthStateCookie(req) || "";
        clearOAuthStateCookie(res);
        const state = verifyOAuthState(stateRaw);
        if (!state || state.provider !== "user-steam") {
            return redirectUserError(res, base, "invalid_state");
        }
        const pool = getPool();
        if (!pool) {
            return redirectUserError(res, base, "no_db");
        }
        const realm = steamRealm() || base;
        const returnTo = `${base}/api/auth/user/steam/callback`;
        const relyingParty = new openid.RelyingParty(returnTo, realm, true, false, []);
        relyingParty.verifyAssertion(req, async (err, result) => {
            if (err || !result || !result.authenticated) {
                console.error("user steam verify:", err?.message);
                return redirectUserError(res, base, "steam_verify");
            }
            const claimed = String(result.claimedIdentifier || "");
            const m = claimed.match(/(\d{17})$/);
            const steamId = m ? m[1] : "";
            if (!steamId) {
                return redirectUserError(res, base, "steam_id");
            }
            try {
                const profile = await fetchSteamProfile(steamApiKey, steamId);
                let userRow;
                if (state.linkUserId) {
                    try {
                        userRow = await linkSteamToUser(pool, state.linkUserId, steamId, profile);
                        console.log("public user steam linked:", userRow.id, steamId);
                    } catch (linkErr) {
                        if (linkErr.code === "steam_taken") {
                            return redirectUserError(res, base, "steam_taken");
                        }
                        throw linkErr;
                    }
                } else {
                    userRow = await upsertUserFromSteam(pool, steamId, profile);
                    console.log("public user steam login:", userRow.id, steamId);
                }
                const token = signUserJwt(userRow);
                if (!token) {
                    return redirectUserError(res, base, "jwt");
                }
                return redirectUserSuccess(res, base, token, state.next);
            } catch (e) {
                console.error("user steam upsert:", e.message);
                return redirectUserError(res, base, "steam_failed");
            }
        });
    });
}

module.exports = {
    registerPublicUserAuthRoutes,
    isPublicUserAuthEnabled,
    isPublicGoogleEnabled,
    isPublicSteamEnabled
};
