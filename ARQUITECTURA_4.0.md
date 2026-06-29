# MCV Platform — Arquitectura 4.0

**Documento:** Diseño de plataforma ideal desde cero  
**Enfoque:** Productos · Módulos · Datos · Componentes — no páginas  
**Premisa:** Si hoy existiera que crear la mejor plataforma competitiva de Rust, ¿cómo se construye por dentro?  
**Restricción de implementación:** Los sprints deben convivir con la web 2.x sin romperla  

---

## Visión en una frase

MCV Platform es un **sistema operativo competitivo para clanes de Rust**: identidad (Clan), competición (Compete), identidad del jugador (Player), operaciones internas (Ops), y una capa transversal de identidad, datos y diseño (Core).

---

# 1. Arquitectura ideal

## 1.1 Mapa de productos y módulos

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MCV PLATFORM 4.0                                │
├─────────────────────────────────────────────────────────────────────────┤
│  EXPERIENCE LAYER (frontends)                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  Pulse   │ │ Compete  │ │  Player  │ │   Clan   │ │   Ops    │      │
│  │  (Home)  │ │   App    │ │   App    │ │   App    │ │   App    │      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘      │
├───────┴────────────┴────────────┴────────────┴────────────┴────────────┤
│  SHELL MODULE (shared UI runtime)                                       │
│  Navigation · Auth chrome · Search · Notifications · i18n · Layout    │
├─────────────────────────────────────────────────────────────────────────┤
│  DESIGN SYSTEM (MDS)                                                    │
│  Tokens · Primitives · Patterns · Motion · A11y                         │
├─────────────────────────────────────────────────────────────────────────┤
│  DOMAIN SERVICES (backend modules)                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │ Identity│ │ Compete │ │  Wipe   │ │  Clan   │ │ Support │         │
│  │ Service │ │ Service │ │ Service │ │ Service │ │ Service │         │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                      │
│  │  Scout  │ │  Media  │ │  Live   │ │ Notify  │                      │
│  │ Service │ │ Service │ │ Service │ │ Service │                      │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘                      │
├───────┴────────────┴────────────┴────────────┴─────────────────────────┤
│  INTEGRATION LAYER                                                      │
│  Discord Bot · Vital Rust API · BattleMetrics · Steam · Kick/Twitch    │
├─────────────────────────────────────────────────────────────────────────┤
│  DATA LAYER                                                             │
│  PostgreSQL · Object Storage (uploads) · Cache (Redis opt.) · Events   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1.2 Catálogo de módulos

### A. Experience Apps (frontends modulares)

| Módulo | Producto | Responsabilidad | Usuario |
|--------|----------|-----------------|---------|
| **Pulse** | Home / Now | Responder “qué pasa ahora” y canalizar a 1 acción | Todos |
| **Compete App** | Compete | Torneos, brackets, resultados, calendario, inscripción | Público + jugadores |
| **Player App** | Player | Perfil, stats, historial, comparación | Público + miembros |
| **Clan App** | Clan | Roster, identidad, media, reclutamiento | Público |
| **Account App** | Account | Sesión, tickets, preferencias, mis competiciones | Autenticados |
| **Ops App** | Ops | Admin torneos, wipe, Vital, tickets, audit | Staff |

Cada app es un **bundle lazy-loaded** montado sobre Shell. No son “páginas HTML sueltas”.

---

### B. Shell Module (transversal frontend)

| Responsabilidad | Descripción |
|-----------------|-------------|
| Routing | Rutas por producto, deep links, guards por rol |
| Auth chrome | Avatar, login/logout, rol badge |
| Navigation | Top nav desktop, bottom nav mobile, contextual breadcrumbs |
| Command palette | Búsqueda global ⌘K: jugador, torneo, ticket |
| Notifications | Inbox toast + panel (actividad, ticket updates) |
| i18n runtime | Namespace por módulo, lazy load strings |
| Error boundaries | Empty, error, offline, maintenance |
| Analytics hooks | Eventos producto sin acoplar apps |

**Consume:** Identity Service (session), Notify Service (feed)  
**Reutiliza:** MDS (TopNav, BottomNav, Avatar, CommandPalette, Toast)

---

### C. Design System — MDS (transversal frontend)

| Responsabilidad | Descripción |
|-----------------|-------------|
| Tokens | Color, type, space, radius, shadow, motion |
| Primitives | Button, Input, Card, Badge, etc. |
| Patterns | EventCard, PlayerRow, BracketMatch, StandingsTable |
| Documentation | Storybook / catálogo vivo |

**No consume datos de negocio.** Solo props.

---

### D. Domain Services (backend)

#### Identity Service
| | |
|-|-|
| **Responsabilidad** | OAuth Steam/Google, sesiones JWT, roles (guest, member, staff, organizer), vinculación cuentas |
| **Expone** | `/auth/*`, `/users/me`, permisos |
| **Consume** | Steam OpenID, Google OAuth, DB users |
| **Eventos emitidos** | `user.linked_steam`, `user.role_changed` |
| **Usado por** | Shell, Account, Player, Compete (register), Ops |

#### Compete Service
| | |
|-|-|
| **Responsabilidad** | Torneos CRUD, inscripciones, brackets, resultados, premios, MVP |
| **Expone** | `/compete/tournaments`, `/compete/brackets`, `/compete/registrations` |
| **Consume** | DB tournaments, Identity (capitan), Scout (optional anti-smurf) |
| **Eventos** | `tournament.published`, `registration.approved`, `match.completed`, `bracket.updated` |
| **Usado por** | Pulse, Compete App, Ops, Notify, Player (historial) |

#### Wipe Service
| | |
|-|-|
| **Responsabilidad** | Fases wipe, horas, puntos, tier scoring, calendario MCV, standings |
| **Expone** | `/wipe/standings`, `/wipe/players/:id`, `/wipe/calendar`, `/wipe/phase` |
| **Consume** | Vital Rust API, Discord playtime sync, DB player_info, roster |
| **Eventos** | `wipe.phase_changed`, `standings.updated`, `hours.synced` |
| **Usado por** | Pulse, Player, Compete (contexto), Ops, Discord bot |

#### Clan Service
| | |
|-|-|
| **Responsabilidad** | Roster público, roles, solicitudes perfil, about, partners |
| **Expone** | `/clan/roster`, `/clan/members/:id`, `/clan/join-requests` |
| **Consume** | DB team_roster, Identity |
| **Eventos** | `roster.updated`, `join_request.submitted` |
| **Usado por** | Clan App, Player, Pulse |

#### Player Service (read model agregado)
| | |
|-|-|
| **Responsabilidad** | Vista unificada jugador: perfil público, agregación torneos + wipe + clan |
| **Expone** | `/players/:steamId`, `/players/compare` |
| **Consume** | Compete Service, Wipe Service, Clan Service, Scout (public safe fields) |
| **Eventos** | Ninguno (CQRS read side) |
| **Usado por** | Player App, Compete (match rosters), Ops |

#### Support Service
| | |
|-|-|
| **Responsabilidad** | Tickets crear/consultar/moderar, FAQ, SLA básico |
| **Expone** | `/support/tickets` |
| **Consume** | Identity, DB tickets, Discord webhook (optional) |
| **Eventos** | `ticket.created`, `ticket.resolved` |
| **Usado por** | Account App, Ops, Notify |

#### Scout Service
| | |
|-|-|
| **Responsabilidad** | Lookup Steam/BattleMetrics, risk score, bookmarks staff |
| **Expone** | `/scout/scan`, `/scout/bookmarks` (staff) |
| **Consume** | BattleMetrics, Steam API, cache |
| **Eventos** | `scout.flagged` |
| **Usado por** | Ops, Compete (on register), Player (ban summary public) |

#### Media Service
| | |
|-|-|
| **Responsabilidad** | YouTube/TikTok latest, posters torneo, OG images |
| **Expone** | `/media/feed`, `/media/assets/:id` |
| **Consume** | YouTube API, TikTok scrape, uploads storage |
| **Usado por** | Pulse (optional), Clan App, Compete (posters) |

#### Live Service
| | |
|-|-|
| **Responsabilidad** | Estado streams Kick/Twitch, viewer count, schedule |
| **Expone** | `/live/status`, `/live/schedule` |
| **Consume** | decapi/Twitch API, Kick API |
| **Eventos** | `stream.online`, `stream.offline` |
| **Usado por** | Pulse, Compete (embed torneo), Notify |

#### Notify Service
| | |
|-|-|
| **Responsabilidad** | Feed in-app, preferencias, push PWA (futuro), Discord relay |
| **Expone** | `/notify/inbox`, `/notify/preferences` |
| **Consume** | Eventos de todos los services |
| **Usado por** | Shell, Account, Discord bot |

---

## 1.3 Comunicación entre módulos

### Patrón principal: API REST + eventos internos

```
[Compete App] ──HTTP──▶ [Compete Service] ──SQL──▶ [PostgreSQL]
                              │
                              ▼ emit
                        [Event Bus simple]
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        [Notify Service] [Player Service] [Discord Bot Worker]
         (inbox)          (rebuild read)   (mcv-yo, reminders)
```

- **Síncrono:** frontends → services vía REST/JSON  
- **Asíncrono:** services emiten eventos (in-process al inicio; cola Redis/Rabbit en 4.x)  
- **Read models:** Player Service y Pulse agregan datos de varios services — **no** duplicar lógica en frontend  
- **Bot Discord:** cliente más del ecosistema, no fuente de verdad visual  

### Contratos de datos (ejemplos)

| Entidad | Owner | Readers |
|---------|-------|---------|
| Tournament | Compete | Pulse, Player, Ops, Media |
| Registration | Compete | Account, Ops |
| BracketMatch | Compete | Compete App, Notify |
| WipeStandings | Wipe | Pulse, Player, Ops |
| PlayerProfile | Player (aggregate) | Player App, Compete |
| Ticket | Support | Account, Ops |
| RosterMember | Clan | Clan App, Player |

### Reglas de acoplamiento

1. Un módulo **no** importa DB tables de otro módulo directamente — solo vía API o eventos  
2. Pulse **solo** consume read APIs agregadas (`/pulse/now`)  
3. Ops escribe; apps públicas leen (excepto register, tickets)  
4. Scout nunca expone datos sensibles al público sin scrub  

---

## 1.4 Componentes reutilizados por módulo

| Componente MDS | Pulse | Compete | Player | Clan | Account | Ops |
|----------------|:-----:|:-------:|:------:|:----:|:-------:|:---:|
| NowStrip | ● | ○ | ○ | ○ | ○ | ○ |
| EventCard | ● | ● | ○ | ○ | ○ | ● |
| TournamentHeader | ○ | ● | ○ | ○ | ○ | ● |
| BracketViewer | ○ | ● | ○ | ○ | ○ | ● |
| StandingsTable | ● | ● | ● | ○ | ○ | ● |
| PlayerRow | ○ | ● | ● | ● | ○ | ● |
| PlayerCard | ○ | ○ | ● | ● | ○ | ○ |
| RosterGrid | ○ | ○ | ○ | ● | ○ | ○ |
| RegistrationWizard | ○ | ● | ○ | ○ | ○ | ● |
| OAuthGate | ○ | ● | ○ | ○ | ● | ○ |
| TicketTimeline | ○ | ○ | ○ | ○ | ● | ● |
| OpsDataTable | ○ | ○ | ○ | ○ | ○ | ● |
| StatKPI | ● | ● | ● | ○ | ○ | ● |
| LiveEmbed | ● | ● | ○ | ○ | ○ | ○ |
| EmptyState | ● | ● | ● | ● | ● | ● |
| ConfirmDialog | ○ | ○ | ○ | ○ | ○ | ● |

● = uso primario · ○ = no usa o uso secundario

---

# 2. User Journey

## 2.1 Visitante nuevo

**Objetivo:** Entender MCV en 5 s y unirse a Discord o ver torneos.

| Paso | Módulo | Acción | Sistema |
|------|--------|--------|---------|
| 1 | Pulse | Aterriza en `/` | Ve NowStrip: torneo activo o “Únete al clan” |
| 2 | Pulse | Lee 1 línea identidad | “Clan competitivo Rust — torneos y wipes” |
| 3 | Pulse | Click **Discord** | Sale a invite (external) |
| 4 | Compete | Opcional: explora torneos | Lista filtrada “Abiertos” |
| 5 | Player | Opcional: busca amigo | `/players/:steamId` desde search |
| 6 | Clan | Opcional: ve roster | Confianza social |

**Fricción eliminada:** sin login, sin tracker, sin 7 nav items, sin scroll infinito.

**Métrica éxito:** % clicks Discord o Compete < 30 s.

---

## 2.2 Jugador (externo al clan, participa torneos)

**Objetivo:** Inscribirse y jugar un torneo sin preguntar en Discord.

| Paso | Módulo | Acción | Sistema |
|------|--------|--------|---------|
| 1 | Pulse / Compete | Encuentra torneo abierto | Filter status=open |
| 2 | Compete | Entra detalle torneo | Ve rules summary, prize, deadline |
| 3 | Identity | Login Steam 1-click | JWT session |
| 4 | Compete | RegistrationWizard 3 pasos | Team → Capitán → Roster 5 |
| 5 | Compete | Submit | Status “Pending approval” |
| 6 | Notify | Recibe confirmación | In-app + Discord DM optional |
| 7 | Account | Ve “Mis torneos” | Estado inscripción |
| 8 | Compete | Tras aprobación | Acceso bracket, check-in |
| 9 | Compete | Post-match | Ve resultado, MVP vote optional |
| 10 | Player | Perfil actualizado | Historial torneo en perfil |

**Métrica éxito:** >70% registrations completed mobile.

---

## 2.3 Miembro del clan

**Objetivo:** Saber cómo va el wipe y su posición; cargar horas; ver stats.

| Paso | Módulo | Acción | Sistema |
|------|--------|--------|---------|
| 1 | Pulse | Ve fase wipe en Now | Link a Standings |
| 2 | Wipe / Compete | Standings | Su rank highlighted si logueado |
| 3 | Discord bot | Postea horas | Wipe Service sync |
| 4 | Player | Ve perfil propio | Puntos, breakdown Vital |
| 5 | Player | Compara con rival | Compare module |
| 6 | Compete | Participa torneo interno | Mismo flow jugador |
| 7 | Account | Ticket si problema | Support Service |
| 8 | Notify | Alertas fase wipe | “Ventana horas abre mañana” |

**Métrica éxito:** miembros visitan standings 2×/semana en wipe activo.

---

## 2.4 Staff (operaciones clan)

**Objetivo:** Gestionar wipe y soporte con mínimo clics, audit trail.

| Paso | Módulo | Acción | Sistema |
|------|--------|--------|---------|
| 1 | Ops | Login `/ops` | Role staff |
| 2 | Ops / Wipe | Dashboard KPIs | Pendientes horas, sync status |
| 3 | Ops / Wipe | Sync playtime / ajustar puntos | Wipe Service |
| 4 | Ops / Support | Resolver tickets | Support Service |
| 5 | Ops / Scout | Evaluar candidato | Scout Service |
| 6 | Ops | Audit log review | Quién cambió qué |

**Métrica éxito:** sync playtime < 3 clicks from dashboard.

---

## 2.5 Organizador (torneos)

**Objetivo:** Publicar torneo → bracket → resultados sin fricción.

| Paso | Módulo | Acción | Sistema |
|------|--------|--------|---------|
| 1 | Ops / Compete | Crear torneo template | Compete Service |
| 2 | Ops | Publicar + poster | Media Service |
| 3 | Pulse | Auto aparece en Now | Event bus |
| 4 | Ops | Aprobar equipos | Queue registrations |
| 5 | Ops | Generate bracket | Compete Service |
| 6 | Compete App | Bracket público live | BracketViewer |
| 7 | Ops | Advance round / report score | Match updates |
| 8 | Ops | Finalizar + campeón | HoF + Player profiles |
| 9 | Notify | Anuncio resultados | Discord + in-app |

**Métrica éxito:** torneo publicado → bracket visible < 10 min workflow.

---

# 3. Wireframes (ASCII)

## 3.1 Home (Pulse)

```
┌──────────────────────────────────────────┐
│ MCV          Compete Clan Live*    [👤] │
├──────────────────────────────────────────┤
│ NOW                                      │
│ ┌──────────────────────────────────────┐ │
│ │ ● LIVE  Torneo 2v2 #47               │ │
│ │ Inscripción cierra en 04:12:33       │ │
│ │ [ Participar ]  [ Ver bracket ]      │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Clan competitivo de Rust                 │
│ Torneos · Wipes · Comunidad              │
│                                          │
│ [══════ Unirse a Discord ══════]         │
│ [ Ver torneos abiertos ]                 │
│                                          │
│ RESULTADOS RÁPIDOS                       │
│ #1 TeamAlpha  #2 RustKings  #3 MCV-B     │
│ [ Ranking completo → ]                   │
│                                          │
│ ROSTER · 14 activos · 2 live ahora       │
│ [ Ver clan → ]                           │
├──────────────────────────────────────────┤
│ Compete │ Clan │ Live* │ Account         │
└──────────────────────────────────────────┘
```

---

## 3.2 Compete (hub)

```
┌──────────────────────────────────────────┐
│ ← MCV    COMPETE                   [⌘K] │
├──────────────────────────────────────────┤
│ [ Abiertos ] [ En curso ] [ Finalizados ]│
│ [ Calendario ] [ Ranking wipe ]          │
├──────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ OPEN · 2v2 Weekly        04:12:33  │ │
│ │ Premio $200 · 8/16 equipos         │ │
│ │ [ Ver ] [ Registrar ]              │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ LIVE · Clan Draft        Ronda 2   │ │
│ │ [ Bracket ] [ Stream ]             │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ END  · Monthly Cup       🏆 HoF    │ │
│ │ Campeón: TeamAlpha                 │ │
│ └────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ HALL OF FAME (horizontal scroll)         │
│ [T47][T46][T45]...                       │
└──────────────────────────────────────────┘
```

---

## 3.3 Jugador (Player profile)

```
┌──────────────────────────────────────────┐
│ ← Compete    PLAYER                [⌘K] │
├──────────────────────────────────────────┤
│ ┌────┐  Walphur                          │
│ │ AV │  MCV · Builder · Miembro 2024     │
│ └────┘  Steam · Discord · Kick           │
│         [ Comparar ] [ Seguir ]          │
├──────────────────────────────────────────┤
│ WIPE ACTUAL                              │
│ Rank #7 · 42 pts · 31h                   │
│ ████████░░ Farm  ██████░░░░ PVP          │
│ [ Ver breakdown ]                        │
├──────────────────────────────────────────┤
│ TORNEOS                                  │
│ T45 Winner · T44 Top 4 · T43 —           │
├──────────────────────────────────────────┤
│ MEDALLAS                                 │
│ [MVP T45] [Top farm W12] [100h]          │
└──────────────────────────────────────────┘
```

---

## 3.4 Clan

```
┌──────────────────────────────────────────┐
│ ← MCV      CLAN                    [👤] │
├──────────────────────────────────────────┤
│ [ Roster ] [ About ] [ Media ]           │
├──────────────────────────────────────────┤
│ 14 miembros · Reclutamiento: ABIERTO     │
│ [ Filtrar: Todos | Streamers | Staff ]   │
│                                          │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ │  AV     │ │  AV     │ │  AV     │   │
│ │ Kami    │ │ Walphur │ │ TDM     │   │
│ │ Leader  │ │ Builder │ │ PVP     │   │
│ │ ● live  │ │         │ │         │   │
│ └─────────┘ └─────────┘ └─────────┘   │
│                                          │
│ [ Aplicar al clan ] (si abierto)         │
└──────────────────────────────────────────┘
```

---

## 3.5 Evento (Tournament detail)

```
┌──────────────────────────────────────────┐
│ ← Compete                          [🔗] │
├──────────────────────────────────────────┤
│ 2v2 WEEKLY #47                           │
│ ● INSCRIPCIÓN ABIERTA · cierra 4h        │
│ Premio $200 · BO3 · Max 16 teams         │
├──────────────────────────────────────────┤
│ [ Overview │ Register │ Bracket │ Rules ]│
├──────────────────────────────────────────┤
│ OVERVIEW                                 │
│ ┌──────────────────────────────────────┐ │
│ │ 📅 22 Jun  · 🎮 EU  · 👥 5v5 roster  │ │
│ │ Descripción corta del torneo...      │ │
│ └──────────────────────────────────────┘ │
│ STREAM (si live)                         │
│ ┌──────────────────────────────────────┐ │
│ │ [ Twitch embed ]                     │ │
│ └──────────────────────────────────────┘ │
│ EQUIPOS CONFIRMADOS (8)                  │
│ TeamAlpha · RustKings · ...              │
│ [ Registrar mi equipo ]                  │
└──────────────────────────────────────────┘
```

---

## 3.6 Bracket

```
┌──────────────────────────────────────────┐
│ ← Torneo #47   BRACKET             LIVE  │
├──────────────────────────────────────────┤
│ Ronda: [ QF ] [ SF ] [ Final ]           │
├──────────────────────────────────────────┤
│        │                                 │
│ TAlpha ├──┐                              │
│        │  ├── TeamAlpha ──┐              │
│ RKings ├──┘              │              │
│                          ├── FINAL       │
│ MCV-B  ├──┐              │              │
│        │  ├── MCV-B ──────┘              │
│ Outs   ├──┘                              │
│                                          │
│ ┌ Match detail (tap) ──────────────────┐ │
│ │ TAlpha vs RKings · BO3 · 21:00 UTC │ │
│ │ Score: 2 - 1 · [ Ver VOD ]          │ │
│ └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
     ◀ scroll horizontal mobile ▶
```

---

## 3.7 Cuenta (Account)

```
┌──────────────────────────────────────────┐
│ ACCOUNT                            [⚙]  │
├──────────────────────────────────────────┤
│ ┌────┐  Walphur                          │
│ │ AV │  Steam ✓ · Google ✓               │
│ └────┘  [ Ver perfil público ]           │
├──────────────────────────────────────────┤
│ MIS TORNEOS                              │
│ #47 Pending · #44 Winner                 │
│ [ Ver todos → ]                          │
├──────────────────────────────────────────┤
│ SOPORTE                                  │
│ Ticket #8821 · Abierto                   │
│ [ Nuevo ticket ]                         │
├──────────────────────────────────────────┤
│ NOTIFICACIONES                           │
│ ● Aprobado equipo #47                    │
│ ○ Ventana horas abre mañana              │
├──────────────────────────────────────────┤
│ [ Cerrar sesión ]                        │
└──────────────────────────────────────────┘
```

---

## 3.8 Dashboard (Member — post-login home)

```
┌──────────────────────────────────────────┐
│ Hola, Walphur                     [🔔3] │
├──────────────────────────────────────────┤
│ TU WIPE                                  │
│ #7 · 42 pts · 31h · +3 desde ayer        │
│ [ Cargar horas (Discord) ] [ Stats ]     │
├──────────────────────────────────────────┤
│ PRÓXIMO                                 │
│ Torneo #47 · Check-in en 2h              │
│ [ Ver bracket ]                          │
├──────────────────────────────────────────┤
│ ACTIVIDAD CLAN                           │
│ TDM subió a #5 · Stream Kami live        │
└──────────────────────────────────────────┘
```

---

## 3.9 Ops

```
┌──────────────────────────────────────────────────────────┐
│ OPS · MCV          [Compete|Wipe|Support|Scout]    Walphur│
├────────────┬─────────────────────────────────────────────┤
│ OVERVIEW   │ KPIs                                        │
│ Compete    │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│ Wipe       │ │Pending│ │Hours │ │Ticket│ │Vital │        │
│ Support    │ │ regs 3│ │ 12 ∅ │ │  2   │ │ OK   │        │
│ Scout      │ └──────┘ └──────┘ └──────┘ └──────┘        │
│ Audit      │                                             │
│ Settings   │ QUICK ACTIONS                                │
│            │ [ Sync playtime ] [ New tournament ]        │
│            │                                             │
│            │ RECENT AUDIT                                 │
│            │ 14:02 walphur +5pts TDM                     │
│            │ 13:58 system  sync playtime 21 players      │
└────────────┴─────────────────────────────────────────────┘
```

---

# 4. Component Library

Convención naming: `Mcv` prefix en código futuro. Documentación por componente.

---

## 4.1 Layout & Navigation

### McvShell
| | |
|-|-|
| **Propósito** | Contenedor raíz: nav + outlet + footer |
| **Variantes** | `public`, `account`, `ops` |
| **Estados** | loading, maintenance |
| **Responsive** | bottom nav ≤768px; top nav >768px |
| **Reutilización** | Todas las apps |

### McvTopNav
| | |
|-|-|
| **Propósito** | Navegación desktop + logo + actions |
| **Variantes** | `default`, `minimal` (ops), `transparent` (pulse hero) |
| **Estados** | scrolled (solid bg) |
| **Responsive** | hidden mobile |
| **Reutilización** | Shell public, ops |

### McvBottomNav
| | |
|-|-|
| **Propósito** | Nav principal mobile thumb-zone |
| **Variantes** | 4 items; Live tab conditional |
| **Estados** | active item, badge dot |
| **Responsive** | mobile only |
| **Reutilización** | Shell public |

### McvBreadcrumb
| | |
|-|-|
| **Propósito** | Orientación jerárquica |
| **Variantes** | `compact`, `withIcon` |
| **Estados** | — |
| **Responsive** | truncate middle mobile |
| **Reutilización** | Compete, Player, Ops |

---

## 4.2 Data Display

### McvNowStrip
| | |
|-|-|
| **Propósito** | Single priority “what’s happening” |
| **Variantes** | `tournament`, `wipe`, `live`, `idle` |
| **Estados** | loading skeleton, error fallback |
| **Responsive** | full width; stack actions mobile |
| **Reutilización** | Pulse, Dashboard |

### McvEventCard
| | |
|-|-|
| **Propósito** | Torneo/wipe en lista |
| **Variantes** | `open`, `live`, `finished`, `compact` |
| **Estados** | hover, selected |
| **Responsive** | list mobile; grid desktop optional |
| **Reutilización** | Pulse, Compete, Ops |

### McvStandingsTable
| | |
|-|-|
| **Propósito** | Ranking wipe/torneo |
| **Variantes** | `wipe`, `tournament`, `compact-top10` |
| **Estados** | row highlight (self), loading, empty |
| **Responsive** | table desktop → McvPlayerRow list mobile |
| **Reutilización** | Compete, Player, Pulse, Ops |

### McvPlayerRow
| | |
|-|-|
| **Propósito** | Fila jugador con rank, pts, hours |
| **Variantes** | `standings`, `roster`, `selectable` |
| **Estados** | highlight, disabled |
| **Responsive** | swipe actions ops mobile |
| **Reutilización** | Standings, Clan, Ops, Bracket |

### McvPlayerCard
| | |
|-|-|
| **Propósito** | Card identidad jugador |
| **Variantes** | `roster`, `search-result`, `compare-slot` |
| **Estados** | live badge, offline |
| **Responsive** | 2 col grid mobile clan |
| **Reutilización** | Clan, Player, Scout |

### McvBracketViewer
| | |
|-|-|
| **Propósito** | Visualización bracket |
| **Variantes** | `single-elim`, `double-elim`, `swiss` |
| **Estados** | match selected, live pulse |
| **Responsive** | horizontal scroll + pinch mobile |
| **Reutilización** | Compete, Ops |

### McvMatchDetail
| | |
|-|-|
| **Propósito** | Sheet/modal detalle partido |
| **Variantes** | `readonly`, `ops-edit` |
| **Estados** | scheduled, live, completed |
| **Responsive** | bottom sheet mobile |
| **Reutilización** | Bracket, Ops |

### McvStatKPI
| | |
|-|-|
| **Propósito** | Métrica única grande |
| **Variantes** | `default`, `delta` (+3), `alert` |
| **Estados** | loading |
| **Responsive** | 2×2 grid mobile ops |
| **Reutilización** | Pulse, Dashboard, Ops |

### McvTimeline
| | |
|-|-|
| **Propósito** | Actividad, audit, ticket history |
| **Variantes** | `activity`, `audit`, `ticket` |
| **Estados** | — |
| **Responsive** | vertical always |
| **Reutilización** | Account, Ops, Player |

---

## 4.3 Forms & Input

### McvButton
| | |
|-|-|
| **Propósito** | Acción primaria/secundaria |
| **Variantes** | `primary`, `secondary`, `ghost`, `danger`, `icon` |
| **Estados** | default, hover, active, disabled, loading |
| **Responsive** | full width mobile primary |
| **Reutilización** | Universal |

### McvInput / McvTextarea / McvSelect
| | |
|-|-|
| **Propósito** | Entrada formulario |
| **Variantes** | `mono` (Steam ID), `search` |
| **Estados** | focus, error, disabled |
| **Responsive** | 44px min touch |
| **Reutilización** | Universal |

### McvRegistrationWizard
| | |
|-|-|
| **Propósito** | Inscripción torneo multi-step |
| **Variantes** | 5v5 default |
| **Estados** | step 1-3, submitting, success, error |
| **Responsive** | 1 step per screen mobile |
| **Reutilización** | Compete, Ops preview |

### McvOAuthGate
| | |
|-|-|
| **Propósito** | Bloqueo contenido hasta login |
| **Variantes** | `steam-only`, `steam-google` |
| **Estados** | loading session |
| **Responsive** | centered card |
| **Reutilización** | Compete register, Account, Player private stats |

### McvSearchPalette
| | |
|-|-|
| **Propósito** | ⌘K búsqueda global |
| **Variantes** | — |
| **Estados** | empty, results grouped, loading |
| **Responsive** | fullscreen mobile |
| **Reutilización** | Shell |

---

## 4.4 Feedback & Utility

### McvBadge
| | |
|-|-|
| **Propósito** | Status label |
| **Variantes** | `live`, `open`, `closed`, `tier`, `role`, `phase` |
| **Estados** | pulse (live) |
| **Responsive** | — |
| **Reutilización** | Universal |

### McvToast
| | |
|-|-|
| **Propósito** | Feedback efímero |
| **Variantes** | success, error, info |
| **Estados** | enter/exit |
| **Responsive** | top mobile; bottom-right desktop |
| **Reutilización** | Universal |

### McvEmptyState
| | |
|-|-|
| **Propósito** | Zero data con CTA |
| **Variantes** | por contexto (no tournaments, no hours, etc.) |
| **Estados** | — |
| **Responsive** | — |
| **Reutilización** | Universal |

### McvSkeleton
| | |
|-|-|
| **Propósito** | Loading placeholder |
| **Variantes** | `card`, `row`, `text`, `bracket` |
| **Estados** | animate |
| **Responsive** | — |
| **Reutilización** | Universal |

### McvDialog / McvSheet
| | |
|-|-|
| **Propósito** | Confirmación / detalle |
| **Variantes** | `dialog` desktop, `sheet` mobile |
| **Estados** | open/close |
| **Responsive** | auto switch breakpoint |
| **Reutilización** | Ops confirm, Match detail |

### McvLiveEmbed
| | |
|-|-|
| **Propósito** | Player Kick/Twitch |
| **Variantes** | `16:9`, `mini` |
| **Estados** | offline placeholder |
| **Responsive** | full width |
| **Reutilización** | Pulse, Event, Compete |

### McvAvatar
| | |
|-|-|
| **Propósito** | Imagen usuario/Steam |
| **Variantes** | `sm`, `md`, `lg`, `withStatus` |
| **Estados** | live dot |
| **Responsive** | — |
| **Reutilización** | Universal |

---

## 4.5 Ops-specific

### McvOpsSidebar
| | |
|-|-|
| **Propósito** | Nav módulos ops |
| **Variantes** | collapsed |
| **Estados** | active module |
| **Responsive** | drawer mobile |
| **Reutilización** | Ops only |

### McvOpsDataTable
| | |
|-|-|
| **Propósito** | Tabla densa con sort/filter/bulk |
| **Variantes** | `registrations`, `roster`, `tickets` |
| **Estados** | loading, selected rows |
| **Responsive** | card fallback mobile |
| **Reutilización** | Ops modules |

### McvAuditEntry
| | |
|-|-|
| **Propósito** | Línea log audit |
| **Variantes** | — |
| **Estados** | — |
| **Responsive** | — |
| **Reutilización** | Ops, Wipe module |

---

# 5. Información

## 5.1 Inventario por dominio

| Dominio | Datos actuales en plataforma |
|---------|----------------------------|
| Identidad | Steam ID, Discord, Google, persona, avatar |
| Torneo | Nombre, slug, status, rules, schedule, prize, poster, roster inscrito |
| Bracket | Matches, rounds, scores, seeds |
| Wipe | Fase, horas, puntos, breakdown Vital, extras, tier config |
| Clan | Roster, roles, redes, solicitudes |
| Scout | VAC, bans, hours Rust, servers, BM ID |
| Live | Kick/Twitch status, viewers |
| Support | Ticket type, status, descripción |
| Media | YouTube, TikTok videos |
| Meta | Discord member count, torneos hosteados, online |

---

## 5.2 Información CRÍTICA (mostrar siempre, prominente)

| Dato | Por qué | Módulo |
|------|---------|--------|
| **Estado “now”** (torneo live / wipe phase / stream) | Decisión inmediata | Pulse |
| **CTA Discord** | Conversión clan | Pulse |
| **Torneos abiertos** | Participación | Compete |
| **Deadline inscripción** | Urgencia | Event |
| **Tu rank + pts + horas** (si miembro) | Motivación wipe | Dashboard, Standings |
| **Bracket actual** (si torneo en curso) | Espectadores + players | Compete |
| **Estado inscripción propia** | Ansiedad usuario | Account |
| **Steam vinculado** | Gate funcional | Account |
| **Pendientes ops** (regs, tickets, sync) | Eficiencia staff | Ops KPI |

---

## 5.3 Información SECUNDARIA (disponible pero no prominente)

| Dato | Dónde |
|------|-------|
| Historial torneos | Compete → Finalizados |
| Hall of Fame | Compete bottom |
| Rules completas | Event tab Rules |
| Breakdown Vital detallado | Player profile expand |
| Redes sociales miembro | Player/Clan card |
| YouTube/TikTok | Clan → Media |
| Ticket ID lookup | Account → Support |
| Comparador jugadores | Player → Compare |
| Audit log completo | Ops → Audit |
| Tier config tables | Ops → Wipe advanced |

---

## 5.4 Información que SOBRA (eliminar de experiencia default)

| Dato | Razón |
|------|-------|
| 4 stat boxes igual peso home | Sin jerarquía |
| “Valores” bento / strip decorativo | No actionable |
| Setup hints Google Console login | Dev-only |
| Admin link footer público | Rompe producto |
| Tracker en nav principal | Niche tool |
| Live page cuando offline | Dead end |
| Duplicar Discord 5× por pantalla | Ruido |
| Vital tier config labels público | Demasiado técnico |
| Nombres internal “Bot”, “Vital OPS” | Jargon |
| Imgur broken poster fallback text | Polish ops |

---

## 5.5 Información que puede OCULTARSE (progressive disclosure)

| Dato | Trigger para mostrar |
|------|---------------------|
| Scout full report | Click “Investigar” staff |
| Extras manuales puntos | Expand row perfil |
| Tier thresholds | “¿Cómo se calculan?” link |
| BM manual URL | Ops scout only |
| Join request form | Magic link / reclutamiento abierto |
| Export Excel | Ops action menu |
| Config server wipe IDs | Ops settings |
| OAuth Google admin | Ops login advanced |

---

## 5.6 Información que debe aparecer AUTOMÁTICAMENTE

| Dato | Trigger | Comportamiento |
|------|---------|----------------|
| Now strip content | API `/pulse/now` poll 60s | Auto swap torneo/live/wipe |
| Live tab nav | Live Service online | Tab aparece sin deploy |
| Highlight “tu fila” standings | Session steam match | Scroll + highlight |
| Countdown inscripción | Deadline torneo | Tick cada segundo |
| Notify “aprobado” | Event registration.approved | Toast + inbox |
| Phase wipe change | Cron/event phase | Banner Account + Discord |
| Empty state CTA | Zero data | Contextual (“Registrar”, “Discord”) |
| Bracket update | match.completed | WebSocket future; poll interim |
| Stream embed torneo | Tournament live flag | Tab Stream auto |
| Check-in reminder | T-2h match | Notify push |

---

# 6. Sprint Plan (sin romper web 2.x)

**Estrategia:** Strangler Fig Pattern — nuevo shell y APIs conviven con HTML legacy. Feature flags + rutas paralelas + redirects progresivos.

---

## Sprint 1 — Foundation & Pulse

**Objetivo:** Design System + API agregada “Now” + shell mínimo conviviendo con home actual.

| Entrega | Tipo | Convivencia |
|---------|------|-------------|
| MDS tokens + 8 primitivos (Button, Input, Card, Badge, Avatar, Skeleton, Toast, EmptyState) | CSS/JS package `/mds/` | No toca CSS viejo; link opcional |
| `/api/pulse/now` agregando torneo+live+wipe phase | Backend nuevo endpoint | Lee DB/API existentes |
| `pulse.html` o `/v3/` home alternativa | Nueva ruta | `index.html` intacto; banner “probar nueva home” staff-only optional |
| McvNowStrip + McvEventCard componentes | MDS | Solo en pulse route |
| Métricas analytics eventos | Hook | Sin UI user |

**Criterio done:** Pulse page carga Now en <2s; index.html 100% funcional.

**Rollback:** Desactivar link a pulse; endpoint inofensivo.

---

## Sprint 2 — Compete Hub (read-only)

**Objetivo:** Hub Compete unificado lectura; bracket viewer MVP.

| Entrega | Tipo | Convivencia |
|---------|------|-------------|
| `/compete/` SPA shell o MPA `compete/index.html` | Nueva ruta | `events.html` + `tournament.html` siguen; nav dual |
| Lista torneos consume API existente | Read-only | Misma data |
| `/compete/t/:slug` detalle tabs Overview/Bracket/Rules | Nueva UI | Old tournament.html link “versión clásica” footer |
| McvBracketViewer read-only | Component | API bracket existente |
| `/compete/standings` placeholder wipe | Read Wipe Service API new | Datos desde endpoints actuales vital/wipe report |
| Redirect 302 opcional events → compete | Config flag | Default OFF |

**Criterio done:** Usuario puede ver torneos + bracket sin admin; registro sigue en old page o deep link.

**Rollback:** Flag OFF; nav apunta events.html.

---

## Sprint 3 — Account + Registration Wizard

**Objetivo:** Unificar auth UX + wizard inscripción en nuevo Compete.

| Entrega | Tipo | Convivencia |
|---------|------|-------------|
| `/account/` dashboard nuevo | Nueva ruta | `cuenta.html` parallel; nav avatar dual |
| McvRegistrationWizard | Component | POST mismo `/api/tournaments/:slug/register` |
| McvOAuthGate unificado | Component | Reemplaza gates duplicados tickets/cuenta gradualmente |
| Notify inbox básico (read) | Backend + UI | Opcional; tickets still work old |
| Player profile MVP `/players/:steamId` read-only | Nueva ruta | Agrega datos existentes |

**Criterio done:** Inscripción completa en wizard mobile; old form sigue accesible.

**Rollback:** Register button apunta tournament.html#register.

---

## Sprint 4 — Ops Shell + Cutover

**Objetivo:** Separar ops; redirects principales; deprecar rutas legacy.

| Entrega | Tipo | Convivencia |
|---------|------|-------------|
| `/ops/` shell SPA módulos Compete/Wipe/Support | Nueva ruta | `admin.html` parallel “classic admin” link |
| Ops KPI dashboard | Read APIs | No migrate Vital edit day 1 |
| Wipe standings integrado ops + público | Shared Wipe Service | admin Vital tab still works |
| Nav 4.0 bottom + top (feature flag) | Shell | Old nav via flag |
| 301 redirects: events→compete, cuenta→account | Config flag staged | Gradual 10% → 100% |
| Deprecate bot.html nav → /tools/scout | Redirect | bot.html funciona |

**Criterio done:** Staff puede aprobar regs en ops OR admin; public compete default ON flag.

**Rollback:** Feature flags revert all redirects.

---

## Post-Sprint (visión, no scope)

| Sprint 5+ | Entrega |
|-----------|---------|
| 5 | Wipe Service extract + Player compare + calendar |
| 6 | Notify push + activity feed |
| 7 | Ops Vital edit migrado; admin.html retired |
| 8 | Real-time bracket; search palette |
| 9 | pulse → index cutover 100% |
| 10 | Platform API public read-only |

---

## Matriz de riesgo por sprint

| Riesgo | Mitigación |
|--------|------------|
| Romper torneo registro | Mismo API endpoint; A/B UI |
| Admin monolito dependency | Ops read-first; write later |
| CSS conflicts | Prefijo `.mds-` namespace |
| SEO URLs cambian | 301 + canonical |
| Staff resistance | Classic mode 90 días |
| Scope creep | Sprint goals locked; backlog 4.x |

---

## Definición de “plataforma 4.0 completa”

- [ ] 6 experience apps sobre Shell  
- [ ] 9 domain services con contratos claros  
- [ ] MDS 30+ componentes documentados  
- [ ] Pulse responde now en 1 API call  
- [ ] Compete ciclo completo público  
- [ ] Player perfil agregado  
- [ ] Ops separado sin admin monolito  
- [ ] Legacy HTML retired con redirects  
- [ ] Mobile bottom nav default  
- [ ] Métricas producto en dashboard  

---

*Arquitectura 4.0 — documento de diseño. Sin implementación. Compatible con migración incremental desde web 2.x.*
