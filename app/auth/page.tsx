import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { LINK_EXPIRED, safeNext } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Con sesión iniciada no hay nada que hacer acá.
  if (user) {
    redirect("/");
  }

  const { next, error } = await searchParams;

  return (
    <AuthForm
      next={safeNext(typeof next === "string" ? next : null)}
      linkError={error === "enlace" ? LINK_EXPIRED : null}
    />
  );
}
