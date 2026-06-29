/**
 * MCV 3.1 Sprint 2 — Home Hub (centro de actividad)
 */
(function () {
    "use strict";

    var C = window.mcvCompeteCore;
    var W = window.mcvHomeWidgets;
    if (!C || !W) return;

    var heroNow = document.getElementById("home-hero-now");
    var activityEl = document.getElementById("home-activity-feed");
    var upcomingEl = document.getElementById("home-upcoming-list");
    var resultsEl = document.getElementById("home-results-list");
    var playersEl = document.getElementById("home-top-players");
    var clanEl = document.getElementById("home-clan-widget");
    var discordEl = document.getElementById("home-discord-widget");

    function tournamentHref(slug) {
        return "tournament.html?slug=" + encodeURIComponent(slug || "");
    }

    function pickHeroState(forSite, tournaments, streamLive) {
        var open = tournaments.filter(function (t) {
            return t.status === "open";
        });
        var t;

        if (forSite.mode === "live" && forSite.tournament) {
            t = forSite.tournament;
            return {
                type: "live-tournament",
                badge: "Inscripciones abiertas",
                badgeVariant: "live",
                title: t.title || "Torneo en curso",
                meta: buildTournamentMeta(t),
                actions: [
                    { href: tournamentHref(t.slug), label: "Participar", variant: "primary" },
                    { href: "events.html", label: "Ver torneos", variant: "secondary" }
                ]
            };
        }

        if (streamLive && streamLive.any) {
            return {
                type: "stream",
                badge: "En vivo",
                badgeVariant: "live",
                title: "Stream activo — MCV Live",
                meta: "Kick o Twitch transmitiendo ahora",
                actions: [
                    { href: "live.html", label: "Ver stream", variant: "primary" },
                    { href: "https://discord.gg/mBRrUA8wH6", label: "Discord", variant: "secondary" }
                ]
            };
        }

        if (forSite.mode === "recap" && forSite.tournament) {
            t = forSite.tournament;
            var winner = t.winner_display_name || t.winner_team_name || "Campeón";
            return {
                type: "champion",
                badge: "Nuevo campeón",
                badgeVariant: "champion",
                title: winner + " ganó " + (t.title || "el último torneo"),
                meta: C.fmtDate(t.ended_at || t.starts_at),
                actions: [
                    { href: "results/?t=" + encodeURIComponent(t.slug || ""), label: "Ver resultado", variant: "primary" },
                    { href: tournamentHref(t.slug), label: "Detalle", variant: "secondary" }
                ]
            };
        }

        for (var i = 0; i < open.length; i++) {
            var hrs = C.hoursUntil(open[i].starts_at);
            if (hrs != null) {
                return {
                    type: "countdown",
                    badge: "Próximo torneo",
                    badgeVariant: "open",
                    title: "Match en " + hrs + " h — " + (open[i].title || open[i].slug),
                    meta: C.fmtDateTime(open[i].starts_at),
                    actions: [
                        { href: tournamentHref(open[i].slug), label: "Inscribirse", variant: "primary" },
                        { href: "calendar/", label: "Calendario", variant: "secondary" }
                    ]
                };
            }
        }

        if (open.length) {
            t = open[0];
            return {
                type: "registration",
                badge: "Inscripción abierta",
                badgeVariant: "open",
                title: t.title || "Torneo MCV",
                meta: buildTournamentMeta(t),
                actions: [
                    { href: tournamentHref(t.slug) + "#register", label: "Registrar team", variant: "primary" },
                    { href: "events.html", label: "Ver todos", variant: "secondary" }
                ]
            };
        }

        return { type: "idle" };
    }

    function buildTournamentMeta(t) {
        var parts = [];
        if (t.accepted_count != null) parts.push(t.accepted_count + " equipos");
        if (t.registration_closes_at) parts.push("Cierra " + C.fmtDateTime(t.registration_closes_at));
        return parts.join(" · ");
    }

    function renderHero(state) {
        if (heroNow) heroNow.innerHTML = W.now(state);
    }

    function buildActivityFeed(ctx) {
        var items = [];
        var i;
        var finished = ctx.finishedDetails || [];

        for (i = 0; i < Math.min(finished.length, 4); i++) {
            var t = finished[i];
            var winner = t.winner_display_name || t.winner_team_name;
            if (winner) {
                items.push({
                    icon: "🏆",
                    text: winner + " ganó " + (t.title || t.slug),
                    time: C.fmtDate(t.ended_at || t.starts_at),
                    ts: t.ended_at || t.starts_at
                });
            }
        }

        ctx.open.forEach(function (t) {
            items.push({
                icon: "📅",
                text: "Inscripciones abiertas — " + (t.title || t.slug),
                time: C.fmtDateTime(t.registration_closes_at || t.starts_at),
                ts: t.registration_closes_at || t.starts_at
            });
        });

        if (ctx.streamLive && ctx.streamLive.any) {
            items.unshift({
                icon: "🎥",
                text: "Stream en directo — MCV Live",
                time: "Ahora",
                ts: new Date().toISOString()
            });
        }

        (ctx.roster.members || []).slice(0, 2).forEach(function (m) {
            if (m.display_name) {
                items.push({
                    icon: "🎖",
                    text: m.display_name + " — roster MCV activo",
                    time: m.role_label || "Clan",
                    ts: null
                });
            }
        });

        items.push({
            icon: "🔥",
            text: "Nuevo wipe Vital — fechas en Discord",
            time: "Próximamente",
            placeholder: true,
            ts: null
        });

        items.sort(function (a, b) {
            var ta = a.ts ? new Date(a.ts).getTime() : 0;
            var tb = b.ts ? new Date(b.ts).getTime() : 0;
            return tb - ta;
        });

        return items.slice(0, 8);
    }

    function renderActivity(items) {
        if (!activityEl) return;
        if (!items.length) {
            activityEl.innerHTML = '<p class="mcv-empty">Sin actividad reciente.</p>';
            return;
        }
        activityEl.innerHTML = items.map(W.activity).join("");
    }

    function renderUpcoming(open) {
        if (!upcomingEl) return;
        var list = open.slice(0, 4).map(function (t) {
            return W.event({
                title: t.title,
                slug: t.slug,
                status: t.status,
                accepted_count: t.accepted_count,
                max_teams: t.max_teams,
                dateLabel: C.fmtDate(t.starts_at),
                timeLabel: t.starts_at ? C.fmtDateTime(t.starts_at).split(", ").pop() : "—",
                href: tournamentHref(t.slug),
                cta: t.status === "open" ? "Inscribirse" : "Ver torneo"
            });
        });
        upcomingEl.innerHTML = list.length ? list.join("") : '<p class="mcv-empty">No hay torneos próximos.</p>';
    }

    function renderResults(finished, details) {
        if (!resultsEl) return;
        var cards = [];
        for (var i = 0; i < Math.min(details.length, 4); i++) {
            var t = details[i];
            if (!t || t.status !== "finished") continue;
            cards.push(
                W.result({
                    title: t.title || t.slug,
                    winner: t.winner_display_name || t.winner_team_name || "—",
                    runnerUp: "—",
                    prize: t.prize_pool_text || "—",
                    mvp: "—",
                    href: "results/?t=" + encodeURIComponent(t.slug)
                })
            );
        }
        resultsEl.innerHTML = cards.length ? cards.join("") : '<p class="mcv-empty">Sin resultados recientes.</p>';
    }

    function buildTopPlayers(roster, details) {
        var rows = (roster.members || []).map(function (m, idx) {
            return {
                rank: idx + 1,
                name: m.display_name || "Jugador",
                avatar: m.avatar_url,
                steamId64: m.steam_id64,
                href: m.steam_id64 ? "player/?steamId=" + encodeURIComponent(m.steam_id64) : null,
                points: Math.max(10, 100 - idx * 12),
                wins: 0
            };
        });
        details.forEach(function (t) {
            if (!t || !t.winner_roster) return;
            var list = C.parseRosterJson(t.winner_roster);
            list.forEach(function (p) {
                var sid = String(p.steamId64 || p.steam_id64 || "").replace(/\D/g, "");
                rows.forEach(function (r) {
                    if (r.steamId64 === sid) {
                        r.wins = (r.wins || 0) + 1;
                        r.points = (r.points || 0) + 100;
                    }
                });
            });
        });
        rows.sort(function (a, b) {
            return (b.points || 0) - (a.points || 0);
        });
        return rows.slice(0, 5);
    }

    function renderTopPlayers(rows) {
        if (!playersEl) return;
        playersEl.innerHTML = rows.length ? rows.map(W.player).join("") : '<p class="mcv-empty">Sin datos de ranking.</p>';
    }

    function renderClan(roster, stats) {
        if (!clanEl) return;
        var count = stats && stats.teamRosterApproved != null ? stats.teamRosterApproved : (roster.members || []).length;
        var preview = (roster.members || [])
            .slice(0, 4)
            .map(function (m) {
                return '<span class="mcv-chip">' + W.esc(m.display_name || "?") + "</span>";
            })
            .join("");
        clanEl.innerHTML = W.team({
            activeCount: count,
            recruiting: false,
            preview: preview ? '<div class="mcv-widget-team__preview">' + preview + "</div>" : ""
        });
    }

    function renderDiscord(data, stats) {
        if (!discordEl) return;
        discordEl.innerHTML = W.discord({
            members: data && data.approximate_member_count,
            online: data && data.approximate_presence_count,
            statusLabel:
                data && data.approximate_presence_count != null
                    ? data.approximate_presence_count + " online"
                    : "Servidor activo"
        });
    }

    function renderStats(data, stats) {
        var dt = document.getElementById("discord-total");
        var don = document.getElementById("discord-online");
        var hc = document.getElementById("stat-hosted-count");
        if (data) {
            if (dt) {
                dt.textContent = data.approximate_member_count || "—";
                dt.setAttribute("data-count-target", dt.textContent);
            }
            if (don) {
                don.textContent = data.approximate_presence_count || "—";
                don.setAttribute("data-count-target", don.textContent);
            }
        }
        if (hc && stats) {
            var n = stats.tournamentsFinished;
            hc.textContent = n != null ? (n < 100 ? String(n).padStart(2, "0") : String(n)) : "—";
            hc.setAttribute("data-count-target", hc.textContent);
        }
        if (typeof mcvAnimateCounters === "function") {
            mcvAnimateCounters(document.querySelector(".home-snapshot") || document);
        }
    }

    function icons() {
        if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
    }

    /* Fase 1 — crítico: hero + stats */
    Promise.all([C.fetchForSite(), C.fetchDiscordCounts(), C.fetchTournamentStats(), C.fetchTournaments()])
        .then(function (res) {
            var forSite = res[0];
            var discord = res[1];
            var stats = res[2];
            var tournaments = res[3] || [];
            var open = tournaments.filter(function (t) {
                return t.status === "open" || t.status === "closed";
            });
            var finished = tournaments.filter(function (t) {
                return t.status === "finished";
            });

            renderHero(pickHeroState(forSite, tournaments, { any: false }));
            renderStats(discord, stats);
            icons();

            /* Fase 2 — torneos + feed + widgets secundarios */
            var detailPromises = finished.slice(0, 6).map(function (t) {
                return C.fetchTournamentDetail(t.slug);
            });

            return Promise.all([C.fetchTeamRoster(), Promise.all(detailPromises)]).then(function (r2) {
                var roster = r2[0];
                var details = r2[1].filter(Boolean);

                var openDetailPromises = open.slice(0, 3).map(function (t) {
                    return C.fetchTournamentDetail(t.slug);
                });
                return Promise.all(openDetailPromises).then(function (openDetails) {
                    var openEnriched = open.map(function (t, idx) {
                        if (idx < openDetails.length && openDetails[idx]) {
                            return Object.assign({}, t, openDetails[idx]);
                        }
                        return t;
                    });

                    var ctx = {
                        forSite: forSite,
                        open: open,
                        finished: finished,
                        finishedDetails: details,
                        roster: roster,
                        streamLive: { any: false }
                    };

                    renderActivity(buildActivityFeed(ctx));
                    renderUpcoming(openEnriched);
                    renderResults(finished, details);
                    renderTopPlayers(buildTopPlayers(roster, details));
                    renderClan(roster, stats);
                    renderDiscord(discord, stats);
                    icons();

                    /* Fase 3 — streams (deferred, puede actualizar hero) */
                    return C.checkStreamLive().then(function (streamLive) {
                        if (streamLive.any && forSite.mode !== "live") {
                            renderHero(pickHeroState(forSite, tournaments, streamLive));
                            var feed = buildActivityFeed(
                                Object.assign({}, ctx, { streamLive: streamLive })
                            );
                            renderActivity(feed);
                            icons();
                        }
                    });
                });
            });
        })
        .catch(function () {
            renderHero({ type: "idle" });
        });

    var searchBtn = document.getElementById("home-search-open");
    if (searchBtn) {
        searchBtn.addEventListener("click", function () {
            if (typeof window.mcvGlobalSearch !== "undefined" && window.mcvGlobalSearch.open) {
                window.mcvGlobalSearch.open();
            }
        });
    }
})();
