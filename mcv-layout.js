/**
 * Shell MCV: skip link, navbar, footer, PWA, menú móvil.
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
    var assetV =
        typeof window.MCV_ASSET_V === "string" && window.MCV_ASSET_V
            ? window.MCV_ASSET_V
            : "2026-06-20-v6";

    var NAV_MAIN = [
        { id: "events", href: "events.html", i18n: "nav.compete", label: "Compete", also: ["tournament"] },
        { id: "team", href: "equipo/", i18n: "nav.clan", label: "Clan", also: ["teamForm"] },
        { id: "live", href: "live.html", i18n: "nav.live", label: "Live", live: true }
    ];

    var NAV_MORE = [
        { id: "bot", href: "bot.html", i18n: "nav.tracker", label: "Tracker" },
        { id: "tickets", href: "tickets.html", i18n: "nav.tickets", label: "Tickets" },
        { id: "cuenta", href: "cuenta.html", i18n: "nav.account", label: "Mi cuenta" },
        { id: "vital-rust", href: "vital-rust.html", i18n: "nav.stats", label: "Stats Vital" }
    ];

    function itemIsActive(item) {
        if (item.id === page) return true;
        if (item.also && item.also.indexOf(page) !== -1) return true;
        return false;
    }

    function moreNavIsActive() {
        for (var i = 0; i < NAV_MORE.length; i++) {
            if (itemIsActive(NAV_MORE[i])) return true;
        }
        return false;
    }

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
            document.querySelector(".events-hero") ||
            document.querySelector(".tournament-hero") ||
            document.querySelector(".equipo-hero");
        if (main && !main.id) main.id = "mcv-main";
    }

    function ensureManifest() {
        if (document.querySelector('link[rel="manifest"]')) return;
        var link = document.createElement("link");
        link.rel = "manifest";
        link.href = base + "manifest.webmanifest";
        document.head.appendChild(link);
    }

    function navLinkHtml(item) {
        var cls = itemIsActive(item) ? "active" : "";
        if (item.live) cls = (cls ? cls + " " : "") + "live-link";
        var inner = item.live
            ? '<span class="live-dot pulse-red"></span><span data-i18n="' +
              item.i18n +
              '">' +
              (item.label || "Live") +
              "</span>"
            : '<span data-i18n="' + item.i18n + '">' + (item.label || "") + "</span>";
        return (
            '<li><a href="' +
            base +
            item.href +
            '" class="' +
            cls +
            '">' +
            inner +
            "</a></li>"
        );
    }

    function navbarHtml() {
        var links = "";
        var i;
        for (i = 0; i < NAV_MAIN.length; i++) {
            links += navLinkHtml(NAV_MAIN[i]);
        }
        var moreActive = moreNavIsActive() ? " active" : "";
        var moreItems = "";
        for (i = 0; i < NAV_MORE.length; i++) {
            var m = NAV_MORE[i];
            var mcls = itemIsActive(m) ? "active" : "";
            moreItems +=
                '<li><a href="' +
                base +
                m.href +
                '" class="' +
                mcls +
                '"><span data-i18n="' +
                m.i18n +
                '">' +
                (m.label || "") +
                "</span></a></li>";
        }
        links +=
            '<li class="nav-more' +
            (moreNavIsActive() ? " is-active-more" : "") +
            '">' +
            '<button type="button" class="nav-more-toggle' +
            moreActive +
            '" aria-expanded="false" aria-haspopup="true" data-i18n="nav.more">' +
            '<span data-i18n="nav.more">Más</span>' +
            '<svg class="nav-more-chevron" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>' +
            "</button>" +
            '<ul class="nav-more-menu" role="menu">' +
            '<li class="nav-more-label" data-i18n="nav.moreLabel">// Más opciones</li>' +
            moreItems +
            "</ul></li>";
        return (
            '<a href="' +
            base +
            'index.html" class="logo-link">' +
            '<img src="' +
            base +
            'logo.png" alt="MCV Logo" class="navbar-logo">' +
            '<div class="logo-text">MCV <span>OFICIAL</span></div>' +
            "</a>" +
            '<ul class="nav-links" id="mcv-nav-panel">' +
            links +
            "</ul>"
        );
    }

    function initMoreNav(nav) {
        var more = nav && nav.querySelector(".nav-more");
        if (!more) return;
        var toggle = more.querySelector(".nav-more-toggle");
        var menu = more.querySelector(".nav-more-menu");
        if (!toggle || !menu) return;

        function closeMore() {
            more.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
        }

        function openMore() {
            more.classList.add("is-open");
            toggle.setAttribute("aria-expanded", "true");
        }

        toggle.addEventListener("click", function (e) {
            e.stopPropagation();
            if (more.classList.contains("is-open")) closeMore();
            else openMore();
        });

        menu.querySelectorAll("a").forEach(function (a) {
            a.addEventListener("click", function () {
                closeMore();
            });
        });

        document.addEventListener("click", function (e) {
            if (!more.contains(e.target)) closeMore();
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") closeMore();
        });
    }

    function initMobileNav(nav) {
        if (!nav || nav.querySelector(".nav-toggle")) return;
        var links = nav.querySelector(".nav-links");
        if (!links) return;

        var backdrop = document.querySelector(".nav-backdrop");
        if (!backdrop) {
            backdrop = document.createElement("div");
            backdrop.className = "nav-backdrop";
            backdrop.hidden = true;
            document.body.appendChild(backdrop);
        }

        function closeNav() {
            nav.classList.remove("is-open");
            btn.setAttribute("aria-expanded", "false");
            document.body.classList.remove("nav-menu-open");
            backdrop.hidden = true;
        }

        function openNav() {
            nav.classList.add("is-open");
            btn.setAttribute("aria-expanded", "true");
            document.body.classList.add("nav-menu-open");
            backdrop.hidden = false;
        }

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nav-toggle";
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-controls", "mcv-nav-panel");
        btn.setAttribute("aria-label", "Abrir menú");
        btn.innerHTML = '<span class="nav-toggle-icon" aria-hidden="true"></span>';
        nav.insertBefore(btn, links);

        btn.addEventListener("click", function () {
            if (nav.classList.contains("is-open")) closeNav();
            else openNav();
        });
        backdrop.addEventListener("click", closeNav);
        links.querySelectorAll("a").forEach(function (a) {
            a.addEventListener("click", closeNav);
        });
        var moreToggle = nav.querySelector(".nav-more-toggle");
        if (moreToggle) {
            moreToggle.addEventListener("click", function (e) {
                e.stopPropagation();
            });
        }
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && nav.classList.contains("is-open")) closeNav();
        });
    }

    function ensureNavbar() {
        var nav =
            document.querySelector("nav.navbar[data-mcv-shell-nav]") ||
            document.querySelector("nav.navbar");
        if (!nav) return;
        nav.setAttribute("data-mcv-shell-nav", "");
        nav.innerHTML = navbarHtml();
        nav.setAttribute("data-mcv-nav-filled", "1");
        initMobileNav(nav);
        initMoreNav(nav);
    }

    var WALTECH_WA_URL = "https://wa.me/5492665031950";
    var WALTECH_WA_LABEL = "+54 9 2665031950";
    var WALTECH_DISCORD_URL = "https://discord.com/users/289856301503348736";

    function footerWaltechHtml() {
        return (
            '<div class="footer-waltech">' +
            '<p class="footer-waltech-brand">' +
            '<span class="footer-waltech-label" data-i18n="footer.designedBy">Diseñado por</span> ' +
            '<img src="' +
            base +
            'waltech-logo.svg" alt="Waltech" class="footer-waltech-logo" width="118" height="28" loading="lazy" decoding="async">' +
            "</p>" +
            '<p class="footer-waltech-contact">' +
            '<a href="' +
            WALTECH_WA_URL +
            '" class="footer-waltech-link" target="_blank" rel="noopener noreferrer">' +
            '<svg class="footer-waltech-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
            "<span>" +
            WALTECH_WA_LABEL +
            "</span></a>" +
            '<span class="footer-waltech-sep" aria-hidden="true">·</span>' +
            '<a href="' +
            WALTECH_DISCORD_URL +
            '" class="footer-waltech-link" target="_blank" rel="noopener noreferrer">' +
            '<svg class="footer-waltech-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 4.7A17.2 17.2 0 0 0 15.9 3a12.1 12.1 0 0 0-.6 1.2 15.9 15.9 0 0 0-4.6 0A11.6 11.6 0 0 0 10.1 3 17.1 17.1 0 0 0 5.7 4.7 18.2 18.2 0 0 0 2 16.1a17.3 17.3 0 0 0 5.3 2.7 12.7 12.7 0 0 0 1.1-1.8 11.2 11.2 0 0 1-1.7-.8l.4-.3a12.4 12.4 0 0 0 10.6 0l.4.3a10.8 10.8 0 0 1-1.7.8c.3.7.7 1.3 1.1 1.8A17.2 17.2 0 0 0 22 16.1 18.1 18.1 0 0 0 20.3 4.7zM8.7 13.6c-.9 0-1.7-.8-1.7-1.8s.7-1.8 1.7-1.8 1.7.8 1.7 1.8-.8 1.8-1.7 1.8zm6.6 0c-.9 0-1.7-.8-1.7-1.8s.7-1.8 1.7-1.8 1.7.8 1.7 1.8-.8 1.8-1.7 1.8z"/></svg>' +
            '<span data-i18n="footer.waltechDiscord">Discord</span></a>' +
            "</p>" +
            "</div>"
        );
    }

    function footerPulseHtml() {
        return (
            '<div class="footer-pulse" aria-label="Estado MCV">' +
            '<div class="footer-pulse-item">' +
            '<span class="footer-pulse-label" data-i18n="footer.lastTournament">Último torneo</span>' +
            '<span class="footer-pulse-value" id="footer-last-tournament">—</span>' +
            "</div>" +
            '<div class="footer-pulse-item">' +
            '<span class="footer-pulse-label" data-i18n="footer.discordMembers">Miembros Discord</span>' +
            '<span class="footer-pulse-value" id="footer-discord-members">—</span>' +
            "</div>" +
            '<div class="footer-pulse-item">' +
            '<span class="footer-pulse-label" data-i18n="footer.serverStatus">Estado servidor</span>' +
            '<span class="footer-pulse-value" id="footer-server-status">—</span>' +
            "</div>" +
            "</div>"
        );
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
            'events.html"><span data-i18n="nav.compete">Compete</span></a>' +
            '<a href="' +
            base +
            'equipo/"><span data-i18n="nav.clan">Clan</span></a>' +
            '<a href="' +
            base +
            'live.html"><span data-i18n="nav.live">Live</span></a>' +
            '<a href="' +
            base +
            'bot.html"><span data-i18n="nav.tracker">Tracker</span></a>' +
            '<a href="' +
            base +
            'tickets.html"><span data-i18n="nav.tickets">Tickets</span></a>' +
            "</div>" +
            "<div>" +
            '<span class="link-title" data-i18n="footer.socialTitle">// Redes</span>' +
            '<a href="https://discord.gg/mBRrUA8wH6" target="_blank" rel="noopener noreferrer">Discord</a>' +
            '<a href="https://www.twitch.tv/mcvteam" target="_blank" rel="noopener noreferrer">Twitch</a>' +
            '<a href="https://www.youtube.com/@McompanyV" target="_blank" rel="noopener noreferrer">YouTube</a>' +
            '<a href="https://www.tiktok.com/@mcv_rust" target="_blank" rel="noopener noreferrer">TikTok</a>' +
            "</div>" +
            "</div>" +
            "</div>" +
            footerPulseHtml() +
            footerWaltechHtml() +
            '<div class="footer-bottom">' +
            '<span data-i18n="footer.copy">© 2026 MCV Clan. Todos los derechos reservados.</span>' +
            '<span data-i18n="footer.disclaimer">No afiliado a Facepunch Studios</span>' +
            "</div>"
        );
    }

    function relocateFooterPulse(footer) {
        if (!footer) return;
        var content = footer.querySelector(".footer-content");
        var pulse = footer.querySelector(".footer-pulse");
        if (!pulse || !content || !content.contains(pulse)) return;
        content.after(pulse);
    }

    function injectFooterPulse(footer) {
        if (!footer) return;
        relocateFooterPulse(footer);
        if (footer.querySelector(".footer-pulse")) return;
        var pulse = document.createElement("div");
        pulse.innerHTML = footerPulseHtml();
        var node = pulse.firstElementChild;
        var content = footer.querySelector(".footer-content");
        var bottom = footer.querySelector(".footer-bottom");
        if (content) content.after(node);
        else if (bottom) footer.insertBefore(node, bottom);
        else footer.appendChild(node);
    }

    function injectWaltechCredit(footer) {
        if (!footer || footer.querySelector(".footer-waltech")) return;
        var wrap = document.createElement("div");
        wrap.innerHTML = footerWaltechHtml();
        var node = wrap.firstElementChild;
        var bottom = footer.querySelector(".footer-bottom");
        if (bottom) footer.insertBefore(node, bottom);
        else footer.appendChild(node);
    }

    function ensureFooter() {
        var existing = document.querySelector("footer.footer");
        if (existing) {
            if (existing.querySelector(".footer-content")) {
                injectFooterPulse(existing);
                injectWaltechCredit(existing);
                return;
            }
            if (existing.classList.contains("footer-bottom--solo") || existing.querySelector(".footer-bottom")) {
                injectFooterPulse(existing);
                injectWaltechCredit(existing);
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
        window.addEventListener("load", function () {
            navigator.serviceWorker.register(base + "sw.js").catch(function () {});
        });
    }

    function ensureMdsAssets() {
        if (!document.querySelector("link[data-mcv-mds-tokens]")) {
            var tokens = document.createElement("link");
            tokens.rel = "stylesheet";
            tokens.href = base + "mds-tokens.css?v=" + assetV;
            tokens.setAttribute("data-mcv-mds-tokens", "1");
            document.head.appendChild(tokens);
        }
        if (!document.querySelector("link[data-mcv-mds-components]")) {
            var components = document.createElement("link");
            components.rel = "stylesheet";
            components.href = base + "mds-components.css?v=" + assetV;
            components.setAttribute("data-mcv-mds-components", "1");
            document.head.appendChild(components);
        }
        if (!document.querySelector("link[data-mcv-mds-premium]")) {
            var premium = document.createElement("link");
            premium.rel = "stylesheet";
            premium.href = base + "mds-premium.css?v=" + assetV;
            premium.setAttribute("data-mcv-mds-premium", "1");
            document.head.appendChild(premium);
        }
    }

    function ensureComponentsScript() {
        if (document.querySelector("script[data-mcv-components]")) return;
        var script = document.createElement("script");
        script.src = base + "mcv-components.js?v=" + assetV;
        script.defer = true;
        script.setAttribute("data-mcv-components", "1");
        document.body.appendChild(script);
    }

    function ensureUxAssets() {
        ensureMdsAssets();
        ensureComponentsScript();
        if (!document.querySelector("link[data-mcv-ux-css]")) {
            var link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = base + "style-ux.css?v=" + assetV;
            link.setAttribute("data-mcv-ux-css", "1");
            document.head.appendChild(link);
        }
        if (!document.querySelector("script[data-mcv-ux-js]")) {
            var script = document.createElement("script");
            script.src = base + "mcv-ui.js?v=" + assetV;
            script.defer = true;
            script.setAttribute("data-mcv-ux-js", "1");
            document.body.appendChild(script);
        }
    }

    function ensureIconsScript() {
        if (document.querySelector("script[data-mcv-icons]")) {
            if (typeof window.mcvPatchDiscordIcons === "function") {
                window.mcvPatchDiscordIcons();
            }
            return;
        }
        var script = document.createElement("script");
        script.src = base + "mcv-icons.js?v=" + assetV;
        script.defer = true;
        script.setAttribute("data-mcv-icons", "1");
        script.onload = function () {
            if (typeof window.mcvPatchDiscordIcons === "function") {
                window.mcvPatchDiscordIcons();
            }
        };
        document.body.appendChild(script);
    }

    function boot() {
        ensureSkipLink();
        ensureUxAssets();
        ensureManifest();
        ensureNavbar();
        ensureFooter();
        var footers = document.querySelectorAll("footer.footer");
        for (var fi = 0; fi < footers.length; fi++) {
            injectFooterPulse(footers[fi]);
            injectWaltechCredit(footers[fi]);
        }
        registerServiceWorker();
        if (typeof window.mcvI18n !== "undefined" && window.mcvI18n.apply) {
            window.mcvI18n.apply();
        }
        if (typeof lucide !== "undefined" && lucide.createIcons) {
            lucide.createIcons();
        }
        ensureIconsScript();
        setTimeout(function () {
            if (typeof window.mcvPatchDiscordIcons === "function") {
                window.mcvPatchDiscordIcons();
            }
        }, 50);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
