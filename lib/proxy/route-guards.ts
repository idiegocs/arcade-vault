import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { authRedirectPath } from "@/lib/auth-errors";

/**
 * Reglas de rutas del proxy (spec 16). Son chequeos optimistas: solo miran si
 * hay `user`, sin consultar la base. Las páginas repiten su propio chequeo y
 * RLS sigue siendo la defensa real de los datos.
 */

// Rutas que exigen sesión. Jugar requiere cuenta; catálogo, fichas, ranking y
// el resto siguen públicos.
const PROTECTED_ROUTES: RegExp[] = [/^\/juegos\/[^/]+\/jugar\/?$/];

/** URL a la que hay que redirigir, o null si la request sigue su curso. */
export function guardRoute(request: NextRequest, user: User | null): URL | null {
  const { pathname, search } = request.nextUrl;

  if (!user && PROTECTED_ROUTES.some((route) => route.test(pathname))) {
    return new URL(authRedirectPath(`${pathname}${search}`), request.url);
  }

  // Con sesión no hay nada que hacer en /auth. /auth/restablecer queda fuera a
  // propósito: la sesión de recuperación también es una sesión.
  if (user && (pathname === "/auth" || pathname === "/auth/")) {
    return new URL("/", request.url);
  }

  // Sin sesión no hay contraseña que restablecer (la página además exige amr = recovery).
  if (!user && pathname.startsWith("/auth/restablecer")) {
    return new URL("/auth", request.url);
  }

  return null;
}
