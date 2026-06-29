# MCV 3.1 Sprint 2 — Home como Centro de la Plataforma

**Rama:** `cursor/mcv-3-1-home-hub-cc79`  
**Cache:** `2026-06-20-v8`

---

## Objetivo cumplido

La Home responde **«¿Qué está pasando en MCV ahora mismo?»** con estado dinámico, feed de actividad y widgets de plataforma — sin nuevas páginas ni cambios backend.

---

## Widgets nuevos

| Widget | Archivo |
|--------|---------|
| Now, Activity, Event, Result, Player, Team, Discord, Wipe, News | `mcv-home-widgets.js` |

## Componentes MDS reutilizados

`mcv-hero`, `pulse-now`, `mcv-badge`, `mcv-card`, `mcv-stat`, `mcv-chip`, `mcv-btn`, `mcv-link`, `mcv-skeleton`, `mcv-empty`

---

## Secciones Home

| Sección | Fuente de datos |
|---------|-----------------|
| Hero dinámico | `/api/tournaments/for-site`, torneos open, decapi streams |
| Actividad reciente | Torneos finished, inscripciones, roster, stream |
| Próximos eventos | `/api/tournaments` + detail (slots) |
| Resultados recientes | Torneos finished + detail |
| Top 5 jugadores | `/api/team-roster` + wins campeón |
| Clan | Roster + `/api/tournaments/stats` |
| Discord | Discord invite API |
| Búsqueda | `mcv-search.js` (Ctrl+K + botón visible) |

---

## Rendimiento estimado

| Fase | Requests | Contenido |
|------|----------|-----------|
| 1 (inmediato) | 3 | Hero + stats strip |
| 2 (secundario) | ~10 | Feed + widgets |
| 3 (deferred) | 2 | Stream check (decapi) |

Hero y stats visibles antes que feed/widgets. Sin bloquear render inicial.

---

## Placeholders

- MVP / finalista en tarjetas resultado
- Wipe en feed (etiqueta «Próximamente»)
- Puntos ranking (fórmula cliente, no scoreboard público)
- Estado reclutamiento clan

---

## Mejoras futuras

1. `GET /api/public/calendar` — wipes reales en feed
2. `GET /api/public/standings` — K/D y puntos reales en top 5
3. `tournament_awards` — MVP en resultados
4. WebSocket / SSE para feed en tiempo real
5. Flag `recruiting` en team-roster API

---

## Commits

1. Widgets MDS + compete-core helpers
2. Home hub layout + hero + activity
3. Eventos, resultados, top players, clan, Discord
4. Documentación + cache v8
