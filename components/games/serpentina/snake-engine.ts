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
 * - Skins visuales (`clasico`/`neon`/`retro`, ver `SKINS`), con el patrón de
 *   CAÍDA (sección "Skins" de `../README.md`). Todo el dibujo lee de
 *   `palette`, nunca un literal. Solo visual: grilla, velocidad, colisiones y
 *   puntaje son idénticos en las 3.
 */
import {
  ARENA_HEIGHT as H,
  ARENA_WIDTH as W,
  DEFAULT_SKIN,
  type EngineFactory,
  type EnginePhase,
  type EngineState,
  type SkinId,
} from "../game-engine";
import { beep, defineSounds } from "../audio";

/** Sonidos de este juego (ver `defineSounds` en `../audio`). */
const playSound = defineSounds({
  eat: () => beep(740, 0.07, "triangle", 0.15),
  crash: () => {
    beep(200, 0.2, "sawtooth", 0.18);
    beep(100, 0.25, "square", 0.15);
  },
  step: () => beep(220, 0.02, "square", 0.03),
});

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

// ── Skins ─────────────────────────────────────────────────────────────
/** Marca interior de una celda — separa entidades que comparten tono en
 * paletas reducidas (RETRO). */
type CellMark = "none" | "dot" | "inset";
/** Silueta de la celda. `diamond` en sólido se dibuja escalonado (pixel art). */
type CellShape = "square" | "circle" | "diamond";

type EntityStyle = {
  fill: string;
  shape: CellShape;
  mark: CellMark;
  markColor: string;
};

type SnakePalette = {
  /** Fondo de todo el canvas (el arena entero es el área de juego). */
  background: string;
  /** Si existe, el fondo es un degradé vertical `background` → este color. */
  backgroundBottom: string | null;
  gridLine: string | null;
  gridLineWidth: number;
  /** Marco alrededor del arena (`null` = sin marco). */
  frame: string | null;
  frameWidth: number;
  /** `shadowBlur` del marco (0 = sin glow). */
  frameGlow: number;
  head: EntityStyle;
  body: EntityStyle;
  /** Ojos de la cabeza. */
  eye: string;
  /** Ojos como cuadrados de píxel (bordes duros) en vez de círculos. */
  eyeSquare: boolean;
  fruit: EntityStyle;
  /** Usa el sprite de manzana (`fruits.png`); `fruit` es el placeholder
   * hasta que carga. Sin sprite, la fruta se dibuja siempre con `fruit`. */
  fruitSprite: boolean;
  /** Borde duro alrededor de cada celda (`null` = sin borde). */
  cellEdge: string | null;
  cellEdgeWidth: number;
  /** `shadowBlur` de las entidades; el `shadowColor` es su `fill`. */
  glow: number;
  /** Entidades como "tubo de neón": contorno brillante, relleno casi
   * transparente y núcleo blanco fino (`null` = celda sólida). */
  tube: { lineWidth: number; fillAlpha: number; core: string } | null;
};

const entity = (
  fill: string,
  shape: CellShape = "square",
  mark: CellMark = "none",
  markColor = fill
): EntityStyle => ({ fill, shape, mark, markColor });

/** Game Boy DMG: los 4 verdes, de más oscuro a más claro. */
const GB = { darkest: "#0f380f", dark: "#306230", light: "#8bac0f", lightest: "#9bbc0f" };

const SKINS: Record<SkinId, SnakePalette> = {
  // Look original del motor, copiado tal cual.
  clasico: {
    background: "#000",
    backgroundBottom: null,
    gridLine: null,
    gridLineWidth: 0,
    frame: null,
    frameWidth: 0,
    frameGlow: 0,
    head: entity("#4ade80"),
    body: entity("#16a34a"),
    eye: "#052e16",
    eyeSquare: false,
    fruit: entity("#22c55e"),
    fruitSprite: true,
    cellEdge: null,
    cellEdgeWidth: 0,
    glow: 0,
    tube: null,
  },
  // Synthwave: tubos de neón huecos con glow fuerte sobre fondo violeta con
  // grilla y marco magenta. Cabeza cyan, cuerpo verde, fruta amarilla circular.
  neon: {
    background: "#0b0016",
    backgroundBottom: "#12002a",
    gridLine: "rgba(255,43,214,0.12)",
    gridLineWidth: 1,
    frame: "#ff2bd6",
    frameWidth: 3,
    frameGlow: 24,
    head: entity("#00f5ff"),
    body: entity("#00ff88"),
    eye: "#ffffff",
    eyeSquare: false,
    fruit: entity("#f5ff00", "circle"),
    fruitSprite: false,
    cellEdge: null,
    cellEdgeWidth: 0,
    glow: 16,
    tube: { lineWidth: 3, fillAlpha: 0.14, core: "rgba(255,255,255,0.85)" },
  },
  // 4 verdes de Game Boy, bordes duros, sin glow ni alpha. Cabeza lisa en el
  // tono más oscuro con ojos claros; cuerpo medio con punto claro; fruta como
  // rombo escalonado oscuro con centro claro — tres siluetas distintas.
  retro: {
    background: GB.lightest,
    backgroundBottom: null,
    gridLine: GB.light,
    gridLineWidth: 1,
    frame: GB.darkest,
    frameWidth: 4,
    frameGlow: 0,
    head: entity(GB.darkest),
    body: entity(GB.dark, "square", "dot", GB.lightest),
    eye: GB.lightest,
    eyeSquare: true,
    fruit: entity(GB.darkest, "diamond", "dot", GB.lightest),
    fruitSprite: false,
    cellEdge: GB.darkest,
    cellEdgeWidth: 2,
    glow: 0,
    tube: null,
  },
};

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

export const createSnakeEngine: EngineFactory = (canvas, onState, options) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");

  /** Paleta activa — solo visual; `setSkin` la reasigna en vivo. */
  let palette: SnakePalette = SKINS[options?.skin ?? DEFAULT_SKIN] ?? SKINS[DEFAULT_SKIN];

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

  /** Traza la silueta `shape` dentro del cuadrado `(x, y, s)` como path. */
  function shapePath(shape: CellShape, x: number, y: number, s: number) {
    ctx!.beginPath();
    switch (shape) {
      case "circle":
        ctx!.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
        break;
      case "diamond":
        ctx!.moveTo(x + s / 2, y);
        ctx!.lineTo(x + s, y + s / 2);
        ctx!.lineTo(x + s / 2, y + s);
        ctx!.lineTo(x, y + s / 2);
        ctx!.closePath();
        break;
      case "square":
        ctx!.rect(x, y, s, s);
        break;
    }
  }

  /** Relleno sólido de la silueta. El rombo va escalonado con rectángulos
   * enteros (bordes duros, sin antialias) — usado por RETRO. */
  function fillShape(shape: CellShape, x: number, y: number, s: number) {
    if (shape === "square") {
      ctx!.fillRect(x, y, s, s);
      return;
    }
    if (shape === "diamond") {
      const steps = 4;
      const unit = Math.floor(s / (2 * steps));
      const off = Math.floor((s - 2 * steps * unit) / 2);
      const size = 2 * steps * unit;
      for (let i = 0; i < steps; i++) {
        const inset = (steps - 1 - i) * unit;
        ctx!.fillRect(x + off + inset, y + off + i * unit, size - 2 * inset, size - 2 * i * unit);
      }
      return;
    }
    shapePath(shape, x, y, s);
    ctx!.fill();
  }

  /** Marca interior (solo paletas con `mark`, ej. RETRO), bordes duros. */
  function drawMark(style: EntityStyle, x: number, y: number, s: number) {
    const half = Math.floor(s / 2);
    ctx!.fillStyle = style.markColor;
    switch (style.mark) {
      case "dot":
        ctx!.fillRect(x + half - 2, y + half - 2, 4, 4);
        break;
      case "inset":
        ctx!.fillRect(x + 3, y + 3, s - 6, s - 6);
        ctx!.fillStyle = style.fill;
        ctx!.fillRect(x + 5, y + 5, s - 10, s - 10);
        break;
      case "none":
        break;
    }
  }

  /** Dibuja una entidad en la celda `(col, row)` según la paleta activa:
   * relleno plano (CLÁSICO), tubo de neón hueco (NEÓN) o sólido con borde
   * duro y marca (RETRO). `margin` = hueco con el borde de la celda. */
  function drawEntity(cell: Cell, style: EntityStyle, margin: number) {
    const x = cell.col * CELL + margin;
    const y = cell.row * CELL + margin;
    const s = CELL - 2 * margin;

    const tube = palette.tube;
    if (tube) {
      const inset = tube.lineWidth / 2 + 1;
      ctx!.globalAlpha = tube.fillAlpha;
      ctx!.fillStyle = style.fill;
      shapePath(style.shape, x, y, s);
      ctx!.fill();
      ctx!.globalAlpha = 1;
      if (palette.glow > 0) {
        ctx!.shadowColor = style.fill;
        ctx!.shadowBlur = palette.glow;
      }
      shapePath(style.shape, x + inset, y + inset, s - 2 * inset);
      ctx!.strokeStyle = style.fill;
      ctx!.lineWidth = tube.lineWidth;
      ctx!.stroke();
      ctx!.shadowBlur = 0;
      ctx!.strokeStyle = tube.core;
      ctx!.lineWidth = 1;
      ctx!.stroke();
      return;
    }

    if (palette.glow > 0) {
      ctx!.shadowColor = style.fill;
      ctx!.shadowBlur = palette.glow;
    }
    const e = palette.cellEdge ? palette.cellEdgeWidth : 0;
    if (palette.cellEdge) {
      ctx!.fillStyle = palette.cellEdge;
      fillShape(style.shape, x, y, s);
      ctx!.shadowBlur = 0;
    }
    ctx!.fillStyle = style.fill;
    // El rombo escalonado ya es una silueta cerrada: su borde es el propio tono.
    if (style.shape === "diamond") fillShape(style.shape, x, y, s);
    else fillShape(style.shape, x + e, y + e, s - 2 * e);
    ctx!.shadowBlur = 0;
    if (style.mark !== "none") drawMark(style, x + e, y + e, s - 2 * e);
  }

  function drawBackground() {
    if (palette.backgroundBottom) {
      const gradient = ctx!.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, palette.background);
      gradient.addColorStop(1, palette.backgroundBottom);
      ctx!.fillStyle = gradient;
    } else {
      ctx!.fillStyle = palette.background;
    }
    ctx!.fillRect(0, 0, W, H);

    if (palette.gridLine) {
      ctx!.strokeStyle = palette.gridLine;
      ctx!.lineWidth = palette.gridLineWidth;
      ctx!.beginPath();
      for (let c = 1; c < COLS; c++) {
        ctx!.moveTo(c * CELL, 0);
        ctx!.lineTo(c * CELL, H);
      }
      for (let r = 1; r < ROWS; r++) {
        ctx!.moveTo(0, r * CELL);
        ctx!.lineTo(W, r * CELL);
      }
      ctx!.stroke();
    }
  }

  /** Marco del arena, pegado al borde del canvas (se dibuja al final para
   * que el glow quede por encima de la grilla). */
  function drawFrame() {
    if (!palette.frame) return;
    const w = palette.frameWidth;
    if (palette.frameGlow > 0) {
      ctx!.shadowColor = palette.frame;
      ctx!.shadowBlur = palette.frameGlow;
    }
    ctx!.strokeStyle = palette.frame;
    ctx!.lineWidth = w;
    ctx!.strokeRect(w / 2, w / 2, W - w, H - w);
    ctx!.shadowBlur = 0;
  }

  function draw() {
    drawBackground();

    // Fruta
    if (palette.fruitSprite && spriteReady && fruitImg) {
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
      // CLÁSICO: placeholder a celda completa (margen 0), como el original.
      drawEntity(fruit, palette.fruit, palette.fruitSprite ? 0 : 1);
    }

    // Serpiente — la cabeza se distingue del cuerpo (tono propio + ojos) de
    // un vistazo en las 3 skins (no hay sprite propio, es dibujo vectorial).
    for (let i = body.length - 1; i >= 0; i--) {
      drawEntity(body[i], i === 0 ? palette.head : palette.body, 1);
    }
    drawEyes();
    drawFrame();
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
      ctx!.fillStyle = palette.eye;
      if (palette.eyeSquare) {
        ctx!.fillRect(Math.round(ex) - 2, Math.round(ey) - 2, 4, 4);
        continue;
      }
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
    setSkin(skin: SkinId) {
      palette = SKINS[skin] ?? SKINS[DEFAULT_SKIN];
      // En pausa no hay frames corriendo: redibuja una vez para que se vea.
      if (rafId === null) draw();
    },
    destroy() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      window.removeEventListener("keydown", handleKeyDown);
    },
  };
};
