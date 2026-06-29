/**
 * MCV 3.1 Sprint 2 — Widgets reutilizables para Home Hub
 * Ver docs/HOME_WIDGETS.md
 */
(function (global) {
    "use strict";

    function esc(s) {
        if (typeof global.mcvEsc === "function") return global.mcvEsc(s);
        if (s == null) return "";
        return String(s);
    }

    function badge(variant, text) {
        if (typeof global.mcvBadge === "function") return global.mcvBadge(variant, text);
        return '<span class="mcv-badge">' + esc(text) + "</span>";
    }

    function sectionHead(title, linkHref, linkText, icon) {
        return (
            '<header class="mcv-widget-section__head">' +
            "<h2 class=\"mcv-widget-section__title\">" +
            (icon ? '<i data-lucide="' + esc(icon) + '"></i> ' : "") +
            esc(title) +
            "</h2>" +
            (linkHref
                ? '<a class="mcv-link mcv-widget-section__link" href="' + esc(linkHref) + '">' + esc(linkText || "Ver más") + "</a>"
                : "") +
            "</header>"
        );
    }

    /** Widget Now — estado dinámico hero (uno solo) */
    function widgetNow(state) {
        if (!state || state.type === "idle") {
            return (
                '<div class="mcv-widget mcv-widget--now pulse-now pulse-now--idle">' +
                '<div class="pulse-now__head">' +
                badge("muted", "// Ahora") +
                "</div>" +
                '<p class="pulse-now__title">La comunidad sigue activa en Discord. Enterate del próximo evento.</p>' +
                '<div class="pulse-now__actions">' +
                '<a href="https://discord.gg/mBRrUA8wH6" class="mcv-btn mcv-btn--primary" target="_blank" rel="noopener">Discord</a>' +
                '<a href="events.html" class="mcv-btn mcv-btn--secondary">Torneos</a>' +
                "</div></div>"
            );
        }
        var badgeVariant = state.badgeVariant || "open";
        var actions = (state.actions || [])
            .map(function (a) {
                return (
                    '<a href="' +
                    esc(a.href) +
                    '" class="mcv-btn mcv-btn--' +
                    esc(a.variant || "secondary") +
                    '">' +
                    esc(a.label) +
                    "</a>"
                );
            })
            .join("");
        return (
            '<div class="mcv-widget mcv-widget--now pulse-now">' +
            '<div class="pulse-now__head">' +
            badge(badgeVariant, state.badge || "Ahora") +
            "</div>" +
            '<h2 class="pulse-now__title">' +
            esc(state.title) +
            "</h2>" +
            (state.meta ? '<p class="mcv-panel__meta pulse-now__meta">' + esc(state.meta) + "</p>" : "") +
            '<div class="pulse-now__actions">' +
            actions +
            "</div></div>"
        );
    }

    /** Widget Activity — ítem de feed */
    function widgetActivity(item) {
        return (
            '<article class="mcv-widget mcv-widget--activity' +
            (item.placeholder ? " mcv-widget--placeholder" : "") +
            '">' +
            '<span class="mcv-widget-activity__icon" aria-hidden="true">' +
            esc(item.icon || "•") +
            "</span>" +
            '<div class="mcv-widget-activity__body">' +
            "<p>" +
            esc(item.text) +
            "</p>" +
            (item.time ? '<time class="mcv-widget-activity__time">' + esc(item.time) + "</time>" : "") +
            (item.placeholder ? '<span class="mcv-widget-activity__tag">Próximamente</span>' : "") +
            "</div></article>"
        );
    }

    /** Widget Event — tarjeta torneo próximo */
    function widgetEvent(t) {
        var statusMap = { open: ["open", "Abierto"], closed: ["muted", "Cerrado"], finished: ["past", "Finalizado"] };
        var st = statusMap[t.status] || ["muted", t.status || "—"];
        var slots =
            t.accepted_count != null && t.max_teams != null
                ? t.accepted_count + "/" + t.max_teams
                : t.accepted_count != null
                  ? String(t.accepted_count) + " equipos"
                  : "—";
        return (
            '<article class="mcv-widget mcv-widget--event mcv-card">' +
            '<div class="mcv-widget-event__head">' +
            badge(st[0], st[1]) +
            "<time>" +
            esc(t.dateLabel || "—") +
            "</time></div>" +
            "<h3 class=\"mcv-widget-event__title\">" +
            esc(t.title || t.slug) +
            "</h3>" +
            '<dl class="mcv-widget-event__meta">' +
            "<div><dt>Hora</dt><dd>" +
            esc(t.timeLabel || "—") +
            "</dd></div>" +
            "<div><dt>Equipos</dt><dd>" +
            esc(slots) +
            "</dd></div></dl>" +
            '<a href="' +
            esc(t.href || "events.html") +
            '" class="mcv-btn mcv-btn--primary mcv-btn--sm mcv-widget-event__cta">' +
            esc(t.cta || "Ver torneo") +
            "</a></article>"
        );
    }

    /** Widget Result — tarjeta resultado */
    function widgetResult(r) {
        return (
            '<article class="mcv-widget mcv-widget--result mcv-card">' +
            "<h3 class=\"mcv-widget-result__title\">" +
            esc(r.title || "Torneo") +
            "</h3>" +
            '<div class="mcv-widget-result__grid">' +
            '<div><span class="mcv-stat__label">Campeón</span><strong>' +
            esc(r.winner || "—") +
            "</strong></div>" +
            '<div><span class="mcv-stat__label">Finalista</span><strong>' +
            esc(r.runnerUp || "—") +
            "</strong></div>" +
            '<div><span class="mcv-stat__label">Prize</span><strong>' +
            esc(r.prize || "—") +
            "</strong></div>" +
            '<div><span class="mcv-stat__label">MVP</span><strong>' +
            esc(r.mvp || "—") +
            "</strong></div></div>" +
            '<a href="' +
            esc(r.href || "results/") +
            '" class="mcv-btn mcv-btn--secondary mcv-btn--sm">Ver resultado</a></article>'
        );
    }

    /** Widget Player — fila ranking */
    function widgetPlayer(p) {
        var av = p.avatar
            ? '<img class="mcv-widget-player__avatar" src="' + esc(p.avatar) + '" alt="" width="40" height="40" loading="lazy">'
            : '<div class="mcv-widget-player__avatar mcv-widget-player__avatar--fallback"><i data-lucide="user"></i></div>';
        var nameInner = p.href
            ? '<a class="mcv-link" href="' + esc(p.href) + '">' + esc(p.name) + "</a>"
            : esc(p.name);
        return (
            '<article class="mcv-widget mcv-widget--player">' +
            '<span class="mcv-widget-player__rank">' +
            esc(String(p.rank)) +
            "</span>" +
            av +
            '<div class="mcv-widget-player__info">' +
            nameInner +
            '<span class="mcv-widget-player__pts">' +
            esc(String(p.points != null ? p.points : "—")) +
            " pts</span></div></article>"
        );
    }

    /** Widget Team — resumen clan */
    function widgetTeam(data) {
        return (
            '<article class="mcv-widget mcv-widget--team mcv-card">' +
            '<div class="mcv-widget-team__stats">' +
            '<div class="mcv-stat mcv-stat--compact"><span class="mcv-stat__label">Activos</span><strong class="mcv-stat__value">' +
            esc(String(data.activeCount != null ? data.activeCount : "—")) +
            "</strong></div>" +
            '<div class="mcv-stat mcv-stat--compact"><span class="mcv-stat__label">Estado</span><strong class="mcv-stat__value">' +
            esc(data.recruiting ? "Reclutando" : "Roster cerrado") +
            "</strong></div></div>" +
            (data.preview || "") +
            '<a href="equipo/" class="mcv-btn mcv-btn--secondary mcv-btn--sm">Ver lineup completo</a></article>'
        );
    }

    /** Widget Discord */
    function widgetDiscord(data) {
        return (
            '<article class="mcv-widget mcv-widget--discord mcv-card">' +
            '<h3 class="mcv-widget-discord__title"><i data-lucide="message-square"></i> Discord MCV</h3>' +
            '<ul class="mcv-widget-discord__benefits">' +
            "<li>Torneos y avisos en tiempo real</li>" +
            "<li>Comunidad activa de Rust</li>" +
            "<li>Acceso a staff y soporte</li></ul>" +
            '<div class="mcv-widget-discord__status">' +
            badge(data.online != null ? "ok" : "muted", data.statusLabel || "Servidor activo") +
            (data.members != null ? '<span class="mcv-hint">' + esc(String(data.members)) + " miembros</span>" : "") +
            "</div>" +
            '<a href="https://discord.gg/mBRrUA8wH6" class="mcv-btn mcv-btn--primary mcv-btn--pulse" target="_blank" rel="noopener">Entrar al Discord</a></article>'
        );
    }

    /** Widget Wipe — placeholder */
    function widgetWipe() {
        return widgetActivity({
            icon: "🔥",
            text: "Próximo wipe Vital — fechas en Discord",
            placeholder: true
        });
    }

    /** Widget News — placeholder */
    function widgetNews(text) {
        return widgetActivity({
            icon: "📢",
            text: text || "Noticias del clan — próximamente",
            placeholder: true
        });
    }

    global.mcvHomeWidgets = {
        esc: esc,
        sectionHead: sectionHead,
        now: widgetNow,
        activity: widgetActivity,
        event: widgetEvent,
        result: widgetResult,
        player: widgetPlayer,
        team: widgetTeam,
        discord: widgetDiscord,
        wipe: widgetWipe,
        news: widgetNews
    };
})(window);
