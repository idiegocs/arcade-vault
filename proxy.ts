import { NextResponse, type NextRequest } from "next/server";
import { guardRoute } from "@/lib/proxy/route-guards";
import { updateSession } from "@/lib/proxy/session";

/**
 * Proxy de Next 16 (antes middleware.ts). Solo orquesta: la lógica vive en
 * lib/proxy/ (un solo proxy.ts por proyecto, organizado en módulos).
 */
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const redirectTo = guardRoute(request, user);
  if (!redirectTo) return response;

  // Las cookies que getUser() acaba de refrescar viajan en `response`: si el
  // redirect no las lleva, el token nuevo se pierde y la sesión se cae.
  const redirect = NextResponse.redirect(redirectTo);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
