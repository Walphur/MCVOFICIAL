"use strict";

/**
 * Calendario MCV para elegir tabla de puntos en EU Monthly:
 * - 1.er jueves → 2.º jueves: wipe monthly (tabla Monthly)
 * - 2.º jueves → 4.º jueves (+ rewipe 4 días): tabla Medium en servidor Monthly
 * EU Medium siempre usa tabla Medium.
 */

function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function getNthThursdayOfMonth(year, monthIndex, n) {
    let count = 0;
    for (let day = 1; day <= 31; day += 1) {
        const d = new Date(year, monthIndex, day);
        if (d.getMonth() !== monthIndex) {
            break;
        }
        if (d.getDay() === 4) {
            count += 1;
            if (count === n) {
                return d;
            }
        }
    }
    return null;
}

function resolveMonthlyPeriod(at = new Date()) {
    const y = at.getFullYear();
    const m = at.getMonth();
    const firstThu = getNthThursdayOfMonth(y, m, 1);
    const secondThu = getNthThursdayOfMonth(y, m, 2);
    const fourthThu = getNthThursdayOfMonth(y, m, 4);
    const t = at.getTime();

    if (firstThu && secondThu) {
        const monthlyStart = startOfDay(firstThu).getTime();
        const monthlyEnd = endOfDay(secondThu).getTime();
        if (t >= monthlyStart && t <= monthlyEnd) {
            return {
                configKey: "eu-monthly",
                period: "monthly-main",
                label: "Wipe monthly (1.er jueves al 2.º jueves 23:59)",
                monthlyStart: new Date(monthlyStart).toISOString(),
                monthlyEnd: new Date(monthlyEnd).toISOString()
            };
        }
    }

    if (secondThu && fourthThu) {
        const dayAfterSecondThu = new Date(secondThu.getFullYear(), secondThu.getMonth(), secondThu.getDate() + 1);
        const mediumStart = startOfDay(dayAfterSecondThu).getTime();
        const mediumEnd = endOfDay(new Date(fourthThu.getFullYear(), fourthThu.getMonth(), fourthThu.getDate() + 3)).getTime();
        if (t >= mediumStart && t <= mediumEnd) {
            return {
                configKey: "eu-medium",
                period: "monthly-medium-window",
                label: "Medium en Monthly (desde viernes post 2.º jueves + rewipe)",
                mediumStart: new Date(mediumStart).toISOString(),
                mediumEnd: new Date(mediumEnd).toISOString()
            };
        }
    }

    return {
        configKey: "eu-medium",
        period: "off-season",
        label: "Fuera de ventana monthly (tabla Medium)"
    };
}

function resolveTierConfigKey({ serverKey, at = new Date() }) {
    const key = String(serverKey || "eu-medium").trim();
    if (key === "eu-medium") {
        return {
            serverKey: key,
            configKey: "eu-medium",
            period: "medium-server",
            label: "EU Medium 2x (tabla Medium)",
            at: at.toISOString()
        };
    }
    const monthly = resolveMonthlyPeriod(at);
    return {
        serverKey: "eu-monthly",
        configKey: monthly.configKey,
        period: monthly.period,
        label: monthly.label,
        at: at.toISOString(),
        ...monthly
    };
}

/**
 * Ventana MCV para leer horas posteadas en Discord (wipe Monthly):
 * - Desde 00:00 del día anterior al 2.º jueves (ej. wipe 04/06–11/06 → desde 10/06)
 * - Hasta 23:59 del día anterior al 3.º jueves (ej. hasta 17/06 antes del jueves 18/06 Medium)
 */
function resolvePlaytimeSyncWindow({ referenceDate, wipeStartAt, wipeStartMs } = {}) {
    let ref =
        referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime()) ? referenceDate : new Date();
    if (wipeStartAt instanceof Date && !Number.isNaN(wipeStartAt.getTime())) {
        ref = wipeStartAt;
    } else if (typeof wipeStartMs === "number" && Number.isFinite(wipeStartMs)) {
        ref = new Date(wipeStartMs);
    } else if (typeof wipeStartAt === "string" && wipeStartAt.trim()) {
        const parsed = new Date(wipeStartAt);
        if (!Number.isNaN(parsed.getTime())) {
            ref = parsed;
        }
    }

    const y = ref.getFullYear();
    const m = ref.getMonth();
    const secondThu = getNthThursdayOfMonth(y, m, 2);
    const thirdThu = getNthThursdayOfMonth(y, m, 3);
    if (!secondThu || !thirdThu) {
        return null;
    }

    const windowStart = startOfDay(
        new Date(secondThu.getFullYear(), secondThu.getMonth(), secondThu.getDate() - 1)
    );
    const windowEnd = endOfDay(new Date(thirdThu.getFullYear(), thirdThu.getMonth(), thirdThu.getDate() - 1));

    return {
        windowStartMs: windowStart.getTime(),
        windowEndMs: windowEnd.getTime(),
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        monthlyWipeEnd: endOfDay(secondThu).toISOString(),
        label: `Horas Discord ${windowStart.toLocaleDateString("es-AR")} → ${windowEnd.toLocaleDateString("es-AR")} (23:59)`
    };
}

function isTimestampInPlaytimeWindow(ts, window) {
    if (!window || window.windowStartMs == null || window.windowEndMs == null) {
        return true;
    }
    const t = Number(ts);
    if (!Number.isFinite(t)) {
        return false;
    }
    return t >= window.windowStartMs && t <= window.windowEndMs;
}

module.exports = {
    getNthThursdayOfMonth,
    resolveMonthlyPeriod,
    resolveTierConfigKey,
    resolvePlaytimeSyncWindow,
    isTimestampInPlaytimeWindow,
    startOfDay,
    endOfDay
};
