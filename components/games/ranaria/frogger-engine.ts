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
 * - Sonido vía `defineSounds` (`../audio`): hop/squash/splash/goal/round.
 * - Skins visuales (`clasico`/`neon`/`retro`, ver `SKINS`), con el patrón de
 *   CAÍDA: el dibujo lee siempre de `palette` y `setSkin` la cambia en vivo.
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
  hop: () => beep(520, 0.04, "square", 0.06),
  squash: () => {
    beep(160, 0.18, "sawtooth", 0.18);
    beep(90, 0.25, "square", 0.12);
  },
  splash: () => {
    beep(320, 0.12, "triangle", 0.14);
    beep(180, 0.3, "sine", 0.14);
  },
  goal: () => {
    beep(660, 0.08, "triangle", 0.15);
    beep(990, 0.16, "triangle", 0.12);
  },
  round: () => {
    beep(523, 0.12, "square", 0.12);
    beep(784, 0.2, "square", 0.1);
    beep(1047, 0.35, "triangle", 0.12);
  },
});

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
/** Duración de la animación de un salto de 1 celda. */
const HOP_MS = 120;
/** Margen horizontal (en celdas) del cuerpo de la rana para chocar con un
 * vehículo — evita muertes por un roce de píxeles con la celda vecina. */
const FROG_HIT_INSET = 0.15;
/** Temporizador por viaje: 30 s en el nivel 1, 1 s menos por nivel, mínimo 8 s. */
const BASE_TIME_S = 30;
const MIN_TIME_S = 8;

function tripTime(level: number): number {
  return Math.max(MIN_TIME_S, BASE_TIME_S + 1 - level);
}

// Puntuación (spec, Modelo de datos) — todo entero.
const PTS_NEW_ROW = 10;
const PTS_GOAL = 50;
const PTS_PER_SECOND_LEFT = 10;
const PTS_ROUND = 200;

/** Las 5 bocas destino: columna izquierda de cada una (ocupan 2 columnas),
 * separadas por 1 columna de orilla en los bordes y 2 entre bocas. */
const GOAL_COLS = [1, 4, 7, 10, 13];

type FroggerPalette = {
  /** Fondo de todo el canvas (incluye la franja de la barra de tiempo). */
  background: string;
  goalBank: string;
  goal: string;
  goalBorder: string;
  river: string;
  safe: string;
  road: string;
  /** Líneas discontinuas entre carriles de carretera. */
  laneMark: string;
  /** Marcas de oleaje sobre el río (`null` = agua lisa). */
  riverMark: string | null;
  /** Línea en los límites entre zonas (`null` = sin línea). */
  zoneLine: string | null;
  /** Marco alrededor de la cuadrícula (`null` = sin marco). */
  frame: string | null;
  cars: string[];
  wheel: string;
  window: string;
  truck: string;
  truckCab: string;
  /** Rayas de carga sobre la caja del camión (`null` = caja lisa). */
  truckStripe: string | null;
  log: string;
  logGrain: string;
  turtle: string;
  turtleShell: string;
  turtleSubmerged: string;
  /** Trazo de la tortuga sumergida (`[]` = continuo). */
  submergedDash: number[];
  timeHigh: string;
  timeMid: string;
  timeLow: string;
  timeTrack: string;
  /** Barra de tiempo en bloques de N px con 2 px de hueco (0 = continua). */
  timeSegment: number;
  frog: string;
  frogDark: string;
  eyeWhite: string;
  eyePupil: string;
  /** `shadowBlur` de lo que brilla (0 = sin glow); el `shadowColor` es el
   * color de cada cosa. */
  glow: number;
  /** Entidades como "tubo de neón": contorno brillante, relleno casi
   * transparente y núcleo blanco fino (`null` = relleno sólido). */
  tube: { lineWidth: number; fillAlpha: number; core: string } | null;
  /** Borde duro alrededor de cada entidad (`null` = sin borde). */
  edge: string | null;
  edgeWidth: number;
  /** Siluetas de píxel: troncos de esquinas rectas y tortugas octogonales. */
  chunky: boolean;
};

/** Paleta NES reducida a 6 tonos. */
const NES = {
  black: "#000000",
  blue: "#0000bc",
  white: "#fcfcfc",
  green: "#00a800",
  red: "#d82800",
  ochre: "#ac7c00",
};

const SKINS: Record<SkinId, FroggerPalette> = {
  // Look original del motor, copiado tal cual.
  clasico: {
    background: "#000",
    goalBank: "#0f5132",
    goal: "#14532d",
    goalBorder: "#facc15",
    river: "#0b1d4a",
    safe: "#1a3d1a",
    road: "#111",
    laneMark: "rgba(255,255,255,0.25)",
    riverMark: null,
    zoneLine: null,
    frame: null,
    cars: ["#ef4444", "#facc15", "#3b82f6", "#f97316"],
    wheel: "#222",
    window: "rgba(255,255,255,0.6)",
    truck: "#9ca3af",
    truckCab: "#6b7280",
    truckStripe: null,
    log: "#8b5a2b",
    logGrain: "#5c3a1a",
    turtle: "#16a34a",
    turtleShell: "#14532d",
    turtleSubmerged: "rgba(74,222,128,0.35)",
    submergedDash: [],
    timeHigh: "#22c55e",
    timeMid: "#facc15",
    timeLow: "#ef4444",
    timeTrack: "#1f2937",
    timeSegment: 0,
    frog: "#4ade80",
    frogDark: "#15803d",
    eyeWhite: "#fff",
    eyePupil: "#000",
    glow: 0,
    tube: null,
    edge: null,
    edgeWidth: 0,
    chunky: false,
  },
  // Synthwave: tubos de neón huecos con glow fuerte sobre fondo violeta,
  // marco y límites de zona magenta. Río azul oscuro con oleaje cyan vs.
  // asfalto violeta con rayas magenta. Rana verde lima, tortugas cyan,
  // troncos naranja, camiones violeta; la tortuga sumergida es un anillo
  // tenue punteado y sin glow.
  neon: {
    background: "#0b0016",
    goalBank: "#1a0038",
    goal: "#12002a",
    goalBorder: "#ff2bd6",
    river: "#00143a",
    safe: "#1f0040",
    road: "#12002a",
    laneMark: "rgba(255,43,214,0.55)",
    riverMark: "rgba(0,245,255,0.3)",
    zoneLine: "#ff2bd6",
    frame: "#ff2bd6",
    cars: ["#ff3864", "#f5ff00", "#00f5ff", "#ff8a00"],
    wheel: "#4b1d7a",
    window: "rgba(255,255,255,0.85)",
    truck: "#b967ff",
    truckCab: "#ff2bd6",
    truckStripe: null,
    log: "#ff8a00",
    logGrain: "rgba(255,138,0,0.6)",
    turtle: "#00f5ff",
    turtleShell: "rgba(0,245,255,0.7)",
    turtleSubmerged: "rgba(0,245,255,0.3)",
    submergedDash: [4, 6],
    timeHigh: "#00ff88",
    timeMid: "#f5ff00",
    timeLow: "#ff3864",
    timeTrack: "#1f0040",
    timeSegment: 0,
    frog: "#39ff14",
    frogDark: "#39ff14",
    eyeWhite: "#fff",
    eyePupil: "#0b0016",
    glow: 16,
    tube: { lineWidth: 3, fillAlpha: 0.14, core: "rgba(255,255,255,0.85)" },
    edge: null,
    edgeWidth: 0,
    chunky: false,
  },
  // 6 tonos NES, sin glow ni alpha, bordes negros duros. Río azul con
  // oleaje blanco vs. asfalto negro; coches rojo/blanco de 1–2 celdas vs.
  // camiones ocre rayados con cabina blanca; troncos ocre rectos vs.
  // tortugas rojas octogonales (como el arcade); la sumergida queda como
  // anillo blanco punteado. Barra de tiempo en bloques.
  retro: {
    background: NES.black,
    goalBank: NES.green,
    goal: NES.black,
    goalBorder: NES.white,
    river: NES.blue,
    safe: NES.ochre,
    road: NES.black,
    laneMark: NES.white,
    riverMark: NES.white,
    zoneLine: null,
    frame: NES.white,
    cars: [NES.red, NES.white],
    wheel: NES.white,
    window: NES.blue,
    truck: NES.ochre,
    truckCab: NES.white,
    truckStripe: NES.black,
    log: NES.ochre,
    logGrain: NES.black,
    turtle: NES.red,
    turtleShell: NES.black,
    turtleSubmerged: NES.white,
    submergedDash: [4, 4],
    timeHigh: NES.green,
    timeMid: NES.ochre,
    timeLow: NES.red,
    timeTrack: NES.blue,
    timeSegment: 20,
    frog: NES.green,
    frogDark: NES.green,
    eyeWhite: NES.white,
    eyePupil: NES.black,
    glow: 0,
    tube: null,
    edge: NES.black,
    edgeWidth: 2,
    chunky: true,
  },
};

/** Ciclo de inmersión de las tortugas: visibles 3s, sumergidas 1,5s. */
const TURTLE_UP_S = 3;
const TURTLE_DOWN_S = 1.5;
const TURTLE_CYCLE_S = TURTLE_UP_S + TURTLE_DOWN_S;
/** Cada nivel acelera todas las entidades un 15%. */
const LEVEL_SPEEDUP = 1.15;

type Direction = "up" | "down" | "left" | "right";

const DIR_DELTA: Record<Direction, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

/** Orientaciones de la rana, en el orden de sus sprites (ver `FACING_INDEX`). */
const FACINGS: readonly Direction[] = ["up", "right", "down", "left"];
const FACING_INDEX: Record<Direction, number> = { up: 0, right: 1, down: 2, left: 3 };
const FACING_ANGLE: Record<Direction, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: -Math.PI / 2,
};
/** Alto de la barra de tiempo, en la franja negra bajo la cuadrícula. */
const TIME_BAR_H = 10;

const DIRECTION_KEYS: Record<string, Direction> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

interface Entity {
  /** Columna izquierda, continua (las entidades se mueven en px/s). */
  col: number;
  width: number;
  type: "car" | "truck" | "log" | "turtle";
  /** Solo tortugas: hundidas no sostienen a la rana. */
  submerged?: boolean;
  /** Solo tortugas: segundos dentro del ciclo de inmersión. */
  diveT?: number;
}

interface Lane {
  row: number;
  /** Celdas por segundo. */
  speed: number;
  dir: 1 | -1;
  entities: Entity[];
}

/** Diseño de un carril en el nivel 1: `count` entidades de `width` celdas,
 * repartidas a distancia constante (hueco ≥ 1 celda en todos). Velocidades
 * en celdas/s: carretera 2,25–6, río 1,5–4,5 (spec, Modelo de datos). */
type LaneSpec = {
  row: number;
  type: Entity["type"];
  width: number;
  count: number;
  speed: number;
  dir: 1 | -1;
};

const LANE_SPECS: LaneSpec[] = [
  // Río (filas 1–6)
  { row: 1, type: "log", width: 3, count: 3, speed: 2.2, dir: 1 },
  { row: 2, type: "log", width: 2, count: 4, speed: 3.0, dir: -1 },
  { row: 3, type: "log", width: 4, count: 3, speed: 1.5, dir: 1 },
  { row: 4, type: "turtle", width: 2, count: 4, speed: 2.4, dir: -1 },
  { row: 5, type: "log", width: 3, count: 3, speed: 2.0, dir: 1 },
  { row: 6, type: "turtle", width: 3, count: 4, speed: 1.8, dir: -1 },
  // Carretera (filas 8–12)
  { row: 8, type: "truck", width: 3, count: 2, speed: 2.6, dir: -1 },
  { row: 9, type: "car", width: 1, count: 2, speed: 4.0, dir: 1 },
  { row: 10, type: "car", width: 2, count: 3, speed: 3.75, dir: -1 },
  { row: 11, type: "car", width: 1, count: 3, speed: 3.0, dir: 1 },
  { row: 12, type: "car", width: 1, count: 3, speed: 2.25, dir: -1 },
];

/** Largo del recorrido de wrap de una entidad: sale por un borde y reaparece
 * por el otro manteniendo la distancia con las demás del carril. */
function wrapSpan(width: number): number {
  return COLS + width;
}

function buildLanes(level: number): Lane[] {
  const factor = Math.pow(LEVEL_SPEEDUP, level - 1);
  return LANE_SPECS.map((spec) => {
    const span = wrapSpan(spec.width);
    const spacing = span / spec.count;
    const entities: Entity[] = [];
    for (let i = 0; i < spec.count; i++) {
      const entity: Entity = { col: i * spacing - spec.width, width: spec.width, type: spec.type };
      if (spec.type === "turtle") {
        // Desfasa los grupos para que no se hundan todos a la vez.
        entity.diveT = (i * TURTLE_CYCLE_S) / spec.count;
        entity.submerged = false;
      }
      entities.push(entity);
    }
    return { row: spec.row, speed: spec.speed * factor, dir: spec.dir, entities };
  });
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
  /** Tronco/tortugas que la llevan en el río: si salen por un borde y
   * reaparecen por el otro, la rana viaja con ellos. */
  riding: Entity | null;
}

export const createFroggerEngine: EngineFactory = (canvas, onState, options) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");

  /** Paleta activa — solo visual; `setSkin` la reasigna en vivo. */
  let skinId: SkinId = options?.skin && SKINS[options.skin] ? options.skin : DEFAULT_SKIN;
  let palette: FroggerPalette = SKINS[skinId];

  // ── Input ────────────────────────────────────────────────────────────
  /** Un único salto pendiente: el pedido durante una animación se ejecuta
   * al terminarla; uno nuevo reemplaza al anterior. */
  let pendingDir: Direction | null = null;

  const handleKeyDown = (e: KeyboardEvent) => {
    const dir = DIRECTION_KEYS[e.code];
    if (!dir) return;
    e.preventDefault();
    // Una pulsación = un salto: mantener la tecla no encadena saltos.
    if (e.repeat) return;
    if (internalPhase === "gameover" || isPaused) return;
    pendingDir = dir;
  };

  window.addEventListener("keydown", handleKeyDown);

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
  /** Fila más alta (índice más bajo) alcanzada en la ronda: solo avanzar más
   * allá suma puntos, así ir y venir no se puede farmear. */
  let bestRow = ROW_START;
  /** Segundos restantes del viaje actual de la rana. */
  let timeLeft = tripTime(1);

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
      riding: null,
    };
  }

  function initGame() {
    score = 0;
    lives = START_LIVES;
    level = 1;
    internalPhase = "playing";
    isPaused = false;
    lanes = buildLanes(level);
    goalsFilled = GOAL_COLS.map(() => false);
    frog = makeFrog();
    pendingDir = null;
    bestRow = ROW_START;
    timeLeft = tripTime(level);
  }

  // ── Reporte de estado a React ──────────────────────────────────────
  let lastReported: EngineState | null = null;

  function currentPhase(): EnginePhase {
    if (isPaused) return "paused";
    if (internalPhase === "gameover") return "gameover";
    return "playing";
  }

  function reportState() {
    const next: EngineState = {
      score,
      lives,
      level,
      phase: currentPhase(),
      badge: { label: "TIEMPO", value: String(Math.ceil(timeLeft)) },
    };
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
  function updateLanes(dt: number) {
    for (const lane of lanes) {
      for (const e of lane.entities) {
        e.col += lane.speed * lane.dir * dt;
        const span = wrapSpan(e.width);
        let shift = 0;
        if (lane.dir === 1 && e.col >= COLS) shift = -span;
        else if (lane.dir === -1 && e.col <= -e.width) shift = span;
        if (shift !== 0) {
          e.col += shift;
          // La rana montada reaparece del otro lado junto con su tronco.
          if (frog.riding === e) frog.col += shift;
        }
        if (e.type === "turtle") {
          e.diveT = ((e.diveT ?? 0) + dt) % TURTLE_CYCLE_S;
          e.submerged = e.diveT >= TURTLE_UP_S;
        }
      }
    }
  }

  /** Arranca el salto pendiente, si lo hay y el destino está dentro de la
   * cuadrícula (bordes laterales y fila de inicio: el salto se ignora). */
  function tryStartHop() {
    if (!pendingDir) return;
    const dir = pendingDir;
    pendingDir = null;
    frog.facing = dir;
    const { dc, dr } = DIR_DELTA[dir];
    // En el río la columna es continua: se salta desde la celda más cercana.
    const fromCol = Math.round(frog.col);
    const targetCol = fromCol + dc;
    const targetRow = frog.row + dr;
    if (targetCol < 0 || targetCol >= COLS || targetRow < ROW_GOALS || targetRow > ROW_START)
      return;
    frog.animating = true;
    frog.animT = 0;
    frog.riding = null;
    playSound("hop");
    frog.fromCol = frog.col;
    frog.fromRow = frog.row;
    frog.targetCol = targetCol;
    frog.targetRow = targetRow;
  }

  // ── Colisiones, río y bocas ─────────────────────────────────────────
  function laneAt(row: number): Lane | undefined {
    return lanes.find((l) => l.row === row);
  }

  function isRiverRow(row: number): boolean {
    return row >= ROW_RIVER_TOP && row <= ROW_RIVER_BOT;
  }

  function isRoadRow(row: number): boolean {
    return row >= ROW_ROAD_TOP && row <= ROW_ROAD_BOT;
  }

  function checkRoadCollision(): boolean {
    const lane = laneAt(frog.row);
    if (!lane) return false;
    const left = frog.col + FROG_HIT_INSET;
    const right = frog.col + 1 - FROG_HIT_INSET;
    return lane.entities.some((e) => left < e.col + e.width && right > e.col);
  }

  /** Entidad del río que sostiene a la rana (su centro cae encima), o
   * `null` si está en el agua o sobre tortugas sumergidas. */
  function getSupport(): Entity | null {
    const lane = laneAt(frog.row);
    if (!lane) return null;
    const center = frog.col + 0.5;
    const e = lane.entities.find((en) => center >= en.col && center <= en.col + en.width);
    if (!e || e.submerged) return null;
    return e;
  }

  /** Índice de la boca cuyas 2 columnas contienen `col`, o -1. */
  function goalIndexAt(col: number): number {
    return GOAL_COLS.findIndex((gc) => col === gc || col === gc + 1);
  }

  /** Vuelve la rana a la base de inicio para un viaje nuevo. */
  function respawnFrog() {
    frog = makeFrog();
    pendingDir = null;
    timeLeft = tripTime(level);
  }

  /** Resta una vida: con vidas restantes la rana vuelve al inicio; sin
   * vidas, termina la partida (el shell guarda el score). */
  function killFrog(cause: "squash" | "splash") {
    playSound(cause);
    lives = Math.max(0, lives - 1);
    if (lives === 0) {
      internalPhase = "gameover";
      pendingDir = null;
      return;
    }
    respawnFrog();
  }

  /** Las 5 bocas llenas: bonus, nivel nuevo con carriles más rápidos y
   * menos tiempo, bocas vacías y filas a estrenar otra vez. */
  function completeRound() {
    score += PTS_ROUND;
    level += 1;
    lanes = buildLanes(level);
    goalsFilled = GOAL_COLS.map(() => false);
    bestRow = ROW_START;
    respawnFrog();
  }

  /** Lógica de la celda donde terminó un salto. */
  function onLanded() {
    if (frog.row < bestRow) {
      score += PTS_NEW_ROW * (bestRow - frog.row);
      bestRow = frog.row;
    }
    if (frog.row !== ROW_GOALS) return;
    const i = goalIndexAt(frog.col);
    if (i === -1 || goalsFilled[i]) {
      killFrog("splash");
      return;
    }
    goalsFilled[i] = true;
    score += PTS_GOAL + PTS_PER_SECOND_LEFT * Math.floor(timeLeft);
    if (goalsFilled.every(Boolean)) {
      playSound("round");
      completeRound();
    } else {
      playSound("goal");
      respawnFrog();
    }
  }

  function updateFrog(dt: number) {
    if (frog.animating) {
      frog.animT += dt * 1000;
      if (frog.animT < HOP_MS) return;
      frog.animating = false;
      frog.col = frog.targetCol;
      frog.row = frog.targetRow;
      onLanded();
      return;
    }
    // Quieta (o recién aterrizada): carretera y río se evalúan cada frame —
    // un coche que la alcanza o una tortuga que se hunde la matan aunque
    // no se mueva. En el aire (animando) no la toca nada.
    if (isRoadRow(frog.row) && checkRoadCollision()) {
      killFrog("squash");
      return;
    }
    if (isRiverRow(frog.row)) {
      const support = getSupport();
      if (!support) {
        killFrog("splash");
        return;
      }
      frog.riding = support;
      const lane = laneAt(frog.row)!;
      frog.col += lane.speed * lane.dir * dt;
    } else {
      frog.riding = null;
    }
    tryStartHop();
  }

  function update(dt: number) {
    if (internalPhase === "gameover") {
      reportState();
      return;
    }
    updateLanes(dt);
    timeLeft = Math.max(0, timeLeft - dt);
    if (timeLeft === 0) killFrog("splash");
    else updateFrog(dt);
    reportState();
  }

  // ── Draw ────────────────────────────────────────────────────────────
  // Todo color sale de `palette`. Cómo se pinta cada entidad depende de la
  // skin, no de `if`s sueltos: relleno plano (CLÁSICO), tubo de neón hueco
  // con glow (NEÓN) o relleno sólido con borde duro (RETRO) — ver `paint`.
  //
  // Rendimiento (spec 14): nada de eso se pinta por frame. El fondo estático
  // (zonas, oleaje, carriles, límites, bocas vacías y marco) vive en
  // `bgCache`, y cada entidad, la rana y la barra de tiempo se pre-renderizan
  // una vez por skin en sprites con un margen de `pad` px para que el glow no
  // se corte. `draw()` solo hace `drawImage`, sin allocar. `setSkin` los
  // invalida (`invalidateCaches`) y se regeneran en el siguiente `draw()`.

  /** Pinta la figura que arma `path` con `color` según la skin activa. */
  function paint(c: CanvasRenderingContext2D, color: string, path: () => void) {
    const tube = palette.tube;
    c.beginPath();
    path();
    if (tube) {
      c.globalAlpha = tube.fillAlpha;
      c.fillStyle = color;
      c.fill();
      c.globalAlpha = 1;
      if (palette.glow > 0) {
        c.shadowColor = color;
        c.shadowBlur = palette.glow;
      }
      c.strokeStyle = color;
      c.lineWidth = tube.lineWidth;
      c.stroke();
      c.shadowBlur = 0;
      c.strokeStyle = tube.core;
      c.lineWidth = 1;
      c.stroke();
      return;
    }
    c.fillStyle = color;
    c.fill();
    if (palette.edge) {
      c.strokeStyle = palette.edge;
      c.lineWidth = palette.edgeWidth;
      c.stroke();
    }
  }

  /** Activa el glow de la skin (si tiene) con `color`; `noGlow` lo apaga. */
  function glowOn(c: CanvasRenderingContext2D, color: string) {
    if (palette.glow <= 0) return;
    c.shadowColor = color;
    c.shadowBlur = palette.glow;
  }

  function noGlow(c: CanvasRenderingContext2D) {
    c.shadowBlur = 0;
  }

  /** Octógono de radio `r` (silueta de píxel para tortugas en RETRO). */
  function octagonPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    const k = r * 0.41;
    c.moveTo(cx - k, cy - r);
    c.lineTo(cx + k, cy - r);
    c.lineTo(cx + r, cy - k);
    c.lineTo(cx + r, cy + k);
    c.lineTo(cx + k, cy + r);
    c.lineTo(cx - k, cy + r);
    c.lineTo(cx - r, cy + k);
    c.lineTo(cx - r, cy - k);
    c.closePath();
  }

  function rowColor(row: number): string {
    if (row === ROW_GOALS) return palette.goalBank;
    if (row === ROW_SAFE_MID || row === ROW_START) return palette.safe;
    if (isRiverRow(row)) return palette.river;
    return palette.road;
  }

  /** Zonas, oleaje, carriles, límites y bocas vacías — solo para `bgCache`. */
  function drawZones(c: CanvasRenderingContext2D) {
    for (let row = 0; row < ROWS; row++) {
      c.fillStyle = rowColor(row);
      c.fillRect(0, row * CELL, GRID_W, CELL);
    }
    // Oleaje del río: separa el agua del asfalto también por textura.
    if (palette.riverMark) {
      c.fillStyle = palette.riverMark;
      for (let row = ROW_RIVER_TOP; row <= ROW_RIVER_BOT; row++) {
        const shift = row % 2 === 0 ? 4 : 24;
        for (let col = 0; col < COLS; col++) {
          c.fillRect(col * CELL + shift, row * CELL + 18, 12, 2);
        }
      }
    }
    // Líneas discontinuas entre carriles de carretera
    c.strokeStyle = palette.laneMark;
    c.lineWidth = 2;
    c.setLineDash([16, 16]);
    for (let row = ROW_ROAD_TOP + 1; row <= ROW_ROAD_BOT; row++) {
      c.beginPath();
      c.moveTo(0, row * CELL);
      c.lineTo(GRID_W, row * CELL);
      c.stroke();
    }
    c.setLineDash([]);
    // Límites entre zonas (bocas | río | franja segura | carretera | base)
    if (palette.zoneLine) {
      c.strokeStyle = palette.zoneLine;
      c.lineWidth = 2;
      glowOn(c, palette.zoneLine);
      c.beginPath();
      for (const row of [ROW_RIVER_TOP, ROW_SAFE_MID, ROW_ROAD_TOP, ROW_START]) {
        c.moveTo(0, row * CELL);
        c.lineTo(GRID_W, row * CELL);
      }
      c.stroke();
      noGlow(c);
    }
    // Bocas destino (vacías; las ranas que las llenan van aparte, por frame)
    for (const col of GOAL_COLS) {
      const x = col * CELL;
      c.fillStyle = palette.goal;
      c.fillRect(x, 4, CELL * 2, CELL - 4);
      c.strokeStyle = palette.goalBorder;
      c.lineWidth = 2;
      glowOn(c, palette.goalBorder);
      c.strokeRect(x + 1, 5, CELL * 2 - 2, CELL - 6);
      noGlow(c);
    }
  }

  /** Marco alrededor de la cuadrícula (NEÓN con glow, RETRO duro). */
  function drawFrame(c: CanvasRenderingContext2D) {
    if (!palette.frame) return;
    c.strokeStyle = palette.frame;
    c.lineWidth = 2;
    glowOn(c, palette.frame);
    c.strokeRect(-2, -2, GRID_W + 4, GRID_H + 4);
    noGlow(c);
  }

  function drawCar(c: CanvasRenderingContext2D, w: number, color: string, dir: 1 | -1) {
    c.fillStyle = palette.wheel;
    for (const wx of [6, w - 14]) {
      c.fillRect(wx, 4, 8, 6);
      c.fillRect(wx, CELL - 10, 8, 6);
    }
    paint(c, color, () => c.rect(2, 8, w - 4, CELL - 16));
    // Parabrisas hacia el sentido de marcha
    c.fillStyle = palette.window;
    c.fillRect(dir === 1 ? w - 14 : 6, 12, 8, CELL - 24);
  }

  function drawTruck(c: CanvasRenderingContext2D, w: number, dir: 1 | -1) {
    c.fillStyle = palette.wheel;
    for (const wx of [6, w / 2 - 4, w - 14]) {
      c.fillRect(wx, 3, 8, 6);
      c.fillRect(wx, CELL - 9, 8, 6);
    }
    const cabW = CELL - 8;
    const cabX = dir === 1 ? w - cabW - 2 : 2;
    const boxX = dir === 1 ? 2 : cabW + 4;
    const boxW = w - cabW - 6;
    paint(c, palette.truck, () => c.rect(boxX, 6, boxW, CELL - 12));
    // RETRO: rayas de carga — el camión no se confunde con un coche largo.
    if (palette.truckStripe) {
      c.fillStyle = palette.truckStripe;
      for (let sx = boxX + 10; sx < boxX + boxW - 6; sx += 10) c.fillRect(sx, 10, 2, CELL - 20);
    }
    paint(c, palette.truckCab, () => c.rect(cabX, 8, cabW, CELL - 16));
    c.fillStyle = palette.window;
    c.fillRect(dir === 1 ? cabX + cabW - 10 : cabX + 2, 12, 8, CELL - 24);
  }

  function drawLog(c: CanvasRenderingContext2D, w: number) {
    const radius = palette.chunky ? 0 : 12;
    paint(c, palette.log, () => c.roundRect(1, 5, w - 2, CELL - 10, radius));
    c.strokeStyle = palette.logGrain;
    c.lineWidth = 2;
    for (const gy of [14, CELL - 14]) {
      c.beginPath();
      c.moveTo(12, gy);
      c.lineTo(w - 12, gy);
      c.stroke();
    }
  }

  /** Una tortuga en la celda (0, 0). Un grupo de `width` repite el sprite. */
  function drawTurtle(c: CanvasRenderingContext2D, submerged: boolean) {
    const shape = (cx: number, cy: number, r: number) => {
      if (palette.chunky) octagonPath(c, cx, cy, r);
      else c.arc(cx, cy, r, 0, Math.PI * 2);
    };
    const cx = CELL / 2;
    const cy = CELL / 2;
    if (submerged) {
      // Hundida: solo un anillo tenue/punteado, sin relleno ni glow —
      // tiene que leerse como "no sostiene" en las 3 skins.
      c.strokeStyle = palette.turtleSubmerged;
      c.lineWidth = 2;
      c.setLineDash(palette.submergedDash);
      c.beginPath();
      shape(cx, cy, 14);
      c.stroke();
      c.setLineDash([]);
      return;
    }
    paint(c, palette.turtle, () => shape(cx, cy, 15));
    // Escamas del caparazón
    c.strokeStyle = palette.turtleShell;
    c.lineWidth = 2;
    c.beginPath();
    shape(cx, cy, 8);
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      c.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
      c.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15);
    }
    c.stroke();
  }

  /** Rana centrada en la celda (0, 0), mirando hacia `facing`. */
  function drawFrog(c: CanvasRenderingContext2D, facing: Direction, jumping: boolean) {
    c.save();
    c.translate(CELL / 2, CELL / 2);
    c.rotate(FACING_ANGLE[facing]);
    // Patas: extendidas durante el salto
    const reach = jumping ? 16 : 11;
    for (const sx of [-1, 1]) {
      paint(c, palette.frogDark, () => c.rect(sx * reach - 3, -12, 6, 8));
      paint(c, palette.frogDark, () => c.rect(sx * reach - 3, 5, 6, 8));
    }
    // Cuerpo: elipse 28×24
    paint(c, palette.frog, () => c.ellipse(0, 0, 14, 12, 0, 0, Math.PI * 2));
    // Ojos
    for (const sx of [-1, 1]) {
      c.fillStyle = palette.eyeWhite;
      c.beginPath();
      c.arc(sx * 6, -8, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = palette.eyePupil;
      c.beginPath();
      c.arc(sx * 6, -9, 2, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  // ── Cachés de dibujo (spec 14) ──────────────────────────────────────
  /** Margen de cada sprite: lo que se extiende el glow (≈ 1,5 × `shadowBlur`)
   * más el medio trazo; sin glow, solo el borde. */
  let pad = 0;
  /** Fondo estático completo (800×600), ya con `translate` aplicado. */
  let bgCache: HTMLCanvasElement | null = null;
  /** Sprites deduplicados por `"<skin>:<tipo>:<color>[:<ancho>:<dir>]"`. */
  const sprites = new Map<string, HTMLCanvasElement>();
  /** Sprite de cada entidad no-tortuga, por índice de carril y de entidad.
   * Depende solo de `LANE_SPECS` y la skin (los niveles no cambian tipos,
   * anchos ni colores), así que `draw()` no arma claves por frame. */
  let laneSprites: HTMLCanvasElement[][] = [];
  let turtleUp: HTMLCanvasElement | null = null;
  let turtleDown: HTMLCanvasElement | null = null;
  /** Rana por `FACING_INDEX[facing] * 2 + (saltando ? 1 : 0)`. */
  let frogSprites: HTMLCanvasElement[] = [];
  /** Barra de tiempo llena en cada color: alto, medio, bajo. */
  let timeSprites: HTMLCanvasElement[] = [];

  function sprite(
    key: string,
    w: number,
    h: number,
    render: (c: CanvasRenderingContext2D) => void
  ): HTMLCanvasElement {
    const fullKey = `${skinId}:${key}`;
    const cached = sprites.get(fullKey);
    if (cached) return cached;
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(w + 2 * pad);
    cv.height = Math.ceil(h + 2 * pad);
    const c = cv.getContext("2d")!;
    c.translate(pad, pad);
    render(c);
    sprites.set(fullKey, cv);
    return cv;
  }

  function buildCaches() {
    pad = palette.glow > 0 ? Math.ceil(palette.glow * 1.5) + 2 : 2;

    const bg = document.createElement("canvas");
    bg.width = W;
    bg.height = H;
    const b = bg.getContext("2d")!;
    b.fillStyle = palette.background;
    b.fillRect(0, 0, W, H);
    b.translate(OFFSET_X, OFFSET_Y);
    drawZones(b);
    // El marco va en el fondo: queda bajo las entidades, que de todos modos
    // se recortan a la cuadrícula (solo tapan su glow interior).
    drawFrame(b);
    bgCache = bg;

    laneSprites = LANE_SPECS.map((spec) => {
      const w = spec.width * CELL;
      const list: HTMLCanvasElement[] = [];
      for (let i = 0; i < spec.count; i++) {
        if (spec.type === "car") {
          const color = palette.cars[(spec.row + i) % palette.cars.length];
          list.push(
            sprite(`car:${color}:${w}:${spec.dir}`, w, CELL, (c) => drawCar(c, w, color, spec.dir))
          );
        } else if (spec.type === "truck") {
          list.push(sprite(`truck:${w}:${spec.dir}`, w, CELL, (c) => drawTruck(c, w, spec.dir)));
        } else if (spec.type === "log") {
          list.push(sprite(`log:${w}`, w, CELL, (c) => drawLog(c, w)));
        }
      }
      return list;
    });
    turtleUp = sprite("turtle:up", CELL, CELL, (c) => drawTurtle(c, false));
    turtleDown = sprite("turtle:down", CELL, CELL, (c) => drawTurtle(c, true));

    frogSprites = [];
    for (const facing of FACINGS) {
      frogSprites.push(sprite(`frog:${facing}:0`, CELL, CELL, (c) => drawFrog(c, facing, false)));
      frogSprites.push(sprite(`frog:${facing}:1`, CELL, CELL, (c) => drawFrog(c, facing, true)));
    }

    timeSprites = [palette.timeHigh, palette.timeMid, palette.timeLow].map((color) =>
      sprite(`time:${color}`, GRID_W, TIME_BAR_H, (c) => {
        c.fillStyle = color;
        glowOn(c, color);
        c.fillRect(0, 0, GRID_W, TIME_BAR_H);
        noGlow(c);
      })
    );
  }

  /** Un único punto de invalidación: `setSkin` (y `destroy`, para liberar). */
  function invalidateCaches() {
    bgCache = null;
    sprites.clear();
    laneSprites = [];
    turtleUp = null;
    turtleDown = null;
    frogSprites = [];
    timeSprites = [];
  }

  function drawFrogSprite(
    c: CanvasRenderingContext2D,
    col: number,
    row: number,
    facing: Direction,
    jumping: boolean
  ) {
    const s = frogSprites[FACING_INDEX[facing] * 2 + (jumping ? 1 : 0)];
    c.drawImage(s, Math.round(col * CELL) - pad, Math.round(row * CELL) - pad);
  }

  function drawLanes(c: CanvasRenderingContext2D) {
    for (let li = 0; li < lanes.length; li++) {
      const lane = lanes[li];
      const list = laneSprites[li];
      const y = lane.row * CELL - pad;
      const entities = lane.entities;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        const x = Math.round(e.col * CELL) - pad;
        if (e.type === "turtle") {
          const s = e.submerged ? turtleDown! : turtleUp!;
          for (let k = 0; k < e.width; k++) c.drawImage(s, x + k * CELL, y);
        } else {
          c.drawImage(list[i], x, y);
        }
      }
    }
  }

  /** Barra de tiempo en la franja negra bajo la cuadrícula (fuera del
   * `translate`): verde → amarillo → rojo según lo que queda. El sprite se
   * recorta al largo actual y se le pega la punta derecha, así el glow
   * también cierra en el extremo. */
  function drawTimeBar(c: CanvasRenderingContext2D) {
    const frac = timeLeft / tripTime(level);
    const y = OFFSET_Y + GRID_H + 5;
    c.fillStyle = palette.timeTrack;
    c.fillRect(OFFSET_X, y, GRID_W, TIME_BAR_H);
    const len = Math.round(GRID_W * frac);
    if (len > 0) {
      const s = timeSprites[frac > 0.5 ? 0 : frac > 0.25 ? 1 : 2];
      const h = s.height;
      c.drawImage(s, 0, 0, pad + len, h, OFFSET_X - pad, y - pad, pad + len, h);
      c.drawImage(s, pad + GRID_W, 0, pad, h, OFFSET_X + len, y - pad, pad, h);
    }
    // RETRO: la barra se corta en bloques, como un medidor de 8 bits.
    const seg = palette.timeSegment;
    if (seg > 0) {
      c.fillStyle = palette.timeTrack;
      for (let x = seg; x < GRID_W; x += seg) c.fillRect(OFFSET_X + x - 1, y, 2, TIME_BAR_H);
    }
  }

  function draw() {
    const c = ctx!;
    if (!bgCache) buildCaches();
    c.drawImage(bgCache!, 0, 0);
    c.save();
    c.translate(OFFSET_X, OFFSET_Y);
    for (let i = 0; i < GOAL_COLS.length; i++) {
      if (goalsFilled[i]) drawFrogSprite(c, GOAL_COLS[i] + 0.5, ROW_GOALS, "down", false);
    }
    // Un solo clip para entidades y rana: lo que asoma por los bordes se
    // recorta, y la rana montada en un tronco desaparece con él.
    c.beginPath();
    c.rect(0, 0, GRID_W, GRID_H);
    c.clip();
    drawLanes(c);
    const t = frog.animating ? Math.min(1, frog.animT / HOP_MS) : 1;
    const frogCol = frog.animating ? frog.fromCol + (frog.targetCol - frog.fromCol) * t : frog.col;
    const frogRow = frog.animating ? frog.fromRow + (frog.targetRow - frog.fromRow) * t : frog.row;
    drawFrogSprite(c, frogCol, frogRow, frog.facing, frog.animating);
    c.restore();
    drawTimeBar(c);
  }

  // ── Loop principal ──────────────────────────────────────────────────
  let lastTime: number | null = null;
  let rafId: number | null = null;

  function loop(ts: number) {
    const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
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
      skinId = SKINS[skin] ? skin : DEFAULT_SKIN;
      palette = SKINS[skinId];
      invalidateCaches();
      // En pausa o tras el game over no hay frames corriendo: redibuja una
      // vez para que se vea.
      if (rafId === null) draw();
    },
    destroy() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      window.removeEventListener("keydown", handleKeyDown);
      invalidateCaches();
    },
  };
};
