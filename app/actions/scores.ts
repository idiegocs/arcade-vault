"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveScoreResult = { ok: true } | { ok: false; error: string };

/**
 * Guarda una puntuación para el usuario autenticado actual. Obtiene la
 * sesión server-side (nunca confía en un userId enviado por el cliente) y
 * respeta la RLS de `scores` (insert solo con `user_id = auth.uid()`).
 * Nunca lanza — siempre resuelve con `{ ok, ... }`.
 */
export async function saveScore(gameId: string, score: number): Promise<SaveScoreResult> {
  if (!Number.isInteger(score) || score < 0) {
    return { ok: false, error: "Puntuación inválida." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Inicia sesión para guardar tu puntuación." };
  }

  const { error } = await supabase.from("scores").insert({
    user_id: user.id,
    game_id: gameId,
    score,
  });

  if (error) {
    // No exponer el mensaje crudo de Postgres al usuario (puede filtrar
    // nombres de constraints, ej. la FK de scores.game_id -> games.id).
    console.error("saveScore insert failed:", error);
    return { ok: false, error: "No se pudo guardar tu puntuación. Intenta de nuevo." };
  }

  // El "Mejor global" (/juegos/[id] y /games) y el leaderboard
  // (/salon-de-la-fama) están cacheados por el router — sin esto, volver a
  // esas rutas por navegación cliente (Link) mostraría el dato viejo hasta
  // un refresh manual.
  revalidatePath(`/juegos/${gameId}`);
  revalidatePath("/games");
  revalidatePath("/salon-de-la-fama");

  return { ok: true };
}
