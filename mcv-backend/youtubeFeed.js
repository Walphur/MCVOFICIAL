"use strict";

const axios = require("axios");

const CACHE_MS = 1000 * 60 * 30;
const BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const DEFAULT_CHANNEL_IDS = {
    McompanyV: "UCiUEjzYF6beN96f841IP9qg"
};
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
        const videoId =
            parseXmlTag(block, "yt:videoId") || parseXmlTag(block, "id").replace(/^.*:/, "");
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

function scrapeVideoIdsFromHtml(html, limit) {
    const ids = [];
    const re = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    let m;
    while ((m = re.exec(String(html || ""))) && ids.length < limit) {
        if (ids.indexOf(m[1]) === -1) ids.push(m[1]);
    }
    return ids;
}

async function resolveChannelId(handle) {
    const h = String(handle || "")
        .replace(/^@/, "")
        .trim();
    const envId = String(process.env.YOUTUBE_CHANNEL_ID || "").trim();
    if (envId && (!process.env.YOUTUBE_CHANNEL_HANDLE || process.env.YOUTUBE_CHANNEL_HANDLE.replace(/^@/, "") === h)) {
        return envId;
    }
    if (DEFAULT_CHANNEL_IDS[h]) return DEFAULT_CHANNEL_IDS[h];

    const key = "ch:" + h;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;

    const url = "https://www.youtube.com/@" + encodeURIComponent(h);
    const res = await axios.get(url, {
        timeout: 12000,
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });
    const html = String(res.data || "");
    let channelId = "";
    const patterns = [
        /"channelId":"(UC[a-zA-Z0-9_-]{20,})"/,
        /"externalId":"(UC[a-zA-Z0-9_-]{20,})"/,
        /channel_id=(UC[a-zA-Z0-9_-]{20,})/
    ];
    for (const re of patterns) {
        const m = html.match(re);
        if (m) {
            channelId = m[1];
            break;
        }
    }
    cache.set(key, { value: channelId, expires: Date.now() + CACHE_MS });
    return channelId;
}

async function fetchVideosFromRss(channelId, limit) {
    const feedUrl =
        "https://www.youtube.com/feeds/videos.xml?channel_id=" + encodeURIComponent(channelId);
    const res = await axios.get(feedUrl, {
        timeout: 12000,
        headers: { "User-Agent": BROWSER_UA, Accept: "application/atom+xml,text/xml" }
    });
    return parseRssEntries(res.data, limit);
}

async function scrapeVideosFromChannel(handle, limit) {
    const h = String(handle || "")
        .replace(/^@/, "")
        .trim();
    const url = "https://www.youtube.com/@" + encodeURIComponent(h) + "/videos";
    const res = await axios.get(url, {
        timeout: 14000,
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
    });
    const ids = scrapeVideoIdsFromHtml(res.data, limit);
    return ids.map((id) => ({
        id,
        title: "YouTube · @" + h,
        published: "",
        url: "https://www.youtube.com/watch?v=" + encodeURIComponent(id),
        thumbnail: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"
    }));
}

async function fetchLatestVideos(handle, limit) {
    const lim = Math.min(Math.max(Number(limit) || 3, 1), 6);
    const h = String(handle || "")
        .replace(/^@/, "")
        .trim();
    const cacheKey = "vid:" + h + ":" + lim;
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.value;

    const channelId = await resolveChannelId(h);
    if (!channelId) {
        throw new Error("channel_not_found");
    }

    let videos = [];
    try {
        videos = await fetchVideosFromRss(channelId, lim);
    } catch (e) {
        console.warn("youtube RSS failed, scraping /videos:", e.message || e);
    }
    if (!videos.length) {
        videos = await scrapeVideosFromChannel(h, lim);
    }
    if (!videos.length) {
        throw new Error("no_videos_found");
    }

    const payload = { channelId, handle: h, videos };
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
        const cacheKey = "vid:" + handle + ":" + Math.min(Math.max(Number(limit) || 3, 1), 6);
        try {
            const data = await fetchLatestVideos(handle, limit);
            return res.json(data);
        } catch (e) {
            console.error("youtube-latest", e.message || e);
            const stale = cache.get(cacheKey);
            if (stale && stale.value && stale.value.videos && stale.value.videos.length) {
                return res.json(stale.value);
            }
            return res.status(502).json({ error: "youtube_feed_unavailable" });
        }
    });
}

module.exports = { registerYoutubeFeedApi, fetchLatestVideos };
