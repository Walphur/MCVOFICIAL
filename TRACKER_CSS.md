# Tracker CSS — Fase 2B

## Archivos

| Archivo | Rol |
|---------|-----|
| `mds-tokens.css` | Tokens `--mcv-*` |
| `mds-components.css` | Tabs, profile-card, stats-row, progress, status-box, link-btn, badges |
| `mds-premium.css` | Layout producto: hero, steps, search panel, benefits |
| `style-tracker.css` | **Solo exclusivos** (~70 líneas) |

## Qué quedó en `style-tracker.css` (y por qué)

1. **Aliases CSS legacy** (`--primary`, `--border-color`, etc.) — el JS inline de `bot.html` y templates dinámicos aún referencian estas variables en atributos `style`. Se mantienen hasta limpiar esos inline styles en una fase posterior.

2. **`.search-view` / `.results-view`** — toggle de vistas controlado por JS (`display: none/block`). La animación de entrada es específica del flujo escáner ↔ resultados.

3. **`#manual-bm-box`** — panel condicional oculto por defecto; el ID es contrato con el JS del tracker.

4. **`.spin`** — loader de búsqueda en curso.

5. **Responsive results** — apilado de profile-top y grids en móvil para la vista de resultados (complementa reglas MDS genéricas).

## Migrado a MDS (eliminado de style-tracker.css)

- Search box, inputs, botones → `mds-premium.css` (`.tracker-search-panel`, `.mcv-input`)
- Feature/benefit cards → `mds-premium.css` + `mds-components.css`
- Tabs, tab-content → `mds-components.css` (`.mcv-tabs`, `.tab-btn`)
- Profile card, avatar, stats-row → `mds-components.css`
- stat-hero, progress, pve/res grids → `mds-components.css`
- status-box, link-btn → `mds-components.css`
- Badges clean/warn/danger → `mds-components.css` (`.mcv-badge--*`)
- Page background → `mds-premium.css` (`.tracker-page`)

## Referencia en HTML

`bot.html` carga `style-tracker.css` además del bundle MDS vía `mcv-layout.js`.
