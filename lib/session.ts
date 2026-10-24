import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type LoginProvider = "email" | "google" | "github";

/** Método con el que se inició la sesión y la cuenta de ese método (email o @usuario). */
export type SessionLogin = { provider: LoginProvider; account: string | null };

export type SessionUser = { username: string; login: SessionLogin };

/**
 * Usuario con sesión activa y el método con el que inició esta sesión, o
 * null si no hay sesión. Una cuenta puede tener email, Google y GitHub
 * vinculados, y `app_metadata.provider` solo guarda el primero.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
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

  if (!profile) return null;

  return { username: profile.username, login: await sessionLogin(supabase, user) };
}

/**
 * Método con el que se inició *esta* sesión. El `amr` del JWT dice
 * `password` u `oauth`, pero no qué proveedor OAuth: ese sale de la
 * identidad con el `updated_at` más reciente, que Supabase actualiza en cada
 * ingreso (`last_sign_in_at` no: queda fijo en el primer vínculo).
 */
async function sessionLogin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User
): Promise<SessionLogin> {
  const byPassword: SessionLogin = { provider: "email", account: user.email ?? null };

  const { data } = await supabase.auth.getClaims();
  const amr = (data?.claims.amr ?? []) as { method: string }[];
  if (!amr.some((entry) => entry.method === "oauth")) return byPassword;

  const latest = (user.identities ?? [])
    .filter((identity) => identity.provider === "google" || identity.provider === "github")
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0];
  if (!latest) return byPassword;

  const identityData = latest.identity_data ?? {};
  const account =
    latest.provider === "github"
      ? identityData.user_name
        ? `@${identityData.user_name}`
        : null
      : (identityData.email ?? null);

  return { provider: latest.provider as LoginProvider, account };
}

/** Username del usuario con sesión activa, o null si no hay sesión. */
export async function getSessionUsername(): Promise<string | null> {
  return (await getSessionUser())?.username ?? null;
}
