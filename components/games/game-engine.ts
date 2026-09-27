/**
 * Contrato compartido entre `game-player-shell.tsx` y cualquier motor de
 * juego. Un motor no sabe nada de React ni del HUD — solo dibuja sobre el
 * canvas que recibe y reporta su estado mediante `onState`.
 *
 * Ver `README.md` (en esta misma carpeta) para la receta de cómo agregar
 * un juego nuevo.
 */

/** Resolución interna fija del canvas. Todo motor calcula sus coordenadas
 * sobre estas constantes; el shell la escala por CSS al tamaño real en
 * pantalla. */
export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 600;

/** Skins que todo motor debe soportar. `clasico` es el default. */
export const REQUIRED_SKINS = ["clasico", "neon", "retro"] as const;
export type SkinId = (typeof REQUIRED_SKINS)[number];
export const DEFAULT_SKIN: SkinId = "clasico";

export type EngineOptions = { skin?: SkinId };

export type EnginePhase = "playing" | "paused" | "gameover";

export type EngineState = {
  score: number;
  lives: number;
  level: number;
  phase: EnginePhase;
  /** Indicador extra opcional específico del juego (ej. "3x 4.2s" de un power-up). */
  badge?: { label: string; value: string };
};

export type EngineHandle = {
  start(): void;
  pause(): void;
  resume(): void;
  /** Fuerza `phase -> "gameover"` con el score actual, sin esperar a que el juego termine solo. */
  endGame(): void;
  /** Vuelve a `phase: "playing"` con score/vidas/nivel reiniciados. */
  restart(): void;
  /** Limpia listeners, timers y el requestAnimationFrame propios del motor. */
  destroy(): void;
  /** Cambia la skin en vivo, sin reiniciar la partida. Opcional: un motor
   * sin skins no lo implementa. Solo visual — nunca toca hitboxes,
   * velocidades, spawn, puntaje, controles ni sonidos. */
  setSkin?(skin: SkinId): void;
};

/**
 * Crea una instancia del motor sobre el canvas dado. `onState` debe
 * llamarse solo cuando el valor mostrado realmente cambia (score, lives,
 * level, phase o badge) — nunca en cada frame de requestAnimationFrame.
 * `options.skin` es la skin inicial (default `DEFAULT_SKIN`); un motor sin
 * skins puede ignorar el parámetro.
 */
export type EngineFactory = (
  canvas: HTMLCanvasElement,
  onState: (state: EngineState) => void,
  options?: EngineOptions
) => EngineHandle;

/** Carga perezosa de un `EngineFactory` — permite que cada motor viva en su
 * propio chunk de JS, descargado solo cuando se juega ese juego. */
export type EngineLoader = () => Promise<EngineFactory>;
