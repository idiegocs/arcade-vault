import type { EngineLoader } from "./game-engine";

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
 */
export type GameRegistration = {
  load: EngineLoader;
  maxPlausibleScore: number;
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
  },
  caida: {
    load: () => import("./caida/tetris-engine").then((m) => m.createTetrisEngine),
    maxPlausibleScore: 1_000_000,
  },
  "bloque-buster": {
    load: () => import("./bloque-buster/arkanoid-engine").then((m) => m.createArkanoidEngine),
    maxPlausibleScore: 2080,
  },
  serpentina: {
    load: () => import("./serpentina/snake-engine").then((m) => m.createSnakeEngine),
    maxPlausibleScore: 100_000,
  },
};
