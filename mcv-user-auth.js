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
            var next = qs.toString();
            var path = w.location.pathname.split("/").pop() || "cuenta.html";
            var clean = path + (next ? "?" + next : "");
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
        var next = opts.next || "cuenta.html";
        var base = apiBase();
        var url = (opts.loginPage || "cuenta.html") + "?next=" + encodeURIComponent(next);
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
        return fetch(API + "/api/auth/user/me", {
            headers: w.mcvUserAuthHeaders(),
            cache: "no-store"
        })
            .then(function (r) {
                if (r.status === 401) {
                    w.mcvUserLogout();
                    return null;
                }
                return r.json().then(function (d) {
                    return r.ok && d.user ? d.user : null;
                });
            })
            .catch(function () {
                return null;
            });
    };
})(window);
