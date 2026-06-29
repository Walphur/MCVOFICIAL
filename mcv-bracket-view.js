/**
 * MCV 3.1 — Bracket visual reutilizable (solo lectura).
 * Usa GET /api/tournaments/:slug/bracket — sin modificar lógica backend.
 */
(function (global) {
    "use strict";

    function esc(s) {
        if (typeof global.mcvEsc === "function") return global.mcvEsc(s);
        if (s == null) return "";
        return String(s);
    }

    function groupByRound(matches) {
        var byRound = {};
        (matches || []).forEach(function (m) {
            var rn = m.round_no != null ? m.round_no : 0;
            if (!byRound[rn]) byRound[rn] = [];
            byRound[rn].push(m);
        });
        return byRound;
    }

    function renderMatch(m) {
        var done = !!m.winner_registration_id;
        var sideA = m.side_a_name || "—";
        var sideB = m.side_b_name || "BYE";
        var winA = done && m.winner_registration_id === m.registration_a_id;
        var winB = done && m.winner_registration_id === m.registration_b_id;
        var bye = !m.registration_b_id;
        return (
            '<div class="mcv-bracket__match' +
            (done ? " is-done" : "") +
            '">' +
            '<div class="mcv-bracket__side' +
            (winA ? " is-winner" : "") +
            '"><span>' +
            esc(sideA) +
            "</span></div>" +
            '<div class="mcv-bracket__side' +
            (winB ? " is-winner" : "") +
            (bye ? " is-bye" : "") +
            '"><span>' +
            esc(sideB) +
            "</span></div></div>"
        );
    }

    function renderHtml(data) {
        var matches = (data && data.matches) || [];
        if (!matches.length) {
            return '<p class="mcv-empty">Sin bracket publicado para este torneo.</p>';
        }
        var byRound = groupByRound(matches);
        var rounds = Object.keys(byRound).sort(function (a, b) {
            return Number(a) - Number(b);
        });
        var html = '<div class="mcv-bracket">';
        rounds.forEach(function (rn) {
            html += '<div class="mcv-bracket__round">';
            html += '<h4 class="mcv-bracket__round-title">Ronda ' + esc(rn) + "</h4>";
            byRound[rn]
                .sort(function (a, b) {
                    return Number(a.slot_no) - Number(b.slot_no);
                })
                .forEach(function (m) {
                    html += renderMatch(m);
                });
            html += "</div>";
        });
        html += "</div>";
        return html;
    }

    function McvBracketView(container, slug, opts) {
        opts = opts || {};
        var el =
            typeof container === "string" ? document.getElementById(container) : container;
        if (!el || !slug) return Promise.resolve(false);
        el.innerHTML = '<p class="mcv-loading">Cargando bracket…</p>';
        var api =
            typeof global.mcvCompeteCore !== "undefined" && global.mcvCompeteCore.fetchTournamentBracket
                ? global.mcvCompeteCore.fetchTournamentBracket(slug)
                : fetch(
                      (typeof global.mcvResolveApiBase === "function"
                          ? global.mcvResolveApiBase()
                          : "") +
                          "/api/tournaments/" +
                          encodeURIComponent(slug) +
                          "/bracket"
                  ).then(function (r) {
                      return r.json();
                  });
        return Promise.resolve(api)
            .then(function (data) {
                el.innerHTML = renderHtml(data);
                if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
                if (opts.onReady) opts.onReady(data);
                return true;
            })
            .catch(function () {
                el.innerHTML = '<p class="mcv-empty mcv-empty--error">No se pudo cargar el bracket.</p>';
                return false;
            });
    }

    global.McvBracketView = McvBracketView;
    global.mcvBracketRenderHtml = renderHtml;
})(window);
