/**
 * Preferencia de skin por juego, guardada en `localStorage` (mismo patrón
 * que el mute de `audio.ts`). Las paletas concretas viven en cada motor
 * (`SKINS` dentro del propio archivo del motor) — este archivo solo tiene
 * la persistencia y las etiquetas compartidas.
 *
 * Leer solo en el cliente, después de hidratar (ej. dentro de un
 * `useEffect`): el servidor no tiene `localStorage`.
 */
import { DEFAULT_SKIN, REQUIRED_SKINS, type SkinId } from "./game-engine";

const KEY_PREFIX = "av-skin:";

export const SKIN_LABELS: Record<SkinId, string> = {
  clasico: "CLÁSICO",
  neon: "NEÓN",
  retro: "RETRO",
};

function isSkinId(value: unknown): value is SkinId {
  return typeof value === "string" && (REQUIRED_SKINS as readonly string[]).includes(value);
}

export function getSavedSkin(gameId: string): SkinId {
  if (typeof window === "undefined") return DEFAULT_SKIN;
  try {
    const value = window.localStorage.getItem(KEY_PREFIX + gameId);
    return isSkinId(value) ? value : DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}

export function saveSkin(gameId: string, skin: SkinId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PREFIX + gameId, skin);
  } catch {
    // Storage lleno o bloqueado (modo privado): la skin vale solo esta sesión.
  }
}
