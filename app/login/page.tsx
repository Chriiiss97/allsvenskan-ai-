import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginButton } from "@/components/auth/LoginButton";
import { strings } from "@/lib/i18n/sv";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{strings.app.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{strings.app.tagline}</p>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{strings.auth.loginError}</p>
      )}
      <LoginButton />
    </div>
  );
}
