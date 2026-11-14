import "server-only";
import { publicEnv } from "@/lib/env.public";

/**
 * Variables secretas del servidor, validadas (spec 18). Cada getter valida
 * solo lo que usa: si falta Resend, no se cae el login.
 * Las públicas (y la guarda anti-dev-en-prod) están en `lib/env.public.ts`.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Ver db/environments/<ambiente>/.env.example.`
    );
  }
  return value;
}

/** URL + secret key de Supabase para el cliente admin (`service_role`). */
export function supabaseAdminEnv(): { supabaseUrl: string; secretKey: string } {
  return {
    supabaseUrl: publicEnv().supabaseUrl,
    secretKey: required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
  };
}

/** Configuración de Resend para el formulario de contacto. */
export function contactEmailEnv(): { apiKey: string; from: string; to: string } {
  return {
    apiKey: required("RESEND_API_KEY", process.env.RESEND_API_KEY),
    from: required("RESEND_FROM", process.env.RESEND_FROM),
    to: required("CONTACT_EMAIL", process.env.CONTACT_EMAIL),
  };
}
