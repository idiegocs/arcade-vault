import { createClient } from "@/lib/supabase/server";

/** Username del usuario con sesión activa, o null si no hay sesión. */
export async function getSessionUsername(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  return profile?.username ?? null;
}
