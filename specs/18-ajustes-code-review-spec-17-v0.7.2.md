# SPEC 18 — Ajustes del code review del spec 17

> **Estado:** Aprobado

> **Depende de:** 17-correcciones-auditoria-seguridad-v0.7.1 (`safeNext`, `signUp`, `/api/contact`, `server-only`)
> **Fecha:** 2026-11-02
> **Versión:** 0.7.1 → 0.7.2 (patch: correcciones chicas, sin funcionalidad nueva)
> **Objetivo:** Corregir los 5 hallazgos accionables del `/code-review` sobre el merge del spec 17 (`695540e`): un comentario engañoso, un `server-only` faltante, un mensaje de error que señala el campo equivocado, caracteres de control en el asunto del correo y un chequeo muerto en `safeNext`.

## Contexto

El 2026-11-02, después del merge del PR #32, se corrió `/code-review` sobre `695540e` y devolvió 7 hallazgos. Ninguno es grave. Cinco entran en este spec:

| #   | Dónde                            | Hallazgo                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `app/actions/auth.ts:77-79`      | El comentario de la rama `user_already_exists` dice que "cubre el caso de que se vuelva a apagar" Confirm email. No es cierto: con autoconfirm, un correo nuevo recibe sesión y redirige, y uno existente ve "REVISA TU CORREO". La diferencia sigue revelando la cuenta (ver Decisiones del spec 17). |
| 2   | `lib/email.ts`                   | Lee `RESEND_API_KEY` y crea el cliente de Resend, pero no importa `server-only`. El spec 17 lo agregó solo a `admin.ts` y `pwned-password.ts`.                                                                                                                                                         |
| 3   | `app/api/contact/route.ts:30-36` | Un correo de más de 254 caracteres devuelve "Máximo 100 caracteres en el nombre y 5000 en el mensaje.", que no menciona el campo que falló.                                                                                                                                                            |
| 4   | `app/api/contact/route.ts:24`    | `name` solo se recorta en los extremos: acepta `\r`, `\n` y otros caracteres de control, y va directo al asunto del correo (`Nuevo mensaje de contacto de ${name}`).                                                                                                                                   |
| 5   | `lib/auth-errors.ts:78`          | `out.startsWith("/\\")` nunca se cumple: el parser WHATWG convierte toda `\` del path de una URL http(s) en `/`, así que `url.pathname` nunca tiene una barra invertida. Es código muerto que sugiere un riesgo que no existe en ese punto.                                                            |

Los otros dos hallazgos ya eran conocidos y quedan fuera (ver **No incluye**).

## Alcance

**Incluye:**

- **Comentario honesto en `signUp`** (`app/actions/auth.ts`): la rama `user_already_exists` solo evita mostrar "ese correo ya tiene una cuenta". La neutralidad real depende de que "Confirm email" esté activo en Supabase, y el comentario lo dice. El código no cambia.
- **`import "server-only"`** en la primera línea de `lib/email.ts`.
- **Un mensaje por campo en `/api/contact`:** el chequeo de largo se separa y cada campo devuelve su propio mensaje: "El nombre puede tener hasta 100 caracteres.", "El correo puede tener hasta 254 caracteres." y "El mensaje puede tener hasta 5000 caracteres.".
- **Sin caracteres de control en `name`:** si `name` contiene caracteres de control (`/[\u0000-\u001F\u007F]/`, incluidos `\r`, `\n` y `\t`), la ruta responde `400` con "El nombre no puede tener saltos de línea ni caracteres especiales.". `message` sigue aceptando saltos de línea, porque va en el cuerpo y no en un header. `email` ya los rechaza, porque `EMAIL_RE` excluye `\s`.
- **`safeNext` sin el chequeo muerto** (`lib/auth-errors.ts`): queda solo `out.startsWith("//")`, y el comentario explica que en ese punto `\` ya se convirtió en `/`.
- **Documentación:** `package.json` 0.7.2, `CHANGELOG.md`, bitácora y lecciones en este spec.

**No incluye** (hallazgos ya conocidos):

- **Enumeración de _usernames_ en el registro** ("Ese usuario ya está en uso."): es el H8 de la auditoría del 2026-10-25, aceptado como informativo porque los usernames son públicos en el ranking y en el Nav.
- **`callbackUrl()` con el header `Origin`:** es el H7, y se resuelve con un `SITE_URL` fijo en un spec de producción. El code review señala, con razón, que con "Confirm email" este enlace va en cada correo de registro. Hasta ese spec, la defensa es la lista de Redirect URLs de Supabase, que no debe tener comodines.

## Plan de implementación

1. ✅ **`safeNext` + comentario de `signUp`:**
   - `lib/auth-errors.ts`: sacar `|| out.startsWith("/\\")` y ajustar el comentario.
   - `app/actions/auth.ts`: reescribir el comentario de la rama `user_already_exists`.
   - Probar con el script del spec 17 (`safenext-test.ts`, en el scratchpad): las 33 verificaciones siguen OK, incluidas `"/\\evil.com"` y `"/../\\evil.com"`.
2. ✅ **`server-only` en `lib/email.ts`:** agregar el import y correr `npm run build`.
3. **`/api/contact`:**
   - Un mensaje por campo en el chequeo de largo.
   - Rechazar caracteres de control en `name`.
   - Probar con `curl`:
     - correo de 255 caracteres → mensaje del correo;
     - `name` con `\r\n`, con `\t` y con `\u0000` → 400;
     - `message` con saltos de línea → sigue pasando la validación;
     - los 9 casos del spec 17 siguen en 400.
   - No mandar correos reales.
4. **Cierre:** `npm run lint`, `npm run build`, `package.json` 0.7.2, `CHANGELOG.md`, bitácora y lecciones.

## Criterios de aceptación

- [ ] `safeNext` ya no tiene el chequeo `"/\\"`, y el script de 33 verificaciones del spec 17 sigue todo OK.
- [ ] El comentario de la rama `user_already_exists` en `signUp` no promete neutralidad sin "Confirm email".
- [ ] `lib/email.ts` importa `server-only`.
- [ ] `/api/contact` con un correo de más de 254 caracteres → `400` con un mensaje que nombra el correo. El nombre y el mensaje demasiado largos también dan cada uno su propio mensaje.
- [ ] `/api/contact` con `name` que tiene `\r`, `\n`, `\t` o `\u0000` → `400`; un `message` con saltos de línea no se rechaza por eso.
- [ ] Los 9 casos inválidos del spec 17 siguen respondiendo `400`.
- [ ] `npm run lint` y `npm run build` sin errores; `package.json` en 0.7.2 y entrada en `CHANGELOG.md`.

## Decisiones tomadas y descartadas

- **Hallazgo 1: corregir el comentario y no cambiar el flujo.** Para que el registro fuera neutral con autoconfirm, un alta nueva también tendría que mostrar "REVISA TU CORREO" en vez de entrar. Pero sin enlace de confirmación el jugador tendría que iniciar sesión a mano, y eso empeora la UX justo en el modo que ya no se usa. "Confirm email" está activo desde el spec 17 y es la defensa real.
- **Hallazgo 4: rechazar en vez de limpiar.** Sacar los caracteres de control en silencio cambiaría lo que escribió el usuario sin avisarle. Un nombre con saltos de línea no es un caso legítimo, así que alcanza con un `400` claro.
- **`message` puede tener saltos de línea:** va en el cuerpo de texto del correo, no en un header.

## Riesgos identificados

- **`server-only` en `lib/email.ts`:** si algún script de Node lo importa fuera de Next, va a fallar. Hoy no hay ninguno: solo lo importa `app/api/contact/route.ts`.
- **Mensajes nuevos en `/about`:** el formulario muestra `data.error` tal cual, así que los mensajes nuevos aparecen sin tocar la UI.

## Bitácora de soluciones

### Paso 1 — `safeNext` + comentario de `signUp` (2026-11-02)

- `lib/auth-errors.ts`: se sacó `|| out.startsWith("/\\")`. El comentario de `safeNext` suma una línea: alcanza con `"//"`, porque en ese punto el parser ya convirtió toda `\` del path en `/`.
- `app/actions/auth.ts`: el comentario de la rama `user_already_exists` ahora dice que solo oculta el mensaje, que la neutralidad depende de "Confirm email" y qué pasa si se apaga.
- Prueba: `npx tsx safenext-test.ts` (script del spec 17, en el scratchpad). Las 33 verificaciones siguen OK. Los 5 casos con `\` (`"/\\evil.com"`, `"/\\\\evil.com"`, `"/../\\evil.com"`, `"/.\\/evil.com"` y `"/./\\evil.com"`) siguen dando `"/"` sin el chequeo eliminado, lo que confirma que era código muerto.

### Paso 2 — `server-only` en `lib/email.ts` (2026-11-02)

- `lib/email.ts`: `import "server-only"` en la primera línea, igual que `admin.ts` y `pwned-password.ts` desde el spec 17.
- `npm run build`: OK, 11 rutas. El único importador es `app/api/contact/route.ts` (servidor). No se repitió la prueba negativa: es el mismo mecanismo que el spec 17 ya probó rompiendo el build.
