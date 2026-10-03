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

/** Arpegio de un compás en corcheas: sube por los 4 tonos y vuelve. */
function arp(a: string, b: string, c: string, d: string): string {
  return `${a} .5 ${b} .5 ${c} .5 ${d} .5 ${c} .5 ${b} .5 ${a} .5 ${b} .5`;
}

/** Bajo "bombeando" un compás en corcheas: fundamental con un golpe de octava. */
function pump(...roots: string[]): string {
  return roots
    .map((root) => {
      const up = root.replace(/\d$/, (d) => String(Number(d) + 1));
      return `${root} .5 ${root} .5 ${up} .5 ${root} .5 `.repeat(2);
    })
    .join(" | ");
}

const ORBITA: MusicTrack = {
  id: "orbita",
  label: "ÓRBITA",
  bpm: 96,
  voices: [
    {
      wave: "triangle",
      gain: 0.55,
      // Mi menor, melodía lenta flotando sobre los arpegios.
      notes: seq(`
        B4 2 G4 2 | E5 4 | F#5 2 E5 1 D5 1 | F#5 4 |
        B4 2 G4 2 | E5 2 G5 2 | F#5 3 A5 1 | F#5 4 |
        E5 2 C5 2 | G5 4 | E5 2 G5 2 | F#5 2 D#5 2 |
        E5 2 B4 2 | G5 2 E5 2 | F#5 2 A5 1 F#5 1 | E5 4
      `),
    },
    {
      wave: "triangle",
      gain: 0.3,
      notes: seq(
        [
          arp("E4", "G4", "B4", "E5"),
          arp("C4", "E4", "G4", "C5"),
          arp("D4", "F#4", "A4", "D5"),
          arp("B3", "D4", "F#4", "B4"),
          arp("E4", "G4", "B4", "E5"),
          arp("C4", "E4", "G4", "C5"),
          arp("D4", "F#4", "A4", "D5"),
          arp("D4", "F#4", "A4", "D5"),
          arp("A3", "C4", "E4", "A4"),
          arp("C4", "E4", "G4", "C5"),
          arp("E4", "G4", "B4", "E5"),
          arp("B3", "D#4", "F#4", "B4"),
          arp("E4", "G4", "B4", "E5"),
          arp("C4", "E4", "G4", "C5"),
          arp("D4", "F#4", "A4", "D5"),
          arp("E4", "G4", "B4", "E5"),
        ].join(" | ")
      ),
    },
    {
      wave: "sine",
      gain: 0.6,
      notes: seq(`
        E2 4 | C2 4 | D2 4 | B1 4 | E2 4 | C2 4 | D2 4 | D2 4 |
        A1 4 | C2 4 | E2 4 | B1 4 | E2 4 | C2 4 | D2 4 | E2 4
      `),
    },
  ],
};

const TURBO: MusicTrack = {
  id: "turbo",
  label: "TURBO",
  bpm: 160,
  voices: [
    {
      wave: "square",
      gain: 0.3,
      // Re menor, melodía rápida con semicorcheas y cierre en La (dominante)
      // para que el bucle vuelva con fuerza al inicio.
      notes: seq(`
        D5 .5 F5 .5 A5 .5 F5 .5 D5 .5 F5 .5 A5 .5 C6 .5 | A5 1 G5 .5 F5 .5 E5 .5 F5 .5 G5 1 |
        F5 .5 D5 .5 Bb4 .5 D5 .5 F5 1 Bb5 1 | A5 .5 G5 .5 E5 .5 C5 .5 E5 .5 G5 .5 C6 1 |
        D5 .5 F5 .5 A5 .5 F5 .5 D5 .5 F5 .5 A5 .5 C6 .5 | A5 .5 C6 .5 A5 .5 F5 .5 D5 1 F5 1 |
        D5 .5 F5 .5 Bb5 .5 A5 .5 G5 .5 F5 .5 D5 1 | C#5 .5 E5 .5 A5 .5 G5 .5 E5 .5 C#5 .5 A4 1 |
        G5 .25 A5 .25 G5 .25 F5 .25 D5 1 Bb4 .5 D5 .5 G5 1 | G5 .5 A5 .5 Bb5 1 A5 .5 G5 .5 F5 1 |
        F5 .25 G5 .25 F5 .25 E5 .25 D5 1 A4 .5 D5 .5 F5 1 | A5 2 - 1 A5 .5 C6 .5 |
        Bb5 .5 A5 .5 G5 .5 F5 .5 D5 1 Bb4 1 | C5 .5 E5 .5 G5 .5 C6 .5 Bb5 .5 A5 .5 G5 1 |
        A5 .5 F5 .5 D5 .5 F5 .5 A5 1 D6 1 | C#6 1 A5 .5 E5 .5 C#5 1 - 1
      `),
    },
    {
      wave: "triangle",
      gain: 0.85,
      notes: seq(
        pump(
          "D2",
          "D2",
          "Bb1",
          "C2",
          "D2",
          "D2",
          "Bb1",
          "A1",
          "G1",
          "G1",
          "D2",
          "D2",
          "Bb1",
          "C2",
          "D2",
          "A1"
        )
      ),
    },
  ],
};

const JARDIN: MusicTrack = {
  id: "jardin",
  label: "JARDÍN",
  bpm: 110,
  voices: [
    {
      wave: "triangle",
      gain: 0.55,
      // Sol mayor, notas largas y respiraciones: para jugar tranquilo.
      notes: seq(`
        B4 2 D5 1 G5 1 | F#5 3 E5 1 | E5 2 G5 1 E5 1 | C5 4 |
        B4 1 C5 1 D5 2 | A4 2 F#4 2 | G4 1 A4 1 C5 1 E5 1 | D5 4 |
        E5 2 B4 2 | C5 2 E5 1 G5 1 | D5 2 B4 1 G4 1 | A4 3 - 1 |
        C5 1 E5 1 G5 2 | F#5 1 E5 1 D5 1 A5 1 | G5 4 | - 2 D5 2
      `),
    },
    {
      wave: "triangle",
      gain: 0.7,
      // Fundamental y quinta en blancas.
      notes: seq(`
        G2 2 D3 2 | D2 2 A2 2 | E2 2 B2 2 | C2 2 G2 2 |
        G2 2 D3 2 | D2 2 A2 2 | C2 2 G2 2 | D2 2 A2 2 |
        E2 2 B2 2 | C2 2 G2 2 | G2 2 D3 2 | D2 2 A2 2 |
        C2 2 G2 2 | D2 2 A2 2 | G2 2 D3 2 | G2 2 D3 2
      `),
    },
  ],
};

export const MUSIC_TRACKS: Record<TrackId, MusicTrack> = {
  bloques: BLOQUES,
  orbita: ORBITA,
  turbo: TURBO,
  jardin: JARDIN,
};
