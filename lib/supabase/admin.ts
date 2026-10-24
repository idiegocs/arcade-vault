import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la secret key (rol `service_role`): salta RLS y puede ejecutar
 * funciones restringidas como `email_for_username`. Solo para Server Actions
 * — nunca importarlo desde un Client Component, o la clave llega al navegador.
 * Sin cookies ni sesión: no actúa en nombre de ningún usuario.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en .env.local");
  }

  return createSupabaseClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
