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

    function embedCard(platform, channelUrl, videoUrl, videoId) {
        var cls = platform === "youtube" ? "media-embed-card--yt" : "media-embed-card--tt";
        var label = platform === "youtube" ? "YouTube" : "TikTok";
        var embedSrc = "";
        if (platform === "youtube" && videoId) {
            embedSrc =
                "https://www.youtube.com/embed/" +
                encodeURIComponent(videoId) +
                "?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1";
        } else if (platform === "tiktok" && videoId) {
            embedSrc = "https://www.tiktok.com/embed/v2/" + encodeURIComponent(videoId) + "?autoplay=1";
        }
        var frame = embedSrc
            ? '<div class="media-embed-frame">' +
              '<iframe src="' +
              esc(embedSrc) +
              '" title="' +
              esc(label) +
              '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
              "</div>"
            : '<div class="media-embed-frame media-embed-frame--fallback"><a href="' +
              esc(videoUrl || channelUrl) +
              '" target="_blank" rel="noopener noreferrer"><img src="banner.png" alt="MCV"></a></div>';
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
            embedCard("youtube", YT_CHANNEL, YT_CHANNEL + "/videos", "") +
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
        fetch(API + "/api/public/youtube-latest?limit=1&handle=McompanyV").then(function (r) {
            return r.json();
        }),
        fetch(API + "/api/public/tiktok-latest?limit=2&handle=mcv_rust").then(function (r) {
            return r.json();
        })
    ])
        .then(function (pair) {
            var yt = (pair[0] && pair[0].videos) || [];
            var tt = (pair[1] && pair[1].videos) || [];
            var html = "";
            var slots = 0;
            if (yt.length && slots < 2) {
                var yv = yt[0];
                var yid = ytIdFromVideo(yv);
                if (yid) {
                    html += embedCard("youtube", YT_CHANNEL, yv.url || YT_CHANNEL, yid);
                    slots++;
                }
            }
            for (var i = 0; i < tt.length && slots < 2; i++) {
                var tv = tt[i];
                if (tv.isProfile) continue;
                var tid = ttIdFromUrl(tv.url);
                if (!tid) continue;
                html += embedCard("tiktok", TT_CHANNEL, tv.url || TT_CHANNEL, tid);
                slots++;
            }
            if (!html) html = fallbackHtml();
            render(html);
        })
        .catch(function () {
            render(fallbackHtml());
        });
})();
