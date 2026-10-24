import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-errors";

/**
 * Destino de todos los enlaces de Supabase Auth: OAuth (Google/GitHub),
 * confirmación de email y recuperación de contraseña. Cambia el `code` por
 * una sesión (cookies) y redirige a `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // Supabase vuelve con ?error=… (sin code) si el jugador canceló en Google/GitHub,
  // el proveedor está apagado o rechazó el ingreso: no es un enlace vencido.
  if (searchParams.has("error")) {
    return NextResponse.redirect(new URL("/auth?error=proveedor", origin));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Sin code, code inválido, expirado o ya usado.
  return NextResponse.redirect(new URL("/auth?error=enlace", origin));
}
