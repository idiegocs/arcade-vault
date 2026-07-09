# SPEC 01 — MVP visual de Arcade Vault

> **Estado:** Aprobado
> **Depende de:** (ninguno)
> **Fecha:** 2026-07-09
> **Objetivo:** Portar a Next.js App Router las cinco pantallas visuales de Arcade Vault (Biblioteca, Detalle, Reproductor, Auth y Salón de la Fama) del template estático en `references/templates/`, con navegación funcional entre rutas reales y datos mock, sin implementar lógica de juego real, sesión real ni backend.

## Alcance

**Incluye:**

- Las 5 pantallas del template portadas a rutas reales de Next.js App Router: Biblioteca (`/`), Detalle (`/juegos/[id]`), Reproductor (`/juegos/[id]/jugar`), Auth (`/auth`) y Salón de la Fama (`/salon-de-la-fama`).
- Componente `Nav` compartido (links de escritorio + menú hamburguesa móvil funcional) y footer, aplicados vía layout raíz a todas las rutas.
- Navegación totalmente funcional: links del nav, apertura/cierre del menú móvil, botones "JUGAR" / "JUGAR AHORA" / "VOLVER AL VAULT" / "SALIR", clic en el logo.
- Sistema visual completo (fuentes, variables CSS, fondo con grid/scanlines, botones neón, tarjetas, marco CRT, tablas de puntuaciones, podio) consistente con lo ya portado en `app/globals.css` y `app/layout.tsx`.
- Módulo de datos mock (catálogo de 8 juegos) portado desde `data.jsx` a TypeScript, consumido por Biblioteca, Detalle, Reproductor y Salón de la Fama.
- Función `seededScores` portada a TypeScript para generar leaderboards mock deterministas (mismos datos en cada carga).
- Portadas de juego generadas por CSS puro (gradientes/formas), sin imágenes.
- Biblioteca: buscador y chips de categoría visibles pero no funcionales (la grilla siempre muestra el catálogo completo).
- Salón de la Fama: pestañas de juego visibles pero no funcionales (la tabla siempre muestra el primer juego del catálogo).
- Reproductor: HUD con valores fijos de ejemplo, arena CRT animada como decoración ambiental; botones PAUSA y FIN visibles pero sin lógica; SALIR navega de vuelta a Detalle.
- Auth: formulario con campos editables; enviar, "JUGAR COMO INVITADO" y los botones de Google/GitHub no navegan ni guardan estado. El Nav siempre muestra el estado "sin sesión".
- Comportamiento responsive equivalente al template (colapso del nav en móvil, reflow de grilla/podio/tabla).

**Fuera de alcance (para futuros specs):**

- Juegos reales jugables (motor de juego, canvas, colisiones) para los 8 títulos.
- Backend/API real: sin rutas de API, sin base de datos, sin autenticación real.
- Sesión de usuario persistida (localStorage) y su reflejo dinámico en el Nav.
- Sistema de puntuaciones real (guardar/leer scores de usuarios).
- Multijugador o funciones sociales (amigos, chat, partidas en vivo).
- Assets de arte reales (imágenes/sprites) en lugar de las portadas CSS.
- Búsqueda, filtrado por categoría y cambio de pestaña funcionales en Biblioteca y Salón de la Fama.
- Contador de créditos funcional (queda como valor fijo "CRÉDITOS · 03").

## Modelo de datos

Se porta `references/templates/data.jsx` a TypeScript en `lib/data.ts`.

```ts
export type GameCategory = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export type Game = {
  id: string;           // slug usado en /juegos/[id]
  title: string;
  short: string;        // descripción corta (tarjeta)
  long: string;         // descripción larga (detalle)
  cat: GameCategory;
  cover: string;        // sufijo de clase CSS, p.ej. "cover-bricks"
  color: "cyan" | "magenta" | "yellow" | "green";
  best: number;
  plays: string;        // p.ej. "12.4K"
};

export const GAMES: Game[]; // los 8 juegos del template, sin cambios de contenido
export const CATEGORIES: readonly ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"];

export const PLAYERS: string[]; // ~18 nombres de jugador ficticios (p.ej. "PX_KAI", "NEONFOX"), portados del template

export type ScoreRow = { rank: number; name: string; score: number; date: string /* DD/MM/YYYY */ };

export function getSeededScores(seed: number, count?: number): ScoreRow[];
```

Convenciones:

- `Game.cover` referencia clases CSS ya definidas en `app/globals.css` (`.cover-bricks`, `.cover-tetro`, etc.); no se agregan portadas nuevas.
- `getSeededScores` es una función pura determinista (mismo `seed` produce siempre el mismo resultado): elige nombres de `PLAYERS` y genera `score`/`date` simulados, tal como `seededScores` en el template.
- No hay entidades persistidas (sin localStorage, sin API): todos los datos viven en memoria a partir de `lib/data.ts`.

## Plan de implementación

1. Crear `lib/data.ts` con el tipo `Game`, el arreglo `GAMES` (los 8 juegos portados de `data.jsx`), `CATEGORIES`, `PLAYERS`, el tipo `ScoreRow` y la función `getSeededScores`. Test manual: `npm run lint` pasa y el archivo compila sin errores de tipos.
2. Extraer `Nav` y el footer a `components/nav.tsx` (client component, usa `usePathname` para el estado activo y `useState` para el menú móvil) y montarlos en `app/layout.tsx` junto al fondo/tema ya existente. Test manual: `npm run dev`, la barra de navegación aparece en la home y el menú hamburguesa abre/cierra en una ventana angosta.
3. Completar `app/page.tsx` (Biblioteca) con el buscador y chips (estáticos), y la grilla de tarjetas (`GameCard`) leyendo `GAMES` de `lib/data.ts`. Test manual: la home muestra las 8 tarjetas con su portada CSS y el botón "JUGAR" navega a `/juegos/[id]`.
4. Crear `app/juegos/[id]/page.tsx` (Detalle): portada, tags, descripción, stat strip, acciones ("JUGAR AHORA" → `/juegos/[id]/jugar`, "VOLVER AL VAULT" → `/`) y leaderboard con `getSeededScores`. IDs inválidos devuelven 404 (`notFound()`). Test manual: `/juegos/bloque-buster` muestra el detalle completo; `/juegos/no-existe` muestra 404.
5. Crear `app/juegos/[id]/jugar/page.tsx` (Reproductor): HUD con valores fijos, arena CRT animada, botones PAUSA/FIN sin lógica, SALIR navega a `/juegos/[id]`. Test manual: la pantalla carga sin errores y SALIR regresa al detalle correcto.
6. Crear `app/auth/page.tsx` (Auth): tarjeta con tabs "Iniciar sesión" / "Crear cuenta" (el cambio de tab sí es funcional, solo alterna campos visibles), inputs editables; enviar, "JUGAR COMO INVITADO" y los botones de Google/GitHub no navegan ni persisten nada. Test manual: se puede escribir en los campos y cambiar de tab; ningún botón de envío cambia de pantalla.
7. Crear `app/salon-de-la-fama/page.tsx` (Salón de la Fama): tabs de juego (estáticos, siempre el primero de `GAMES`), podio top 3 y tabla completa con `getSeededScores`. Test manual: la pantalla muestra podio y tabla para el primer juego del catálogo.
8. Verificación final de navegación cruzada entre las 5 pantallas y `npm run lint`. Test manual: recorrer manualmente Biblioteca → Detalle → Reproductor → Salir → Auth → Salón de la Fama → Biblioteca sin rutas rotas.

## Criterios de aceptación

- [ ] `npm run dev` levanta la app sin errores en consola.
- [ ] La ruta `/` muestra el hero, el buscador/chips estáticos y una grilla con las 8 tarjetas de juego.
- [ ] Cada tarjeta de `/` enlaza a `/juegos/[id]` con el id correspondiente.
- [ ] `/juegos/[id]` muestra portada, tags, descripción, stat strip y leaderboard para cada uno de los 8 juegos.
- [ ] `/juegos/no-existe` devuelve una página 404.
- [ ] El botón "JUGAR AHORA" en Detalle navega a `/juegos/[id]/jugar`.
- [ ] `/juegos/[id]/jugar` muestra el HUD y la arena CRT animada, y los botones PAUSA/FIN no producen ningún cambio visible al hacer clic.
- [ ] El botón "SALIR" en Reproductor navega de vuelta a `/juegos/[id]`.
- [ ] `/auth` permite escribir en todos los campos y alternar entre las pestañas "Iniciar sesión" y "Crear cuenta".
- [ ] Ningún botón de envío, invitado o social en `/auth` navega ni cambia el estado del Nav.
- [ ] `/salon-de-la-fama` muestra el podio (top 3) y la tabla completa de puntuaciones del primer juego del catálogo.
- [ ] El Nav (links de escritorio y menú móvil) navega correctamente entre `/`, `/salon-de-la-fama` y `/auth` desde cualquier pantalla.
- [ ] El menú hamburguesa móvil abre y cierra correctamente en viewport angosto (<840px).
- [ ] El Nav siempre muestra el botón "Iniciar Sesión" (nunca un estado de sesión iniciada).
- [ ] `npm run lint` pasa sin errores.

## Decisiones

- **Sí:** rutas reales en español (`/`, `/juegos/[id]`, `/juegos/[id]/jugar`, `/auth`, `/salon-de-la-fama`) en vez del router por hash del template. Encaja con las convenciones de Next.js App Router y con el idioma del resto de la app.
- **No:** esquema de rutas en inglés. Descartado por preferencia del usuario y consistencia con el contenido en español.
- **Sí:** Reproductor como placeholder estático (HUD con valores fijos, sin simulación de score ni modal de fin de juego). El MVP es explícitamente "sin juego real"; simular una partida falsa seguiría siendo lógica de juego.
- **No:** replicar el guardado de puntuación en `localStorage` al terminar una partida, como hace el template. Descartado por la misma razón — es parte de la simulación de juego que queda fuera de alcance.
- **Sí:** Auth completamente estático (sin `localStorage`, sin navegación al enviar). Evita simular un sistema de sesión que todavía no existe; el Nav no necesita reflejar estado de usuario en este MVP.
- **No:** persistir sesión de usuario en `localStorage` como el template. Se deja para un spec futuro cuando haya backend real.
- **Sí:** navegación (nav de escritorio, menú móvil, botones de ruta) totalmente funcional. Sin esto la app sería inutilizable en móvil y no cumpliría su propósito de MVP navegable.
- **No:** dejar el menú móvil sin funcionar. Descartado tras confirmar que rompería la navegación en pantallas angostas.
- **Sí:** buscador, chips de categoría y pestañas del Salón de la Fama como mockup estático (sin filtrar). El usuario prefirió minimizar el estado/lógica de UI que no sea navegación pura.
- **Sí:** `getSeededScores` portada tal cual del template (determinista). Mantiene fidelidad visual sin necesitar datos reales.
- **No:** portadas de juego con imágenes o assets reales. Se mantienen los gradientes CSS del template (`cover-bricks`, `cover-tetro`, etc.).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Next.js 16.2.10 posdata el entrenamiento del modelo; las convenciones de rutas dinámicas (`params`, layouts, client/server boundaries) pueden diferir de lo esperado. | Leer `node_modules/next/dist/docs/01-app/` antes de implementar cada ruta, como indica `AGENTS.md`. |
| `Nav` necesita saber la ruta activa (`usePathname`) y manejar el estado del menú móvil, lo que lo obliga a ser client component; si por error se marca `app/layout.tsx` completo como client, se pierde SSR en el resto del árbol. | Mantener `app/layout.tsx` como server component y aislar la interactividad solo dentro de `components/nav.tsx`. |

## Lo que **no** está en este spec

- Juegos reales jugables (motor de juego, canvas, colisiones).
- Backend/API real, base de datos, autenticación real.
- Sesión de usuario persistida y su reflejo dinámico en el Nav.
- Sistema de puntuaciones real.
- Multijugador o funciones sociales.
- Assets de arte reales (imágenes/sprites).
- Búsqueda, filtrado y cambio de pestaña funcionales en Biblioteca y Salón de la Fama.
- Contador de créditos funcional.

Cada uno de estos, si se implementa, va en su propio spec.
