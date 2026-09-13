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
 */
import {
  ARENA_HEIGHT as H,
  ARENA_WIDTH as W,
  type EngineFactory,
  type EnginePhase,
  type EngineState,
} from "../game-engine";
import { playSound } from "../audio";

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

export const createArkanoidEngine: EngineFactory = (canvas, onState) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");

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
  function draw() {
    ctx!.fillStyle = "#000";
    ctx!.fillRect(0, 0, W, H);

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
      canvas.removeEventListener("mousemove", handleMouseMove);
    },
  };
};
