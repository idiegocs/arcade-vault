import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { createClient } from "@/lib/supabase/server";

/** Destino del enlace de recuperación: /auth/callback ya dejó la sesión iniciada. */
export default async function RestablecerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  return <ResetPasswordForm email={user.email ?? ""} />;
}
