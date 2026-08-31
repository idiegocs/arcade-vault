# SPEC 05 — Motor real del juego ROCAS (Asteroids)

> **Estado:** Implementado
> **Depende de:** 04-supabase-auth-scores
> **Fecha:** 2026-08-31
> **Objetivo:** Portar el juego Asteroids de `references/started-games/02-asteroids` como motor real del juego "rocas" en `/juegos/rocas/jugar`, integrado con el HUD en vivo, pausa y modal de fin de partida de la plataforma, con guardado real de la puntuación en Supabase cuando hay sesión activa.

## Alcance

**Incluye:**

- `components/games/game-engine.ts`: contrato compartido (tipos, sin lógica) — `ARENA_WIDTH = 800`, `ARENA_HEIGHT = 600`, `EnginePhase`, `EngineState` (`score`, `lives`, `level`, `phase`, `badge?: { label, value }` para un indicador extra opcional del juego, ej. el "3x" del power-up), `EngineHandle` (`start/pause/resume/endGame/restart/destroy`), `EngineFactory = (canvas, onState) => EngineHandle` y `EngineLoader = () => Promise<EngineFactory>`. Cualquier juego futuro implementa este mismo contrato.
- `components/games/README.md`: receta explícita para agregar un juego nuevo:
  1. Crear `components/games/<id>/` con un motor que exporte una función que cumpla `EngineFactory` (de `../game-engine`). El `<id>` es el mismo `id` ya definido en `GAMES` (`lib/data.ts`) — no se inventa uno nuevo.
  2. El motor dibuja sobre `ARENA_WIDTH × ARENA_HEIGHT`, llama a `onState(...)` solo cuando el valor mostrado realmente cambia (no en cada frame de `requestAnimationFrame`), y su `destroy()` limpia todos sus propios listeners/timers/RAF.
  3. Agregar una línea en `components/games/registry.ts` usando `import()` dinámico (no un import estático arriba del archivo) — así el motor de un juego nuevo no se descarga en las páginas de los demás juegos.
- `components/games/game-player-shell.tsx`: componente cliente genérico y reutilizable — monta el `<canvas>` (800×600 interno, escalado por CSS al 100% de `.crt-screen`), recibe un `loadEngine: EngineLoader` por prop y hace `await loadEngine()` en un `useEffect` (mostrando "CARGANDO…" mientras se descarga el chunk) antes de instanciar el motor. Resuelve todo lo independiente del juego:
  - `player-hud` en vivo (Jugador/Puntuación/Vidas/Nivel + `badge` si el motor lo manda) — sale siempre de `EngineState`, nunca hardcodeado.
  - PAUSA/REANUDAR real (detiene y retoma el loop de update) con overlay "EN PAUSA".
  - FIN: fuerza `endGame()` con el score actual, sin esperar a perder las 3 vidas.
  - Modal de fin de partida (`.modal-bd`/`.modal` existentes): puntuación final; si hay `username` (sesión activa), dispara `saveScore(gameId, score)` automáticamente al entrar a `phase: "gameover"` (una sola vez por partida, con bandera que se resetea en `restart()`), mostrando "GUARDANDO…" → toast "PUNTUACIÓN GUARDADA", o el error + botón "REINTENTAR" si falla; si no hay `username`, muestra una CTA con link a `/auth` en vez de guardar. Acciones "JUGAR DE NUEVO" (`restart()`) / "VOLVER AL VAULT" (`/juegos/<id>`).
  - Ningún juego futuro necesita tocar este archivo.
- `components/games/rocas/asteroids-engine.ts`: motor de Asteroids portado de `references/started-games/02-asteroids/game.js` (mismas clases y balance: `Bullet`, `Asteroid`, `PowerUp`, `Ship`, `Particle`, tamaños/velocidades/puntos de asteroides, power-up 3x, 3 vidas, niveles), coordenadas sobre `ARENA_WIDTH`/`ARENA_HEIGHT`, implementando `EngineFactory`. Sin `drawHUD` propio (vive en el shell) y sin overlay/reinicio nativo por Espacio (lo maneja el shell vía `phase: "gameover"`).
- `components/games/registry.ts`: `GAME_ENGINES: Record<string, EngineLoader>` — hoy solo `{ rocas: () => import("./rocas/asteroids-engine").then((m) => m.createAsteroidsEngine) }`.
- `app/actions/scores.ts`: Server Action `saveScore(gameId, score)` — obtiene el usuario autenticado server-side (`lib/supabase/server.ts`), valida sesión activa y `score` numérico entero positivo, e inserta en la tabla `scores` con `user_id = auth.uid()`. No confía en ningún id de usuario enviado desde el cliente. Nunca lanza — responde `{ ok: false, error }`.
- `app/juegos/[id]/jugar/page.tsx`: busca `GAME_ENGINES[id]`; si existe, obtiene el usuario actual server-side y renderiza `<GamePlayerShell gameId={id} gameTitle={game.title} loadEngine={GAME_ENGINES[id]} username={...} />`; si no existe (los otros 7 juegos), sigue mostrando el arena-mock estático actual sin cambios.
- Controles: solo teclado (`←` `→` `↑` `Espacio`), igual que el original.
- El motor conserva exactamente el balance original: tamaños/velocidades/puntos de asteroides, power-up 3x, vidas=3, niveles.

**Fuera de alcance (para futuros specs):**

- Controles táctiles/móvil.
- Motores reales para los otros 7 juegos (bloque-buster, caida, serpentina, gloton, invasores, ranaria, duelo-pixel) — la estructura queda lista, implementarlos es trabajo de specs futuros.
- Validación en build-time de que cada `id` en `GAME_ENGINES` exista en `GAMES` — se confía en la disciplina manual de la receta del README.
- Historial de partidas del usuario o estadísticas más allá del leaderboard ya existente (`/salon-de-la-fama`, "Mejor global").
- Cambios al esquema de Supabase — se usa la tabla `scores` tal como quedó en el spec 04.
- Sonido / efectos de audio.
- Ranking en vivo o multijugador.
- Editar o borrar un puntaje ya guardado (`scores` sigue append-only, sin cambios).
- Actualizar el contador "Partidas" de `lib/data.ts` (sigue siendo un dato estático).
- Lógica de `devicePixelRatio` para nitidez del canvas en pantallas de alta densidad.

## Modelo de datos

Este spec no crea tablas nuevas en Supabase — reutiliza `scores` tal como quedó definida en el spec 04 (`sql/003_create_scores.sql`), incluyendo su RLS (`insert` solo autenticado con `user_id = auth.uid()`). Sí define los contratos nuevos entre el motor, el shell y el Server Action:

```ts
// components/games/game-engine.ts
export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 600; // toda coordenada de cualquier motor se calcula sobre estas constantes

export type EnginePhase = "playing" | "paused" | "gameover";

export type EngineState = {
  score: number;
  lives: number;
  level: number;
  phase: EnginePhase;
  badge?: { label: string; value: string }; // indicador extra opcional (ej. "3x 4.2s" del power-up)
};

export type EngineHandle = {
  start(): void;
  pause(): void;
  resume(): void;
  endGame(): void; // fuerza phase -> "gameover" con el score actual
  restart(): void; // vuelve a phase "playing" con score/vidas/nivel reiniciados
  destroy(): void; // limpia listeners y cancela el requestAnimationFrame
};

export type EngineFactory = (
  canvas: HTMLCanvasElement,
  onState: (state: EngineState) => void
) => EngineHandle;

export type EngineLoader = () => Promise<EngineFactory>;
```

```ts
// components/games/registry.ts
export const GAME_ENGINES: Record<string, EngineLoader>;
```

```ts
// app/actions/scores.ts
function saveScore(
  gameId: string,
  score: number
): Promise<{ ok: true } | { ok: false; error: string }>;
```

Reglas de comunicación HUD ↔ motor:

- `onState` se dispara solo cuando el valor mostrado realmente cambia (`score`, `lives`, `level`, `phase` o `badge`), no en cada frame de `requestAnimationFrame` (60/s) — evita re-renders de React innecesarios y mantiene el HUD sincronizado con el estado real del motor, nunca con valores estáticos u optimistas del componente.
- Ningún dato del `player-hud` ni del modal de fin de partida se hardcodea en `game-player-shell.tsx` — todo sale de `EngineState` recibido por el callback, o de la sesión real (`username`) pasada por prop desde el server component.

## Plan de implementación

1. Crear `components/games/game-engine.ts` con `ARENA_WIDTH`, `ARENA_HEIGHT`, `EnginePhase`, `EngineState`, `EngineHandle`, `EngineFactory`, `EngineLoader`. Test manual: `npm run lint` pasa (nada lo usa aún).
2. Crear `components/games/README.md` con la receta de 3 pasos para agregar un juego nuevo.
3. Portar `references/started-games/02-asteroids/game.js` a `components/games/rocas/asteroids-engine.ts`: mismas clases/balance, coordenadas sobre `ARENA_WIDTH`/`ARENA_HEIGHT`, sin `drawHUD` propio ni overlay/reinicio nativo de game over, implementando `EngineFactory` (llama `onState` solo cuando `score`/`lives`/`level`/`phase`/`badge` cambian). Test manual: `npm run lint` pasa (aún no montado en ninguna página).
4. Crear `components/games/registry.ts` con `GAME_ENGINES = { rocas: () => import("./rocas/asteroids-engine").then((m) => m.createAsteroidsEngine) }`. Test manual: `npm run lint` pasa.
5. Crear `app/actions/scores.ts` con `saveScore(gameId, score)`. Test manual: `npm run lint` pasa (aún no conectada).
6. Crear `components/games/game-player-shell.tsx`: monta el canvas, resuelve `loadEngine()` (con estado "CARGANDO…"), instancia el motor, sincroniza `player-hud` en vivo desde `EngineState`, implementa PAUSA/REANUDAR real y overlay "EN PAUSA". Test manual: aún no importado por ninguna página, `npm run lint` pasa.
7. Agregar a `game-player-shell.tsx` el botón FIN (fuerza `endGame()`) y el modal de fin de partida (`.modal-bd`): puntuación final; si hay `username`, dispara `saveScore(gameId, score)` automáticamente al entrar a `phase: "gameover"` (una sola vez), mostrando "GUARDANDO…" → toast "PUNTUACIÓN GUARDADA", o el error + botón "REINTENTAR" si falla; si no hay `username`, CTA a `/auth`. Acciones "JUGAR DE NUEVO" (`restart()`) / "VOLVER AL VAULT". Test manual: sigue sin montarse en ninguna página.
8. Actualizar `app/juegos/[id]/jugar/page.tsx`: si `GAME_ENGINES[id]` existe, obtener el usuario actual server-side y renderizar `<GamePlayerShell />`; si no, mantener el arena-mock actual sin cambios. Test manual: `/juegos/rocas/jugar` muestra el juego real y jugable con teclado; el resto de las 7 rutas sigue igual que hoy.
9. Verificación final manual jugando una partida completa: mover/rotar/disparar, destruir asteroides grandes→medianos→pequeños, recoger power-up 3x, perder las 3 vidas → se abre el modal automáticamente; en otra partida, usar FIN para terminar antes de perder todas las vidas → también abre el modal. Con sesión iniciada: llegar a game over guarda la puntuación automáticamente sin clics, ver el toast, confirmar una sola fila nueva en `scores` (no duplicada), y que aparece en `/juegos/rocas` ("Mejor global") y en `/salon-de-la-fama` (tab ROCAS). Sin sesión: confirmar que el modal muestra la CTA a `/auth` en vez de guardar. Confirmar que PAUSA/REANUDAR detiene y reanuda el juego real. Entrar y salir de `/juegos/rocas/jugar` varias veces seguidas y confirmar que no quedan listeners ni RAFs duplicados. Confirmar que visitar otra ruta `/juegos/<id>/jugar` no descarga el chunk del motor de Asteroids. `npm run lint` pasa sin errores.

## Criterios de aceptación

- [ ] `npm run dev` levanta la app sin errores en consola.
- [ ] `components/games/game-engine.ts` exporta `ARENA_WIDTH`, `ARENA_HEIGHT`, `EnginePhase`, `EngineState`, `EngineHandle`, `EngineFactory`, `EngineLoader`.
- [ ] `components/games/README.md` documenta los 3 pasos para agregar un juego nuevo (motor + `EngineFactory` + línea con `import()` dinámico en `registry.ts`).
- [ ] `components/games/registry.ts` expone `GAME_ENGINES` con la entrada `rocas` cargada vía `import()` dinámico.
- [ ] `/juegos/rocas/jugar` renderiza el motor real (canvas jugable) en vez del arena-mock; las otras 7 rutas (`/juegos/<id>/jugar`) siguen mostrando el arena-mock estático sin cambios.
- [ ] Controles de teclado funcionan igual que el original: `←`/`→` rotan la nave, `↑` propulsa, `Espacio` dispara.
- [ ] Los asteroides grandes se destruyen y se dividen en medianos, medianos en pequeños; los pequeños desaparecen sin dividirse. Puntos por tamaño: grande=20, mediano=50, pequeño=100 (igual que el original).
- [ ] El power-up 3x aparece, se puede recoger, y activa disparo triple por su duración configurada.
- [ ] El `player-hud` (Jugador/Puntuación/Vidas/Nivel) refleja en vivo el `EngineState` real del motor — no hay valores estáticos ni hardcodeados.
- [ ] El canvas no dibuja su propio HUD de texto (score/nivel/vidas) — ese texto solo vive en el `player-hud` de React.
- [ ] El botón PAUSA detiene el juego real (nave/asteroides/balas se congelan) y muestra el overlay "EN PAUSA"; REANUDAR lo retoma exactamente donde quedó.
- [ ] El botón FIN fuerza game over inmediato con el score actual, aunque queden vidas, y abre el modal de fin de partida.
- [ ] Perder las 3 vidas también abre el modal de fin de partida automáticamente (sin overlay nativo ni reinicio con Espacio).
- [ ] Con sesión iniciada, al abrirse el modal de fin de partida la puntuación se guarda automáticamente (sin clics) y se muestra el toast "PUNTUACIÓN GUARDADA".
- [ ] Un mismo game over genera una sola fila nueva en `scores` (sin duplicados por re-render).
- [ ] Si `saveScore` falla, el modal muestra el error junto a un botón "REINTENTAR" que reintenta el guardado.
- [ ] Sin sesión iniciada, el modal de fin de partida muestra una CTA con link a `/auth` en vez de guardar nada.
- [ ] "JUGAR DE NUEVO" reinicia la partida in-place (score/vidas/nivel vuelven a su estado inicial) sin recargar la página ni desmontar el shell.
- [ ] "VOLVER AL VAULT" navega a `/juegos/rocas` (detalle del juego).
- [ ] Tras guardar una puntuación real en `rocas`, `/juegos/rocas` ("Mejor global") y `/salon-de-la-fama` (tab ROCAS) reflejan el nuevo dato real de Supabase.
- [ ] Salir de la partida (SALIR o navegar fuera) en cualquier momento limpia correctamente los listeners de teclado y cancela el `requestAnimationFrame` del motor (sin loops fantasma ni fugas de memoria al volver a jugar).
- [ ] El motor de `rocas` se carga vía `import()` dinámico (chunk propio); visitar `/juegos/<otro-id>/jugar` no descarga el JS del motor de Asteroids.
- [ ] `npm run lint` pasa sin errores.

## Decisiones

- **Sí:** este spec implementa el motor real solo para `rocas` (Asteroids); los otros 7 juegos siguen con el arena-mock estático. La estructura (`game-engine.ts`, `game-player-shell.tsx`, `registry.ts`) queda genérica para que sumar el próximo motor sea solo un archivo + una línea, sin tocar el shell.
- **Sí:** el HUD (`player-hud`) y el modal de fin de partida viven en `game-player-shell.tsx`, compartidos por cualquier juego futuro — el canvas del motor no dibuja su propio HUD ni su propio overlay de game over (se elimina esa parte del `game.js` original).
- **Sí:** `onState` se dispara solo cuando `score`/`lives`/`level`/`phase`/`badge` cambian, no en cada frame de `requestAnimationFrame` — evita re-renders de React innecesarios y mantiene el HUD sincronizado con datos reales del motor, nunca hardcodeados.
- **Sí:** cada motor se carga con `import()` dinámico desde `registry.ts` (`EngineLoader`), no con import estático — así el catálogo y cada juego individual solo cargan el JS del motor que efectivamente se está jugando.
- **Sí:** el `id` de cada juego es el mismo ya definido en `GAMES` (`lib/data.ts`) — no se crea un sistema de identificadores paralelo para los motores.
- **Sí:** el guardado de puntuación es automático (sin botón) al llegar a `phase: "gameover"` con sesión activa; sin sesión se muestra una CTA a `/auth` en vez de guardar. Se guarda siempre, incluyendo `score === 0`.
- **Sí:** el botón FIN fuerza game over con el score actual (sin perder las 3 vidas primero) — permite cortar y guardar antes de morir.
- **Sí:** se reemplaza el overlay nativo "ESPACIO PARA REINICIAR" del `game.js` original por el modal de React (`.modal-bd`) ya existente en el diseño de la plataforma — el reinicio pasa a ser el botón "JUGAR DE NUEVO", no la tecla Espacio.
- **Sí:** PAUSA se implementa de verdad (detiene el loop de update), no queda decorativo como estaba.
- **Sí:** el canvas mantiene resolución interna fija 800×600 (idéntica al original) y se escala por CSS al 100% de `.crt-screen` (que ya es `aspect-ratio: 4/3`) — sin lógica de `devicePixelRatio` en este spec.
- **No:** controles táctiles/móvil — el juego queda solo con teclado, igual que el original.
- **No:** validación en build-time de que cada `id` en `GAME_ENGINES` coincida con `GAMES` — se confía en la disciplina manual de la receta del README por ahora.
- **No:** motores reales para los otros 7 juegos — fuera de alcance, aunque la estructura ya los soporta.

## Riesgos

| Riesgo                                                                                                                                                                                                                                                                                                                        | Mitigación                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16.2.10 posdata el entrenamiento del modelo; `import()` dinámico, code-splitting y las reglas de client components pueden diferir de lo esperado.                                                                                                                                                                     | Leer `node_modules/next/dist/docs/01-app/` (routing, client/server components, lazy loading) antes de implementar el `import()` dinámico y el `useEffect` del shell.                                                                         |
| El motor original usa listeners globales (`window.addEventListener('keydown'...)`) y `requestAnimationFrame` sin limpieza — si `destroy()` no los remueve bien, salir y volver a jugar puede duplicar listeners o dejar loops fantasma corriendo en segundo plano.                                                            | Verificar explícitamente en el paso 9 (verificación final): entrar y salir de `/juegos/rocas/jugar` varias veces seguidas y confirmar (consola / Performance) que no quedan listeners ni RAFs duplicados.                                    |
| El guardado automático de puntuación depende de que `phase` pase a `"gameover"` una sola vez por partida; un bug en el motor o en el `useEffect` del shell podría disparar `saveScore` más de una vez para el mismo resultado, insertando duplicados en `scores` (que es append-only, sin `update`/`delete` para corregirlo). | Guardar con una bandera (`ref`) que solo permite un `saveScore` por transición a `"gameover"`, reseteada en `restart()`. Probar explícitamente en el paso 9 que un solo game over genera una sola fila nueva.                                |
| El canvas se escala por CSS mientras el motor sigue leyendo coordenadas en el espacio interno 800×600 — como los controles son solo teclado (sin mouse), este riesgo es bajo, pero un futuro juego con controles de puntero sí lo heredaría.                                                                                  | Documentado en el README de `components/games/` como advertencia para motores futuros que usen posición de puntero.                                                                                                                          |
| RLS de `scores` (spec 04) exige `user_id = auth.uid()` en el insert; si `lib/supabase/server.ts` no resuelve la sesión correctamente dentro de la Server Action, el guardado fallaría silenciosamente o con error genérico.                                                                                                   | `saveScore` valida explícitamente que haya usuario autenticado antes de intentar el insert, y devuelve `{ ok:false, error }` legible en vez de dejar que Supabase falle por RLS sin contexto — probado en el paso 9 con sesión y sin sesión. |

## Lo que **no** está en este spec

- Controles táctiles/móvil.
- Motores reales para los otros 7 juegos.
- Validación en build-time de `GAME_ENGINES` contra `GAMES`.
- Historial de partidas del usuario o estadísticas adicionales.
- Cambios al esquema de Supabase.
- Sonido / efectos de audio.
- Ranking en vivo o multijugador.
- Editar o borrar un puntaje ya guardado.
- Actualizar el contador "Partidas" de `lib/data.ts`.
- Lógica de `devicePixelRatio`.

Cada uno de estos, si se implementa, va en su propio spec.
