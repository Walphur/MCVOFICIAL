/**
 * Menú móvil: botón hamburguesa + panel en todas las páginas con .navbar
 */
(function () {
    function closeNav(nav, btn) {
        nav.classList.remove("is-open");
        if (btn) btn.setAttribute("aria-expanded", "false");
        document.body.classList.remove("nav-menu-open");
        var bd = document.querySelector(".nav-backdrop");
        if (bd) bd.hidden = true;
    }

    function openNav(nav, btn) {
        nav.classList.add("is-open");
        if (btn) btn.setAttribute("aria-expanded", "true");
        document.body.classList.add("nav-menu-open");
        var bd = document.querySelector(".nav-backdrop");
        if (bd) bd.hidden = false;
    }

    function initNavbar(nav) {
        if (!nav || nav.querySelector(".nav-toggle")) return;
        var links = nav.querySelector(".nav-links");
        if (!links) return;

        var backdrop = document.querySelector(".nav-backdrop");
        if (!backdrop) {
            backdrop = document.createElement("div");
            backdrop.className = "nav-backdrop";
            backdrop.hidden = true;
            document.body.appendChild(backdrop);
        }

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nav-toggle";
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-controls", "mcv-nav-panel");
        btn.setAttribute("aria-label", "Abrir menú");
        btn.innerHTML = '<span class="nav-toggle-icon" aria-hidden="true"></span>';

        links.id = links.id || "mcv-nav-panel";
        nav.insertBefore(btn, links);

        btn.addEventListener("click", function () {
            if (nav.classList.contains("is-open")) closeNav(nav, btn);
            else openNav(nav, btn);
        });

        backdrop.addEventListener("click", function () {
            closeNav(nav, btn);
        });

        links.querySelectorAll("a").forEach(function (a) {
            a.addEventListener("click", function () {
                closeNav(nav, btn);
            });
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && nav.classList.contains("is-open")) {
                closeNav(nav, btn);
            }
        });
    }

    function boot() {
        document.querySelectorAll(".navbar").forEach(initNavbar);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
