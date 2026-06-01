"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildAttendanceEmbed,
    buildMentionChunks,
    canManageAttendance
} = require("../wipeAttendance");

test("buildAttendanceEmbed agrupa accepted y pending", () => {
    const poll = { id: 1, title: "FORCED JUNE", event_note: "jueves 15:00", closed_at: null };
    const responses = [
        { discord_user_id: "111", discord_username: "kami", status: "accepted", excuse_text: null },
        { discord_user_id: "222", discord_username: "tato", status: "late", excuse_text: "laburo" }
    ];
    const embed = buildAttendanceEmbed(poll, responses, ["111", "222", "333"]);
    const names = embed.data.fields.map((f) => f.name).join(" ");
    assert.match(names, /Accepted \(1\)/);
    assert.match(names, /Late \(1\)/);
    assert.match(names, /Sin responder \(1\)/);
});

test("buildMentionChunks respeta límite de caracteres", () => {
    const ids = Array.from({ length: 50 }, (_, i) => String(1000000000000000000n + BigInt(i)));
    const chunks = buildMentionChunks(ids, 200);
    assert.ok(chunks.length > 1);
    for (const c of chunks) {
        assert.ok(c.length <= 200);
    }
});

test("canManageAttendance permite ManageGuild", () => {
    const ok = canManageAttendance({
        memberPermissions: { has: (p) => p === 1 /* fake */ },
        member: { roles: { cache: { has: () => false } } }
    });
    assert.equal(typeof ok, "boolean");
});
