import type { EngineLoader, SkinId } from "./game-engine";
import type { TrackId } from "./music-tracks";
import type { TouchControls } from "./touch-gamepad";

/**
 * Todo lo que la plataforma necesita saber de un juego con motor real, en
 * un solo lugar:
 *
 * - `load`: carga el motor con `import()` dinámico (chunk propio) — visitar
 *   la ruta de un juego no descarga el motor de los demás.
 * - `maxPlausibleScore`: techo de puntuación que `saveScore`
 *   (`app/actions/scores.ts`) valida en el servidor. Exacto para juegos con
 *   un final fijo y enumerable (BLOQUE BUSTER: 208 bloques × 10 pts en sus 5
 *   niveles = 2080, ver design.md de
 *   `openspec/changes/archive/2026-09-20-11-score-plausibility-caps-v0.2.5`);
 *   "techo de cordura" generoso para los que son efectivamente sin fin.
 * - `skins`: skins visuales que el motor soporta (ver sección "Skins" de
 *   `README.md`). Sin `skins`, el reproductor no muestra selector.
 * - `touchControls`: botones del gamepad virtual en pantallas táctiles, cada
 *   uno mapeado a la tecla que el motor ya escucha (spec 12). Sin
 *   `touchControls`, el reproductor no muestra gamepad.
 * - `music`: pista de fondo por defecto del juego (`music-tracks.ts`, spec
 *   13). El jugador puede elegir otra; sin `music`, el juego no tiene música.
 */
export type GameRegistration = {
  load: EngineLoader;
  maxPlausibleScore: number;
  skins?: readonly SkinId[];
  touchControls?: TouchControls;
  music?: TrackId;
};

/**
 * Mapa gameId (`games.id`) -> registro del juego. Un id sin entrada acá no
 * tiene motor (el reproductor muestra el mock estático) ni puntuación válida
 * (fail closed). Ver `README.md` para la receta de cómo agregar un juego.
 */
export const GAME_ENGINES: Record<string, GameRegistration> = {
  rocas: {
    load: () => import("./rocas/asteroids-engine").then((m) => m.createAsteroidsEngine),
    maxPlausibleScore: 1_000_000,
    skins: ["clasico", "neon", "retro"],
    music: "orbita",
    touchControls: {
      dpad: {
        up: { code: "ArrowUp", label: "▲" },
        left: { code: "ArrowLeft", label: "◀" },
        right: { code: "ArrowRight", label: "▶" },
      },
      actions: [
        { code: "ArrowUp", label: "MOTOR" },
        { code: "Space", label: "FUEGO" },
      ],
    },
  },
  caida: {
    load: () => import("./caida/tetris-engine").then((m) => m.createTetrisEngine),
    maxPlausibleScore: 1_000_000,
    skins: ["clasico", "neon", "retro"],
    music: "bloques",
    touchControls: {
      dpad: {
        left: { code: "ArrowLeft", label: "◀", repeat: true },
        right: { code: "ArrowRight", label: "▶", repeat: true },
        down: { code: "ArrowDown", label: "▼", repeat: true },
      },
      actions: [
        { code: "ArrowUp", label: "GIRAR" },
        { code: "Space", label: "CAER" },
      ],
    },
  },
  "bloque-buster": {
    load: () => import("./bloque-buster/arkanoid-engine").then((m) => m.createArkanoidEngine),
    maxPlausibleScore: 2080,
    skins: ["clasico", "neon", "retro"],
    music: "turbo",
    touchControls: {
      dpad: {
        left: { code: "ArrowLeft", label: "◀" },
        right: { code: "ArrowRight", label: "▶" },
      },
    },
  },
  serpentina: {
    load: () => import("./serpentina/snake-engine").then((m) => m.createSnakeEngine),
    maxPlausibleScore: 100_000,
    skins: ["clasico", "neon", "retro"],
    music: "jardin",
    touchControls: {
      dpad: {
        up: { code: "ArrowUp", label: "▲" },
        down: { code: "ArrowDown", label: "▼" },
        left: { code: "ArrowLeft", label: "◀" },
        right: { code: "ArrowRight", label: "▶" },
      },
    },
  },
};
