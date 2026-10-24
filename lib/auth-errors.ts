/**
 * Traducción de los errores de Supabase Auth al español y validación de
 * destinos de redirección.
 */

export const INVALID_CREDENTIALS = "Usuario o contraseña incorrectos.";

export const LINK_EXPIRED = "El enlace expiró. Pide uno nuevo.";

export const PROVIDER_UNAVAILABLE = "Proveedor no disponible. Prueba con otro método.";

export const AUTH_UNAVAILABLE = "Algo salió mal. Intenta de nuevo en unos segundos.";

// Fragmentos (en minúsculas) de los mensajes de Supabase → texto en español.
// El orden importa: gana el primero que aparece en el mensaje.
const TRANSLATIONS: [string, string][] = [
  ["invalid login credentials", INVALID_CREDENTIALS],
  ["email not confirmed", "Confirma tu correo antes de entrar. Revisa tu bandeja de entrada."],
  ["user already registered", "Ese correo ya tiene una cuenta. Inicia sesión."],
  ["already been registered", "Ese correo ya tiene una cuenta. Inicia sesión."],
  ["password should be at least", "La contraseña debe tener al menos 8 caracteres."],
  ["weak password", "La contraseña es demasiado débil."],
  [
    "should be different from the old password",
    "La contraseña nueva debe ser distinta de la anterior.",
  ],
  ["invalid format", "El correo no tiene un formato válido."],
  ["rate limit", "Demasiados intentos. Espera un momento y vuelve a probar."],
  ["you can only request this after", "Demasiados intentos. Espera un momento y vuelve a probar."],
  ["auth session missing", "Tu sesión expiró. Vuelve a iniciar sesión."],
  ["expired", LINK_EXPIRED],
  ["database error saving new user", "No pudimos crear tu perfil. Intenta de nuevo."],
];

/** Mensaje de Supabase (en inglés) → mensaje para el jugador (en español). */
export function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  const match = TRANSLATIONS.find(([fragment]) => lower.includes(fragment));
  return match ? match[1] : AUTH_UNAVAILABLE;
}

// Origen ficticio para resolver `next` como lo haría el navegador.
const SAFE_NEXT_BASE = "http://arcade-vault.invalid";

/**
 * Destino seguro tras iniciar sesión: solo rutas internas ("/juegos/caida").
 * No alcanza con mirar el prefijo: el parser de URLs descarta tabs y saltos
 * de línea y trata "\" como "/", así que "/\t/evil.com" o "/\evil.com"
 * terminan en otro host. Se resuelve la URL y se exige que el origen no cambie.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  try {
    const url = new URL(next, SAFE_NEXT_BASE);
    if (url.origin !== SAFE_NEXT_BASE) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
