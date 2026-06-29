/**
 * MCV 3.2 — Home Hub (una sola llamada /api/public/v1/home)
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

    function mapHero(h) {
        if (!h || h.type === "idle") return { type: "idle" };
        return {
            type: h.type,
            badge: h.badge,
            badgeVariant: h.badge_variant,
            title: h.title,
            meta: h.meta ? (String(h.meta).indexOf("T") !== -1 ? C.fmtDateTime(h.meta) : h.meta) : "",
            actions: h.actions
        };
    }

    function renderHero(state) {
        if (heroNow) heroNow.innerHTML = W.now(state);
    }

    function renderActivity(items) {
        if (!activityEl) return;
        if (!items || !items.length) {
            activityEl.innerHTML = '<p class="mcv-empty">Sin actividad reciente.</p>';
            return;
        }
        activityEl.innerHTML = items
            .map(function (a) {
                return W.activity({
                    icon: a.icon,
                    text: a.text,
                    time: a.at ? C.fmtDateTime(a.at) : a.placeholder ? "Próximamente" : "",
                    placeholder: a.placeholder
                });
            })
            .join("");
    }

    function renderUpcoming(events) {
        if (!upcomingEl) return;
        var list = (events || []).map(function (t) {
            return W.event({
                title: t.title,
                slug: t.slug,
                status: t.status,
                accepted_count: t.accepted_count,
                max_teams: t.max_teams,
                dateLabel: C.fmtDate(t.starts_at),
                timeLabel: t.starts_at ? C.fmtDateTime(t.starts_at).split(", ").pop() : "—",
                href: t.href || "events.html",
                cta: t.cta || "Ver torneo"
            });
        });
        upcomingEl.innerHTML = list.length ? list.join("") : '<p class="mcv-empty">No hay torneos próximos.</p>';
    }

    function renderResults(results) {
        if (!resultsEl) return;
        var cards = (results || []).map(function (r) {
            return W.result({
                title: r.title,
                winner: (r.winner && r.winner.name) || "—",
                runnerUp: (r.runner_up && r.runner_up.name) || "—",
                prize: (r.prize && r.prize.pool) || "—",
                mvp: (r.mvp && r.mvp.name) || "—",
                href: (r.links && r.links.results) || "results/"
            });
        });
        resultsEl.innerHTML = cards.length ? cards.join("") : '<p class="mcv-empty">Sin resultados recientes.</p>';
    }

    function renderTopPlayers(rows) {
        if (!playersEl) return;
        playersEl.innerHTML = (rows || []).length
            ? rows
                  .map(function (p) {
                      return W.player({
                          rank: p.rank,
                          name: p.name,
                          avatar: p.avatar_url,
                          href: p.href,
                          points: p.points
                      });
                  })
                  .join("")
            : '<p class="mcv-empty">Sin datos de ranking.</p>';
    }

    function renderClan(team) {
        if (!clanEl || !team) return;
        var preview = (team.preview || [])
            .map(function (m) {
                return '<span class="mcv-chip">' + W.esc(m.display_name || "?") + "</span>";
            })
            .join("");
        clanEl.innerHTML = W.team({
            activeCount: team.active_count,
            recruiting: team.recruiting,
            preview: preview ? '<div class="mcv-widget-team__preview">' + preview + "</div>" : ""
        });
    }

    function renderDiscord(data) {
        if (!discordEl) return;
        discordEl.innerHTML = W.discord({
            members: data && data.members,
            online: data && data.online,
            statusLabel: (data && data.status_label) || "Servidor activo"
        });
    }

    function renderStats(data, stats) {
        var dt = document.getElementById("discord-total");
        var don = document.getElementById("discord-online");
        var hc = document.getElementById("stat-hosted-count");
        if (data) {
            if (dt) {
                dt.textContent = data.members != null ? data.members : "—";
                dt.setAttribute("data-count-target", dt.textContent);
            }
            if (don) {
                don.textContent = data.online != null ? data.online : "—";
                don.setAttribute("data-count-target", don.textContent);
            }
        }
        if (hc && stats) {
            var n = stats.tournaments_finished;
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

    function renderHome(data) {
        if (!data) {
            renderHero({ type: "idle" });
            return;
        }
        renderHero(mapHero(data.hero));
        renderStats(data.discord, data.stats);
        renderActivity(data.activity);
        renderUpcoming(data.upcoming_events);
        renderResults(data.recent_results);
        renderTopPlayers(data.top_players);
        renderClan(data.clan);
        renderDiscord(data.discord);
        icons();
    }

    C.fetchPublicHome()
        .then(renderHome)
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
