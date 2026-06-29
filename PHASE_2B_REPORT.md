# MCV 3.0 — Fase 2B: Informe de Consolidación

**Rama:** `cursor/mcv-3-phase2b-consolidation-cc79`  
**Cache assets:** `2026-06-20-v6`

---

## ¿Base suficiente para funcionalidades grandes?

**Sí, con reservas menores.** El frontend público tiene una base MDS coherente para comenzar perfil de jugador, ranking, resultados, bracket y calendario. Lo que queda es deuda acotada (inline styles en tracker, `style.css` legacy como capa de compatibilidad, admin fuera de scope).

---

## Páginas 100% MDS (públicas)

| Página | Estado |
|--------|--------|
| `index.html` | ✅ 100% |
| `login.html` | ✅ 100% |
| `equipo/solicitud/index.html` | ✅ 100% |
| `cuenta.html` | ✅ 100% (Fase 2B) |
| `events.html` | ✅ ~95% |
| `live.html` | ✅ ~95% |
| `tournament.html` | ✅ ~95% (form roster migrado) |
| `bot.html` | ✅ ~90% (results view usa MDS; inline styles JS pendientes) |
| `vital-rust.html` | ✅ ~90% |
| `tickets.html` | 🟡 ~85% (depende `style-admin.css` por bleed tickets) |
| `equipo/index.html` | ✅ ~90% |

## Páginas pendientes / fuera de scope

| Página | Notas |
|--------|-------|
| `admin.html` | Panel interno — no migrado (correcto) |
| `jugadores.html`, `equipo.html` | Redirects estáticos |

---

## CSS eliminado

| Archivo | Acción | Verificado |
|---------|--------|------------|
| `style.backup-before-home-redesign.css` | **Eliminado** | Sin referencias HTML |
| `style.backup-before-tournament-redesign.css` | **Eliminado** | Sin referencias HTML |
| `style-tracker.css` | **Reducido** 616 → ~70 líneas | Solo exclusivos documentados en `TRACKER_CSS.md` |

## CSS que sigue siendo necesario

| Archivo | Rol |
|---------|-----|
| `mds-tokens.css` | Design tokens |
| `mds-components.css` | Componentes canónicos + aliases legacy |
| `mds-premium.css` | Layouts por página (tournament, tracker, vital, login, cuenta, equipo solicitud) |
| `style.css` | Capa legacy grande — aún referenciado por todas las páginas; contiene reglas no migradas (hero antiguos, equipo grid, etc.) |
| `style-ux.css` | Tournament/live extras — parcialmente duplicado con MDS |
| `style-tracker.css` | Exclusivos tracker (ver `TRACKER_CSS.md`) |
| `style-admin.css` | Admin + bleed tickets/vital/login |

## Reglas muertas / candidatas a eliminar (futuro)

- Duplicados toast en `style-ux.css` vs `mds-components.css` (toast ya unificado en MDS)
- Bloques `.cuenta-*` en `style.css` — ahora cubiertos por `mds-premium.css` (aliases no rompen)
- `.form-container` legacy en `style.css` — alias en MDS sigue activo
- Marquee tournament oculto en CSS — HTML conservado por compatibilidad JS

---

## JS simplificado

| Cambio | Archivos |
|--------|----------|
| `esc()` inline → `mcvEsc` | `cuenta.html`, `events.html`, `tournament.html`, `equipo/index.html` |
| `mcvStatusBadge()` nuevo | `mcv-components.js` — badges cuenta/tickets |
| `vital-rust-view.js` | Delega a `global.mcvEsc` cuando disponible |
| `mcvEsc` ampliado | Escapa `>` además de `&`, `<`, `"` |

**Duplicados restantes:** `admin.html` mantiene `esc()` local (scope admin, no público).

---

## Componentes completamente migrados (Fase 2B)

- **Cuenta:** gate OAuth, dashboard head, panels tickets/torneos/vital, listas `mcv-list`, stats `mcv-stat-group`
- **Tournament form:** `mcv-field` + `mcv-input` en team-row y 5 player rows; grid 3 columnas desktop
- **Tournament live:** `mcv-eyebrow--live` + `mcv-text-live` (sin inline `#EF4444`)
- **Tracker results:** tabs, profile, progress, stat-hero, status-box, link-btn → `mds-components.css`

---

## Deuda técnica restante

1. **`style.css` (~2400 líneas)** — capa legacy; migración incremental o split por dominio
2. **`style-ux.css`** — tournament/live; evaluar merge a `mds-premium.css` y retirar
3. **`style-admin.css` en tickets/vital** — extraer bleed público a MDS y desacoplar admin
4. **Inline styles en `bot.html` JS** — colores hardcoded en templates dinámicos
5. **Bracket visual tournament** — sin componente MDS dedicado (funcionalidad futura)
6. **Winner showcase tournament** — parcialmente legacy (`winner-showcase` sin MDS hero)

---

## Responsive

- Grid cuenta: 2 col → 1 col en `<768px`
- Tournament roster: 4 col → stack en `<900px`
- Tracker results: profile/grids apilan en `<768px`
- `style.css` mantiene `overflow-x: hidden` en body
- KPI bars tournament/vital: 4 → 2 → 1 columnas

---

## Commits Fase 2B

1. Cuenta MDS completa + componentes list/stat-group/tabs/tracker results
2. Tracker CSS mínimo + documentación
3. Tournament form + live section MDS
4. JS dedupe + cache v6 + eliminación backups + informe
