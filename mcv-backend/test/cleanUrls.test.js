"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    normalizePublicPath,
    isSafeUserNextPath,
    buildPublicRedirectUrl
} = require("../cleanUrls");

test("normalizePublicPath quita .html y index", () => {
    assert.equal(normalizePublicPath("cuenta.html"), "cuenta");
    assert.equal(normalizePublicPath("/events"), "events");
    assert.equal(normalizePublicPath("index.html"), "");
});

test("buildPublicRedirectUrl genera rutas limpias", () => {
    assert.equal(
        buildPublicRedirectUrl("https://mcv.test", "tickets", "jwt123"),
        "https://mcv.test/tickets?token=jwt123"
    );
    assert.equal(
        buildPublicRedirectUrl("https://mcv.test/", "cuenta", "jwt123"),
        "https://mcv.test/cuenta?token=jwt123"
    );
    assert.equal(
        buildPublicRedirectUrl("https://mcv.test", "", "jwt123"),
        "https://mcv.test/?token=jwt123"
    );
});

test("isSafeUserNextPath acepta rutas públicas y rechaza traversal", () => {
    assert.equal(isSafeUserNextPath("events"), true);
    assert.equal(isSafeUserNextPath("equipo/solicitud"), true);
    assert.equal(isSafeUserNextPath("../admin"), false);
});
