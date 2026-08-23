import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { strings } from "@/lib/i18n/sv";
import { getLiveMatches } from "@/lib/football/tools";
import { getCachedTopScorer } from "@/lib/football/cached-reads";
import { timeAgo } from "@/lib/admin/format";

interface LatestFixture {
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  home: { id: number; name: string } | null;
  away: { id: number; name: string } | null;
}

// Ikon + accentfärg per snabbfråga, positionellt kopplat till
// strings.chat.suggestedQuestions (samma källa som chattens tomt-läge).
// Rent dekorativt — påverkar inte vilken fråga som faktiskt skickas.
const QUESTION_ACCENTS = [
  { icon: "⚽", color: "#3987e5" },
  { icon: "🏛️", color: "#9b8cf5" },
  { icon: "🆚", color: "#d95926" },
  { icon: "🟨", color: "#eab308" },
] as const;

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="relative h-7 w-7 text-[#3987e5]" aria-hidden>
      <path d="M12 2l1.6 5.6L19 9l-5.4 1.4L12 16l-1.6-5.6L5 9l5.4-1.4L12 2z" />
      <path d="M19 15l.8 2.4L22 18l-2.2.6L19 21l-.8-2.4L16 18l2.2-.6L19 15z" opacity="0.7" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <path d="M7 8h11l-3-3M17 16H6l3 3" />
    </svg>
  );
}

function ChevronCircle({ tone }: { tone: "accent" | "neutral" }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5 ${
        tone === "accent"
          ? "bg-[#3987e5]/25 text-white shadow-[0_0_16px_-4px_rgba(57,135,229,0.8)]"
          : "bg-white/10 text-[#c3c2b7]"
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
  // Samma anrop som layouten redan gjort — React cache() gör det till noll
  // extra nätverksarbete istället för ytterligare två round-trips.
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const favoriteTeam = profile.favorite_team;

  /**
   * PRESTANDA (2026-08-23): de tre hämtningarna nedan kördes tidigare i tur
   * och ordning (senaste match → toppmålskytt → live), trots att ingen av
   * dem beror på någon annan — bara på favoritlaget, som redan är känt.
   * Startsidan låg därför på ~1,2s för 49 kB innehåll. Nu i samma våg.
   *
   * Toppmålskytten är dessutom cachad: den är publik ligadata som bara
   * ändras när en match importeras, inte per besökare.
   *
   * Felhanteringen är oförändrad i sak — varje del faller tillbaka på sitt
   * eget tomma värde (`.catch`) istället för att sänka hela startsidan, t.ex.
   * i en miljö där fixture_live_snapshots inte migrerats än.
   */
  const [fixtureResult, topScorer, liveMatches] = await Promise.all([
    favoriteTeam
      ? supabase
          .from("fixture")
          .select("kickoff_at, home_score, away_score, home:home_team_id(id, name), away:away_team_id(id, name)")
          .or(`home_team_id.eq.${favoriteTeam.id},away_team_id.eq.${favoriteTeam.id}`)
          .eq("status", "FT")
          .order("kickoff_at", { ascending: false })
          .limit(1)
          .returns<LatestFixture[]>()
      : Promise.resolve({ data: null }),

    // Återanvänder getTopScorers (samma funktion som chatten och lagprofilen
    // använder) istället för en egen fråga här — en tidigare version
    // försökte sortera på en embeddad relationskolumn (season.year), vilket
    // Postgrest inte pålitligt hedrar, och visade därför fel spelare (den
    // med flest mål EN enskild säsong någonsin, inte lagets faktiska
    // toppmålskytt i senaste säsongen). getTopScorers gör samma "senaste
    // säsong"-filtrering korrekt i JS, se lib/football/tools.ts.
    favoriteTeam
      ? getCachedTopScorer(favoriteTeam.name).catch(() => null)
      : Promise.resolve(null),

    // Hela ligan, inte bara favoritlaget — samma scope som live-pipeline.ts
    // (scripts/import/live-pipeline.ts) faktiskt fyller fixture_live_snapshots
    // för. Live-data cachas ALDRIG: den är hela poängen med att vara färsk.
    getLiveMatches(supabase)
      .then((r) => r.matches)
      .catch(() => [] as Awaited<ReturnType<typeof getLiveMatches>>["matches"]),
  ]);

  const latestFixture: LatestFixture | null = fixtureResult.data?.[0] ?? null;

  return (
    <div className="relative mx-auto max-w-5xl px-6 py-8 sm:px-10 sm:py-12">
      {/* Ambient bakgrundsglöd — rent dekorativt, skapar djup utan att
          ändra det globala mörka temat (se app/(app)/layout.tsx). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center overflow-hidden" aria-hidden>
        <div className="h-[360px] w-[720px] -translate-y-1/3 rounded-full bg-[#3987e5]/[0.08] blur-[110px]" />
      </div>

      <div className="mb-6 flex justify-end">
        <LogoutButton />
      </div>

      {/* 1. HERO / VÄLKOMST */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="relative flex h-9 w-9 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-[#3987e5]/25 blur-md" aria-hidden />
          <SparkleIcon />
        </span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{strings.home.welcomeTitle}</h1>
        <p className="max-w-lg text-sm text-[#a9a8a0] sm:text-base">{strings.home.welcomeBody}</p>
      </div>

      {/* 2. FAVORITKLUBB — det stora hero-kortet */}
      {favoriteTeam ? (
        <div className="relative mt-10 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#181b22] via-[#131519] to-[#0b0c0f] p-7 shadow-[0_30px_70px_-35px_rgba(0,0,0,0.8)] sm:mt-14 sm:p-10">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/[0.05] blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -left-10 bottom-[-60px] h-56 w-56 rounded-full bg-[#3987e5]/10 blur-3xl" aria-hidden />
          {favoriteTeam.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- extern logga, dekorativ vattenstämpel
            <img
              src={favoriteTeam.logo_url}
              alt=""
              className="pointer-events-none absolute -right-6 bottom-[-30px] h-[200px] w-[200px] opacity-[0.15] sm:-right-4 sm:bottom-[-40px] sm:h-[280px] sm:w-[280px]"
            />
          )}

          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3987e5]">
              {strings.home.yourTeam}
            </p>
            <div className="mt-3 flex items-center gap-4">
              {favoriteTeam.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element -- extern logga, ingen lokal optimering krävs
                <img
                  src={favoriteTeam.logo_url}
                  alt=""
                  className="h-14 w-14 drop-shadow-[0_4px_14px_rgba(0,0,0,0.55)] sm:h-16 sm:w-16"
                />
              )}
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{favoriteTeam.name}</h2>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              {latestFixture && (
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm sm:text-base">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#7d7c76]">
                    {strings.home.latestResult}
                  </span>
                  <span className="font-semibold text-white">
                    {latestFixture.home?.name} {latestFixture.home_score}–{latestFixture.away_score}{" "}
                    {latestFixture.away?.name}
                  </span>
                </p>
              )}
              {topScorer && (
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm sm:text-base">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#7d7c76]">
                    {strings.home.topScorer} {topScorer.season}
                  </span>
                  <span className="font-semibold text-white">
                    {topScorer.name} <span className="text-[#3987e5]">({topScorer.goals} mål)</span>
                  </span>
                </p>
              )}
            </div>

            <Link
              href="/onboarding?change=1"
              className="mt-7 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-[#c3c2b7] transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              <SwapIcon /> {strings.home.changeTeam}
            </Link>
          </div>
        </div>
      ) : (
        <Link
          href="/onboarding?change=1"
          className="mt-10 block text-center text-sm text-[#c3c2b7] underline underline-offset-2"
        >
          {strings.onboarding.title}
        </Link>
      )}

      {/* 3. CHATTA / UTFORSKA DATA — de två primära åtgärderna */}
      <div className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2 sm:gap-5">
        <Link
          href="/chat"
          className="group relative overflow-hidden rounded-3xl border border-[#3987e5]/40 bg-gradient-to-br from-[#3987e5]/20 via-[#15171c] to-[#15171c] p-6 shadow-[0_20px_50px_-30px_rgba(57,135,229,0.6)] transition-all hover:border-[#3987e5]/70 hover:shadow-[0_25px_60px_-25px_rgba(57,135,229,0.7)] sm:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3987e5]/25 text-2xl shadow-[0_0_22px_-4px_rgba(57,135,229,0.7)]">
              💬
            </div>
            <ChevronCircle tone="accent" />
          </div>
          <p className="mt-5 text-xl font-bold text-white">{strings.home.openChat}</p>
          <p className="mt-1.5 text-sm text-[#c3c2b7]">{strings.home.openChatDesc}</p>
        </Link>

        <Link
          href="/spelare"
          className="group relative overflow-hidden rounded-3xl border border-white/10 bg-[#15171c] p-6 transition-all hover:border-white/20 hover:bg-white/[0.03] sm:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] text-2xl">
              🤓
            </div>
            <ChevronCircle tone="neutral" />
          </div>
          <p className="mt-5 text-xl font-bold text-white">{strings.home.openData}</p>
          <p className="mt-1.5 text-sm text-[#c3c2b7]">{strings.home.openDataDesc}</p>
        </Link>
      </div>

      {/* 4. POPULÄRA FRÅGOR — samma frågor som chattens tomt-läge, bara en
          genväg in. Ingen förifylld fråga (skulle kräva att ändra
          ChatInterface.tsx:s inre logik, vilket vi medvetet inte gör här). */}
      <div className="mt-10 sm:mt-14">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">
          {strings.home.popularQuestions}
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {strings.chat.suggestedQuestions.map((q, i) => {
            const accent = QUESTION_ACCENTS[i % QUESTION_ACCENTS.length];
            return (
              <Link
                key={q}
                href="/chat"
                className="group rounded-2xl border border-white/8 bg-[#141418] p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]"
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
                  style={{ backgroundColor: `${accent.color}22`, color: accent.color }}
                >
                  {accent.icon}
                </span>
                <p className="mt-2.5 text-xs font-medium leading-snug text-[#c3c2b7] group-hover:text-white">{q}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 5. LIVE — riktig data ur fixture_live_snapshots (scripts/import/live-pipeline.ts,
          pollad av .github/workflows/pipeline-poll.yml), ingen påhittad matchdata.
          Tom lista visas ärligt som "inga matcher pågår", aldrig som platshållare. */}
      {liveMatches.length === 0 ? (
        <div className="mt-8 flex flex-col items-start justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.015] px-5 py-4 sm:mt-10 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0 rounded-full bg-[#5f5e59]" aria-hidden />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#898781]">
                {strings.home.liveBadge}
              </p>
              <p className="text-sm text-[#c3c2b7]">{strings.home.liveNone}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 space-y-3 sm:mt-10">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/50" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#e0645f]">
              {strings.home.liveBadge}
            </p>
          </div>
          {liveMatches.map((m) => (
            <Link
              key={m.fixtureId}
              href={`/matcher/${m.fixtureId}`}
              className="block rounded-2xl border border-[#e0645f]/25 bg-gradient-to-br from-[#e0645f]/[0.06] via-[#15171c] to-[#15171c] px-5 py-4 transition-colors hover:border-[#e0645f]/50 hover:bg-[#e0645f]/[0.1]"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-1 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {m.home?.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- extern logga
                      <img src={m.home.logoUrl} alt="" className="h-6 w-6 shrink-0" />
                    )}
                    <span className="truncate text-sm font-semibold text-white">{m.home?.name ?? "?"}</span>
                  </div>
                  <span className="shrink-0 text-lg font-bold text-white tabular-nums">
                    {m.homeScore ?? "–"}–{m.awayScore ?? "–"}
                  </span>
                  <div className="flex min-w-0 items-center justify-end gap-2">
                    <span className="truncate text-sm font-semibold text-white">{m.away?.name ?? "?"}</span>
                    {m.away?.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- extern logga
                      <img src={m.away.logoUrl} alt="" className="h-6 w-6 shrink-0" />
                    )}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[#e0645f]/40 bg-[#e0645f]/10 px-2.5 py-1 text-[11px] font-semibold text-[#e0645f] tabular-nums">
                  {m.minute != null ? `${m.minute}′` : m.status}
                </span>
              </div>
              {m.lastUpdated && (
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/5 pt-3 text-[11px] text-[#898781]">
                  {m.possession && m.possession.home != null && m.possession.away != null && (
                    <span>
                      {strings.home.livePossession}: <span className="text-[#c3c2b7]">{m.possession.home}%–{m.possession.away}%</span>
                    </span>
                  )}
                  {m.shots && m.shots.home != null && m.shots.away != null && (
                    <span>
                      {strings.home.liveShots}: <span className="text-[#c3c2b7]">{m.shots.home}–{m.shots.away}</span>
                    </span>
                  )}
                  {m.corners && m.corners.home != null && m.corners.away != null && (
                    <span>
                      {strings.home.liveCorners}: <span className="text-[#c3c2b7]">{m.corners.home}–{m.corners.away}</span>
                    </span>
                  )}
                  {/* Ärlig färskhetsindikator — pollningen (GitHub Actions,
                      var 5:e minut, kan droppas av GitHub under belastning)
                      kan halka efter en riktig matchhändelse med tiotals
                      minuter. Bättre att visa exakt hur gammal datan är än
                      att låtsas den är sekundfärsk. */}
                  <span className="ml-auto text-[#5f5e59]">
                    {strings.home.liveUpdated} {timeAgo(m.lastUpdated)}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Kontostatus — låg vikt, ren metadata, längst ner */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5 text-xs sm:text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px]">
            👤
          </span>
          <span className="text-[#c3c2b7]">
            {strings.auth.loggedInAs}: <strong className="font-semibold text-white">{profile.email}</strong>
          </span>
          {profile.role === "admin" && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#898781]">
              admin
            </span>
          )}
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[#0ca30c]/10 px-2.5 py-1 text-[11px] font-medium text-[#4ade80]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" aria-hidden />
          {strings.home.accountActive}
        </span>
      </div>
    </div>
  );
}
