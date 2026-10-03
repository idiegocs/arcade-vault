/**
 * Música de fondo (spec 13): toca en bucle una pista de `music-tracks.ts`
 * sintetizada con Web Audio, sobre el mismo `AudioContext` que los efectos
 * (`audio.ts`). El ciclo de vida (cuándo suena, se pausa o se detiene) lo
 * maneja `game-player-shell.tsx`; los motores no saben nada de la música.
 *
 * Secuenciador con lookahead: un timer cada `TICK_MS` agenda las notas que
 * caen en los próximos `LOOKAHEAD_S` segundos contra `audioCtx.currentTime`,
 * así el tempo no depende de los FPS del juego ni de los tirones del timer.
 */

import { getAudioContext, isMuted, onMuteChange } from "./audio";
import {
  MUSIC_TRACKS,
  TRACK_IDS,
  type MusicChoice,
  type MusicTrack,
  type TrackId,
} from "./music-tracks";

const VOLUME_KEY = "arcade-vault:music-volume";
const DEFAULT_VOLUME = 30;
/** Ganancia de la música al 100 %: por debajo de los efectos (~0,12–0,15). */
const MUSIC_MAX_GAIN = 0.25;
const TICK_MS = 25;
const LOOKAHEAD_S = 0.1;
/** Fundido al pausar/detener, para no cortar notas con un chasquido. */
const FADE_S = 0.03;

/** Una voz en curso: qué nota toca después y en qué tiempo empieza. */
type Cursor = { index: number; beat: number };

type Playback = {
  track: MusicTrack;
  cursors: Cursor[];
  /** Tiempo del contexto en que sonaría el tiempo musical `startBeat`. */
  startTime: number;
  startBeat: number;
  /** Bus propio de esta sesión: al pausar se funde y se descarta, así las
   * notas ya agendadas no suenan sobre la siguiente. */
  bus: GainNode;
  timer: ReturnType<typeof setInterval>;
};

let volume = readVolume();
let playback: Playback | null = null;
/** Pista y tiempo musical donde quedó la música al pausar. */
let paused: { track: MusicTrack; beat: number } | null = null;
/** Pista pedida antes del primer gesto del usuario: arranca con él. */
let waiting: { track: MusicTrack; beat: number } | null = null;
let gestureSeen = false;

/**
 * Los navegadores no dejan arrancar audio sin un gesto del usuario, y crear
 * o reanudar el `AudioContext` antes llena la consola de avisos. Hasta el
 * primer gesto la música queda en `waiting` y se toca con la primera tecla
 * o toque (en captura: antes de que el motor procese esa misma tecla).
 */
function hasUserGesture(): boolean {
  if (gestureSeen) return true;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  return activation?.hasBeenActive ?? false;
}

const GESTURE_EVENTS = ["keydown", "pointerdown"] as const;

function onFirstGesture() {
  gestureSeen = true;
  for (const type of GESTURE_EVENTS) window.removeEventListener(type, onFirstGesture, true);
  if (waiting) {
    const { track, beat } = waiting;
    waiting = null;
    start(track, beat);
  }
}

function waitForGesture(track: MusicTrack, beat: number) {
  waiting = { track, beat };
  for (const type of GESTURE_EVENTS) window.addEventListener(type, onFirstGesture, true);
}

function readVolume(): number {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(VOLUME_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function targetGain(): number {
  return isMuted() ? 0 : (volume / 100) * MUSIC_MAX_GAIN;
}

const secondsPerBeat = (track: MusicTrack) => 60 / track.bpm;

function midiToFreq(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

/** En desarrollo, avisa si las voces de una pista no duran lo mismo. */
function checkTrack(track: MusicTrack) {
  if (process.env.NODE_ENV === "production") return;
  const lengths = track.voices.map((v) => v.notes.reduce((sum, [, beats]) => sum + beats, 0));
  if (new Set(lengths).size > 1) {
    console.warn(
      `music: las voces de "${track.id}" no duran lo mismo (${lengths.join(", ")} tiempos)`
    );
  }
}

function scheduleNote(
  audioCtx: AudioContext,
  bus: GainNode,
  wave: OscillatorType,
  gain: number,
  pitch: number,
  start: number,
  duration: number
) {
  const osc = audioCtx.createOscillator();
  const env = audioCtx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(midiToFreq(pitch), start);
  // Ataque corto y caída al final de la nota: sin chasquidos entre notas.
  const release = Math.min(0.04, duration / 3);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.006);
  env.gain.setValueAtTime(gain, start + duration - release);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env);
  env.connect(bus);
  osc.start(start);
  osc.stop(start + duration);
}

function tick() {
  const audioCtx = getAudioContext();
  if (!playback || !audioCtx) return;
  const { track, cursors, bus } = playback;
  const spb = secondsPerBeat(track);
  const now = audioCtx.currentTime;
  const horizon = now + LOOKAHEAD_S;
  const timeOf = (beat: number) => playback!.startTime + (beat - playback!.startBeat) * spb;

  track.voices.forEach((voice, v) => {
    const cursor = cursors[v];
    while (timeOf(cursor.beat) < horizon) {
      const [pitch, beats] = voice.notes[cursor.index];
      const start = timeOf(cursor.beat);
      // Notas que ya pasaron (el timer se frenó con la pestaña en segundo
      // plano): se saltan en vez de sonar todas juntas.
      if (pitch !== null && start >= now - 0.01) {
        scheduleNote(audioCtx, bus, voice.wave, voice.gain, pitch, start, beats * spb);
      }
      cursor.beat += beats;
      cursor.index = (cursor.index + 1) % voice.notes.length;
    }
  });
}

/** Cursores de cada voz ubicados en la primera nota que empieza en `beat` o
 * después (dentro del bucle). */
function cursorsAt(track: MusicTrack, beat: number): Cursor[] {
  return track.voices.map((voice) => {
    const loop = voice.notes.reduce((sum, [, b]) => sum + b, 0);
    const loopStart = Math.floor(beat / loop) * loop;
    let t = loopStart;
    for (let i = 0; i < voice.notes.length; i++) {
      if (t >= beat) return { index: i, beat: t };
      t += voice.notes[i][1];
    }
    return { index: 0, beat: loopStart + loop };
  });
}

function start(track: MusicTrack, fromBeat: number) {
  if (!hasUserGesture()) {
    waitForGesture(track, fromBeat);
    return;
  }
  const audioCtx = getAudioContext();
  if (!audioCtx) return;
  const bus = audioCtx.createGain();
  bus.gain.setValueAtTime(targetGain(), audioCtx.currentTime);
  bus.connect(audioCtx.destination);
  const cursors = cursorsAt(track, fromBeat);
  playback = {
    track,
    cursors,
    // Arranca un instante en el futuro para que la primera nota no llegue tarde.
    startTime: audioCtx.currentTime + 0.05,
    startBeat: Math.min(...cursors.map((c) => c.beat)),
    bus,
    timer: setInterval(tick, TICK_MS),
  };
  tick();
}

/** Corta la sesión actual con un fundido y devuelve el tiempo musical en el
 * que iba. */
function halt(): number | null {
  if (waiting) {
    const beat = waiting.beat;
    waiting = null;
    return beat;
  }
  if (!playback) return null;
  const audioCtx = getAudioContext();
  const { bus, timer, track, startTime, startBeat } = playback;
  clearInterval(timer);
  playback = null;
  if (!audioCtx) return null;
  const now = audioCtx.currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(bus.gain.value, now);
  bus.gain.linearRampToValueAtTime(0, now + FADE_S);
  setTimeout(() => bus.disconnect(), (LOOKAHEAD_S + FADE_S) * 1000 + 50);
  return startBeat + Math.max(0, now - startTime) / secondsPerBeat(track);
}

/** Toca la pista desde el inicio (corta lo que estuviera sonando). */
export function playTrack(id: TrackId): void {
  const track = MUSIC_TRACKS[id];
  if (!track) return;
  checkTrack(track);
  halt();
  paused = null;
  start(track, 0);
}

/** Pausa recordando la posición; `resumeMusic` sigue desde ahí. */
export function pauseMusic(): void {
  const track = playback?.track ?? waiting?.track;
  const beat = halt();
  if (track && beat !== null) paused = { track, beat };
}

export function resumeMusic(): void {
  if (!paused || playback) return;
  const { track, beat } = paused;
  paused = null;
  start(track, beat);
}

export function stopMusic(): void {
  halt();
  paused = null;
}

const CHOICE_PREFIX = "av-music:";

function isMusicChoice(value: unknown): value is MusicChoice {
  return value === "none" || (TRACK_IDS as readonly unknown[]).includes(value);
}

/** Pista elegida para un juego (`av-music:<gameId>`), o `fallback` (su
 * `music` del registro) si no hay una válida guardada. Leer solo en el
 * cliente, después de hidratar. */
export function getSavedMusic(gameId: string, fallback: MusicChoice): MusicChoice {
  try {
    const value = localStorage.getItem(CHOICE_PREFIX + gameId);
    return isMusicChoice(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveMusic(gameId: string, choice: MusicChoice): void {
  try {
    localStorage.setItem(CHOICE_PREFIX + gameId, choice);
  } catch {
    // localStorage bloqueado: la elección vale solo para esta sesión.
  }
}

export function getMusicVolume(): number {
  return volume;
}

/** Volumen de música 0–100 (persistido). Se aplica en vivo. */
export function setMusicVolume(next: number): void {
  volume = Math.max(0, Math.min(100, Math.round(next)));
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // localStorage bloqueado: el volumen vale para esta sesión, no se recuerda.
  }
  applyGain();
}

function applyGain() {
  const audioCtx = getAudioContext();
  if (!playback || !audioCtx) return;
  playback.bus.gain.setTargetAtTime(targetGain(), audioCtx.currentTime, 0.02);
}

// ♪ del nav: la música sigue corriendo, solo cambia su ganancia.
if (typeof window !== "undefined") onMuteChange(applyGain);
