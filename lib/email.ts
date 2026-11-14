import { Resend } from "resend";
import { contactEmailEnv } from "@/lib/env";

type ContactInput = {
  name: string;
  email: string;
  message: string;
};

export async function sendContactEmail({ name, email, message }: ContactInput): Promise<void> {
  const { apiKey, from, to } = contactEmailEnv();
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: `Arcade Vault <${from}>`,
    to,
    replyTo: email,
    subject: `Nuevo mensaje de contacto de ${name}`,
    text: `Nombre: ${name}\nCorreo: ${email}\n\nMensaje:\n${message}`,
  });

  if (error) {
    throw new Error(error.message);
  }
}
