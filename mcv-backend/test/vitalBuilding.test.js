"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

test("buildingTotalFromVital suma solo bloques estructurales (buildings)", () => {
    const vitalRustApi = require("../vitalRustApi");
    assert.equal(typeof vitalRustApi.buildingTotalFromVital, "function");
    const total = vitalRustApi.buildingTotalFromVital({
        buildings: { wall: "100", floor: "50", "wall.half": "335" },
        deployables: { "cupboard.tool.deployed": "5000", "hemp.entity": "28000", "lock.code": "389" }
    });
    assert.equal(total, 485);
});

test("deployablesTotalFromVital suma deployables por separado", () => {
    const vitalRustApi = require("../vitalRustApi");
    const total = vitalRustApi.deployablesTotalFromVital({
        buildings: { wall: "100" },
        deployables: { "cupboard.tool.deployed": "5", "sleepingbag_leather_deployed": "3" }
    });
    assert.equal(total, 8);
});
