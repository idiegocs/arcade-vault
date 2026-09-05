import { createClient } from "@/lib/supabase/server";

export type GameCategory = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export type Game = {
  id: string; // slug, ej. "rocas" — mismo id usado en rutas y en scores.game_id
  title: string;
  short: string;
  long: string;
  cat: GameCategory;
  cover: string;
  color: "cyan" | "magenta" | "yellow" | "green";
};

export const CATEGORIES = ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"] as const;

/** Catálogo completo de juegos, en el orden de exhibición definido por `sort_order`. */
export async function getGames(): Promise<Game[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("games").select("*").order("sort_order");

  if (error || !data) return [];

  return data;
}

/** Un juego del catálogo por su id (slug), o null si no existe. */
export async function getGameById(id: string): Promise<Game | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("games").select("*").eq("id", id).maybeSingle();

  if (error || !data) return null;

  return data;
}
