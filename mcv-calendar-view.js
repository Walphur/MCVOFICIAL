/**
 * MCV 3.1 — Calendario cronológico
 */
(function () {
    "use strict";

    var C = window.mcvCompeteCore;
    if (!C) return;

    var esc = C.esc;
    var container = document.getElementById("calendar-timeline");
    var events = [];
    var filter = "all";

    function eventHtml(ev) {
        return (
            '<article class="mcv-timeline__item' +
            (ev.placeholder ? " mcv-timeline__item--placeholder" : "") +
            '" data-type="' +
            esc(ev.type) +
            '">' +
            '<div class="mcv-timeline__dot"><i data-lucide="' +
            esc(ev.icon || "calendar") +
            '"></i></div>' +
            '<div class="mcv-timeline__body">' +
            '<time class="mcv-timeline__date" datetime="' +
            esc(ev.iso || "") +
            '">' +
            esc(ev.dateLabel) +
            "</time>" +
            "<strong>" +
            esc(ev.title) +
            "</strong>" +
            '<span class="mcv-timeline__sub">' +
            esc(ev.sub) +
            "</span>" +
            (ev.href
                ? '<a class="mcv-link" href="' + esc(ev.href) + '">' + esc(ev.linkText || "Ver más") + "</a>"
                : "") +
            "</div></article>"
        );
    }

    function render() {
        if (!container) return;
        var list = events.filter(function (ev) {
            return filter === "all" || ev.type === filter;
        });
        list.sort(function (a, b) {
            return (b.ts || 0) - (a.ts || 0);
        });
        if (!list.length) {
            container.innerHTML = '<p class="mcv-empty">No hay eventos en este filtro.</p>';
            return;
        }
        container.innerHTML = list.map(eventHtml).join("");
        if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
    }

    function pushEvent(ev) {
        ev.ts = ev.iso ? new Date(ev.iso).getTime() : 0;
        ev.dateLabel = ev.iso ? C.fmtDate(ev.iso) : "Próximamente";
        events.push(ev);
    }

    Promise.all([C.fetchTournaments()])
        .then(function (res) {
            var tournaments = res[0] || [];
            tournaments.forEach(function (t) {
                if (t.starts_at) {
                    pushEvent({
                        type: "tournament",
                        icon: "swords",
                        iso: t.starts_at,
                        title: t.title || t.slug,
                        sub: "Match day · " + (t.status || "—"),
                        href: "../tournament.html?slug=" + encodeURIComponent(t.slug),
                        linkText: "Ver torneo"
                    });
                }
                if (t.registration_closes_at && t.status === "open") {
                    pushEvent({
                        type: "tournament",
                        icon: "ticket",
                        iso: t.registration_closes_at,
                        title: "Cierre inscripciones — " + (t.title || t.slug),
                        sub: "Último día para registrar team",
                        href: "../tournament.html?slug=" + encodeURIComponent(t.slug) + "#register",
                        linkText: "Inscribirse"
                    });
                }
            });

            /* Wipes — placeholder hasta GET /api/public/calendar */
            pushEvent({
                type: "wipe",
                icon: "refresh-cw",
                iso: null,
                title: "Wipe Vital MCV",
                sub: "Fechas oficiales en Discord / admin",
                placeholder: true
            });

            /* Streams — enlace a live */
            pushEvent({
                type: "stream",
                icon: "radio",
                iso: null,
                title: "Streams MCV",
                sub: "Seguí transmisiones en vivo",
                href: "../live.html",
                linkText: "Ir a Live"
            });

            render();
        })
        .catch(function () {
            if (container) container.innerHTML = '<p class="mcv-empty mcv-empty--error">No se pudo cargar el calendario.</p>';
        });

    document.querySelectorAll(".mcv-filter-bar .mcv-chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
            document.querySelectorAll(".mcv-filter-bar .mcv-chip").forEach(function (c) {
                c.classList.remove("mcv-chip--active");
            });
            chip.classList.add("mcv-chip--active");
            filter = chip.getAttribute("data-filter") || "all";
            render();
        });
    });
})();
