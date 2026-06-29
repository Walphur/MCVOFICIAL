# Auditoría Web — MCV Oficial

**Fecha:** 20 de junio de 2026  
**Alcance:** Frontend estático + shell público + admin + integración con backend Node/Express  
**Metodología:** Revisión de código fuente, inventario de assets, análisis de rutas API, patrones CSS/JS y evaluación UX/UI sin modificar archivos del proyecto.

---

# 1. Mapa completo del proyecto

## 1.1 Arquitectura general

| Capa | Ubicación | Rol |
|------|-----------|-----|
| **Frontend estático** | Raíz `/workspace` | HTML, CSS, JS, imágenes |
| **Backend + servidor** | `/mcv-backend` | Express sirve estáticos + API REST + Discord bot |
| **Deploy** | `render.yaml` | Web Service Render |
| **PWA** | `manifest.webmanifest`, `sw.js` | Instalable; caché solo imágenes |
| **i18n** | `mcv-i18n.js` | ES / EN en sitio público |
| **Shell compartido** | `mcv-layout.js` | Navbar, footer, skip link, PWA, menú móvil |

**Stack frontend:** HTML multi-página (MPA), sin bundler, sin framework UI. Módulos IIFE en JS. Lucide Icons vía CDN (unpkg). Google Fonts en varias páginas.

---

## 1.2 Páginas HTML existentes (14 archivos)

| Archivo | URL pública | `data-mcv-page` | Tipo |
|---------|-------------|-----------------|------|
| `index.html` | `/index.html` | `index` | Landing / home |
| `events.html` | `/events.html` | `events` | Listado torneos |
| `tournament.html` | `/tournament.html?slug=` | `tournament` | Detalle + inscripción |
| `bot.html` | `/bot.html` | `bot` | Tracker anti-cheat |
| `live.html` | `/live.html` | `live` | Streams Kick/Twitch |
| `tickets.html` | `/tickets.html` | `tickets` | Tickets soporte/reclutamiento |
| `cuenta.html` | `/cuenta.html` | `cuenta` | Dashboard usuario |
| `vital-rust.html` | `/vital-rust.html` | `vital-rust` | Stats Vital (miembros) |
| `equipo/index.html` | `/equipo/` | `team` | Roster público |
| `equipo/solicitud/index.html` | `/equipo/solicitud/` | `teamForm` | Formulario perfil (oculto) |
| `login.html` | `/login.html` | `login` | Login admin |
| `admin.html` | `/admin.html` | `admin` | Control room staff |
| `equipo.html` | `/equipo.html` | — | **Redirect** → `/equipo/` |
| `jugadores.html` | `/jugadores.html` | — | **Redirect** → `/equipo/` |

---

## 1.3 Rutas (servidor + navegación)

### Rutas estáticas (Express `express.static`)

Todas las páginas y assets de la raíz se sirven directamente. Rutas especiales en `mcv-backend/server.js`:

| Ruta | Propósito |
|------|-----------|
| `/` | `index.html` |
| `/mcv-api-config.js` | Inyecta `window.MCV_API_BASE` en producción |
| `/uploads/*` | Archivos subidos (posters torneos, etc.) |
| `/favicon.ico` | Favicon |
| `/api/*` | API REST (404 JSON si no existe) |
| `/test` | Health/debug |
| `/api/health` | Health check |
| `/discord-status` | Estado bot Discord |
| `/escaner-rapido` | POST tracker (BattleMetrics) |
| `/verificar-equipo` | POST verificación equipos torneo |

### API pública relevante para la web

| Endpoint | Uso en frontend |
|----------|-----------------|
| `GET /api/tournaments` | `events.html` |
| `GET /api/tournaments/for-site` | Home, events |
| `GET /api/tournaments/stats` | Home, events |
| `GET /api/tournaments/:slug` | `tournament.html` |
| `POST /api/tournaments/:slug/register` | Inscripción torneo |
| `GET /api/tournaments/:slug/bracket` | Bracket (admin; no hay página pública dedicada) |
| `GET /api/team-roster` | `equipo/index.html` |
| `POST /api/team-roster/submit` | Solicitud perfil |
| `POST /api/tickets` | `tickets.html` |
| `GET /api/tickets/:id/status` | Consulta ticket |
| `POST /escaner-rapido` | `bot.html` |
| `GET /api/public/youtube-latest` | Home media |
| `GET /api/public/tiktok-latest` | Home media |
| `GET /api/auth/user/*` | OAuth + dashboard cuenta |
| `GET /api/auth/user/vital/*` | `vital-rust.html` |
| `GET /api/admin/*` | `admin.html` (JWT) |

### Navegación principal (`mcv-layout.js`)

```
Clan (index) · Torneos · Equipo · Bot · Tickets · Mi cuenta · Streams
```

**No están en navbar global:** Vital Rust, Brackets públicos, Ranking wipe, Admin (solo footer).

---

## 1.4 JavaScript (raíz del proyecto)

| Archivo | ~Tamaño | Cargado en | Propósito |
|---------|---------|------------|-----------|
| `mcv-assets.js` | 0.2 KB | index, admin, tournament | Versión cache `MCV_ASSET_V` |
| `mcv-purge-legacy-api.js` | 0.5 KB | Casi todas | Limpia API legacy |
| `mcv-api-base.js` | 4.8 KB | Casi todas | Resuelve base URL API |
| `mcv-user-auth.js` | ~4 KB | cuenta, tickets, vital-rust | Sesión usuario JWT |
| `mcv-oauth-ui.js` | ~4 KB | Auth pages | Botones OAuth |
| `mcv-auth-float.js` | ~4.8 KB | **solo index** | Panel flotante login home |
| `mcv-layout.js` | 13.8 KB | Públicas (no admin/login) | Shell, footer, PWA, nav móvil |
| `mcv-nav.js` | ~3 KB | **Huérfano** | Duplicado de nav (no usado) |
| `mcv-icons.js` | ~2 KB | index, tournament, live | Parche icono Discord SVG |
| `mcv-i18n.js` | **96 KB** | Mayoría páginas | Traducciones ES/EN |
| `mcv-ui.js` | 6.5 KB | Inyectado por layout | Toasts |
| `mcv-home-media.js` | 6.4 KB | index | YouTube/TikTok grid |
| `vital-rust-view.js` | 26 KB | vital-rust | Panel stats Vital |
| `mcv-vital-export.js` | 15.6 KB | admin | Export CSV/Excel Vital |
| `events-core.js` | 0.5 KB | **Huérfano** | localStorage torneos (legacy) |
| `i18n-site.js` | ~2 KB | **Huérfano** | i18n viejo |
| `admin.js` | 5.6 KB | **Huérfano** | Admin localStorage prototype |
| `admin-v2.js` | 10.6 KB | **Huérfano** | Admin v2 prototype |
| `sw.js` | ~3 KB | Registrado por layout | Service worker |
| `mcv-local-api.example.js` | template | No prod | Dev API override |

**Scripts inline grandes (deuda técnica):**

| Página | Aprox. |
|--------|--------|
| `admin.html` | ~4.500 líneas JS inline |
| `tournament.html` | ~570 líneas |
| `events.html` | ~400+ líneas |
| `bot.html` | ~500+ líneas |
| `cuenta.html` | ~300+ líneas |

**CDN externos:** Lucide Icons, ExcelJS (admin), Cloudflare Turnstile (login), Google Fonts.

---

## 1.5 CSS

| Archivo | ~Tamaño | Uso |
|---------|---------|-----|
| `style.css` | **71.8 KB** | Base global: tokens, nav, footer, home, events, tournament base |
| `style-ux.css` | **27.5 KB** | Animaciones, toasts, polish por página; **también inyectado por layout** |
| `style-admin.css` | **198 KB** | Login, admin, Vital OPS, tickets, cuenta, vital-rust |
| `style-tracker.css` | **11.5 KB** | Solo `bot.html` |
| `login-v2.css` | ~1 KB | **Huérfano** |
| `admin-v2.css` | ~3 KB | **Huérfano** |
| `style.backup-before-home-redesign.css` | 19 KB | Backup |
| `style.backup-before-tournament-redesign.css` | 26 KB | Backup |

**Peor caso de carga:** `admin.html` → `style.css` + `style-admin.css` (~270 KB CSS).  
**Carga inflada:** `vital-rust.html` carga todo `style-admin.css` (~198 KB) por pocas clases `.vital-rust-*`.

---

## 1.6 Componentes / módulos reutilizados (runtime)

| Módulo | Tipo | Dónde |
|--------|------|-------|
| `mcv-layout.js` | Shell | Navbar, footer, Waltech credit, pulse stats |
| `mcv-i18n.js` | i18n | `data-i18n`, `mcvT()` |
| `mcv-ui.js` | Toast | `mcvToast()`, `.mcv-toast-*` |
| `mcv-oauth-ui.js` | OAuth | Steam/Google buttons |
| `mcv-api-base.js` | Config | `mcvResolveApiBase()` |
| Lucide | Iconos | `data-lucide` + `createIcons()` |
| `mcv-icons.js` | SVG Discord | Reemplaza Lucide en links Discord |

---

## 1.7 Assets

| Asset | Uso |
|-------|-----|
| `logo.png` | Navbar, favicon, PWA icon, home |
| `banner.png` | OG image home |
| `favicon.ico` | Fallback favicon |
| `CNAME` | Dominio GitHub Pages (si aplica) |
| `/uploads/*` | Posters torneos (backend) |

**No hay carpeta `/images` estructurada.** Imágenes de torneos vienen de Imgur/API. No hay sprites SVG locales salvo Discord en `mcv-icons.js`.

---

# 2. Funcionalidades (por página)

## `index.html` — Inicio / Clan

| Campo | Detalle |
|-------|---------|
| **Propósito** | Landing del clan: conversión a Discord, torneos, tracker |
| **Información** | Hero, stats (torneos hosteados, Discord online/total, wipe roster), strip torneo activo, grid features, YouTube/TikTok, valores, CTA |
| **Botones / CTAs** | Ver torneos, Discord, Tracker; cards Operaciones; CTA final Discord; link Admin en footer |
| **Acciones** | Fetch API stats; count-up animado; media grid; auth float (OAuth) |
| **Estado** | ✅ Terminada y conectada a API |

---

## `events.html` — Torneos (calendario)

| Campo | Detalle |
|-------|---------|
| **Propósito** | Listar torneos próximos e historial |
| **Información** | Hero, stats strip, Hall of Fame (top 8), columnas Próximos / Historial |
| **Botones** | Torneo destacado, Discord, Registrar, Ver detalle por card |
| **Acciones** | GET tournaments + stats; split upcoming/finished; link a `tournament.html?slug=` |
| **Estado** | ✅ Terminada |

---

## `tournament.html` — Detalle torneo

| Campo | Detalle |
|-------|---------|
| **Propósito** | Página de un torneo: info, reglas, inscripción, stream |
| **Información** | Hero dinámico, countdown, stats (premio, equipos, fecha, formato), reglas, schedule, ganadores (si finalizó), embed Twitch |
| **Botones** | Registrar, Reglas, Discord, Copiar enlace, Enviar inscripción |
| **Formulario** | Team name/tag, capitán, 5 jugadores (nombre, SteamID64, Discord) |
| **Acciones** | GET por slug; POST register; copy URL; toggle registro abierto/cerrado |
| **Estado** | ✅ Terminada (textos mixtos EN/ES en paneles internos) |

---

## `bot.html` — Tracker (Anti-Cheat)

| Campo | Detalle |
|-------|---------|
| **Propósito** | Escanear jugador por Steam ID (VAC, bans, stats Rust) |
| **Información** | Búsqueda, perfil, tabs Bans/Stats/Servers/Investigate |
| **Botones** | Buscar, ejemplos Steam ID, tabs, copiar comando Discord, retry BM, guardar URL BM |
| **Acciones** | POST `/escaner-rapido`; POST `/api/battlemetrics/manual` |
| **Estado** | ✅ Funcional; 🟡 copy UI mezcla idiomas |

---

## `live.html` — Streams

| Campo | Detalle |
|-------|---------|
| **Propósito** | Ver streams Kick + Twitch del clan |
| **Información** | Hero, banner offline, cards Kick/Twitch con viewers |
| **Botones** | Discord (offline), abrir Kick/Twitch |
| **Acciones** | decapi.me live status; embeds |
| **Estado** | ✅ Terminada |

---

## `equipo/index.html` — Equipo

| Campo | Detalle |
|-------|---------|
| **Propósito** | Roster público del clan |
| **Información** | Hero, grid miembros (avatar, rol, redes) |
| **Botones** | Links sociales por miembro (Twitch, Kick, X, Steam…) |
| **Acciones** | GET `/api/team-roster` |
| **Estado** | ✅ Terminada |

---

## `equipo/solicitud/index.html` — Solicitud perfil

| Campo | Detalle |
|-------|---------|
| **Propósito** | Formulario privado para que jugadores pidan alta en roster |
| **Información** | Hero (staff-only), form redes |
| **Botones** | Enviar solicitud |
| **Formulario** | Nombre, rol, Steam, Twitch, Kick, X, Instagram, YouTube, TikTok |
| **Acciones** | POST submit; `noindex` |
| **Estado** | ✅ Terminada (URL oculta, no en nav) |

---

## `tickets.html` — Tickets

| Campo | Detalle |
|-------|---------|
| **Propósito** | Crear tickets soporte/reclutamiento |
| **Información** | Tipos badge, gate OAuth, form, consulta estado |
| **Botones** | Steam/Google login, Enviar, Consultar, Discord |
| **Formularios** | Ticket (tipo, Discord user, descripción); Lookup (ID ticket) |
| **Acciones** | OAuth gate; POST ticket; GET status |
| **Estado** | ✅ Terminada |

---

## `cuenta.html` — Mi cuenta

| Campo | Detalle |
|-------|---------|
| **Propósito** | Hub del usuario logueado |
| **Información** | Perfil OAuth, tickets, inscripciones torneos, stats Vital resumidas |
| **Botones** | Login Steam/Google, logout, vincular Steam, nuevo ticket |
| **Acciones** | GET dashboard; GET vital-stats; redirect `?next=` |
| **Estado** | ✅ Terminada; `noindex` |

---

## `vital-rust.html` — Stats Vital Rust

| Campo | Detalle |
|-------|---------|
| **Propósito** | Panel stats clan en Vital (solo miembros con Steam) |
| **Información** | Gate Steam, selector server/wipe, grid jugadores sorteable |
| **Botones** | Steam OAuth, Forzar Vital, Export CSV, Salir |
| **Acciones** | APIs Vital member; lógica en `vital-rust-view.js` |
| **Estado** | ✅ Terminada; 🟡 carga CSS admin completo |

---

## `login.html` — Admin login

| Campo | Detalle |
|-------|---------|
| **Propósito** | Acceso staff al control room |
| **Información** | Brand, password, OAuth Google/Steam, hints setup |
| **Botones** | Ingresar, OAuth |
| **Formulario** | Password + Turnstile (opcional) |
| **Acciones** | POST login; JWT → sessionStorage → admin |
| **Estado** | ✅ Terminada |

---

## `admin.html` — Control Room

| Campo | Detalle |
|-------|---------|
| **Propósito** | Panel staff: torneos, equipos, brackets, perfiles, tickets, Vital OPS |
| **Tabs** | Torneos · Equipos · Bracket · Perfiles equipo · Tickets · **Info jugadores (default)** |
| **Botones** | Decenas: CRUD torneos, aprobar equipos, generar bracket, export Excel, sync playtime, reset horas/puntos, import wipe, compliance… |
| **Formularios** | Nuevo/editar torneo, finalizar, poster, add team admin, diálogos confirmación |
| **Acciones** | Toda la API admin + Vital + Discord sync |
| **Estado** | ✅ Funcional y muy completo; 🔴 arquitectura monolítica (280 KB HTML, JS inline) |

---

## Redirects

| Página | Estado |
|--------|--------|
| `equipo.html`, `jugadores.html` | ✅ Intencional (SEO legacy) |

---

# 3. Jerarquía de navegación

```
MCV Oficial
│
├── Inicio (index.html)                    [nav: Clan]
│   ├── Quick paths: Torneos · Discord · Tracker
│   ├── Stats bar (API)
│   ├── Operaciones: Tracker · Torneos · Streams
│   ├── Media: YouTube / TikTok
│   ├── CTA Discord
│   └── Footer → Admin (login)
│
├── Torneos (events.html)                  [nav: Torneos]
│   ├── Próximos torneos
│   ├── Historial
│   ├── Hall of Fame
│   └── → Detalle torneo (tournament.html?slug=)
│       ├── Reglas / Schedule / Premio
│       ├── Inscripción (form 5 jugadores)
│       └── Stream Twitch (si activo)
│
├── Equipo (equipo/)                       [nav: Equipo]
│   ├── Roster público (API)
│   └── [oculto] Solicitud perfil (equipo/solicitud/)
│
├── Bot / Tracker (bot.html)               [nav: Bot]
│   ├── Búsqueda Steam ID
│   └── Resultados: Bans · Stats · Servers · Investigate
│
├── Tickets (tickets.html)                 [nav: Tickets]
│   ├── Crear ticket (OAuth)
│   └── Consultar estado
│
├── Mi cuenta (cuenta.html)                [nav: Mi cuenta]
│   ├── Perfil OAuth
│   ├── Mis tickets
│   ├── Mis torneos
│   └── Resumen Vital
│
├── Streams (live.html)                    [nav: Streams ●]
│   ├── Kick (mcompanyv)
│   └── Twitch (mcvteam)
│
├── [sin nav] Vital Rust (vital-rust.html)
│   └── Stats clan Vital (Steam gate)
│
├── [sin nav] Admin (login.html → admin.html)
│   ├── Torneos (CRUD, posters, rosters)
│   ├── Equipos (moderación inscripciones)
│   ├── Bracket (generar, avanzar ronda)
│   ├── Perfiles equipo (aprobaciones)
│   ├── Tickets (moderación)
│   └── Info jugadores / Vital OPS
│       ├── Roster wipe + puntos + horas
│       ├── Tier scoring EU Monthly/Medium
│       ├── Extras manuales
│       └── Compliance / exports
│
└── Redirects legacy
    ├── equipo.html → equipo/
    └── jugadores.html → equipo/
```

**No existen como páginas públicas:** Ranking wipe, Brackets públicos, Noticias/blog, Calendario wipe, Mapa de bases.

---

# 4. Análisis de UX

## 4.1 Páginas repetidas / redundantes

| Problema | Detalle |
|----------|---------|
| Redirects legacy | `equipo.html` y `jugadores.html` duplican entrada a Equipo (aceptable) |
| Footer duplicado | `index.html` tiene footer manual **además** del inyectado por `mcv-layout.js` → riesgo doble footer |
| Home vs nav | Links a Torneos/Tracker/Streams aparecen en hero, features y nav |
| Cuenta vs Tickets | OAuth gate similar en ambas; flujo cruzado con `?next=` |

## 4.2 Botones duplicados

- **Discord** aparece en: hero home, CTAs, footer, tickets, tournament, live offline, nav implícita — coherente para conversión pero repetitivo.
- **Ver torneos** en home path card + feature card + nav.
- **Admin refresh/logout** únicos; OK.

## 4.3 Información duplicada

- Stats torneos en home y events (misma API).
- Footer pulse stats (Discord online) vs home stats bar.
- Reglas torneo en tournament page y posiblemente Discord (no sincronizado en UI).

## 4.4 Elementos innecesarios / ruido

- `mcv-auth-float.js` solo en home: panel login flotante puede competir con CTAs principales.
- Strip animado "Red MCV · Torneos Rust…" en home: valor decorativo, poco actionable.
- Setup hints en `login.html` (Google Console links) visibles en prod — confuso para no-devs.
- Archivos huérfanos en repo (`admin-v2`, `events-core`) no afectan UX directo pero indican iteraciones abandonadas.

## 4.5 Textos largos

- `tournament.html`: reglas/schedule en bloques densos; form inscripción largo (5 filas × 3 campos).
- `admin.html`: copy técnico en Vital OPS; logs y banners extensos.
- `bot.html`: resultados investigación con mucho texto monospace.

## 4.6 Secciones vacías / condicionales

- Home event strip: `hidden` hasta que API devuelve torneo.
- Hall of Fame en events: oculto sin datos.
- Tournament winner showcase: solo si `finished`.
- Live offline banner: estado por defecto si no hay stream.
- Vital grid "sin datos": frecuente si API lenta.

## 4.7 Espacio / scroll

- **Home:** hero alto + stats + strip + features + media + values + CTA → mucho scroll en mobile.
- **Tournament:** form 5 jugadores muy largo en móvil.
- **Admin Vital:** panel de 3 columnas con scroll horizontal en viewport mediano (overflow-x).
- **Bot:** tabs + cards generan scroll vertical largo post-búsqueda.

## 4.8 Scroll innecesario

- Admin tabs con contenido no lazy-loaded: todo el DOM presente, tab oculta con CSS.
- Repetición de headers/labels en admin entre tabs.

## 4.9 Responsive / mobile

| Área | Observación |
|------|-------------|
| Nav | Hamburger + backdrop OK (`mcv-layout.js`) |
| Breakpoints | Inconsistentes: 420, 500, 640, 720, 760, 800, 820, 900, 980, 1024, 1100, 1200, 1280, 1600 px |
| Home stats | 4 → 2 → 1 columnas OK |
| Admin | Muchos `@media` pero Vital workspace sigue apretado < 1100px |
| Tournament form | Player rows apiladas; usable pero largo |
| Tracker | `style-tracker.css` bien scoped |

## 4.10 Desktop

- Admin aprovecha ancho en ≥1280px; sidebar Vital colapsable reciente.
- Home hero con mucho espacio vacío lateral en ultrawide.
- Events two-column OK; colapsa en mobile.

---

# 5. Problemas visuales

## 5.1 Iconos inconsistentes

| Sistema | Dónde |
|---------|-------|
| **Lucide** (CDN) | index, events, tournament, tickets, live, bot, equipo |
| **SVG custom Discord** | `mcv-icons.js` parchea links Discord |
| **Emojis** | Embeds Discord bot (no web pública excepto posibles unicode en contenido dinámico) |
| **Sin icono** | Algunos botones admin usan texto solo |
| **Emoji en admin Vital** | Históricamente mezclado; premium v14+ migró a SVG en admin — revisión parcial |

**Problema:** Lucide vs SVG Discord vs posibles emojis en strings i18n/backend.

## 5.2 Botones

| Clase | Uso |
|-------|-----|
| `.btn-primary` | CTA principal (naranja `#FAA61A`) |
| `.btn-secondary` | Secundario |
| `.btn-outline` | Admin, login |
| `.btn-outline-red` | Destructivo |
| `.oauth-btn--steam/google` | OAuth |
| `.btn-primary-small` | Admin Vital |

**Problemas:** `.btn-primary` definido dos veces en `style.css` (~208 y ~649); hovers distintos. Admin override en `style-admin.css` duplicado. Tamaños no tokenizados (`btn-sm` ad hoc).

## 5.3 Tarjetas

- `.home-path-card`, `.home-feature-card`, `.events-card`, `.equipo-card`, `.live-stream-card`, `.player-card` (tracker), `.vital-ui-card` (admin) — **6 familias** con radios/sombras/bordes similares pero no unificados.

## 5.4 Radios, sombras, colores

| Token | Valor principal | Conflictos |
|-------|-----------------|------------|
| `--primary` | `#FAA61A` | Backups usaban `#FACC15` |
| `--background` | `#0A0A0A` / override `#050505` en home block |
| `--border` | `#27272A` / override `#1A1A1A` |
| Radios | 8px admin, 12px cards, varios `border-radius: 999px` pills | Sin escala `--radius-sm/md/lg` |
| Sombras | `box-shadow` ad hoc por componente | No design system |

## 5.5 Tipografías

| Fuente | Uso |
|--------|-----|
| Bebas Neue | Display, títulos |
| IBM Plex Sans | Body (mayoría) |
| Inter | vital-rust, algunos admin |
| JetBrains Mono | Stats, labels técnicos |
| Rajdhani | admin.html link (¿cargada pero poco usada?) |

**Problema:** 4–5 familias; Inter vs IBM Plex en páginas adyacentes (cuenta vs vital-rust).

## 5.6 Márgenes / paddings

- `--ease-mcv` compartido en UX layer (bien).
- Spacing no sistemático: mezcla de `10px`, `12px`, `14px`, `16px`, `20px`, `24px` sin escala 4/8px estricta.
- Admin Vital usa gaps propios (`gap: 10px` vs `16px` en otras tabs).

---

# 6. Rendimiento

## 6.1 CSS repetido

| Issue | Impacto |
|-------|---------|
| `style-admin.css` 198 KB en vital-rust, tickets, cuenta | Alto |
| `.events-*`, `.tickets-auth-*` en `style.css` **y** `style-admin.css` | Medio |
| `style-ux.css` link manual + inject layout | Bajo (browser dedupe URL) |
| Backups en repo | Ninguno en prod |

## 6.2 JS repetido

| Issue | Impacto |
|-------|---------|
| `mcv-i18n.js` 96 KB en casi todas las páginas | Alto |
| `apiBase()` duplicado en 7+ módulos | Medio |
| `esc()` duplicado (vital-rust, home-media) | Bajo |
| `admin.html` inline ~4500 líneas parseadas siempre | Alto en admin |
| Lucide CDN full UMD | Medio (no tree-shaken) |

## 6.3 Imágenes

| Asset | Notas |
|-------|-------|
| `logo.png`, `banner.png` | Sin optimización WebP/avif visible |
| Posters torneos | Externos Imgur |
| Avatares Steam | Externos |

## 6.4 Código muerto (archivos no referenciados)

- `mcv-nav.js`
- `events-core.js`
- `i18n-site.js`
- `admin.js`, `admin-v2.js`
- `admin-v2.css`, `login-v2.css`
- `style.backup-before-*.css`

## 6.5 Librerías

| Lib | Uso |
|-----|-----|
| Lucide | ✅ Usado |
| ExcelJS CDN | ✅ Solo admin export |
| Turnstile | ✅ Login |
| Google Fonts | ✅ Múltiples páginas (render-blocking `@import` en CSS) |

## 6.6 Funciones duplicadas

- Mobile nav: `mcv-nav.js` vs `mcv-layout.js`
- Teams CRUD: `admin.js` vs `admin-v2.js` (×2 en mismo archivo)
- i18n: `i18n-site.js` vs `mcv-i18n.js`

## 6.7 Service Worker

- Cache solo imágenes; HTML/CSS/JS network-first → **correcto para deploys frecuentes**.

---

# 7. Componentes reutilizables

## 7.1 Layout / shell

| Componente | Clases / módulo |
|------------|-----------------|
| Navbar | `.navbar`, `.nav-links`, `.nav-toggle`, `.nav-backdrop` |
| Footer | `.footer`, `.footer-pulse`, `.footer-admin-link` |
| Skip link | `.mcv-skip-link` |
| Grain overlay | `.grain` |
| Page section | `.page-section`, `.section-label`, `.yellow-line` |

## 7.2 Botones

| Componente | Clases |
|------------|--------|
| Primary CTA | `.btn-primary`, `.pulse-rust` |
| Secondary | `.btn-secondary` |
| Outline | `.btn-outline`, `.btn-outline-red` |
| OAuth | `.oauth-btn`, `.oauth-btn--steam`, `.oauth-btn--google` |
| Small | `.btn-primary-small`, `.btn-sm` |

## 7.3 Feedback

| Componente | Clases / API |
|------------|--------------|
| Toast | `.mcv-toast`, `.mcv-toast-host`, `mcvToast()` |
| Banner API | `.mcv-api-banner`, `.mcv-data-ok/warn/err` |
| Auth gate | `.tickets-auth-gate`, `.vital-rust-gate` |

## 7.4 Cards

| Componente | Clases |
|------------|--------|
| Home path | `.home-path-card` |
| Home feature | `.home-feature-card`, `.highlight-card` |
| Events | `.events-card` |
| Equipo | `.equipo-card`, `.equipo-rank-badge` |
| Live | `.live-stream-card` |
| Tracker | `.player-card`, `.stat-grid` |
| Admin/Vital | `.vital-ui-card`, `.admin-card`, `.vital-perf-stat-card` |
| Tournament | `.panel-title`, `.player-row` |

## 7.5 Formularios

| Componente | Clases |
|------------|--------|
| Input group | `.input-group`, `.highlight-label` |
| Admin forms | `.admin-form`, `.vital-form-grid` |
| Selects Vital | `.vital-tier-server`, wipe selectors |

## 7.6 Navegación admin

| Componente | Clases |
|------------|--------|
| Tab bar | `.admin-tabs`, `.admin-tab` |
| Tab panels | `.admin-tab-panel` |
| Modals | `#vital-confirm-dialog`, compliance dialog |

## 7.7 Datos / listas

| Componente | Clases |
|------------|--------|
| Stats bar | `.stats-bar`, `.stat-box` |
| Tables admin | `.admin-table`, grids roster |
| Ranking / HoF | `.events-hof`, dynamic lists |
| Bracket | Admin only, SVG/HTML generado |
| Badges | `.home-event-badge`, `.equipo-rank-badge`, `.ticket-type-badge`, `.ban-badge` |

## 7.8 i18n

| Componente | API |
|------------|-----|
| Text | `data-i18n`, `data-i18n-html`, `data-i18n-placeholder` |
| API | `mcvT()`, `mcvI18nApply()` |

---

# 8. Estado del proyecto (por sección)

| Sección | Estado | Por qué |
|---------|--------|---------|
| **Home / landing** | ✅ Excelente | Visual fuerte, API live, CTAs claros, i18n |
| **Torneos (events + detail)** | ✅ Excelente | Flujo completo listado → detalle → registro |
| **Tracker (bot)** | 🟡 Mejorable | Funcional; UI densa; idioma mixto; sin historial búsquedas |
| **Streams (live)** | ✅ Excelente | Simple, claro, dual platform |
| **Equipo** | ✅ Excelente | Limpio, API-driven |
| **Tickets** | 🟡 Mejorable | OAuth gate puede frustrar; consulta ID poco discoverable |
| **Mi cuenta** | 🟡 Mejorable | Útil pero panels básicos; poca jerarquía visual |
| **Vital Rust (público miembros)** | 🟡 Mejorable | Funcional; carga CSS admin entero; no en nav |
| **Login admin** | ✅ Excelente | Turnstile, OAuth, claro |
| **Admin Control Room** | 🟡 Mejorable | Muy capaz; monolito HTML/JS; curva aprendizaje alta |
| **Admin Vital OPS** | 🟡 Mejorable | Feature-rich; UX premium reciente pero aún denso; overflow pts corregido parcialmente |
| **i18n** | ✅ Excelente | Cobertura amplia ES/EN |
| **PWA / a11y** | 🟡 Mejorable | Skip link OK; manifest básico; contraste variable en muted text |
| **Design system** | 🔴 Debería rehacerse | Tokens fragmentados; 4 CSS grandes; sin component library unificada |
| **Arquitectura JS** | 🔴 Debería rehacerse | Inline scripts masivos; sin módulos ES; código huérfano |
| **SEO / redirects** | ✅ Excelente | OG tags home; redirects legacy; noindex en privadas |

---

# 9. Ideas (sin implementar)

## 9.1 Cosas que sobran

- Archivos huérfanos: `mcv-nav.js`, `events-core.js`, `i18n-site.js`, `admin.js`, `admin-v2.*`, `login-v2.css`, CSS backups.
- Footer duplicado en `index.html` si layout ya lo inyecta.
- Hints de Google Console en login producción.
- Strip decorativo home (opcional).
- Carga completa de `style-admin.css` en `vital-rust.html` y parcialmente tickets/cuenta.
- Duplicación `.btn-primary` y bloques `:root` en `style.css`.

## 9.2 Cosas que faltan

- **Página pública de bracket** por torneo (solo admin hoy).
- **Ranking wipe / puntos** público o semi-público (hoy solo Discord `/mcv-yo` + admin).
- **Calendario de wipes** MCV (Monthly/Medium) visible para el clan.
- **Vital Rust en navbar** (o bajo Mi cuenta) para miembros autenticados.
- **Notificaciones** in-app (toast existe pero no notification center).
- **Breadcrumbs** en tournament detail y admin.
- **Estado vacío unificado** (illustration + CTA consistente).
- **WebP/AVIF** para logo/banner.
- **Documentación README** (actualmente solo `# MCVOFICIAL`).
- **Página 404** custom.
- **Onboarding** post-registro torneo (qué sigue después de "enviado para aprobación").

## 9.3 Mejoras UX posibles

1. **Unificar design tokens** en un `tokens.css` (color, radius, shadow, spacing, type scale).
2. **Split CSS:** `base.css`, `components.css`, `admin.css`, `vital-public.css`.
3. **Extraer admin JS** a `admin-app.js` modular por tab.
4. **Reducir OAuth friction:** recordar sesión en tickets; merge cuenta/tickets nav.
5. **Mobile-first tournament form:** wizard 3 pasos (team → capitán → jugadores).
6. **Tracker:** historial reciente localStorage; unificar idioma.
7. **Admin Vital:** modo "operador" simplificado vs "completo"; KPIs arriba siempre visible.
8. **Lazy load tabs admin** (render al activar).
9. **Unificar breakpoints** a 3–4 valores (mobile / tablet / desktop / wide).
10. **Accesibilidad:** focus visible consistente; reducir animaciones `prefers-reduced-motion`.

## 9.4 Funcionalidades interesantes

- **Dashboard wipe público:** horas, puntos, top 10 (sync con Discord).
- **Integración Discord rich embed** al registrar torneo (webhook).
- **Notificaciones push PWA** para torneo próximo / stream live.
- **Comparador de jugadores** en Vital (2 Steam IDs side by side).
- **Export PDF** compliance report desde admin.
- **Modo espectador torneo** en vivo: bracket + stream + chat Discord embed.
- **CLI/QR para `/mcv-horas`** desde web cuenta (deep link Discord).
- **Multi-idioma admin** (hoy i18n fuerte en público, admin mayormente ES).
- **Audit log visible** para cambios de puntos (transparencia clan).

---

## Resumen ejecutivo

MCV Oficial es un **ecosistema web maduro y funcional** para un clan de Rust: torneos end-to-end, tracker, streams, tickets, roster, Vital OPS admin y panel miembros. La experiencia pública es **sólida y visualmente coherente en lo esencial** (negro + naranja Rust, Lucide, hero marketing).

Los principales problemas son de **deuda técnica y consistencia**, no de funcionalidad core:

1. **Monolito admin** (~280 KB HTML + 198 KB CSS + JS inline).
2. **CSS/JS duplicado** y archivos huérfanos.
3. **Design system fragmentado** (tokens, botones, cards).
4. **Algunas páginas cargan CSS de admin sin necesidad**.
5. **Features avanzadas solo en Discord/admin** sin equivalente web público (ranking, bracket).

Prioridad recomendada para una futura fase de diseño/desarrollo:

1. Design tokens + split CSS  
2. Modularizar admin  
3. Página pública ranking/bracket  
4. Pulir mobile tournament + tracker i18n  
5. Limpiar dead code  

---

*Documento generado por auditoría estática del repositorio. No se modificó ningún archivo de la aplicación durante este análisis.*
