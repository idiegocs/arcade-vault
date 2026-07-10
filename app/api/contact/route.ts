import { sendContactEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, message } = body ?? {};

  if (!name || !email || !message) {
    return Response.json(
      { ok: false, error: "Faltan campos requeridos: name, email y message." },
      { status: 400 }
    );
  }

  try {
    await sendContactEmail({ name, email, message });
    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error al enviar el correo.";
    return Response.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
