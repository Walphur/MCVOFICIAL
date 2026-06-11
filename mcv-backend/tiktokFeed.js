"use strict";

const axios = require("axios");

const CACHE_MS = 1000 * 60 * 20;
const BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const cache = new Map();

function uniqueVideoIdsFromHtml(html, limit) {
    const ids = [];
    const re = /\/video\/(\d{10,25})/g;
    let m;
    while ((m = re.exec(String(html || ""))) && ids.length < limit) {
        if (ids.indexOf(m[1]) === -1) ids.push(m[1]);
    }
    return ids;
}

async function oembedForUrl(url) {
    try {
        const res = await axios.get("https://www.tiktok.com/oembed", {
            params: { url },
            timeout: 12000,
            headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/json" }
        });
        const d = res.data || {};
        return {
            title: String(d.title || "").trim(),
            thumbnail: String(d.thumbnail_url || "").trim()
        };
    } catch {
        return { title: "", thumbnail: "" };
    }
}

async function fetchLatestVideos(handle, limit) {
    const lim = Math.min(Math.max(Number(limit) || 2, 1), 4);
    const cacheKey = "tt:" + handle + ":" + lim;
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.value;

    const h = String(handle || "")
        .replace(/^@/, "")
        .trim();
    let videoUrls = String(process.env.TIKTOK_VIDEO_URLS || "")
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => /tiktok\.com\/.+\/video\//i.test(s))
        .slice(0, lim);

    if (videoUrls.length < lim) {
        try {
            const res = await axios.get("https://www.tiktok.com/@" + encodeURIComponent(h), {
                timeout: 12000,
                headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/json" },
                maxRedirects: 5,
                validateStatus: (s) => s >= 200 && s < 400
            });
            const ids = uniqueVideoIdsFromHtml(res.data, lim);
            for (const id of ids) {
                const u = "https://www.tiktok.com/@" + h + "/video/" + id;
                if (videoUrls.indexOf(u) === -1) videoUrls.push(u);
                if (videoUrls.length >= lim) break;
            }
        } catch (e) {
            console.warn("tiktok scrape:", e.message || e);
        }
    }

    if (!videoUrls.length) {
        videoUrls = ["https://www.tiktok.com/@" + h];
    }

    const videos = [];
    for (let i = 0; i < Math.min(videoUrls.length, lim); i++) {
        const url = videoUrls[i];
        const isProfileOnly = !/\/video\//i.test(url);
        if (isProfileOnly) {
            videos.push({
                url,
                title: "@" + h,
                thumbnail: "",
                isProfile: true
            });
            continue;
        }
        const meta = await oembedForUrl(url);
        videos.push({
            url,
            title: meta.title || "TikTok · @" + h,
            thumbnail: meta.thumbnail,
            isProfile: false
        });
    }

    const payload = { handle: h, videos };
    cache.set(cacheKey, { value: payload, expires: Date.now() + CACHE_MS });
    return payload;
}

function registerTiktokFeedApi(app) {
    const defaultHandle = String(process.env.TIKTOK_CHANNEL_HANDLE || "mcv_rust").replace(/^@/, "");

    app.get("/api/public/tiktok-latest", async (req, res) => {
        const handle = String(req.query.handle || defaultHandle)
            .replace(/^@/, "")
            .trim();
        const limit = req.query.limit;
        if (!handle) {
            return res.status(400).json({ error: "handle_required" });
        }
        try {
            const data = await fetchLatestVideos(handle, limit);
            return res.json(data);
        } catch (e) {
            console.error("tiktok-latest", e.message || e);
            return res.status(502).json({ error: "tiktok_feed_unavailable" });
        }
    });
}

module.exports = { registerTiktokFeedApi };
