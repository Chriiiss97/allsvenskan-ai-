import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { strings } from "@/lib/i18n/sv";

interface FavoriteTeam {
  id: number;
  name: string;
  logo_url: string | null;
  nicknames: string[];
}

interface LatestFixture {
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  home: { id: number; name: string } | null;
  away: { id: number; name: string } | null;
}

interface TopScorerRow {
  goals: number;
  player: { full_name: string } | null;
  season: { year: number } | null;
}

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
    .select("email, role, onboarding_completed_at, favorite_team:favorite_team_id(id, name, logo_url, nicknames)")
    .eq("id", user.id)
    .single<{
      email: string;
      role: string;
      onboarding_completed_at: string | null;
      favorite_team: FavoriteTeam | null;
    }>();

  if (!profile?.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const favoriteTeam = profile.favorite_team;

  let latestFixture: LatestFixture | null = null;
  let topScorer: TopScorerRow | null = null;

  if (favoriteTeam) {
    const { data: fixtureData } = await supabase
      .from("fixture")
      .select("kickoff_at, home_score, away_score, home:home_team_id(id, name), away:away_team_id(id, name)")
      .or(`home_team_id.eq.${favoriteTeam.id},away_team_id.eq.${favoriteTeam.id}`)
      .eq("status", "FT")
      .order("kickoff_at", { ascending: false })
      .limit(1)
      .returns<LatestFixture[]>();
    latestFixture = fixtureData?.[0] ?? null;

    // Ingen säsong är markerad is_current i vår data (gratisplanen saknar
    // innevarande säsong, se scripts/import/config.ts) — närmaste proxy för
    // "aktuellt" är därför senaste importerade säsongen. Sortera på
    // säsongsår fallande, sen mål fallande, och ta första raden.
    const { data: scorerData } = await supabase
      .from("statistics")
      .select("goals, player:player_id(full_name), season:season_id(year)")
      .eq("team_id", favoriteTeam.id)
      .order("year", { referencedTable: "season", ascending: false })
      .order("goals", { ascending: false })
      .limit(1)
      .returns<TopScorerRow[]>();
    topScorer = scorerData?.[0] ?? null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{strings.home.welcomeTitle}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{strings.home.welcomeBody}</p>
      </div>

      {favoriteTeam ? (
        <div className="w-full max-w-sm rounded-lg border border-black/10 p-4 text-left dark:border-white/15">
          <div className="flex items-center gap-3">
            {favoriteTeam.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- extern logga, ingen lokal optimering krävs
              <img src={favoriteTeam.logo_url} alt="" className="h-8 w-8" />
            )}
            <div>
              <p className="text-xs text-black/50 dark:text-white/50">{strings.home.yourTeam}</p>
              <p className="font-medium">{favoriteTeam.name}</p>
            </div>
          </div>

          {latestFixture && (
            <p className="mt-3 text-sm">
              <span className="text-black/50 dark:text-white/50">{strings.home.latestResult}: </span>
              {latestFixture.home?.name} {latestFixture.home_score}–{latestFixture.away_score}{" "}
              {latestFixture.away?.name}
            </p>
          )}

          {topScorer?.player && (
            <p className="mt-1 text-sm">
              <span className="text-black/50 dark:text-white/50">
                {strings.home.topScorer} {topScorer.season?.year}:{" "}
              </span>
              {topScorer.player.full_name} ({topScorer.goals} mål)
            </p>
          )}

          <Link
            href="/onboarding?change=1"
            className="mt-3 inline-block text-xs text-black/50 underline underline-offset-2 dark:text-white/50"
          >
            {strings.home.changeTeam}
          </Link>
        </div>
      ) : (
        <Link
          href="/onboarding?change=1"
          className="text-sm underline underline-offset-2 text-black/60 dark:text-white/60"
        >
          {strings.onboarding.title}
        </Link>
      )}

      <div className="rounded-lg border border-black/10 bg-black/[.03] px-4 py-3 text-sm dark:border-white/15 dark:bg-white/[.06]">
        <p>
          {strings.auth.loggedInAs}: <strong>{profile.email ?? user.email}</strong>
        </p>
        {profile.role === "admin" && (
          <p className="mt-1 text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
            admin
          </p>
        )}
      </div>

      <div className="grid w-full max-w-lg gap-3 sm:grid-cols-2">
        <Link
          href="/chat"
          className="flex flex-col items-center gap-1 rounded-2xl bg-foreground px-6 py-5 text-background transition-opacity hover:opacity-90"
        >
          <span className="text-2xl">💬</span>
          <span className="font-semibold">{strings.home.openChat}</span>
          <span className="text-xs opacity-70">{strings.home.openChatDesc}</span>
        </Link>
        <Link
          href="/data/players"
          className="flex flex-col items-center gap-1 rounded-2xl border border-black/10 px-6 py-5 transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          <span className="text-2xl">🤓</span>
          <span className="font-semibold">{strings.home.openData}</span>
          <span className="text-xs text-black/50 dark:text-white/50">{strings.home.openDataDesc}</span>
        </Link>
      </div>

      <p className="max-w-md text-xs text-black/50 dark:text-white/50">
        {strings.home.liveComingSoon}
      </p>

      <LogoutButton />
    </div>
  );
}
