/**
 * MCV 3.1 — Perfil público de jugador
 */
(function () {
    "use strict";

    var C = window.mcvCompeteCore;
    if (!C) return;

    var esc = C.esc;
    var steamId = C.resolveSteamIdFromLocation();
    var gate = document.getElementById("player-gate");
    var heroCard = document.getElementById("player-hero-card");
    var app = document.getElementById("player-app");
    var loading = document.getElementById("player-loading");
    var errBox = document.getElementById("player-error");
    var searchForm = document.getElementById("player-search-form");
    var searchInput = document.getElementById("player-steam-input");

    var ACHIEVEMENT_DEFS = [
        { id: "champion", label: "Champion", variant: "champion", icon: "trophy" },
        { id: "mvp", label: "MVP", variant: "warn", icon: "star" },
        { id: "veteran", label: "Veterano", variant: "muted", icon: "shield" },
        { id: "raider", label: "Raider", variant: "danger", icon: "bomb" },
        { id: "fragger", label: "Top Fragger", variant: "live", icon: "crosshair" },
        { id: "support", label: "Support", variant: "safe", icon: "heart-handshake" },
        { id: "builder", label: "Builder", variant: "open", icon: "hammer" },
        { id: "mcv", label: "MCV Roster", variant: "ok", icon: "users" }
    ];

    function showLoading(on) {
        if (loading) loading.hidden = !on;
    }

    function showError(msg) {
        if (errBox) {
            errBox.textContent = msg || "No se pudo cargar el perfil.";
            errBox.hidden = !msg;
        }
    }

    function badgeHtml(variant, text) {
        if (typeof mcvBadge === "function") return mcvBadge(variant, text);
        return '<span class="mcv-badge">' + esc(text) + "</span>";
    }

    function navigateToSteam(id) {
        var url = "../player/?steamId=" + encodeURIComponent(id);
        if (history.replaceState) {
            history.replaceState(null, "", url);
        }
        steamId = id;
        loadProfile(id);
    }

    function deriveTournamentWins(finishedDetails, sid) {
        var wins = [];
        for (var i = 0; i < finishedDetails.length; i++) {
            var t = finishedDetails[i];
            if (!t || t.status !== "finished") continue;
            if (C.rosterHasSteam(t.winner_roster, sid)) {
                wins.push(t);
            }
        }
        return wins;
    }

    function buildAchievements(ctx) {
        var unlocked = {};
        var pub = ctx.public;
        if (pub && pub.achievements) {
            pub.achievements.forEach(function (a) {
                if (a.unlocked) unlocked[a.id] = true;
            });
        }
        if (ctx.rosterMember) unlocked.mcv = true;
        if (ctx.scout && Number(ctx.scout.kills) >= 500) unlocked.fragger = true;
        if (ctx.scout && Number(ctx.scout.kdr) >= 1.5 && Number(ctx.scout.kills) < 500) unlocked.support = true;
        if (ctx.scout && Number(ctx.scout.raidingDamage || 0) > 10000) unlocked.raider = true;
        if (ctx.rosterMember && ctx.rosterMember.role_label) unlocked.veteran = true;

        return ACHIEVEMENT_DEFS.map(function (a) {
            var on = !!unlocked[a.id];
            return (
                '<div class="mcv-achievement' +
                (on ? " mcv-achievement--unlocked" : " mcv-achievement--locked") +
                '" title="' +
                esc(a.label) +
                '">' +
                '<i data-lucide="' +
                esc(a.icon) +
                '"></i>' +
                badgeHtml(on ? a.variant : "muted", a.label) +
                "</div>"
            );
        }).join("");
    }

    function buildTimeline(ctx) {
        var items = [];
        var i;
        for (i = 0; i < ctx.wins.length; i++) {
            var w = ctx.wins[i];
            items.push({
                date: w.ended_at || w.starts_at,
                title: "Campeón — " + (w.title || w.slug),
                sub: w.winner_team_name || w.winner_display_name || "MCV",
                type: "trophy"
            });
        }
        if (ctx.rosterMember) {
            items.push({
                date: null,
                title: "Roster MCV — " + (ctx.rosterMember.role_label || "Miembro"),
                sub: "Lineup oficial del clan",
                type: "users"
            });
        }
        /* Placeholders preparados para API futura */
        items.push({
            date: null,
            title: "Historial de equipos",
            sub: "Próximamente — API de transfers",
            type: "shuffle",
            placeholder: true
        });

        if (!items.length) {
            return '<p class="mcv-empty">Sin eventos en el historial todavía.</p>';
        }

        return items
            .map(function (it) {
                return (
                    '<article class="mcv-timeline__item' +
                    (it.placeholder ? " mcv-timeline__item--placeholder" : "") +
                    '">' +
                    '<div class="mcv-timeline__dot"><i data-lucide="' +
                    esc(it.type || "circle") +
                    '"></i></div>' +
                    '<div class="mcv-timeline__body">' +
                    '<time class="mcv-timeline__date">' +
                    esc(it.date ? C.fmtDate(it.date) : "—") +
                    "</time>" +
                    "<strong>" +
                    esc(it.title) +
                    "</strong>" +
                    '<span class="mcv-timeline__sub">' +
                    esc(it.sub) +
                    "</span></div></article>"
                );
            })
            .join("");
    }

    function renderProfile(ctx) {
        var sid = ctx.steamId;
        var name =
            (ctx.rosterMember && ctx.rosterMember.display_name) ||
            (ctx.scout && ctx.scout.nombre) ||
            "Jugador";
        var avatarUrl =
            (ctx.rosterMember && ctx.rosterMember.avatar_url) ||
            (ctx.scout && ctx.scout.avatar) ||
            "";
        var hours = ctx.scout && ctx.scout.horas != null ? ctx.scout.horas : null;
        var kills = ctx.scout && ctx.scout.kills != null ? ctx.scout.kills : null;
        var deaths = ctx.scout && ctx.scout.deaths != null ? ctx.scout.deaths : null;
        var kdr = ctx.scout && ctx.scout.kdr != null ? ctx.scout.kdr : null;
        var raids = ctx.scout && ctx.scout.raidingDamage != null ? ctx.scout.raidingDamage : null;

        var pub = ctx.public;
        var stats = (pub && pub.stats) || {};
        var tournamentsPlayed = stats.tournaments_played != null ? stats.tournaments_played : ctx.wins.length;
        var tournamentsWon = stats.tournament_wins != null ? stats.tournament_wins : ctx.wins.length;
        var wins = tournamentsWon;
        var losses = tournamentsPlayed > wins ? tournamentsPlayed - wins : null;
        var winRate = stats.win_rate != null ? stats.win_rate + "%" : tournamentsPlayed > 0 ? Math.round((wins / tournamentsPlayed) * 100) + "%" : null;

        if (gate) gate.hidden = true;
        if (heroCard) heroCard.hidden = false;
        if (app) app.hidden = false;

        document.title = "MCV — " + name;

        var avEl = document.getElementById("player-avatar");
        if (avEl) {
            if (avatarUrl) {
                avEl.innerHTML =
                    '<img src="' + esc(avatarUrl) + '" alt="" width="120" height="120" loading="lazy">';
            } else {
                avEl.textContent = "?";
            }
        }

        var nameEl = document.getElementById("player-name");
        if (nameEl) nameEl.textContent = name;

        var steamLine = document.getElementById("player-steam-line");
        if (steamLine) {
            steamLine.innerHTML =
                '<a href="https://steamcommunity.com/profiles/' +
                esc(sid) +
                '" target="_blank" rel="noopener noreferrer">' +
                esc(sid) +
                "</a>";
        }

        var metaBadges = document.getElementById("player-meta-badges");
        if (metaBadges) {
            var parts = [];
            parts.push(badgeHtml(ctx.rosterMember ? "ok" : "muted", ctx.rosterMember ? "Activo · MCV" : "Externo"));
            if (ctx.rosterMember && ctx.rosterMember.role_label) {
                parts.push(badgeHtml("open", ctx.rosterMember.role_label));
            }
            if (hours != null) {
                parts.push(badgeHtml("muted", hours + " h Rust"));
            }
            /* País — placeholder */
            parts.push(badgeHtml("muted", "País: —"));
            metaBadges.innerHTML = parts.join("");
        }

        var kpi = document.getElementById("player-kpi");
        if (kpi) {
            var stats = [
                { label: "Torneos jugados", val: tournamentsPlayed || "—" },
                { label: "Torneos ganados", val: tournamentsWon || "—" },
                { label: "Victorias", val: wins != null ? wins : "—" },
                { label: "Derrotas", val: losses != null ? losses : "—" },
                { label: "Kills", val: kills != null ? C.fmtNum(kills) : "—" },
                { label: "Deaths", val: deaths != null ? C.fmtNum(deaths) : "—" },
                { label: "K/D", val: kdr != null ? kdr : "—" },
                { label: "Raids", val: raids != null ? C.fmtNum(raids) : "—" },
                { label: "Win Rate", val: winRate || "—" }
            ];
            kpi.innerHTML = stats
                .map(function (s) {
                    return (
                        '<div class="mcv-stat mcv-stat--compact">' +
                        '<span class="mcv-stat__label">' +
                        esc(s.label) +
                        "</span>" +
                        '<strong class="mcv-stat__value">' +
                        esc(String(s.val)) +
                        "</strong></div>"
                    );
                })
                .join("");
        }

        var ach = document.getElementById("player-achievements");
        if (ach) ach.innerHTML = buildAchievements(ctx);

        var teams = document.getElementById("player-teams");
        if (teams) {
            var teamItems = [];
            if (ctx.rosterMember) {
                teamItems.push(
                    '<li class="mcv-list__item"><div class="mcv-list__main"><strong>MCV Clan</strong><span class="mcv-list__sub">' +
                        esc(ctx.rosterMember.role_label || "Roster") +
                        '</span></div><a class="mcv-link" href="../equipo/">Ver lineup</a></li>'
                );
            }
            for (i = 0; i < ctx.wins.length; i++) {
                var tw = ctx.wins[i];
                teamItems.push(
                    '<li class="mcv-list__item"><div class="mcv-list__main"><strong>' +
                        esc(tw.winner_team_name || "Equipo campeón") +
                        '</strong><span class="mcv-list__sub">' +
                        esc(tw.title || tw.slug) +
                        '</span></div><a class="mcv-link" href="../tournament.html?slug=' +
                        encodeURIComponent(tw.slug) +
                        '">Torneo</a></li>'
                );
            }
            if (!teamItems.length) {
                teams.innerHTML = '<p class="mcv-empty">Sin equipos registrados públicamente.</p>';
            } else {
                teams.innerHTML = teamItems.join("");
            }
        }

        var timeline = document.getElementById("player-timeline");
        if (timeline) timeline.innerHTML = buildTimeline(ctx);

        var activity = document.getElementById("player-activity");
        if (activity) {
            var act = (pub && pub.activity ? pub.activity : []).slice(0, 5).map(function (a) {
                var href = a.href ? a.href.replace(/^\//, "../") : "#";
                return (
                    '<li class="mcv-list__item"><div class="mcv-list__main"><strong>' +
                    esc(a.text || "Actividad") +
                    '</strong><span class="mcv-list__sub">' +
                    esc(a.at ? C.fmtDate(a.at) : "Reciente") +
                    '</span></div>' +
                    (a.href ? '<a class="mcv-link" href="' + esc(href) + '">Ver</a>' : "") +
                    "</li>"
                );
            });
            if (!act.length) {
                act.push(
                    '<li class="mcv-list__item"><div class="mcv-list__main"><strong>Sin actividad reciente</strong><span class="mcv-list__sub">Participá en torneos MCV</span></div></li>'
                );
            }
            activity.innerHTML = act.join("");
        }

        if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
    }

    function loadProfile(id) {
        if (!C.isSteamId64(id)) {
            showError("SteamID64 inválido.");
            return;
        }
        showError("");
        showLoading(true);
        if (gate) gate.hidden = true;

        Promise.all([C.fetchPublicPlayer(id), C.fetchPlayerScout(id)])
            .then(function (res) {
                var pub = res[0];
                var scout = res[1];
                if (!pub) {
                    throw new Error("not_found");
                }
                var profile = pub.profile || {};
                var rosterMember = profile.is_roster
                    ? {
                          display_name: profile.display_name,
                          role_label: profile.role_label,
                          avatar_url: profile.avatar_url,
                          steam_id64: profile.steam_id64
                      }
                    : null;
                var wins = (pub.history || [])
                    .filter(function (h) {
                        return h.type === "tournament_win";
                    })
                    .map(function (h) {
                        return { slug: h.slug, title: h.title, ended_at: h.at, winner_team_name: h.title };
                    });
                return {
                    steamId: id,
                    public: pub,
                    rosterMember: rosterMember,
                    scout: scout,
                    wins: wins
                };
            })
            .then(function (ctx) {
                showLoading(false);
                if (!ctx.scout && !ctx.rosterMember && !ctx.wins.length && !(ctx.public && ctx.public.profile)) {
                    showError("No hay datos públicos para este SteamID.");
                    if (gate) gate.hidden = false;
                    if (heroCard) heroCard.hidden = true;
                    if (app) app.hidden = true;
                    return;
                }
                renderProfile(ctx);
            })
            .catch(function () {
                showLoading(false);
                showError("Error de red al cargar el perfil.");
                if (gate) gate.hidden = false;
            });
    }

    if (searchForm) {
        searchForm.addEventListener("submit", function (e) {
            e.preventDefault();
            var val = searchInput && searchInput.value ? searchInput.value.trim() : "";
            var match = val.match(/7656119\d{10}/);
            if (match) navigateToSteam(match[0]);
            else showError("Ingresá un SteamID64 válido.");
        });
    }

    if (steamId) {
        if (searchInput) searchInput.value = steamId;
        loadProfile(steamId);
    }
})();
