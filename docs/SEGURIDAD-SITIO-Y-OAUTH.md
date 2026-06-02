# Seguridad del sitio completo + login Steam / Google

## Qué protege cada cosa

| Capa | Qué cubre | Dónde se configura |
|------|-----------|-------------------|
| **Cloudflare proxy** | Todo el tráfico a `mcvoficial.com` (WAF, bots, DDoS básico) | Cloudflare DNS + Security |
| **Turnstile** | Anti-bot en **login admin** (y opcional en más forms) | Render: `TURNSTILE_*` + widget Cloudflare |
| **Contraseña + JWT** | Panel admin (`admin.html`, `/api/admin/*`) | Render: `ADMIN_PASSWORD`, `JWT_SECRET` |
| **Steam / Google OAuth** | Entrar al admin sin tipear contraseña (solo cuentas permitidas) | Render + Google Cloud Console |
| **Sitio público** | `index.html`, torneos, tickets — **siguen siendo públicos** a propósito | No hace falta login para visitar |

Turnstile **no** se pone en cada página del sitio (mala experiencia). Para el sitio en general usás **Cloudflare**; Turnstile solo en puntos sensibles (login, envío de tickets si lo activás después).

---

## 1. Proteger el sitio en general (Cloudflare)

Guía base: `docs/CLOUDFLARE-SETUP.md`.

### Ya deberías tener
- DNS con nube **naranja** (Proxied)
- SSL **Full (strict)**
- **Bot Fight Mode** ON
- Rate limit en `/api/auth/login` y `/escaner-rapido`
- Sin caché en `/api/`, `/admin.html`, `/login.html`

### Proteger solo el admin (sin tocar la home pública)

**Cloudflare → Zero Trust → Access → Applications**

1. Add application → Self-hosted  
2. Domain: `mcvoficial.com`  
3. Path: `/admin.html` (repetí para `/login.html` o usá `/admin*` si tu plan lo permite)  
4. Policy: Allow → emails de staff **o** Google como identity provider  

Así la web pública queda abierta y el panel pide identidad extra en Cloudflare (además de tu JWT).

### Proteger TODO el dominio (solo si querés)

Misma app Access pero path `/*` — **cuidado**: nadie vería torneos ni la home sin pasar Access.

---

## 2. Turnstile en más lugares (opcional)

| Página | ¿Turnstile? |
|--------|-------------|
| `login.html` | ✅ Ya está |
| `tickets.html` (enviar ticket) | Recomendado — mismo par de keys, validar token en `POST /api/tickets` |
| `index.html` | No |
| `events.html` / torneos | No en lectura; sí en **registro** si hay mucho spam |

Mismas keys en Render; en el front otro `<div>` + enviar `turnstileToken` en el POST.

---

## 3. Iniciar sesión con Google (admin)

### A) Google Cloud Console

1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → **Credentials**  
2. **OAuth client ID** → Web application  
3. **Authorized redirect URIs** (exacto, una por línea):

   **Admin:**
   `https://mcvoficial.com/api/auth/google/callback`

   **Cuenta pública / tickets:**
   `https://mcvoficial.com/api/auth/user/google/callback`

   **Recomendado también** (evita `redirect_uri_mismatch` con www o Render):
   `https://www.mcvoficial.com/api/auth/google/callback`
   `https://www.mcvoficial.com/api/auth/user/google/callback`
   `https://mcvoficial.onrender.com/api/auth/google/callback`
   `https://mcvoficial.onrender.com/api/auth/user/google/callback`

   Podés ver las URIs que usa tu servidor en producción:  
   `https://mcvoficial.com/api/auth/oauth-redirects`

4. Copiá **Client ID** y **Client secret**.

### B) Render → Environment

```env
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
OAUTH_PUBLIC_BASE_URL=https://mcvoficial.com

# Solo estos emails pueden entrar al admin por Google:
ADMIN_OAUTH_GOOGLE_EMAILS=tu@gmail.com,otro@correo.com
```

Redeploy. En login aparece el botón **Google**.

---

## 4. Iniciar sesión con Steam (admin)

No hace falta crear app en Steamworks para OpenID; sí definís **qué SteamID64** son admin.

### Render → Environment

```env
OAUTH_PUBLIC_BASE_URL=https://mcvoficial.com
ADMIN_OAUTH_STEAM_IDS=76561198000000000,76561198111111111
# Opcional, casi siempre igual a la URL pública:
STEAM_OPENID_REALM=https://mcvoficial.com
```

Redeploy. En login aparece **Steam**. Solo los IDs de la lista reciben JWT.

Para saber tu SteamID64: perfil Steam → copiar ID o usar herramientas tipo steamid.io.

---

## 5. Contraseña sigue funcionando

Podés usar **contraseña + Turnstile**, **Google**, o **Steam**. Lo más seguro para staff: OAuth + lista cerrada y contraseña larga de respaldo.

---

## 6. Checklist

- [ ] Cloudflare activo (proxy naranja)  
- [ ] `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` en Render  
- [ ] `CORS_STRICT=1`, `TRUST_PROXY_HOPS=2`, `NODE_ENV=production`  
- [ ] Google OAuth (si usás Google): redirect URI + `ADMIN_OAUTH_GOOGLE_EMAILS`  
- [ ] Steam (si usás Steam): `ADMIN_OAUTH_STEAM_IDS`  
- [ ] `OAUTH_PUBLIC_BASE_URL=https://mcvoficial.com`  
- [ ] Probar login Steam/Google y que un ID/email no listado sea rechazado  

---

## Errores OAuth en login

| Código / pantalla | Significado |
|-------------------|-------------|
| Google **redirect_uri_mismatch** | Falta la URI exacta en Google Cloud Console. Agregá las de `/api/auth/oauth-redirects` |
| `not_allowed` | SteamID o Gmail no está en la lista del servidor |
| `invalid_state` | Tardaste mucho o recargaste mal; reintentá |
| `steam_verify` / `google_failed` | Fallo técnico; revisá logs en Render |

---

## Cuentas públicas (cualquier usuario)

Página **Mi cuenta**: `https://mcvoficial.com/cuenta.html`

- Primer login con Steam o Google = **crear cuenta** automática
- **Tickets** requieren sesión (token `mcv_user_jwt` en el navegador)
- Admin sigue aparte (`login.html` + lista cerrada opcional)

### Render

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OAUTH_PUBLIC_BASE_URL=https://mcvoficial.com
PUBLIC_USER_STEAM=1
PUBLIC_USER_GOOGLE=1
REQUIRE_USER_AUTH_TICKETS=1
```

### Google — agregar redirect URI

`https://mcvoficial.com/api/auth/user/google/callback`

(Además del de admin si lo usás: `/api/auth/google/callback`)
