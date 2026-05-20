/**
 * Layout compartido: skip link, PWA, footer en páginas que no lo tienen.
 */
(function () {
    var page = (document.body && document.body.getAttribute("data-mcv-page")) || "";
    if (page === "admin" || page === "login") return;

    function basePath() {
        var p = String(location.pathname || "/").replace(/\\/g, "/");
        var depth = 0;
        if (/\/equipo\/solicitud\/?$/i.test(p) || p.indexOf("/equipo/solicitud/") !== -1) depth = 2;
        else if (/\/equipo\/?$/i.test(p) || p.indexOf("/equipo/") !== -1) depth = 1;
        if (depth === 0) return "";
        var out = "";
        for (var i = 0; i < depth; i++) out += "../";
        return out;
    }

    var base = basePath();

    function ensureSkipLink() {
        if (document.getElementById("mcv-skip-link")) return;
        var a = document.createElement("a");
        a.id = "mcv-skip-link";
        a.className = "mcv-skip-link";
        a.href = "#mcv-main";
        a.textContent = "Saltar al contenido";
        a.setAttribute("data-i18n", "layout.skipToContent");
        document.body.insertBefore(a, document.body.firstChild);
        var main =
            document.querySelector("main") ||
            document.querySelector(".home-hero") ||
            document.querySelector(".page-section") ||
            document.querySelector(".events-hero");
        if (main && !main.id) main.id = "mcv-main";
    }

    function ensureManifest() {
        if (document.querySelector('link[rel="manifest"]')) return;
        var link = document.createElement("link");
        link.rel = "manifest";
        link.href = base + "manifest.webmanifest";
        document.head.appendChild(link);
    }

    function footerFullHtml() {
        return (
            '<div class="footer-content">' +
            '<div class="footer-brand">' +
            '<img src="' +
            base +
            'logo.png" alt="MCV" class="footer-logo">' +
            '<h2>MCV <span>OFICIAL</span></h2>' +
            '<p data-i18n="footer.taglineP">Clan competitivo de Rust, host de eventos y comunidad conectada a Discord, streams y herramientas propias.</p>' +
            "</div>" +
            '<div class="footer-links">' +
            "<div>" +
            '<span class="link-title" data-i18n="footer.navTitle">// Navegación</span>' +
            '<a href="' +
            base +
            'index.html"><span data-i18n="nav.clan">Clan</span></a>' +
            '<a href="' +
            base +
            'events.html"><span data-i18n="nav.torneos">Torneos</span></a>' +
            '<a href="' +
            base +
            'equipo/"><span data-i18n="nav.team">Equipo</span></a>' +
            '<a href="' +
            base +
            'bot.html"><span data-i18n="nav.bot">Bot</span></a>' +
            '<a href="' +
            base +
            'tickets.html"><span data-i18n="nav.tickets">Tickets</span></a>' +
            '<a href="' +
            base +
            'live.html"><span data-i18n="nav.streams">Streams</span></a>' +
            "</div>" +
            "<div>" +
            '<span class="link-title" data-i18n="footer.socialTitle">// Redes</span>' +
            '<a href="https://discord.gg/mBRrUA8wH6" target="_blank" rel="noopener noreferrer">Discord</a>' +
            '<a href="https://www.twitch.tv/mcvteam" target="_blank" rel="noopener noreferrer">Twitch</a>' +
            '<a href="https://www.youtube.com/@McompanyV" target="_blank" rel="noopener noreferrer">YouTube</a>' +
            '<a href="https://www.tiktok.com/@mcv_rust" target="_blank" rel="noopener noreferrer">TikTok</a>' +
            "</div>" +
            "</div>" +
            '<div class="footer-bottom">' +
            '<span data-i18n="footer.copy">© 2026 MCV Clan. Todos los derechos reservados.</span>' +
            '<span data-i18n="footer.disclaimer">No afiliado a Facepunch Studios</span>' +
            '<a href="' +
            base +
            'login.html" class="footer-admin-link" data-i18n="footer.admin">Admin</a>' +
            "</div>"
        );
    }

    function ensureFooter() {
        var existing = document.querySelector("footer.footer");
        if (existing) {
            if (existing.querySelector(".footer-content") || existing.classList.contains("footer-bottom--solo")) {
                return;
            }
            existing.innerHTML = footerFullHtml();
            existing.setAttribute("data-mcv-footer-managed", "1");
            return;
        }
        var footer = document.createElement("footer");
        footer.className = "footer";
        footer.setAttribute("data-mcv-footer-managed", "1");
        footer.innerHTML = footerFullHtml();
        document.body.appendChild(footer);
    }

    function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return;
        var swUrl = base + "sw.js";
        window.addEventListener("load", function () {
            navigator.serviceWorker.register(swUrl).catch(function () {});
        });
    }

    function boot() {
        ensureSkipLink();
        ensureManifest();
        ensureFooter();
        registerServiceWorker();
        if (typeof window.mcvI18n !== "undefined" && window.mcvI18n.apply) {
            window.mcvI18n.apply();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
