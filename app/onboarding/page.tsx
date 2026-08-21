import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/i18n/sv";
import { setFavoriteTeam } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ change?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { change } = await searchParams;

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .single();
  // Vid ?change=1 (länken "Byt klubb" på startsidan) visas väljaren igen även
  // om onboarding redan är klar.
  if (profile?.onboarding_completed_at && !change) redirect("/");

  // Data-sektionens breddning (2026-08-20): alla 33 lag går nu att välja
  // som favoritlag, inte bara IFK Göteborg/AIK — konsekvent med resten av
  // breddningen (användarens beslut).
  const { data: teams } = await supabase
    .from("team")
    .select("id, name, logo_url, nicknames")
    .order("name");

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{strings.onboarding.title}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{strings.onboarding.subtitle}</p>
      </div>

      <div className="grid w-full grid-cols-2 gap-2.5 sm:grid-cols-3">
        {(teams ?? []).map((team) => (
          <form key={team.id} action={setFavoriteTeam}>
            <input type="hidden" name="teamId" value={team.id} />
            <button
              type="submit"
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-black/10 p-3 text-center transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              {team.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element -- extern logga från API-Football, ingen lokal optimering behövs för en engångs-onboardingvy
                <img src={team.logo_url} alt="" className="h-8 w-8" />
              )}
              <span className="block text-xs font-medium leading-tight">{team.name}</span>
            </button>
          </form>
        ))}
      </div>

      <form action={setFavoriteTeam}>
        <input type="hidden" name="teamId" value="" />
        <button
          type="submit"
          className="text-xs text-black/50 underline underline-offset-2 dark:text-white/50"
        >
          {strings.onboarding.skip}
        </button>
      </form>
    </div>
  );
}
