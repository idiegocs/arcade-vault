# Referencia técnica del motor de juego

Este archivo es la destilación de `components/games/rocas/asteroids-engine.ts`
(el único motor real hoy) en un contrato reusable. Lo consultan tanto
`/add-game` (para escribir el "Modelo de datos" del spec) como
`/add-game-impl` (para escribir el código). Si algo acá no calza con el
archivo real, **el archivo real gana** — releelo antes de asumir que esta
referencia sigue vigente.

## 1. El contrato (verbatim de `components/games/game-engine.ts`)

```ts
export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 600;

export type EnginePhase = "playing" | "paused" | "gameover";

export type EngineState = {
  score: number;
  lives: number;
  level: number;
  phase: EnginePhase;
  /** Indicador extra opcional específico del juego (ej. "3x 4.2s" de un power-up). */
  badge?: { label: string; value: string };
};

export type EngineHandle = {
  start(): void;
  pause(): void;
  resume(): void;
  /** Fuerza `phase -> "gameover"` con el score actual, sin esperar a que el juego termine solo. */
  endGame(): void;
  /** Vuelve a `phase: "playing"` con score/vidas/nivel reiniciados. */
  restart(): void;
  /** Limpia listeners, timers y el requestAnimationFrame propios del motor. */
  destroy(): void;
};

export type EngineFactory = (
  canvas: HTMLCanvasElement,
  onState: (state: EngineState) => void
) => EngineHandle;

export type EngineLoader = () => Promise<EngineFactory>;
```

`ARENA_WIDTH × ARENA_HEIGHT` = 800×600 = proporción 4:3, la misma que
`.crt-screen { aspect-ratio: 4/3 }` en `app/globals.css`. Un motor con otra
resolución nativa necesita adaptarse (ver §4) — no se cambian las constantes.

Un motor es **exactamente una función** `create<Nombre>Engine: EngineFactory`,
exportada con nombre (no default). No sabe nada de React, DOM fuera del
canvas que recibe, ni de la tabla `games` — solo dibuja y reporta estado.

## 2. Esqueleto canónico

Todo — helpers, clases, estado mutable — se declara **dentro** del cuerpo de
la factory, para cerrar sobre `ctx` y los mapas de input sin variables
globales de módulo (dos partidas simultáneas, o remounts de React Strict
Mode en dev, no deben compartir estado).

```ts
import {
  ARENA_HEIGHT as H,
  ARENA_WIDTH as W,
  type EngineFactory,
  type EnginePhase,
  type EngineState,
} from "../game-engine";

export const create<Nombre>Engine: EngineFactory = (canvas, onState) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");

  // ── Input ────────────────────────────────────────────────────────────
  const keys: Record<string, boolean> = {};
  const justPressed: Record<string, boolean> = {};

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!keys[e.code]) justPressed[e.code] = true;
    keys[e.code] = true;
    // preventDefault en las teclas que el juego usa para que no scrollee
    // la página — el motor de rocas NO lo hace y es un bug conocido, no
    // lo repitas.
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
  };
  const handleKeyUp = (e: KeyboardEvent) => {
    keys[e.code] = false;
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  function pressed(code: string): boolean {
    const val = justPressed[code];
    justPressed[code] = false;
    return !!val;
  }

  // ── Estado mutable del juego ────────────────────────────────────────
  let score = 0;
  let lives = 3; // o el valor inicial que corresponda; ver §5 para juegos sin vidas
  let level = 1;
  /** Estado interno, más granular que el `EnginePhase` público — ej. una
   * pausa de respawn, una animación de línea completada, etc. Se colapsa
   * a los 3 valores públicos en `currentPhase()`. */
  let internalPhase: "playing" | "gameover" = "playing";
  let isPaused = false;

  function initGame() {
    score = 0;
    lives = 3;
    level = 1;
    internalPhase = "playing";
    isPaused = false;
    // resetear el resto del estado del juego acá
  }

  // ── Reporte de estado a React ──────────────────────────────────────
  let lastReported: EngineState | null = null;

  function currentPhase(): EnginePhase {
    if (isPaused) return "paused";
    if (internalPhase === "gameover") return "gameover";
    return "playing";
  }

  function reportState() {
    const next: EngineState = { score, lives, level, phase: currentPhase() /*, badge */ };
    const prev = lastReported;
    const changed =
      !prev ||
      prev.score !== next.score ||
      prev.lives !== next.lives ||
      prev.level !== next.level ||
      prev.phase !== next.phase ||
      prev.badge?.value !== next.badge?.value;
    if (!changed) return;
    lastReported = next;
    onState(next);
  }

  // ── Update / Draw ───────────────────────────────────────────────────
  function update(dt: number) {
    if (internalPhase === "gameover") {
      reportState();
      return;
    }
    // física y lógica del juego acá, todo escalado por dt
    reportState();
  }

  function draw() {
    ctx!.fillStyle = "#000";
    ctx!.fillRect(0, 0, W, H);
    // dibujar el juego acá — nunca texto de HUD, eso vive en el shell
  }

  // ── Loop principal ──────────────────────────────────────────────────
  let lastTime: number | null = null;
  let rafId: number | null = null;

  function loop(ts: number) {
    const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  initGame();

  return {
    start() {
      if (rafId !== null) return;
      lastTime = null;
      rafId = requestAnimationFrame(loop);
      reportState();
    },
    pause() {
      if (isPaused) return;
      isPaused = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      reportState();
    },
    resume() {
      if (!isPaused) return;
      isPaused = false;
      lastTime = null;
      rafId = requestAnimationFrame(loop);
      reportState();
    },
    endGame() {
      if (internalPhase === "gameover") return;
      internalPhase = "gameover";
      isPaused = false;
      if (rafId === null) {
        lastTime = null;
        rafId = requestAnimationFrame(loop);
      }
      reportState();
    },
    restart() {
      initGame();
      lastReported = null;
      if (rafId === null) {
        lastTime = null;
        rafId = requestAnimationFrame(loop);
      }
      reportState();
    },
    destroy() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    },
  };
};
```

### Los 6 métodos, con sus guardas de idempotencia (no son opcionales)

- **`pause()` cancela el RAF de verdad** — no es un flag que `update()` lee y
  sigue corriendo. Sin esto, el juego consume CPU en segundo plano.
- **`resume()`/`restart()`/`endGame()` resetean `lastTime = null`** antes de
  pedir el próximo frame — si no, el primer `dt` después de reanudar incluye
  todo el tiempo que estuvo en pausa y la física salta.
- **`endGame()`/`restart()` deben reiniciar el RAF si se los llama estando en
  pausa** (`if (rafId === null) { lastTime = null; rafId = requestAnimationFrame(loop); }`)
  — el botón FIN del shell puede llamarse con el juego pausado.
- **`restart()` pone `lastReported = null`** — si no, un restart que vuelve
  exactamente al mismo `EngineState` (ej. score 0, mismo `phase`) no dispara
  `onState` y el HUD de React se queda mostrando los valores viejos.
- **Todos los métodos son idempotentes**: llamar `pause()` dos veces, o
  `start()` con el RAF ya corriendo, no debe duplicar nada.
- **`destroy()` es total**: cancela el RAF y saca cada listener que el motor
  agregó. El shell no sabe nada de los internals — si el motor no limpia,
  nadie lo hace.

## 3. Checklist para portar un juego de `references/started-games/`

Los juegos de referencia son scripts sueltos (`<script src="game.js">`, sin
módulos, variables globales, arranque inmediato). Pasos, en orden:

1. Envolver todo el archivo en `export const create<Nombre>Engine: EngineFactory = (canvas, onState) => { ... }`.
   Las variables globales del original pasan a ser `let`/`const` dentro del
   closure.
2. Borrar todo `document.getElementById(...)` — el motor no toca el DOM más
   allá del `canvas` que recibe como argumento.
3. Eliminar cualquier HUD que el juego dibuje (texto de score/vidas/nivel en
   el canvas, o elementos DOM aparte) y cualquier overlay propio de pausa o
   game over — el shell (`game-player-shell.tsx`) ya los dibuja a partir de
   `EngineState`. Reemplazar por llamadas a `reportState()`.
4. Mapear los estados internos del juego original a los 3 valores de
   `EnginePhase` en `currentPhase()`. Un estado sin equivalente directo (ej.
   un `'win'` de victoria) se mapea a `"gameover"` — igual dispara el
   guardado del score.
5. Sacar cualquier tecla de pausa propia del juego (`KeyP`, `Escape`, etc.)
   — la pausa la controla el botón PAUSA del shell llamando `pause()`/
   `resume()`. Si el original tenía un menú de pausa interactivo dibujado en
   canvas, se borra entero.
6. Convertir handlers de evento anónimos en funciones nombradas
   (`handleKeyDown`, no `(e) => {...}` inline) para poder sacarlos en
   `destroy()`.
7. Resolver la resolución (ver §4 si no es 800×600 nativo).
8. Si el juego usa mouse/touch, convertir las coordenadas del evento al
   espacio interno del canvas — el canvas se escala por CSS a 100% de
   `.crt-screen` pero su resolución interna sigue fija:
   ```ts
   const rect = canvas.getBoundingClientRect();
   const scaleX = canvas.width / rect.width;
   const scaleY = canvas.height / rect.height;
   const x = (e.clientX - rect.left) * scaleX;
   const y = (e.clientY - rect.top) * scaleY;
   ```
   (`references/started-games/04-arkanoid/game.js` ya lo hace bien — es
   plantilla válida para copiar tal cual.)
9. Mover cualquier asset binario (imágenes, audio) a `public/` y referenciarlo
   con una ruta absoluta (`/spritesheet.png`, no `assets/spritesheet.png`).
   Cortar/pausar cualquier audio en `destroy()`.
10. Convertir a TypeScript: tipar el estado, usar `ctx!.` dentro de funciones
    de dibujo anidadas si hace falta (el checker no siempre puede angostar el
    tipo a través de un closure de clase, como en `asteroids-engine.ts`).

## 4. Casos particulares ya identificados

### `references/started-games/03-tetris` → candidato a `caida`

- Canvas nativo **300×600**, más un segundo canvas de 120×120 para la
  "próxima pieza" y un HUD lateral en DOM. El shell solo entrega un canvas
  único de 800×600 — hay que decidir (preguntar al usuario en `/add-game`):
  centrar el tablero de 300×600 con `ctx.translate(...)` dejando el resto en
  negro, o recalcular `BLOCK` para usar más ancho; la vista de "próxima
  pieza" se dibuja en una franja del mismo canvas o se descarta.
- **No tiene concepto de vidas.** Hay que decidir qué va en `lives` (ej.
  fijo en 0, o reutilizar el campo con otro significado documentado). El
  `badge` natural es `{ label: "LÍNEAS", value: String(lines) }`.
- Lee `localStorage` y `getComputedStyle(document.body)` para un tema
  claro/oscuro — se elimina, el motor no toca `localStorage` ni el DOM.

### `references/started-games/04-arkanoid` → candidato a `bloque-buster`

- Ya nativo 800×600 y ya convierte coordenadas de mouse correctamente (ver
  §3.8) — el port más barato de los tres en cuanto a resolución/input.
- Tiene un estado `'win'` (todos los bloques rotos) sin equivalente en
  `EnginePhase` → mapear a `"gameover"`.
- Trae `assets/spritesheet-breakout.png` (30 KB) y dos `.mp3` — mover a
  `public/`, y silenciar/cortar el audio en `destroy()`.
- Su overlay de pausa es un menú clickeable de selección de nivel dibujado en
  canvas — se borra entero, la pausa la maneja el shell.

## 5. Lo que el motor NUNCA hace

- No dibuja HUD de texto (score/vidas/nivel) — vive en `game-player-shell.tsx`.
- No dibuja su propio overlay de pausa ni de game over.
- No tiene reinicio nativo por tecla al perder — lo dispara el shell vía
  `restart()`.
- No llama `onState` en cada frame — solo cuando `reportState()` detecta un
  cambio real.
- No lee ni escribe `localStorage`, ni toca el DOM fuera del `canvas` que
  recibe.
- No exporta `default` — export nombrado `create<Nombre>Engine`.
- No valida ni conoce la sesión del usuario, ni llama a `saveScore` — eso lo
  hace el shell cuando `phase` pasa a `"gameover"`.

## 6. Gotchas que rompen cosas si se ignoran

- **`saveScore(gameId, score)` rechaza el guardado si `score` no es un
  entero ≥ 0** ("Puntuación inválida.") — nunca reportar un score
  fraccionario o negativo.
- El invitado (sin sesión) puede jugar, pero el shell nunca llama a
  `saveScore` para él — no es un caso a manejar en el motor.
- El auto-guardado del shell corre **una vez por partida**, en la transición
  a `"gameover"`, con un flag que solo se resetea en `restart()` — si el
  motor reporta `"gameover"` más de una vez sin pasar por `restart()`, no
  duplica el guardado (el flag ya está en `true`), pero tampoco hace falta
  que el motor se preocupe por esto.
- `.claude/hooks/format-on-write.ps1` corre Prettier + ESLint en cada
  `Write`/`Edit` — no hace falta formatear a mano, pero sí correr
  `npm run lint` para confirmar que no quedaron errores de tipos.
- React Strict Mode (dev) monta el efecto del shell dos veces — el patrón
  `cancelled` + `destroy()` en el `useEffect` del shell ya lo maneja; el
  motor no necesita protegerse de esto, pero si algo del motor no es
  reentrante (ej. un singleton de módulo, como un spritesheet cacheado),
  hay que asegurarse de que sobreviva a una creación → destrucción → nueva
  creación sin romperse.
