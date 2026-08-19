import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { strings } from "@/lib/i18n/sv";

interface FavoriteTeam {
  id: number;
  name: string;
  logo_url: string | null;
}

// Auth-koll sker redan i app/(app)/layout.tsx (redirect till /login).
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, role, favorite_team:favorite_team_id(id, name, logo_url)")
    .eq("id", user.id)
    .single<{ email: string; role: string; favorite_team: FavoriteTeam | null }>();

  const favoriteTeam = profile?.favorite_team ?? null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <h1 className="text-xl font-semibold">Inställningar</h1>

      <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-4">
        <p className="text-xs uppercase tracking-wide text-[#898781]">Konto</p>
        <p className="mt-1 text-sm">
          {strings.auth.loggedInAs}: <strong>{profile?.email ?? user.email}</strong>
        </p>
        {profile?.role === "admin" && (
          <p className="mt-1 text-xs uppercase tracking-wide text-[#898781]">admin</p>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-4">
        <p className="text-xs uppercase tracking-wide text-[#898781]">{strings.home.yourTeam}</p>
        {favoriteTeam ? (
          <div className="mt-2 flex items-center gap-3">
            {favoriteTeam.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- extern logga, ingen lokal optimering krävs
              <img src={favoriteTeam.logo_url} alt="" className="h-8 w-8" />
            )}
            <p className="font-medium">{favoriteTeam.name}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#c3c2b7]">Ingen klubb vald ännu.</p>
        )}
        <Link
          href="/onboarding?change=1"
          className="mt-3 inline-block text-xs text-[#898781] underline underline-offset-2 hover:text-white"
        >
          {strings.home.changeTeam}
        </Link>
      </div>

      <LogoutButton />
    </div>
  );
}
