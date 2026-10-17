/**
 * Motor de "CAÍDA" (Tetris), portado de
 * `references/started-games/03-tetris/game.js`.
 *
 * Diferencias respecto al original:
 * - No dibuja su propio HUD (score/líneas/nivel) — eso vive en el shell de React.
 * - No tiene overlay propio de pausa ni de game over — el shell los controla
 *   vía `EngineHandle`.
 * - Agrega un sistema de 3 vidas: el original termina la partida en el
 *   primer topout (una pieza nueva no puede spawnear); acá cada topout
 *   limpia el tablero y resta una vida, y solo se reporta `"gameover"`
 *   cuando las 3 se agotan. `score`/`level`/líneas no se resetean entre
 *   vidas, solo el tablero.
 * - Sin segundo canvas para la "próxima pieza": se dibuja en una franja del
 *   mismo canvas, a la derecha del tablero centrado.
 * - Sin tema claro/oscuro ni `localStorage` — el motor no toca el DOM fuera
 *   del canvas que recibe.
 * - Reporta su estado a React vía `onState`, solo cuando cambia.
 * - Skins visuales (`clasico`/`neon`/`retro`, ver `SKINS`): referencia del
 *   patrón de skins para el resto de los motores (sección "Skins" de
 *   `../README.md`). Todo el dibujo lee de `palette`, nunca un literal.
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
  rotate: () => beep(520, 0.05, "square", 0.1),
  drop: () => beep(180, 0.08, "square", 0.15),
  lineClear: () => {
    beep(440, 0.09, "triangle", 0.15);
    beep(660, 0.09, "triangle", 0.15);
    beep(880, 0.14, "triangle", 0.15);
  },
  topout: () => beep(140, 0.4, "sawtooth", 0.2),
});

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const BOARD_W = COLS * BLOCK; // 300
const BOARD_H = ROWS * BLOCK; // 600
/** Tablero centrado dentro del arena 800×600 — sobra 250px a cada lado. */
const BOARD_OFFSET_X = (W - BOARD_W) / 2;
const BOARD_OFFSET_Y = (H - BOARD_H) / 2;

/** Vista previa de "próxima pieza", en la franja libre a la derecha del tablero. */
const NEXT_ORIGIN_X = BOARD_OFFSET_X + BOARD_W + 60;
const NEXT_ORIGIN_Y = 70;

// ── Skins ─────────────────────────────────────────────────────────────
/** Marca interior de un bloque — permite distinguir piezas que comparten
 * tono en paletas reducidas (RETRO). */
type BlockMark = "none" | "dot" | "inset" | "stripe" | "cross";

type PieceStyle = {
  fill: string;
  mark: BlockMark;
  markColor: string;
};

type TetrisPalette = {
  /** Fondo de todo el canvas. */
  background: string;
  /** Relleno del área del tablero (`null` = se ve `background`). */
  boardBackground: string | null;
  gridLine: string | null;
  gridLineWidth: number;
  frame: string;
  frameWidth: number;
  /** `shadowBlur` del marco del tablero (0 = sin glow). */
  frameGlow: number;
  /** Índice = tipo de pieza (0 sin uso, 1..8 = I O T S Z J L N). */
  pieces: readonly PieceStyle[];
  /** Color si un índice no tiene estilo (no debería pasar). */
  fallbackFill: string;
  /** Franja de brillo superior de cada bloque (`null` = sin franja). */
  highlight: string | null;
  highlightHeight: number;
  /** Borde duro alrededor de cada bloque (`null` = sin borde). */
  blockEdge: string | null;
  blockEdgeWidth: number;
  /** `shadowBlur` de los bloques; el `shadowColor` es el `fill` de la pieza. */
  blockGlow: number;
  /** Bloques como "tubo de neón": contorno brillante del color de la pieza,
   * relleno casi transparente y un núcleo blanco fino (`null` = bloque sólido). */
  tube: { lineWidth: number; fillAlpha: number; core: string } | null;
  /** Pieza fantasma: misma pieza con alpha, o solo contorno (sin transparencias). */
  ghost: { kind: "faded"; alpha: number } | { kind: "outline"; color: string; width: number };
  /** Texto "SIGUIENTE". */
  label: string;
  labelFont: string;
  /** Caja detrás de la vista previa de la próxima pieza (`null` = sin caja). */
  previewBox: { fill: string; border: string; borderWidth: number } | null;
};

const piece = (fill: string, mark: BlockMark = "none", markColor = fill): PieceStyle => ({
  fill,
  mark,
  markColor,
});

/** Game Boy DMG: los 4 verdes, de más oscuro a más claro. */
const GB = { darkest: "#0f380f", dark: "#306230", light: "#8bac0f", lightest: "#9bbc0f" };

const SKINS: Record<SkinId, TetrisPalette> = {
  // Look original del motor, copiado tal cual.
  clasico: {
    background: "#000",
    boardBackground: null,
    gridLine: "rgba(255,255,255,0.08)",
    gridLineWidth: 0.5,
    frame: "rgba(255,255,255,0.35)",
    frameWidth: 1,
    frameGlow: 0,
    pieces: [
      piece("#fff"), // 0 - sin uso
      piece("#4dd0e1"), // I - cyan
      piece("#ffd54f"), // O - amarillo
      piece("#ba68c8"), // T - violeta
      piece("#81c784"), // S - verde
      piece("#e57373"), // Z - rojo
      piece("#90caf9"), // J - celeste
      piece("#ffb74d"), // L - naranja
      piece("#9e9e9e"), // N - "tuerca" (gris metálico, pieza propia del original)
    ],
    fallbackFill: "#fff",
    highlight: "rgba(255,255,255,0.12)",
    highlightHeight: 4,
    blockEdge: null,
    blockEdgeWidth: 0,
    blockGlow: 0,
    tube: null,
    ghost: { kind: "faded", alpha: 0.2 },
    label: "rgba(255,255,255,0.5)",
    labelFont: "10px monospace",
    previewBox: null,
  },
  // Synthwave: tubos de neón huecos con glow fuerte sobre un fondo violeta
  // con grilla magenta — tiene que leerse distinto del clásico de un vistazo,
  // no solo con otros colores.
  neon: {
    background: "#0b0016",
    boardBackground: "#12002a",
    gridLine: "rgba(255,43,214,0.16)",
    gridLineWidth: 1,
    frame: "#ff2bd6",
    frameWidth: 3,
    frameGlow: 24,
    pieces: [
      piece("#ffffff"),
      piece("#00f5ff"), // I - cyan
      piece("#f5ff00"), // O - amarillo
      piece("#b026ff"), // T - violeta
      piece("#00ff88"), // S - verde
      piece("#ff006e"), // Z - magenta
      piece("#2d7bff"), // J - azul eléctrico
      piece("#ff8a00"), // L - naranja
      piece("#e6e9ff"), // N - tuerca (blanco plasma)
    ],
    fallbackFill: "#ffffff",
    highlight: null,
    highlightHeight: 0,
    blockEdge: null,
    blockEdgeWidth: 0,
    blockGlow: 16,
    tube: { lineWidth: 3, fillAlpha: 0.14, core: "rgba(255,255,255,0.85)" },
    ghost: { kind: "outline", color: "rgba(255,43,214,0.45)", width: 1 },
    label: "#ff2bd6",
    labelFont: "bold 11px monospace",
    previewBox: null,
  },
  // 4 verdes de Game Boy, bordes duros, sin glow ni alpha. Las piezas que
  // comparten tono se distinguen por la marca interior.
  retro: {
    background: GB.dark,
    boardBackground: GB.lightest,
    gridLine: GB.light,
    gridLineWidth: 1,
    frame: GB.darkest,
    frameWidth: 4,
    frameGlow: 0,
    pieces: [
      piece(GB.darkest),
      piece(GB.darkest), // I - liso oscuro
      piece(GB.dark), // O - liso medio
      piece(GB.light, "dot", GB.darkest), // T - claro con punto
      piece(GB.dark, "dot", GB.lightest), // S - medio con punto
      piece(GB.darkest, "inset", GB.light), // Z - oscuro con cuadro interior
      piece(GB.light, "inset", GB.dark), // J - claro con cuadro interior
      piece(GB.dark, "stripe", GB.light), // L - medio con franja
      piece(GB.light, "cross", GB.darkest), // N - tuerca: claro con cruz
    ],
    fallbackFill: GB.darkest,
    highlight: null,
    highlightHeight: 0,
    blockEdge: GB.darkest,
    blockEdgeWidth: 2,
    blockGlow: 0,
    tube: null,
    ghost: { kind: "outline", color: GB.dark, width: 2 },
    label: GB.lightest,
    labelFont: "bold 10px monospace",
    previewBox: { fill: GB.lightest, border: GB.darkest, borderWidth: 4 },
  },
};

const PIECES: number[][][] = [
  [],
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], // I
  [
    [2, 2],
    [2, 2],
  ], // O
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ], // T
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ], // S
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ], // Z
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ], // J
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ], // L
  [
    [8, 8, 8],
    [8, 0, 8],
    [8, 8, 8],
  ], // N (tuerca)
];

/** Tipos que pueden salir. La O (tipo 2) queda definida en `PIECES` (los
 * colores de cada skin se indexan por tipo) pero no se sortea: pedido del
 * usuario durante el spec 13. */
const SPAWNABLE = [1, 3, 4, 5, 6, 7, 8];

const LINE_SCORES = [0, 100, 300, 500, 800];

type Piece = { type: number; shape: number[][]; x: number; y: number };

export const createTetrisEngine: EngineFactory = (canvas, onState, options) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");

  /** Paleta activa — solo visual; `setSkin` la reasigna en vivo. */
  let palette: TetrisPalette = SKINS[options?.skin ?? DEFAULT_SKIN] ?? SKINS[DEFAULT_SKIN];

  // ── Input ──────────────────────────────────────────────────────────────
  const keys: Record<string, boolean> = {};
  const justPressed: Record<string, boolean> = {};

  const PREVENT_DEFAULT = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!keys[e.code]) justPressed[e.code] = true;
    keys[e.code] = true;
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();

    // El movimiento es por evento (no por polling en el RAF): igual que el
    // original, se apoya en el auto-repeat nativo del teclado al mantener
    // presionada una tecla.
    if (isPaused || internalPhase === "gameover") return;
    switch (e.code) {
      case "ArrowLeft":
        if (!collide(current.shape, current.x - 1, current.y)) current.x--;
        break;
      case "ArrowRight":
        if (!collide(current.shape, current.x + 1, current.y)) current.x++;
        break;
      case "ArrowUp":
      case "KeyX":
        tryRotate();
        break;
      case "ArrowDown":
        softDrop();
        break;
      case "Space":
        hardDrop();
        break;
    }
  };
  const handleKeyUp = (e: KeyboardEvent) => {
    keys[e.code] = false;
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // ── Tablero y piezas ─────────────────────────────────────────────────
  function createBoard(): number[][] {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  }

  function randomPiece(): Piece {
    const type = SPAWNABLE[Math.floor(Math.random() * SPAWNABLE.length)];
    const shape = PIECES[type].map((row) => [...row]);
    return {
      type,
      shape,
      x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
      y: 0,
    };
  }

  function collide(shape: number[][], ox: number, oy: number): boolean {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = ox + c;
        const ny = oy + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function rotateCW(shape: number[][]): number[][] {
    const rows = shape.length;
    const cols = shape[0].length;
    const result: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        result[c][rows - 1 - r] = shape[r][c];
      }
    }
    return result;
  }

  function tryRotate() {
    const rotated = rotateCW(current.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!collide(rotated, current.x + kick, current.y)) {
        current.shape = rotated;
        current.x += kick;
        playSound("rotate");
        return;
      }
    }
  }

  /** Asigna `current <- next`, sortea la siguiente. Si la pieza nueva ya
   * colisiona (topout), delega en `handleTopout()`. */
  function spawn() {
    current = next;
    next = randomPiece();
    if (collide(current.shape, current.x, current.y)) {
      handleTopout();
    }
  }

  /** Resta una vida. Con vidas restantes, limpia el tablero y sortea piezas
   * frescas (nunca pueden colisionar en un tablero vacío) sin tocar
   * `score`/`level`/`lines`. En la última vida, `"gameover"` real. */
  function handleTopout() {
    playSound("topout");
    lives--;
    if (lives <= 0) {
      internalPhase = "gameover";
      return;
    }
    board = createBoard();
    invalidateBoardLayer();
    current = randomPiece();
    next = randomPiece();
  }

  function merge() {
    invalidateBoardLayer();
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < current.shape[r].length; c++) {
        if (current.shape[r][c]) board[current.y + r][current.x + c] = current.shape[r][c];
      }
    }
  }

  /** Limpia filas completas y aplica el scoring/nivel del original. `level`
   * y `lines` nunca se resetean por esto — solo crecen. */
  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every((v) => v !== 0)) {
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(0));
        cleared++;
        r++;
      }
    }
    if (cleared === 0) return;
    playSound("lineClear");
    lines += cleared;
    score += (LINE_SCORES[cleared] ?? 0) * level;
    level = Math.floor(lines / 10) + 1;
    // dropInterval en segundos (el original usa ms: max(100, 1000-(level-1)*90)).
    dropInterval = Math.max(0.1, 1 - (level - 1) * 0.09);
  }

  function lockPiece() {
    playSound("drop");
    merge();
    clearLines();
    spawn();
  }

  /** Caída suave: +1 punto por fila bajada a mano. */
  function softDrop() {
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
      score += 1;
    } else {
      lockPiece();
    }
  }

  /** Caída dura: +2 puntos por celda de la proyección de aterrizaje. */
  function hardDrop() {
    const gy = ghostY();
    score += (gy - current.y) * 2;
    current.y = gy;
    lockPiece();
  }

  // ── Estado mutable del juego ─────────────────────────────────────────
  let board: number[][] = createBoard();
  let next: Piece = randomPiece();
  let current: Piece = randomPiece();
  let score = 0;
  let lives = 3;
  let level = 1;
  let lines = 0;
  let dropAccum = 0;
  let dropInterval = 1; // segundos; ver clearLines() para la fórmula por nivel
  /** Estado interno: solo pasa a "gameover" cuando `lives` llega a 0. Un
   * topout con vidas restantes limpia el tablero pero no cambia esto. */
  let internalPhase: "playing" | "gameover" = "playing";
  let isPaused = false;

  function initGame() {
    board = createBoard();
    invalidateBoardLayer();
    next = randomPiece();
    spawn();
    score = 0;
    lives = 3;
    level = 1;
    lines = 0;
    dropAccum = 0;
    dropInterval = 1;
    internalPhase = "playing";
    isPaused = false;
  }

  // ── Reporte de estado a React ────────────────────────────────────────
  let lastReported: EngineState | null = null;
  /** `lines` del último reporte: el badge es `String(lines)`, así que comparar
   * el número equivale a comparar el texto, sin armarlo en cada frame. */
  let lastReportedLines = -1;

  function currentPhase(): EnginePhase {
    if (isPaused) return "paused";
    if (internalPhase === "gameover") return "gameover";
    return "playing";
  }

  /** Corre en cada frame: solo arma el objeto de estado si algo cambió
   * (spec 14, sin allocaciones por frame). */
  function reportState() {
    const phase = currentPhase();
    const prev = lastReported;
    const changed =
      !prev ||
      prev.score !== score ||
      prev.lives !== lives ||
      prev.level !== level ||
      prev.phase !== phase ||
      lastReportedLines !== lines;
    if (!changed) return;
    const next: EngineState = {
      score,
      lives,
      level,
      phase,
      badge: { label: "LÍNEAS", value: String(lines) },
    };
    lastReportedLines = lines;
    lastReported = next;
    onState(next);
  }

  // ── Update ────────────────────────────────────────────────────────────
  function update(dt: number) {
    if (internalPhase === "gameover") {
      reportState();
      return;
    }

    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }

    reportState();
  }

  /** Proyecta `current` hacia abajo hasta la primera colisión — la "pieza
   * fantasma" que muestra dónde va a caer. */
  function ghostY(): number {
    let gy = current.y;
    while (!collide(current.shape, current.x, gy + 1)) gy++;
    return gy;
  }

  // ── Draw ──────────────────────────────────────────────────────────────
  /** Marca interior (solo paletas con `mark`, ej. RETRO) sobre el área
   * `(ix, iy, is)` del bloque, con rectángulos enteros — bordes duros. */
  function drawMark(
    context: CanvasRenderingContext2D,
    style: PieceStyle,
    ix: number,
    iy: number,
    is: number
  ) {
    const half = Math.floor(is / 2);
    context.fillStyle = style.markColor;
    switch (style.mark) {
      case "dot":
        context.fillRect(ix + half - 3, iy + half - 3, 6, 6);
        break;
      case "inset":
        context.fillRect(ix + 4, iy + 4, is - 8, is - 8);
        context.fillStyle = style.fill;
        context.fillRect(ix + 7, iy + 7, is - 14, is - 14);
        break;
      case "stripe":
        context.fillRect(ix, iy + half - 2, is, 4);
        break;
      case "cross":
        context.fillRect(ix + half - 2, iy + 4, 4, is - 8);
        context.fillRect(ix + 4, iy + half - 2, is - 8, 4);
        break;
      case "none":
        break;
    }
  }

  /** Un bloque en coordenadas locales: `(ox, oy)` es la esquina de su celda
   * de `BLOCK`×`BLOCK` (el bloque ocupa `BLOCK - 2` con 1 px de margen). Recibe
   * el contexto, así dibuja igual en un sprite que en el canvas (spec 14). */
  function drawBlock(
    context: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    colorIndex: number,
    ghost = false
  ) {
    if (!colorIndex) return;
    const style = palette.pieces[colorIndex];
    const fill = style?.fill ?? palette.fallbackFill;
    const px = ox + 1;
    const py = oy + 1;
    const s = BLOCK - 2;

    if (ghost && palette.ghost.kind === "outline") {
      const w = palette.ghost.width;
      context.strokeStyle = palette.ghost.color;
      context.lineWidth = w;
      context.strokeRect(px + w / 2, py + w / 2, s - w, s - w);
      return;
    }

    if (ghost && palette.ghost.kind === "faded") context.globalAlpha = palette.ghost.alpha;

    // El glow no se paga en la pieza fantasma.
    const glow = ghost ? 0 : palette.blockGlow;

    const tube = palette.tube;
    if (tube) {
      const base = context.globalAlpha;
      const inset = tube.lineWidth / 2 + 1;
      context.globalAlpha = base * tube.fillAlpha;
      context.fillStyle = fill;
      context.fillRect(px, py, s, s);
      context.globalAlpha = base;
      if (glow > 0) {
        context.shadowColor = fill;
        context.shadowBlur = glow;
      }
      context.strokeStyle = fill;
      context.lineWidth = tube.lineWidth;
      context.strokeRect(px + inset, py + inset, s - 2 * inset, s - 2 * inset);
      context.shadowBlur = 0;
      context.strokeStyle = tube.core;
      context.lineWidth = 1;
      context.strokeRect(px + inset, py + inset, s - 2 * inset, s - 2 * inset);
      context.globalAlpha = 1;
      return;
    }
    if (glow > 0) {
      context.shadowColor = fill;
      context.shadowBlur = glow;
    }
    const e = palette.blockEdge ? palette.blockEdgeWidth : 0;
    if (palette.blockEdge) {
      context.fillStyle = palette.blockEdge;
      context.fillRect(px, py, s, s);
      context.shadowBlur = 0;
    }
    context.fillStyle = fill;
    context.fillRect(px + e, py + e, s - 2 * e, s - 2 * e);
    if (glow > 0) context.shadowBlur = 0;

    if (palette.highlight) {
      context.fillStyle = palette.highlight;
      context.fillRect(px, py, s, palette.highlightHeight);
    }
    if (style && style.mark !== "none") drawMark(context, style, px + e, py + e, s - 2 * e);

    context.globalAlpha = 1;
  }

  /** Fondo del tablero, grilla y marco, en coordenadas del tablero. */
  function drawBoardFrame(c: CanvasRenderingContext2D) {
    if (palette.boardBackground) {
      c.fillStyle = palette.boardBackground;
      c.fillRect(0, 0, BOARD_W, BOARD_H);
    }
    if (palette.gridLine) {
      c.strokeStyle = palette.gridLine;
      c.lineWidth = palette.gridLineWidth;
      for (let col = 1; col < COLS; col++) {
        c.beginPath();
        c.moveTo(col * BLOCK, 0);
        c.lineTo(col * BLOCK, BOARD_H);
        c.stroke();
      }
      for (let r = 1; r < ROWS; r++) {
        c.beginPath();
        c.moveTo(0, r * BLOCK);
        c.lineTo(BOARD_W, r * BLOCK);
        c.stroke();
      }
    }
    if (palette.frameGlow > 0) {
      c.shadowColor = palette.frame;
      c.shadowBlur = palette.frameGlow;
    }
    c.strokeStyle = palette.frame;
    c.lineWidth = palette.frameWidth;
    c.strokeRect(0, 0, BOARD_W, BOARD_H);
    c.shadowBlur = 0;
  }

  /** Parte fija de la vista previa: el texto "SIGUIENTE" y la caja (RETRO),
   * en coordenadas del canvas. Va en `bgCache`. */
  function drawNextFrame(c: CanvasRenderingContext2D) {
    c.font = palette.labelFont;
    c.fillStyle = palette.label;
    c.fillText("SIGUIENTE", NEXT_ORIGIN_X, NEXT_ORIGIN_Y - 16);
    const box = palette.previewBox;
    if (box) {
      const side = 4 * BLOCK;
      c.fillStyle = box.fill;
      c.fillRect(NEXT_ORIGIN_X - 6, NEXT_ORIGIN_Y - 6, side + 12, side + 12);
      c.strokeStyle = box.border;
      c.lineWidth = box.borderWidth;
      c.strokeRect(NEXT_ORIGIN_X - 6, NEXT_ORIGIN_Y - 6, side + 12, side + 12);
    }
  }

  /** Bloques de la próxima pieza, con sprites, en coordenadas del canvas. */
  function drawNextPiece(c: CanvasRenderingContext2D) {
    const shape = next.shape;
    const offX = Math.floor((4 - shape[0].length) / 2);
    const offY = Math.floor((4 - shape.length) / 2);
    for (let r = 0; r < shape.length; r++) {
      for (let col = 0; col < shape[r].length; col++) {
        const v = shape[r][col];
        if (v)
          c.drawImage(
            blockSprites[v],
            NEXT_ORIGIN_X + (offX + col) * BLOCK - pad,
            NEXT_ORIGIN_Y + (offY + r) * BLOCK - pad
          );
      }
    }
  }

  // ── Cachés de dibujo (spec 14) ──────────────────────────────────────
  /** Margen de cada sprite de bloque: lo que se extiende el glow
   * (≈ 1,5 × `shadowBlur`) más el borde; sin glow, solo el borde. */
  let pad = 2;
  /** Fondo estático completo (800×600): fondo, tablero, grilla, marco y la
   * parte fija de la vista previa. Se arma perezosamente en `draw()`. */
  let bgCache: HTMLCanvasElement | null = null;
  /** Bloque de cada tipo de pieza (índice = tipo, 1..8) con su glow ya
   * pintado, en un canvas de `BLOCK + 2·pad`. */
  let blockSprites: HTMLCanvasElement[] = [];
  /** Lo mismo para la pieza fantasma (alpha o contorno, según la skin). */
  let ghostSprites: HTMLCanvasElement[] = [];
  /** Capa del tablero asentado: `bgCache` + los bloques fijos. Solo se
   * repinta cuando cambia `board` (pieza fijada, líneas, topout, partida
   * nueva) o la skin; cada frame la pinta con un solo `drawImage`. */
  let boardLayer: HTMLCanvasElement | null = null;
  let boardLayerDirty = true;

  function blockSprite(colorIndex: number, ghost: boolean): HTMLCanvasElement {
    const cv = document.createElement("canvas");
    cv.width = BLOCK + 2 * pad;
    cv.height = BLOCK + 2 * pad;
    const c = cv.getContext("2d")!;
    c.translate(pad, pad);
    drawBlock(c, 0, 0, colorIndex, ghost);
    return cv;
  }

  function buildCaches() {
    pad = palette.blockGlow > 0 ? Math.ceil(palette.blockGlow * 1.5) + 2 : 2;

    const bg = document.createElement("canvas");
    bg.width = W;
    bg.height = H;
    const b = bg.getContext("2d")!;
    b.fillStyle = palette.background;
    b.fillRect(0, 0, W, H);
    b.translate(BOARD_OFFSET_X, BOARD_OFFSET_Y);
    drawBoardFrame(b);
    b.setTransform(1, 0, 0, 1, 0, 0);
    // La vista previa queda lejos del glow del tablero: pintarla debajo de
    // los bloques no cambia nada a la vista.
    drawNextFrame(b);
    bgCache = bg;

    blockSprites = [];
    ghostSprites = [];
    for (let i = 0; i < PIECES.length; i++) {
      blockSprites.push(blockSprite(i, false));
      ghostSprites.push(blockSprite(i, true));
    }

    if (!boardLayer) {
      boardLayer = document.createElement("canvas");
      boardLayer.width = W;
      boardLayer.height = H;
    }
    boardLayerDirty = true;
  }

  /** Repinta la capa del tablero asentado (reusa el mismo canvas). */
  function renderBoardLayer() {
    const c = boardLayer!.getContext("2d")!;
    c.drawImage(bgCache!, 0, 0);
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const v = board[r][col];
        if (v)
          c.drawImage(
            blockSprites[v],
            BOARD_OFFSET_X + col * BLOCK - pad,
            BOARD_OFFSET_Y + r * BLOCK - pad
          );
      }
    }
    boardLayerDirty = false;
  }

  /** Cambió `board`: la capa del tablero se repinta en el próximo `draw()`. */
  function invalidateBoardLayer() {
    boardLayerDirty = true;
  }

  /** Único punto de invalidación de los cachés de la skin: `setSkin` y
   * `destroy`. Invalida también la capa del tablero. */
  function invalidateCaches() {
    bgCache = null;
    blockSprites = [];
    ghostSprites = [];
    boardLayer = null;
    invalidateBoardLayer();
  }

  // ── Redibujo solo con cambios (flag `dirty`, spec 14) ───────────────
  // CAÍDA solo cambia por el tick de caída o por input, y no tiene
  // animaciones continuas: casi todos los frames repetirían el anterior. Lo
  // que se ve depende de la pieza actual (objeto, rotación y posición; la
  // fantasma sale de ella y del tablero), de la próxima, del tablero
  // (`boardLayerDirty`) y de la skin (`bgCache === null`). Se compara contra
  // lo último dibujado, sin tocar el input ni el gameplay.
  let drawnCurrent: Piece | null = null;
  let drawnShape: number[][] | null = null;
  let drawnX = 0;
  let drawnY = 0;
  let drawnNext: Piece | null = null;
  /** Fuerza el próximo redibujo (p. ej. si el navegador restauró el canvas). */
  let forceRedraw = true;

  function needsRedraw(): boolean {
    return (
      forceRedraw ||
      !bgCache ||
      boardLayerDirty ||
      current !== drawnCurrent ||
      current.shape !== drawnShape ||
      current.x !== drawnX ||
      current.y !== drawnY ||
      next !== drawnNext
    );
  }

  const handleContextRestored = () => {
    forceRedraw = true;
    if (rafId === null) draw();
  };
  canvas.addEventListener("contextrestored", handleContextRestored);

  function draw() {
    const c = ctx!;
    if (!bgCache) buildCaches();
    if (boardLayerDirty) renderBoardLayer();
    c.drawImage(boardLayer!, 0, 0);

    const shape = current.shape;
    const x0 = BOARD_OFFSET_X + current.x * BLOCK - pad;

    // pieza fantasma (proyección de aterrizaje)
    const gy0 = BOARD_OFFSET_Y + ghostY() * BLOCK - pad;
    for (let r = 0; r < shape.length; r++) {
      for (let col = 0; col < shape[r].length; col++) {
        const v = shape[r][col];
        if (v) c.drawImage(ghostSprites[v], x0 + col * BLOCK, gy0 + r * BLOCK);
      }
    }

    // pieza actual
    const y0 = BOARD_OFFSET_Y + current.y * BLOCK - pad;
    for (let r = 0; r < shape.length; r++) {
      for (let col = 0; col < shape[r].length; col++) {
        const v = shape[r][col];
        if (v) c.drawImage(blockSprites[v], x0 + col * BLOCK, y0 + r * BLOCK);
      }
    }

    drawNextPiece(c);

    drawnCurrent = current;
    drawnShape = shape;
    drawnX = current.x;
    drawnY = current.y;
    drawnNext = next;
    forceRedraw = false;
  }

  // ── Loop principal ──────────────────────────────────────────────────
  let lastTime: number | null = null;
  let rafId: number | null = null;

  function loop(ts: number) {
    const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    if (needsRedraw()) draw();
    // Tras el game over queda el último frame quieto detrás del modal y el
    // loop se corta (spec 14); `restart()` lo vuelve a arrancar.
    if (internalPhase === "gameover") {
      rafId = null;
      return;
    }
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
    setSkin(skin: SkinId) {
      palette = SKINS[skin] ?? SKINS[DEFAULT_SKIN];
      invalidateCaches();
      // En pausa no hay frames corriendo: redibuja una vez para que se vea.
      if (rafId === null) draw();
    },
    destroy() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("contextrestored", handleContextRestored);
      invalidateCaches();
    },
  };
};
