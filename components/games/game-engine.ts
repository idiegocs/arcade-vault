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
};

/**
 * Crea una instancia del motor sobre el canvas dado. `onState` debe
 * llamarse solo cuando el valor mostrado realmente cambia (score, lives,
 * level, phase o badge) — nunca en cada frame de requestAnimationFrame.
 */
export type EngineFactory = (
  canvas: HTMLCanvasElement,
  onState: (state: EngineState) => void
) => EngineHandle;

/** Carga perezosa de un `EngineFactory` — permite que cada motor viva en su
 * propio chunk de JS, descargado solo cuando se juega ese juego. */
export type EngineLoader = () => Promise<EngineFactory>;
