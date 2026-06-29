# Home Widgets — MCV 3.1 Sprint 2

## Objetivo

Widgets reutilizables MDS para la Home como centro de actividad.

## Widgets

| Widget | Clase | Uso |
|--------|-------|-----|
| Now | `mcv-widget--now` | Estado dinámico hero (uno solo) |
| Activity | `mcv-widget--activity` | Ítem feed cronológico |
| Event | `mcv-widget--event` | Tarjeta torneo próximo |
| Result | `mcv-widget--result` | Tarjeta resultado |
| Player | `mcv-widget--player` | Fila ranking |
| Team | `mcv-widget--team` | Resumen clan |
| Discord | `mcv-widget--discord` | Bloque CTA Discord |
| Wipe | via Activity | Placeholder wipe |
| News | via Activity | Placeholder noticias |

## Archivos

- `mcv-home-widgets.js` — factories HTML
- `mcv-home-view.js` — orquestación y carga progresiva
- `mds-premium.css` — estilos `.home-hub`, widgets

## API JS

```javascript
mcvHomeWidgets.now(state);
mcvHomeWidgets.activity({ icon, text, time, placeholder });
mcvHomeWidgets.event({ title, status, dateLabel, href, ... });
mcvHomeWidgets.result({ winner, prize, mvp, href, ... });
mcvHomeWidgets.player({ rank, name, avatar, href, points });
mcvHomeWidgets.team({ activeCount, recruiting, preview });
mcvHomeWidgets.discord({ members, online, statusLabel });
```

## Carga progresiva (Home)

1. **Fase 1:** `for-site` + Discord + stats → hero + KPI strip
2. **Fase 2:** torneos + roster + detalles → feed, eventos, resultados, top 5, clan, Discord
3. **Fase 3:** decapi stream status → puede actualizar hero si no hay torneo live

## Placeholders

- MVP / finalista en resultados
- Wipe en feed
- Reclutamiento clan (siempre "Roster cerrado" hasta flag API)
- Puntos top jugadores (fórmula cliente)
