/**
 * Motor de "BLOQUE BUSTER" (Arkanoid), portado de
 * `references/started-games/04-arkanoid/game.js` + `levels.js` +
 * `assets/spritesheet.js`.
 *
 * Diferencias respecto al original:
 * - No dibuja su propio HUD (score/vidas/nivel) — eso vive en el shell de React.
 * - No tiene overlay propio de pausa, game over ni el menú clickeable de salto
 *   de nivel — el shell los controla vía `EngineHandle`; la tecla `P`/`Escape`
 *   del original no hace nada acá.
 * - El estado `'win'` del original (todos los bloques de los 5 niveles rotos)
 *   se mapea a `phase: "gameover"` — no hay un cuarto valor de `EnginePhase`.
 * - Perder la pelota resta una vida y repone la pelota sin resetear
 *   score/nivel/bloques restantes; solo `lives === 0` es `"gameover"` real.
 * - Sonido vía `components/games/audio.ts` (spec 08): `bounce`/`brick`/
 *   `lifeLost` sintetizados, en vez de los `.mp3` originales (no se migran).
 * - El spritesheet se carga de forma perezosa/asíncrona; el motor no dibuja
 *   sprites hasta que termina de cargar.
 * - Sin badge — este juego no tiene un indicador extra natural.
 * - Skins visuales (`clasico`/`neon`/`retro`, ver `SKINS`), con el patrón de
 *   CAÍDA (sección "Skins" de `../README.md`). CLÁSICO dibuja el spritesheet
 *   original tal cual; NEÓN y RETRO son vectoriales y no esperan a que cargue.
 *   Todo el dibujo lee de `palette`, nunca un literal. Solo visual: física,
 *   tamaños, hitboxes, niveles, puntaje, controles y sonidos no cambian.
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
  bounce: () => beep(600, 0.05, "square", 0.1),
  brick: () => beep(340, 0.07, "square", 0.15),
  lifeLost: () => {
    beep(300, 0.15, "sawtooth", 0.18);
    beep(180, 0.2, "sawtooth", 0.15);
  },
});

const SPRITESHEET_SRC = "/spritesheet-breakout.png";

const PADDLE_SPEED = 400;
const BLOCK_COLS = 10;
const BLOCK_W = 64;
const BLOCK_H = 24;
const BLOCKS_ORIGIN_X = (W - BLOCK_COLS * BLOCK_W) / 2;
const BLOCKS_ORIGIN_Y = 80;
const BASE_BALL_VX = 200;
const BASE_BALL_VY = -300;
const PADDLE_W = 81;
const PADDLE_H = 14;
const PADDLE_Y = 560;
const BALL_SIZE = 16;

type BlockColor = "gray" | "red" | "yellow" | "cyan" | "magenta" | "hotpink" | "green";
type Block = { x: number; y: number; w: number; h: number; color: BlockColor; alive: boolean };
type Explosion = { x: number; y: number; w: number; h: number; color: BlockColor; elapsed: number };
type Level = { speed: number; blocks: { col: number; row: number; color: BlockColor }[] };

// ── Niveles (portados tal cual de levels.js) ────────────────────────────
const LEVELS: Level[] = (() => {
  const rowColors1: BlockColor[] = ["red", "yellow", "cyan", "magenta", "hotpink", "green"];
  const rowColors2: BlockColor[] = ["gray", "cyan", "hotpink", "yellow", "magenta", "green"];
  const rowColors4: BlockColor[] = ["cyan", "magenta", "green", "yellow", "hotpink", "red"];

  const l1: Level["blocks"] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++) l1.push({ col, row, color: rowColors1[row] });

  const l2: Level["blocks"] = [];
  const pyStart = [4, 3, 2, 1, 0, 0];
  const pyEnd = [5, 6, 7, 8, 9, 9];
  for (let row = 0; row < 6; row++)
    for (let col = pyStart[row]; col <= pyEnd[row]; col++)
      l2.push({ col, row, color: rowColors2[row] });

  const l3: Level["blocks"] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++)
      if ((col + row) % 2 === 0) l3.push({ col, row, color: row < 3 ? "yellow" : "magenta" });

  const gaps4 = [
    [2, 5, 8],
    [0, 4, 7, 9],
    [1, 3, 6],
    [2, 5, 8, 9],
    [0, 4, 7],
    [1, 3, 6, 9],
  ];
  const l4: Level["blocks"] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++)
      if (!gaps4[row].includes(col)) l4.push({ col, row, color: rowColors4[row] });

  const l5: Level["blocks"] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++) {
      const isFrame = col === 0 || col === 9 || row === 0 || row === 5;
      const isCross = col === 4 || row === 2;
      if (isFrame || isCross)
        l5.push({ col, row, color: isCross && !isFrame ? "hotpink" : "cyan" });
    }

  return [
    { speed: 1.0, blocks: l1 },
    { speed: 1.1, blocks: l2 },
    { speed: 1.21, blocks: l3 },
    { speed: 1.33, blocks: l4 },
    { speed: 1.46, blocks: l5 },
  ];
})();

// ── Spritesheet (portado de assets/spritesheet.js) ──────────────────────
type SpriteRect = { sx: number; sy: number; sw: number; sh: number };

const SPRITES: { paddle: SpriteRect; ball: SpriteRect; blocks: Record<BlockColor, SpriteRect> } = {
  paddle: { sx: 32, sy: 112, sw: 162, sh: 14 },
  ball: { sx: 32, sy: 32, sw: 16, sh: 16 },
  blocks: {
    gray: { sx: 32, sy: 288, sw: 32, sh: 16 },
    red: { sx: 32, sy: 176, sw: 32, sh: 16 },
    yellow: { sx: 32, sy: 240, sw: 32, sh: 16 },
    cyan: { sx: 32, sy: 192, sw: 32, sh: 16 },
    magenta: { sx: 32, sy: 224, sw: 32, sh: 16 },
    hotpink: { sx: 32, sy: 256, sw: 32, sh: 16 },
    green: { sx: 32, sy: 208, sw: 32, sh: 16 },
  },
};

const EXPLOSION_DURATION = 150;

const EXPLOSION_FRAMES: Record<BlockColor, SpriteRect[]> = {
  red: [
    { sx: 256, sy: 176, sw: 32, sh: 16 },
    { sx: 288, sy: 176, sw: 32, sh: 16 },
    { sx: 320, sy: 176, sw: 32, sh: 16 },
    { sx: 352, sy: 176, sw: 32, sh: 16 },
  ],
  cyan: [
    { sx: 256, sy: 192, sw: 32, sh: 16 },
    { sx: 288, sy: 192, sw: 32, sh: 16 },
    { sx: 320, sy: 192, sw: 32, sh: 16 },
    { sx: 352, sy: 192, sw: 32, sh: 16 },
  ],
  green: [
    { sx: 256, sy: 208, sw: 32, sh: 16 },
    { sx: 288, sy: 208, sw: 32, sh: 16 },
    { sx: 320, sy: 208, sw: 32, sh: 16 },
    { sx: 352, sy: 208, sw: 32, sh: 16 },
  ],
  magenta: [
    { sx: 256, sy: 224, sw: 32, sh: 16 },
    { sx: 288, sy: 224, sw: 32, sh: 16 },
    { sx: 320, sy: 224, sw: 32, sh: 16 },
    { sx: 352, sy: 224, sw: 32, sh: 16 },
  ],
  yellow: [
    { sx: 256, sy: 240, sw: 32, sh: 16 },
    { sx: 288, sy: 240, sw: 32, sh: 16 },
    { sx: 320, sy: 240, sw: 32, sh: 16 },
    { sx: 352, sy: 240, sw: 32, sh: 16 },
  ],
  hotpink: [
    { sx: 256, sy: 256, sw: 32, sh: 16 },
    { sx: 288, sy: 256, sw: 32, sh: 16 },
    { sx: 320, sy: 256, sw: 32, sh: 16 },
    { sx: 352, sy: 256, sw: 32, sh: 16 },
  ],
  gray: [
    { sx: 256, sy: 176, sw: 32, sh: 16 },
    { sx: 288, sy: 176, sw: 32, sh: 16 },
    { sx: 320, sy: 176, sw: 32, sh: 16 },
    { sx: 352, sy: 176, sw: 32, sh: 16 },
  ],
};

// ── Skins ─────────────────────────────────────────────────────────────
/** Marca interior de un ladrillo — distingue colores que comparten tono en
 * paletas reducidas (RETRO). */
type BrickMark = "none" | "dot" | "inset" | "stripe" | "cross";

type BrickStyle = { fill: string; mark: BrickMark; markColor: string };

type ArkanoidPalette = {
  /** Fondo de todo el canvas. */
  background: string;
  /** `true` = dibuja con el spritesheet original (CLÁSICO); `false` = vectorial. */
  sprites: boolean;
  /** Piso synthwave en perspectiva desde `top` hasta abajo (`null` = sin piso). */
  floor: { top: number; fill: string; line: string; lineWidth: number; horizon: string } | null;
  /** Marco sobre las paredes que rebotan: izquierda, techo y derecha. */
  frame: { color: string; width: number; glow: number } | null;
  /** Estilo por color de ladrillo (solo modo vectorial). */
  bricks: Record<BlockColor, BrickStyle>;
  /** Borde duro alrededor de ladrillos/paleta/pelota (`null` = sin borde). */
  edge: string | null;
  edgeWidth: number;
  /** `shadowBlur` de las entidades; el `shadowColor` es su color. */
  glow: number;
  /** Entidades como "tubo de neón": contorno brillante del color, relleno
   * casi transparente y un núcleo fino (`null` = relleno sólido). */
  tube: { lineWidth: number; fillAlpha: number; core: string } | null;
  /** Paleta del jugador; `cap` = tapas en los extremos (`null` = sin tapas). */
  paddle: { fill: string; cap: string | null };
  /** Pelota: `round` = círculo con glow, `square` = pixel de 8 bits con brillo. */
  ball: { fill: string; glowColor: string; shape: "round" | "square"; highlight: string | null };
  /** Explosión: `sprite` = frames del spritesheet, `burst` = contorno que se
   * expande y se apaga, `crumble` = ladrillo que se achica en 4 pasos duros. */
  explosion: "sprite" | "burst" | "crumble";
};

const brick = (fill: string, mark: BrickMark = "none", markColor = fill): BrickStyle => ({
  fill,
  mark,
  markColor,
});

/** Game Boy DMG: los 4 verdes, de más oscuro a más claro. */
const GB = { darkest: "#0f380f", dark: "#306230", light: "#8bac0f", lightest: "#9bbc0f" };

const SKINS: Record<SkinId, ArkanoidPalette> = {
  // Look original del motor: fondo negro + spritesheet, tal cual. Los
  // `bricks`/`paddle`/`ball` no se usan en modo sprite (están por tipo).
  clasico: {
    background: "#000",
    sprites: true,
    floor: null,
    frame: null,
    bricks: {
      gray: brick("#9e9e9e"),
      red: brick("#e53935"),
      yellow: brick("#fdd835"),
      cyan: brick("#26c6da"),
      magenta: brick("#ab47bc"),
      hotpink: brick("#ec407a"),
      green: brick("#66bb6a"),
    },
    edge: null,
    edgeWidth: 0,
    glow: 0,
    tube: null,
    paddle: { fill: "#fff", cap: null },
    ball: { fill: "#fff", glowColor: "#fff", shape: "round", highlight: null },
    explosion: "sprite",
  },
  // Synthwave: tubos de neón huecos con glow fuerte y un piso en perspectiva
  // con grilla magenta — se lee distinto del clásico de un vistazo.
  neon: {
    background: "#0b0016",
    sprites: false,
    floor: {
      top: 380,
      fill: "#12002a",
      line: "rgba(255,43,214,0.22)",
      lineWidth: 1,
      horizon: "#ff2bd6",
    },
    frame: { color: "#ff2bd6", width: 3, glow: 24 },
    bricks: {
      gray: brick("#e6e9ff"), // blanco plasma
      red: brick("#ff3b30"),
      yellow: brick("#f5ff00"),
      cyan: brick("#00f5ff"),
      magenta: brick("#b026ff"), // violeta
      hotpink: brick("#ff2bd6"),
      green: brick("#00ff88"),
    },
    edge: null,
    edgeWidth: 0,
    glow: 16,
    tube: { lineWidth: 3, fillAlpha: 0.14, core: "rgba(255,255,255,0.85)" },
    paddle: { fill: "#00f5ff", cap: "#ffffff" },
    ball: { fill: "#ffffff", glowColor: "#f5ff00", shape: "round", highlight: null },
    explosion: "burst",
  },
  // 4 verdes de Game Boy, bordes duros, sin glow ni alpha. Los colores que
  // comparten tono se distinguen por la marca interior.
  retro: {
    background: GB.lightest,
    sprites: false,
    floor: null,
    frame: { color: GB.darkest, width: 4, glow: 0 },
    bricks: {
      gray: brick(GB.dark, "cross", GB.lightest), // medio con cruz
      red: brick(GB.darkest), // liso oscuro
      yellow: brick(GB.light, "dot", GB.darkest), // claro con punto
      cyan: brick(GB.dark), // liso medio
      magenta: brick(GB.darkest, "inset", GB.light), // oscuro con cuadro interior
      hotpink: brick(GB.light, "stripe", GB.darkest), // claro con franja
      green: brick(GB.dark, "dot", GB.lightest), // medio con punto claro
    },
    edge: GB.darkest,
    edgeWidth: 2,
    glow: 0,
    tube: null,
    paddle: { fill: GB.darkest, cap: GB.light },
    ball: { fill: GB.darkest, glowColor: GB.darkest, shape: "square", highlight: GB.lightest },
    explosion: "crumble",
  },
};

/**
 * Cache de módulo: la imagen decodificada se comparte entre instancias del
 * motor (remounts de Strict Mode, o volver a entrar al juego) sin volver a
 * pedirla por red. Sobrevive a `destroy()` → nueva `createArkanoidEngine()`
 * sin romperse (ver motor-referencia.md §6).
 */
let ssCanvas: HTMLCanvasElement | null = null;
let ssLoaded = false;
let ssLoading = false;
const ssCallbacks: Array<() => void> = [];

function loadSpritesheet(cb: () => void): void {
  if (ssLoaded) {
    cb();
    return;
  }
  ssCallbacks.push(cb);
  if (ssLoading) return;
  ssLoading = true;

  const rawImg = new Image();
  rawImg.onload = () => {
    const offscreen = document.createElement("canvas");
    offscreen.width = rawImg.width;
    offscreen.height = rawImg.height;
    offscreen.getContext("2d")?.drawImage(rawImg, 0, 0);
    ssCanvas = offscreen;
    ssLoaded = true;
    ssCallbacks.forEach((f) => f());
    ssCallbacks.length = 0;
  };
  rawImg.onerror = () => {
    console.error("No se pudo cargar el spritesheet de BLOQUE BUSTER");
  };
  rawImg.src = SPRITESHEET_SRC;
}

function drawFrame(
  context: CanvasRenderingContext2D,
  frame: SpriteRect,
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (!ssLoaded || !ssCanvas) return;
  context.drawImage(ssCanvas, frame.sx, frame.sy, frame.sw, frame.sh, x, y, w, h);
}

export const createArkanoidEngine: EngineFactory = (canvas, onState, options) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");

  /** Paleta activa — solo visual; `setSkin` la reasigna en vivo. */
  let palette: ArkanoidPalette = SKINS[options?.skin ?? DEFAULT_SKIN] ?? SKINS[DEFAULT_SKIN];

  let spriteReady = ssLoaded;
  if (!spriteReady) {
    loadSpritesheet(() => {
      spriteReady = true;
    });
  }

  // ── Input: teclado ───────────────────────────────────────────────────
  const keys: Record<string, boolean> = {};

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code !== "ArrowLeft" && e.code !== "ArrowRight") return;
    keys[e.code] = true;
    e.preventDefault();
  };
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") keys[e.code] = false;
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // ── Input: mouse — escribe paddle.x directamente, sin pasar por update() ──
  const handleMouseMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    paddle.x = Math.max(0, Math.min(W - paddle.w, mouseX - paddle.w / 2));
  };
  canvas.addEventListener("mousemove", handleMouseMove);

  // ── Estado mutable del juego ────────────────────────────────────────
  const paddle = { x: 0, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H };
  const ball = { x: 0, y: 0, w: BALL_SIZE, h: BALL_SIZE, vx: BASE_BALL_VX, vy: BASE_BALL_VY };
  let blocks: Block[] = [];
  let explosions: Explosion[] = [];
  let score = 0;
  let lives = 3;
  let level = 1;
  let internalPhase: "playing" | "gameover" = "playing";
  let isPaused = false;

  function initPaddle() {
    paddle.x = (W - paddle.w) / 2;
  }

  function placeBallOnPaddle(speed: number) {
    ball.x = paddle.x + (paddle.w - ball.w) / 2;
    ball.y = paddle.y - ball.h;
    ball.vx = BASE_BALL_VX * speed;
    ball.vy = BASE_BALL_VY * speed;
  }

  function loadLevel(n: number) {
    level = n;
    const def = LEVELS[n - 1];
    blocks = def.blocks.map((b) => ({
      x: BLOCKS_ORIGIN_X + b.col * BLOCK_W,
      y: BLOCKS_ORIGIN_Y + b.row * BLOCK_H,
      w: BLOCK_W,
      h: BLOCK_H,
      color: b.color,
      alive: true,
    }));
    explosions = [];
    placeBallOnPaddle(def.speed);
  }

  function collideAABB(block: Block): boolean {
    return (
      ball.x < block.x + block.w &&
      ball.x + ball.w > block.x &&
      ball.y < block.y + block.h &&
      ball.y + ball.h > block.y
    );
  }

  function initGame() {
    score = 0;
    lives = 3;
    internalPhase = "playing";
    isPaused = false;
    initPaddle();
    loadLevel(1);
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
      prev.phase !== next.phase;
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

    // Paleta por teclado (el mouse ya escribe paddle.x en su propio listener)
    if (keys.ArrowLeft) paddle.x = Math.max(0, paddle.x - PADDLE_SPEED * dt);
    if (keys.ArrowRight) paddle.x = Math.min(W - paddle.w, paddle.x + PADDLE_SPEED * dt);

    // Movimiento de la pelota
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Rebotes en pared izquierda/derecha y techo
    if (ball.x <= 0) {
      ball.x = 0;
      ball.vx = Math.abs(ball.vx);
      playSound("bounce");
    }
    if (ball.x + ball.w >= W) {
      ball.x = W - ball.w;
      ball.vx = -Math.abs(ball.vx);
      playSound("bounce");
    }
    if (ball.y <= 0) {
      ball.y = 0;
      ball.vy = Math.abs(ball.vy);
      playSound("bounce");
    }

    // Rebote en la paleta
    if (
      ball.vy > 0 &&
      ball.x + ball.w > paddle.x &&
      ball.x < paddle.x + paddle.w &&
      ball.y + ball.h >= paddle.y &&
      ball.y + ball.h <= paddle.y + paddle.h + 8
    ) {
      ball.y = paddle.y - ball.h;
      ball.vy = -Math.abs(ball.vy);
      playSound("bounce");
    }

    // Colisión con bloques — uno por frame, igual al original
    for (const block of blocks) {
      if (!block.alive) continue;
      if (collideAABB(block)) {
        block.alive = false;
        explosions.push({
          x: block.x,
          y: block.y,
          w: block.w,
          h: block.h,
          color: block.color,
          elapsed: 0,
        });
        score += 10;
        ball.vy = -ball.vy;
        playSound("brick");
        if (blocks.every((b) => !b.alive)) {
          if (level < 5) {
            loadLevel(level + 1);
          } else {
            // 'win' del original: nivel 5 completado, sin equivalente en
            // EnginePhase → gameover (ver Decisiones del spec).
            internalPhase = "gameover";
            playSound("lifeLost");
          }
        }
        break;
      }
    }

    // Animaciones de explosión
    for (const exp of explosions) exp.elapsed += dt * 1000;
    explosions = explosions.filter((exp) => exp.elapsed < EXPLOSION_DURATION);

    // Pelota caída por debajo del canvas
    if (ball.y > H) {
      lives--;
      playSound("lifeLost");
      if (lives <= 0) {
        lives = 0;
        internalPhase = "gameover";
      } else {
        placeBallOnPaddle(LEVELS[level - 1].speed);
      }
    }

    reportState();
  }

  // ── Draw ──────────────────────────────────────────────────────────────
  /** Marca interior (RETRO) sobre el área `(ix, iy, iw, ih)`, con
   * rectángulos enteros — bordes duros. */
  function drawMark(style: BrickStyle, ix: number, iy: number, iw: number, ih: number) {
    const cx = ix + Math.floor(iw / 2);
    const cy = iy + Math.floor(ih / 2);
    ctx!.fillStyle = style.markColor;
    switch (style.mark) {
      case "dot":
        ctx!.fillRect(cx - 3, cy - 3, 6, 6);
        break;
      case "inset":
        ctx!.fillRect(ix + 4, iy + 4, iw - 8, ih - 8);
        ctx!.fillStyle = style.fill;
        ctx!.fillRect(ix + 7, iy + 7, iw - 14, ih - 14);
        break;
      case "stripe":
        ctx!.fillRect(ix, cy - 2, iw, 4);
        break;
      case "cross":
        ctx!.fillRect(cx - 2, iy + 3, 4, ih - 6);
        ctx!.fillRect(cx - 10, cy - 2, 20, 4);
        break;
      case "none":
        break;
    }
  }

  /** Rectángulo de una entidad según la paleta: tubo de neón hueco, o
   * relleno sólido con borde duro opcional. */
  function drawBox(x: number, y: number, w: number, h: number, fill: string) {
    const tube = palette.tube;
    if (tube) {
      const inset = tube.lineWidth / 2 + 1;
      ctx!.globalAlpha = tube.fillAlpha;
      ctx!.fillStyle = fill;
      ctx!.fillRect(x, y, w, h);
      ctx!.globalAlpha = 1;
      if (palette.glow > 0) {
        ctx!.shadowColor = fill;
        ctx!.shadowBlur = palette.glow;
      }
      ctx!.strokeStyle = fill;
      ctx!.lineWidth = tube.lineWidth;
      ctx!.strokeRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset);
      ctx!.shadowBlur = 0;
      ctx!.strokeStyle = tube.core;
      ctx!.lineWidth = 1;
      ctx!.strokeRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset);
      return;
    }
    const e = palette.edge ? palette.edgeWidth : 0;
    if (palette.edge) {
      ctx!.fillStyle = palette.edge;
      ctx!.fillRect(x, y, w, h);
    }
    ctx!.fillStyle = fill;
    ctx!.fillRect(x + e, y + e, w - 2 * e, h - 2 * e);
  }

  function drawBrick(block: Block) {
    const style = palette.bricks[block.color];
    // 1px de separación visual entre ladrillos; la hitbox no cambia.
    const x = block.x + 1;
    const y = block.y + 1;
    const w = block.w - 2;
    const h = block.h - 2;
    drawBox(x, y, w, h, style.fill);
    if (!palette.tube && style.mark !== "none") {
      const e = palette.edge ? palette.edgeWidth : 0;
      drawMark(style, x + e, y + e, w - 2 * e, h - 2 * e);
    }
  }

  function drawExplosion(exp: Explosion) {
    const t = Math.min(exp.elapsed / EXPLOSION_DURATION, 1);
    const style = palette.bricks[exp.color];
    if (palette.explosion === "burst") {
      const grow = t * 10;
      ctx!.globalAlpha = 1 - t;
      if (palette.glow > 0) {
        ctx!.shadowColor = style.fill;
        ctx!.shadowBlur = palette.glow;
      }
      ctx!.strokeStyle = style.fill;
      ctx!.lineWidth = 2;
      ctx!.strokeRect(exp.x - grow, exp.y - grow, exp.w + 2 * grow, exp.h + 2 * grow);
      ctx!.shadowBlur = 0;
      ctx!.globalAlpha = 1;
      return;
    }
    // crumble: 4 pasos duros, el ladrillo se achica hacia el centro.
    const step = Math.min(Math.floor(t * 4), 3);
    const ix = 6 + step * 7;
    const iy = 2 + step * 2;
    drawBox(exp.x + ix, exp.y + iy, exp.w - 2 * ix, exp.h - 2 * iy, style.fill);
  }

  function drawPaddle() {
    const p = palette.paddle;
    drawBox(paddle.x, paddle.y, paddle.w, paddle.h, p.fill);
    if (p.cap) {
      // Tapas en los extremos: la paleta se distingue de un ladrillo del mismo tono.
      ctx!.fillStyle = p.cap;
      const capH = paddle.h - 6;
      ctx!.fillRect(paddle.x + 5, paddle.y + 3, 6, capH);
      ctx!.fillRect(paddle.x + paddle.w - 11, paddle.y + 3, 6, capH);
    }
  }

  function drawBall() {
    const b = palette.ball;
    if (b.shape === "square") {
      const e = palette.edge ? palette.edgeWidth : 0;
      ctx!.fillStyle = b.fill;
      ctx!.fillRect(ball.x + e, ball.y + e, ball.w - 2 * e, ball.h - 2 * e);
      if (b.highlight) {
        ctx!.fillStyle = b.highlight;
        ctx!.fillRect(ball.x + e + 2, ball.y + e + 2, 4, 4);
      }
      return;
    }
    if (palette.glow > 0) {
      ctx!.shadowColor = b.glowColor;
      ctx!.shadowBlur = palette.glow + 8;
    }
    ctx!.fillStyle = b.fill;
    ctx!.beginPath();
    ctx!.arc(ball.x + ball.w / 2, ball.y + ball.h / 2, ball.w / 2 - 1, 0, Math.PI * 2);
    ctx!.fill();
    ctx!.shadowBlur = 0;
  }

  /** Piso en perspectiva (NEÓN) y marco sobre las paredes que rebotan. */
  function drawArena() {
    const floor = palette.floor;
    if (floor) {
      const depth = H - floor.top;
      ctx!.fillStyle = floor.fill;
      ctx!.fillRect(0, floor.top, W, depth);
      ctx!.strokeStyle = floor.line;
      ctx!.lineWidth = floor.lineWidth;
      ctx!.beginPath();
      // Verticales que convergen hacia el centro del horizonte.
      for (let k = -10; k <= 10; k++) {
        ctx!.moveTo(W / 2 + k * 20, floor.top);
        ctx!.lineTo(W / 2 + k * 90, H);
      }
      // Horizontales cada vez más juntas hacia el horizonte.
      for (let n = 1; n <= 8; n++) {
        const y = floor.top + depth * (n / 8) ** 2;
        ctx!.moveTo(0, y);
        ctx!.lineTo(W, y);
      }
      ctx!.stroke();
      ctx!.strokeStyle = floor.horizon;
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.moveTo(0, floor.top);
      ctx!.lineTo(W, floor.top);
      ctx!.stroke();
    }
    const frame = palette.frame;
    if (frame) {
      if (frame.glow > 0) {
        ctx!.shadowColor = frame.color;
        ctx!.shadowBlur = frame.glow;
      }
      const half = frame.width / 2;
      ctx!.strokeStyle = frame.color;
      ctx!.lineWidth = frame.width;
      ctx!.beginPath();
      ctx!.moveTo(half, H);
      ctx!.lineTo(half, half);
      ctx!.lineTo(W - half, half);
      ctx!.lineTo(W - half, H);
      ctx!.stroke();
      ctx!.shadowBlur = 0;
    }
  }

  function draw() {
    ctx!.fillStyle = palette.background;
    ctx!.fillRect(0, 0, W, H);

    if (palette.sprites) {
      if (!spriteReady) return;

      for (const block of blocks) {
        if (block.alive)
          drawFrame(ctx!, SPRITES.blocks[block.color], block.x, block.y, block.w, block.h);
      }

      for (const exp of explosions) {
        const frameIndex = Math.min(Math.floor((exp.elapsed / EXPLOSION_DURATION) * 4), 3);
        drawFrame(ctx!, EXPLOSION_FRAMES[exp.color][frameIndex], exp.x, exp.y, exp.w, exp.h);
      }

      drawFrame(ctx!, SPRITES.paddle, paddle.x, paddle.y, paddle.w, paddle.h);
      drawFrame(ctx!, SPRITES.ball, ball.x, ball.y, ball.w, ball.h);
      return;
    }

    drawArena();
    for (const block of blocks) if (block.alive) drawBrick(block);
    for (const exp of explosions) drawExplosion(exp);
    drawPaddle();
    drawBall();
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
    setSkin(skin: SkinId) {
      palette = SKINS[skin] ?? SKINS[DEFAULT_SKIN];
      // En pausa no hay frames corriendo: redibuja una vez para que se vea.
      if (rafId === null) draw();
    },
    destroy() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("mousemove", handleMouseMove);
    },
  };
};
