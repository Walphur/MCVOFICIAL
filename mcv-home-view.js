/**
 * MCV 3.3 — Home identidad clan (reorganización visual, misma API /home)
 */
(function () {
    "use strict";

    var C = window.mcvCompeteCore;
    if (!C) return;

    function esc(s) {
        return C.esc(s);
    }

    function badge(variant, text) {
        if (typeof mcvBadge === "function") return mcvBadge(variant, text);
        return '<span class="mcv-badge">' + esc(text) + "</span>";
    }

    function fmtCountdown(iso) {
        if (!iso) return null;
        var ms = new Date(iso).getTime() - Date.now();
        if (ms <= 0) return "En curso";
        var hrs = Math.floor(ms / 3600000);
        var days = Math.floor(hrs / 24);
        if (days > 0) return days + "d " + (hrs % 24) + "h";
        return hrs + " h";
    }

    function renderKpis(data) {
        var members = document.getElementById("kpi-members");
        var tournaments = document.getElementById("kpi-tournaments");
        var wins = document.getElementById("kpi-wins");
        var online = document.getElementById("kpi-online");
        var stats = (data && data.stats) || {};
        var discord = (data && data.discord) || {};
        var clan = (data && data.clan) || {};

        if (members) {
            members.textContent = clan.active_count != null ? clan.active_count : discord.members != null ? discord.members : "—";
            members.setAttribute("data-count-target", members.textContent);
        }
        if (tournaments) {
            tournaments.textContent = stats.tournaments_finished != null ? stats.tournaments_finished : "—";
            tournaments.setAttribute("data-count-target", tournaments.textContent);
        }
        if (wins) {
            var w = stats.tournaments_finished != null ? stats.tournaments_finished : "—";
            wins.textContent = w;
            wins.setAttribute("data-count-target", wins.textContent);
        }
        if (online) {
            online.textContent = discord.online != null ? discord.online : "—";
            online.setAttribute("data-count-target", online.textContent);
        }
        if (typeof mcvAnimateCounters === "function") {
            mcvAnimateCounters(document.querySelector(".home-kpi-bar") || document);
        }
    }

    function renderNextTournament(events) {
        var section = document.getElementById("home-next-section");
        var el = document.getElementById("home-next-tournament");
        if (!el) return;

        var t = (events || []).find(function (e) {
            return e.status === "open" || e.status === "closed";
        });
        if (!t) {
            if (section) section.hidden = true;
            return;
        }

        if (section) section.hidden = false;
        var countdown = fmtCountdown(t.starts_at);
        var slots =
            t.accepted_count != null && t.max_teams != null
                ? t.accepted_count + "/" + t.max_teams + " equipos"
                : t.accepted_count != null
                  ? t.accepted_count + " equipos"
                  : "—";
        var href = t.href || "tournament.html?slug=" + encodeURIComponent(t.slug || "");
        var prize = t.prize_pool_text || "";

        el.innerHTML =
            '<article class="home-next-tournament__inner">' +
            '<div class="home-next-tournament__visual" aria-hidden="true"></div>' +
            '<div class="home-next-tournament__body">' +
            '<div class="home-next-tournament__meta">' +
            badge(t.status === "open" ? "open" : "muted", t.status === "open" ? "Inscripciones abiertas" : "Próximamente") +
            (countdown ? '<span class="home-countdown">' + esc(countdown) + "</span>" : "") +
            "</div>" +
            "<h2>" +
            esc(t.title || t.slug) +
            "</h2>" +
            '<dl class="home-next-tournament__facts">' +
            "<div><dt>Fecha</dt><dd>" +
            esc(C.fmtDateTime(t.starts_at)) +
            "</dd></div>" +
            "<div><dt>Equipos</dt><dd>" +
            esc(slots) +
            "</dd></div>" +
            (prize ? "<div><dt>Premio</dt><dd>" + esc(prize) + "</dd></div>" : "") +
            "</dl>" +
            '<a href="' +
            esc(href) +
            '#register" class="mcv-btn mcv-btn--primary mcv-btn--pulse">' +
            (t.status === "open" ? "Registrarse" : "Ver torneo") +
            "</a></div></article>";
    }

    function renderChampion(results) {
        var section = document.getElementById("home-champion-section");
        var el = document.getElementById("home-last-champion");
        if (!el) return;

        var r = (results || [])[0];
        if (!r) {
            if (section) section.hidden = true;
            return;
        }

        if (section) section.hidden = false;
        var winner = (r.winner && r.winner.name) || "—";
        var prize = (r.prize && r.prize.pool) || "—";
        var href = (r.links && r.links.results) || "results/?t=" + encodeURIComponent(r.slug || "");

        el.innerHTML =
            '<article class="home-champion-banner__inner">' +
            '<div class="home-champion-banner__visual" aria-hidden="true"></div>' +
            '<div class="home-champion-banner__body">' +
            badge("champion", "Campeón") +
            "<h2>" +
            esc(winner) +
            "</h2>" +
            '<p class="home-champion-banner__event">' +
            esc(r.title || r.slug) +
            " · " +
            esc(C.fmtDate(r.ended_at || r.starts_at)) +
            "</p>" +
            '<p class="home-champion-banner__prize">Prize: <strong>' +
            esc(prize) +
            "</strong></p>" +
            '<a href="' +
            esc(href) +
            '" class="mcv-btn mcv-btn--secondary">Ver torneo</a>' +
            "</div></article>";
    }

    function renderRoster(clan) {
        var el = document.getElementById("home-roster");
        if (!el) return;

        var list = ((clan && clan.preview) || []).slice(0, 6);
        if (!list.length) {
            el.innerHTML = '<p class="mcv-empty">Roster en equipo.html</p>';
            return;
        }

        el.innerHTML = list
            .map(function (m) {
                var av = m.avatar_url
                    ? '<img class="home-roster-card__avatar" src="' + esc(m.avatar_url) + '" alt="" width="64" height="64" loading="lazy">'
                    : '<div class="home-roster-card__avatar home-roster-card__avatar--fallback"><i data-lucide="user"></i></div>';
                var profile = m.steam_id64
                    ? '<a class="mcv-link home-roster-card__steam" href="player/?steamId=' +
                      encodeURIComponent(m.steam_id64) +
                      '">' +
                      esc(m.display_name || "Jugador") +
                      "</a>"
                    : esc(m.display_name || "Jugador");
                return (
                    '<article class="home-roster-card">' +
                    av +
                    '<div class="home-roster-card__info">' +
                    profile +
                    '<span class="home-roster-card__role">MCV</span>' +
                    (m.steam_id64
                        ? '<span class="home-roster-card__id">' + esc(m.steam_id64) + "</span>"
                        : "") +
                    "</div></article>"
                );
            })
            .join("");
    }

    function renderDiscord(discord) {
        var el = document.getElementById("home-discord-invite");
        if (!el) return;

        var d = discord || {};
        el.innerHTML =
            '<div class="home-discord-invite__inner">' +
            "<h2>Unite a la comunidad</h2>" +
            "<p>Torneos en vivo, avisos de wipe, roster y staff en un solo lugar.</p>" +
            '<ul class="home-discord-invite__list">' +
            "<li>Eventos y torneos en tiempo real</li>" +
            "<li>Comunidad activa de Rust</li>" +
            "<li>Acceso directo al staff MCV</li></ul>" +
            '<div class="home-discord-invite__status">' +
            badge(d.online != null ? "ok" : "muted", d.status_label || "Servidor activo") +
            (d.members != null ? '<span class="mcv-hint">' + esc(String(d.members)) + " miembros</span>" : "") +
            "</div>" +
            '<a href="https://discord.gg/mBRrUA8wH6" class="mcv-btn mcv-btn--primary mcv-btn--pulse home-discord-invite__cta" target="_blank" rel="noopener">Entrar al Discord</a>' +
            "</div>";
    }

    function icons() {
        if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
    }

    function renderHome(data) {
        if (!data) return;
        renderKpis(data);
        renderNextTournament(data.upcoming_events);
        renderChampion(data.recent_results);
        renderRoster(data.clan);
        renderDiscord(data.discord);
        icons();
    }

    C.fetchPublicHome()
        .then(renderHome)
        .catch(function () {
            var roster = document.getElementById("home-roster");
            if (roster) roster.innerHTML = '<p class="mcv-empty mcv-empty--error">No se pudo cargar la Home.</p>';
        });
})();
