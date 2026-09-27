/**
 * Motor de "ROCAS" (Asteroids), portado de
 * `references/started-games/02-asteroids/game.js`.
 *
 * Mismo balance y mecánica que el original (clases, tamaños, velocidades,
 * puntos, power-up 3x, 3 vidas, niveles). Diferencias respecto al original:
 * - No dibuja su propio HUD (score/nivel/vidas) — eso vive en el shell de React.
 * - No tiene overlay ni reinicio nativo por Espacio al perder — el fin de
 *   partida y el reinicio los controla el shell vía `EngineHandle`.
 * - Agrega pausa real (no existía en el original).
 * - Reporta su estado a React vía `onState`, solo cuando cambia.
 * - Skins visuales (`clasico`/`neon`/`retro`, ver `SKINS`), mismo patrón que
 *   CAÍDA (sección "Skins" de `../README.md`). Todo el dibujo lee de
 *   `palette`, nunca un literal; las skins no tocan física ni hitboxes.
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
  shoot: () => beep(880, 0.08, "square", 0.12),
  impact: () => beep(220, 0.1, "square", 0.15),
  explosion: () => {
    beep(120, 0.35, "sawtooth", 0.2);
    beep(60, 0.35, "square", 0.15);
  },
  powerup: () => {
    beep(660, 0.08, "triangle", 0.15);
    beep(990, 0.12, "triangle", 0.15);
  },
});

type Point = { x: number; y: number };

const POWERUP_DROP_CHANCE = 0.15;
const POWERUP_DURATION = 5;
const POWERUP_TTL = 12;
const TRIPLE_SPREAD = 0.18;

const RADII = [0, 16, 30, 50]; // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32]; // velocidad base por tamaño
const POINTS = [0, 100, 50, 20]; // puntos por tamaño

// ── Skins ─────────────────────────────────────────────────────────────
/** Cómo se pinta un trazo vectorial (nave, llama, asteroide, caja del power-up). */
type Stroke = {
  color: string;
  width: number;
  join: CanvasLineJoin;
  /** `shadowBlur` del trazo (0 = sin glow); el `shadowColor` es `color`. */
  glow: number;
  /** Relleno del path (`null` = hueco). `alpha` < 1 = relleno translúcido del
   * tubo de neón; `alpha` 1 = relleno sólido (RETRO). */
  fill: { color: string; alpha: number } | null;
  /** Núcleo fino encima del trazo — "tubo de neón" (`null` = sin núcleo). */
  core: string | null;
};

type AsteroidsPalette = {
  /** Fondo de todo el canvas. */
  background: string;
  /** Grilla de fondo (`null` = sin grilla). */
  grid: { color: string; spacing: number; width: number } | null;
  /** Marco alrededor del canvas (`null` = sin marco). */
  frame: { color: string; width: number; glow: number } | null;
  /** Redondea las posiciones dibujadas a múltiplos de N px (0 = sin snap). */
  pixelSnap: number;
  /** Cuantiza la rotación visual de los asteroides a N pasos (0 = continua). */
  asteroidRotSteps: number;
  ship: Stroke;
  thrust: Stroke;
  /** Índice = tamaño del asteroide (0 sin uso, 1..3). */
  asteroids: readonly Stroke[];
  bullet: {
    shape: "dot" | "square";
    /** Radio (o medio lado) solo visual — la colisión usa `Bullet.radius`. */
    size: number;
    color: string;
    glow: number;
    /** Punto central más claro (`null` = sin núcleo). */
    core: string | null;
  };
  powerUp: { box: Stroke; text: string; font: string; textGlow: number };
  particle: {
    shape: "streak" | "pixel";
    color: string;
    width: number;
    glow: number;
    /** Se desvanece con la vida (`false` = tono sólido hasta desaparecer). */
    fade: boolean;
  };
};

const stroke = (
  color: string,
  width: number,
  opts: Partial<Omit<Stroke, "color" | "width">> = {}
): Stroke => ({
  color,
  width,
  join: opts.join ?? "round",
  glow: opts.glow ?? 0,
  fill: opts.fill ?? null,
  core: opts.core ?? null,
});

/** Tubo de neón: contorno grueso con glow fuerte, relleno casi transparente y
 * núcleo blanco fino (mismo lenguaje que `tube` en CAÍDA). */
const tube = (color: string, width = 3): Stroke =>
  stroke(color, width, {
    glow: 16,
    fill: { color, alpha: 0.14 },
    core: "rgba(255,255,255,0.85)",
  });

/** Game Boy DMG: los 4 verdes, de más oscuro a más claro. */
const GB = { darkest: "#0f380f", dark: "#306230", light: "#8bac0f", lightest: "#9bbc0f" };

/** Borde duro de 2px, sin glow, con relleno sólido (RETRO). */
const solid = (fill: string, edge: string = GB.darkest): Stroke =>
  stroke(edge, 2, { join: "miter", fill: { color: fill, alpha: 1 } });

const SKINS: Record<SkinId, AsteroidsPalette> = {
  // Look original del motor, copiado tal cual: líneas vectoriales blancas finas.
  clasico: {
    background: "#000",
    grid: null,
    frame: null,
    pixelSnap: 0,
    asteroidRotSteps: 0,
    ship: stroke("#fff", 1.5),
    thrust: stroke("rgba(255, 130, 0, 0.85)", 1.5),
    asteroids: [stroke("#fff", 1.5), stroke("#fff", 1.5), stroke("#fff", 1.5), stroke("#fff", 1.5)],
    bullet: { shape: "dot", size: 2, color: "#fff", glow: 0, core: null },
    powerUp: {
      box: stroke("#0ff", 2, { join: "miter" }),
      text: "#0ff",
      font: "bold 12px monospace",
      textGlow: 0,
    },
    particle: { shape: "streak", color: "#fff", width: 1, glow: 0, fade: true },
  },
  // Synthwave: tubos de neón huecos con glow fuerte, un color saturado por
  // tipo de entidad, sobre fondo violeta con grilla y marco magenta.
  neon: {
    background: "#0b0016",
    grid: { color: "rgba(255,43,214,0.10)", spacing: 40, width: 1 },
    frame: { color: "#ff2bd6", width: 3, glow: 24 },
    pixelSnap: 0,
    asteroidRotSteps: 0,
    ship: tube("#00f5ff"), // jugador: cyan
    thrust: stroke("#ff8a00", 2.5, { glow: 16, core: "rgba(255,255,255,0.85)" }),
    asteroids: [
      tube("#ff2bd6"), // 0 - sin uso
      tube("#ff8a00"), // chico: naranja (el más rápido)
      tube("#b026ff"), // mediano: violeta
      tube("#ff2bd6"), // grande: magenta
    ],
    bullet: { shape: "dot", size: 3, color: "#f5ff00", glow: 14, core: "#ffffff" },
    powerUp: {
      box: tube("#00ff88"), // lo que suma: verde
      text: "#00ff88",
      font: "bold 12px monospace",
      textGlow: 10,
    },
    particle: { shape: "streak", color: "#ff6ad5", width: 2, glow: 8, fade: true },
  },
  // 4 verdes de Game Boy, sin glow ni alpha, bordes duros y posiciones en
  // grilla de 2px. Nave sólida oscura, asteroides rellenos con borde oscuro,
  // balas como píxeles cuadrados, power-up invertido (caja oscura, texto claro).
  retro: {
    background: GB.lightest,
    grid: null,
    frame: { color: GB.darkest, width: 6, glow: 0 },
    pixelSnap: 2,
    asteroidRotSteps: 16,
    ship: solid(GB.darkest),
    thrust: stroke(GB.dark, 2, { join: "miter" }),
    asteroids: [
      solid(GB.light), // 0 - sin uso
      solid(GB.dark), // chico: tono medio (el más rápido)
      solid(GB.light),
      solid(GB.light),
    ],
    bullet: { shape: "square", size: 2, color: GB.darkest, glow: 0, core: null },
    powerUp: {
      box: solid(GB.darkest),
      text: GB.lightest,
      font: "bold 12px monospace",
      textGlow: 0,
    },
    particle: { shape: "pixel", color: GB.dark, width: 3, glow: 0, fade: false },
  },
};

const wrap = (v: number, max: number) => ((v % max) + max) % max;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

export const createAsteroidsEngine: EngineFactory = (canvas, onState, options) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");

  /** Paleta activa — solo visual; `setSkin` la reasigna en vivo. */
  let palette: AsteroidsPalette = SKINS[options?.skin ?? DEFAULT_SKIN] ?? SKINS[DEFAULT_SKIN];

  /** Posición dibujada (con `pixelSnap` de la paleta); no afecta la física. */
  const snap = (v: number) =>
    palette.pixelSnap > 0 ? Math.round(v / palette.pixelSnap) * palette.pixelSnap : v;

  /** Pinta el path actual según `s`: relleno, trazo (con glow) y núcleo. */
  function paint(s: Stroke) {
    const c = ctx!;
    if (s.fill) {
      c.globalAlpha = s.fill.alpha;
      c.fillStyle = s.fill.color;
      c.fill();
      c.globalAlpha = 1;
    }
    if (s.glow > 0) {
      c.shadowColor = s.color;
      c.shadowBlur = s.glow;
    }
    c.strokeStyle = s.color;
    c.lineWidth = s.width;
    c.lineJoin = s.join;
    c.stroke();
    if (s.glow > 0) c.shadowBlur = 0;
    if (s.core) {
      c.strokeStyle = s.core;
      c.lineWidth = 1;
      c.stroke();
    }
  }

  // ── Input ──────────────────────────────────────────────────────────────
  const keys: Record<string, boolean> = {};
  const justPressed: Record<string, boolean> = {};

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!keys[e.code]) justPressed[e.code] = true;
    keys[e.code] = true;
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

  // ── Bullet ─────────────────────────────────────────────────────────────
  class Bullet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ttl = 1.1;
    radius = 2;
    dead = false;

    constructor(x: number, y: number, angle: number) {
      this.x = x;
      this.y = y;
      const SPEED = 520;
      this.vx = Math.cos(angle) * SPEED;
      this.vy = Math.sin(angle) * SPEED;
    }

    update(dt: number) {
      this.x = wrap(this.x + this.vx * dt, W);
      this.y = wrap(this.y + this.vy * dt, H);
      this.ttl -= dt;
      if (this.ttl <= 0) this.dead = true;
    }

    draw() {
      const b = palette.bullet;
      const x = snap(this.x);
      const y = snap(this.y);
      if (b.glow > 0) {
        ctx!.shadowColor = b.color;
        ctx!.shadowBlur = b.glow;
      }
      ctx!.fillStyle = b.color;
      if (b.shape === "square") {
        ctx!.fillRect(x - b.size, y - b.size, b.size * 2, b.size * 2);
      } else {
        ctx!.beginPath();
        ctx!.arc(x, y, b.size, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.shadowBlur = 0;
      if (b.core) {
        ctx!.fillStyle = b.core;
        ctx!.beginPath();
        ctx!.arc(x, y, b.size * 0.4, 0, Math.PI * 2);
        ctx!.fill();
      }
    }
  }

  // ── Asteroid ───────────────────────────────────────────────────────────
  class Asteroid {
    x: number;
    y: number;
    size: number;
    radius: number;
    dead = false;
    vx: number;
    vy: number;
    rotSpeed: number;
    rot: number;
    verts: [number, number][] = [];

    constructor(x: number, y: number, size = 3) {
      this.x = x;
      this.y = y;
      this.size = size;
      this.radius = RADII[size];

      const angle = rand(0, Math.PI * 2);
      const speed = SPEEDS[size] + rand(-15, 15);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.rotSpeed = rand(-1.2, 1.2);
      this.rot = rand(0, Math.PI * 2);

      const n = randInt(8, 13);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = this.radius * rand(0.6, 1.0);
        this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }

    update(dt: number) {
      this.x = wrap(this.x + this.vx * dt, W);
      this.y = wrap(this.y + this.vy * dt, H);
      this.rot += this.rotSpeed * dt;
    }

    split(): Asteroid[] {
      if (this.size <= 1) return [];
      return [
        new Asteroid(this.x, this.y, this.size - 1),
        new Asteroid(this.x, this.y, this.size - 1),
      ];
    }

    draw() {
      const steps = palette.asteroidRotSteps;
      const step = (Math.PI * 2) / steps;
      const rot = steps > 0 ? Math.round(this.rot / step) * step : this.rot;
      ctx!.save();
      ctx!.translate(snap(this.x), snap(this.y));
      ctx!.rotate(rot);
      ctx!.beginPath();
      ctx!.moveTo(this.verts[0][0], this.verts[0][1]);
      for (let i = 1; i < this.verts.length; i++) ctx!.lineTo(this.verts[i][0], this.verts[i][1]);
      ctx!.closePath();
      paint(palette.asteroids[this.size] ?? palette.asteroids[0]);
      ctx!.restore();
    }
  }

  // ── PowerUp ────────────────────────────────────────────────────────────
  class PowerUp {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius = 12;
    ttl = POWERUP_TTL;
    dead = false;

    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
      const angle = rand(0, Math.PI * 2);
      const speed = rand(20, 40);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    }

    update(dt: number) {
      this.x = wrap(this.x + this.vx * dt, W);
      this.y = wrap(this.y + this.vy * dt, H);
      this.ttl -= dt;
      if (this.ttl <= 0) this.dead = true;
    }

    draw() {
      if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
      const pulse = 0.85 + Math.sin(performance.now() / 150) * 0.15;
      const pu = palette.powerUp;
      const x = snap(this.x);
      const y = snap(this.y);
      ctx!.save();
      ctx!.translate(x, y);
      ctx!.rotate(Math.PI / 4);
      const r = this.radius * pulse;
      ctx!.beginPath();
      ctx!.rect(-r, -r, r * 2, r * 2);
      paint(pu.box);
      ctx!.restore();
      if (pu.textGlow > 0) {
        ctx!.shadowColor = pu.text;
        ctx!.shadowBlur = pu.textGlow;
      }
      ctx!.fillStyle = pu.text;
      ctx!.font = pu.font;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      ctx!.fillText("3x", x, y);
      ctx!.shadowBlur = 0;
    }
  }

  // ── Ship ───────────────────────────────────────────────────────────────
  class Ship {
    x = 0;
    y = 0;
    angle = 0;
    vx = 0;
    vy = 0;
    radius = 12;
    thrusting = false;
    invincible = 0;
    shootCooldown = 0;
    dead = false;
    tripleShot = 0;

    constructor() {
      this.reset();
    }

    reset() {
      this.x = W / 2;
      this.y = H / 2;
      this.angle = -Math.PI / 2;
      this.vx = 0;
      this.vy = 0;
      this.thrusting = false;
      this.invincible = 3;
      this.shootCooldown = 0;
      this.dead = false;
    }

    update(dt: number) {
      if (this.dead) return;
      if (this.invincible > 0) this.invincible -= dt;
      if (this.shootCooldown > 0) this.shootCooldown -= dt;
      if (this.tripleShot > 0) this.tripleShot -= dt;

      const ROT = 3.5; // rad/s
      const THRUST = 260; // px/s²
      const DRAG = 0.987;

      if (keys["ArrowLeft"]) this.angle -= ROT * dt;
      if (keys["ArrowRight"]) this.angle += ROT * dt;

      this.thrusting = !!keys["ArrowUp"];
      if (this.thrusting) {
        this.vx += Math.cos(this.angle) * THRUST * dt;
        this.vy += Math.sin(this.angle) * THRUST * dt;
      }

      this.vx *= DRAG;
      this.vy *= DRAG;
      this.x = wrap(this.x + this.vx * dt, W);
      this.y = wrap(this.y + this.vy * dt, H);
    }

    tryShoot(): Bullet[] {
      if (this.shootCooldown > 0 || this.dead) return [];
      this.shootCooldown = 0.2;
      const NOSE = 21;
      const ox = this.x + Math.cos(this.angle) * NOSE;
      const oy = this.y + Math.sin(this.angle) * NOSE;
      if (this.tripleShot > 0) {
        return [
          new Bullet(ox, oy, this.angle - TRIPLE_SPREAD),
          new Bullet(ox, oy, this.angle),
          new Bullet(ox, oy, this.angle + TRIPLE_SPREAD),
        ];
      }
      return [new Bullet(ox, oy, this.angle)];
    }

    draw() {
      if (this.dead) return;
      if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

      ctx!.save();
      ctx!.translate(snap(this.x), snap(this.y));
      ctx!.rotate(this.angle);

      ctx!.beginPath();
      ctx!.moveTo(20, 0);
      ctx!.lineTo(-12, -9);
      ctx!.lineTo(-7, 0);
      ctx!.lineTo(-12, 9);
      ctx!.closePath();
      paint(palette.ship);

      if (this.thrusting && Math.random() > 0.35) {
        ctx!.beginPath();
        ctx!.moveTo(-8, -4);
        ctx!.lineTo(-8 - rand(6, 14), 0);
        ctx!.lineTo(-8, 4);
        paint(palette.thrust);
      }

      ctx!.restore();
    }
  }

  // ── Partícula (explosión) ─────────────────────────────────────────────
  class Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    ttl: number;
    dead = false;

    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
      const angle = rand(0, Math.PI * 2);
      const speed = rand(30, 130);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.life = rand(0.4, 1.1);
      this.ttl = this.life;
    }

    update(dt: number) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.ttl -= dt;
      if (this.ttl <= 0) this.dead = true;
    }

    draw() {
      const p = palette.particle;
      if (p.fade) ctx!.globalAlpha = Math.max(0, this.ttl / this.life);
      if (p.glow > 0) {
        ctx!.shadowColor = p.color;
        ctx!.shadowBlur = p.glow;
      }
      if (p.shape === "pixel") {
        ctx!.fillStyle = p.color;
        ctx!.fillRect(snap(this.x) - 1, snap(this.y) - 1, p.width, p.width);
      } else {
        ctx!.strokeStyle = p.color;
        ctx!.lineWidth = p.width;
        ctx!.beginPath();
        ctx!.moveTo(this.x, this.y);
        ctx!.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
        ctx!.stroke();
      }
      ctx!.shadowBlur = 0;
      ctx!.globalAlpha = 1;
    }
  }

  // ── Estado del juego ─────────────────────────────────────────────────
  let ship = new Ship();
  let bullets: Bullet[] = [];
  let asteroids: Asteroid[] = [];
  let particles: Particle[] = [];
  let powerUps: PowerUp[] = [];
  let score = 0;
  let lives = 3;
  let level = 1;
  /** Estado interno, más granular que el `EnginePhase` reportado:
   * "dead" (breve pausa de reaparición) se reporta como "playing" hacia afuera. */
  let internalPhase: "playing" | "dead" | "gameover" = "playing";
  let deadTimer = 0;
  let powerUpSpawned = false;
  let killsSinceSpawn = 0;
  let isPaused = false;

  function spawnAsteroids(count: number) {
    const SAFE_DIST = 130;
    for (let i = 0; i < count; i++) {
      let x: number, y: number;
      do {
        x = rand(0, W);
        y = rand(0, H);
      } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
      asteroids.push(new Asteroid(x, y, 3));
    }
  }

  function initGame() {
    ship = new Ship();
    bullets = [];
    asteroids = [];
    particles = [];
    powerUps = [];
    powerUpSpawned = false;
    killsSinceSpawn = 0;
    score = 0;
    lives = 3;
    level = 1;
    internalPhase = "playing";
    isPaused = false;
    spawnAsteroids(4);
  }

  function nextLevel() {
    level++;
    bullets = [];
    particles = [];
    powerUps = [];
    powerUpSpawned = false;
    killsSinceSpawn = 0;
    ship.reset();
    spawnAsteroids(3 + level);
  }

  function explode(x: number, y: number, count = 8) {
    for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
  }

  function killShip() {
    playSound("explosion");
    explode(ship.x, ship.y, 14);
    ship.dead = true;
    lives--;
    if (lives <= 0) {
      internalPhase = "gameover";
    } else {
      internalPhase = "dead";
      deadTimer = 2;
    }
  }

  // ── Reporte de estado a React ────────────────────────────────────────
  let lastReported: EngineState | null = null;

  function currentPhase(): EnginePhase {
    if (isPaused) return "paused";
    if (internalPhase === "gameover") return "gameover";
    return "playing"; // cubre "playing" y "dead" (respawn) internos
  }

  function reportState() {
    const badge =
      ship.tripleShot > 0 ? { label: "3x", value: `${Math.ceil(ship.tripleShot)}s` } : undefined;
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

  // ── Update ────────────────────────────────────────────────────────────
  function update(dt: number) {
    if (internalPhase === "gameover") {
      particles.forEach((p) => p.update(dt));
      particles = particles.filter((p) => !p.dead);
      reportState();
      return;
    }

    if (internalPhase === "dead") {
      deadTimer -= dt;
      particles.forEach((p) => p.update(dt));
      particles = particles.filter((p) => !p.dead);
      asteroids.forEach((a) => a.update(dt));
      if (deadTimer <= 0) {
        internalPhase = "playing";
        ship.reset();
      }
      reportState();
      return;
    }

    if (pressed("Space")) {
      const newBullets = ship.tryShoot();
      if (newBullets.length > 0) playSound("shoot");
      bullets.push(...newBullets);
    }

    ship.update(dt);
    bullets.forEach((b) => b.update(dt));
    asteroids.forEach((a) => a.update(dt));
    particles.forEach((p) => p.update(dt));
    powerUps.forEach((p) => p.update(dt));

    bullets = bullets.filter((b) => !b.dead);
    particles = particles.filter((p) => !p.dead);
    powerUps = powerUps.filter((p) => !p.dead);

    for (const p of powerUps) {
      if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
        p.dead = true;
        ship.tripleShot = POWERUP_DURATION;
        playSound("powerup");
      }
    }

    const newAsteroids: Asteroid[] = [];
    for (const b of bullets) {
      for (const a of asteroids) {
        if (!a.dead && !b.dead && dist(b, a) < a.radius) {
          b.dead = true;
          a.dead = true;
          playSound("impact");
          score += POINTS[a.size];
          explode(a.x, a.y, a.size * 5);
          newAsteroids.push(...a.split());
          if (!powerUpSpawned) {
            killsSinceSpawn++;
            const guaranteed = killsSinceSpawn >= 5;
            if (guaranteed || Math.random() < POWERUP_DROP_CHANCE) {
              powerUps.push(new PowerUp(a.x, a.y));
              powerUpSpawned = true;
            }
          }
        }
      }
    }
    asteroids = asteroids.filter((a) => !a.dead).concat(newAsteroids);
    bullets = bullets.filter((b) => !b.dead);

    if (ship.invincible <= 0) {
      for (const a of asteroids) {
        if (dist(ship, a) < ship.radius + a.radius * 0.82) {
          killShip();
          break;
        }
      }
    }

    if (asteroids.length === 0) nextLevel();

    reportState();
  }

  // ── Draw ──────────────────────────────────────────────────────────────
  function drawBackground() {
    ctx!.fillStyle = palette.background;
    ctx!.fillRect(0, 0, W, H);
    const grid = palette.grid;
    if (grid) {
      ctx!.strokeStyle = grid.color;
      ctx!.lineWidth = grid.width;
      ctx!.beginPath();
      for (let x = grid.spacing; x < W; x += grid.spacing) {
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, H);
      }
      for (let y = grid.spacing; y < H; y += grid.spacing) {
        ctx!.moveTo(0, y);
        ctx!.lineTo(W, y);
      }
      ctx!.stroke();
    }
  }

  function drawFrame() {
    const f = palette.frame;
    if (!f) return;
    if (f.glow > 0) {
      ctx!.shadowColor = f.color;
      ctx!.shadowBlur = f.glow;
    }
    ctx!.strokeStyle = f.color;
    ctx!.lineWidth = f.width;
    ctx!.strokeRect(f.width / 2, f.width / 2, W - f.width, H - f.width);
    ctx!.shadowBlur = 0;
  }

  function draw() {
    drawBackground();

    particles.forEach((p) => p.draw());
    asteroids.forEach((a) => a.draw());
    powerUps.forEach((p) => p.draw());
    bullets.forEach((b) => b.draw());
    ship.draw();
    drawFrame();
  }

  // ── Loop principal ────────────────────────────────────────────────────
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
    },
  };
};
