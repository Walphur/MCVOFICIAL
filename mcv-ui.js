/**
 * MCV — utilidades UI compartidas (toast, contadores, footer pulse).
 */
(function (global) {
    function ensureToastHost() {
        var host = document.getElementById("mcv-toast-host");
        if (host) return host;
        host = document.createElement("div");
        host.id = "mcv-toast-host";
        host.className = "mcv-toast-host";
        host.setAttribute("aria-live", "polite");
        document.body.appendChild(host);
        return host;
    }

    function mcvToast(message, type) {
        var host = ensureToastHost();
        var el = document.createElement("div");
        el.className = "mcv-toast" + (type === "err" ? " mcv-toast--err" : type === "ok" ? " mcv-toast--ok" : "");
        el.textContent = String(message == null ? "" : message);
        host.appendChild(el);
        requestAnimationFrame(function () {
            el.classList.add("is-in");
        });
        setTimeout(function () {
            el.classList.remove("is-in");
            setTimeout(function () {
                el.remove();
            }, 280);
        }, 3400);
    }

    function parseCount(raw) {
        var s = String(raw == null ? "" : raw).trim();
        if (!s || s === "—" || s === "--" || s === "OFF") return null;
        var n = parseInt(s.replace(/[^\d]/g, ""), 10);
        return Number.isFinite(n) ? n : null;
    }

    function mcvAnimateCounters(root) {
        root = root || document;
        var nodes = root.querySelectorAll(".mcv-count-up");
        for (var i = 0; i < nodes.length; i++) {
            (function (el) {
                if (el.getAttribute("data-mcv-counted") === "1") return;
                var target = parseCount(el.getAttribute("data-count-target") || el.textContent);
                if (target == null || target < 0) return;
                el.setAttribute("data-mcv-counted", "1");
                var start = 0;
                var dur = 900;
                var t0 = performance.now();
                function tick(now) {
                    var p = Math.min(1, (now - t0) / dur);
                    var eased = 1 - Math.pow(1 - p, 3);
                    var val = Math.round(start + (target - start) * eased);
                    el.textContent = target < 100 ? String(val).padStart(2, "0") : String(val);
                    if (p < 1) requestAnimationFrame(tick);
                }
                requestAnimationFrame(tick);
            })(nodes[i]);
        }
    }

    function loadFooterPulse() {
        var last = document.getElementById("footer-last-tournament");
        var disc = document.getElementById("footer-discord-members");
        var srv = document.getElementById("footer-server-status");
        if (!last && !disc && !srv) return;

        var API =
            typeof global.mcvResolveApiBase === "function"
                ? global.mcvResolveApiBase()
                : String(global.location.origin || "").replace(/\/$/, "");

        if (API && last) {
            fetch(API + "/api/tournaments/for-site")
                .then(function (r) {
                    return r.json();
                })
                .then(function (d) {
                    if (!d || !d.tournament) {
                        last.textContent = "—";
                        return;
                    }
                    var t = d.tournament;
                    last.textContent = (t.title || t.slug || "—") + (d.mode === "recap" ? " · Finalizado" : "");
                })
                .catch(function () {
                    last.textContent = "—";
                });
        }

        fetch("https://discord.com/api/v9/invites/mBRrUA8wH6?with_counts=true")
            .then(function (r) {
                return r.json();
            })
            .then(function (d) {
                if (disc && d && d.approximate_member_count != null) {
                    disc.textContent = String(d.approximate_member_count);
                }
            })
            .catch(function () {});

        if (srv) {
            if (!API) {
                srv.textContent = "—";
                return;
            }
            fetch(API + "/api/health")
                .then(function (r) {
                    return r.json();
                })
                .then(function (h) {
                    srv.textContent = h && h.ok ? "Online" : "Degradado";
                    srv.classList.toggle("is-online", !!(h && h.ok));
                })
                .catch(function () {
                    srv.textContent = "Offline";
                });
        }
    }

    global.mcvToast = mcvToast;
    global.mcvAnimateCounters = mcvAnimateCounters;
    global.mcvLoadFooterPulse = loadFooterPulse;

    function boot() {
        loadFooterPulse();
        mcvAnimateCounters(document);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})(window);
