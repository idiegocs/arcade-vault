import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env.public";

/**
 * Refresca la sesión de Supabase (cookies) en cada request y devuelve el
 * usuario, para que las reglas de rutas lo reusen sin otra llamada a Auth.
 * Si alguna regla redirige, tiene que copiar las cookies de `response`.
 */
export async function updateSession(
  request: NextRequest
): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({ request });

  const { supabaseUrl, supabasePublishableKey } = publicEnv();

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // No agregar lógica entre createServerClient y getUser(): getUser() es lo que
  // efectivamente refresca el token si está por expirar.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
