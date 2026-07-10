# SPEC 02 — Home separado de Biblioteca

> **Estado:** Implementado
> **Depende de:** 01-mvp-visual
> **Fecha:** 2026-07-10
> **Objetivo:** Separar la ruta `/` (que hoy muestra la Biblioteca de juegos) en dos pantallas: un Home tipo landing en `/` portado de `references/templates/home-about/home.jsx`, y la Biblioteca de juegos movida a una nueva ruta `/games`.

## Alcance

**Incluye:**

- Nuevo Home en `/` portado de `references/templates/home-about/home.jsx`: hero con `FloatingSilhouettes`, sección "¿Por qué Arcade Vault?" (feature grid), vitrina de juegos (mini-rail con 6 juegos de `GAMES`), bloque de stats, "Actividad en Vivo" (ticker de puntuaciones + top jugadores, contenido hardcodeado fiel al template), sección de precios y CTA final.
- Animaciones scroll-reveal (`useReveal` / `IntersectionObserver`) portadas fielmente como comportamiento de client component.
- Biblioteca actual (hero "ARCADE VAULT", buscador y chips no funcionales, grilla de `GameCard`) movida tal cual, sin cambios de contenido, de `app/page.tsx` a `app/games/page.tsx`.
- CSS necesario portado de `references/templates/home-about/styles.css` a `app/globals.css` (clases `home-hero`, `home-title`, `feature-grid`, `mini-rail`/`mini-card`, `home-stats`, `activity-grid`/`ticker`/`top-list`, `pricing-grid`, `home-final`, `home-silos`, etc.).
- `components/nav.tsx` actualizado: nuevo link "Inicio" → `/` (nav de escritorio y menú móvil); "Biblioteca" → `/games`; estado activo: "Inicio" solo en `/` exacto, "Biblioteca" activo en `/games` y en cualquier `/juegos/*` (detalle y reproductor).
- CTAs del Home enlazados a rutas reales: "EXPLORAR JUEGOS", "VER TODOS LOS JUEGOS →" e "INSERTAR MONEDA →" → `/games`; "CREAR CUENTA" y "EMPEZAR GRATIS →" → `/auth`; tarjetas del mini-rail → `/juegos/[id]`; "VER SALÓN →" → `/salon-de-la-fama`.
- Bloque de stats "JUEGOS" calculado desde `GAMES.length` (`${GAMES.length}+`) en vez de hardcodear "12+" del template, para que no quede desincronizado del catálogo real.

**Fuera de alcance (para futuros specs):**

- Página "Acerca de" (`about.jsx` / `/acerca-de`) con su formulario de contacto.
- Hacer funcional el buscador, los chips de categoría o cualquier filtrado (sigue igual que en spec 01).
- Datos reales para el ticker de actividad y el top de jugadores del Home — quedan como mock hardcodeado, sin conexión a `lib/data.ts` ni a backend.
- Sistema de créditos, sesión de usuario o cualquier lógica de autenticación real.
- Cambios de contenido o diseño en Detalle, Reproductor, Auth o Salón de la Fama.

## Modelo de datos

Este spec no introduce estructuras de datos nuevas. El Home consume `GAMES` ya existente en `lib/data.ts` (para el mini-rail y el cálculo de `GAMES.length`); el resto del contenido (features, stats, ticker de actividad, top jugadores, pricing) queda hardcodeado directamente en el componente, igual que en el template de referencia.

## Plan de implementación

1. Crear `app/games/page.tsx` con el contenido exacto que hoy tiene `app/page.tsx` (hero "ARCADE VAULT", buscador/chips, grilla de `GameCard`), sin cambios. `app/page.tsx` queda intacto por ahora. Test manual: `/games` muestra la Biblioteca completa, idéntica a la actual `/`.
2. Portar a `app/globals.css` las clases de `references/templates/home-about/styles.css` necesarias para el Home (`home-hero`, `home-silos` y sus `svg .silo`, `feature-grid`/`feature-card`, `mini-rail`/`mini-card`, `home-stats`/`stat-block`, `activity-grid`/`ticker`/`top-list`, `pricing-grid`/`price-card`/`pricing-faq`, `home-final`, clases `reveal`/`in` y sus animaciones). Test manual: `npm run lint` pasa; sin cambios visuales todavía porque nada las usa aún.
3. Reemplazar `app/page.tsx` por el nuevo Home: client component con `useReveal` (IntersectionObserver), `FloatingSilhouettes`, `FeatureIcon`, sección hero, "¿Por qué Arcade Vault?", vitrina de juegos (`GAMES.slice(0, 6)` enlazando a `/juegos/[id]`), stats (`${GAMES.length}+` juegos), "Actividad en Vivo" (ticker y top jugadores hardcodeados), precios y CTA final — con los botones enlazando a `/games`, `/auth` y `/salon-de-la-fama` según corresponda. Test manual: `npm run dev`, `/` muestra el hero y, al hacer scroll, cada sección aparece con la animación reveal; los CTAs navegan a las rutas correctas.
4. Actualizar `components/nav.tsx`: agregar link "Inicio" → `/` (activo solo en `/` exacto) en el nav de escritorio y en el panel móvil; cambiar el link "Biblioteca" para que apunte a `/games` y su estado activo cubra `/games` y cualquier ruta que empiece con `/juegos`. Test manual: el nav muestra Inicio / Biblioteca / Salón de la Fama / Iniciar Sesión; "Inicio" se resalta solo en `/`, "Biblioteca" se resalta en `/games`, `/juegos/[id]` y `/juegos/[id]/jugar`.
5. Verificación final de navegación cruzada: Inicio → Biblioteca (`/games`) → Detalle → Reproductor → Salir → Salón de la Fama → Auth → Inicio, y `npm run lint`. Test manual: recorrer las rutas sin enlaces rotos ni errores en consola.

## Criterios de aceptación

- [X] `npm run dev` levanta la app sin errores en consola.
- [X] La ruta `/` muestra el nuevo Home: hero con silhouettes flotantes, sección "¿Por qué Arcade Vault?", vitrina de juegos, stats, "Actividad en Vivo", precios y CTA final.
- [X] Al hacer scroll en `/`, las secciones con clase `reveal` aparecen animadas (se les agrega `in` al entrar en viewport).
- [x] El bloque de stats muestra `${GAMES.length}+` (es decir "8+") en vez de un valor hardcodeado desincronizado del catálogo.
- [X] Los botones "EXPLORAR JUEGOS", "VER TODOS LOS JUEGOS →" e "INSERTAR MONEDA →" navegan a `/games`.
- [X] Los botones "CREAR CUENTA" y "EMPEZAR GRATIS →" navegan a `/auth`.
- [X] El botón "VER SALÓN →" navega a `/salon-de-la-fama`.
- [X] `/games` muestra la Biblioteca (hero "ARCADE VAULT", buscador/chips estáticos, grilla de 8 tarjetas) idéntica a la que hoy vive en `/`.
- [X] Cada tarjeta de `/games` enlaza a `/juegos/[id]` con el id correspondiente (sin cambios respecto al comportamiento actual).
- [X] El Nav (escritorio y menú móvil) muestra los links "Inicio", "Biblioteca", "Salón de la Fama" e "Iniciar Sesión".
- [X] El link "Inicio" del Nav navega a `/` y se resalta solo cuando la ruta activa es `/` exacto.
- [X] El link "Biblioteca" del Nav navega a `/games` y se resalta en `/games`, `/juegos/[id]` y `/juegos/[id]/jugar`.
- [X] El menú hamburguesa móvil sigue abriendo/cerrando correctamente e incluye el nuevo link "Inicio".
- [X] `npm run lint` pasa sin errores.

## Decisiones

- **Sí:** la Biblioteca se mueve a `/games` (inglés), tal como lo pidió el usuario, aunque rompe la convención en español del resto de rutas (`/juegos/[id]`, `/salon-de-la-fama`, `/auth`). Decisión explícita del usuario tras advertir la inconsistencia.
- **No:** usar `/juegos` para la nueva ruta de Biblioteca (habría sido consistente con el resto de rutas). Descartado por preferencia explícita del usuario.
- **No:** portar `about.jsx` (`/acerca-de`) en este spec. Se deja fuera para mantener el spec enfocado en separar Home de Biblioteca; se implementará en un spec futuro.
- **Sí:** portar las animaciones scroll-reveal (`useReveal`/`IntersectionObserver`) y el contenido hardcodeado del ticker de actividad y top jugadores tal como están en el template, como mockup estático — mismo criterio de fidelidad visual que el spec 01.
- **Sí:** agregar el link "Inicio" al Nav (escritorio y móvil), activo solo en `/` exacto. El template ya lo incluye y el Home ahora es una pantalla real distinta de Biblioteca.
- **Sí:** el link "Biblioteca" del Nav se considera activo tanto en `/games` como en cualquier `/juegos/*` (detalle, reproductor), igual que el comportamiento previo a este cambio, porque esas pantallas son parte del mismo flujo de "ver/jugar un juego".
- **Sí:** el stat de "JUEGOS" en el Home se calcula como `${GAMES.length}+` en vez de copiar literalmente "12+" del template. Evita mostrar un número que no coincide con el catálogo real de 8 juegos.
- **No:** conectar el ticker de "Actividad en Vivo" o el "Top Jugadores" a datos reales de `lib/data.ts` o a un backend. Sigue siendo contenido de ejemplo, igual que el resto del MVP.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Next.js 16.2.10 posdata el entrenamiento del modelo; convenciones de rutas, client/server boundaries y layouts pueden diferir de lo esperado. | Leer `node_modules/next/dist/docs/01-app/` antes de implementar `/games` y el nuevo Home, como indica `AGENTS.md`. |
| La mezcla de rutas en inglés (`/games`) y español (`/juegos/[id]`, `/salon-de-la-fama`) puede confundir a futuros desarrolladores o usuarios que naveguen por URL directa. | Documentado explícitamente en Decisiones; si en el futuro se decide unificar, será un spec de renombrado de rutas aparte. |
| El hook `useReveal` usa `IntersectionObserver` en el cliente; si se marca mal el límite server/client (`"use client"` faltante o mal ubicado), puede romper el build o el SSR del resto del árbol. | Aislar la lógica de reveal en un componente/hook cliente explícito dentro del nuevo `app/page.tsx`, sin convertir `app/layout.tsx` en client component. |

## Lo que **no** está en este spec

- Página "Acerca de" (`about.jsx` / `/acerca-de`).
- Buscador, chips de categoría o filtrado funcionales en Biblioteca.
- Datos reales para actividad en vivo / top jugadores.
- Sistema de créditos o sesión de usuario real.
- Cambios en Detalle, Reproductor, Auth o Salón de la Fama.

Cada uno de estos, si se implementa, va en su propio spec.
