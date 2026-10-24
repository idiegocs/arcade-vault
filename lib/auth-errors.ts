/**
 * Traducción de los errores de Supabase Auth al español y validación de
 * destinos de redirección.
 */

export const INVALID_CREDENTIALS = "Usuario o contraseña incorrectos.";

const GENERIC_ERROR = "Algo salió mal. Intenta de nuevo en unos segundos.";

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
  ["expired", "El enlace expiró. Pide uno nuevo."],
  ["database error saving new user", "No pudimos crear tu perfil. Intenta de nuevo."],
];

/** Mensaje de Supabase (en inglés) → mensaje para el jugador (en español). */
export function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  const match = TRANSLATIONS.find(([fragment]) => lower.includes(fragment));
  return match ? match[1] : GENERIC_ERROR;
}

/**
 * Destino seguro tras iniciar sesión: solo rutas internas ("/juegos/caida").
 * "//evil.com" y "/\evil.com" los navegadores los tratan como URLs externas.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}
