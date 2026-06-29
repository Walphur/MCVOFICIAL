# Bracket moderno — MCV 3.1

## Objetivo

Componente visual reutilizable de solo lectura. No modifica lógica de torneos ni admin.

## Uso

```javascript
McvBracketView(document.getElementById("container"), "slug-del-torneo");
// o
McvBracketView("container-id", "slug-del-torneo", { onReady: function(data) {} });
```

## Componentes MDS

- `mcv-bracket`, `mcv-bracket__round`, `mcv-bracket__match`, `mcv-bracket__side`

## Archivo

- `mcv-bracket-view.js`

## API

- `GET /api/tournaments/:slug/bracket` — sin cambios

## Integración actual

- Hub de resultados (`mcv-results-view.js`)
- Reutilizable en cualquier página con slug

## Mejoras futuras

- Conectores visuales entre rondas
- Embed en `tournament.html` (opcional, sin rehacer página)
