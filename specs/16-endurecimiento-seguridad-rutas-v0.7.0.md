# SPEC 16 — Endurecimiento de seguridad y protección de rutas

> **Estado:** Aprobado

> **Depende de:** 04-supabase-auth-scores (tablas `games`/`scores`/`profiles`, sus políticas RLS y `proxy.ts`), 15-autenticacion-oauth-v0.6.0 (`app/actions/auth.ts`, `lib/auth-errors.ts`, `safeNext`, botón JUGAR COMO INVITADO)
> **Fecha:** 2026-10-25
> **Versión:** 0.6.0 → 0.7.0 (minor: jugar pasa a requerir cuenta — cambio de producto visible que revierte la decisión del spec 15 de que los invitados jueguen)
> **Objetivo:** Cerrar el checklist de seguridad básico (RLS, políticas de contraseña, límite de registros, headers HTTP) y exigir sesión para jugar mediante el `proxy.ts` de Next.js, dejando sin warnings los advisors de Supabase.

## Contexto (auditoría previa, 2026-10-25)

Estado relevado contra la base y los advisors de Supabase antes de escribir el spec. Fuente del checklist: [`references/security-checklist/referenceSecurity.md`](../references/security-checklist/referenceSecurity.md).

| Ítem del checklist          | Estado real                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS en `games` y `scores`   | ✅ Ya activo en `games`, `scores` **y** `profiles`.                                                                                                |
| Advisor `auth_rls_initplan` | ⚠️ 2 políticas: `profiles` "Users can update their own profile" y `scores` "Users can insert their own scores" usan `auth.uid()` sin `(select …)`. |
| Leaked password protection  | ⚠️ El advisor de seguridad la reporta desactivada.                                                                                                 |
| Contraseña mínima 8         | Ya validada en la app (`MIN_PASSWORD = 8` en `app/actions/auth.ts`). En Supabase Auth: configurada por el usuario.                                 |
| Límite de signups por IP    | Configuración de Supabase Auth → Rate Limits.                                                                                                      |
| Headers de seguridad        | ❌ `next.config.ts` no define `headers`.                                                                                                           |
| Extra (advisor INFO)        | FK `scores.user_id` sin índice.                                                                                                                    |

Políticas actuales (`pg_policies`): `games_select_public` (SELECT, `true`), `"Profiles are viewable by everyone"` (SELECT, `true`), `"Users can update their own profile"` (UPDATE, `auth.uid() = id`, sin `WITH CHECK`), `"Scores are viewable by everyone"` (SELECT, `true`), `"Users can insert their own scores"` (INSERT, `WITH CHECK auth.uid() = user_id`). Todas con rol `public`.

`proxy.ts` ya existe (spec 04): solo refresca la sesión con `getUser()` en cada request; no redirige a nadie.

## Alcance

**Incluye:**

- **RLS (verificación, sin cambios):** `games`, `scores` y `profiles` ya tienen RLS activo; se deja registrado y se vuelve a verificar con `pg_class.relrowsecurity`.
- **Migración `sql/007_endurecimiento_rls.sql`** (aplicada con `apply_migration` del MCP de Supabase):
  - Recrea `"Users can insert their own scores"` (`scores`, INSERT) y `"Users can update their own profile"` (`profiles`, UPDATE) con `(select auth.uid())` → resuelve el advisor `auth_rls_initplan`.
  - Ambas pasan del rol `public` a `authenticated`.
  - La UPDATE de `profiles` gana `WITH CHECK ((select auth.uid()) = id)` explícito.
  - Agrega el índice `scores_user_id_idx` en `scores(user_id)` → resuelve el advisor INFO `unindexed_foreign_keys`.
  - Las políticas de SELECT público (`games`, `scores`, `profiles`) no cambian.
- **Headers de seguridad en `next.config.ts`:** `headers()` con `source: '/(.*)'` y:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains` (sin `preload`)
- **Configuración de Supabase Auth (dashboard) — aplicada por el usuario el 2026-10-25.** Se documenta en este spec (ruta del dashboard y valores) y se verifica:
  - Contraseña mínima de 8 caracteres.
  - ~~Leaked password protection (HaveIBeenPwned) activada.~~ _(Ajuste durante la implementación, 2026-10-25: el toggle es solo del plan Pro y el proyecto está en Free → se cubre en la app, ver abajo.)_
  - Requisitos de composición (minúsculas, mayúsculas y dígitos) _(descubierto al probar el paso 3: ya estaba activo en el dashboard)_.
  - Rate limit de signups por IP.
- **Traducciones en `lib/auth-errors.ts`:**
  - Contraseña filtrada de Supabase (_"Password is known to be weak and easy to guess…"_) → `PWNED_PASSWORD` = "Esa contraseña apareció en filtraciones conocidas. Elige otra." La entrada existente `"weak password"` no lo captura.
  - _(Agregado durante la implementación, 2026-10-25, decisión del usuario)_ Regla de composición (_"Password should contain at least one character of each…"_) → "La contraseña debe tener al menos una minúscula, una mayúscula y un número."
- **Leaked password protection en la app** _(agregado durante la implementación, 2026-10-25, decisión del usuario — plan Free)_: `lib/pwned-password.ts` (`isPwnedPassword(password)`) consulta la API Pwned Passwords de HaveIBeenPwned con k-anonymity (solo viajan los 5 primeros caracteres del SHA-1, con `Add-Padding: true`, timeout 3 s, `cache: "no-store"`). Se llama en `signUp` y `updatePassword` de `app/actions/auth.ts`, después de la validación de longitud y antes de Supabase; el login no se toca. **Fail-open:** si HIBP no responde, se deja pasar con un `console.warn`.
- **Protección de rutas con `proxy.ts`**, siguiendo la guía de Next 16 (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` = https://nextjs.org/docs/app/getting-started/proxy): un solo `proxy.ts` con la lógica en módulos, solo chequeos optimistas, sin consultas a la base.
  - **`lib/proxy/session.ts`:** el refresco de sesión que ya existe (`createServerClient` + `getUser()`) se mueve acá; devuelve `{ response, user }`.
  - **`lib/proxy/route-guards.ts`:** reglas declarativas que reciben la ruta y el `user`:
    - `PROTECTED_ROUTES`: `/juegos/:id/jugar` sin sesión → `/auth?next=<ruta original>` (validado con `safeNext`).
    - `/auth` con sesión → `/`.
    - `/auth/restablecer` sin sesión → `/auth`.
    - `/auth/callback`, `/api/*` y el resto: sin tocar.
  - **`proxy.ts`:** orquesta — refresca la sesión, aplica las reglas y, si hay redirect, **copia las cookies refrescadas** a la respuesta del redirect. El `matcher` no cambia.
  - **Segunda línea de defensa:** se mantienen los chequeos de `app/auth/page.tsx` y `app/auth/restablecer/page.tsx` (incluido `amr = recovery`) y se agrega uno en `app/juegos/[id]/jugar/page.tsx` (`redirect` a `/auth?next=…` sin usuario). La rama "INVITADO" del player queda como fallback defensivo.
- **Textos que dejan de ser ciertos:**
  - `components/auth-form.tsx`: **JUGAR COMO INVITADO** → **VER CATÁLOGO** (→ `/games`).
  - FAQ "¿NECESITO CREAR CUENTA?" en `components/home-content.tsx`: _"Sí, para jugar necesitas una cuenta (es gratis y tarda 10 segundos). El catálogo y el Salón de la Fama son públicos."_
  - _(Agregado durante la implementación, 2026-10-25)_ Tagline final de la home (`home-content.tsx`): "Gratis. Sin registro obligatorio. Empieza en segundos." → "Gratis. Crea tu cuenta en segundos y empieza a jugar."
- **Agentes con Playwright:** `@mobile-porter` y `@game-performance-booster` hacen login antes de abrir `/juegos/<id>/jugar`, con un usuario de prueba vía `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` en `.env.local` (nunca commiteadas). Sus `.md` lo documentan; si faltan las variables, se detienen y avisan. El usuario crea la cuenta de prueba.
- **Documentación de políticas:** `references/security-checklist/politicas-rls.md` — inventario por tabla (RLS activo, cada política con nombre/comando/roles/`USING`/`WITH CHECK` y qué permite en palabras simples, qué **no** se permite y por qué, funciones `SECURITY DEFINER` que saltan RLS — solo listadas —, migración que define cada política, fecha y query para regenerarlo). Una línea en "Key rules" de `CLAUDE.md`: todo cambio de políticas RLS se refleja ahí.
- **Checklist:** `references/security-checklist/referenceSecurity.md` con todos los ítems en `[x]` y trackeado en git (hoy está sin trackear).
- Bump a `0.7.0` en `package.json` y entrada en `CHANGELOG.md` ("Jugar requiere cuenta" bajo **Changed**).

**Fuera de alcance (para specs futuros):**

- **Content-Security-Policy** — requiere nonces y afinar Next + Supabase + OAuth; spec propio.
- **`preload` de HSTS** y envío a hstspreload.org.
- **Captcha** (Turnstile/hCaptcha) en registro/login.
- **Rate limiting propio** en Server Actions (p. ej. `saveScore`). Se usan los límites de Supabase Auth.
- **Auditoría de funciones `SECURITY DEFINER`** (`handle_new_user`, `email_for_username`) y de grants.
- **Cambios en la validación de la app** — `MIN_PASSWORD = 8` ya existe y no se toca; la regla de composición no se replica en la app (solo se traduce el error de Supabase). La única validación nueva es el chequeo HIBP.
- **URLs de producción / dominio real.**
- **Proteger otras rutas:** `/`, `/games`, `/juegos/[id]` (ficha), `/salon-de-la-fama` y `/about` siguen públicas.
- **Autorización por roles** (admin, etc.) en el proxy.
- **Suite e2e propia** (Playwright test runner en el repo). Solo se adaptan los dos agentes.

## Modelo de datos

No hay tablas, columnas ni tipos TypeScript nuevos. Cambian políticas y se agrega un índice con la migración **`sql/007_endurecimiento_rls.sql`**, aplicada con `apply_migration` y versionada en `sql/` como la 005 y la 006.

```sql
-- 1) scores: INSERT solo del propio usuario autenticado, auth.uid() evaluado una vez por query
DROP POLICY IF EXISTS "Users can insert their own scores" ON public.scores;
CREATE POLICY "Users can insert their own scores"
  ON public.scores FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- 2) profiles: UPDATE solo del propio perfil, con WITH CHECK explícito
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- 3) índice para la FK scores.user_id (advisor unindexed_foreign_keys)
CREATE INDEX IF NOT EXISTS scores_user_id_idx ON public.scores (user_id);
```

**Sin cambios:** `games_select_public`, `"Scores are viewable by everyone"`, `"Profiles are viewable by everyone"` y el RLS ya activo en las tres tablas.

**Diagrama Mermaid:** omitido a propósito — la estructura de datos y sus relaciones no cambian (solo la forma de dos políticas y un índice); un ER sería idéntico al del spec 04.

## Plan de implementación

Cada paso deja el sistema funcional; pausa al terminar cada grupo para revisión/commit.

1. ✅ **Migración RLS + índice.**
   - Crear `sql/007_endurecimiento_rls.sql` con el SQL del modelo de datos y aplicarla con `apply_migration`.
   - Verificar con `pg_policies`: roles `{authenticated}`, `(select auth.uid())` en `qual`/`with_check`, `WITH CHECK` en el UPDATE de `profiles`.
   - Verificar con `pg_indexes` que exista `scores_user_id_idx`, y `relrowsecurity = true` en las 3 tablas.
   - `get_advisors` performance: sin `auth_rls_initplan` ni `unindexed_foreign_keys`.
   - Smoke: guardar un puntaje con sesión sigue funcionando.
2. ✅ **Headers de seguridad.**
   - Leer antes la guía de `headers` en `node_modules/next/dist/docs/01-app/` (Next 16.2.10).
   - En `next.config.ts`: constante `securityHeaders` + `headers()` con `source: '/(.*)'`, sin tocar `turbopack` ni `allowedDevOrigins`.
   - Verificar con `npm run dev` + `curl -I http://localhost:3000/` y sobre una ruta de juego que vengan los 5 headers.
   - Confirmar que OAuth (Google/GitHub) sigue funcionando.
3. ✅ **Mensaje de contraseña filtrada + chequeo HIBP en la app.**
   - En `lib/auth-errors.ts`, agregar `["known to be weak", PWNED_PASSWORD]` **antes** de `"weak password"`, y la traducción de la regla de composición.
   - `lib/pwned-password.ts` + llamada en `signUp` y `updatePassword`.
   - Verificar: `Password123` → mensaje de filtrada sin crear cuenta; una contraseña sin mayúsculas → mensaje de composición; contraseña aleatoria → no filtrada; HIBP caído → fail-open.
4. ✅ **Verificación de la configuración del dashboard.**
   - `get_advisors` seguridad: `auth_leaked_password_protection` **sigue apareciendo** (esperado en Free; cubierto por el chequeo de la app).
   - Documentar en este spec los valores configurados (contraseña mínima, leaked password protection, rate limit de signups).
5. ✅ **Proxy en módulos (sin cambio de comportamiento).**
   - Leer antes `01-getting-started/16-proxy.md`, `03-api-reference/03-file-conventions/proxy.md` y _Optimistic checks with Proxy_ de `02-guides/authentication.md`.
   - Mover el refresco de sesión a `lib/proxy/session.ts` (`updateSession(request) → { response, user }`); `proxy.ts` solo lo llama. `matcher` igual.
   - Verificar login, logout, guardado de puntaje y que al recargar se sigue logueado.
6. ✅ **Reglas de rutas.**
   - `lib/proxy/route-guards.ts` con `PROTECTED_ROUTES` y las reglas de `/auth` y `/auth/restablecer`; `proxy.ts` las aplica y copia las cookies de `session.ts` a la respuesta del redirect.
   - `redirect` de segunda línea en `app/juegos/[id]/jugar/page.tsx`.
   - Verificar:
     - en incógnito, `/juegos/caida/jugar` → `/auth?next=%2Fjuegos%2Fcaida%2Fjugar`, y al entrar vuelve al juego;
     - con sesión, `/auth` → `/`;
     - `/auth/callback` (OAuth Google/GitHub) sigue funcionando;
     - `/games`, `/juegos/caida`, `/salon-de-la-fama` abren sin sesión;
     - `next=//evil.com` termina en `/`.
7. ✅ **Textos.** JUGAR COMO INVITADO → VER CATÁLOGO en `components/auth-form.tsx`; FAQ en `components/home-content.tsx`. Verificar en el navegador textos y enlace a `/games`.
8. **Agentes con Playwright.**
   - En `.claude/agents/mobile-porter.md` y `.claude/agents/game-performance-booster.md`: paso de login previo (`/auth` → usuario y contraseña desde `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` de `.env.local`); sin variables, se detienen y avisan.
   - Documentar las variables en `.env.example` si existe; si no, en este spec.
   - Verificar con un login real vía Playwright MCP que `/juegos/caida/jugar` carga el canvas.
   - Los `.md` están force-added: `git add -f`.
9. **Documentar las políticas.**
   - Generar el inventario desde la base (`pg_policies` + `pg_class.relrowsecurity`), ya con la 007 aplicada, y escribir `references/security-checklist/politicas-rls.md` con la estructura del alcance.
   - Línea en "Key rules" de `CLAUDE.md`.
   - Verificar que cada política de `pg_policies` aparece documentada y que no hay ninguna documentada que no exista.
10. **Cierre.**
    - Ítems del checklist en `[x]`; trackear `referenceSecurity.md` y `politicas-rls.md`.
    - Actualizar `references/juegos-implementados.md` si menciona el modo invitado.
    - Bump `0.6.0 → 0.7.0` en `package.json` + entrada `[0.7.0]` en `CHANGELOG.md`.
    - `npm run lint` y `npm run build`.
    - Bitácora de soluciones + lecciones aprendidas en este spec; pasos marcados ✅.

## Criterios de aceptación

**Base de datos (Supabase)**

- [ ] `sql/007_endurecimiento_rls.sql` existe en el repo y aparece en `list_migrations`.
- [ ] `relrowsecurity = true` en `games`, `scores` y `profiles`.
- [ ] `"Users can insert their own scores"`: `roles = {authenticated}`, `with_check = ((SELECT auth.uid()) = user_id)`.
- [ ] `"Users can update their own profile"`: `roles = {authenticated}`, `qual` y `with_check` = `((SELECT auth.uid()) = id)`.
- [ ] Existe `scores_user_id_idx` sobre `scores(user_id)`.
- [ ] `get_advisors` performance no reporta `auth_rls_initplan` ni `unindexed_foreign_keys`.
- [ ] ~~`get_advisors` seguridad no reporta `auth_leaked_password_protection`.~~ _No aplicable en plan Free (el toggle es de Pro): el warning sigue apareciendo y la protección la da `lib/pwned-password.ts`._
- [ ] Con sesión, terminar una partida guarda el puntaje y aparece en el ranking.

**Auth**

- [ ] Registrarse con `Password123` muestra "Esa contraseña apareció en filtraciones conocidas. Elige otra." y no crea la cuenta.
- [ ] Restablecer la contraseña con `Password123` en `/auth/restablecer` muestra el mismo mensaje y no la cambia.
- [ ] Registrarse con una contraseña sin mayúsculas ni dígitos (no filtrada) muestra "La contraseña debe tener al menos una minúscula, una mayúscula y un número."
- [ ] Con HIBP inaccesible, el registro sigue funcionando (fail-open) y queda un `console.warn` en el servidor.
- [ ] Solo los 5 primeros caracteres del SHA-1 salen del servidor (revisión de `lib/pwned-password.ts`).
- [ ] Registrarse con 7 caracteres muestra "La contraseña debe tener al menos 8 caracteres."
- [ ] Login con Google, GitHub y usuario/contraseña siguen funcionando.
- [ ] El spec documenta los valores configurados en el dashboard (contraseña mínima, leaked password protection, rate limit de signups).

**Proxy y rutas**

- [ ] `proxy.ts` solo orquesta: el refresco de sesión vive en `lib/proxy/session.ts` y las reglas en `lib/proxy/route-guards.ts`.
- [ ] El proxy no consulta tablas (solo `getUser()`).
- [ ] Sin sesión, `/juegos/caida/jugar` redirige a `/auth?next=%2Fjuegos%2Fcaida%2Fjugar`; tras entrar se vuelve a `/juegos/caida/jugar`.
- [ ] Sin sesión, `/`, `/games`, `/juegos/caida`, `/salon-de-la-fama` y `/about` responden 200 sin redirección.
- [ ] Con sesión, `/auth` redirige a `/`.
- [ ] Sin sesión de recuperación, `/auth/restablecer` redirige a `/auth`; el flujo "¿Olvidaste tu contraseña?" funciona de punta a punta.
- [ ] `/auth?next=//evil.com` termina en `/` tras el login.
- [ ] Con la regla del proxy desactivada temporalmente (prueba local, no commiteada), `app/juegos/[id]/jugar/page.tsx` igual redirige a `/auth` sin sesión.
- [ ] Tras recargar con sesión, se sigue logueado (el refresco de cookies sigue funcionando).

**Headers**

- [ ] `curl -I` sobre `/`, `/auth` y `/juegos/caida/jugar` (incluido el 307 del redirect) devuelve los 5 headers con los valores exactos del alcance.
- [ ] El juego carga y se juega por la IP de la LAN desde el celular.

**Textos**

- [ ] `/auth` ya no muestra "JUGAR COMO INVITADO"; "VER CATÁLOGO" lleva a `/games`.
- [ ] La FAQ "¿NECESITO CREAR CUENTA?" muestra el texto nuevo.

**Agentes**

- [ ] `mobile-porter.md` y `game-performance-booster.md` describen el login previo con `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` y se detienen si faltan.
- [ ] Con las variables en `.env.local`, un login vía Playwright MCP lleva a `/juegos/caida/jugar` y el canvas se renderiza.
- [ ] Ninguna credencial en archivos trackeados (`git grep E2E_USER_PASSWORD=` sin resultados con valor).

**Documentación y cierre**

- [ ] `politicas-rls.md` documenta las 5 políticas actuales y ninguna inexistente.
- [ ] `CLAUDE.md` apunta a `politicas-rls.md` y sigue < ~8 KB.
- [ ] `referenceSecurity.md` con todos los ítems en `[x]`; ambos archivos trackeados.
- [ ] `package.json` = `0.7.0`, `CHANGELOG.md` con `[0.7.0]` y link al spec, Footer muestra `v0.7.0`.
- [ ] `npm run lint` y `npm run build` terminan sin errores.

## Decisiones tomadas y descartadas

| Decisión                                                                                                    | Alternativa descartada                                          | Por qué                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Jugar requiere cuenta** (`/juegos/[id]/jugar` protegida).                                                 | Mantener el modo invitado del spec 15.                          | Decisión del usuario (2026-10-25). Revierte la del spec 15 → bump minor (0.7.0).                                                         |
| Catálogo, fichas, Salón de la Fama, home y About **siguen públicos**.                                       | Proteger todo el sitio.                                         | Se puede explorar juegos y ranking sin registrarse; solo jugar exige cuenta.                                                             |
| **JUGAR COMO INVITADO → VER CATÁLOGO** (`/games`).                                                          | Quitar el botón.                                                | Mantiene una salida para quien aún no quiere registrarse.                                                                                |
| **Un solo `proxy.ts` orquestador** + `lib/proxy/session.ts` y `lib/proxy/route-guards.ts`.                  | Toda la lógica en `proxy.ts`.                                   | Recomendado por la guía de Next 16 (`16-proxy.md`): un archivo de proxy, organizado en módulos.                                          |
| **El proxy solo hace chequeos optimistas** reusando `getUser()`.                                            | Consultar `profiles`/roles en el proxy.                         | La guía: _"not intended for slow data fetching"_ ni autorización completa; corre en cada request, incluidos prefetch.                    |
| **Se mantienen los chequeos en las páginas** y se agrega uno en `jugar/page.tsx`.                           | Confiar solo en el proxy.                                       | La guía de auth pide que el proxy no sea la única defensa; RLS sigue siendo la protección real de los datos.                             |
| **Copiar las cookies refrescadas al redirect.**                                                             | `NextResponse.redirect` directo.                                | Si no, un token refrescado en ese request se pierde y la sesión se cae.                                                                  |
| **Headers en `next.config.ts`** (`headers()`).                                                              | Ponerlos en el proxy.                                           | El `matcher` del proxy excluye `_next/static` e imágenes; `next.config` cubre todo y el proxy queda con una sola responsabilidad.        |
| **5 headers:** los 3 del checklist + `Permissions-Policy` + HSTS.                                           | Agregar también CSP.                                            | CSP en Next con Supabase/OAuth requiere nonces y afinarla; va en su propio spec.                                                         |
| **HSTS sin `preload`.**                                                                                     | Con `preload`.                                                  | Difícil de revertir y todavía no hay dominio de producción.                                                                              |
| **La 007 reescribe solo las 2 políticas con `auth.uid()`**, a `authenticated` y con `WITH CHECK` explícito. | Reescribir todas las políticas.                                 | Las de SELECT público no usan `auth.*` y ya cumplen.                                                                                     |
| **Índice `scores_user_id_idx`** incluido.                                                                   | Dejarlo para otro spec.                                         | Una línea, sin riesgo, cierra el advisor INFO.                                                                                           |
| **Configuración del dashboard aplicada por el usuario**; el spec la documenta y verifica.                   | Automatizarla vía Management API.                               | El MCP no la expone y ya estaba hecha al escribir el spec.                                                                               |
| **Traducir "known to be weak"** antes de "weak password".                                                   | Dejar la entrada actual.                                        | El mensaje de contraseña filtrada no contiene "weak password" y caería en "Algo salió mal".                                              |
| **Leaked password protection propia vía API Pwned Passwords (HIBP)** _(implementación, 2026-10-25)_.        | Pagar Pro para el toggle de Supabase, o no tener la protección. | Proyecto en plan Free. Es la misma fuente que usa Supabase, gratis y sin API key; con k-anonymity la contraseña nunca sale del servidor. |
| **Fail-open si HIBP no responde.**                                                                          | Fail-closed ("No pudimos verificar la contraseña").             | Una caída externa no debe bloquear los registros; longitud y composición siguen aplicando. Decisión del usuario.                         |
| **Chequeo HIBP solo en registro y restablecer**, no en login.                                               | También en el login.                                            | Una cuenta vieja con contraseña filtrada no queda bloqueada fuera; el chequeo actúa cuando se elige una contraseña.                      |
| **Regla de composición solo traducida**, no replicada en la app.                                            | Validarla también en `auth.ts`.                                 | Cambio mínimo; Supabase ya la aplica. Decisión del usuario (A-a).                                                                        |
| **`MIN_PASSWORD = 8` se mantiene en la app** además de Supabase.                                            | Validar solo en Supabase.                                       | Respuesta rápida, sin ir a la red, y con mensaje propio.                                                                                 |
| **Usuario de prueba vía `E2E_USER_*` en `.env.local`** para los agentes.                                    | Bypass del proxy en dev (`?e2e=1`).                             | Un bypass de auth es justo lo que este spec busca evitar.                                                                                |
| **Políticas documentadas en `politicas-rls.md`**, generado desde `pg_policies`.                             | Documentarlas a mano en el spec.                                | Referencia viva y regenerable; `CLAUDE.md` solo apunta a ella.                                                                           |

## Riesgos identificados

| Riesgo                                                                                                                                                               | Impacto                                                                  | Mitigación                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Perder la sesión en el redirect:** `NextResponse.redirect` sin copiar las cookies que `updateSession` acaba de refrescar.                                          | Logouts "fantasma" o loops `/auth` ↔ `/`.                                | `route-guards` recibe la respuesta de `session.ts` y copia sus cookies al redirect; criterio "recargar y seguir logueado".                                                        |
| **Romper OAuth o la recuperación:** una regla que capture `/auth/callback`, o que mande `/auth/restablecer` a `/` porque "ya hay sesión" (la de recuperación lo es). | No se puede entrar con Google/GitHub ni restablecer la contraseña.       | `/auth/callback` excluido explícitamente; `/auth/restablecer` fuera de la regla "con sesión → `/`". Se prueban ambos flujos de punta a punta.                                     |
| **Loop de redirección** si las reglas de `/auth` y de una ruta protegida se cruzan, o `next` apunta a `/auth`.                                                       | La página no carga.                                                      | `safeNext` + guarda: si `next` empieza con `/auth`, se usa `/`.                                                                                                                   |
| **Open redirect** vía `?next=`.                                                                                                                                      | Phishing.                                                                | Se reusa `safeNext` del spec 15 (resuelve la URL y compara el origen); criterio con `//evil.com`.                                                                                 |
| **Usuarios sin cuenta que antes jugaban.**                                                                                                                           | Caída de uso / quejas.                                                   | Decisión de producto aceptada; VER CATÁLOGO y la FAQ lo explican; CHANGELOG en **Changed**.                                                                                       |
| **`Permissions-Policy` bloquea APIs del player** (vibración y pantalla completa del spec 12).                                                                        | Vibración o PANTALLA COMPLETA dejan de andar en el celular.              | La policy solo apaga `camera`, `microphone` y `geolocation`; ni `fullscreen` ni vibración. Se verifica en celular real.                                                           |
| **El advisor `auth_leaked_password_protection` sigue apareciendo** (lo reportaba aún tras el cambio en el dashboard).                                                | El criterio no se puede cerrar.                                          | Puede ser caché del linter; si persiste, el toggle no se guardó o el plan no lo incluye (función de Pro). Se avisa al usuario y se documenta el resultado real, sin marcar `[x]`. |
| **Los agentes fallan sin `E2E_USER_*`.**                                                                                                                             | `@mobile-porter` / `@game-performance-booster` no pueden abrir el juego. | Se detienen con un mensaje claro; el usuario crea la cuenta de prueba una vez.                                                                                                    |
| **Filtrar las credenciales de prueba.**                                                                                                                              | Cuenta comprometida.                                                     | Solo en `.env.local` (gitignored) + criterio `git grep`; la cuenta de prueba no tiene privilegios.                                                                                |
| **Costo del proxy en cada request** (`getUser()` hace una llamada de red a Supabase Auth).                                                                           | Latencia.                                                                | Ya ocurre hoy (spec 04); este spec no agrega llamadas, solo reusa el `user` devuelto.                                                                                             |

## Bitácora de soluciones

### Paso 1 — Migración RLS + índice (2026-10-25)

- Migración `endurecimiento_rls` aplicada con `apply_migration`. Copia versionada en `sql/007_endurecimiento_rls.sql`, igual al SQL del modelo de datos.
- **`pg_policies` después:** `"Users can insert their own scores"` → `{authenticated}`, `with_check = (( SELECT auth.uid() AS uid) = user_id)`. `"Users can update their own profile"` → `{authenticated}`, con `qual` y `with_check` = `(( SELECT auth.uid() AS uid) = id)`. Las 3 de SELECT siguen en `{public}` con `true`.
- `relrowsecurity = true` en `games`, `scores` y `profiles`. El índice `scores_user_id_idx` existe (`btree (user_id)`).
- **Advisor de performance:** ya no reporta `auth_rls_initplan` ni `unindexed_foreign_keys`. Aparece un INFO nuevo, `unused_index` sobre `scores_user_id_idx`. Es esperable en un índice recién creado: el linter lo marca hasta que alguna query lo use (p. ej. el `ON DELETE CASCADE` al borrar un usuario). No requiere acción.
- **Prueba de RLS (transacciones con `ROLLBACK`, sin dejar datos):**
  - `authenticated` con `sub` = dueño del perfil → INSERT en `scores` OK.
  - `authenticated` con otro `sub` → `42501 new row violates row-level security policy`.
  - `anon` → `42501` (antes la política era `public`; ahora `anon` ni siquiera tiene una política de INSERT).

### Paso 2 — Headers de seguridad (2026-10-25)

- Se leyó `03-api-reference/05-config/01-next-config-js/headers.md` (Next 16.2.10): `headers` es una función async en `next.config` que devuelve `{ source, headers }[]`, y se evalúa antes del filesystem (cubre páginas, `/public` y `_next/static`).
- `next.config.ts`: constante `securityHeaders` + `headers: async () => [{ source: "/(.*)", headers: securityHeaders }]`. `turbopack` y `allowedDevOrigins` sin tocar.
- **Diferencias con la guía de Next, a propósito:** la guía sugiere `X-Frame-Options: SAMEORIGIN` y HSTS con `preload`; el spec fija `DENY` (la app no se embebe a sí misma en iframes) y HSTS sin `preload` (decisión del spec). La guía también nota que `X-Frame-Options` está superado por `frame-ancestors` de CSP, que queda para el spec de CSP.
- El dev server levantado recargó `next.config.ts` solo, sin reiniciar.
- **Verificación (`curl -I`):** `/`, `/auth`, `/juegos/caida/jugar` y `/games` → 200 con los 5 headers y los valores exactos. Un chunk real de `/_next/static/chunks/…js` también los trae (por eso los headers no van en el proxy).
- **OAuth:** con Playwright, clic en ▣ GITHUB en `/auth` → ida y vuelta completa a GitHub (el perfil de Playwright ya tenía sesión en GitHub) → `/` con "Entraste con GitHub · @idiegocs". `Referrer-Policy` y `X-Frame-Options` no afectan el redirect. Google no se probó por separado: comparte el mismo flujo (`signInWithOAuth` → `/auth/callback`).

### Paso 3 — Contraseña filtrada: traducción + chequeo HIBP en la app (2026-10-25)

- **Hallazgo 1 (regla de composición):** registrarse con `password123` mostraba "Algo salió mal". Los `auth_logs` de Supabase dieron el motivo real: `422 Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.` El dashboard ya tenía requisitos de composición y ese mensaje no estaba traducido. → nueva entrada `"should contain at least one character of each"` en `lib/auth-errors.ts`.
- **Hallazgo 2 (HIBP de Supabase inactivo):** `Password123` (cumple la composición) **creó la cuenta**: la leaked password protection de Supabase no está activa. El usuario confirmó plan Free, donde el toggle no existe. La cuenta de prueba (`spec16.leak.test@example.com`) se borró enseguida con `delete from auth.users where id = … and email = …`.
- **Solución (decisión del usuario):** `lib/pwned-password.ts` con la API Pwned Passwords (`GET https://api.pwnedpasswords.com/range/<5 chars SHA-1>`, `Add-Padding: true`, `AbortSignal.timeout(3000)`, `cache: "no-store"`). Las líneas de padding traen `:0` y se descartan con `Number(count) > 0`. Se llama en `signUp` (después de longitud, antes de buscar el usuario y de `supabase.auth.signUp`) y en `updatePassword` (después de "no coinciden", antes de `isRecoverySession`). Mensaje compartido como constante `PWNED_PASSWORD` en `lib/auth-errors.ts` (también para el mensaje de Supabase, por si algún día se activa el toggle).
- **Verificación:**
  - `tsc --noEmit` y `eslint` de los 3 archivos: OK.
  - Playwright en `/auth` → CREAR CUENTA: `Password123` → "Esa contraseña apareció en filtraciones conocidas. Elige otra."; `zqvkxmlpwrt8` (no filtrada, sin mayúsculas) → "La contraseña debe tener al menos una minúscula, una mayúscula y un número."
  - Función aislada (Node 24 `--experimental-strip-types`, desde el scratchpad): `Password123` → `true`; `Vx9-<uuid>` → `false`; `fetch` que rechaza → `false` + `[auth] Pwned Passwords no disponible…` (fail-open).
  - `auth.users` sin cuentas `spec16%` al terminar.
- **Pendiente para los criterios:** restablecer con `Password123` en `/auth/restablecer` requiere una sesión de recuperación (enlace por correo); se prueba a mano en la verificación final.
- **Lección:** antes de dar por buena una config del dashboard, probarla con un caso que la ejercite y mirar `auth_logs` — el mensaje genérico de la app ocultaba que la contraseña ni siquiera llegaba al chequeo esperado.

### Paso 4 — Configuración del dashboard (2026-10-25)

Ajustes de Supabase Auth informados por el usuario (dashboard → Authentication), con lo que se pudo comprobar desde fuera (el MCP no expone la config de Auth):

| Ajuste | Dónde | Valor | Comprobado |
|---|---|---|---|
| Contraseña mínima | Authentication → Providers → Email → _Minimum password length_ | 8 | Solo indirectamente: la app corta antes en 8 (`MIN_PASSWORD`). |
| Requisitos de composición | Authentication → Providers → Email → _Password requirements_ | minúsculas, mayúsculas y dígitos | ✅ `auth_logs`: `422 Password should contain at least one character of each…` |
| Leaked password protection | Authentication → Providers → Email → _Prevent use of leaked passwords_ | **No disponible (plan Free)** | ✅ `Password123` se aceptaba; advisor `auth_leaked_password_protection` sigue en WARN. Cubierto en la app (paso 3). |
| Rate limit de signups/sign-ins por IP | Authentication → Rate Limits | **10** solicitudes por IP (ventana de 5 min de Supabase), informado por el usuario | — (no se dispara a propósito para no bloquear la IP de desarrollo) |

### Paso 5 — Proxy en módulos (2026-10-25)

- Se leyeron `01-getting-started/16-proxy.md`, `03-api-reference/03-file-conventions/proxy.md` y _Optimistic checks with Proxy_ (`02-guides/authentication.md`). Nota de la API reference: el proxy no debe depender de **estado** compartido o globals; importar funciones de módulos (lo que hace este spec) sí está recomendado por la guía.
- `lib/proxy/session.ts`: `updateSession(request) → { response, user }`. Es el código del spec 04 movido tal cual (mismo `setAll` que recrea `NextResponse.next({ request })`), solo que ahora devuelve el `user` del `getUser()` que ya se hacía.
- `proxy.ts`: solo `const { response } = await updateSession(request); return response;`. Mismo `matcher` y misma exportación nombrada `proxy`.
- **Verificación:** `tsc --noEmit` OK. Playwright: login con ▣ GITHUB → `/`; `/games` con sesión; `/juegos/caida/jugar` muestra `IDIEGOCS` (no INVITADO) y el canvas; Salir → `/` con "Iniciar Sesión". El guardado de puntaje se cubrió a nivel RLS en el paso 1 (INSERT como `authenticated`); jugar una partida completa queda para la verificación final.

### Paso 6 — Reglas de rutas (2026-10-25)

- `lib/proxy/route-guards.ts`: `guardRoute(request, user) → URL | null`. `PROTECTED_ROUTES = [/^\/juegos\/[^/]+\/jugar\/?$/]` (regex: el id es dinámico). Sin sesión → `/auth?next=<pathname+search>` pasado por `safeNext`. Con sesión, solo `/auth` (y `/auth/`) → `/`; `/auth/restablecer` queda fuera de esa regla a propósito. Sin sesión, `/auth/restablecer*` → `/auth`.
- `proxy.ts`: si `guardRoute` devuelve URL, crea `NextResponse.redirect` y copia `response.cookies.getAll()` (las que `getUser()` refrescó) con `redirect.cookies.set(cookie)`.
- `app/juegos/[id]/jugar/page.tsx`: segunda línea al inicio, antes de buscar el juego — sin `username`, `redirect('/auth?next=…')`. Cubre también el HUD mock de juegos sin motor. Se reusa `getSessionUsername()` (ya se llamaba); una cuenta sin perfil termina en `/auth` → `/`, sin loop.
- **Loop `next=/auth`:** no hizo falta tocar `safeNext`. El proxy nunca genera un `next` hacia `/auth`, y un `?next=/auth` externo termina en `/` por la regla "con sesión, `/auth` → `/`".
- **Verificación sin sesión (`curl`):** `/juegos/caida/jugar` → `307 /auth?next=%2Fjuegos%2Fcaida%2Fjugar`; con `?skin=neon` el query viaja en `next`; `/auth/restablecer` → `307 /auth`; `/`, `/games`, `/juegos/caida`, `/salon-de-la-fama`, `/about`, `/auth` → 200; `/auth/callback` y `/api/contact` siguen con su comportamiento propio (`307 ?error=enlace` sin `code`, 405 en GET). El 307 trae los 5 headers de seguridad.
- **Playwright:** `/juegos/caida/jugar` → `/auth?next=…` → ▣ GITHUB → vuelve a `/juegos/caida/jugar` con canvas y `IDIEGOCS`. Con sesión, `/auth?next=//evil.com` → `/`. Sin sesión, `/auth?next=//evil.com` → GitHub → `/`. Con sesión normal (no recovery), `/auth/restablecer` → página → `/auth` → proxy → `/`.
- **Segunda línea:** con `PROTECTED_ROUTES = []` (temporal, ya revertido), `/juegos/caida/jugar` igual da 307 y el body trae `NEXT_REDIRECT;replace;/auth?next=%2Fjuegos%2Fcaida%2Fjugar;307` (lo genera la página, el redirect del proxy no tiene ese body). Un primer intento con `sed` no reemplazó la línea y probó el proxy en vez de la página; se repitió con Edit.
- **Pendiente para la verificación final:** el flujo "¿Olvidaste tu contraseña?" de punta a punta (necesita el correo) y que el refresco de cookies sobreviva a un redirect con el token por vencer (difícil de forzar; el código copia las cookies).

### Paso 7 — Textos (2026-10-25)

- `components/auth-form.tsx`: el `Link` a `/games` dice **VER CATÁLOGO** (antes JUGAR COMO INVITADO).
- `components/home-content.tsx`, FAQ "¿NECESITO CREAR CUENTA?": "Sí, para jugar necesitas una cuenta (es gratis y tarda 10 segundos). El catálogo y el Salón de la Fama son públicos."
- **Verificación (Playwright):** en `/auth`, "VER CATÁLOGO" → `href="/games"` y no queda "JUGAR COMO INVITADO"; el HTML de `/` trae la FAQ nueva y no la vieja.
- **Barrido de textos:** `grep` de "invitado / sin cuenta / sin registro" en `app`, `components`, `lib`, README y `juegos-implementados.md`. Quedan el "INVITADO" del HUD mock y del player (fallback defensivo, decidido en el spec) y el tagline de la home `home-content.tsx:452` "Gratis. Sin registro obligatorio. Empieza en segundos.", que ya no es cierto y no estaba en el alcance → **cambiado a "Gratis. Crea tu cuenta en segundos y empieza a jugar."** (decisión del usuario, 2026-10-25).
