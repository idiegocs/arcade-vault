# Auth de prod — checklist del dashboard

Proyecto `<ref-prod>`. Estos valores **no** están en SQL: se configuran a mano. Son los mismos ajustes que en [dev](../dev/auth-config.md), pero con URLs y credenciales de prod. Se completa una vez, antes del primer despliegue, y se revisa en cada release que toque Auth.

`<dominio>` = dominio público de la app (sin barra final). `<ref-prod>` = el ref que aparece en la API URL de prod.

## Supabase → Authentication

- [ ] **Site URL** (URL Configuration): `https://<dominio>`
- [ ] **Redirect URLs** (URL Configuration): `https://<dominio>/auth/callback`. **No** agregar `localhost`.
- [ ] **Confirm email** (Providers → Email): **activado**.
- [ ] **Contraseña mínima** (Providers → Email): 8.
- [ ] **Requisitos de composición** (Providers → Email): minúsculas, mayúsculas y dígitos. La app traduce ese error (`lib/auth-errors.ts`).
- [ ] **Leaked password protection:** si prod está en plan Pro, activarla. En Free la cubre la app (`lib/pwned-password.ts`).
- [ ] **Rate limits:** signups/sign-ins 10 por IP (igual que dev) o el valor que se decida para tráfico real.
- [ ] **SMTP propio** (Emails → SMTP Settings): el SMTP por defecto de Supabase tiene un límite muy bajo de envíos y no sirve para usuarios reales. Configurar un proveedor (por ejemplo, Resend con dominio verificado).

## Proveedores OAuth (apps NUEVAS, solo de prod)

- [ ] **Google:** crear un OAuth client (Web) propio de prod.
  - Authorized JavaScript origins: `https://<dominio>`
  - Authorized redirect URIs: `https://<ref-prod>.supabase.co/auth/v1/callback`
  - Pegar el Client ID y el secret en Supabase prod → Providers → Google.
- [ ] **GitHub:** crear una OAuth App propia de prod.
  - Homepage URL: `https://<dominio>`
  - Authorization callback URL: `https://<ref-prod>.supabase.co/auth/v1/callback`
  - Pegar el Client ID y el secret en Supabase prod → Providers → GitHub.

## Variables de la app en el hosting

- [ ] Todas las de [`.env.example`](.env.example) cargadas, con valores de **prod**.
- [ ] `NEXT_PUBLIC_SITE_URL` igual a la Site URL de arriba.
- [ ] Redeploy (las `NEXT_PUBLIC_*` se fijan en el build).

## Registro

| Fecha | Quién | Qué se configuró |
| ----- | ----- | ---------------- |
|       |       |                  |
