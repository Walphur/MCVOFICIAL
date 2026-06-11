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

test("extractDeployableStats separa torretas, huerto y colocación", () => {
    const vitalRustApi = require("../vitalRustApi");
    const stats = vitalRustApi.extractDeployableStats({
        buildings: { wall: "10" },
        deployables: {
            autoturret_deployed: "12",
            "hemp.entity": "44",
            "lock.code": "389",
            "door.hinged.metal": "77",
            "wall.frame.garagedoor": "219",
            "box.wooden.large": "27",
            "locker.deployed": "14",
            furnace: "5",
            sleepingbag_leather_deployed: "99"
        }
    });
    assert.equal(stats.deployableAutoturrets, 12);
    assert.equal(stats.deployablePlantation, 44);
    assert.equal(stats.deployableCraftPlace, 389 + 77 + 219 + 27 + 14 + 5);
});
