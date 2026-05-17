/**
 * Borra del almacenamiento la URL de API incorrecta (docs viejos con guión).
 * Debe cargarse inmediatamente ANTES de mcv-api-base.js.
 */
(function (w) {
    var KEY = "mcv_api_base";
    var BAD = "mcv-oficial.onrender.com";
    function clean(storage) {
        if (!storage || !storage.getItem) return;
        try {
            var v = String(storage.getItem(KEY) || "");
            if (v.indexOf(BAD) !== -1) storage.removeItem(KEY);
        } catch (e) {}
    }
    clean(w.localStorage);
    clean(w.sessionStorage);
})(window);
