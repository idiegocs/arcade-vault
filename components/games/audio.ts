/**
 * Librería de sonido transversal para motores de juego. Genera efectos con
 * Web Audio API (osciladores) — sin archivos de audio, sin dependencias
 * externas. Cualquier motor la importa directamente; no forma parte del
 * contrato de `EngineFactory`/`EngineHandle` (ver `game-engine.ts`, que no
 * se toca en este archivo ni en el shell).
 *
 * Este archivo solo tiene la infraestructura compartida (contexto, mute,
 * `beep`). Los sonidos concretos de cada juego viven en su propio motor,
 * declarados con `defineSounds` — agregar un juego no toca este archivo.
 */

const MUTE_KEY = "arcade-vault:muted";

let ctx: AudioContext | null = null;
let muted = typeof window !== "undefined" && localStorage.getItem(MUTE_KEY) === "true";
const muteListeners = new Set<(muted: boolean) => void>();

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

/** El `AudioContext` compartido de la página (el mismo de los efectos), para
 * que otros módulos de audio — la música (`music.ts`, spec 13) — no creen
 * uno propio. `null` en SSR o sin soporte de Web Audio. */
export function getAudioContext(): AudioContext | null {
  return getContext();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  if (typeof window !== "undefined") {
    localStorage.setItem(MUTE_KEY, String(next));
  }
  for (const listener of muteListeners) listener(next);
}

/** Avisa cada vez que cambia el mute global (♪ del nav). Devuelve la función
 * para desuscribirse. */
export function onMuteChange(listener: (muted: boolean) => void): () => void {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
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
export function beep(
  freq: number,
  duration: number,
  type: OscillatorType = "square",
  gain = 0.15
): void {
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

/**
 * Declara el set de sonidos de un motor y devuelve su `playSound`, tipado
 * con los nombres de ese set. Cada motor define sus presets (combinaciones
 * de `beep`) en su propio archivo:
 *
 *   const playSound = defineSounds({ jump: () => beep(660, 0.08) });
 *   playSound("jump");
 */
export function defineSounds<Name extends string>(
  presets: Record<Name, () => void>
): (name: Name) => void {
  return (name) => presets[name]();
}
