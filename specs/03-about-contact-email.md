# SPEC 03 — Página About y envío de contacto por correo

> **Estado:** Implementado
> **Depende de:** 02-home-games-split
> **Fecha:** 2026-07-10
> **Objetivo:** Portar `about.jsx` del template de referencia a una nueva ruta `/about` con un formulario de contacto funcional que envía el mensaje por correo real usando la API de Resend, con la API key y el correo destinatario configurables por variables de entorno.

## Alcance

**Incluye:**

- Nueva ruta `/about` (`app/about/page.tsx`): client component portado de `references/templates/home-about/about.jsx` — hero ("ACERCA DE ARCADE VAULT" + misión), fila de 3 highlights con iconos (corazón, browser, planta), banner divisor animado, y sección de contacto (kicker, título, texto, tips) con el formulario.
- CSS portado de `references/templates/home-about/styles.css` a `app/globals.css`: clases `.about`, `.about-hero`, `.about-title`, `.about-mission`, `.highlight-row`, `.about-divider`, `.about-contact`, `.contact-grid`, `.contact-intro`, `.contact-tips`, `.contact-form`, `.terminal-success`, etc.
- `components/nav.tsx` actualizado: nuevo link **"Acerca de"** → `/about` (nav de escritorio y menú móvil), texto en español siguiendo la convención del resto del Nav; estado activo cuando `pathname === "/about"`.
- Lógica de envío de correo desacoplada en una función propia — `lib/email.ts` con `sendContactEmail({ name, email, message })` — que instancia el cliente de `resend` y hace el envío; esta función no sabe nada de HTTP/Next.
- Route Handler `app/api/contact/route.ts` (`POST`) delgado: valida el body de la request y delega el envío a `sendContactEmail(...)`, devolviendo `200`/`4xx`/`5xx` según el resultado. Lee `RESEND_API_KEY` y `CONTACT_EMAIL` desde variables de entorno.
- Formulario de contacto con estados reales: validación de campos vacíos (igual que el template, con el "shake"), luego estado de **enviando…** mientras se espera la respuesta de `/api/contact`, estado de **éxito** (terminal de la referencia) si Resend confirma el envío, y estado de **error** visible con botón de reintento si falla — sin perder lo que el usuario ya escribió.
- `.env.local` (gitignorado por la regla existente `.env*`) con `RESEND_API_KEY=<redactado, ver .env.local local>` y `CONTACT_EMAIL=idiegocs@gmail.com`.

**Fuera de alcance (para futuros specs):**

- Correo de confirmación automático al remitente del formulario (decisión explícita: solo llega al `CONTACT_EMAIL`).
- Protección anti-spam / rate limiting / captcha en el formulario.
- Persistencia de los mensajes de contacto en base de datos.
- Verificación de dominio propio en Resend (se usa el remitente sandbox `onboarding@resend.dev`).
- Validación de formato de correo más allá de "campo no vacío" (igual que el template original).
- Cambios de contenido o diseño en Home, Biblioteca, Detalle, Reproductor, Auth o Salón de la Fama.

## Modelo de datos

Este spec no introduce entidades persistentes (nada se guarda en base de datos), pero sí define el contrato entre el formulario y el Route Handler:

**Request** — `POST /api/contact`

```ts
{
  name: string;
  email: string;
  message: string;
}
```

**Response — éxito** (`200`)

```ts
{ ok: true }
```

**Response — error** (`400` si faltan campos, `500` si falla el envío por Resend)

```ts
{ ok: false; error: string }
```

**`sendContactEmail` (`lib/email.ts`)**

```ts
function sendContactEmail(input: { name: string; email: string; message: string }): Promise<void>
```

Lanza si el envío falla; el Route Handler captura el error y traduce a la respuesta `{ ok: false, error }`.

## Plan de implementación

1. Instalar la dependencia `resend` (`npm install resend`) y crear `.env.local` (gitignorado) con `RESEND_API_KEY` y `CONTACT_EMAIL=idiegocs@gmail.com`. Test manual: `npm run dev` sigue levantando sin errores.
2. Crear `lib/email.ts` con `sendContactEmail({ name, email, message })`: instancia `new Resend(process.env.RESEND_API_KEY)` y llama `resend.emails.send(...)` con remitente `onboarding@resend.dev`, destinatario `process.env.CONTACT_EMAIL`, asunto por defecto y cuerpo de texto con nombre/correo/mensaje. No depende de Next ni de `Request`/`Response`.
3. Crear `app/api/contact/route.ts` con `POST(request: Request)`: parsea el JSON, valida `name`/`email`/`message` no vacíos (`400` si falta alguno), delega en `sendContactEmail`, responde `{ ok: true }` (`200`) o `{ ok: false, error }` (`500`) si Resend falla. Test manual: `curl -X POST http://localhost:3000/api/contact` con JSON válido → llega el correo real a `idiegocs@gmail.com`; con campos vacíos → `400`.
4. Portar a `app/globals.css` las clases `.about*`, `.contact*`, `.terminal-success` de `references/templates/home-about/styles.css`. Test manual: `npm run lint` pasa; sin cambios visuales porque nada las usa aún.
5. Crear `app/about/page.tsx`: client component portado de `about.jsx` (hero, highlights, divider, sección de contacto con formulario). Test manual: `npm run dev`, ir a `/about`, ver hero/highlights con animaciones reveal.
6. Conectar el submit del formulario a `POST /api/contact` con estados `idle | sending | sent | error`: en `sending` deshabilita el botón y muestra "ENVIANDO…"; en `sent` muestra el terminal de éxito del template; en `error` muestra mensaje de error + botón de reintento que vuelve a `idle` sin perder lo escrito. Test manual: enviar el formulario con datos válidos y confirmar que llega el correo real; forzar un error (ej. key inválida temporal) y confirmar que se ve el estado de error sin perder los datos.
7. Actualizar `components/nav.tsx`: agregar link **"Acerca de"** → `/about` en nav de escritorio y panel móvil, activo solo en `/about`. Test manual: aparece en ambos menús, se resalta solo en `/about`.
8. Verificación final: recorrer la navegación completa incluyendo `/about`, confirmar el envío real end-to-end, y correr `npm run lint`. Test manual: sin errores de consola, sin enlaces rotos, lint limpio.

## Criterios de aceptación

- [X] `npm run dev` levanta la app sin errores en consola.
- [X] La ruta `/about` muestra el hero "ACERCA DE ARCADE VAULT", la misión, la fila de 3 highlights, el banner divisor y la sección de contacto, con animaciones `reveal` al hacer scroll.
- [X] El link **"Acerca de"** aparece en el Nav de escritorio y en el menú móvil, apunta a `/about`, y se resalta solo cuando la ruta activa es `/about`.
- [X] Enviar el formulario con nombre, correo y mensaje válidos hace `POST /api/contact` y llega un correo real a la dirección definida en `CONTACT_EMAIL` (`idiegocs@gmail.com`), con asunto por defecto y el contenido del formulario.
- [X] Mientras se espera la respuesta del API, el formulario muestra un estado de "enviando…" y el botón de submit queda deshabilitado.
- [X] Si el envío es exitoso, se muestra el estado de éxito (terminal `VAULT-OS`) con el nombre de quien envió el mensaje.
- [X] Si el envío falla (ej. Resend responde error o la red falla), se muestra un estado de error visible con botón de reintento, y los datos escritos por el usuario no se pierden.
- [X] Enviar el formulario con campos vacíos mantiene el comportamiento de validación actual (shake, sin enviar nada).
- [X] `POST /api/contact` con campos faltantes responde `400`; con envío exitoso responde `200 { ok: true }`; con fallo de Resend responde `500 { ok: false, error }`.
- [X] `RESEND_API_KEY` y `CONTACT_EMAIL` se leen desde variables de entorno (`.env.local`), no están hardcodeadas en el código, y `.env.local` no queda trackeado por git.
- [X] La lógica de envío vive en `lib/email.ts` (`sendContactEmail`), separada del Route Handler.
- [X] `npm run lint` pasa sin errores.

## Decisiones

- **Sí:** la ruta es `/about` (inglés), no `/acerca-de`, aunque rompe la convención en español del resto de rutas — misma situación que `/games` en el spec 02. Decisión explícita del usuario.
- **Sí:** el texto visible del link en el Nav es **"Acerca de"** (español), siguiendo la convención de labels del resto del Nav, aunque la ruta/código estén en inglés — mismo patrón que "Biblioteca" → `/games`.
- **Sí:** la key de Resend y el correo destinatario se guardan en `.env.local` (variables de entorno), no hardcodeadas ni committeadas a git. Decisión explícita tras discutir el riesgo de exponer la key en el historial de git.
- **Sí:** el destinatario del correo (`CONTACT_EMAIL`) es configurable por variable de entorno, no hardcodeado en el código — para no atar el spec a una dirección fija.
- **Sí:** se usa el remitente sandbox `onboarding@resend.dev` (opción por defecto de Resend), en vez de un dominio propio verificado.
- **Sí:** la lógica de envío (`sendContactEmail`) vive desacoplada en `lib/email.ts`, separada del Route Handler — para que no dependa de `Request`/`Response` de Next y sea más fácil de testear o reemplazar a futuro.
- **No:** enviar correo de confirmación automático al remitente del formulario. Solo se notifica a `CONTACT_EMAIL`.
- **No:** agregar protección anti-spam, rate limiting o captcha al formulario — queda fuera de este spec.
- **No:** persistir los mensajes de contacto en base de datos — el correo es el único registro.
- **No:** agregar validación de formato de correo más allá de "campo no vacío" — se mantiene el comportamiento del template original.
- **Quick note:** la API key inicial venía de `references/apk.txt` (redactada de este documento porque el spec queda commiteado a git; el valor real solo vive en `.env.local`); el `1` al inicio de esa línea era un artefacto de formato, no parte de la key.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Resend en modo sandbox (sin dominio verificado) solo permite enviar a la dirección de correo con la que se registró la cuenta de Resend. Si `CONTACT_EMAIL` no coincide exactamente con esa dirección, el envío falla. | Verificar en el paso 3 del plan (prueba con `curl`) que el correo llega realmente antes de dar por terminada la integración; si falla, confirmar con el usuario cuál es el correo verificado en la cuenta de Resend. |
| `.env.local` no se commitea, así que un clone nuevo del repo no tendrá `RESEND_API_KEY`/`CONTACT_EMAIL` y el formulario fallará silenciosamente en `500`. | El estado de error del formulario (paso 6) hace visible el fallo en vez de fallar en silencio; documentar las variables requeridas en la confirmación final de este spec. |
| Next.js 16.2.10 posdata el entrenamiento del modelo; convenciones de Route Handlers, client components y layouts pueden diferir de lo esperado. | Ya se leyó `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` antes de definir el plan; releer si algo no coincide durante la implementación. |
| El componente de `/about` usa `IntersectionObserver` en cliente (`useReveal`); si el límite `"use client"` se marca mal, puede romper el build o el SSR del resto del árbol. | Aislar la lógica de reveal dentro del client component de `app/about/page.tsx`, igual que se hizo en el spec 02 para el Home. |

## Lo que **no** está en este spec

- Correo de confirmación automático al remitente del formulario.
- Protección anti-spam, rate limiting o captcha.
- Persistencia de mensajes de contacto en base de datos.
- Verificación de dominio propio en Resend.
- Validación de formato de correo más allá de "campo no vacío".
- Cambios en Home, Biblioteca, Detalle, Reproductor, Auth o Salón de la Fama.

Cada uno de estos, si se implementa, va en su propio spec.
