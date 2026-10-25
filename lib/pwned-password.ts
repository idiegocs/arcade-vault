import { createHash } from "node:crypto";

/**
 * Leaked password protection propia (spec 16): el toggle de Supabase es solo
 * del plan Pro. Consulta la API Pwned Passwords de HaveIBeenPwned con
 * k-anonymity — solo viajan los 5 primeros caracteres del SHA-1, nunca la
 * contraseña ni el hash completo. Solo para Server Actions (usa node:crypto).
 *
 * Fail-open: si HIBP no responde, se deja pasar (con un warning). Una caída
 * externa no bloquea los registros; el resto de las reglas sigue aplicando.
 */
const RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 3000;

export async function isPwnedPassword(password: string): Promise<boolean> {
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const res = await fetch(`${RANGE_URL}${prefix}`, {
      // Padding: la respuesta tiene un tamaño parecido para cualquier prefijo.
      headers: { "Add-Padding": "true" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HIBP respondió ${res.status}`);

    // Cada línea es "SUFIJO:apariciones"; las de padding traen 0 apariciones.
    return (await res.text()).split("\n").some((line) => {
      const [lineSuffix, count] = line.trim().split(":");
      return lineSuffix === suffix && Number(count) > 0;
    });
  } catch (error) {
    console.warn("[auth] Pwned Passwords no disponible, se omite el chequeo:", error);
    return false;
  }
}
