import { sendContactEmail } from "@/lib/email";
import { EMAIL_RE } from "@/lib/validation";

// Largos máximos (spec 17): 254 es el máximo de un email (RFC 5321).
const MAX_LENGTH = { name: 100, email: 254, message: 5000 } as const;

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
  if (
    fields.name.length > MAX_LENGTH.name ||
    fields.email.length > MAX_LENGTH.email ||
    fields.message.length > MAX_LENGTH.message
  ) {
    return badRequest(
      `Máximo ${MAX_LENGTH.name} caracteres en el nombre y ${MAX_LENGTH.message} en el mensaje.`
    );
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
