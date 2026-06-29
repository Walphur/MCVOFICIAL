/**
 * MCV — factories HTML para componentes MDS (Fase 1.5).
 * Ver MCV_COMPONENTS.md para inventario y nomenclatura.
 */
(function (global) {
    function mcvEsc(s) {
        if (s == null) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    var BADGE_MAP = {
        open: "mcv-badge--open events-badge-open",
        live: "mcv-badge--live events-badge-live",
        past: "mcv-badge--past events-badge-past",
        draft: "mcv-badge--draft events-badge-draft",
        offline: "mcv-badge--offline",
        ok: "mcv-badge--ok cuenta-status--ok",
        bad: "mcv-badge--bad cuenta-status--bad",
        pending: "mcv-badge--pending cuenta-status--pending",
        danger: "mcv-badge--danger",
        warn: "mcv-badge--warn",
        safe: "mcv-badge--safe",
        champion: "mcv-badge--champion",
        muted: "mcv-badge--muted"
    };

    function mcvBadge(variant, text, extraClass) {
        var v = BADGE_MAP[variant] || "mcv-badge--muted";
        var cls = "mcv-badge events-badge " + v + (extraClass ? " " + extraClass : "");
        return '<span class="' + cls + '">' + mcvEsc(text) + "</span>";
    }

    function mcvChip(variant, text, opts) {
        opts = opts || {};
        var active = opts.active ? " mcv-chip--active is-active" : "";
        var typeCls = variant ? " mcv-chip--" + variant + " ticket-type-badge--" + variant : "";
        var tag = opts.tag || "span";
        return (
            "<" +
            tag +
            ' class="mcv-chip ticket-type-badge' +
            typeCls +
            active +
            '"' +
            (opts.attrs || "") +
            ">" +
            mcvEsc(text) +
            "</" +
            tag +
            ">"
        );
    }

    function mcvEmptyHtml(msg, opts) {
        opts = opts || {};
        if (opts.card || opts.discord) {
            var cta = opts.discord
                ? '<a class="mcv-btn mcv-btn--primary btn-primary" href="https://discord.gg/mBRrUA8wH6" target="_blank" rel="noopener noreferrer">' +
                  mcvEsc(opts.ctaText || "Discord") +
                  "</a>"
                : opts.ctaHref
                  ? '<a class="mcv-btn mcv-btn--primary btn-primary" href="' +
                    mcvEsc(opts.ctaHref) +
                    '">' +
                    mcvEsc(opts.ctaText || "") +
                    "</a>"
                  : "";
            return (
                '<div class="mcv-empty mcv-empty--card events-empty-card">' +
                "<p>" +
                mcvEsc(msg) +
                "</p>" +
                cta +
                "</div>"
            );
        }
        return '<p class="mcv-empty events-empty">' + mcvEsc(msg) + "</p>";
    }

    function mcvBannerHtml(msg) {
        return (
            '<div class="mcv-banner mcv-api-banner" role="status"><p>' +
            mcvEsc(msg) +
            "</p></div>"
        );
    }

    function mcvLink(href, text, variant) {
        var cls =
            variant === "muted"
                ? "mcv-link mcv-link--muted events-card-link"
                : "mcv-link mcv-link--accent events-card-link";
        return (
            '<a class="' +
            cls +
            '" href="' +
            mcvEsc(href) +
            '">' +
            mcvEsc(text) +
            "</a>"
        );
    }

    function mcvStatHtml(value, label, extraClass) {
        return (
            '<div class="mcv-stat stat-box events-stat' +
            (extraClass ? " " + extraClass : "") +
            '">' +
            '<span class="mcv-stat__value stat-value events-stat-num mcv-count-up">' +
            mcvEsc(value) +
            "</span>" +
            '<span class="mcv-stat__label stat-title events-stat-label">' +
            mcvEsc(label) +
            "</span>" +
            "</div>"
        );
    }

    global.mcvEsc = mcvEsc;
    global.mcvBadge = mcvBadge;
    global.mcvChip = mcvChip;
    global.mcvEmptyHtml = mcvEmptyHtml;
    global.mcvBannerHtml = mcvBannerHtml;
    global.mcvLink = mcvLink;
    global.mcvStatHtml = mcvStatHtml;
})(window);
