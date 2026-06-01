"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

test("buildingTotalFromVital suma buildings y deployables", () => {
    const vitalRustApi = require("../vitalRustApi");
    assert.equal(typeof vitalRustApi.buildingTotalFromVital, "function");
    const total = vitalRustApi.buildingTotalFromVital({
        buildings: { wall: "100", floor: "50" },
        deployables: { "cupboard.tool.deployed": "5", "sleepingbag_leather_deployed": "3" }
    });
    assert.equal(total, 158);
});
