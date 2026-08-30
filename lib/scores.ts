import { createClient } from "@/lib/supabase/server";

export type TopScoreRow = { username: string; score: number; created_at: string };

/** Puntaje máximo registrado para un juego, o null si no hay ninguno todavía. */
export async function getBestScore(gameId: string): Promise<number | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scores")
    .select("score")
    .eq("game_id", gameId)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return data.score;
}

/**
 * Mejor puntaje de varios juegos en una sola consulta (para listas/grids).
 * Trae todas las filas de esos juegos ordenadas por score desc y se queda
 * con la primera (máxima) por game_id.
 */
export async function getBestScoresByGames(
  gameIds: string[]
): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = Object.fromEntries(gameIds.map((id) => [id, null]));
  if (gameIds.length === 0) return result;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scores")
    .select("game_id, score")
    .in("game_id", gameIds)
    .order("score", { ascending: false });

  if (error || !data) return result;

  for (const row of data) {
    if (result[row.game_id] === null) {
      result[row.game_id] = row.score;
    }
  }

  return result;
}

/**
 * Top de puntajes de un juego, con el username de cada jugador.
 * `scores` solo guarda `user_id`; el username se resuelve con una segunda
 * consulta a `profiles` (no hay FK directa entre ambas tablas, ambas
 * referencian a `auth.users`).
 */
export async function getTopScoresByGame(gameId: string, limit = 10): Promise<TopScoreRow[]> {
  const supabase = await createClient();

  const { data: scores, error } = await supabase
    .from("scores")
    .select("user_id, score, created_at")
    .eq("game_id", gameId)
    .order("score", { ascending: false })
    .limit(limit);

  if (error || !scores || scores.length === 0) return [];

  const userIds = [...new Set(scores.map((s) => s.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", userIds);

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  return scores.map((s) => ({
    username: usernameById.get(s.user_id) ?? "???",
    score: s.score,
    created_at: s.created_at,
  }));
}
