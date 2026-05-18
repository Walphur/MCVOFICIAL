/**
 * MCV i18n — Español / English (Rust communities). Preferencia en localStorage `mcv_lang`.
 * Cada página: <script src="mcv-i18n.js"></script> (antes de scripts inline que usen mcvT) y data-mcv-page en <body>.
 * Textos: data-i18n="clave" (texto), data-i18n-html (HTML de confianza), data-i18n-placeholder, data-i18n-title, data-i18n-aria-label.
 */
(function (w) {
    var STORAGE = "mcv_lang";
    var PAGE_TITLE_KEYS = {
        index: "pageTitle.index",
        events: "pageTitle.events",
        tournament: "pageTitle.tournament",
        bot: "pageTitle.bot",
        tickets: "pageTitle.tickets",
        live: "pageTitle.live",
        login: "pageTitle.login",
        admin: "pageTitle.admin",
        players: "pageTitle.players"
    };

    var DICT = {
        es: {
            "lang.label": "Idioma",
            "nav.clan": "Clan",
            "nav.torneos": "Torneos",
            "nav.players": "Jugadores",
            "nav.bot": "Bot",
            "nav.tickets": "Tickets",
            "nav.streams": "Streams",
            "pageTitle.index": "MCV Oficial — Clan Rust y torneos",
            "pageTitle.events": "MCV — Torneos",
            "pageTitle.tournament": "MCV — Torneo",
            "pageTitle.bot": "MCV Tracker — Anti-cheat",
            "pageTitle.tickets": "MCV — Tickets",
            "pageTitle.live": "MCV — Streams en vivo",
            "pageTitle.login": "MCV — Admin login",
            "pageTitle.admin": "MCV — Control Room",
            "pageTitle.players": "MCV — Jugadores wipe",
            "home.tagline": "// Clan Rust competitivo",
            "home.lead": "Clan competitivo, eventos, streams y herramientas para administrar jugadores de Rust con más criterio.",
            "home.ctaTournaments": "Ver torneos",
            "home.ctaTracker": "Abrir tracker",
            "home.ctaDiscord": "Discord",
            "home.eventCta": "Ver detalle",
            "home.statHosted": "// Torneos hosteados",
            "home.statDiscord": "// Miembros Discord",
            "home.statOnline": "// Online ahora",
            "home.statWipes": "// Jugadores al wipe",
            "home.statWipesHint":
                "Si no definís MCV_HOME_WIPE_PLAYERS, el número puede salir de la lista automática (/mcv-wipe en Discord). También podés fijar el valor a mano en el servidor.",
            "home.strip1": "Red MCV",
            "players.heroTag": "// MCV · Wipe roster",
            "players.heroTitle": "Jugadores",
            "players.heroTitleSpan": "del wipe.",
            "players.heroLead": "Nombre y foto de Steam en vivo: vinculá tu cuenta con el comando de Discord y aparecés en esta grilla.",
            "players.ctaDiscord": "Discord",
            "players.ctaEvents": "Torneos",
            "players.hintSlash": "En Discord usá /mcv-wipe y pegá tu SteamID64 (17 dígitos). Opcional: en el canal configurado podés escribir !mcvsteam 76561198… Es el mismo bot MCV: invitalo al Discord privado del clan y configurá DISCORD_WIPE_GUILD_ID con el ID de ese servidor.",
            "players.countLabel": "Registrados: {n}",
            "players.empty": "Todavía no hay jugadores registrados para este wipe.",
            "players.loadError": "No se pudo cargar la lista. Comprobá que el API esté en línea.",
            "players.noApi": "Falta la URL del API (meta mcv-api o ?api=…).",
            "players.discordUnknown": "Steam",
            "players.backHome": "← Sitio",
            "home.strip2": "Torneos Rust",
            "home.strip3": "Anti-cheat",
            "home.strip4": "Streams en vivo",
            "home.opsLabel": "// Operaciones MCV",
            "home.opsTitle": "Clan",
            "home.opsTitleSpan": "System.",
            "home.opsDesc": "Un ecosistema para competir, organizar torneos, revisar jugadores y mover comunidad sin perder el ritmo del wipe.",
            "home.featureTracker": "MCV Tracker",
            "home.featureTrackerH": "Investigá jugadores",
            "home.featureTrackerP": "Steam, BattleMetrics, Discord y señales de riesgo resumidas para admins.",
            "home.featureEvents": "Torneos",
            "home.featureEventsH": "Torneos activos",
            "home.featureEventsP": "Reglas, inscripciones, premios y calendario competitivo del clan.",
            "home.featureLive": "Streams",
            "home.featureLiveH": "Directos oficiales",
            "home.featureLiveP": "Kick, Twitch y cobertura en vivo de raids, scrims y eventos.",
            "home.ctaJoinLabel": "// Unite a la red",
            "home.ctaJoinTitle": "Entrá al",
            "home.ctaJoinTitleSpan": "comando.",
            "home.ctaJoinDesc": "Unite al Discord para participar en eventos, encontrar equipo y seguir la actividad oficial de MCV.",
            "home.ctaJoinBtn": "Entrar al Discord",
            "footer.navTitle": "// Navegación",
            "footer.socialTitle": "// Redes",
            "footer.copy": "© 2026 MCV Clan. Todos los derechos reservados.",
            "footer.disclaimer": "No afiliado a Facepunch Studios",
            "footer.admin": "Admin",
            "events.heroTag": "// MCV · Rust · Competencia",
            "events.heroTitle": "Torneos",
            "events.heroTitleSpan": "MCV.",
            "events.heroLead": "Calendario, historial con campeones y enlace al registro cuando el torneo esté abierto.",
            "events.heroFeatured": "Torneo destacado",
            "events.featuredOpen": "Abrir",
            "events.statHosted": "Torneos en la web",
            "events.statRegs": "Registros totales",
            "events.statState": "Estado torneo",
            "events.colUp": "Próximos",
            "events.colUpSub": "Inscripciones abiertas o en curso.",
            "events.colPast": "Historial",
            "events.colPastSub": "Torneos finalizados y campeones.",
            "events.emptyUp": "No hay torneos próximos. Volvé pronto o mirá el historial.",
            "events.emptyPast": "Todavía no hay torneos cerrados en la base.",
            "events.connectFail":
                "No se pudo conectar al API. Si en Render no hay un Web Service desplegado en la URL del backend, el navegador muestra CORS + error: abrí en una pestaña la URL del API (ej. …onrender.com/api/health): si ves solo \"Not Found\", tenés que crear o desplegar el servicio Node (root mcv-backend, start npm start) y luego poner esa URL en meta mcv-api o events.html?api=…",
            "events.cardDetail": "Ver detalle →",
            "events.badgePast": "Finalizado",
            "events.badgeDraft": "Borrador",
            "tournament.teamsMaxSuffix": " equipos máx.",
            "tournament.checkinFallback": "15 min antes",
            "login.tagline": "// MCV ADMIN",
            "login.title": "CONTROL ROOM",
            "login.passwordLabel": "Contraseña de entorno",
            "login.passwordPh": "ADMIN_PASSWORD del servidor",
            "login.submit": "Entrar al panel",
            "login.hint1": "Usá ADMIN_PASSWORD para entrar. En Render también necesitás JWT_SECRET (mejor una clave larga distinta de la contraseña).",
            "login.hint2": "Si en la consola ves 405 o 404 en /api/auth/login, este dominio no está ejecutando Node (suele ser hosting solo estático). Opciones: (A) conectá el dominio al Web Service en Render; (B) abrí login.html?api=https://TU-APP.onrender.com; (C) meta mcv-api con la URL del backend.",
            "login.backSite": "← Sitio público",
            "login.backEvents": "Torneos",
            "tickets.sectionTag": "// Soporte y reclutamiento",
            "tickets.title": "Abrí un",
            "tickets.titleSpan": "ticket.",
            "tickets.introH": "Cómo funciona",
            "tickets.introP": "Completá el formulario y al enviar te llevamos a Discord para abrir un ticket oficial con el staff (reclutamiento, soporte de torneo o reportes).",
            "tickets.typeLabel": "Tipo de ticket",
            "tickets.discordLabel": "Usuario de Discord",
            "tickets.descLabel": "Descripción breve",
            "tickets.submit": "Ir a Discord",
            "tickets.selectPlaceholder": "Elegí una opción…",
            "tickets.optRecruit": "Reclutamiento (unirte a MCV)",
            "tickets.optTournament": "Soporte de torneo",
            "tickets.optReport": "Reporte de jugador",
            "tickets.optOther": "Otro",
            "tickets.discordPh": "ej. usuario o usuario#0",
            "tickets.descPh": "Motivo del ticket. Si es reclutamiento, contá horas en Rust y rol preferido.",
            "live.sectionTag": "// Cobertura en vivo",
            "live.lead": "Kick y Twitch oficiales del clan. Si el embed de Twitch no carga, revisá bloqueadores o probá desde mcvoficial.com.",
            "live.kickTitle": "Kick — principal",
            "live.twitchTitle": "Twitch — clan oficial",
            "admin.refresh": "🔄 Actualizar",
            "admin.loginBtn": "🔑 Login",
            "admin.logout": "🚪 Salir",
            "admin.tagline": "// PANEL ADMIN",
            "admin.h1": "CONTROL",
            "admin.h1span": "ROOM.",
            "admin.summary": "Torneo seleccionado:",
            "admin.tournamentSelectTitle": "Elegí qué torneo gestionás",
            "admin.gotoTorneos": "🏆 Torneos",
            "admin.exportCsv": "📥 Exportar CSV",
            "admin.genBracket": "⚔️ Generar bracket",
            "admin.nextRound": "➡️ Siguiente ronda",
            "admin.ctaStrong": "Nuevo torneo",
            "admin.ctaText": " — en la pestaña Torneos; después equipos en Equipos.",
            "admin.ctaBtn": "Ir a Torneos",
            "admin.tabTournaments": "🏆 Torneos",
            "admin.tabTeams": "👑 Equipos",
            "admin.tabBracket": "⚔️ Bracket",
            "admin.tabListLabel": "Secciones del panel",
            "nav.discord": "Discord",
            "events.statModeLive": "En vivo / registro",
            "events.statModeRecap": "Recap",
            "events.statModeIdle": "Sin activos",
            "events.featuredLabelLive": "Próximo / activo",
            "events.featuredLabelDefault": "Destacado",
            "events.championPrefix": "Campeón: ",
            "home.eventBadgeLive": "Inscripciones abiertas",
            "home.eventBadgeRecap": "Último resultado",
            "home.eventBadgeTournament": "Torneo",
            "home.mediaLabel": "// Últimos videos",
            "home.mediaTitle": "MCV ",
            "home.mediaTitleSpan": "Media.",
            "home.mediaYtBtn": "YouTube",
            "home.video1Title": "MCV oficial: raids, torneos y highlights",
            "home.video1Sub": "Contenido competitivo de Rust",
            "home.video2Title": "Kick oficial de MCV",
            "home.video2Sub": "Streams, scrims y wipes en directo",
            "home.video3Title": "Jugadas rápidas y clips virales",
            "home.video3Sub": "TikTok oficial del clan",
            "home.valuesLabel": "// Core Values",
            "home.valuesTitle": "Cómo juega ",
            "home.valuesTitleSpan": "MCV.",
            "home.valueCompTitle": "Competencia",
            "home.valueCompP": "Torneos, scrims y eventos con reglas claras, brackets organizados y monitoreo constante.",
            "home.valueWipeTitle": "Disciplina de wipe",
            "home.valueWipeP": "Monument control, raids, farm y comunicación con roles definidos para sostener presión.",
            "home.valueAdminTitle": "Administración",
            "home.valueAdminP": "Herramientas de revisión, reportes y datos externos para tomar mejores decisiones.",
            "footer.taglineP": "Clan competitivo de Rust, host de eventos y comunidad conectada a Discord, streams y herramientas propias.",
            "tournament.defaultTitle": "Torneo",
            "tournament.heroLoading": "Cargando…",
            "tournament.btnRegister": "Registrar team",
            "tournament.btnRules": "Ver reglas",
            "tournament.winnerLabel": "Campeón",
            "tournament.winnerDefault": "Campeón",
            "tournament.winnerClosedPrefix": "Cerró el ",
            "tournament.statusFinished": "Evento finalizado — gracias a todos los equipos.",
            "tournament.statusClosed": "Inscripciones cerradas para este torneo.",
            "tournament.statusDraft": "Borrador — todavía no abierto al registro público.",
            "tournament.fairPlaySpan": "Fair Play Notice:",
            "tournament.fairPlayP": "MCV puede descalificar equipos por cheats, boosting, scripts o incumplimiento de reglas. Traé skill, no excusas.",
            "tournament.regBlurb": "Completá los 5 jugadores. Validamos VAC/Game ban vía Steam.",
            "tournament.regDraftHtml": "Este torneo está en <strong>borrador</strong>. Cuando el staff lo publique como <em>open</em> vas a poder inscribirte. Seguinos en <a href=\"events.html\">Torneos</a> o en Discord.",
            "tournament.regClosedHtml": "Las inscripciones para este torneo están cerradas. Seguinos en <a href=\"events.html\">Torneos</a> o en Discord.",
            "tournament.liveHeading": "En ",
            "tournament.liveHeadingSpan": "vivo.",
            "tournament.submitting": "Enviando registro...",
            "tournament.rulesIntro": "Reglas y calendario del evento.",
            "login.hint1Html": "Usá <code>ADMIN_PASSWORD</code> para entrar. En Render también necesitás <code>JWT_SECRET</code> (mejor una clave larga distinta de la contraseña).",
            "login.hint2Html": "Si en la consola ves <strong>405</strong> o <strong>404</strong> en <code>/api/auth/login</code>, este dominio <strong>no está ejecutando Node</strong> (suele ser Cloudflare/GitHub Pages con el HTML solamente). Opciones: (A) en Render conectá el dominio personalizado al <em>mismo</em> Web Service que corre <code>npm start</code>; (B) una sola vez abrí <code>login.html?api=https://TU-APP.onrender.com</code> (queda guardado); (C) completá el <code>meta name=\"mcv-api\"</code> en el <code>&lt;head&gt;</code> con esa URL de Render.",
            "login.diagNoApiUrl": "Sin URL del API: usá ?api=https://tu-backend.onrender.com en esta página.",
            "login.diagChecking": "Comprobando servidor (en Render gratis puede tardar unos segundos si estaba dormido)…",
            "login.diag405": "HTTP {status}: {api} no responde como API Node (dominio solo estático). Usá login.html?api=https://TU-APP.onrender.com o la meta mcv-api con la URL de Render.",
            "login.diagRenderPlain404":
                "El host {api} responde 404 plano (no es tu Express): en Render no hay Web Service en esa URL o el nombre del servicio cambió. En Dashboard → New Web Service → este repo, root directory mcv-backend, build npm install, start npm start; copiá la URL .onrender.com que te dé Render y abrí login.html?api=ESE_URL una vez (o rellená meta mcv-api).",
            "login.diagStatusRead": "No se pudo leer /api/auth/status (HTTP {status}). URL usada: {api}",
            "login.diagLineApi": "API: {api}",
            "login.diagAdminMissing": "Falta ADMIN_PASSWORD en el servidor.",
            "login.diagJwtMissing": "Falta JWT_SECRET o es muy corto (mín. 12 caracteres) en Render.",
            "login.diagJwtWs": "JWT_SECRET tenía espacios/saltos al inicio o fin (ya se ignoran al firmar; igual conviene limpiarlo en Render).",
            "login.diagDbMissing": "DATABASE_URL no está definido (el panel puede cargar vacío).",
            "login.diagLoginOk": "Login habilitado: probá la contraseña.",
            "login.diagNoConnect":
                "Fallo al llamar a {api} (a veces el navegador muestra CORS cuando el servidor no es tu API). Abrí en otra pestaña {api}/api/health: si ves solo la palabra Not Found, Render no tiene servicio en esa URL (cabecera típica x-render-routing: no-server). Creá o redeployá el Web Service (root mcv-backend) y usá la URL exacta que muestre Render en login.html?api=… o meta mcv-api. Si el servicio existe pero está dormido (plan gratis), esperá ~30 s y recargá.",
            "login.errExpired": "Sesión expirada o token inválido. Volvé a entrar.",
            "login.errNoApiUrl": "No hay URL del API. Abrí esta página desde el mismo host que el servidor Node o usá ?api=https://tu-backend.onrender.com",
            "login.err405": "HTTP {status}: este sitio no está sirviendo la API (dominio apuntando solo a archivos estáticos). Abrí una vez login.html?api=https://TU-SERVICIO.onrender.com o configurá la meta mcv-api con la URL de tu Web Service en Render.",
            "login.errBadJson": "El servidor no devolvió JSON (¿{api} no es el backend?). Código HTTP {status}.",
            "login.errLoginFailed": "Login fallido",
            "login.errNoConnectRetry":
                "Sin conexión al servidor tras varios intentos. Si /api/health en el navegador da \"Not Found\", no hay Web Service en esa URL de Render: desplegá el backend y usá ?api= con la URL que te muestre el dashboard. Si el servicio existe, puede ser cold start (esperá y recargá).",
            "admin.introTournaments": "Acá creás torneos nuevos o los finalizás con póster. Los equipos se cargan en la pestaña <strong>Equipos</strong> (registro web o alta manual).",
            "admin.formCreateTitle": "Crear torneo",
            "admin.formCreateHint": "Queda en draft o abierto (ambos aparecen en la web en Próximos). El slug se puede dejar vacío (se genera solo).",
            "admin.formEditTitle": "Editar torneo seleccionado",
            "admin.formEditSlugLabel": "Slug",
            "admin.formEditStatusLabel": "Estado",
            "admin.formEditSave": "Guardar cambios",
            "admin.btnShowCreate": "＋ Crear otro torneo",
            "admin.btnDeleteTournament": "Eliminar este torneo…",
            "admin.formFinishTitle": "Finalizar + póster",
            "admin.formFinishHint": "Cierra el torneo seleccionado arriba. Podés subir imagen (máx 15 MB) o dejar vacío. Con la casilla marcada se borran todas las inscripciones y el bracket; el nombre del campeón y el póster quedan en la ficha pública.",
            "admin.formFinishHint2": "Para abrir/cerrar o dejar en borrador sin usar «Finalizar», usá el panel <strong>Editar torneo</strong> (campo Estado).",
            "admin.manualTitle": "Agregar equipo (manual)",
            "admin.manualHint": "Si no se inscribieron solos, cargalos acá. Mismos datos que el formulario público: 5 jugadores con Steam64 (17 dígitos) y Discord.",
            "admin.playersHint": "Jugadores (los 5 obligatorios)",
            "admin.emptyLoading": "Cargando…",
            "admin.emptyBracket": "Sin datos de bracket.",
            "admin.filterAll": "Todos",
            "admin.filterPending": "Pendientes",
            "admin.filterAccepted": "Aprobados",
            "admin.filterDeclined": "Rechazados",
            "admin.winnerLabel": "Ganador (ID de registro aceptado)",
            "admin.winnerPlaceholder": "Ej. 12",
            "admin.saveWinner": "Guardar ganador",
            "admin.clearWinner": "Limpiar",
            "tournament.noSlugTitle": "Torneos MCV",
            "tournament.noSlugDesc": "No hay torneo seleccionado o el servidor no respondió. Elegí uno en la página Torneos o probá de nuevo más tarde.",
            "tournament.notFoundDesc": "No se encontró el torneo o el servidor no responde.",
            "tournament.renderError": "No se pudo mostrar una parte del torneo. Recargá la página; si sigue fallando, avisá a staff.",
            "tournament.alertNoRegister": "Este torneo no acepta registros.",
            "tournament.alertRegisterFail": "No se pudo registrar.",
            "tournament.alertNoSteamKey": "Registro guardado. El servidor no tiene STEAM_API_KEY; no se validaron bans automáticamente.",
            "tournament.alertRegisterOk": "Registro enviado. Pendiente de aprobación.",
            "tournament.alertConnError": "Error de conexión.",
            "live.heading": "MCV ",
            "live.headingSpan": "Live."
        },
        en: {
            "lang.label": "Language",
            "nav.clan": "Clan",
            "nav.torneos": "Tournaments",
            "nav.players": "Players",
            "nav.bot": "Bot",
            "nav.tickets": "Tickets",
            "nav.streams": "Streams",
            "pageTitle.index": "MCV Official — Rust clan & tournaments",
            "pageTitle.events": "MCV — Tournaments",
            "pageTitle.tournament": "MCV — Tournament",
            "pageTitle.bot": "MCV Tracker — Anti-cheat",
            "pageTitle.tickets": "MCV — Tickets",
            "pageTitle.live": "MCV — Live streams",
            "pageTitle.login": "MCV — Admin login",
            "pageTitle.admin": "MCV — Control Room",
            "pageTitle.players": "MCV — Wipe roster",
            "home.tagline": "// Competitive Rust clan",
            "home.lead": "Competitive clan, events, streams and tools to review Rust players with better judgment.",
            "home.ctaTournaments": "View tournaments",
            "home.ctaTracker": "Open tracker",
            "home.ctaDiscord": "Discord",
            "home.eventCta": "View details",
            "home.statHosted": "// Hosted tournaments",
            "home.statDiscord": "// Discord members",
            "home.statOnline": "// Online now",
            "home.statWipes": "// Wipe roster",
            "home.statWipesHint":
                "Players confirmed for the wipe: use MCV_HOME_WIPE_PLAYERS, or the count from Discord /mcv-wipe registrations when that env is empty.",
            "players.heroTag": "// MCV · Wipe roster",
            "players.heroTitle": "Players",
            "players.heroTitleSpan": "on the wipe.",
            "players.heroLead": "Live Steam name and avatar: link your account with the Discord command and you appear in this grid.",
            "players.ctaDiscord": "Discord",
            "players.ctaEvents": "Tournaments",
            "players.hintSlash": "In Discord use /mcv-wipe and paste your 17-digit SteamID64. Optional: in the configured channel send !mcvsteam 76561198… Same MCV bot: invite it to your private clan server and set DISCORD_WIPE_GUILD_ID to that server’s ID.",
            "players.countLabel": "Registered: {n}",
            "players.empty": "No players registered for this wipe yet.",
            "players.loadError": "Could not load the roster. Check that the API is online.",
            "players.noApi": "Missing API URL (meta mcv-api or ?api=…).",
            "players.discordUnknown": "Steam",
            "players.backHome": "← Site",
            "home.strip1": "MCV network",
            "home.strip2": "Rust tournaments",
            "home.strip3": "Anti-cheat",
            "home.strip4": "Live streams",
            "home.opsLabel": "// MCV operations",
            "home.opsTitle": "Clan",
            "home.opsTitleSpan": "system.",
            "home.opsDesc": "An ecosystem to compete, run tournaments, review players and grow the community without losing wipe pace.",
            "home.featureTracker": "MCV Tracker",
            "home.featureTrackerH": "Investigate players",
            "home.featureTrackerP": "Steam, BattleMetrics, Discord and risk signals summarized for admins.",
            "home.featureEvents": "Tournaments",
            "home.featureEventsH": "Active tournaments",
            "home.featureEventsP": "Rules, signups, prizes and competitive schedule for the clan.",
            "home.featureLive": "Streams",
            "home.featureLiveH": "Official broadcasts",
            "home.featureLiveP": "Kick, Twitch and live coverage of raids, scrims and events.",
            "home.ctaJoinLabel": "// Join the network",
            "home.ctaJoinTitle": "Enter the",
            "home.ctaJoinTitleSpan": "command.",
            "home.ctaJoinDesc": "Join Discord to play events, find a team and follow official MCV activity.",
            "home.ctaJoinBtn": "Join Discord",
            "footer.navTitle": "// Navigation",
            "footer.socialTitle": "// Social",
            "footer.copy": "© 2026 MCV Clan. All rights reserved.",
            "footer.disclaimer": "Not affiliated with Facepunch Studios",
            "footer.admin": "Admin",
            "events.heroTag": "// MCV · Rust · Competition",
            "events.heroTitle": "Tournaments",
            "events.heroTitleSpan": "MCV.",
            "events.heroLead": "Schedule, past champions and a direct link to signup when a tournament is open.",
            "events.heroFeatured": "Featured tournament",
            "events.featuredOpen": "Open",
            "events.statHosted": "Tournaments on site",
            "events.statRegs": "Total signups",
            "events.statState": "Tournament status",
            "events.colUp": "Upcoming",
            "events.colUpSub": "Open signups or in progress.",
            "events.colPast": "History",
            "events.colPastSub": "Finished tournaments and champions.",
            "events.emptyUp": "No upcoming tournaments. Check back soon or browse history.",
            "events.emptyPast": "No finished tournaments in the database yet.",
            "events.connectFail":
                "Could not reach the API. If no Render Web Service is deployed at the backend URL, the browser often shows CORS + failure: open the API URL in a tab (e.g. …onrender.com/api/health). If you only see the word Not Found, create or deploy the Node service (root mcv-backend, start npm start), then set that URL in meta mcv-api or events.html?api=…",
            "events.cardDetail": "Details →",
            "events.badgePast": "Finished",
            "events.badgeDraft": "Draft",
            "tournament.teamsMaxSuffix": " teams max",
            "tournament.checkinFallback": "15 min before match",
            "login.tagline": "// MCV ADMIN",
            "login.title": "CONTROL ROOM",
            "login.passwordLabel": "Environment password",
            "login.passwordPh": "Server ADMIN_PASSWORD",
            "login.submit": "Enter panel",
            "login.hint1": "Use ADMIN_PASSWORD to sign in. On Render you also need JWT_SECRET (prefer a long random value, different from the password).",
            "login.hint2": "If the console shows 405 or 404 on /api/auth/login, this domain is not running Node (often static hosting only). Options: (A) point the domain to your Render Web Service; (B) open login.html?api=https://YOUR-APP.onrender.com once; (C) set meta mcv-api to your backend URL.",
            "login.backSite": "← Public site",
            "login.backEvents": "Tournaments",
            "tickets.sectionTag": "// Support & recruitment",
            "tickets.title": "Open a",
            "tickets.titleSpan": "ticket.",
            "tickets.introH": "How it works",
            "tickets.introP": "Fill the form; on submit we send you to Discord to open an official ticket with staff (recruitment, tournament support or reports).",
            "tickets.typeLabel": "Ticket type",
            "tickets.discordLabel": "Discord username",
            "tickets.descLabel": "Short description",
            "tickets.submit": "Go to Discord",
            "tickets.selectPlaceholder": "Choose an option…",
            "tickets.optRecruit": "Recruitment (join MCV)",
            "tickets.optTournament": "Tournament support",
            "tickets.optReport": "Player report",
            "tickets.optOther": "Other",
            "tickets.discordPh": "e.g. user or user#0",
            "tickets.descPh": "Short reason. For recruitment, mention Rust hours and preferred role.",
            "live.sectionTag": "// Live coverage",
            "live.lead": "Official Kick and Twitch for the clan. If Twitch fails to load, check blockers or try from mcvoficial.com.",
            "live.kickTitle": "Kick — main",
            "live.twitchTitle": "Twitch — official clan",
            "admin.refresh": "🔄 Refresh",
            "admin.loginBtn": "🔑 Login",
            "admin.logout": "🚪 Log out",
            "admin.tagline": "// ADMIN PANEL",
            "admin.h1": "CONTROL",
            "admin.h1span": "ROOM.",
            "admin.summary": "Selected tournament:",
            "admin.tournamentSelectTitle": "Choose which tournament you manage",
            "admin.gotoTorneos": "🏆 Tournaments",
            "admin.exportCsv": "📥 Export CSV",
            "admin.genBracket": "⚔️ Generate bracket",
            "admin.nextRound": "➡️ Next round",
            "admin.ctaStrong": "New tournament",
            "admin.ctaText": " — in the Tournaments tab; then teams under Teams.",
            "admin.ctaBtn": "Go to tournaments",
            "admin.tabTournaments": "🏆 Tournaments",
            "admin.tabTeams": "👑 Teams",
            "admin.tabBracket": "⚔️ Bracket",
            "admin.tabListLabel": "Panel sections",
            "nav.discord": "Discord",
            "events.statModeLive": "Live / signup",
            "events.statModeRecap": "Recap",
            "events.statModeIdle": "No active event",
            "events.featuredLabelLive": "Next / active",
            "events.featuredLabelDefault": "Featured",
            "events.championPrefix": "Champion: ",
            "home.eventBadgeLive": "Signups open",
            "home.eventBadgeRecap": "Latest result",
            "home.eventBadgeTournament": "Tournament",
            "home.mediaLabel": "// Latest videos",
            "home.mediaTitle": "MCV ",
            "home.mediaTitleSpan": "Media.",
            "home.mediaYtBtn": "YouTube",
            "home.video1Title": "MCV official: raids, tournaments & highlights",
            "home.video1Sub": "Competitive Rust content",
            "home.video2Title": "MCV official Kick",
            "home.video2Sub": "Streams, scrims & wipes live",
            "home.video3Title": "Quick plays & viral clips",
            "home.video3Sub": "Official clan TikTok",
            "home.valuesLabel": "// Core values",
            "home.valuesTitle": "How ",
            "home.valuesTitleSpan": "MCV plays.",
            "home.valueCompTitle": "Competition",
            "home.valueCompP": "Tournaments, scrims and events with clear rules, organized brackets and steady oversight.",
            "home.valueWipeTitle": "Wipe discipline",
            "home.valueWipeP": "Monument control, raids, farming and comms with defined roles to keep pressure up.",
            "home.valueAdminTitle": "Administration",
            "home.valueAdminP": "Review tools, reports and external data to make better calls.",
            "footer.taglineP": "Competitive Rust clan, event host and community wired to Discord, streams and in-house tools.",
            "tournament.defaultTitle": "Tournament",
            "tournament.heroLoading": "Loading…",
            "tournament.btnRegister": "Register team",
            "tournament.btnRules": "View rules",
            "tournament.winnerLabel": "Champion",
            "tournament.winnerDefault": "Champion",
            "tournament.winnerClosedPrefix": "Closed on ",
            "tournament.statusFinished": "Event finished — thanks to all teams.",
            "tournament.statusClosed": "Signups are closed for this tournament.",
            "tournament.statusDraft": "Draft — not open for public signup yet.",
            "tournament.fairPlaySpan": "Fair play notice:",
            "tournament.fairPlayP": "MCV may disqualify teams for cheats, boosting, scripts or rule violations. Bring skill, not excuses.",
            "tournament.regBlurb": "Fill in all 5 players. We validate VAC/game bans via Steam.",
            "tournament.regDraftHtml": "This tournament is a <strong>draft</strong>. When staff sets it to <em>open</em>, signup will be available. Follow <a href=\"events.html\">Tournaments</a> or Discord.",
            "tournament.regClosedHtml": "Signups for this tournament are closed. Follow <a href=\"events.html\">Tournaments</a> or Discord.",
            "tournament.liveHeading": "Live ",
            "tournament.liveHeadingSpan": "broadcast.",
            "tournament.submitting": "Submitting signup…",
            "tournament.rulesIntro": "Event rules and schedule.",
            "login.hint1Html": "Use <code>ADMIN_PASSWORD</code> to sign in. On Render you also need <code>JWT_SECRET</code> (prefer a long random value, different from the password).",
            "login.hint2Html": "If the console shows <strong>405</strong> or <strong>404</strong> on <code>/api/auth/login</code>, this domain is <strong>not running Node</strong> (often static hosting only). Options: (A) point your custom domain in Render to the <em>same</em> Web Service that runs <code>npm start</code>; (B) open <code>login.html?api=https://YOUR-APP.onrender.com</code> once (it is saved); (C) set <code>meta name=\"mcv-api\"</code> in <code>&lt;head&gt;</code> to that Render URL.",
            "login.diagNoApiUrl": "No API URL: use ?api=https://your-backend.onrender.com on this page.",
            "login.diagChecking": "Checking server (free Render may take a few seconds if it was asleep)…",
            "login.diag405": "HTTP {status}: {api} is not responding as a Node API (static domain only). Use login.html?api=https://YOUR-APP.onrender.com or meta mcv-api with your Render URL.",
            "login.diagRenderPlain404":
                "{api} returns a plain 404 (not your Express app): there is no Render Web Service at that URL or the service name changed. In the dashboard create a Web Service from this repo, root directory mcv-backend, build npm install, start npm start; copy the .onrender.com URL Render shows and open login.html?api=THAT_URL once (or set meta mcv-api).",
            "login.diagStatusRead": "Could not read /api/auth/status (HTTP {status}). URL used: {api}",
            "login.diagLineApi": "API: {api}",
            "login.diagAdminMissing": "ADMIN_PASSWORD is missing on the server.",
            "login.diagJwtMissing": "JWT_SECRET is missing or too short (min 12 chars) on Render.",
            "login.diagJwtWs": "JWT_SECRET had leading/trailing whitespace (ignored when signing; still worth cleaning in Render).",
            "login.diagDbMissing": "DATABASE_URL is not set (the panel may load empty).",
            "login.diagLoginOk": "Login enabled: try the password.",
            "login.diagNoConnect":
                "Failed to reach {api} (the browser may show CORS when the response is not your API). Open {api}/api/health in another tab: if you only see Not Found, Render has no service on that URL (typical header x-render-routing: no-server). Create or redeploy the Web Service (root mcv-backend) and use the exact URL from the dashboard in login.html?api=… or meta mcv-api. If the service exists but slept (free tier), wait ~30s and reload.",
            "login.errExpired": "Session expired or invalid token. Sign in again.",
            "login.errNoApiUrl": "No API URL. Open this page from the same host as the Node server or use ?api=https://your-backend.onrender.com",
            "login.err405": "HTTP {status}: this site is not serving the API (domain pointing to static files only). Open login.html?api=https://YOUR-SERVICE.onrender.com once or set meta mcv-api to your Render Web Service URL.",
            "login.errBadJson": "Server did not return JSON (is {api} not the backend?). HTTP {status}.",
            "login.errLoginFailed": "Login failed",
            "login.errNoConnectRetry":
                "No server connection after several attempts. If /api/health in the browser shows Not Found, there is no Web Service at that Render URL: deploy the backend and use ?api= with the URL from your dashboard. If the service exists, it may be a cold start (wait and reload).",
            "admin.introTournaments": "Create new tournaments or finish them with a poster here. Teams are managed under the <strong>Teams</strong> tab (web signup or manual entry).",
            "admin.formCreateTitle": "Create tournament",
            "admin.formCreateHint": "Starts as draft or open (both show on the site under Upcoming). Slug can be empty (auto-generated).",
            "admin.formEditTitle": "Edit selected tournament",
            "admin.formEditSlugLabel": "Slug",
            "admin.formEditStatusLabel": "Status",
            "admin.formEditSave": "Save changes",
            "admin.btnShowCreate": "＋ Create another tournament",
            "admin.btnDeleteTournament": "Delete this tournament…",
            "admin.formFinishTitle": "Finish + poster",
            "admin.formFinishHint": "Closes the tournament selected above. You can upload an image (max 15 MB) or leave empty. If checked, all signups and bracket are cleared; champion name and poster stay on the public page.",
            "admin.formFinishHint2": "To open/close or keep a draft without using “Finish”, use the <strong>Edit tournament</strong> panel (Status field).",
            "admin.manualTitle": "Add team (manual)",
            "admin.manualHint": "If they did not self-register, add them here. Same fields as the public form: 5 players with 17-digit Steam64 and Discord.",
            "admin.playersHint": "Players (all 5 required)",
            "admin.emptyLoading": "Loading…",
            "admin.emptyBracket": "No bracket data.",
            "admin.filterAll": "All",
            "admin.filterPending": "Pending",
            "admin.filterAccepted": "Accepted",
            "admin.filterDeclined": "Declined",
            "admin.winnerLabel": "Winner (accepted registration ID)",
            "admin.winnerPlaceholder": "e.g. 12",
            "admin.saveWinner": "Save winner",
            "admin.clearWinner": "Clear",
            "tournament.noSlugTitle": "MCV Tournaments",
            "tournament.noSlugDesc": "No tournament selected or the server did not respond. Pick one on the Tournaments page or try again later.",
            "tournament.notFoundDesc": "Tournament not found or server not responding.",
            "tournament.renderError": "Part of the tournament page failed to render. Reload the page; if it persists, contact staff.",
            "tournament.alertNoRegister": "This tournament is not accepting signups.",
            "tournament.alertRegisterFail": "Could not register.",
            "tournament.alertNoSteamKey": "Signup saved. The server has no STEAM_API_KEY; bans were not checked automatically.",
            "tournament.alertRegisterOk": "Signup submitted. Pending approval.",
            "tournament.alertConnError": "Connection error.",
            "live.heading": "MCV ",
            "live.headingSpan": "Live."
        }
    };

    function getLang() {
        try {
            var s = (w.localStorage.getItem(STORAGE) || "es").toLowerCase();
            return s === "en" ? "en" : "es";
        } catch (e) {
            return "es";
        }
    }

    function t(key) {
        var lang = getLang();
        var b = DICT[lang] || DICT.es;
        if (b[key] != null) return b[key];
        return (DICT.es[key] != null ? DICT.es[key] : key);
    }

    function tpl(key, vars) {
        var s = t(key);
        vars = vars || {};
        Object.keys(vars).forEach(function (k) {
            s = s.split("{" + k + "}").join(String(vars[k]));
        });
        return s;
    }

    function applyDataI18n() {
        document.querySelectorAll("[data-i18n]").forEach(function (el) {
            var key = el.getAttribute("data-i18n");
            if (!key) return;
            el.textContent = t(key);
        });
        document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
            var key = el.getAttribute("data-i18n-html");
            if (key) el.innerHTML = t(key);
        });
        document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
            var key = el.getAttribute("data-i18n-placeholder");
            if (key) el.setAttribute("placeholder", t(key));
        });
        document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
            var key = el.getAttribute("data-i18n-title");
            if (key) el.setAttribute("title", t(key));
        });
        document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
            var key = el.getAttribute("data-i18n-aria-label");
            if (key) el.setAttribute("aria-label", t(key));
        });
    }

    function updateLangButtons() {
        var lang = getLang();
        document.querySelectorAll(".mcv-lang-btn").forEach(function (btn) {
            var c = btn.getAttribute("data-mcv-lang");
            btn.classList.toggle("active", c === lang);
            btn.setAttribute("aria-pressed", c === lang ? "true" : "false");
        });
    }

    function injectLangSwitch() {
        document.querySelectorAll(".navbar").forEach(function (nav) {
            if (nav.querySelector(".mcv-lang-switch")) return;
            var wrap = document.createElement("div");
            wrap.className = "mcv-lang-switch";
            wrap.setAttribute("role", "group");
            wrap.innerHTML =
                '<span class="mcv-lang-label" data-i18n="lang.label"></span>' +
                '<button type="button" class="mcv-lang-btn" data-mcv-lang="es" aria-pressed="false">ES</button>' +
                '<button type="button" class="mcv-lang-btn" data-mcv-lang="en" aria-pressed="false">EN</button>';
            nav.appendChild(wrap);
            wrap.querySelectorAll("[data-mcv-lang]").forEach(function (btn) {
                btn.addEventListener("click", function () {
                    var next = btn.getAttribute("data-mcv-lang");
                    if (next === getLang()) return;
                    try {
                        w.localStorage.setItem(STORAGE, next);
                    } catch (e2) {}
                    w.location.reload();
                });
            });
        });

        document.querySelectorAll(".admin-navbar").forEach(function (nav) {
            if (nav.querySelector(".mcv-lang-switch")) return;
            var actions = nav.querySelector(".admin-actions");
            var wrap = document.createElement("div");
            wrap.className = "mcv-lang-switch mcv-lang-switch--admin";
            wrap.setAttribute("role", "group");
            wrap.innerHTML =
                '<span class="mcv-lang-label" data-i18n="lang.label"></span>' +
                '<button type="button" class="mcv-lang-btn" data-mcv-lang="es">ES</button>' +
                '<button type="button" class="mcv-lang-btn" data-mcv-lang="en">EN</button>';
            if (actions) actions.insertBefore(wrap, actions.firstChild);
            else nav.appendChild(wrap);
            wrap.querySelectorAll("[data-mcv-lang]").forEach(function (btn) {
                btn.addEventListener("click", function () {
                    var next = btn.getAttribute("data-mcv-lang");
                    if (next === getLang()) return;
                    try {
                        w.localStorage.setItem(STORAGE, next);
                    } catch (e3) {}
                    w.location.reload();
                });
            });
        });

        document.querySelectorAll(".login-container").forEach(function (box) {
            if (box.querySelector(".mcv-lang-switch")) return;
            var wrap = document.createElement("div");
            wrap.className = "mcv-lang-switch mcv-lang-switch--login";
            wrap.setAttribute("role", "group");
            wrap.innerHTML =
                '<span class="mcv-lang-label" data-i18n="lang.label"></span>' +
                '<button type="button" class="mcv-lang-btn" data-mcv-lang="es" aria-pressed="false">ES</button>' +
                '<button type="button" class="mcv-lang-btn" data-mcv-lang="en" aria-pressed="false">EN</button>';
            box.insertBefore(wrap, box.firstChild);
            wrap.querySelectorAll("[data-mcv-lang]").forEach(function (btn) {
                btn.addEventListener("click", function () {
                    var next = btn.getAttribute("data-mcv-lang");
                    if (next === getLang()) return;
                    try {
                        w.localStorage.setItem(STORAGE, next);
                    } catch (e4) {}
                    w.location.reload();
                });
            });
        });
    }

    function init(opts) {
        opts = opts || {};
        document.documentElement.lang = getLang();
        injectLangSwitch();
        applyDataI18n();
        updateLangButtons();
        var page = document.body && document.body.getAttribute("data-mcv-page");
        var tk = (opts.titleKey || (page && PAGE_TITLE_KEYS[page]) || "").trim();
        if (tk) document.title = t(tk);
    }

    w.mcvGetLang = getLang;
    w.mcvSetLang = function (code) {
        try {
            w.localStorage.setItem(STORAGE, code === "en" ? "en" : "es");
        } catch (e) {}
        w.location.reload();
    };
    w.mcvT = t;
    w.mcvTpl = tpl;
    w.mcvI18n = { init: init, apply: applyDataI18n, t: t, tpl: tpl, getLang: getLang };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            init({});
        });
    } else {
        init({});
    }
})(window);
