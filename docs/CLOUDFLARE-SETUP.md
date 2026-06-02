# Cloudflare delante de MCV (mcvoficial.com + Render)

Guía para poner **Cloudflare** como proxy (nube naranja) entre Internet y tu **Web Service en Render**. Así tenés WAF, rate limit global, bot fight y menos carga directa al servidor.

## Arquitectura

```
Usuario → Cloudflare (WAF, cache, SSL) → Render (Node + PostgreSQL)
```

El mismo dominio (`mcvoficial.com`) puede servir HTML y API si el dominio en Render apunta al Web Service con `rootDir: mcv-backend` (como en `render.yaml`).

---

## 1. Registrar el dominio en Cloudflare

1. Creá cuenta en [https://dash.cloudflare.com](https://dash.cloudflare.com).
2. **Add a site** → `mcvoficial.com` (plan Free alcanza para empezar).
3. Cloudflare te da **dos nameservers** (ej. `ada.ns.cloudflare.com`).
4. En tu registrador del dominio (donde compraste `.com`), cambiá los NS a los de Cloudflare.
5. Esperá propagación (minutos a 24 h). En Cloudflare debe decir **Active**.

---

## 2. DNS hacia Render

En Cloudflare → **DNS** → **Records**:

| Tipo | Nombre | Contenido | Proxy |
|------|--------|-----------|-------|
| CNAME | `@` | `mcvoficial.onrender.com` (tu servicio en Render) | **Proxied** (nube naranja) |
| CNAME | `www` | `mcvoficial.onrender.com` | **Proxied** |

El host exacto lo ves en Render → tu Web Service → **Settings** → **Custom Domains** (ej. `mcvoficial.onrender.com`).

**Importante:** la nube debe estar **naranja (Proxied)**. Si está gris (DNS only), no pasás por el WAF de Cloudflare.

---

## 3. Dominio en Render

1. Render Dashboard → Web Service `mcvoficial` → **Settings** → **Custom Domains**.
2. Agregá `mcvoficial.com` y `www.mcvoficial.com`.
3. Render valida el certificado (con Cloudflare en Full strict suele funcionar bien).

---

## 4. SSL/TLS en Cloudflare

**SSL/TLS** → Overview:

- Modo recomendado: **Full (strict)**  
  (Cloudflare ↔ Render cifrado; Render tiene certificado válido para el custom domain.)

**Edge Certificates:**

- **Always Use HTTPS**: ON  
- **Automatic HTTPS Rewrites**: ON  
- **Minimum TLS Version**: 1.2  

---

## 5. Variables en Render (después de activar Cloudflare)

En **Environment** del Web Service:

```env
NODE_ENV=production
CORS_STRICT=1
CORS_ORIGINS=https://mcvoficial.com,https://www.mcvoficial.com

# Cloudflare delante de Render: 2 saltos de proxy (CF + Render)
TRUST_PROXY_HOPS=2

ADMIN_PASSWORD=...
JWT_SECRET=...
```

No hace falta pegar API keys de Cloudflare en el servidor para el proxy básico. El backend ya usa el header `CF-Connecting-IP` para rate limits y allowlist.

---

## 6. Reglas de caché (admin y API)

**Caching** → **Cache Rules** (o Page Rules en cuentas viejas):

Crear reglas **sin caché** para rutas sensibles:

| Si la URL contiene | Acción |
|--------------------|--------|
| `/admin.html` | Bypass cache |
| `/login.html` | Bypass cache |
| `/api/` | Bypass cache |
| `/escaner-rapido` | Bypass cache |

Así no se guarda el panel admin ni respuestas JSON en CDN.

Para estáticos (`logo.png`, `style.css`, etc.) podés cachear con **Cache Everything** + TTL corto o dejar el default.

---

## 7. Seguridad (WAF) — recomendado

**Security** → **WAF** → **Custom rules** (según plan; en Free hay reglas limitadas):

### A) Rate limit al login

- **Expression:** `(http.request.uri.path eq "/api/auth/login")`
- **Action:** Rate limit — ej. **5 requests / 1 minute** por IP  
- Complementa el rate limit que ya tiene el backend.

### B) Bloquear países (opcional)

Si solo operás en LATAM/EU:

- **Field:** Country  
- **Operator:** not in  
- **Value:** AR, UY, CL, ES, … (los que necesites)  
- **Action:** Block  

Ajustá según tu comunidad; un bloqueo agresivo puede cortar VPNs legítimas.

### C) Challenge en rutas admin (opcional, plan de pago o Bot Fight)

- Paths: `/login.html`, `/admin.html`  
- **Managed Challenge** o **JS Challenge** para tráfico sospechoso.

En plan **Free**: **Security** → **Bots** → **Bot Fight Mode**: ON (ayuda contra bots obvios).

### D) Escáner y forms públicos

- Path `/escaner-rapido` → rate limit **10/min** por IP en Cloudflare (además del backend).

---

## 8. Firewall adicional (opcional)

**Security** → **Settings**:

- **Security Level:** Medium o High (High puede molestar usuarios con IP rara).
- **Browser Integrity Check:** ON  

**Allowlist** (si usás `ADMIN_IP_ALLOWLIST` en Render):

- Podés crear regla **Skip** WAF para tu IP fija en paths `/api/admin/*` y `/login.html` — solo si tu IP es estable.

---

## 9. Comprobar que funciona

1. Abrí `https://mcvoficial.com/api/health` → debe responder JSON OK.
2. En respuesta, revisá headers (DevTools → Network): debería aparecer `cf-ray`, `server: cloudflare`.
3. Login en `https://mcvoficial.com/login.html` → debe devolver token.
4. Tras 6 intentos malos de contraseña, Cloudflare o el backend deberían frenar (según reglas).

```bash
curl -sI https://mcvoficial.com/api/health | grep -iE 'cf-ray|server|http/'
```

---

## 10. Errores frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| 525 SSL handshake | SSL en Flexible con Render | Usar **Full (strict)** |
| 502 / timeout | Render dormido (plan free) | Primera visita espera ~30 s; Cloudflare puede cachear health |
| Login OK pero API 403 CORS | `CORS_STRICT` sin tu dominio | Agregar origen en `CORS_ORIGINS` |
| Rate limit bloquea a todos | Regla CF muy agresiva | Subir umbral o excluir `/api/health` |
| Admin viejo en caché | CF cacheó HTML | Regla bypass para `admin.html` |

---

## 11. No mezclar dos orígenes

Si el HTML está en **Cloudflare Pages** y la API en **Render** (dominios distintos):

- En `login.html` / `admin.html` poné `<meta name="mcv-api" content="https://mcvoficial.onrender.com">`  
  **o** abrí una vez `login.html?api=https://mcvoficial.onrender.com`.

Lo ideal para seguridad y simplicidad: **un solo dominio** (`mcvoficial.com`) apuntando al Web Service en Render, con Cloudflare solo como proxy (pasos 2–4).

---

## 12. Checklist rápido

- [ ] Dominio activo en Cloudflare (NS cambiados)
- [ ] CNAME `@` y `www` → Render, **Proxied**
- [ ] Custom domains en Render verificados
- [ ] SSL **Full (strict)**
- [ ] Bypass cache: `/api/`, `/admin.html`, `/login.html`
- [ ] Bot Fight Mode ON
- [ ] Rate limit WAF en `/api/auth/login`
- [ ] Render: `CORS_STRICT=1`, `TRUST_PROXY_HOPS=2`, `NODE_ENV=production`
- [ ] Contraseñas fuertes `ADMIN_PASSWORD` + `JWT_SECRET`

Cuando termines, redeploy en Render para aplicar env vars nuevas.
