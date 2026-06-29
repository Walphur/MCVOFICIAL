/**
 * MCV 3.2 — Calendario desde /api/public/v1/calendar
 */
(function () {
    "use strict";

    var C = window.mcvCompeteCore;
    if (!C) return;

    var esc = C.esc;
    var container = document.getElementById("calendar-timeline");
    var events = [];
    var filter = "all";

    var ICONS = {
        tournament: "swords",
        wipe: "refresh-cw",
        stream: "radio"
    };

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

    function mapApiEvent(e) {
        var href = e.href || "";
        if (href.indexOf("/") === 0) href = ".." + href;
        var sub =
            e.subtype === "registration"
                ? "Cierre inscripciones"
                : e.subtype === "match"
                  ? "Match day · " + (e.status || "—")
                  : e.subtype || e.type || "";
        pushEvent({
            type: e.type,
            icon: ICONS[e.type] || "calendar",
            iso: e.starts_at,
            title: e.title,
            sub: sub,
            href: href,
            linkText: e.type === "stream" ? "Ir a Live" : "Ver más",
            placeholder: e.placeholder
        });
    }

    C.fetchPublicCalendar()
        .then(function (data) {
            if (!data || !data.events) throw new Error("calendar");
            data.events.forEach(mapApiEvent);
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
