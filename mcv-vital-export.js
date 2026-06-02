"use strict";

(function (global) {
    var STATUS_LABELS = {
        admin: "Admin",
        mcv_active: "MCV activo",
        mcv_inactive: "Inactivo",
        mcv_strikes: "Strikes",
        wipe_guest: "Invitado wipe"
    };

    var PHASE_LABELS = {
        inicio: "Inicio wipe",
        late: "Late wipe",
        no_juega: "No juega",
        unknown: "—"
    };

    var COLORS = {
        headerBg: "FFFAA61A",
        headerFg: "FF000000",
        titleBg: "FF0A0A0A",
        titleFg: "FFFFFFFF",
        metaBg: "FF141414",
        metaFg: "FFB0B0B0",
        zebra: "FF101010",
        border: "FF2A2A2A",
        puntos: {
            excellent: "FFD1FAE5",
            good: "FFE8F5EE",
            risk: "FFFEF3C7",
            critical: "FFFEE2E2",
            info: "FFE5E7EB"
        },
        puntosFont: {
            excellent: "FF166534",
            good: "FF15803D",
            risk: "FFB45309",
            critical: "FFB91C1C",
            info: "FF4B5563"
        }
    };

    function riskLevel(row) {
        if (!row) {
            return "info";
        }
        if (row.pausedOutsideWipe || row.wipePhase === "no_juega") {
            return "info";
        }
        var pts = Number(row.performanceScore || 0);
        var strikes = Number(row.strikes || 0);
        if (pts <= -10 || strikes >= 2) {
            return "critical";
        }
        if (pts < 0 || strikes >= 1) {
            return "risk";
        }
        if (pts >= 15) {
            return "excellent";
        }
        return "good";
    }

    function riskLabel(level) {
        return (
            {
                critical: "Crítico",
                risk: "Riesgo",
                good: "Bien",
                excellent: "Excelente",
                info: "Pausado"
            }[level] || "—"
        );
    }

    function thinBorder() {
        return {
            top: { style: "thin", color: { argb: COLORS.border } },
            left: { style: "thin", color: { argb: COLORS.border } },
            bottom: { style: "thin", color: { argb: COLORS.border } },
            right: { style: "thin", color: { argb: COLORS.border } }
        };
    }

    function styleCell(cell, opts) {
        if (!cell) {
            return;
        }
        if (opts.font) {
            cell.font = Object.assign({}, cell.font || {}, opts.font);
        }
        if (opts.fill) {
            cell.fill = opts.fill;
        }
        if (opts.alignment) {
            cell.alignment = Object.assign({}, cell.alignment || {}, opts.alignment);
        }
        cell.border = thinBorder();
    }

    function cellText(val) {
        if (val == null || val === "") {
            return "";
        }
        return String(val);
    }

    function measureText(val, colKey) {
        var text = cellText(val);
        var len = text.length;
        if (colKey === "steamId64") {
            return Math.ceil(len * 1.08);
        }
        if (colKey === "displayName") {
            return Math.ceil(len * 1.05);
        }
        return len;
    }

    function autoFitColumns(ws, columns, headerRowNum, mapped) {
        var minWidth = 8;
        var maxWidth = 200;
        var padding = 2.5;

        columns.forEach(function (col, colIdx) {
            var maxLen = measureText(col.header, col.key);
            mapped.forEach(function (row) {
                var len = measureText(row[col.key], col.key);
                if (len > maxLen) {
                    maxLen = len;
                }
            });
            var width = Math.max(minWidth, Math.min(maxLen + padding, maxWidth));
            ws.getColumn(colIdx + 1).width = width;
        });

        for (var r = headerRowNum + 1; r <= headerRowNum + mapped.length; r += 1) {
            ws.getRow(r).height = 20;
        }
    }

        var level = riskLevel(row);
        return {
            displayName: String(row.displayName || "").trim(),
            steamId64: String(row.steamId64 || "").trim(),
            statusTag: STATUS_LABELS[row.statusTag] || row.statusTag || "",
            wipePhase: PHASE_LABELS[row.wipePhase] || row.wipePhase || "",
            strikes: Number(row.strikes || 0),
            combatsLost: Number(row.combatsLost || 0),
            minisLost: Number(row.minisLost || 0),
            hoursPlayed: row.hoursPlayed != null && row.hoursPlayed !== "" ? Number(row.hoursPlayed) : "",
            roleLabel: (row.roleLabels && row.roleLabels.length ? row.roleLabels.join("; ") : row.roleLabel) || "",
            vouchBy: String(row.vouchBy || "").trim(),
            entryDate: row.entryDate ? String(row.entryDate).slice(0, 10) : "",
            paused: row.pausedOutsideWipe || row.wipePhase === "no_juega" ? "Sí" : "No",
            performanceScore: Number(row.performanceScore || 0),
            nivel: riskLabel(level),
            _riskLevel: level
        };
    }

    async function exportPlayerInfoXlsx(players, opts) {
        var Excel = global.ExcelJS;
        if (!Excel) {
            throw new Error("ExcelJS no cargado");
        }
        var list = Array.isArray(players) ? players : [];
        if (!list.length) {
            throw new Error("Sin filas para exportar");
        }

        var options = opts && typeof opts === "object" ? opts : {};
        var columns = [
            { header: "Nombre", key: "displayName" },
            { header: "SteamID64", key: "steamId64" },
            { header: "Estado", key: "statusTag" },
            { header: "Fase wipe", key: "wipePhase" },
            { header: "Strikes", key: "strikes" },
            { header: "Combats perd.", key: "combatsLost" },
            { header: "Minis perd.", key: "minisLost" },
            { header: "Horas", key: "hoursPlayed" },
            { header: "Roles", key: "roleLabel" },
            { header: "Vouch", key: "vouchBy" },
            { header: "Entrada", key: "entryDate" },
            { header: "Pausado", key: "paused" },
            { header: "Puntos", key: "performanceScore" },
            { header: "Nivel", key: "nivel" }
        ];
        var lastColLetter = String.fromCharCode(64 + columns.length);

        var wb = new Excel.Workbook();
        wb.creator = "MCV";
        wb.created = new Date();

        var ws = wb.addWorksheet("Info jugadores", {
            views: [{ state: "frozen", ySplit: 4, activeCell: "A5" }]
        });

        ws.mergeCells("A1:" + lastColLetter + "1");
        styleCell(ws.getCell("A1"), {
            font: { bold: true, size: 14, color: { argb: COLORS.titleFg } },
            fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.titleBg } },
            alignment: { vertical: "middle", horizontal: "left", indent: 1 }
        });
        ws.getCell("A1").value = options.title || "MCV — Info jugadores (wipe)";
        ws.getRow(1).height = 28;

        ws.mergeCells("A2:" + lastColLetter + "2");
        var exportedAt = new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
        ws.getCell("A2").value =
            "Exportado: " +
            exportedAt +
            " · Jugadores: " +
            list.length +
            (options.serverLabel ? " · Servidor: " + options.serverLabel : "");
        styleCell(ws.getCell("A2"), {
            font: { size: 10, color: { argb: COLORS.metaFg } },
            fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.metaBg } },
            alignment: { vertical: "middle", horizontal: "left", indent: 1 }
        });
        ws.getRow(2).height = 20;

        var headerRowNum = 4;
        var headerRow = ws.getRow(headerRowNum);
        columns.forEach(function (col, idx) {
            var cell = headerRow.getCell(idx + 1);
            cell.value = col.header;
            styleCell(cell, {
                font: { bold: true, color: { argb: COLORS.headerFg } },
                fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } },
                alignment: { vertical: "middle", horizontal: "center", wrapText: false }
            });
        });
        headerRow.height = 24;

        var mapped = list.map(mapPlayerRow);
        mapped.forEach(function (row, idx) {
            var excelRow = ws.getRow(headerRowNum + 1 + idx);
            columns.forEach(function (col, colIdx) {
                excelRow.getCell(colIdx + 1).value = row[col.key];
            });

            var level = row._riskLevel;
            var zebra = idx % 2 === 1;
            columns.forEach(function (col, colIdx) {
                var cell = excelRow.getCell(colIdx + 1);
                var fillArgb = zebra ? COLORS.zebra : "FF0B0B0B";
                var font = { color: { argb: "FFF4F4F5" } };

                if (col.key === "performanceScore" || col.key === "nivel") {
                    fillArgb = COLORS.puntos[level] || fillArgb;
                    font = { bold: true, color: { argb: COLORS.puntosFont[level] || "FFF4F4F5" } };
                } else if (col.key === "strikes" && Number(row.strikes) > 0) {
                    font = { bold: true, color: { argb: "FFEF4444" } };
                } else if (col.key === "displayName") {
                    font = { bold: true, color: { argb: "FFFFFFFF" } };
                } else if (col.key === "steamId64") {
                    font = { name: "JetBrains Mono", size: 10, color: { argb: "FFD4D4D8" } };
                }

                styleCell(cell, {
                    font: font,
                    fill: { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } },
                    alignment: {
                        vertical: "middle",
                        horizontal: col.key === "performanceScore" || col.key === "strikes" ? "center" : "left",
                        wrapText: false,
                        shrinkToFit: false
                    }
                });
            });
        });

        autoFitColumns(ws, columns, headerRowNum, mapped);

        var lastDataRow = headerRowNum + mapped.length;
        ws.autoFilter = {
            from: { row: headerRowNum, column: 1 },
            to: { row: lastDataRow, column: columns.length }
        };

        var buffer = await wb.xlsx.writeBuffer();
        var blob = new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = options.filename || "mcv-info-jugadores.xlsx";
        a.click();
        URL.revokeObjectURL(a.href);
    }

    global.McvVitalExport = {
        exportPlayerInfoXlsx: exportPlayerInfoXlsx,
        riskLevel: riskLevel,
        riskLabel: riskLabel
    };
})(typeof window !== "undefined" ? window : globalThis);
