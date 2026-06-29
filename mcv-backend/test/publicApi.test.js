"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
    parseRosterJson,
    rosterHasSteam,
    normalizeSteamId64,
    deriveSeason,
    buildWipeCalendarEvents
} = require("../publicDataService");

describe("publicDataService helpers", () => {
    it("parseRosterJson handles array and JSON string", () => {
        assert.deepEqual(parseRosterJson([{ name: "A" }]), [{ name: "A" }]);
        assert.deepEqual(parseRosterJson('[{"name":"B"}]'), [{ name: "B" }]);
        assert.deepEqual(parseRosterJson(null), []);
    });

    it("normalizeSteamId64 validates format", () => {
        assert.equal(normalizeSteamId64("76561198204000001"), "76561198204000001");
        assert.equal(normalizeSteamId64("invalid"), null);
    });

    it("rosterHasSteam finds player in roster", () => {
        const roster = [{ steamId64: "76561198204000001", name: "Test" }];
        assert.equal(rosterHasSteam(roster, "76561198204000001"), true);
        assert.equal(rosterHasSteam(roster, "76561198204000099"), false);
    });

    it("deriveSeason prefers explicit season column", () => {
        assert.equal(deriveSeason({ season: "2026-s1" }), "2026-s1");
        assert.equal(deriveSeason({ ended_at: "2025-12-01T00:00:00Z" }), "2025");
    });

    it("buildWipeCalendarEvents returns upcoming wipe events", () => {
        const pack = buildWipeCalendarEvents(new Date("2026-06-01T12:00:00Z"));
        assert.ok(Array.isArray(pack.events));
        assert.ok(pack.events.length >= 1);
        assert.ok(pack.current_period);
    });
});

describe("publicApiEnvelope", () => {
    const { sendOk, paginationMeta } = require("../publicApiEnvelope");

    it("paginationMeta computes has_more", () => {
        assert.deepEqual(paginationMeta(10, 5, 0), { total: 10, limit: 5, offset: 0, has_more: true });
        assert.deepEqual(paginationMeta(3, 5, 0).has_more, false);
    });

    it("sendOk sets envelope shape", () => {
        const headers = {};
        const res = {
            headers,
            set(k, v) {
                headers[k] = v;
            },
            json(body) {
                assert.equal(body.status, "ok");
                assert.equal(body.metadata.version, "1");
                assert.equal(body.data.foo, 1);
                assert.ok(body.timestamps.generated_at);
                assert.equal(headers["Cache-Control"], "public, max-age=60, stale-while-revalidate=120");
            }
        };
        sendOk(res, { resource: "test", data: { foo: 1 }, cacheTtlSeconds: 60 });
    });
});
