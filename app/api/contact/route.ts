import { sendContactEmail } from "@/lib/email";
import { EMAIL_RE } from "@/lib/validation";

// Largos máximos (spec 17): 254 es el máximo de un email (RFC 5321).
const MAX_LENGTH = { name: 100, email: 254, message: 5000 } as const;
 
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

const badRequest = (error: string) => Response.json({ ok: false, error }, { status: 400 });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("El cuerpo de la solicitud no es JSON válido.");
  }

  const { name, email, message } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || typeof email !== "string" || typeof message !== "string") {
    return badRequest("Faltan campos requeridos: name, email y message.");
  }

  const fields = { name: name.trim(), email: email.trim(), message: message.trim() };

  if (!fields.name || !fields.email || !fields.message) {
    return badRequest("Faltan campos requeridos: name, email y message.");
  }
  if (fields.name.length > MAX_LENGTH.name) {
    return badRequest(`El nombre puede tener hasta ${MAX_LENGTH.name} caracteres.`);
  }
  if (fields.email.length > MAX_LENGTH.email) {
    return badRequest(`El correo puede tener hasta ${MAX_LENGTH.email} caracteres.`);
  }
  if (fields.message.length > MAX_LENGTH.message) {
    return badRequest(`El mensaje puede tener hasta ${MAX_LENGTH.message} caracteres.`);
  }
  // El nombre va en el asunto del correo (un header): sin saltos de línea ni
  // caracteres de control. El mensaje sí puede tenerlos, va en el cuerpo.
  if (CONTROL_CHARS_RE.test(fields.name)) {
    return badRequest("El nombre no puede tener saltos de línea ni caracteres especiales.");
  }
  if (!EMAIL_RE.test(fields.email)) {
    return badRequest("El correo no tiene un formato válido.");
  }

  try {
    await sendContactEmail(fields);
    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    // El detalle del proveedor (Resend) queda en el log, nunca en la respuesta.
    console.error("[contact] sendContactEmail falló:", error);
    return Response.json(
      { ok: false, error: "No se pudo enviar el mensaje. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
