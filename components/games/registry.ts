import type { EngineLoader } from "./game-engine";

/**
 * Mapa gameId -> EngineLoader. Cada motor se carga con `import()` dinámico
 * (chunk propio) — visitar la ruta de un juego no descarga el motor de los
 * demás. Ver `README.md` para la receta de cómo agregar un juego nuevo.
 */
export const GAME_ENGINES: Record<string, EngineLoader> = {
  rocas: () => import("./rocas/asteroids-engine").then((m) => m.createAsteroidsEngine),
  caida: () => import("./caida/tetris-engine").then((m) => m.createTetrisEngine),
};
