# Calendario — MCV 3.1

## Objetivo

Página `/calendar` con línea de tiempo de torneos, wipes y streams.

## Componentes MDS

- `mcv-timeline`, `mcv-chip` (filtros por tipo)

## Archivos

- `calendar/index.html`
- `mcv-calendar-view.js`

## APIs utilizadas

- `GET /api/tournaments` — `starts_at`, `registration_closes_at`, status

## Placeholders

- Wipes — evento placeholder hasta API pública de fases
- Streams — enlace estático a `live.html`

## API futura

`GET /api/public/calendar` — merge torneos + wipe phases + live schedule
