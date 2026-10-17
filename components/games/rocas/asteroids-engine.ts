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

  /** Pinta el path actual de `c` según `s`: relleno, trazo (con glow) y núcleo. */
  function paint(c: CanvasRenderingContext2D, s: Stroke) {
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

  // Paths de cada entidad, en coordenadas locales (0, 0) de la entidad: el
  // dibujo no depende del canvas destino (spec 14, regla 4).
  function shipPath(c: CanvasRenderingContext2D) {
    c.moveTo(20, 0);
    c.lineTo(-12, -9);
    c.lineTo(-7, 0);
    c.lineTo(-12, 9);
    c.closePath();
  }

  function flamePath(c: CanvasRenderingContext2D, len: number) {
    c.moveTo(-8, -4);
    c.lineTo(-8 - len, 0);
    c.lineTo(-8, 4);
  }

  function asteroidPath(c: CanvasRenderingContext2D, verts: [number, number][]) {
    c.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < verts.length; i++) c.lineTo(verts[i][0], verts[i][1]);
    c.closePath();
  }

  function boxPath(c: CanvasRenderingContext2D, r: number) {
    c.rect(-r, -r, r * 2, r * 2);
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

    draw(c: CanvasRenderingContext2D) {
      const x = snap(this.x);
      const y = snap(this.y);
      const b = palette.bullet;
      if (b.glow > 0) {
        c.shadowColor = b.color;
        c.shadowBlur = b.glow;
      }
      c.fillStyle = b.color;
      if (b.shape === "square") {
        c.fillRect(x - b.size, y - b.size, b.size * 2, b.size * 2);
      } else {
        c.beginPath();
        c.arc(x, y, b.size, 0, Math.PI * 2);
        c.fill();
      }
      c.shadowBlur = 0;
      if (b.core) {
        c.fillStyle = b.core;
        c.beginPath();
        c.arc(x, y, b.size * 0.4, 0, Math.PI * 2);
        c.fill();
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

    draw(c: CanvasRenderingContext2D) {
      const steps = palette.asteroidRotSteps;
      const step = (Math.PI * 2) / steps;
      const rot = steps > 0 ? Math.round(this.rot / step) * step : this.rot;
      c.save();
      c.translate(snap(this.x), snap(this.y));
      c.rotate(rot);
      c.beginPath();
      asteroidPath(c, this.verts);
      paint(c, palette.asteroids[this.size] ?? palette.asteroids[0]);
      c.restore();
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

    draw(c: CanvasRenderingContext2D) {
      if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
      const pulse = 0.85 + Math.sin(performance.now() / 150) * 0.15;
      const pu = palette.powerUp;
      const x = snap(this.x);
      const y = snap(this.y);
      c.save();
      c.translate(x, y);
      c.rotate(Math.PI / 4);
      const r = this.radius * pulse;
      c.beginPath();
      boxPath(c, r);
      paint(c, pu.box);
      c.restore();
      if (pu.textGlow > 0) {
        c.shadowColor = pu.text;
        c.shadowBlur = pu.textGlow;
      }
      c.fillStyle = pu.text;
      c.font = pu.font;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("3x", x, y);
      c.shadowBlur = 0;
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

    draw(c: CanvasRenderingContext2D) {
      if (this.dead) return;
      if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

      c.save();
      c.translate(snap(this.x), snap(this.y));
      c.rotate(this.angle);

      c.beginPath();
      shipPath(c);
      paint(c, palette.ship);

      if (this.thrusting && Math.random() > 0.35) {
        const len = rand(6, 14);
        c.beginPath();
        flamePath(c, len);
        paint(c, palette.thrust);
      }

      c.restore();
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

    draw(c: CanvasRenderingContext2D) {
      const p = palette.particle;
      if (p.fade) c.globalAlpha = Math.max(0, this.ttl / this.life);
      if (p.glow > 0) {
        c.shadowColor = p.color;
        c.shadowBlur = p.glow;
      }
      if (p.shape === "pixel") {
        c.fillStyle = p.color;
        c.fillRect(snap(this.x) - 1, snap(this.y) - 1, p.width, p.width);
      } else {
        c.strokeStyle = p.color;
        c.lineWidth = p.width;
        c.beginPath();
        c.moveTo(this.x, this.y);
        c.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
        c.stroke();
      }
      c.shadowBlur = 0;
      c.globalAlpha = 1;
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

  /** Segundos del badge "3x" ya reportados (-1 = sin badge). */
  let lastBadgeSecs = -1;

  /** Compara contra lo último reportado con primitivos y solo arma el
   * `EngineState` (y el badge) cuando algo cambió: sin allocaciones por frame. */
  function reportState() {
    const phase = currentPhase();
    const badgeSecs = ship.tripleShot > 0 ? Math.ceil(ship.tripleShot) : -1;
    const prev = lastReported;
    if (
      prev &&
      prev.score === score &&
      prev.lives === lives &&
      prev.level === level &&
      prev.phase === phase &&
      lastBadgeSecs === badgeSecs
    )
      return;
    lastBadgeSecs = badgeSecs;
    const next: EngineState = {
      score,
      lives,
      level,
      phase,
      badge: badgeSecs >= 0 ? { label: "3x", value: `${badgeSecs}s` } : undefined,
    };
    lastReported = next;
    onState(next);
  }

  // ── Update ────────────────────────────────────────────────────────────
  /** Saca los muertos de `list` en el lugar, manteniendo el orden (en vez de
   * `filter`, que allocaba un array nuevo por frame). */
  function compactDead(list: { dead: boolean }[]) {
    let j = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].dead) list[j++] = list[i];
    list.length = j;
  }

  /** Asteroides nacidos de los impactos de este frame (se reusa entre frames). */
  const newAsteroids: Asteroid[] = [];

  function update(dt: number) {
    if (internalPhase === "gameover") {
      for (let i = 0; i < particles.length; i++) particles[i].update(dt);
      compactDead(particles);
      reportState();
      return;
    }

    if (internalPhase === "dead") {
      deadTimer -= dt;
      for (let i = 0; i < particles.length; i++) particles[i].update(dt);
      compactDead(particles);
      for (let i = 0; i < asteroids.length; i++) asteroids[i].update(dt);
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
      for (let i = 0; i < newBullets.length; i++) bullets.push(newBullets[i]);
    }

    ship.update(dt);
    for (let i = 0; i < bullets.length; i++) bullets[i].update(dt);
    for (let i = 0; i < asteroids.length; i++) asteroids[i].update(dt);
    for (let i = 0; i < particles.length; i++) particles[i].update(dt);
    for (let i = 0; i < powerUps.length; i++) powerUps[i].update(dt);

    compactDead(bullets);
    compactDead(particles);
    compactDead(powerUps);

    for (let i = 0; i < powerUps.length; i++) {
      const p = powerUps[i];
      if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
        p.dead = true;
        ship.tripleShot = POWERUP_DURATION;
        playSound("powerup");
      }
    }

    newAsteroids.length = 0;
    for (let bi = 0; bi < bullets.length; bi++) {
      const b = bullets[bi];
      for (let ai = 0; ai < asteroids.length; ai++) {
        const a = asteroids[ai];
        if (!a.dead && !b.dead && dist(b, a) < a.radius) {
          b.dead = true;
          a.dead = true;
          playSound("impact");
          score += POINTS[a.size];
          explode(a.x, a.y, a.size * 5);
          const parts = a.split();
          for (let k = 0; k < parts.length; k++) newAsteroids.push(parts[k]);
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
    compactDead(asteroids);
    for (let k = 0; k < newAsteroids.length; k++) asteroids.push(newAsteroids[k]);
    newAsteroids.length = 0;
    compactDead(bullets);

    if (ship.invincible <= 0) {
      for (let i = 0; i < asteroids.length; i++) {
        if (dist(ship, asteroids[i]) < ship.radius + asteroids[i].radius * 0.82) {
          killShip();
          break;
        }
      }
    }

    if (asteroids.length === 0) nextLevel();

    reportState();
  }

  // ── Draw ──────────────────────────────────────────────────────────────
  function drawBackground(c: CanvasRenderingContext2D) {
    c.fillStyle = palette.background;
    c.fillRect(0, 0, W, H);
    const grid = palette.grid;
    if (grid) {
      c.strokeStyle = grid.color;
      c.lineWidth = grid.width;
      c.beginPath();
      for (let x = grid.spacing; x < W; x += grid.spacing) {
        c.moveTo(x, 0);
        c.lineTo(x, H);
      }
      for (let y = grid.spacing; y < H; y += grid.spacing) {
        c.moveTo(0, y);
        c.lineTo(W, y);
      }
      c.stroke();
    }
  }

  function drawFrame(c: CanvasRenderingContext2D) {
    const f = palette.frame;
    if (!f) return;
    if (f.glow > 0) {
      c.shadowColor = f.color;
      c.shadowBlur = f.glow;
    }
    c.strokeStyle = f.color;
    c.lineWidth = f.width;
    c.strokeRect(f.width / 2, f.width / 2, W - f.width, H - f.width);
    c.shadowBlur = 0;
  }

  // Sin cachés de dibujo, a propósito (spec 14, medido sin GPU + CPU 4x y con
  // GPU): `bgCache` de la grilla, el marco con glow en una capa y el glow de
  // nave, llama, balas y power-up en sprites no bajaron el trabajo por frame
  // (dentro del ruido, o hasta +8 % con GPU); el halo rotado de los asteroides
  // y las estelas en sprites lo subieron (~+35 %). La escena es casi toda
  // vacía y Skia resuelve barato el blur de figuras chicas y de rectángulos.
  function draw() {
    const c = ctx!;
    drawBackground(c);

    for (let i = 0; i < particles.length; i++) particles[i].draw(c);
    for (let i = 0; i < asteroids.length; i++) asteroids[i].draw(c);
    for (let i = 0; i < powerUps.length; i++) powerUps[i].draw(c);
    for (let i = 0; i < bullets.length; i++) bullets[i].draw(c);
    ship.draw(c);
    drawFrame(c);
  }

  // ── Loop principal ────────────────────────────────────────────────────
  let lastTime: number | null = null;
  let rafId: number | null = null;

  function loop(ts: number) {
    const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    // Tras el game over el loop se corta y queda el último frame quieto
    // detrás del modal (spec 14). Antes se deja terminar la explosión de la
    // nave (las partículas viven ≤ 1,1 s), que es lo único que `update` sigue
    // animando en "gameover". `restart()` rearma el rAF.
    if (internalPhase === "gameover" && particles.length === 0) {
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
