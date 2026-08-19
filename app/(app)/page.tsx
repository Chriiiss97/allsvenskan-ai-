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

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-[#3987e5]" aria-hidden>
      <path d="M12 2l1.6 5.6L19 9l-5.4 1.4L12 16l-1.6-5.6L5 9l5.4-1.4L12 2z" />
      <path d="M19 15l.8 2.4L22 18l-2.2.6L19 21l-.8-2.4L16 18l2.2-.6L19 15z" opacity="0.7" />
    </svg>
  );
}

function ChevronCircle({ tone }: { tone: "accent" | "neutral" }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        tone === "accent" ? "bg-white/20 text-white" : "bg-white/10 text-[#c3c2b7]"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M9 5l7 7-7 7" />
      </svg>
    </span>
  );
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
    <div className="relative mx-auto max-w-3xl px-6 py-10 sm:py-12">
      <div className="absolute right-6 top-10 hidden sm:block">
        <LogoutButton />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <SparkleIcon />
        <h1 className="text-2xl font-semibold sm:text-3xl">{strings.home.welcomeTitle}</h1>
        <p className="max-w-md text-sm text-[#c3c2b7]">{strings.home.welcomeBody}</p>
      </div>

      {favoriteTeam ? (
        <div className="relative mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a19]">
          {favoriteTeam.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- extern logga, dekorativ vattenstämpel
            <img
              src={favoriteTeam.logo_url}
              alt=""
              className="pointer-events-none absolute -right-6 top-1/2 h-40 w-40 -translate-y-1/2 opacity-[0.08] sm:h-48 sm:w-48"
            />
          )}
          <div className="relative p-5 text-left sm:p-6">
            <div className="flex items-center gap-3">
              {favoriteTeam.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element -- extern logga, ingen lokal optimering krävs
                <img src={favoriteTeam.logo_url} alt="" className="h-10 w-10" />
              )}
              <div>
                <p className="text-xs uppercase tracking-wide text-[#898781]">{strings.home.yourTeam}</p>
                <p className="text-lg font-semibold">{favoriteTeam.name}</p>
              </div>
            </div>

            <div className="mt-4 space-y-1 text-sm">
              {latestFixture && (
                <p>
                  <span className="text-[#898781]">{strings.home.latestResult}: </span>
                  {latestFixture.home?.name} {latestFixture.home_score}–{latestFixture.away_score}{" "}
                  {latestFixture.away?.name}
                </p>
              )}
              {topScorer?.player && (
                <p>
                  <span className="text-[#898781]">
                    {strings.home.topScorer} {topScorer.season?.year}:{" "}
                  </span>
                  {topScorer.player.full_name} ({topScorer.goals} mål)
                </p>
              )}
            </div>

            <Link
              href="/onboarding?change=1"
              className="mt-4 inline-flex items-center gap-1 text-xs text-[#898781] underline underline-offset-2 hover:text-white"
            >
              ⇄ {strings.home.changeTeam}
            </Link>
          </div>
        </div>
      ) : (
        <Link
          href="/onboarding?change=1"
          className="mt-8 block text-center text-sm text-[#c3c2b7] underline underline-offset-2"
        >
          {strings.onboarding.title}
        </Link>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#1a1a19] px-4 py-3 text-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs">
            👤
          </span>
          <span>
            {strings.auth.loggedInAs}:{" "}
            <strong className="font-semibold text-[#3987e5]">{profile.email ?? user.email}</strong>
          </span>
          {profile.role === "admin" && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#898781]">
              admin
            </span>
          )}
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[#0ca30c]/15 px-2.5 py-1 text-xs font-medium text-[#4ade80]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" aria-hidden />
          {strings.home.accountActive}
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          href="/chat"
          className="group flex items-center justify-between rounded-2xl border border-[#3987e5]/40 bg-[#3987e5]/15 px-5 py-4 transition-colors hover:bg-[#3987e5]/25"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden>
              💬
            </span>
            <div className="text-left">
              <p className="font-semibold text-white">{strings.home.openChat}</p>
              <p className="text-xs text-[#c3c2b7]">{strings.home.openChatDesc}</p>
            </div>
          </div>
          <ChevronCircle tone="accent" />
        </Link>
        <Link
          href="/data/players"
          className="group flex items-center justify-between rounded-2xl border border-white/10 px-5 py-4 transition-colors hover:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden>
              🤓
            </span>
            <div className="text-left">
              <p className="font-semibold text-white">{strings.home.openData}</p>
              <p className="text-xs text-[#c3c2b7]">{strings.home.openDataDesc}</p>
            </div>
          </div>
          <ChevronCircle tone="neutral" />
        </Link>
      </div>

      {/* Populära frågor — samma frågor som chattens tomt-läge, bara en
          genväg in. Ingen förifylld fråga (skulle kräva att ändra
          ChatInterface.tsx:s inre logik, vilket vi medvetet inte gör här). */}
      <div className="mt-8">
        <p className="mb-2 text-xs uppercase tracking-wide text-[#898781]">{strings.home.popularQuestions}</p>
        <div className="flex flex-wrap gap-2">
          {strings.chat.suggestedQuestions.map((q) => (
            <Link
              key={q}
              href="/chat"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#1a1a19] px-3 py-2 text-xs text-[#c3c2b7] transition-colors hover:bg-white/5 hover:text-white"
            >
              <span aria-hidden>⚽</span> {q}
            </Link>
          ))}
        </div>
      </div>

      <p className="mt-8 max-w-md text-center text-xs text-[#898781] sm:mx-auto">
        {strings.home.liveComingSoon}
      </p>

      <div className="mt-6 flex justify-center sm:hidden">
        <LogoutButton />
      </div>
    </div>
  );
}
