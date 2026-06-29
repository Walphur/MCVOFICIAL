# MCV 3.2 — Public Data Platform

**Rama:** `cursor/mcv-3-2-public-api-cc79`  
**Cache frontend:** `2026-06-20-v9`

---

## Objetivo cumplido

Capa pública de datos versionada (`/api/public/v1/*`) con envelope consistente. El frontend deja de reconstruir rankings, resultados y home agregada en cliente.

---

## Endpoints nuevos

| Endpoint | TTL |
|----------|-----|
| `GET /api/public/v1/home` | 60s |
| `GET /api/public/v1/pulse` | 30s |
| `GET /api/public/v1/player/:steamId` | 60s |
| `GET /api/public/v1/standings` | 120s |
| `GET /api/public/v1/results` | 120s |
| `GET /api/public/v1/calendar` | 300s |
| `GET /api/public/v1/search` | 30s |
| `GET /api/public/v1/team/:id` | 300s |
| `GET /api/public/v1/tournament/:slug` | 60s |

Aliases: `/api/public/home`, `/api/public/pulse`

---

## Endpoints reutilizados (sin romper)

- `/api/tournaments/*` — CRUD y registro intactos
- `/api/team-roster` — fallback formulario
- `POST /escaner-rapido` — scout K/D (player profile)
- `/api/tournaments/:slug/bracket` — bracket view

---

## Cálculos eliminados del frontend

| Antes (cliente) | Ahora (backend) |
|-----------------|-----------------|
| Home: 15+ fetches + hero/feed/ranking | 1× `/home` |
| Standings: roster index + wins merge | `/standings` |
| Results: MVP/runner-up hardcoded | `/results` + bracket derivation |
| Calendar: wipe placeholder estático | `/calendar` + vitalWipeCalendar |
| Search: índice local torneos+roster | `/search` server-side |
| Player: 12× detail + wins derive | `/player` + scout |

---

## Placeholders reemplazados

| Placeholder | Estado |
|-------------|--------|
| Runner-up en resultados | ✅ Derivado del bracket o BD |
| Wipe en feed/calendar | ✅ Fechas calculadas Vital |
| Puntos top 5 / standings | ✅ Fórmula oficial server |
| Temporadas en filtros | ✅ Campo `season` en torneos |
| MVP | ⚠️ BD (`mvp_name`) — null hasta admin asigne |
| K/D en standings | ⚠️ null — requiere scoreboard Vital público |
| País jugador | ⚠️ null |
| Transfers historial | ⚠️ pendiente API |

---

## Rendimiento estimado

| Página | Antes | Después |
|--------|-------|---------|
| Home | ~15 requests | **1 request** (+ cache 60s) |
| Standings | ~17 requests | **1 request** |
| Results list | 1 + N detail | **1 request** paginado |
| Calendar | 1 + placeholders | **1 request** |
| Search | 2 preload + filter local | **1 request** por query |
| Player | ~15 requests | **2 requests** (player + scout) |

---

## Deuda técnica restante

1. Integrar scoreboard Vital en `/standings` (K/D real)
2. Admin UI para MVP / runner-up manual override
3. Migrar `tournament.html` a `/api/public/v1/tournament/:slug`
4. WebSocket/SSE para pulse en tiempo real
5. `GET /api/public/v1/news` — anuncios CMS

---

## Commits

1. `feat(api): envelope, schema awards y publicDataService`
2. `feat(api): rutas /api/public/v1 y tests`
3. `feat(frontend): fetchers public API en compete-core`
4. `feat(home): una sola llamada /api/public/v1/home`
5. `feat(frontend): migrar standings, results, calendar, search, player`
6. `docs: PUBLIC_API + informe 3.2 + cache v9`

---

## Documentación

- `docs/PUBLIC_API.md` — contrato completo por endpoint
