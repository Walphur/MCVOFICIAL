"use strict";

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

let pool = null;

function getPool() {
    if (!process.env.DATABASE_URL) {
        return null;
    }
    if (!pool) {
        const ssl =
            process.env.DATABASE_SSL === "false"
                ? false
                : { rejectUnauthorized: false };
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl
        });
    }
    return pool;
}

async function initDb() {
    const p = getPool();
    if (!p) {
        console.warn("DATABASE_URL no definido: API de torneos y admin desactivada.");
        return false;
    }

    const schemaPath = path.join(__dirname, "schema.sql");
    const raw = fs.readFileSync(schemaPath, "utf8");
    const chunks = raw
        .split(/^\s*--\s*split\s*$/gim)
        .map((s) => s.trim())
        .filter(Boolean);

    for (const chunk of chunks) {
        await p.query(chunk);
    }

    console.log("Base de datos: esquema aplicado.");
    return true;
}

module.exports = { getPool, initDb };
