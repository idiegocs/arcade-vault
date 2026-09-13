/**
 * Motor de "SERPENTINA" (Snake), escrito desde cero — a diferencia de
 * `rocas`/`caida`/`bloque-buster`, no hay una fuente completa en
 * `references/started-games/` para portar; solo material gráfico en
 * `references/source-asset/snake-assets/` (spritesheet de frutas).
 *
 * Diferencias respecto al Snake clásico:
 * - `lives` se reinterpreta como "intentos de la serpiente" (3 al empezar):
 *   chocar contra el propio cuerpo resta 1 vida y resetea la serpiente a su
 *   posición/dirección de partida **conservando la longitud que tenía**, sin
 *   resetear `score` ni `level`. Solo `lives === 0` es `"gameover"` real.
 * - Wrap-around real en los 4 bordes: cruzar uno teletransporta la cabeza al
 *   lado opuesto de la misma fila/columna — nunca es colisión.
 * - Doble esquema de controles (flechas + WASD) como alias sin conflicto.
 * - El movimiento avanza por grilla a intervalo discreto (no cada frame de
 *   RAF): un acumulador de tiempo separado del loop de dibujo, que baja con
 *   el nivel (`max(60, 150 - (level-1)*15)` ms por celda).
 * - No dibuja su propio HUD (score/vidas/nivel) — eso vive en el shell de
 *   React. El "LARGO" (longitud actual) va en `badge`.
 * - Sonido vía `components/games/audio.ts` (spec 08): `eat`/`crash`/`step`
 *   sintetizados — `step` (blip por celda en un tick normal) se agregó a
 *   pedido del usuario durante la implementación.
 * - El sprite de fruta (`apple`, recorte de `public/fruits.png`) se carga de
 *   forma perezosa/asíncrona; hasta que termina de cargar, la fruta se
 *   dibuja como un placeholder verde.
 */
import {
  ARENA_HEIGHT as H,
  ARENA_WIDTH as W,
  type EngineFactory,
  type EnginePhase,
  type EngineState,
} from "../game-engine";
import { playSound } from "../audio";

const CELL = 20;
const COLS = W / CELL; // 40
const ROWS = H / CELL; // 30

const START_LENGTH = 3;
const START_COL = 7;
const START_ROW = Math.floor(ROWS / 2);

const FRUIT_SRC = "/fruits.png";
/** Recorte de `apple` en `fruits.png`, portado de
 * `references/source-asset/snake-assets/sprites.js` (`SPRITE_ATLAS.fruits.apple`). */
const APPLE_SPRITE = { sx: 2786, sy: 136, sw: 110, sh: 160 };

type Dir = { dx: number; dy: number };
type Cell = { col: number; row: number };

const DIR_UP: Dir = { dx: 0, dy: -1 };
const DIR_DOWN: Dir = { dx: 0, dy: 1 };
const DIR_LEFT: Dir = { dx: -1, dy: 0 };
const DIR_RIGHT: Dir = { dx: 1, dy: 0 };

function isOpposite(a: Dir, b: Dir): boolean {
  return a.dx === -b.dx && a.dy === -b.dy;
}

/**
 * Cache de módulo: el sprite decodificado se comparte entre instancias del
 * motor (remounts de Strict Mode, o volver a entrar al juego) sin volver a
 * pedirlo por red. Sobrevive a `destroy()` → nueva `createSnakeEngine()` sin
 * romperse (ver motor-referencia.md §6).
 */
let fruitImg: HTMLImageElement | null = null;
let fruitLoaded = false;
let fruitLoading = false;
const fruitCallbacks: Array<() => void> = [];

function loadFruitSprite(cb: () => void): void {
  if (fruitLoaded) {
    cb();
    return;
  }
  fruitCallbacks.push(cb);
  if (fruitLoading) return;
  fruitLoading = true;

  const img = new Image();
  img.onload = () => {
    fruitImg = img;
    fruitLoaded = true;
    fruitCallbacks.forEach((f) => f());
    fruitCallbacks.length = 0;
  };
  img.onerror = () => {
    console.error("No se pudo cargar el sprite de fruta de SERPENTINA");
  };
  img.src = FRUIT_SRC;
}

export const createSnakeEngine: EngineFactory = (canvas, onState) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");

  let spriteReady = fruitLoaded;
  if (!spriteReady) {
    loadFruitSprite(() => {
      spriteReady = true;
    });
  }

  // ── Input ────────────────────────────────────────────────────────────
  const DIRECTION_KEYS: Record<string, Dir> = {
    ArrowUp: DIR_UP,
    KeyW: DIR_UP,
    ArrowDown: DIR_DOWN,
    KeyS: DIR_DOWN,
    ArrowLeft: DIR_LEFT,
    KeyA: DIR_LEFT,
    ArrowRight: DIR_RIGHT,
    KeyD: DIR_RIGHT,
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const candidate = DIRECTION_KEYS[e.code];
    if (!candidate) return;
    e.preventDefault();
    if (internalPhase === "gameover" || isPaused) return;
    // Ignora la tecla que revertiría 180° sobre la dirección actual — evita
    // que la serpiente choque contra su propio segundo segmento.
    if (isOpposite(candidate, dir)) return;
    desiredDir = candidate;
  };

  // Sin `keyup`: el movimiento es por grilla a intervalo fijo, no por tecla
  // mantenida — no hace falta rastrear el estado de las teclas entre eventos.
  window.addEventListener("keydown", handleKeyDown);

  // ── Estado mutable del juego ────────────────────────────────────────
  let body: Cell[] = [];
  let dir: Dir = DIR_RIGHT;
  let desiredDir: Dir = DIR_RIGHT;
  let fruit: Cell = { col: 0, row: 0 };
  let score = 0;
  let lives = 3;
  let level = 1;
  let internalPhase: "playing" | "gameover" = "playing";
  let isPaused = false;
  /** Acumulador de tiempo del tick de movimiento, en ms — separado del loop
   * de dibujo (fixed timestep simple, ver Riesgos del spec). */
  let tickAccum = 0;

  function tickIntervalMs(): number {
    return Math.max(60, 150 - (level - 1) * 15);
  }

  function occupiesCell(cell: Cell): boolean {
    return body.some((seg) => seg.col === cell.col && seg.row === cell.row);
  }

  function placeFruit() {
    const free: Cell[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cell = { col, row };
        if (!occupiesCell(cell)) free.push(cell);
      }
    }
    fruit = free[Math.floor(Math.random() * free.length)];
  }

  /** Reubica la serpiente en la posición/dirección de partida con `length`
   * segmentos — `length` fijo en `START_LENGTH` para una partida nueva, o la
   * longitud que tenía al chocar (no se acorta al perder una vida). Las
   * columnas usan módulo para no romperse si `length` excede `START_COL`
   * (mismo wrap-around que `moveOnce()`). */
  function layoutSnake(length: number) {
    body = [];
    // `body[0]` es la cabeza — se empuja primero para que `moveOnce()`
    // (que lee `body[0]`) la encuentre ahí, con el resto del cuerpo detrás
    // en la dirección opuesta al movimiento inicial (derecha).
    for (let i = 0; i < length; i++) {
      body.push({ col: (((START_COL - i) % COLS) + COLS) % COLS, row: START_ROW });
    }
    dir = DIR_RIGHT;
    desiredDir = DIR_RIGHT;
    tickAccum = 0;
  }

  function initGame() {
    layoutSnake(START_LENGTH);
    score = 0;
    lives = 3;
    level = 1;
    internalPhase = "playing";
    isPaused = false;
    placeFruit();
  }

  // ── Reporte de estado a React ──────────────────────────────────────
  let lastReported: EngineState | null = null;

  function currentPhase(): EnginePhase {
    if (isPaused) return "paused";
    if (internalPhase === "gameover") return "gameover";
    return "playing";
  }

  function reportState() {
    const badge = { label: "LARGO", value: String(body.length) };
    const next: EngineState = { score, lives, level, phase: currentPhase(), badge };
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

  function handleCrash() {
    playSound("crash");
    lives--;
    if (lives <= 0) {
      lives = 0;
      internalPhase = "gameover";
      return;
    }
    // Conserva la longitud que tenía la serpiente — solo se reubica en la
    // posición/dirección de partida (decisión confirmada durante la
    // implementación, ver spec 10 § Decisiones).
    layoutSnake(body.length);
    placeFruit();
  }

  function moveOnce() {
    dir = desiredDir;
    const head = body[0];
    // Wrap-around: cruzar cualquier borde teletransporta la cabeza al lado
    // opuesto de la misma fila/columna — nunca es colisión (spec 10 §
    // Decisiones). `+ COLS`/`+ ROWS` antes del módulo cubre el caso `-1`.
    const nextHead: Cell = {
      col: (head.col + dir.dx + COLS) % COLS,
      row: (head.row + dir.dy + ROWS) % ROWS,
    };

    const eating = nextHead.col === fruit.col && nextHead.row === fruit.row;
    // El último segmento vacía su celda este tick (salvo que la serpiente
    // esté creciendo) — no cuenta como colisión contra sí misma.
    const bodyAhead = eating ? body : body.slice(0, -1);
    if (bodyAhead.some((seg) => seg.col === nextHead.col && seg.row === nextHead.row)) {
      handleCrash();
      return;
    }

    body.unshift(nextHead);
    if (eating) {
      score += 10;
      level = 1 + Math.floor(score / 10 / 10);
      playSound("eat");
      placeFruit();
    } else {
      body.pop();
      // Tick de movimiento normal (ni fruta ni choque) — un blip corto y
      // silencioso por celda avanzada, distinto de `eat`/`crash`.
      playSound("step");
    }
  }

  // ── Update / Draw ───────────────────────────────────────────────────
  function update(dt: number) {
    if (internalPhase === "gameover") {
      reportState();
      return;
    }

    tickAccum += dt * 1000;
    const interval = tickIntervalMs();
    if (tickAccum >= interval) {
      tickAccum = 0;
      moveOnce();
    }

    reportState();
  }

  function draw() {
    ctx!.fillStyle = "#000";
    ctx!.fillRect(0, 0, W, H);

    // Fruta
    if (spriteReady && fruitImg) {
      ctx!.drawImage(
        fruitImg,
        APPLE_SPRITE.sx,
        APPLE_SPRITE.sy,
        APPLE_SPRITE.sw,
        APPLE_SPRITE.sh,
        fruit.col * CELL,
        fruit.row * CELL,
        CELL,
        CELL
      );
    } else {
      ctx!.fillStyle = "#22c55e";
      ctx!.fillRect(fruit.col * CELL, fruit.row * CELL, CELL, CELL);
    }

    // Serpiente — cabeza más clara que el cuerpo, con ojos para distinguirla
    // de un vistazo (no hay sprite propio, es dibujo vectorial).
    for (let i = body.length - 1; i >= 0; i--) {
      const seg = body[i];
      ctx!.fillStyle = i === 0 ? "#4ade80" : "#16a34a";
      ctx!.fillRect(seg.col * CELL + 1, seg.row * CELL + 1, CELL - 2, CELL - 2);
    }
    drawEyes();
  }

  /** Dos puntos oscuros sobre la cabeza, desplazados hacia `dir` y separados
   * en el eje perpendicular — dan una orientación clara sin sprite propio. */
  function drawEyes() {
    const head = body[0];
    const cx = head.col * CELL + CELL / 2;
    const cy = head.row * CELL + CELL / 2;
    const perpX = dir.dy;
    const perpY = -dir.dx;
    const forward = CELL * 0.18;
    const spread = CELL * 0.22;
    const eyeRadius = CELL * 0.1;
    for (const side of [-1, 1]) {
      const ex = cx + dir.dx * forward + perpX * spread * side;
      const ey = cy + dir.dy * forward + perpY * spread * side;
      ctx!.fillStyle = "#052e16";
      ctx!.beginPath();
      ctx!.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
      ctx!.fill();
    }
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
      tickAccum = 0;
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
    },
  };
};
