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

/** Cantidad de partidas guardadas (filas de `scores`) para un juego. */
export async function getPlaysCount(gameId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("scores")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gameId);

  if (error || count == null) return 0;

  return count;
}

/** Cantidad de partidas guardadas de varios juegos en una sola consulta. */
export async function getPlaysCountByGames(gameIds: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = Object.fromEntries(gameIds.map((id) => [id, 0]));
  if (gameIds.length === 0) return result;

  const supabase = await createClient();

  const { data, error } = await supabase.from("scores").select("game_id").in("game_id", gameIds);

  if (error || !data) return result;

  for (const row of data) {
    result[row.game_id] = (result[row.game_id] ?? 0) + 1;
  }

  return result;
}

export type GlobalRankRow = { username: string; totalScore: number; gamesPlayed: number };

/**
 * Ranking global: suma de TODOS los puntajes históricos de cada jugador,
 * en cualquier juego (no el mejor por juego) — premia jugar mucho, no solo
 * jugar bien. `gamesPlayed` es el conteo total de partidas guardadas de ese
 * jugador, en cualquier juego.
 */
export async function getGlobalTopPlayers(limit = 12): Promise<GlobalRankRow[]> {
  const supabase = await createClient();

  const { data: scores, error } = await supabase.from("scores").select("user_id, score");

  if (error || !scores || scores.length === 0) return [];

  const totals = new Map<string, { totalScore: number; gamesPlayed: number }>();
  for (const s of scores) {
    const entry = totals.get(s.user_id) ?? { totalScore: 0, gamesPlayed: 0 };
    entry.totalScore += s.score;
    entry.gamesPlayed += 1;
    totals.set(s.user_id, entry);
  }

  const userIds = [...totals.keys()];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", userIds);

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  return [...totals.entries()]
    .map(([userId, { totalScore, gamesPlayed }]) => ({
      username: usernameById.get(userId) ?? "???",
      totalScore,
      gamesPlayed,
    }))
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, limit);
}
