# Perfil público de jugador — MCV 3.1

## Objetivo

Página de perfil competitivo por SteamID64 que consolida datos públicos existentes en una vista de plataforma (no solo web estática).

**URL:** `/player/:steamId` → `player/index.html?steamId=:steamId` (vía `_redirects`)

## Componentes MDS utilizados

| Componente | Uso |
|------------|-----|
| `mcv-hero--compact` | Cabecera del perfil |
| `mcv-card--profile` | Card identidad (avatar, nombre, badges) |
| `mcv-stat-bar` / `mcv-stat--compact` | KPIs (torneos, K/D, win rate…) |
| `mcv-achievements` | Insignias visuales |
| `mcv-timeline` | Historial de eventos |
| `mcv-list` | Equipos y actividad reciente |
| `mcv-badge` | Estado activo, rol, tags |
| `mcv-gate` | Formulario si no hay SteamID |

## Archivos

- `player/index.html` — shell de página
- `mcv-player-view.js` — renderizado y agregación de datos
- `mcv-compete-core.js` — fetchers compartidos (APIs existentes)

## Datos disponibles (APIs actuales)

| Fuente | Endpoint | Campos usados |
|--------|----------|---------------|
| Roster MCV | `GET /api/team-roster` | `display_name`, `role_label`, `avatar_url`, `steam_id64` |
| Scout | `POST /escaner-rapido` | `nombre`, `avatar`, `horas`, `kills`, `deaths`, `kdr`, `raidingDamage` |
| Torneos | `GET /api/tournaments` + `GET /api/tournaments/:slug` | Campeonatos donde `winner_roster` contiene el SteamID |
| Wipe list | `GET /api/wipe-list` | Reservado para actividad (no expuesto aún en UI) |

## Placeholders implementados

| Campo | Estado |
|-------|--------|
| País | Badge `País: —` |
| Fecha ingreso clan | Inferida parcialmente por roster; sin fecha exacta |
| Torneos jugados (total) | Solo campeonatos detectados en winner_roster |
| Derrotas / Win rate | Parcial — requiere historial de partidas |
| MVP | Insignia bloqueada hasta `tournament_awards` |
| Cambios de equipo | Timeline placeholder |
| Últimos wipes | Item placeholder en actividad |

## APIs futuras necesarias

```
GET /api/public/players/:steamId64
GET /api/public/players/:steamId64/tournaments
GET /api/public/players/:steamId64/achievements
```

## Verificación

1. Abrir `/player/76561197960287930` (ejemplo Steam)
2. O `/player/?steamId=7656119…`
3. Miembro del roster MCV debe mostrar badge Activo · MCV
4. Campeón de torneo finalizado debe mostrar logro Champion
