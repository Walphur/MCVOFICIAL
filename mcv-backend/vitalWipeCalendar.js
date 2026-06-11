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

module.exports = {
    getNthThursdayOfMonth,
    resolveMonthlyPeriod,
    resolveTierConfigKey
};
