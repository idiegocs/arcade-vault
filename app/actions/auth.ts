"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  AUTH_UNAVAILABLE,
  INVALID_CREDENTIALS,
  LINK_EXPIRED,
  safeNext,
  translateAuthError,
} from "@/lib/auth-errors";
import { isRecoverySession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuthFormState =
  { error: string } | { notice: "check-email" | "reset-sent" } | undefined;

/** URL de /auth/callback para los enlaces que manda Supabase, con el destino final en `next`. */
async function callbackUrl(next: string): Promise<string> {
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

const USERNAME_RE = /^[a-z0-9_]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export async function signUp(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const username = (formData.get("username") as string | null)?.trim().toLowerCase();
  const email = (formData.get("email") as string | null)?.trim();
  const password = formData.get("password") as string | null;

  if (!username || !email || !password) {
    return { error: "Completa usuario, correo y contraseña." };
  }
  if (!USERNAME_RE.test(username)) {
    return { error: "El usuario debe tener de 3 a 16 caracteres: letras, números o _." };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "El correo no tiene un formato válido." };
  }
  if (password.length < MIN_PASSWORD) {
    return { error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
  }

  const supabase = await createClient();

  const { data: taken } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (taken) {
    return { error: "Ese usuario ya está en uso." };
  }

  const next = safeNext(formData.get("next") as string | null);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username }, emailRedirectTo: await callbackUrl(next) },
  });

  if (error) {
    return { error: translateAuthError(error.message) };
  }

  // Sin sesión = el proyecto tiene "Confirm email" activado: falta el enlace del correo.
  if (!data.session) {
    return { notice: "check-email" };
  }

  redirect(next);
}

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const identifier = (formData.get("identifier") as string | null)?.trim();
  const password = formData.get("password") as string | null;

  if (!identifier || !password) {
    return { error: "Completa usuario o correo, y contraseña." };
  }

  let email = identifier;
  if (!identifier.includes("@")) {
    // Usuario → email con la secret key: email_for_username solo la ejecuta service_role.
    let data: unknown = null;
    try {
      const result = await createAdminClient().rpc("email_for_username", {
        p_username: identifier,
      });
      if (result.error) throw result.error;
      data = result.data;
    } catch (lookupError) {
      // Falta SUPABASE_SECRET_KEY, la clave es inválida o no está la migración 005:
      // es un problema de configuración, no del jugador. Se registra y se avisa genérico.
      console.error("[auth] email_for_username falló:", lookupError);
      return { error: AUTH_UNAVAILABLE };
    }
    if (!data) {
      // Mismo mensaje que una contraseña incorrecta: no revela qué usuarios existen.
      return { error: INVALID_CREDENTIALS };
    }
    email = data as string;
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase ya devuelve "Invalid login credentials" tanto si el correo no
    // existe como si la contraseña es incorrecta: no revela qué cuentas existen.
    return { error: translateAuthError(error.message) };
  }

  redirect(safeNext(formData.get("next") as string | null));
}

/**
 * "¿Olvidaste tu contraseña?". Siempre responde lo mismo, exista o no el
 * correo, para no revelar qué cuentas hay. El enlace del correo pasa por
 * /auth/callback (que crea la sesión) y termina en /auth/restablecer.
 */
export async function requestPasswordReset(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = (formData.get("email") as string | null)?.trim();

  if (!email || !EMAIL_RE.test(email)) {
    return { error: "El correo no tiene un formato válido." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await callbackUrl("/auth/restablecer"),
  });

  return { notice: "reset-sent" };
}

/** /auth/restablecer: contraseña nueva para la sesión que dejó el enlace del correo. */
export async function updatePassword(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const password = formData.get("password") as string | null;
  const confirm = formData.get("confirm") as string | null;

  if (!password || password.length < MIN_PASSWORD) {
    return { error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
  }
  if (password !== confirm) {
    return { error: "Las contraseñas no coinciden." };
  }

  // La página ya lo exige, pero la Server Action se puede invocar sin pasar por ella.
  if (!(await isRecoverySession())) {
    return { error: LINK_EXPIRED };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: translateAuthError(error.message) };
  }

  redirect("/");
}

const PROVIDERS = ["google", "github"] as const;
type Provider = (typeof PROVIDERS)[number];

/**
 * Google / GitHub. Supabase devuelve la URL del proveedor; tras autorizar,
 * vuelve a /auth/callback, que crea la sesión (el code verifier de PKCE ya
 * quedó en una cookie acá). Un error redirige a /auth?error=proveedor.
 */
export async function signInWithProvider(formData: FormData) {
  const provider = formData.get("provider") as string | null;
  const next = safeNext(formData.get("next") as string | null);

  if (!PROVIDERS.includes(provider as Provider)) {
    redirect("/auth?error=proveedor");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: { redirectTo: await callbackUrl(next) },
  });

  if (error || !data.url) {
    redirect("/auth?error=proveedor");
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
