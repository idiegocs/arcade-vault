/**
 * Motor de "RANARIA" (Frogger), escrito desde cero — no hay fuente de
 * Frogger en `references/started-games/`. Spec:
 * `specs/game-jam/03-Frogger/01-frogger-core.md`.
 *
 * - Cuadrícula de 16×14 celdas de 40px (640×560), centrada en el arena de
 *   800×600 con `ctx.translate(OFFSET_X, OFFSET_Y)`. La franja negra inferior
 *   aloja la barra de tiempo.
 * - Zonas por fila (0 = arriba): 0 bocas destino, 1–6 río, 7 franja segura,
 *   8–12 carretera, 13 base de inicio.
 * - No dibuja su propio HUD (score/vidas/nivel) ni overlays de pausa o game
 *   over — eso vive en el shell de React. El tiempo restante va en `badge`.
 */
import {
  ARENA_HEIGHT as H,
  ARENA_WIDTH as W,
  type EngineFactory,
  type EnginePhase,
  type EngineState,
} from "../game-engine";

const COLS = 16;
const ROWS = 14;
const CELL = 40;
const GRID_W = COLS * CELL; // 640
const GRID_H = ROWS * CELL; // 560
const OFFSET_X = (W - GRID_W) / 2; // 80
const OFFSET_Y = (H - GRID_H) / 2; // 20

// Zonas (índice de fila, 0 = arriba)
const ROW_GOALS = 0;
const ROW_RIVER_TOP = 1;
const ROW_RIVER_BOT = 6;
const ROW_SAFE_MID = 7;
const ROW_ROAD_TOP = 8;
const ROW_ROAD_BOT = 12;
const ROW_START = 13;

const START_COL = 7;
const START_LIVES = 3;

/** Las 5 bocas destino: columna izquierda de cada una (ocupan 2 columnas),
 * separadas por 1 columna de orilla en los bordes y 2 entre bocas. */
const GOAL_COLS = [1, 4, 7, 10, 13];

const COLORS = {
  background: "#000",
  goalBank: "#0f5132",
  goal: "#14532d",
  goalBorder: "#facc15",
  river: "#0b1d4a",
  safe: "#1a3d1a",
  road: "#111",
  laneMark: "rgba(255,255,255,0.25)",
  frog: "#4ade80",
  frogDark: "#15803d",
  eyeWhite: "#fff",
  eyePupil: "#000",
};

type Direction = "up" | "down" | "left" | "right";

interface Entity {
  /** Columna izquierda, continua (las entidades se mueven en px/s). */
  col: number;
  width: number;
  type: "car" | "truck" | "log" | "turtle";
  /** Solo tortugas: hundidas no sostienen a la rana. */
  submerged?: boolean;
}

interface Lane {
  row: number;
  /** Celdas por segundo. */
  speed: number;
  dir: 1 | -1;
  entities: Entity[];
}

interface Frog {
  /** Columna continua: en el río la arrastra la entidad que la sostiene. */
  col: number;
  row: number;
  animating: boolean;
  /** ms transcurridos de la animación de salto. */
  animT: number;
  fromCol: number;
  fromRow: number;
  targetCol: number;
  targetRow: number;
  facing: Direction;
}

export const createFroggerEngine: EngineFactory = (canvas, onState) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");

  // ── Estado mutable del juego ────────────────────────────────────────
  let score = 0;
  let lives = START_LIVES;
  let level = 1;
  let internalPhase: "playing" | "gameover" = "playing";
  let isPaused = false;
  let lanes: Lane[] = [];
  /** Bocas ocupadas en la ronda actual (mismo índice que `GOAL_COLS`). */
  let goalsFilled: boolean[] = [];
  let frog: Frog = makeFrog();

  function makeFrog(): Frog {
    return {
      col: START_COL,
      row: ROW_START,
      animating: false,
      animT: 0,
      fromCol: START_COL,
      fromRow: ROW_START,
      targetCol: START_COL,
      targetRow: ROW_START,
      facing: "up",
    };
  }

  function initGame() {
    score = 0;
    lives = START_LIVES;
    level = 1;
    internalPhase = "playing";
    isPaused = false;
    lanes = [];
    goalsFilled = GOAL_COLS.map(() => false);
    frog = makeFrog();
  }

  // ── Reporte de estado a React ──────────────────────────────────────
  let lastReported: EngineState | null = null;

  function currentPhase(): EnginePhase {
    if (isPaused) return "paused";
    if (internalPhase === "gameover") return "gameover";
    return "playing";
  }

  function reportState() {
    const next: EngineState = { score, lives, level, phase: currentPhase() };
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

  // ── Update ──────────────────────────────────────────────────────────
  function update(_dt: number) {
    if (internalPhase === "gameover") {
      reportState();
      return;
    }
    reportState();
  }

  // ── Draw ────────────────────────────────────────────────────────────
  function rowColor(row: number): string {
    if (row === ROW_GOALS) return COLORS.goalBank;
    if (row >= ROW_RIVER_TOP && row <= ROW_RIVER_BOT) return COLORS.river;
    if (row >= ROW_ROAD_TOP && row <= ROW_ROAD_BOT) return COLORS.road;
    return COLORS.safe; // ROW_SAFE_MID y ROW_START
  }

  function drawZones() {
    const c = ctx!;
    for (let row = 0; row < ROWS; row++) {
      c.fillStyle = rowColor(row);
      c.fillRect(0, row * CELL, GRID_W, CELL);
    }
    // Líneas discontinuas entre carriles de carretera
    c.strokeStyle = COLORS.laneMark;
    c.lineWidth = 2;
    c.setLineDash([16, 16]);
    for (let row = ROW_ROAD_TOP + 1; row <= ROW_ROAD_BOT; row++) {
      c.beginPath();
      c.moveTo(0, row * CELL);
      c.lineTo(GRID_W, row * CELL);
      c.stroke();
    }
    c.setLineDash([]);
    // Bocas destino
    GOAL_COLS.forEach((col, i) => {
      const x = col * CELL;
      c.fillStyle = COLORS.goal;
      c.fillRect(x, 4, CELL * 2, CELL - 4);
      c.strokeStyle = COLORS.goalBorder;
      c.lineWidth = 2;
      c.strokeRect(x + 1, 5, CELL * 2 - 2, CELL - 6);
      if (goalsFilled[i]) drawFrogAt(col + 0.5, ROW_GOALS, "down", false);
    });
  }

  /** Dibuja una rana centrada en la celda (`col`, `row`). `col` puede ser
   * fraccionario (arrastre en el río, animación de salto). */
  function drawFrogAt(col: number, row: number, facing: Direction, jumping: boolean) {
    const c = ctx!;
    const cx = col * CELL + CELL / 2;
    const cy = row * CELL + CELL / 2;
    const angle = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[facing];
    c.save();
    c.translate(cx, cy);
    c.rotate(angle);
    // Patas: extendidas durante el salto
    const reach = jumping ? 16 : 11;
    c.fillStyle = COLORS.frogDark;
    for (const sx of [-1, 1]) {
      c.fillRect(sx * reach - 3, -12, 6, 8);
      c.fillRect(sx * reach - 3, 5, 6, 8);
    }
    // Cuerpo: elipse 28×24
    c.fillStyle = COLORS.frog;
    c.beginPath();
    c.ellipse(0, 0, 14, 12, 0, 0, Math.PI * 2);
    c.fill();
    // Ojos
    for (const sx of [-1, 1]) {
      c.fillStyle = COLORS.eyeWhite;
      c.beginPath();
      c.arc(sx * 6, -8, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = COLORS.eyePupil;
      c.beginPath();
      c.arc(sx * 6, -9, 2, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function draw() {
    const c = ctx!;
    c.fillStyle = COLORS.background;
    c.fillRect(0, 0, W, H);
    c.save();
    c.translate(OFFSET_X, OFFSET_Y);
    drawZones();
    drawFrogAt(frog.col, frog.row, frog.facing, frog.animating);
    c.restore();
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
    },
  };
};
