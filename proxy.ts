import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/proxy/session";

/**
 * Proxy de Next 16 (antes middleware.ts). Solo orquesta: la lógica vive en
 * lib/proxy/ (un solo proxy.ts por proyecto, organizado en módulos).
 */
export async function proxy(request: NextRequest) {
  const { response } = await updateSession(request);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
