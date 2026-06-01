"use strict";

/**
 * Calendario MCV para elegir tabla de puntos en EU Monthly:
 * - 1.er jueves → wipe monthly (tabla Monthly) hasta el rewipe del 4.º jueves
 * - 4.º jueves → rewipe 4 días en monthly (tabla Medium)
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
    const fourthThu = getNthThursdayOfMonth(y, m, 4);
    const t = at.getTime();

    if (fourthThu) {
        const rewipeStart = startOfDay(fourthThu).getTime();
        const rewipeEnd = endOfDay(new Date(fourthThu.getFullYear(), fourthThu.getMonth(), fourthThu.getDate() + 3)).getTime();
        if (t >= rewipeStart && t <= rewipeEnd) {
            return {
                configKey: "eu-medium",
                period: "monthly-rewipe",
                label: "Rewipe 4.º jueves (tabla Medium en Monthly)",
                rewipeStart: new Date(rewipeStart).toISOString(),
                rewipeEnd: new Date(rewipeEnd).toISOString()
            };
        }
    }

    if (firstThu) {
        const monthlyStart = startOfDay(firstThu).getTime();
        const monthlyEnd = fourthThu
            ? startOfDay(fourthThu).getTime() - 1
            : endOfDay(new Date(y, m + 1, 0)).getTime();
        if (t >= monthlyStart && t <= monthlyEnd) {
            return {
                configKey: "eu-monthly",
                period: "monthly-main",
                label: "Wipe monthly (1.er jueves del mes)",
                monthlyStart: new Date(monthlyStart).toISOString(),
                monthlyEnd: new Date(monthlyEnd).toISOString()
            };
        }
    }

    return {
        configKey: "eu-monthly",
        period: "off-season",
        label: "Fuera de ventana monthly (usa Monthly por defecto)"
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
