/**
 * Botones OAuth públicos (Steam / Google) — visibles de inmediato, config opcional desde API.
 */
(function (w) {
    var DEFAULT_OPTS = { steamEnabled: true, googleEnabled: true };

    function apiBase(explicit) {
        if (explicit) return String(explicit).replace(/\/$/, "");
        return typeof w.mcvResolveApiBase === "function"
            ? w.mcvResolveApiBase()
            : String(w.location.origin || "").replace(/\/$/, "");
    }

    w.mcvDefaultOAuthOpts = function mcvDefaultOAuthOpts() {
        return { steamEnabled: true, googleEnabled: true, ticketsRequireAuth: true };
    };

    w.mcvBindPublicOAuthButtons = function mcvBindPublicOAuthButtons(cfg) {
        cfg = cfg || {};
        var API = apiBase(cfg.api);
        var opts = cfg.opts || DEFAULT_OPTS;
        var next = String(cfg.next || "cuenta.html").replace(/^\/+/, "");
        var q = "?next=" + encodeURIComponent(next);
        var steamEl = typeof cfg.steamEl === "string" ? document.getElementById(cfg.steamEl) : cfg.steamEl;
        var googleEl = typeof cfg.googleEl === "string" ? document.getElementById(cfg.googleEl) : cfg.googleEl;

        if (steamEl) {
            var steamOn = opts.steamEnabled !== false;
            steamEl.hidden = !steamOn;
            if (steamOn && API) {
                var steamUrl = API + "/api/auth/user/steam/start" + q;
                if (cfg.linkJwt) {
                    steamUrl += "&linkJwt=" + encodeURIComponent(String(cfg.linkJwt));
                }
                steamEl.href = steamUrl;
            }
        }
        if (googleEl) {
            var googleOn = opts.googleEnabled !== false;
            googleEl.hidden = !googleOn;
            if (googleOn && API) googleEl.href = API + "/api/auth/user/google/start" + q;
        }
    };

    w.mcvFetchPublicOAuthOptions = function mcvFetchPublicOAuthOptions(api) {
        var API = apiBase(api);
        if (!API) {
            return Promise.resolve(w.mcvDefaultOAuthOpts());
        }
        var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        var timer = ctrl
            ? w.setTimeout(function () {
                  try {
                      ctrl.abort();
                  } catch (e) {}
              }, 8000)
            : null;
        return fetch(API + "/api/auth/user/options", {
            cache: "no-store",
            signal: ctrl ? ctrl.signal : undefined
        })
            .then(function (r) {
                return r.json();
            })
            .then(function (opts) {
                if (timer) w.clearTimeout(timer);
                return opts && typeof opts === "object" ? opts : w.mcvDefaultOAuthOpts();
            })
            .catch(function () {
                if (timer) w.clearTimeout(timer);
                return w.mcvDefaultOAuthOpts();
            });
    };

    w.mcvBindAdminOAuthButtons = function mcvBindAdminOAuthButtons(cfg) {
        cfg = cfg || {};
        var API = apiBase(cfg.api);
        var opts = cfg.opts || {};
        var wrap = typeof cfg.wrapEl === "string" ? document.getElementById(cfg.wrapEl) : cfg.wrapEl;
        var steamEl = typeof cfg.steamEl === "string" ? document.getElementById(cfg.steamEl) : cfg.steamEl;
        var googleEl = typeof cfg.googleEl === "string" ? document.getElementById(cfg.googleEl) : cfg.googleEl;
        if (!wrap) return;

        var steamOn = !!opts.steamLoginEnabled;
        var googleOn = !!opts.googleLoginEnabled;
        if (!steamOn && !googleOn) {
            wrap.hidden = true;
            return;
        }
        wrap.hidden = false;
        if (steamEl) {
            steamEl.hidden = !steamOn;
            if (steamOn && API) steamEl.href = API + "/api/auth/steam/start";
        }
        if (googleEl) {
            googleEl.hidden = !googleOn;
            if (googleOn && API) googleEl.href = API + "/api/auth/google/start";
        }
    };
})(window);
