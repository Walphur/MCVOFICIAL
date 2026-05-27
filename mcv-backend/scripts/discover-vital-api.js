"use strict";

const puppeteer = require("puppeteer");

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    const seen = new Set();

    page.on("request", (req) => {
        const u = req.url();
        if (/vital|gamenetwork|statistics/i.test(u) && !/_next\/static|\.(js|css|png|svg|woff)/i.test(u)) {
            console.log("REQ", req.method(), req.resourceType(), u.slice(0, 200));
        }
    });

    page.on("response", async (r) => {
        const u = r.url();
        if (!/vital|statistics|gamenetwork/i.test(u)) return;
        const type = r.request().resourceType();
        if (type !== "xhr" && type !== "fetch" && !u.includes("/api")) return;
        const ct = String(r.headers()["content-type"] || "");
        if (!ct.includes("json") && !u.includes("/api")) return;
        try {
            const txt = await r.text();
            const key = `${r.status()} ${u}`;
            if (seen.has(key)) return;
            seen.add(key);
            const preview = txt.length > 400 ? `${txt.slice(0, 400)}…` : txt;
            console.log(`\n--- ${key} ---\n${preview}\n`);
        } catch (_) {
            /* ignore */
        }
    });

    try {
        await page.goto("https://vitalrust.com/statistics", {
            waitUntil: "networkidle2",
            timeout: 120000
        });
        await new Promise((r) => setTimeout(r, 6000));
    } catch (e) {
        console.error("nav:", e.message);
    }

    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
