"use strict";

const puppeteer = require("puppeteer");

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    const hits = [];

    page.on("response", async (r) => {
        const u = r.url();
        const type = r.request().resourceType();
        if (type !== "xhr" && type !== "fetch") return;
        if (!/vital|gamenetwork|statistics|wipes|overview/i.test(u)) return;
        const ct = String(r.headers()["content-type"] || "");
        let preview = "";
        if (ct.includes("json") && r.status() < 400) {
            try {
                const txt = await r.text();
                preview = txt.length > 300 ? `${txt.slice(0, 300)}…` : txt;
            } catch (_) {
                preview = "";
            }
        }
        hits.push(`${r.status()} ${r.request().method()} ${u}${preview ? "\n  " + preview.replace(/\s+/g, " ") : ""}`);
    });

    const target =
        "https://vitalrust.com/statistics?serverId=1&category=Player&sortBy=kills&sortAscending=false";
    try {
        await page.goto(target, { waitUntil: "networkidle2", timeout: 120000 });
        await new Promise((r) => setTimeout(r, 8000));
    } catch (e) {
        console.error("nav:", e.message);
    }

    console.log([...new Set(hits)].join("\n\n"));
    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
