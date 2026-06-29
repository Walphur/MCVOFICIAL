# Hub de resultados — MCV 3.1

## Objetivo

Página `/results` con historial de torneos finalizados, filtros y detalle con bracket.

## Componentes MDS

- `mcv-hero--compact`, `mcv-filter-bar`, `mcv-card--hof`
- `mcv-stat--compact` (campeón, prize, MVP placeholder)
- `McvBracketView` (componente bracket)

## Archivos

- `results/index.html`
- `mcv-results-view.js`
- `mcv-bracket-view.js`

## APIs utilizadas

- `GET /api/tournaments` — lista torneos finished
- `GET /api/tournaments/:slug` — detalle ganador, prize
- `GET /api/tournaments/:slug/bracket` — partidas

## Placeholders

- MVP, 2º puesto — sin schema `tournament_awards`
- Filtro temporada/wipe — UI lista; tags no existen en DB
- Filtro jugador — búsqueda textual en título/ganador

## API futura

`GET /api/tournaments/results?season=&wipe=`
