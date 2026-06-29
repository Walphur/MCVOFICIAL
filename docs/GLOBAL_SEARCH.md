# Búsqueda global — MCV 3.1

## Objetivo

Command palette para encontrar jugadores, equipos, torneos y resultados.

## Activación

- Botón lupa en navbar
- Atajo `Ctrl+K` / `⌘K`

## Componentes MDS

- `mcv-search-overlay`, `mcv-search-panel`, `mcv-search-result`

## Archivo

- `mcv-search.js` (carga lazy vía `mcv-layout.js`)

## Índice (cliente)

Construido al abrir desde:

- `GET /api/tournaments`
- `GET /api/team-roster`

## Placeholders / límites

- Sin búsqueda server-side
- Máximo 12 resultados visibles
- Equipos no campeones no indexados como entidad separada

## API futura

`GET /api/search?q=` — índice unificado server-side
