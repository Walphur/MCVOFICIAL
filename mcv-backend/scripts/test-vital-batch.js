"use strict";

const axios = require("axios");

const W = "17e04726-a558-475f-9975-5c3382c5dd13";
const IDS = [
    "76561199099896172",
    "76561198096393444",
    "76561199104965969",
    "76561199366683883",
    "76561197984456745",
    "76561199184307759",
    "76561199100868636",
    "76561199380849787",
    "76561198120285410",
    "76561199443095503",
    "76561199095713177",
    "76561198075404010",
    "76561199320068414",
    "76561199142739552"
];

(async () => {
    for (const sid of IDS) {
        const r = await axios.post(
            "https://playerstatistics.vitalgamenetwork.com/players/overview",
            {
                serverId: 16,
                wipeId: W,
                playerIds: [sid],
                includes: ["combat"]
            },
            { validateStatus: () => true }
        );
        const name = r.data?.data?.[0]?.player?.name || "—";
        console.log(r.status, sid, name, "len", r.data?.data?.length || 0);
    }
    for (const n of [1, 2, 5, 10, 11, 14]) {
        const batch = IDS.slice(0, n);
        const r = await axios.post(
            "https://playerstatistics.vitalgamenetwork.com/players/overview",
            {
                serverId: 16,
                wipeId: W,
                playerIds: batch,
                includes: ["combat"]
            },
            { validateStatus: () => true }
        );
        console.log(`batch ${n}: status ${r.status} len ${r.data?.data?.length || 0}`);
    }
})();
