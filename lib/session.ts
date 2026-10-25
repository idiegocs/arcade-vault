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

  // El perfil y el método de ingreso no dependen entre sí: en paralelo.
  const [username, login] = await Promise.all([
    profileUsername(supabase, user.id),
    sessionLogin(supabase, user),
  ]);

  return username ? { username, login } : null;
}

async function profileUsername(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .single();
  return profile?.username ?? null;
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

/**
 * true si la sesión actual la creó un enlace de recuperación de contraseña
 * (`amr` = `recovery`). /auth/restablecer y `updatePassword` lo exigen: con
 * cualquier otra sesión se podría cambiar la contraseña sin conocer la actual.
 */
export async function isRecoverySession(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const amr = (data?.claims.amr ?? []) as { method: string }[];
  return amr.some((entry) => entry.method === "recovery");
}

/**
 * Jugador de la sesión activa, o null si no hay sesión. `username` puede ser
 * null con sesión (perfil faltante): quien lo usa distingue "sin sesión" de
 * "sin perfil" para no mandar a /auth a alguien que ya entró.
 */
export async function getSessionPlayer(): Promise<{ username: string | null } | null> {
  // Sin el método de ingreso: quien lo usa (la página de juego) no lo necesita.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { username: await profileUsername(supabase, user.id) } : null;
}
