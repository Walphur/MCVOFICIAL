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

    function ytEmbedSrc(videoId) {
        return (
            "https://www.youtube-nocookie.com/embed/" +
            encodeURIComponent(videoId) +
            "?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=" +
            encodeURIComponent(videoId)
        );
    }

    function embedCard(platform, channelUrl, videoUrl, videoId, thumbUrl, opts) {
        opts = opts || {};
        var label = opts.label || (platform === "youtube" ? "YouTube" : "TikTok");
        var embedAs = opts.embedAs || platform;
        var cls =
            "media-embed-card " +
            (platform === "youtube" ? "media-embed-card--yt" : "media-embed-card--tt") +
            (opts.fallback ? " media-embed-card--fallback-vid" : "");
        var embedSrc = "";
        if (embedAs === "youtube" && videoId) {
            embedSrc = ytEmbedSrc(videoId);
        } else if (embedAs === "tiktok" && videoId) {
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
                esc(channelUrl) +
                '" target="_blank" rel="noopener noreferrer" class="media-embed-fallback-link">' +
                '<span>Ver en ' +
                esc(label) +
                "</span></a></div>";
        }
        return (
            '<article class="' +
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
            embedCard("tiktok", TT_CHANNEL, TT_CHANNEL, YT_FALLBACK_ID, "", {
                embedAs: "youtube",
                fallback: true
            })
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
        fetch(API + "/api/public/youtube-latest?limit=2&handle=McompanyV").then(function (r) {
            return r.ok ? r.json() : null;
        }),
        fetch(API + "/api/public/tiktok-latest?limit=2&handle=mcv_rust").then(function (r) {
            return r.ok ? r.json() : null;
        })
    ])
        .then(function (pair) {
            var yt = (pair[0] && pair[0].videos) || [];
            var tt = (pair[1] && pair[1].videos) || [];
            var html = "";
            var slots = 0;
            var ytUsed = 0;

            if (yt.length && slots < 2) {
                var yid = ytIdFromVideo(yt[0]);
                if (yid) {
                    html += embedCard("youtube", YT_CHANNEL, yt[0].url || YT_CHANNEL, yid, yt[0].thumbnail);
                    slots++;
                    ytUsed = 1;
                }
            } else if (slots < 2 && YT_FALLBACK_ID) {
                html += embedCard("youtube", YT_CHANNEL, YT_CHANNEL + "/videos", YT_FALLBACK_ID);
                slots++;
            }

            var tiktokOk = false;
            for (var i = 0; i < tt.length && slots < 2; i++) {
                var tv = tt[i];
                if (tv.isProfile) continue;
                var tid = ttIdFromUrl(tv.url);
                if (!tid) continue;
                html += embedCard("tiktok", TT_CHANNEL, tv.url || TT_CHANNEL, tid, tv.thumbnail, {
                    embedAs: "tiktok"
                });
                slots++;
                tiktokOk = true;
            }

            if (!tiktokOk && slots < 2) {
                var yv2 = yt[ytUsed] || yt[0];
                var yid2 = yv2 ? ytIdFromVideo(yv2) : YT_FALLBACK_ID;
                if (yid2) {
                    html += embedCard("tiktok", TT_CHANNEL, TT_CHANNEL, yid2, yv2 && yv2.thumbnail, {
                        embedAs: "youtube",
                        fallback: true
                    });
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
