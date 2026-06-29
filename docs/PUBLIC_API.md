# MCV Public API v1

Capa pública de datos versionada para toda la plataforma frontend.

**Base URL:** `/api/public/v1`  
**Versión:** `1`  
**Autenticación:** ninguna (solo lectura)

---

## Envelope estándar

Todas las respuestas exitosas:

```json
{
  "status": "ok",
  "metadata": {
    "version": "1",
    "resource": "home",
    "cache_ttl_seconds": 60
  },
  "data": { },
  "pagination": null,
  "timestamps": {
    "generated_at": "2026-06-20T12:00:00.000Z"
  }
}
```

Errores:

```json
{
  "status": "error",
  "metadata": { "version": "1" },
  "data": null,
  "pagination": null,
  "timestamps": { "generated_at": "..." },
  "errors": [{ "code": "not_found", "message": "..." }]
}
```

---

## Cache (TTL recomendado)

| Endpoint | TTL | Notas |
|----------|-----|-------|
| `/home` | 60s | Agregado pesado; incluye stream check |
| `/pulse` | 30s | Hero + stream, más dinámico |
| `/player/:steamId` | 60s | Perfil + stats + historial |
| `/standings` | 120s | Ranking oficial server-side |
| `/results` | 120s | Lista paginada |
| `/calendar` | 300s | Torneos + wipes calculados |
| `/search` | 30s | Índice unificado |
| `/team/:id` | 300s | Roster resumido |
| `/tournament/:slug` | 60s | Detalle + bracket opcional |

Headers: `Cache-Control: public, max-age=N, stale-while-revalidate=2N`

---

## Endpoints

### GET `/api/public/v1/home`

**Propósito:** Payload agregado listo para renderizar la Home en **una sola llamada**.

**Parámetros:** `stream=0` desactiva check de streams (más rápido).

**Consumidor:** `index.html` → `mcv-home-view.js`

**Respuesta `data`:**

| Campo | Descripción |
|-------|-------------|
| `hero` | Estado dinámico único (live, stream, campeón, countdown, inscripción, idle) |
| `activity` | Feed cronológico |
| `top_players` | Top 5 ranking oficial |
| `upcoming_events` | Torneos open/closed con slots |
| `recent_results` | Últimos 4 resultados con MVP/runner-up |
| `clan` | Resumen MCV |
| `discord` | Miembros/online (Discord API server-side) |
| `stats` | KPIs plataforma |
| `stream` | Estado Kick/Twitch |

---

### GET `/api/public/v1/pulse`

**Propósito:** Estado «ahora mismo» ligero para hero/widgets.

**Consumidor:** Futuro polling, widgets Now.

---

### GET `/api/public/v1/player/:steamId`

**Propósito:** Modelo público único de jugador.

**Parámetros:** `steamId` — SteamID64 (17 dígitos).

**Errores:** `400 invalid_steam_id`

**Consumidor:** `player/index.html` → `mcv-player-view.js`

**Respuesta `data`:**

| Sección | Campos |
|---------|--------|
| `profile` | display_name, avatar, role, links, is_roster |
| `stats` | tournament_wins, tournaments_played, win_rate, points |
| `achievements` | id, label, unlocked, placeholder |
| `teams` | equipos públicos |
| `history` | historial torneos |
| `activity` | feed reciente |

**Nota:** Scout (K/D, horas) sigue en `POST /escaner-rapido` — no mezclado en este endpoint.

---

### GET `/api/public/v1/standings`

**Propósito:** Ranking oficial centralizado (no calcular en cliente).

**Parámetros:**

| Param | Descripción |
|-------|-------------|
| `season` | Filtrar por temporada (ej. `2026`) |
| `limit` | Máx. filas (default 50) |

**Consumidor:** `standings/index.html` → `mcv-standings-view.js`

**Fórmula puntos:**

- Base roster aprobado: **50 pts**
- Victoria torneo finished: **+100 pts**

---

### GET `/api/public/v1/results`

**Propósito:** Hub de resultados con MVP, runner-up, prize, awards, participantes.

**Parámetros:**

| Param | Descripción |
|-------|-------------|
| `t` / `slug` | Un torneo específico |
| `season` | Filtrar temporada |
| `limit`, `offset` | Paginación |
| `bracket=1` | Incluir bracket (solo con `t`) |

**Consumidor:** `results/index.html` → `mcv-results-view.js`

**Runner-up:** derivado del bracket final si no hay `runner_up_registration_id` en BD.

**MVP:** `tournaments.mvp_name` / `mvp_steam_id64` (admin).

---

### GET `/api/public/v1/calendar`

**Propósito:** Agenda unificada torneos + wipes + streams.

**Consumidor:** `calendar/index.html` → `mcv-calendar-view.js`

**Fuentes:**

- Torneos (`starts_at`, `registration_closes_at`)
- Wipes Vital (`vitalWipeCalendar.js` — fechas calculadas)
- Stream placeholder → `/live.html`

---

### GET `/api/public/v1/search`

**Propósito:** Índice único de búsqueda.

**Parámetros:** `q` (mín. 2 chars), `limit` (default 12)

**Errores:** `400 query_required`, `400 query_too_short`

**Consumidor:** `mcv-search.js` (Ctrl/⌘+K)

**Busca:** jugadores roster, torneos, resultados, páginas nav, clan.

---

### GET `/api/public/v1/team/:id`

**Propósito:** Resumen clan o miembro roster.

**Parámetros:** `id` = `mcv` (clan) o ID numérico de submission aprobada.

**Consumidor:** Home clan widget, futuro `/equipo/`

**Reclutamiento:** env `MCV_TEAM_RECRUITING=true`

---

### GET `/api/public/v1/tournament/:slug`

**Propósito:** Torneo público completo con awards y bracket.

**Parámetros:** `bracket=0` omite matches.

**Consumidor:** `mcv-results-view.js` (detalle), `tournament.html` (futuro)

---

## Aliases

| Alias | Redirige a |
|-------|------------|
| `/api/public/home` | `/api/public/v1/home` |
| `/api/public/pulse` | `/api/public/v1/pulse` |

---

## Endpoints legacy reutilizados (sin cambios)

| Endpoint | Uso |
|----------|-----|
| `POST /escaner-rapido` | Scout jugador (K/D, horas) |
| `/api/tournaments/*` | Admin + registro equipos |
| `/api/team-roster` | Formulario equipo (fallback) |

---

## Schema nuevo (3.2)

```sql
tournaments.season VARCHAR(16)
tournaments.runner_up_registration_id INT
tournaments.mvp_name TEXT
tournaments.mvp_steam_id64 VARCHAR(17)
```

---

## Archivos backend

| Archivo | Rol |
|---------|-----|
| `publicApiEnvelope.js` | Envelope + paginación |
| `publicDataService.js` | Lógica de negocio |
| `publicApi.js` | Rutas Express |
| `test/publicApi.test.js` | Tests unitarios |
