/**
 * MCV 3.1 — Hub de resultados históricos
 */
(function () {
    "use strict";

    var C = window.mcvCompeteCore;
    if (!C) return;

    var esc = C.esc;
    var listEl = document.getElementById("results-list");
    var detailEl = document.getElementById("results-detail");
    var allFinished = [];
    var filtered = [];

    function badge(v, t) {
        return typeof mcvBadge === "function" ? mcvBadge(v, t) : esc(t);
    }

    function applyFilters() {
        var team = (document.getElementById("filter-team") || {}).value || "";
        var player = (document.getElementById("filter-player") || {}).value || "";
        var season = (document.getElementById("filter-season") || {}).value || "";
        team = team.trim().toLowerCase();
        player = player.trim().toLowerCase();

        filtered = allFinished.filter(function (t) {
            if (team && String(t.winner_team_name || t.winner_display_name || "").toLowerCase().indexOf(team) === -1) {
                return false;
            }
            if (player) {
                var inTitle = String(t.title || t.slug || "").toLowerCase().indexOf(player) !== -1;
                var inWinner = String(t.winner_team_name || t.winner_display_name || "").toLowerCase().indexOf(player) !== -1;
                if (!inTitle && !inWinner) return false;
            }
            if (season && String(t.slug || "").indexOf(season) === -1) {
                /* placeholder: season tag no existe en schema */
            }
            return true;
        });
        renderList();
    }

    function cardHtml(t) {
        var winner = t.winner_display_name || t.winner_team_name || "—";
        var prize = t.prize_pool_text || "—";
        return (
            '<article class="mcv-card mcv-card--hof results-card" data-slug="' +
            esc(t.slug) +
            '">' +
            '<div class="mcv-panel__head">' +
            "<h3>" +
            esc(t.title || t.slug) +
            "</h3>" +
            badge("past", "Finalizado") +
            "</div>" +
            '<p class="mcv-hint">' +
            C.fmtDate(t.ended_at || t.starts_at) +
            "</p>" +
            '<div class="mcv-stat-group__grid">' +
            '<div class="mcv-stat mcv-stat--compact"><span class="mcv-stat__label">Campeón</span><strong class="mcv-stat__value">' +
            esc(winner) +
            "</strong></div>" +
            '<div class="mcv-stat mcv-stat--compact"><span class="mcv-stat__label">Prize</span><strong class="mcv-stat__value">' +
            esc(prize) +
            "</strong></div>" +
            '<div class="mcv-stat mcv-stat--compact"><span class="mcv-stat__label">MVP</span><strong class="mcv-stat__value">—</strong></div>' +
            "</div>" +
            '<div class="mcv-hero__actions" style="margin-top:var(--mcv-space-3)">' +
            '<button type="button" class="mcv-btn mcv-btn--secondary results-view-btn" data-slug="' +
            esc(t.slug) +
            '">Ver bracket</button>' +
            '<a class="mcv-btn mcv-btn--ghost" href="../tournament.html?slug=' +
            encodeURIComponent(t.slug) +
            '">Torneo</a>' +
            "</div></article>"
        );
    }

    function renderList() {
        if (!listEl) return;
        if (!filtered.length) {
            listEl.innerHTML = '<p class="mcv-empty">No hay resultados con esos filtros.</p>';
            return;
        }
        listEl.innerHTML = filtered.map(cardHtml).join("");
        listEl.querySelectorAll(".results-view-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                openDetail(btn.getAttribute("data-slug"));
            });
        });
        if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
    }

    function openDetail(slug) {
        if (!slug || !detailEl) return;
        detailEl.hidden = false;
        document.getElementById("results-detail-title").textContent = "Cargando…";
        document.getElementById("results-detail-meta").textContent = "";
        document.getElementById("results-podium").innerHTML = "";
        document.getElementById("results-bracket").innerHTML = '<p class="mcv-loading">Cargando bracket…</p>';

        C.fetchTournamentDetail(slug).then(function (t) {
            if (!t) return;
            document.getElementById("results-detail-title").textContent = t.title || slug;
            document.getElementById("results-detail-meta").textContent =
                "Finalizado · " + C.fmtDate(t.ended_at || t.starts_at);
            var winner = t.winner_display_name || t.winner_team_name || "—";
            document.getElementById("results-podium").innerHTML =
                '<div class="mcv-stat mcv-stat--compact"><span class="mcv-stat__label">1º</span><strong class="mcv-stat__value">' +
                esc(winner) +
                '</strong></div><div class="mcv-stat mcv-stat--compact"><span class="mcv-stat__label">2º</span><strong class="mcv-stat__value">—</strong></div><div class="mcv-stat mcv-stat--compact"><span class="mcv-stat__label">MVP</span><strong class="mcv-stat__value">—</strong></div><div class="mcv-stat mcv-stat--compact"><span class="mcv-stat__label">Prize</span><strong class="mcv-stat__value">' +
                esc(t.prize_pool_text || "—") +
                "</strong></div>";
            if (typeof McvBracketView === "function") {
                McvBracketView(document.getElementById("results-bracket"), slug);
            }
            detailEl.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    function initFilters() {
        var seasonSel = document.getElementById("filter-season");
        var wipeSel = document.getElementById("filter-wipe");
        if (seasonSel) {
            seasonSel.innerHTML = '<option value="">Todas</option><option value="2026">2026</option>';
        }
        if (wipeSel) {
            wipeSel.innerHTML = '<option value="">Todos</option><option value="wipe">Wipe actual (placeholder)</option>';
        }
        ["filter-season", "filter-wipe", "filter-team", "filter-player"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener("input", applyFilters);
            if (el) el.addEventListener("change", applyFilters);
        });
    }

    C.fetchTournaments()
        .then(function (list) {
            allFinished = list.filter(function (t) {
                return t.status === "finished";
            });
            filtered = allFinished.slice();
            initFilters();
            renderList();
            var qs = new URLSearchParams(location.search || "");
            var tSlug = qs.get("t");
            if (tSlug) openDetail(tSlug);
        })
        .catch(function () {
            if (listEl) listEl.innerHTML = '<p class="mcv-empty mcv-empty--error">No se pudieron cargar los resultados.</p>';
        });
})();
