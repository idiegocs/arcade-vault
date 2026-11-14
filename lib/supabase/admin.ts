import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdminEnv } from "@/lib/env";

/**
 * Cliente con la secret key (rol `service_role`): salta RLS y puede ejecutar
 * funciones restringidas como `email_for_username`. Solo para Server Actions
 * — nunca importarlo desde un Client Component, o la clave llega al navegador.
 * Sin cookies ni sesión: no actúa en nombre de ningún usuario.
 */
export function createAdminClient(): SupabaseClient {
  const { supabaseUrl, secretKey } = supabaseAdminEnv();

  return createSupabaseClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
