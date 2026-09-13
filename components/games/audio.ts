/**
 * Librería de sonido transversal para motores de juego. Genera efectos con
 * Web Audio API (osciladores) — sin archivos de audio, sin dependencias
 * externas. Cualquier motor la importa directamente; no forma parte del
 * contrato de `EngineFactory`/`EngineHandle` (ver `game-engine.ts`, que no
 * se toca en este archivo ni en el shell).
 */

const MUTE_KEY = "arcade-vault:muted";

let ctx: AudioContext | null = null;
let muted = typeof window !== "undefined" && localStorage.getItem(MUTE_KEY) === "true";

/**
 * `AudioContext` singleton de módulo, creado perezosamente (recién en el
 * primer sonido) — los navegadores bloquean crear/reanudar audio sin un
 * gesto del usuario, y todo sonido de este archivo se dispara desde una
 * tecla real presionada dentro de un motor.
 */
function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  if (typeof window !== "undefined") {
    localStorage.setItem(MUTE_KEY, String(next));
  }
}

/** Alterna el mute y devuelve el nuevo estado. */
export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

/**
 * Sintetiza un tono simple: oscilador + envolvente de volumen (ataque
 * instantáneo, caída exponencial). No hace nada si está muteado o si Web
 * Audio no está disponible (SSR, navegadores sin soporte).
 */
function beep(freq: number, duration: number, type: OscillatorType = "square", gain = 0.15): void {
  if (muted) return;
  const audioCtx = getContext();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gainNode.gain.setValueAtTime(gain, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

export type SoundName =
  | "shoot"
  | "impact"
  | "explosion"
  | "powerup" // rocas
  | "rotate"
  | "drop"
  | "lineClear"
  | "topout" // caida
  | "bounce"
  | "brick"
  | "lifeLost" // bloque-buster
  | "eat"
  | "crash"
  | "step"; // serpentina

/** Reproduce el sonido `name`. Los presets concretos se agregan a
 * continuación de este archivo, cada uno como una entrada de `SOUNDS`. */
export function playSound(name: SoundName): void {
  SOUNDS[name]();
}

const SOUNDS: Record<SoundName, () => void> = {
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
  rotate: () => beep(520, 0.05, "square", 0.1),
  drop: () => beep(180, 0.08, "square", 0.15),
  lineClear: () => {
    beep(440, 0.09, "triangle", 0.15);
    beep(660, 0.09, "triangle", 0.15);
    beep(880, 0.14, "triangle", 0.15);
  },
  topout: () => beep(140, 0.4, "sawtooth", 0.2),
  bounce: () => beep(600, 0.05, "square", 0.1),
  brick: () => beep(340, 0.07, "square", 0.15),
  lifeLost: () => {
    beep(300, 0.15, "sawtooth", 0.18);
    beep(180, 0.2, "sawtooth", 0.15);
  },
  eat: () => beep(740, 0.07, "triangle", 0.15),
  crash: () => {
    beep(200, 0.2, "sawtooth", 0.18);
    beep(100, 0.25, "square", 0.15);
  },
  step: () => beep(220, 0.02, "square", 0.03),
};
