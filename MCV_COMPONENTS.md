# MCV Design System — Inventario de componentes

Fuente de verdad para la Fase 1.5 (componentización global).  
Todos los componentes viven en `mds-tokens.css`, `mds-components.css` y `mcv-components.js`.

**Convención:** prefijo `mcv-` · BEM · variantes con `--modifier` · aliases legacy documentados.

---

## Tokens (`mds-tokens.css`)

| Token | Uso |
|-------|-----|
| `--mcv-bg-*` | Fondos base, raised, overlay, elevated |
| `--mcv-text-*` | Texto primary, secondary, muted |
| `--mcv-border-*` | Bordes y focus |
| `--mcv-accent*` | Marca naranja MCV |
| `--mcv-success/warning/danger/live*` | Estados semánticos |
| `--mcv-font-*` | Display, body, mono |
| `--mcv-text-xs…3xl` | Escala tipográfica |
| `--mcv-space-1…16` | Espaciado 4px base |
| `--mcv-radius-*` | Radios |
| `--mcv-shadow-*` | Sombras |
| `--mcv-duration/ease` | Motion |
| `--mcv-nav-height`, `--mcv-content-max`, `--mcv-touch-min` | Layout |

---

## Componentes

### Botones — `mcv-btn`

| Clase canónica | Variantes | Aliases legacy |
|----------------|-----------|----------------|
| `mcv-btn` | base | — |
| `mcv-btn--primary` | CTA principal | `btn-primary`, `mcv-btn-primary` |
| `mcv-btn--secondary` | secundario | `btn-secondary`, `mcv-btn-secondary` |
| `mcv-btn--outline` | borde | `btn-outline` |
| `mcv-btn--sm` | compacto | `btn-primary-small` |
| `mcv-btn--block` | ancho completo | `w-100` |
| `mcv-btn--pulse` | animación rust | `pulse-rust` |

**Páginas:** index, events, tournament, live, tickets, cuenta, equipo/solicitud, bot (parcial)

---

### Eyebrow — `mcv-eyebrow`

Etiqueta superior de sección (`// …`).

| Clase | Uso | Aliases |
|-------|-----|---------|
| `mcv-eyebrow` | fila label + línea | `section-label` |
| `mcv-eyebrow__line` | línea acento | `yellow-line`, `red-line` |
| `mcv-eyebrow--center` | centrado | `centered-label` |

**Páginas:** todas las públicas excepto login

---

### Hero — `mcv-hero`

Shell unificado para cabeceras full-bleed e inline.

| Clase | Uso | Aliases |
|-------|-----|---------|
| `mcv-hero` | contenedor | `home-hero`, `events-hero`, `tournament-hero`, `live-hero` |
| `mcv-hero--compact` | sin media bg | `equipo-hero` |
| `mcv-hero--inline` | tracker/bot | — |
| `mcv-hero__bg` | imagen fondo | `*-hero-bg`, `home-hero-media` |
| `mcv-hero__shade` | overlay | `*-hero-shade`, `*-hero-overlay` |
| `mcv-hero__content` | contenido | `*-hero-inner`, `*-hero-content` |
| `mcv-hero__actions` | fila CTAs | `events-hero-actions`, `home-cta-row` |

**Páginas:** index, events, tournament, live, equipo

---

### Sección — `mcv-section`

| Clase | Uso | Aliases |
|-------|-----|---------|
| `mcv-section` | bloque página | `page-section` |
| `mcv-section__title` | h2 principal | — |

**Páginas:** tickets, cuenta, vital-rust, subsecciones

---

### Card / Panel — `mcv-card`, `mcv-panel`

| Clase | Uso | Aliases |
|-------|-----|---------|
| `mcv-card` | superficie elevada | `card`, `card-surface` |
| `mcv-card--form` | formulario | `form-container` |
| `mcv-card--event` | torneo | `events-card` |
| `mcv-card--hof` | hall of fame | `events-hof-card` |
| `mcv-card--stream` | live | `live-stream-card--ux` |
| `mcv-card--feature` | tracker grid | `feature-card` |
| `mcv-card--profile` | perfil tracker | `profile-card` |
| `mcv-card--person` | miembro equipo | `equipo-card` |
| `mcv-panel` | panel con header | `home-panel`, `cuenta-panel` |
| `mcv-panel__inner/head/title/body/link` | BEM panel | `home-panel__*` |

**Páginas:** index, events, live, bot, cuenta, equipo, tournament

---

### Stat bar / KPI — `mcv-stat-bar`, `mcv-stat`

| Clase | Uso | Aliases |
|-------|-----|---------|
| `mcv-stat-bar` | grid KPIs | `stats-bar`, `events-stats-strip` |
| `mcv-stat` | celda KPI | `stat-box`, `events-stat`, `tournament-stat` |
| `mcv-stat__label` | etiqueta | `stat-title`, `events-stat-label` |
| `mcv-stat__value` | número | `stat-value`, `events-stat-num`, `mcv-count-up` |
| `mcv-stat--icon` | con icono | `tournament-stat` |
| `mcv-stat-group` | grupo vital | `vital-stat-group`, `cuenta-vital-group` |

**Páginas:** index, events, tournament, bot, cuenta, vital-rust

---

### Badge — `mcv-badge`

| Variante | Semántica | Aliases |
|----------|-----------|---------|
| `--open` | inscripciones | `events-badge-open`, `mcv-badge--open` |
| `--live` | en vivo | `events-badge-live`, `live-status-badge.is-live` |
| `--past` | finalizado | `events-badge-past` |
| `--draft` | borrador | `events-badge-draft` |
| `--offline` | offline | `live-status-badge.is-offline` |
| `--ok/bad/pending` | cuenta | `cuenta-status--*` |
| `--danger/warn/safe` | tracker riesgo | `badge.danger/warn/clean` |
| `--champion` | ganador | `winner-champions-badge` |

---

### Chip — `mcv-chip`

Filtros y pills (no estado).

| Variante | Aliases |
|----------|---------|
| `mcv-chip--recruit/support/report/tournament` | `ticket-type-badge--*` |
| `mcv-chip--kick/twitch` | `live-platform-pill--*` |
| `mcv-chip--active` | `is-active` |

---

### Formulario — `mcv-field`, `mcv-form`

| Clase | Aliases |
|-------|---------|
| `mcv-form` | `squad-form`, `equipo-form` |
| `mcv-form--inline` | `tickets-lookup-form` |
| `mcv-field` | `input-group`, `equipo-field` |
| `mcv-field--search` | `search-box`, `tracker-input` |
| `mcv-field__label` | `label`, `highlight-label` |
| `mcv-input`, `mcv-select`, `mcv-textarea` | inputs nativos |
| `mcv-form-msg` | `tickets-form-msg`, `equipo-form-msg`, `t-reg-success` |
| `mcv-form-msg--ok/--err` | `.ok`, `.err` |

---

### OAuth — `mcv-oauth-btn`

| Clase | Aliases |
|-------|---------|
| `mcv-oauth-btn--steam/google` | `oauth-btn--steam/google` |

---

### Empty / Loading — `mcv-empty`, `mcv-skeleton`

| Clase | Aliases |
|-------|---------|
| `mcv-empty` | `events-empty`, `empty-hint`, `cuenta-panel__empty` |
| `mcv-empty--card` | `events-empty-card` |
| `mcv-empty--error` | `equipo-error`, `tracker-error-card` |
| `mcv-empty--offline` | `live-offline-banner`, `live-offline-placeholder` |
| `mcv-skeleton` | `events-skeleton` |
| `mcv-loading` | textos "Cargando…" |

---

### Banner / Toast — `mcv-banner`, `mcv-toast`

| Clase | Aliases |
|-------|---------|
| `mcv-banner` | `mcv-api-banner`, `home-stats-hint` |
| `mcv-banner--api` | `events-api-banner-wrap` |
| `mcv-toast` | (mcv-ui.js) |
| `mcv-toast--ok/--err` | — |

---

### Navbar / Footer

Gestionados por `mcv-layout.js`. Estilos en `mds-components.css` (nav-more, navbar).

---

### Pulse Now — `pulse-now`

Widget home "qué pasa ahora". Propiedad MDS, sin alias.

---

## JS compartido (`mcv-components.js`)

| Función | Descripción |
|---------|-------------|
| `mcvEsc(s)` | escape HTML |
| `mcvBadge(variant, text)` | HTML badge unificado |
| `mcvChip(variant, text, opts)` | HTML chip filtro |
| `mcvEmptyHtml(msg, opts)` | empty state (+ discord CTA) |
| `mcvBannerHtml(msg)` | banner API |
| `mcvLink(href, text, variant)` | enlace estilizado |

Cargado por `mcv-layout.js` en todas las páginas con shell.

---

## Estado de migración

| Página | Estado | Notas |
|--------|--------|-------|
| index.html | ✅ Migrada | pulse-now, mcv-panel, mcv-stat-bar |
| events.html | 🟡 Parcial | hero + stat-bar + badges JS |
| live.html | 🟡 Parcial | hero + stream cards |
| tournament.html | ✅ Premium Fase 2 | Status badge, KPI strip, panels, form MDS |
| bot.html | ✅ Premium Fase 2 | Product layout, steps, search panel |
| vital-rust.html | ✅ Premium Fase 2 | Dashboard KPI bar, toolbar, cards |
| login.html | ✅ Premium Fase 2 | Auth card MDS, OAuth en details |
| equipo/solicitud | ✅ Premium Fase 2 | Form mcv-field unificado |
| equipo/index.html | 🟡 Parcial | cards persona (Fase 1.5) |

---

## Reglas

1. **Un componente = un bloque CSS** en `mds-components.css`.
2. **Aliases legacy** solo como selectores agrupados; no duplicar reglas.
3. **Colores** solo vía tokens `--mcv-*`.
4. **Iconos** Lucide SVG; no emojis en UI nueva (legacy HOF 🏆 pendiente).
5. **No crear** variantes por página; usar `--modifier`.
