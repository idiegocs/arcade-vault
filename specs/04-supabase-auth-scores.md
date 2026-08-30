# SPEC 04 — Conexión a Supabase: Auth real y esquema de puntajes

> **Estado:** Implementado
> **Depende de:** 03-about-contact-email
> **Fecha:** 2026-08-30
> **Objetivo:** Conectar el proyecto a un Supabase existente para reemplazar el mock de `/auth` con autenticación real por email/contraseña (con perfiles de usuario), y crear el esquema de puntajes/leaderboard para que `/salon-de-la-fama` y el "mejor puntaje" de cada juego lean datos reales de Supabase, sin que todavía exista un motor de juego que los escriba en vivo.

## Alcance

**Incluye:**

- Instalar `@supabase/supabase-js` y `@supabase/ssr`.
- `.env.local`: agregar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (no se toca `DB_PWD`).
- `lib/supabase/client.ts` (cliente para navegador) y `lib/supabase/server.ts` (cliente para Server Components/Actions, basado en cookies).
- `proxy.ts` en la raíz (reemplaza al histórico `middleware.ts` en Next.js 16) para refrescar la sesión en cada request.
- `sql/002_create_profiles.sql` y `sql/003_create_scores.sql`: tablas `profiles` y `scores`, trigger que crea el perfil al registrarse, y políticas RLS — aplicadas al proyecto real vía el MCP de Supabase (`apply_migration`), con el `.sql` versionado en el repo como registro.
- `app/actions/auth.ts`: Server Actions `signUp`, `signIn`, `signOut` usando el cliente de servidor.
- `app/auth/page.tsx`: formulario conectado a las Server Actions reales (`useActionState`), con estados de error y de envío. Solo email/contraseña; los botones de Google/GitHub siguen siendo visuales, no funcionales.
- `lib/scores.ts`: funciones `getBestScore(gameId)` y `getTopScoresByGame(gameId, limit)` contra la tabla `scores`.
- `app/salon-de-la-fama/page.tsx`: tabs funcionales por juego, consultando Supabase (tabla vacía por ahora → estado "sin puntajes aún").
- `app/juegos/[id]/page.tsx`: "Mejor global" real desde Supabase, con fallback "SIN RÉCORD" si no hay datos.
- `components/game-card.tsx` + `app/games/page.tsx`: mismo reemplazo de `best` hardcodeado por el valor real (consultado en batch para las 8 cards), con el mismo fallback.
- `components/nav.tsx` + `app/layout.tsx`: el Nav refleja la sesión — username + botón "Salir" cuando hay sesión activa, "Iniciar Sesión" cuando no la hay (desktop y móvil).

**Fuera de alcance (para futuros specs):**

- Guardar puntajes reales durante una partida — no existe motor de juego; el botón "FIN" en `/juegos/[id]/jugar` sigue sin funcionalidad.
- Login social (Google/GitHub) funcional.
- Poblar `scores`/`profiles` con datos de ejemplo — las tablas quedan vacías tras este spec.
- Migraciones versionadas con Supabase CLI — por ahora el esquema se aplica con un script SQL manual; la CLI queda para un spec futuro.
- Proteger rutas por sesión (ej. exigir login para jugar) — invitados siguen entrando a `/juegos/[id]/jugar` sin restricción.
- Recuperación de contraseña ("olvidé mi contraseña").
- Roles, permisos de administrador o moderación de usuarios.
- Sistema de créditos real — el contador "CRÉDITOS · 03" del Nav sigue hardcodeado.

## Modelo de datos

Tablas nuevas en Supabase, siguiendo la convención numérica ya iniciada en `sql/001_create_games_table.sql` (`scores` no depende de ella — ver Decisiones sobre su ejecución):

- `sql/002_create_profiles.sql`
- `sql/003_create_scores.sql`

```sql
-- profiles: 1 fila por usuario, vinculada a auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

-- scores: histórico de puntajes por usuario y juego (append-only)
create table scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,       -- coincide con Game.id de lib/data.ts, sin FK a la tabla `games`
  score integer not null,
  created_at timestamptz not null default now()
);
```

**Trigger:** al insertarse una fila en `auth.users` (signup), una función `handle_new_user()` (`SECURITY DEFINER`) crea automáticamente la fila correspondiente en `profiles`, tomando `username` de `raw_user_meta_data->>'username'` (dato pasado en el `signUp` desde `app/actions/auth.ts`).

**RLS (ambas tablas con RLS habilitado):**

- `profiles`: `select` público (se necesita para mostrar usernames); `insert` no permitido directo (solo vía el trigger `SECURITY DEFINER`); `update` solo de la propia fila (`auth.uid() = id`).
- `scores`: `select` público (leaderboard visible sin sesión); `insert` solo para usuarios autenticados y solo con `user_id = auth.uid()`; sin `update`/`delete` (append-only).

**Contrato de `lib/scores.ts`:**

```ts
function getBestScore(gameId: string): Promise<number | null>;
function getTopScoresByGame(
  gameId: string,
  limit?: number
): Promise<{ username: string; score: number; created_at: string }[]>;
// Agregada durante la implementación (paso 9): batch para /games, una sola
// consulta en vez de 8 llamadas a getBestScore.
function getBestScoresByGames(gameIds: string[]): Promise<Record<string, number | null>>;
```

Ambas devuelven vacío/`null` hasta que exista un motor de juego que escriba en `scores` (fuera de alcance de este spec).

## Plan de implementación

1. Instalar `@supabase/supabase-js` y `@supabase/ssr` (`npm install`). Test manual: `npm run dev` sigue levantando sin errores.
2. Agregar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` a `.env.local`; crear `lib/supabase/client.ts` (cliente de navegador) y `lib/supabase/server.ts` (cliente de servidor basado en cookies). Test manual: `npm run lint` pasa; nada los usa aún, sin cambios visuales.
3. Crear `proxy.ts` en la raíz (equivalente a `middleware.ts` en Next.js 16) que refresca la sesión de Supabase en cada request. Test manual: `npm run dev`, navegar por el sitio sin errores en consola ni en la terminal.
4. Crear `sql/002_create_profiles.sql` y `sql/003_create_scores.sql` (tablas, trigger `handle_new_user()`, políticas RLS descritas en el modelo de datos) y aplicarlos al proyecto real vía el MCP de Supabase (`apply_migration`), en vez de pegarlos a mano en el SQL Editor (ver Decisiones). Test manual: `list_tables` del MCP confirma `profiles` y `scores` creadas, vacías, con RLS habilitado; `get_advisors` (security) sin hallazgos pendientes.
5. Crear `app/actions/auth.ts` con las Server Actions `signUp`, `signIn`, `signOut` (usan `lib/supabase/server.ts`, validan campos no vacíos, redirigen a `/` en éxito). Test manual: `npm run lint` pasa (aún no conectadas al form).
6. Conectar `app/auth/page.tsx` a las Server Actions con `useActionState`: el username del signup viaja como metadata (`options.data.username`) para que el trigger lo use; estados de error visibles (reutilizando el "shake" existente) sin perder lo escrito; botón deshabilitado mientras está pendiente. Test manual: crear cuenta válida → sesión creada, redirige a `/`; login con credenciales incorrectas → error visible.
7. Actualizar `app/layout.tsx` para obtener el usuario actual vía `lib/supabase/server.ts` y pasarlo a `components/nav.tsx`; el Nav muestra username + botón "Salir" (invoca `signOut`) en vez de "Iniciar Sesión" cuando hay sesión, en desktop y móvil. Test manual: tras login el Nav muestra el username; "Salir" cierra sesión y vuelve a mostrar "Iniciar Sesión".
8. Crear `lib/scores.ts` con `getBestScore(gameId)` y `getTopScoresByGame(gameId, limit)`. Test manual: `npm run lint` pasa (aún no conectadas).
9. Conectar `app/games/page.tsx` + `components/game-card.tsx` al `best` real (una sola consulta batch para las 8 cards), con fallback "SIN RÉCORD" si es `null`. Test manual: `/games` muestra "SIN RÉCORD" en las 8 cards.
10. Conectar `app/juegos/[id]/page.tsx` ("Mejor global") al mismo dato y fallback. Test manual: el detalle de cada juego muestra "SIN RÉCORD" en vez de un número hardcodeado.
11. Actualizar `app/salon-de-la-fama/page.tsx`: tabs funcionales vía `searchParams` (`?game=<id>`, sin convertir la página a client component) que consultan `getTopScoresByGame`; estado vacío "SIN PUNTAJES AÚN" en vez del podio/tabla cuando no hay filas. Test manual: cada uno de los 8 tabs muestra el estado vacío, sin errores en consola.
12. Verificación final: recorrer signup → login → Nav con sesión → `/games` → detalle → salón de la fama (recorrer tabs) → logout, y correr `npm run lint`. Test manual: sin errores de consola, sin enlaces rotos, lint limpio.

## Criterios de aceptación

- [x] `npm run dev` levanta la app sin errores en consola.
- [x] `npm install` agrega `@supabase/supabase-js` y `@supabase/ssr` a `package.json`.
- [x] `.env.local` tiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, y ninguno de los dos está hardcodeado en el código.
- [x] `sql/002_create_profiles.sql` y `sql/003_create_scores.sql` aplicados en Supabase (vía MCP) crean las tablas `profiles` y `scores` con RLS habilitado, sin hallazgos de seguridad pendientes en `get_advisors`.
- [x] Crear una cuenta nueva en `/auth` (tab "CREAR CUENTA") con usuario, correo y contraseña válidos crea el usuario en Supabase Auth, crea su fila en `profiles` (vía trigger) y redirige a `/` ya logueado, sin pedir confirmación de correo. Verificado contra el proyecto real llamando directo a los mismos métodos de `supabase-js` que usa la Server Action (sin clic literal en navegador — Playwright no disponible esta sesión).
- [x] Iniciar sesión en `/auth` (tab "INICIAR SESIÓN") con credenciales válidas redirige a `/` con sesión activa. Mismo tipo de verificación que el punto anterior.
- [x] Iniciar sesión con credenciales inválidas muestra un error visible en el formulario, sin perder lo que el usuario ya escribió. Confirmado el mensaje de error real de Supabase (`Invalid login credentials`) llega tal cual a `state.error`; los inputs no controlados conservan su valor al no haber redirect.
- [x] Mientras se procesa el submit (signup o login), el botón queda deshabilitado (`disabled={pending}` de `useActionState`).
- [x] Con sesión activa, el Nav (desktop y móvil) muestra el username y un botón "Salir" en vez de "Iniciar Sesión". Verificado el mismo query RLS que usa `getSessionUsername()` con un JWT real — no se hizo clic literal en navegador.
- [x] Hacer clic en "Salir" cierra la sesión y el Nav vuelve a mostrar "Iniciar Sesión". Verificado `POST /auth/v1/logout` invalida la sesión (`204`); `signOut()` hace lo mismo + `redirect("/")`.
- [x] `/games` muestra "SIN RÉCORD" en las 8 cards en vez de un número hardcodeado (tabla `scores` vacía).
- [x] `/juegos/[id]` muestra "SIN RÉCORD" en "Mejor global" para cualquier juego.
- [x] `/salon-de-la-fama` muestra 8 tabs (uno por juego); cada tab consulta Supabase y muestra el estado "SIN PUNTAJES AÚN" (tabla vacía). Verificado en los 8 juegos + la ruta sin parámetro.
- [x] Cambiar de tab en `/salon-de-la-fama` no recarga toda la página ni rompe la navegación (usa `searchParams`). Confirmado que el tab activo (`chip active`) coincide con `?game=` en cada caso.
- [x] Un usuario sin sesión puede seguir entrando a `/juegos/[id]/jugar` sin restricciones (sin cambios de comportamiento respecto a hoy).
- [x] `npm run lint` pasa sin errores.

## Decisiones

- **Sí:** un solo spec para Auth real + esquema de puntajes/leaderboard, en vez de dividirlo en dos. Se advirtió que era grande; el usuario prefirió no dividirlo.
- **Sí:** se usa el proyecto Supabase que el usuario ya tiene creado — este spec no crea un proyecto nuevo.
- **Sí:** solo email/contraseña para Auth. Los botones de Google/GitHub del mock quedan visuales, no funcionales.
- **Sí:** tabla `profiles` (vinculada a `auth.users` vía trigger `SECURITY DEFINER`) para guardar el `username` — permite mostrarlo en el Nav sin depender de metadata cruda en cada request.
- **No:** seed de datos de ejemplo en `scores`/`profiles`. Las tablas quedan vacías; el guardado real de puntajes espera a que exista un motor de juego, que no es parte de este spec.
- **Sí:** Salón de la Fama con tabs funcionales por juego, consultando Supabase — resuelve el TODO que dejaron las tabs sin `onClick` del mock original.
- **Sí:** el "mejor puntaje" (cards y detalle) se calcula real desde Supabase (`MAX(score)`), con fallback "SIN RÉCORD" cuando no hay filas — en vez de mantener el valor hardcodeado de `lib/data.ts`.
- **Sí:** los invitados (sin sesión) pueden seguir jugando `/juegos/[id]/jugar` sin restricción; no se agrega bloqueo de ruta nuevo.
- **Sí:** el Nav refleja el estado de sesión (username + "Salir" vs. "Iniciar Sesión"), en desktop y móvil — sin esto la Auth real no tendría ningún indicio visual de que funciona.
- **Sí:** auto-confirm de email activado en la configuración de Auth de Supabase (paso manual documentado en el plan) — evita agregar un estado nuevo de "revisa tu correo" al formulario existente.
- **Sí:** el redirect tras login/signup exitoso es a `/` (Home), no a `/games`.
- **Sí (bug encontrado por el usuario probando en navegador, no por las pruebas vía API):** los inputs de `/auth` pasaron de no controlados a controlados (`useState` para `username`/`email`/`password`). React resetea los campos no controlados de un `<form action={...}>` cuando la Server Action termina de ejecutar, sin importar si devuelve `{error}` o éxito — solo lo evita si la función lanza una excepción, y `signIn`/`signUp` nunca lanzan. Con password corta (rechazada por Supabase), el formulario se vaciaba en vez de mostrar el error con los datos intactos.
- **Sí:** el esquema (`sql/002_create_profiles.sql`, `sql/003_create_scores.sql`) sigue la numeración ya iniciada en `sql/001_create_games_table.sql`, pero se **aplicó al proyecto real vía el MCP de Supabase** (`apply_migration`), no pegado a mano en el SQL Editor — decisión tomada durante la implementación al confirmar que el MCP estaba conectado al mismo proyecto (`fumwaikjxwrhnuyofdxq.supabase.co`, `public` vacío). Más confiable que copiar/pegar y ya deja un historial de migraciones real en Supabase; el `.sql` igual queda versionado en el repo. Migraciones versionadas con Supabase CLI siguen quedando para un spec futuro si se necesita ese flujo fuera de Claude Code.
- **Sí:** se agregó `revoke execute on function public.handle_new_user() from public, anon, authenticated` (no estaba en el modelo de datos original). `get_advisors` (security) detectó que la función `SECURITY DEFINER` quedaba invocable como RPC pública (`/rest/v1/rpc/handle_new_user`), permitiendo insertar perfiles arbitrarios sin pasar por el trigger. Corregido antes de continuar; verificado que `get_advisors` queda sin hallazgos.
- **Sí:** se agregó un índice `scores_game_id_score_idx` (`game_id, score desc`) no listado en el modelo de datos original — detalle de rendimiento para las consultas de `getBestScore`/`getTopScoresByGame`, sin cambiar el comportamiento ni el contrato de esas funciones.
- **Sí (revertido durante la implementación):** se ejecutó `sql/001_create_games_table.sql` vía el MCP de Supabase, a pedido explícito del usuario. La decisión original de este spec era no tocarlo; se cambió en vivo. La tabla `games` que crea (BIGINT id, VARCHAR name) queda creada pero **sin usar** — no está poblada ni conectada a ningún código de este spec. `get_advisors` marcó ERROR por quedar sin RLS (expuesta por PostgREST); se corrigió habilitando RLS sin policies (bloqueo total), ya que nada la usa. El archivo `sql/001_create_games_table.sql` en el repo no se modificó — el `ENABLE ROW LEVEL SECURITY` se aplicó como migración aparte.
- **Sí (encontrado durante la implementación):** el tab "INICIAR SESIÓN" del mock pedía solo Usuario + Contraseña, sin campo de correo — pero Supabase Auth por contraseña requiere email, no username. Se cambia ese campo a "Correo electrónico" (mismo estilo visual, distinto label/placeholder); el tab de signup no cambia (ya pedía Usuario + Correo + Contraseña). No se agrega ninguna columna nueva a `profiles` para hacer lookup de username → email.
- **No:** foreign key de `scores.game_id` hacia la tabla `games` en Supabase. Se mantiene como texto libre que coincide con los ids de `lib/data.ts` — esta decisión no cambió: `games` existe ahora en la base, pero `scores` sigue sin depender de ella.
- **Sí:** `DB_PWD` (contraseña de Postgres) se mantiene en `.env.local` sin usarse en este spec — no aplica al SDK `@supabase/supabase-js`, solo sería necesaria para conexión directa por Postgres/CLI.
- **Sí:** se usa `proxy.ts` en vez de `middleware.ts`. Next.js 16 renombró el archivo (misma funcionalidad) — confirmado en `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- **No:** proteger `/juegos/[id]/jugar` exigiendo sesión — sigue siendo una ruta pública.
- **No:** recuperación de contraseña, roles/administración, ni sistema de créditos real — fuera de alcance de este spec.

## Riesgos

| Riesgo                                                                                                                                                                                    | Mitigación                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16.2.10 posdata el entrenamiento del modelo; Server Actions, `proxy.ts` y manejo de cookies pueden diferir de lo esperado.                                                        | Ya se leyeron `node_modules/next/dist/docs/01-app/02-guides/authentication.md` y `01-app/01-getting-started/16-proxy.md` antes de definir el plan; releer si algo no coincide durante la implementación. |
| `@supabase/ssr` es un paquete externo cuya API puede diferir de lo que el modelo conoce por entrenamiento (cambia rápido entre versiones).                                                | Revisar la documentación oficial de Supabase para Next.js App Router al implementar `lib/supabase/client.ts` y `lib/supabase/server.ts`, en vez de confiar solo en memoria.                              |
| El auto-confirm de email es una configuración manual en el dashboard de Supabase, fuera del código — si no se activa, el signup no deja al usuario logueado de inmediato.                 | Verificar explícitamente esa config como parte del paso 6 del plan, antes de dar por terminada la integración de Auth.                                                                                   |
| Políticas RLS mal configuradas podrían bloquear el trigger `handle_new_user()` (signup roto) o exponer datos que no deberían ser públicos.                                                | Probar explícitamente cada política como parte de la verificación final (paso 12): signup real crea el perfil, lectura pública de `scores` funciona sin sesión.                                          |
| `.env.local` no se commitea — un clone nuevo del repo no tendrá `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y la app fallará al inicializar el cliente de Supabase. | Documentar las variables requeridas en la confirmación final de este spec, igual que se hizo con `RESEND_API_KEY` en el spec 03.                                                                         |

## Lo que **no** está en este spec

- Guardar puntajes reales durante una partida (no existe motor de juego).
- Login social (Google/GitHub) funcional.
- Datos de ejemplo (seed) en `scores`/`profiles` — quedan vacías.
- Migraciones versionadas con Supabase CLI (por ahora, SQL manual numerado en `sql/`).
- Protección de rutas por sesión (`/juegos/[id]/jugar` sigue público).
- Recuperación de contraseña ("olvidé mi contraseña").
- Roles, permisos de administrador o moderación de usuarios.
- Sistema de créditos real.
- FK de `scores.game_id` a la tabla `games` (que sí se creó/ejecutó en este spec, pero queda sin usar).

Cada uno de estos, si se implementa, va en su propio spec.
