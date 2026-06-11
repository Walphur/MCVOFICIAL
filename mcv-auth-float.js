/**
 * Panel flotante de login (Steam / Google) — home index.
 */
(function (w) {
    function pageId() {
        return (document.body && document.body.getAttribute("data-mcv-page")) || "";
    }

    function apiBase() {
        return typeof w.mcvResolveApiBase === "function"
            ? w.mcvResolveApiBase()
            : String(w.location.origin || "").replace(/\/$/, "");
    }

    function mountHtml() {
        if (document.getElementById("mcv-auth-float")) return null;
        var el = document.createElement("aside");
        el.id = "mcv-auth-float";
        el.className = "mcv-auth-float";
        el.setAttribute("aria-label", "Iniciar sesión");
        el.innerHTML =
            '<p class="mcv-auth-float__tag">// Cuenta MCV</p>' +
            '<div id="mcv-auth-float-guest">' +
            '<p class="mcv-auth-float__title">Iniciá sesión</p>' +
            '<p class="mcv-auth-float__hint">Steam o Google. La primera vez se crea tu cuenta sola.</p>' +
            '<div class="mcv-auth-float__oauth">' +
            '<a id="mcv-auth-float-steam" class="oauth-btn oauth-btn--steam" href="#">Continuar con Steam</a>' +
            '<a id="mcv-auth-float-google" class="oauth-btn oauth-btn--google" href="#">Continuar con Google</a>' +
            '</div>' +
            '<a href="cuenta.html" class="mcv-auth-float__link" style="margin-top:10px;display:inline-block;">Mi cuenta →</a>' +
            '</div>' +
            '<div id="mcv-auth-float-user" hidden>' +
            '<p class="mcv-auth-float__tag">// Sesión activa</p>' +
            '<p class="mcv-auth-float__name" id="mcv-auth-float-name">—</p>' +
            '<p class="mcv-auth-float__meta" id="mcv-auth-float-meta"></p>' +
            '<a href="cuenta.html" class="mcv-auth-float__link">Ver mi cuenta</a>' +
            '<button type="button" class="mcv-auth-float__logout" id="mcv-auth-float-logout">Cerrar sesión</button>' +
            '</div>';
        document.body.appendChild(el);
        return el;
    }

    function showGuest() {
        var guest = document.getElementById("mcv-auth-float-guest");
        var user = document.getElementById("mcv-auth-float-user");
        if (guest) guest.hidden = false;
        if (user) user.hidden = true;
    }

    function showUser(profile) {
        var guest = document.getElementById("mcv-auth-float-guest");
        var userBox = document.getElementById("mcv-auth-float-user");
        var nameEl = document.getElementById("mcv-auth-float-name");
        var metaEl = document.getElementById("mcv-auth-float-meta");
        if (guest) guest.hidden = true;
        if (userBox) userBox.hidden = false;
        if (nameEl) nameEl.textContent = (profile && profile.displayName) || "Usuario";
        if (metaEl) {
            var parts = [];
            if (profile && profile.steamId64) parts.push("Steam");
            if (profile && profile.email) parts.push(profile.email);
            metaEl.textContent = parts.join(" · ");
        }
    }

    function bindButtons(API, opts) {
        if (typeof w.mcvBindPublicOAuthButtons === "function") {
            w.mcvBindPublicOAuthButtons({
                api: API,
                next: "index.html",
                steamEl: "mcv-auth-float-steam",
                googleEl: "mcv-auth-float-google",
                opts: opts
            });
        }
    }

    function init() {
        if (pageId() !== "index") return;

        if (typeof w.mcvCaptureUserTokenFromUrl === "function") {
            w.mcvCaptureUserTokenFromUrl();
        }

        mountHtml();
        var API = apiBase();
        bindButtons(API, typeof w.mcvDefaultOAuthOpts === "function" ? w.mcvDefaultOAuthOpts() : null);

        var optsPromise =
            typeof w.mcvFetchPublicOAuthOptions === "function"
                ? w.mcvFetchPublicOAuthOptions(API)
                : Promise.resolve(null);
        optsPromise.then(function (opts) {
            bindButtons(API, opts);
        });

        var logoutBtn = document.getElementById("mcv-auth-float-logout");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", function () {
                if (typeof w.mcvUserLogout === "function") w.mcvUserLogout();
                showGuest();
            });
        }

        if (typeof w.mcvFetchUserMe === "function" && typeof w.mcvUserToken === "function" && w.mcvUserToken()) {
            w.mcvFetchUserMe().then(function (user) {
                if (user) showUser(user);
                else showGuest();
            });
        } else {
            showGuest();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(window);
