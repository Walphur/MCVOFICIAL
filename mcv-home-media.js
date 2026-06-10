/**
 * Home MCV Media: últimos 2 videos con reproducción embebida (YT + TikTok)
 */
(function () {
    var grid = document.getElementById("home-media-grid");
    if (!grid) return;
    var API =
        typeof mcvResolveApiBase === "function"
            ? mcvResolveApiBase()
            : String(window.location.origin || "").replace(/\/$/, "");
    var YT_CHANNEL = "https://www.youtube.com/@McompanyV";
    var TT_CHANNEL = "https://www.tiktok.com/@mcv_rust";
    var YT_FALLBACK_ID = "NiYKPtGwhkM";

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function ytIdFromVideo(v) {
        if (!v) return "";
        if (v.id) return String(v.id);
        var m = String(v.url || "").match(/[?&]v=([^&]+)/);
        return m ? m[1] : "";
    }

    function ttIdFromUrl(url) {
        var m = String(url || "").match(/\/video\/(\d{10,25})/);
        return m ? m[1] : "";
    }

    function fetchJson(url) {
        return fetch(url).then(function (r) {
            if (!r.ok) return null;
            return r.json();
        });
    }

    function embedCard(platform, channelUrl, videoUrl, videoId, thumbUrl) {
        var cls = platform === "youtube" ? "media-embed-card--yt" : "media-embed-card--tt";
        var label = platform === "youtube" ? "YouTube" : "TikTok";
        var embedSrc = "";
        if (platform === "youtube" && videoId) {
            embedSrc =
                "https://www.youtube-nocookie.com/embed/" +
                encodeURIComponent(videoId) +
                "?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=" +
                encodeURIComponent(videoId);
        } else if (platform === "tiktok" && videoId) {
            embedSrc =
                "https://www.tiktok.com/embed/v2/" +
                encodeURIComponent(videoId) +
                "?autoplay=1&mute=1";
        }
        var frame = "";
        if (embedSrc) {
            frame =
                '<div class="media-embed-frame">' +
                '<iframe src="' +
                esc(embedSrc) +
                '" title="' +
                esc(label) +
                '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
                "</div>";
        } else if (thumbUrl) {
            frame =
                '<div class="media-embed-frame media-embed-frame--fallback">' +
                '<a href="' +
                esc(videoUrl || channelUrl) +
                '" target="_blank" rel="noopener noreferrer">' +
                '<img src="' +
                esc(thumbUrl) +
                '" alt="' +
                esc(label) +
                '"></a></div>';
        } else {
            frame =
                '<div class="media-embed-frame media-embed-frame--fallback">' +
                '<a href="' +
                esc(videoUrl || channelUrl) +
                '" target="_blank" rel="noopener noreferrer"><img src="banner.png" alt="MCV"></a></div>';
        }
        return (
            '<article class="media-embed-card ' +
            cls +
            '">' +
            frame +
            '<a class="media-embed-label" href="' +
            esc(channelUrl) +
            '" target="_blank" rel="noopener noreferrer">' +
            esc(label) +
            "</a></article>"
        );
    }

    function fallbackHtml() {
        return (
            embedCard("youtube", YT_CHANNEL, YT_CHANNEL + "/videos", YT_FALLBACK_ID) +
            embedCard("tiktok", TT_CHANNEL, TT_CHANNEL, "")
        );
    }

    function render(html) {
        grid.innerHTML = html;
        if (typeof mcvPatchDiscordIcons === "function") mcvPatchDiscordIcons();
    }

    if (!API) {
        render(fallbackHtml());
        return;
    }

    Promise.all([
        fetchJson(API + "/api/public/youtube-latest?limit=2&handle=McompanyV"),
        fetchJson(API + "/api/public/tiktok-latest?limit=2&handle=mcv_rust")
    ])
        .then(function (pair) {
            var ytPayload = pair[0];
            var ttPayload = pair[1];
            var yt = (ytPayload && ytPayload.videos) || [];
            var tt = (ttPayload && ttPayload.videos) || [];
            var html = "";
            var slots = 0;

            if (yt.length && slots < 2) {
                var yv = yt[0];
                var yid = ytIdFromVideo(yv);
                if (yid) {
                    html += embedCard(
                        "youtube",
                        YT_CHANNEL,
                        yv.url || YT_CHANNEL,
                        yid,
                        yv.thumbnail
                    );
                    slots++;
                }
            } else if (slots < 2 && YT_FALLBACK_ID) {
                html += embedCard("youtube", YT_CHANNEL, YT_CHANNEL + "/videos", YT_FALLBACK_ID);
                slots++;
            }

            for (var i = 0; i < tt.length && slots < 2; i++) {
                var tv = tt[i];
                if (tv.isProfile) continue;
                var tid = ttIdFromUrl(tv.url);
                if (!tid) continue;
                html += embedCard("tiktok", TT_CHANNEL, tv.url || TT_CHANNEL, tid, tv.thumbnail);
                slots++;
            }

            if (slots < 2 && yt.length > 1) {
                var yv2 = yt[1];
                var yid2 = ytIdFromVideo(yv2);
                if (yid2) {
                    html += embedCard("tiktok", TT_CHANNEL, TT_CHANNEL, yid2, yv2.thumbnail);
                    slots++;
                }
            }

            if (!html) html = fallbackHtml();
            render(html);
        })
        .catch(function () {
            render(fallbackHtml());
        });
})();
