"use strict";

const fs = require("fs");
const path = require("path");

/** Páginas que redirigen de .html a URL limpia. */
const REDIRECT_HTML_PAGES = new Set([
    "index",
    "events",
    "tournament",
    "bot",
    "tickets",
    "cuenta",
    "live",
    "login",
    "admin",
    "vital-rust",
    "torretas",
    "equipo",
    "jugadores"
]);

/** Páginas servidas sin extensión (index usa express.static index). */
const SERVE_HTML_PAGES = new Set([
    "events",
    "tournament",
    "bot",
    "tickets",
    "cuenta",
    "live",
    "login",
    "admin",
    "vital-rust",
    "torretas"
]);

const NOINDEX_PATHS = new Set(["/admin", "/login", "/cuenta"]);

function normalizePublicPath(raw) {
    if (raw === "" || raw === "/") {
        return "";
    }
    let next = String(raw == null ? "cuenta" : raw).replace(/^\/+/, "");
    next = next.replace(/\.html(?=[?#]|$)/i, "");
    if (next === "index") {
        return "";
    }
    return next;
}

function isSafeUserNextPath(next) {
    const base = String(next || "")
        .split("?")[0]
        .replace(/^\/+/, "")
        .replace(/\.html$/i, "");
    if (!base || base === "index") {
        return true;
    }
    if (/^equipo(\/|$)/i.test(base)) {
        return true;
    }
    if (SERVE_HTML_PAGES.has(base) || base === "cuenta") {
        return true;
    }
    return false;
}

function buildPublicRedirectUrl(base, pathRaw, token) {
    let next = normalizePublicPath(pathRaw);
    if (!isSafeUserNextPath(next)) {
        next = "cuenta";
    }
    const qIndex = next.indexOf("?");
    const pathPart = qIndex >= 0 ? next.slice(0, qIndex) : next;
    const query = qIndex >= 0 ? next.slice(qIndex + 1) : "";
    const urlPath = pathPart ? `/${pathPart}` : "/";
    const params = new URLSearchParams(query);
    params.set("token", token);
    return `${base.replace(/\/$/, "")}${urlPath}?${params.toString()}`;
}

function querySuffix(url) {
    const i = String(url || "").indexOf("?");
    return i >= 0 ? url.slice(i) : "";
}

function registerCleanUrlRoutes(app, rootDir) {
    app.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
            return next();
        }

        const pathOnly = String(req.path || "/").split("?")[0];
        const qs = querySuffix(req.originalUrl || req.url);

        const htmlMatch = pathOnly.match(/^\/([a-z0-9-]+)\.html$/i);
        if (htmlMatch) {
            const name = htmlMatch[1].toLowerCase();
            if (REDIRECT_HTML_PAGES.has(name)) {
                if (name === "equipo" || name === "jugadores") {
                    return res.redirect(301, "/equipo/" + qs);
                }
                const target = name === "index" ? "/" : `/${name}`;
                return res.redirect(301, target + qs);
            }
        }

        if (pathOnly === "/jugadores" || pathOnly === "/jugadores/") {
            return res.redirect(301, "/equipo/" + qs);
        }

        const cleanMatch = pathOnly.match(/^\/([a-z0-9-]+)\/?$/i);
        if (cleanMatch) {
            const name = cleanMatch[1].toLowerCase();
            if (SERVE_HTML_PAGES.has(name)) {
                const filePath = path.join(rootDir, `${name}.html`);
                if (fs.existsSync(filePath)) {
                    return res.sendFile(filePath);
                }
            }
        }

        return next();
    });
}

function isNoIndexPath(pathname) {
    const p = String(pathname || "").split("?")[0];
    if (NOINDEX_PATHS.has(p)) {
        return true;
    }
    return p === "/admin.html" || p === "/login.html" || p === "/cuenta.html";
}

module.exports = {
    registerCleanUrlRoutes,
    isNoIndexPath,
    SERVE_HTML_PAGES,
    normalizePublicPath,
    isSafeUserNextPath,
    buildPublicRedirectUrl
};
