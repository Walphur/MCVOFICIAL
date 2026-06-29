# Ranking / Standings — MCV 3.1

## Objetivo

Página `/standings` con tablas de jugadores y equipos ordenables.

## Componentes MDS

- `mcv-tabs`, `mcv-table`, `mcv-filter-bar`, `mcv-table__rank`

## Archivos

- `standings/index.html`
- `mcv-standings-view.js`

## APIs utilizadas

- `GET /api/team-roster` — jugadores MCV
- `GET /api/tournaments` + detail — wins de equipos campeones

## Placeholders

- K/D por jugador — requiere Vital/scout batch
- Puntos — fórmula provisional (100 por win campeón, base roster)
- Temporada/wipe filters — UI sin backend

## API futura

`GET /api/public/standings?scope=players|teams&season=&wipe=`
