import { Resend } from "resend";

type ContactInput = {
  name: string;
  email: string;
  message: string;
};

export async function sendContactEmail({ name, email, message }: ContactInput): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: "Arcade Vault <onboarding@resend.dev>",
    to: process.env.CONTACT_EMAIL as string,
    replyTo: email,
    subject: `Nuevo mensaje de contacto de ${name}`,
    text: `Nombre: ${name}\nCorreo: ${email}\n\nMensaje:\n${message}`,
  });

  if (error) {
    throw new Error(error.message);
  }
}
