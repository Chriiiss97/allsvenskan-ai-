import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { strings } from "@/lib/i18n/sv";

// Auth-koll sker redan i app/(app)/layout.tsx (redirect till /login).
export default async function SettingsPage() {
  // Delad, request-lokal profil — layouten har redan hämtat exakt den här
  // raden, så det här kostar ingenting extra (lib/auth/session.ts).
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const favoriteTeam = profile.favorite_team;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <h1 className="text-xl font-semibold">Inställningar</h1>

      <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-4">
        <p className="text-xs uppercase tracking-wide text-[#898781]">Konto</p>
        <p className="mt-1 text-sm">
          {strings.auth.loggedInAs}: <strong>{profile.email}</strong>
        </p>
        {profile.role === "admin" && (
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
