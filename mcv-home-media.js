/**
 * Home MCV Media: 1 YouTube (último) + 2 TikTok
 */
(function () {
    var grid = document.getElementById("home-media-grid");
    if (!grid) return;
    var API =
        typeof mcvResolveApiBase === "function"
            ? mcvResolveApiBase()
            : String(window.location.origin || "").replace(/\/$/, "");
    var T = typeof mcvT === "function" ? mcvT : function (k) {
        return k;
    };
    var ttSub = T("home.tiktokSub");

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function ytCard(v) {
        return (
            '<a href="' +
            esc(v.url) +
            '" target="_blank" rel="noopener noreferrer" class="video-card video-card--yt">' +
            '<div class="video-thumb"><img src="' +
            esc(v.thumbnail) +
            '" alt="" loading="lazy" referrerpolicy="no-referrer">' +
            '<span class="video-duration">YT</span><div class="play-btn"><i data-lucide="play"></i></div></div>' +
            '<div class="video-info"><h4>' +
            esc(v.title) +
            '</h4><span>YouTube · @McompanyV</span></div></a>'
        );
    }

    function ttCard(v) {
        var thumb = v.thumbnail
            ? '<img src="' + esc(v.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
            : '<img src="logo.png" alt="MCV" class="logo-fallback">';
        var thumbClass = v.thumbnail ? "" : " logo-thumb alt-thumb";
        return (
            '<a href="' +
            esc(v.url) +
            '" target="_blank" rel="noopener noreferrer" class="video-card video-card--tt">' +
            '<div class="video-thumb' +
            thumbClass +
            '">' +
            thumb +
            '<span class="video-duration">TT</span><div class="play-btn"><i data-lucide="video"></i></div></div>' +
            '<div class="video-info"><h4>' +
            esc(v.title || T("home.tiktokTitle")) +
            '</h4><span>' +
            esc(ttSub) +
            "</span></div></a>"
        );
    }

    function fallbackHtml() {
        return (
            '<a href="https://www.youtube.com/@McompanyV/videos" target="_blank" rel="noopener noreferrer" class="video-card video-card--yt">' +
            '<div class="video-thumb"><img src="banner.png" alt="MCV"><span class="video-duration">YT</span><div class="play-btn"><i data-lucide="play"></i></div></div>' +
            '<div class="video-info"><h4>' +
            esc(T("home.video1Title")) +
            '</h4><span>YouTube · @McompanyV</span></div></a>' +
            ttCard({ url: "https://www.tiktok.com/@mcv_rust", title: T("home.video3Title"), thumbnail: "" }) +
            ttCard({ url: "https://www.tiktok.com/@mcv_rust", title: T("home.tiktokTitle2"), thumbnail: "" })
        );
    }

    function render(html) {
        grid.innerHTML = html;
        if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
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
            if (yt.length) html += ytCard(yt[0]);
            for (var i = 0; i < tt.length && i < 2; i++) html += ttCard(tt[i]);
            if (!html) html = fallbackHtml();
            render(html);
        })
        .catch(function () {
            render(fallbackHtml());
        });
})();
