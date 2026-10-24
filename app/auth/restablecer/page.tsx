import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { isRecoverySession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino del enlace de recuperación: /auth/callback ya dejó la sesión
 * iniciada. Solo se entra con esa sesión (`amr` = recovery), no con una
 * sesión cualquiera.
 */
export default async function RestablecerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isRecoverySession())) {
    redirect("/auth");
  }

  return <ResetPasswordForm email={user.email ?? ""} />;
}
