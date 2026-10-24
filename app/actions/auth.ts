"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext, translateAuthError } from "@/lib/auth-errors";

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
  const email = (formData.get("email") as string | null)?.trim();
  const password = formData.get("password") as string | null;

  if (!email || !password) {
    return { error: "Completa correo y contraseña." };
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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
