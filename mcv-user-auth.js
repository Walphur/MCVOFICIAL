/**
 * Sesión pública MCV (Steam / Google) — token en sessionStorage.
 */
(function (w) {
    var KEY = "mcv_user_jwt";

    function apiBase() {
        return typeof w.mcvResolveApiBase === "function"
            ? w.mcvResolveApiBase()
            : String(w.location.origin || "").replace(/\/$/, "");
    }

    w.mcvUserToken = function mcvUserToken() {
        try {
            return String(w.sessionStorage.getItem(KEY) || "").trim();
        } catch (e) {
            return "";
        }
    };

    w.mcvUserAuthHeaders = function mcvUserAuthHeaders(extra) {
        var h = { "Content-Type": "application/json" };
        var tok = w.mcvUserToken();
        if (tok) {
            h.Authorization = "Bearer " + tok;
        }
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
            }
        }
        return h;
    };

    w.mcvUserLogout = function mcvUserLogout() {
        try {
            w.sessionStorage.removeItem(KEY);
        } catch (e) {}
    };

    w.mcvCaptureUserTokenFromUrl = function mcvCaptureUserTokenFromUrl() {
        try {
            var qs = new URLSearchParams(w.location.search || "");
            var tok = String(qs.get("token") || "").trim();
            if (!tok) return false;
            w.sessionStorage.setItem(KEY, tok);
            qs.delete("token");
            var extra = qs.toString();
            var path = w.location.pathname || "/";
            var clean = path + (extra ? "?" + extra : "");
            w.history.replaceState(null, "", clean);
            return true;
        } catch (e) {
            return false;
        }
    };

    w.mcvRequireUserLogin = function mcvRequireUserLogin(opts) {
        opts = opts || {};
        w.mcvCaptureUserTokenFromUrl();
        if (w.mcvUserToken()) {
            return true;
        }
        var next = String(opts.next || "cuenta").replace(/^\/+/, "");
        var loginPage = opts.loginPage || "/cuenta";
        var url = loginPage + "?next=" + encodeURIComponent(next);
        if (opts.redirect !== false) {
            w.location.href = url;
        }
        return false;
    };

    w.mcvFetchUserMe = function mcvFetchUserMe() {
        var API = apiBase();
        var tok = w.mcvUserToken();
        if (!API || !tok) {
            return Promise.resolve(null);
        }
        var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        var timer = ctrl
            ? w.setTimeout(function () {
                  try {
                      ctrl.abort();
                  } catch (e) {}
              }, 8000)
            : null;
        return fetch(API + "/api/auth/user/me", {
            headers: w.mcvUserAuthHeaders(),
            cache: "no-store",
            signal: ctrl ? ctrl.signal : undefined
        })
            .then(function (r) {
                if (timer) w.clearTimeout(timer);
                if (r.status === 401) {
                    w.mcvUserLogout();
                    return null;
                }
                return r.json().then(function (d) {
                    return r.ok && d.user ? d.user : null;
                });
            })
            .catch(function () {
                if (timer) w.clearTimeout(timer);
                return null;
            });
    };
})(window);
