# MCV 3.1 — Sprint 1: Ecosistema Competitivo

**Rama:** `cursor/mcv-3-1-competitive-sprint-cc79`  
**Cache assets:** `2026-06-20-v7`

---

## Resumen

Primera entrega de plataforma competitiva sobre base MDS 2B. Cinco páginas nuevas + buscador global + componente bracket. **Sin cambios en backend ni APIs.**

---

## Nuevas páginas

| URL | Archivo | Estado |
|-----|---------|--------|
| `/player/:steamId` | `player/index.html` | ✅ Utilizable |
| `/results` | `results/index.html` | ✅ Utilizable |
| `/standings` | `standings/index.html` | ✅ Utilizable |
| `/calendar` | `calendar/index.html` | ✅ Utilizable |
| `_redirects` | Pretty URLs (Cloudflare Pages) | ✅ |

Fallback sin redirects: `player/?steamId=7656119…`

---

## Componentes nuevos

| Componente | Archivo | Reutilizable |
|------------|---------|--------------|
| Capa datos cliente | `mcv-compete-core.js` | ✅ |
| Perfil jugador | `mcv-player-view.js` | — |
| Hub resultados | `mcv-results-view.js` | — |
| Rankings | `mcv-standings-view.js` | — |
| Calendario | `mcv-calendar-view.js` | — |
| Bracket visual | `mcv-bracket-view.js` | ✅ |
| Búsqueda global | `mcv-search.js` | ✅ |

## Componentes MDS reutilizados

`mcv-hero`, `mcv-card`, `mcv-stat-bar`, `mcv-list`, `mcv-timeline`, `mcv-achievements`, `mcv-badge`, `mcv-tabs`, `mcv-table`, `mcv-bracket`, `mcv-filter-bar`, `mcv-search-overlay`

---

## APIs utilizadas (existentes)

| Endpoint | Uso |
|----------|-----|
| `GET /api/team-roster` | Perfil, standings, search |
| `POST /escaner-rapido` | Stats jugador (horas, K/D) |
| `GET /api/tournaments` | Resultados, calendar, search |
| `GET /api/tournaments/:slug` | Detalle, perfil (wins) |
| `GET /api/tournaments/:slug/bracket` | Bracket visual |
| `GET /api/wipe-list` | Reservado perfil |

---

## Placeholders pendientes

| Feature | Qué falta |
|---------|-----------|
| Perfil — país, ingreso clan | Sin campo en roster público |
| Perfil — torneos jugados total | Sin API registrations públicas |
| Perfil — MVP logros | Sin `tournament_awards` |
| Resultados — MVP, 2º | Sin podium API |
| Standings — K/D real | Sin scoreboard público |
| Standings — puntos | Fórmula provisional cliente |
| Calendario — wipes | Sin API calendar |
| Search — equipos no campeones | Sin índice teams |

---

## Documentación

- `docs/PLAYER_PROFILE.md`
- `docs/RESULTS_HUB.md`
- `docs/STANDINGS.md`
- `docs/BRACKET_COMPONENT.md`
- `docs/CALENDAR.md`
- `docs/GLOBAL_SEARCH.md`

---

## Deuda técnica restante

1. `GET /api/public/players/:steamId64` — agregación server-side
2. `GET /api/public/standings` — scoreboard público
3. `GET /api/public/calendar` — wipes + streams
4. `GET /api/search?q=` — búsqueda server-side
5. Express fallback routes para pretty URLs en Render (solo `_redirects` hoy)
6. Embed bracket en `tournament.html` (opcional, no requerido Sprint 1)

---

## Commits Sprint 1

1. Perfil jugador + compete-core + MDS competitive CSS
2. Hub resultados + bracket component
3. Rankings / standings
4. Calendario
5. Búsqueda global + nav + i18n
6. Documentación + informe
