"use strict";

const axios = require("axios");

const CACHE_MS = 1000 * 60 * 30;
const cache = new Map();

function parseXmlTag(block, tag) {
    const re = new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">", "i");
    const m = block.match(re);
    if (!m) return "";
    return m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .trim();
}

function parseRssEntries(xml, limit) {
    const items = [];
    const parts = String(xml || "").split(/<entry[\s>]/i);
    for (let i = 1; i < parts.length && items.length < limit; i++) {
        const block = parts[i];
        const videoId = parseXmlTag(block, "yt:videoId") || parseXmlTag(block, "id").replace(/^.*:/, "");
        const title = parseXmlTag(block, "title");
        const published = parseXmlTag(block, "published");
        if (!videoId || !title) continue;
        items.push({
            id: videoId,
            title,
            published,
            url: "https://www.youtube.com/watch?v=" + encodeURIComponent(videoId),
            thumbnail: "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"
        });
    }
    return items;
}

async function resolveChannelId(handle) {
    const key = "ch:" + handle;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;

    const url = "https://www.youtube.com/@" + encodeURIComponent(handle.replace(/^@/, ""));
    const res = await axios.get(url, {
        timeout: 12000,
        headers: { "User-Agent": "MCV-Site/1.0 (+https://mcvoficial.com)" },
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });
    const html = String(res.data || "");
    let channelId = "";
    const m1 = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{20,})"/);
    if (m1) channelId = m1[1];
    if (!channelId) {
        const m2 = html.match(/"externalId":"(UC[a-zA-Z0-9_-]{20,})"/);
        if (m2) channelId = m2[1];
    }
    if (!channelId) {
        const m3 = html.match(/channel_id=(UC[a-zA-Z0-9_-]{20,})/);
        if (m3) channelId = m3[1];
    }
    cache.set(key, { value: channelId, expires: Date.now() + CACHE_MS });
    return channelId;
}

async function fetchLatestVideos(handle, limit) {
    const lim = Math.min(Math.max(Number(limit) || 3, 1), 6);
    const cacheKey = "vid:" + handle + ":" + lim;
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.value;

    const channelId = await resolveChannelId(handle);
    if (!channelId) {
        throw new Error("channel_not_found");
    }
    const feedUrl =
        "https://www.youtube.com/feeds/videos.xml?channel_id=" + encodeURIComponent(channelId);
    const res = await axios.get(feedUrl, {
        timeout: 12000,
        headers: { "User-Agent": "MCV-Site/1.0 (+https://mcvoficial.com)" }
    });
    const videos = parseRssEntries(res.data, lim);
    const payload = { channelId, handle: handle.replace(/^@/, ""), videos };
    cache.set(cacheKey, { value: payload, expires: Date.now() + CACHE_MS });
    return payload;
}

function registerYoutubeFeedApi(app) {
    const defaultHandle = String(process.env.YOUTUBE_CHANNEL_HANDLE || "McompanyV").replace(/^@/, "");

    app.get("/api/public/youtube-latest", async (req, res) => {
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
            console.error("youtube-latest", e.message || e);
            return res.status(502).json({ error: "youtube_feed_unavailable" });
        }
    });
}

module.exports = { registerYoutubeFeedApi };
