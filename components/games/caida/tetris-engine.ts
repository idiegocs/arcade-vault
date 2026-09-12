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
 */
import {
  ARENA_HEIGHT as H,
  ARENA_WIDTH as W,
  type EngineFactory,
  type EnginePhase,
  type EngineState,
} from "../game-engine";
import { playSound } from "../audio";

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

const COLORS = [
  null,
  "#4dd0e1", // I - cyan
  "#ffd54f", // O - amarillo
  "#ba68c8", // T - violeta
  "#81c784", // S - verde
  "#e57373", // Z - rojo
  "#90caf9", // J - celeste
  "#ffb74d", // L - naranja
  "#9e9e9e", // N - "tuerca" (gris metálico, pieza propia del original)
] as const;

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

const LINE_SCORES = [0, 100, 300, 500, 800];

type Piece = { type: number; shape: number[][]; x: number; y: number };

export const createTetrisEngine: EngineFactory = (canvas, onState) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");

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
    const type = Math.floor(Math.random() * 8) + 1;
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
    current = randomPiece();
    next = randomPiece();
  }

  function merge() {
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

  function currentPhase(): EnginePhase {
    if (isPaused) return "paused";
    if (internalPhase === "gameover") return "gameover";
    return "playing";
  }

  function reportState() {
    const badge = { label: "LÍNEAS", value: String(lines) };
    const next: EngineState = { score, lives, level, phase: currentPhase(), badge };
    const prev = lastReported;
    const changed =
      !prev ||
      prev.score !== next.score ||
      prev.lives !== next.lives ||
      prev.level !== next.level ||
      prev.phase !== next.phase ||
      prev.badge?.label !== next.badge?.label ||
      prev.badge?.value !== next.badge?.value;
    if (!changed) return;
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
  function drawBlock(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    colorIndex: number,
    size: number,
    alpha = 1
  ) {
    if (!colorIndex) return;
    context.globalAlpha = alpha;
    context.fillStyle = COLORS[colorIndex] ?? "#fff";
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.fillStyle = "rgba(255,255,255,0.12)";
    context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    context.globalAlpha = 1;
  }

  function drawBoardFrame() {
    ctx!.strokeStyle = "rgba(255,255,255,0.08)";
    ctx!.lineWidth = 0.5;
    for (let c = 1; c < COLS; c++) {
      ctx!.beginPath();
      ctx!.moveTo(c * BLOCK, 0);
      ctx!.lineTo(c * BLOCK, BOARD_H);
      ctx!.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx!.beginPath();
      ctx!.moveTo(0, r * BLOCK);
      ctx!.lineTo(BOARD_W, r * BLOCK);
      ctx!.stroke();
    }
    ctx!.strokeStyle = "rgba(255,255,255,0.35)";
    ctx!.lineWidth = 1;
    ctx!.strokeRect(0, 0, BOARD_W, BOARD_H);
  }

  function drawNextPreview() {
    ctx!.save();
    ctx!.font = "10px monospace";
    ctx!.fillStyle = "rgba(255,255,255,0.5)";
    ctx!.fillText("SIGUIENTE", NEXT_ORIGIN_X, NEXT_ORIGIN_Y - 16);

    const shape = next.shape;
    const offX = Math.floor((4 - shape[0].length) / 2);
    const offY = Math.floor((4 - shape.length) / 2);
    ctx!.translate(NEXT_ORIGIN_X, NEXT_ORIGIN_Y);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        drawBlock(ctx!, offX + c, offY + r, shape[r][c], BLOCK);
      }
    }
    ctx!.restore();
  }

  function draw() {
    ctx!.fillStyle = "#000";
    ctx!.fillRect(0, 0, W, H);

    ctx!.save();
    ctx!.translate(BOARD_OFFSET_X, BOARD_OFFSET_Y);
    drawBoardFrame();

    // tablero ya asentado
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        drawBlock(ctx!, c, r, board[r][c], BLOCK);
      }
    }

    // pieza fantasma (proyección de aterrizaje)
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < current.shape[r].length; c++) {
        if (current.shape[r][c])
          drawBlock(ctx!, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
      }
    }

    // pieza actual
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < current.shape[r].length; c++) {
        if (current.shape[r][c])
          drawBlock(ctx!, current.x + c, current.y + r, current.shape[r][c], BLOCK);
      }
    }

    ctx!.restore();

    drawNextPreview();
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
