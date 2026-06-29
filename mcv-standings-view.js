/**
 * MCV 3.1 — Rankings (jugadores / equipos)
 */
(function () {
    "use strict";

    var C = window.mcvCompeteCore;
    if (!C) return;

    var esc = C.esc;
    var playerRows = [];
    var teamRows = [];

    function tabSwitch(name) {
        document.querySelectorAll(".mcv-tab").forEach(function (btn) {
            var on = btn.getAttribute("data-tab") === name;
            btn.classList.toggle("active", on);
            btn.setAttribute("aria-selected", on ? "true" : "false");
        });
        var players = document.getElementById("standings-players");
        var teams = document.getElementById("standings-teams");
        if (players) players.hidden = name !== "players";
        if (teams) teams.hidden = name !== "teams";
    }

    function sortKey() {
        var sel = document.getElementById("standings-sort");
        return (sel && sel.value) || "wins";
    }

    function renderPlayers() {
        var body = document.getElementById("standings-players-body");
        if (!body) return;
        var key = sortKey();
        var rows = playerRows.slice().sort(function (a, b) {
            return (b[key] || 0) - (a[key] || 0);
        });
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="6"><p class="mcv-empty">Sin datos de ranking.</p></td></tr>';
            return;
        }
        body.innerHTML = rows
            .map(function (r, i) {
                var profile =
                    r.steamId64
                        ? '<a class="mcv-link" href="../player/?steamId=' +
                          encodeURIComponent(r.steamId64) +
                          '">' +
                          esc(r.name) +
                          "</a>"
                        : esc(r.name);
                return (
                    "<tr><td class=\"mcv-table__rank\">" +
                    (i + 1) +
                    "</td><td>" +
                    profile +
                    "</td><td>" +
                    esc(r.team || "MCV") +
                    "</td><td>" +
                    esc(String(r.wins != null ? r.wins : "—")) +
                    "</td><td>" +
                    esc(r.kd != null ? String(r.kd) : "—") +
                    "</td><td>" +
                    esc(r.points != null ? String(r.points) : "—") +
                    "</td></tr>"
                );
            })
            .join("");
    }

    function renderTeams() {
        var body = document.getElementById("standings-teams-body");
        if (!body) return;
        var rows = teamRows.slice().sort(function (a, b) {
            return (b.wins || 0) - (a.wins || 0);
        });
        body.innerHTML = rows
            .map(function (r, i) {
                return (
                    "<tr><td class=\"mcv-table__rank\">" +
                    (i + 1) +
                    "</td><td>" +
                    esc(r.name) +
                    "</td><td>" +
                    esc(String(r.tournaments || 0)) +
                    "</td><td>" +
                    esc(String(r.wins || 0)) +
                    "</td><td>" +
                    esc(String(r.points || "—")) +
                    "</td></tr>"
                );
            })
            .join("");
    }

    function buildRankings(roster, finished, details) {
        var teamMap = {};
        details.forEach(function (t) {
            if (!t || t.status !== "finished") return;
            var name = t.winner_team_name || t.winner_display_name;
            if (!name) return;
            if (!teamMap[name]) teamMap[name] = { name: name, wins: 0, tournaments: 0, points: 0 };
            teamMap[name].wins += 1;
            teamMap[name].tournaments += 1;
            teamMap[name].points += 100;
        });
        teamRows = Object.keys(teamMap).map(function (k) {
            return teamMap[k];
        });

        playerRows = (roster.members || []).map(function (m, idx) {
            return {
                steamId64: m.steam_id64,
                name: m.display_name || "Jugador",
                team: "MCV",
                wins: 0,
                kd: null,
                points: Math.max(0, 50 - idx * 5) /* placeholder hasta scoreboard público */
            };
        });

        /* Enriquecer campeones detectados en winner_roster */
        details.forEach(function (t) {
            if (!t || !t.winner_roster) return;
            var rosterList = C.parseRosterJson(t.winner_roster);
            rosterList.forEach(function (p) {
                var sid = String(p.steamId64 || p.steam_id64 || "").replace(/\D/g, "");
                for (var i = 0; i < playerRows.length; i++) {
                    if (playerRows[i].steamId64 === sid) {
                        playerRows[i].wins = (playerRows[i].wins || 0) + 1;
                        playerRows[i].points = (playerRows[i].points || 0) + 100;
                    }
                }
            });
        });
    }

    document.querySelectorAll(".mcv-tab").forEach(function (btn) {
        btn.addEventListener("click", function () {
            tabSwitch(btn.getAttribute("data-tab"));
        });
    });

    var sortEl = document.getElementById("standings-sort");
    if (sortEl) sortEl.addEventListener("change", renderPlayers);

    Promise.all([C.fetchTeamRoster(), C.fetchTournaments()])
        .then(function (res) {
            var roster = res[0];
            var tournaments = res[1];
            var finished = tournaments.filter(function (t) {
                return t.status === "finished";
            });
            return Promise.all(
                finished.slice(0, 15).map(function (t) {
                    return C.fetchTournamentDetail(t.slug);
                })
            ).then(function (details) {
                buildRankings(roster, finished, details.filter(Boolean));
                renderPlayers();
                renderTeams();
            });
        })
        .catch(function () {
            var body = document.getElementById("standings-players-body");
            if (body) body.innerHTML = '<tr><td colspan="6"><p class="mcv-empty mcv-empty--error">Error al cargar rankings.</p></td></tr>';
        });
})();
