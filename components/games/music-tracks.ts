/**
 * Catálogo de música de fondo (spec 13): pistas chiptune originales,
 * sintetizadas por `music.ts`. Cada juego declara su pista por defecto en
 * `registry.ts` (`music`) y el jugador puede elegir cualquier otra.
 *
 * Para agregar una pista: sumar su id a `TRACK_IDS` y su entrada a
 * `MUSIC_TRACKS`. Todas las voces de una pista deben sumar la misma cantidad
 * de tiempos (si no, el bucle se desfasa — `music.ts` lo avisa en desarrollo).
 */

export const TRACK_IDS = ["bloques", "orbita", "turbo", "jardin"] as const;
export type TrackId = (typeof TRACK_IDS)[number];
/** Lo que elige el jugador en el selector: una pista o ninguna. */
export type MusicChoice = TrackId | "none";

/** [altura MIDI (60 = Do central) o null = silencio, duración en tiempos]. */
export type Note = readonly [pitch: number | null, beats: number];

export type Voice = {
  wave: OscillatorType;
  /** Volumen relativo de la voz dentro de la pista (0–1). */
  gain: number;
  notes: readonly Note[];
};

export type MusicTrack = {
  id: TrackId;
  /** Etiqueta del selector, ej. "ÓRBITA". */
  label: string;
  bpm: number;
  /** Melodía + bajo (y opcionalmente una 3ª voz), todas de igual duración. */
  voices: readonly Voice[];
};

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Convierte notación legible a `Note[]`: pares `<nota> <tiempos>` separados
 * por espacios, ej. `"E5 1 B4 .5 - 2"`. La nota es letra + `#`/`b` opcional +
 * octava (`C4` = MIDI 60); `-` es silencio. Los `|` (separadores de compás)
 * se ignoran.
 */
function seq(text: string): Note[] {
  const tokens = text.split(/\s+/).filter((t) => t && t !== "|");
  const notes: Note[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const name = tokens[i];
    const beats = Number(tokens[i + 1]);
    if (name === "-") {
      notes.push([null, beats]);
      continue;
    }
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    if (!m) throw new Error(`music-tracks: nota inválida "${name}"`);
    const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
    notes.push([12 * (Number(m[3]) + 1) + SEMITONES[m[1]] + accidental, beats]);
  }
  return notes;
}

/** Bajo "rebotando" entre la fundamental y su octava, en corcheas, un compás
 * de 4 tiempos por cada raíz. */
function bounce(...roots: string[]): string {
  return roots
    .map((root) => {
      const up = root.replace(/\d$/, (d) => String(Number(d) + 1));
      return `${root} .5 ${up} .5 `.repeat(4);
    })
    .join(" | ");
}

const BLOQUES: MusicTrack = {
  id: "bloques",
  label: "BLOQUES",
  bpm: 140,
  voices: [
    {
      wave: "square",
      gain: 0.35,
      // La menor, 16 compases: tema, respuesta, arpegios, tema con cierre.
      notes: seq(`
        E5 1 B4 .5 C5 .5 D5 1 C5 .5 B4 .5 | A4 1 A4 .5 C5 .5 E5 1 D5 .5 C5 .5 |
        B4 1.5 C5 .5 D5 1 E5 1 | C5 1 A4 1 A4 2 |
        - .5 D5 1 F5 .5 A5 1 G5 .5 F5 .5 | E5 1.5 C5 .5 E5 1 D5 .5 C5 .5 |
        B4 1 B4 .5 C5 .5 D5 1 E5 1 | C5 1 A4 1 A4 1 - 1 |
        A4 .5 C5 .5 E5 .5 A5 .5 G5 .5 E5 .5 C5 .5 E5 .5 | F5 .5 D5 .5 A4 .5 D5 .5 F5 1 E5 1 |
        D5 .5 B4 .5 G4 .5 B4 .5 D5 1 E5 .5 D5 .5 | C5 1 E5 1 A4 2 |
        E5 1 B4 .5 C5 .5 D5 1 C5 .5 B4 .5 | A4 1 A4 .5 C5 .5 E5 1 D5 .5 C5 .5 |
        B4 1 G#4 .5 B4 .5 E5 1 D5 1 | C5 1 B4 1 A4 2
      `),
    },
    {
      wave: "triangle",
      gain: 0.8,
      notes: seq(
        bounce(
          "A2",
          "A2",
          "E2",
          "A2",
          "D2",
          "A2",
          "E2",
          "A2",
          "A2",
          "D2",
          "G2",
          "A2",
          "A2",
          "A2",
          "E2",
          "A2"
        )
      ),
    },
  ],
};

/** Pistas compuestas hasta ahora. Las de `TRACK_IDS` que faltan se suman en
 * el paso 3 del spec 13. */
export const MUSIC_TRACKS: Partial<Record<TrackId, MusicTrack>> = {
  bloques: BLOQUES,
};
