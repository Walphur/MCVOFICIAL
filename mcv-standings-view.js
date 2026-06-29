/**
 * MCV 3.2 — Rankings desde /api/public/v1/standings
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
                var profile = r.href
                    ? '<a class="mcv-link" href="' + esc(r.href.replace(/^\//, "../")) + '">' + esc(r.name) + "</a>"
                    : esc(r.name);
                return (
                    "<tr><td class=\"mcv-table__rank\">" +
                    (r.rank || i + 1) +
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
                    (r.rank || i + 1) +
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

    document.querySelectorAll(".mcv-tab").forEach(function (btn) {
        btn.addEventListener("click", function () {
            tabSwitch(btn.getAttribute("data-tab"));
        });
    });

    var sortEl = document.getElementById("standings-sort");
    if (sortEl) sortEl.addEventListener("change", renderPlayers);

    C.fetchPublicStandings({ limit: 50 })
        .then(function (data) {
            if (!data) throw new Error("standings");
            playerRows = data.players || [];
            teamRows = data.teams || [];
            var seasonSel = document.getElementById("standings-season");
            if (seasonSel && data.seasons_available) {
                seasonSel.innerHTML =
                    '<option value="">Todas</option>' +
                    data.seasons_available
                        .map(function (s) {
                            return '<option value="' + esc(s) + '">' + esc(s) + "</option>";
                        })
                        .join("");
                seasonSel.addEventListener("change", function () {
                    C.fetchPublicStandings({ season: seasonSel.value || null, limit: 50 }).then(function (d) {
                        if (d) {
                            playerRows = d.players || [];
                            teamRows = d.teams || [];
                            renderPlayers();
                            renderTeams();
                        }
                    });
                });
            }
            renderPlayers();
            renderTeams();
        })
        .catch(function () {
            var body = document.getElementById("standings-players-body");
            if (body) body.innerHTML = '<tr><td colspan="6"><p class="mcv-empty mcv-empty--error">Error al cargar rankings.</p></td></tr>';
        });
})();
