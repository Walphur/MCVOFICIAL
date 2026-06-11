"use strict";

const axios = require("axios");
const { clientIp } = require("./auth");

function turnstileSiteKey() {
    return String(process.env.TURNSTILE_SITE_KEY || "").trim();
}

function turnstileSecretKey() {
    return String(process.env.TURNSTILE_SECRET_KEY || "").trim();
}

function isTurnstileEnabled() {
    return Boolean(turnstileSiteKey() && turnstileSecretKey());
}

async function verifyTurnstileToken(req, token) {
    if (!isTurnstileEnabled()) {
        return { ok: true, skipped: true };
    }
    const response = String(token || "").trim();
    if (!response) {
        return { ok: false, error: "Completá la verificación anti-bot." };
    }
    const secret = turnstileSecretKey();
    try {
        const { data } = await axios.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            new URLSearchParams({
                secret,
                response,
                remoteip: clientIp(req)
            }),
            {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                timeout: 10000
            }
        );
        if (data && data.success) {
            return { ok: true };
        }
        const codes = (data && data["error-codes"]) || [];
        console.warn("turnstile verify failed:", codes.join(", ") || "unknown");
        return { ok: false, error: "Verificación anti-bot inválida. Recargá e intentá de nuevo." };
    } catch (e) {
        console.error("turnstile siteverify:", e.message);
        return { ok: false, error: "No se pudo validar Turnstile. Probá en unos segundos." };
    }
}

module.exports = {
    turnstileSiteKey,
    isTurnstileEnabled,
    verifyTurnstileToken
};
