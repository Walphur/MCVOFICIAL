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

function getNextMonthYearMonth(year, monthIndex) {
    if (monthIndex >= 11) {
        return { year: year + 1, monthIndex: 0 };
    }
    return { year, monthIndex: monthIndex + 1 };
}

function dayBeforeStart(d) {
    return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

function detectPlaytimePhase({ wipeStart, at = new Date() }) {
    if (wipeStart instanceof Date && !Number.isNaN(wipeStart.getTime())) {
        const y = wipeStart.getFullYear();
        const m = wipeStart.getMonth();
        const firstThu = getNthThursdayOfMonth(y, m, 1);
        const secondThu = getNthThursdayOfMonth(y, m, 2);
        if (firstThu && secondThu) {
            const mediumStart = startOfDay(
                new Date(secondThu.getFullYear(), secondThu.getMonth(), secondThu.getDate() + 1)
            );
            const wipeStartMs = startOfDay(wipeStart).getTime();
            if (wipeStartMs >= mediumStart.getTime()) {
                return { phase: "monthly-medium-window", year: y, monthIndex: m };
            }
            if (wipeStartMs >= startOfDay(firstThu).getTime() && wipeStartMs < mediumStart.getTime()) {
                return { phase: "monthly-main", year: y, monthIndex: m };
            }
        }
    }
    const period = resolveMonthlyPeriod(at);
    if (period.period === "monthly-main") {
        const d = at instanceof Date ? at : new Date();
        return { phase: "monthly-main", year: d.getFullYear(), monthIndex: d.getMonth() };
    }
    if (period.period === "monthly-medium-window") {
        const d = at instanceof Date ? at : new Date();
        return { phase: "monthly-medium-window", year: d.getFullYear(), monthIndex: d.getMonth() };
    }
    return { phase: "off-season", year: null, monthIndex: null };
}

function buildMonthlyMainPlaytimeWindow(year, monthIndex) {
    const secondThu = getNthThursdayOfMonth(year, monthIndex, 2);
    const thirdThu = getNthThursdayOfMonth(year, monthIndex, 3);
    if (!secondThu || !thirdThu) {
        return null;
    }
    const windowStart = dayBeforeStart(secondThu);
    const windowEnd = endOfDay(new Date(thirdThu.getFullYear(), thirdThu.getMonth(), thirdThu.getDate() - 1));
    return {
        phase: "monthly-main",
        windowStartMs: windowStart.getTime(),
        windowEndMs: windowEnd.getTime(),
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        monthlyWipeEnd: endOfDay(secondThu).toISOString(),
        label: `Horas Monthly ${windowStart.toLocaleDateString("es-AR")} → ${windowEnd.toLocaleDateString("es-AR")} (23:59)`
    };
}

function buildMediumRewipePlaytimeWindow(year, monthIndex) {
    const thirdThu = getNthThursdayOfMonth(year, monthIndex, 3);
    const fourthThu = getNthThursdayOfMonth(year, monthIndex, 4);
    if (!thirdThu || !fourthThu) {
        return null;
    }
    const mediumEnd = endOfDay(
        new Date(fourthThu.getFullYear(), fourthThu.getMonth(), fourthThu.getDate() + 3)
    );
    const windowStart = startOfDay(thirdThu);
    const next = getNextMonthYearMonth(year, monthIndex);
    const nextFirstThu = getNthThursdayOfMonth(next.year, next.monthIndex, 1);
    if (!nextFirstThu) {
        return null;
    }
    const windowEnd = endOfDay(new Date(nextFirstThu.getFullYear(), nextFirstThu.getMonth(), nextFirstThu.getDate() - 1));
    return {
        phase: "monthly-medium-window",
        windowStartMs: windowStart.getTime(),
        windowEndMs: windowEnd.getTime(),
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        mediumRewipeEnd: mediumEnd.toISOString(),
        label: `Horas Medium ${windowStart.toLocaleDateString("es-AR")} → ${windowEnd.toLocaleDateString("es-AR")} (23:59)`
    };
}

/**
 * Ventanas MCV para leer horas posteadas en Discord (servidor EU Monthly):
 *
 * 1) Wipe Monthly (1.er → 2.º jueves): desde día anterior al 2.º jueves hasta día anterior al 3.º jueves.
 *    Ej. wipe 04/06–11/06 → horas del 10/06 al 17/06.
 *
 * 2) Medium (desde el 3.er jueves, reset de horas): hasta día anterior al 1.er jueves del mes siguiente.
 *    Ej. wipe medium junio → horas del 18/06 al 01/07.
 *
 * 3) Entre rewipe y próximo Monthly (off-season): sin ventana activa — no se toman horas viejas.
 */
function resolvePlaytimeSyncWindow({ referenceDate, wipeStartAt, wipeStartMs, at } = {}) {
    let wipeStart = null;
    if (wipeStartAt instanceof Date && !Number.isNaN(wipeStartAt.getTime())) {
        wipeStart = wipeStartAt;
    } else if (typeof wipeStartMs === "number" && Number.isFinite(wipeStartMs)) {
        wipeStart = new Date(wipeStartMs);
    } else if (typeof wipeStartAt === "string" && wipeStartAt.trim()) {
        const parsed = new Date(wipeStartAt);
        if (!Number.isNaN(parsed.getTime())) {
            wipeStart = parsed;
        }
    }

    const now =
        at instanceof Date && !Number.isNaN(at.getTime())
            ? at
            : referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
              ? referenceDate
              : new Date();

    const detected = detectPlaytimePhase({ wipeStart, at: now });

    if (detected.phase === "monthly-main") {
        return buildMonthlyMainPlaytimeWindow(detected.year, detected.monthIndex);
    }
    if (detected.phase === "monthly-medium-window") {
        return buildMediumRewipePlaytimeWindow(detected.year, detected.monthIndex);
    }

    const next = getNextMonthYearMonth(now.getFullYear(), now.getMonth());
    const upcomingMonthly = buildMonthlyMainPlaytimeWindow(next.year, next.monthIndex);
    return {
        phase: "off-season",
        windowStartMs: null,
        windowEndMs: null,
        windowStart: null,
        windowEnd: null,
        label: "Sin ventana activa (entre rewipe y próximo Monthly)",
        hint:
            upcomingMonthly && upcomingMonthly.windowStart
                ? `Próxima ventana Monthly: ${new Date(upcomingMonthly.windowStartMs).toLocaleDateString("es-AR")} → ${new Date(upcomingMonthly.windowEndMs).toLocaleDateString("es-AR")}`
                : null
    };
}

function isTimestampInPlaytimeWindow(ts, window) {
    if (!window) {
        return true;
    }
    if (window.phase === "off-season") {
        return false;
    }
    if (window.windowStartMs == null || window.windowEndMs == null) {
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
    detectPlaytimePhase,
    isTimestampInPlaytimeWindow,
    startOfDay,
    endOfDay
};
