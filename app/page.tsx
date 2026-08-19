import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { strings } from "@/lib/i18n/sv";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{strings.home.welcomeTitle}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{strings.home.welcomeBody}</p>
      </div>

      <div className="rounded-lg border border-black/10 bg-black/[.03] px-4 py-3 text-sm dark:border-white/15 dark:bg-white/[.06]">
        <p>
          {strings.auth.loggedInAs}: <strong>{profile?.email ?? user.email}</strong>
        </p>
        {profile?.role === "admin" && (
          <p className="mt-1 text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
            admin
          </p>
        )}
      </div>

      <p className="max-w-md text-xs text-black/50 dark:text-white/50">
        {strings.home.liveComingSoon}
      </p>

      <p className="text-xs text-black/40 dark:text-white/40">{strings.home.buildingNotice}</p>

      <LogoutButton />
    </div>
  );
}
