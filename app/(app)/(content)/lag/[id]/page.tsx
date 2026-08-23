import { createClient } from "@/lib/supabase/server";
import { getTeamProfile, getNextFixture, FootballDataError } from "@/lib/football/tools";
import { resolveTeam } from "@/lib/football/resolve-team";
import { getAvailableSeasons, getStandingsTable, getTeamSeasons } from "@/lib/football/catalog";
import { RecordBar } from "@/components/data/RecordBar";
import { FormBadges } from "@/components/data/FormBadges";
import { PlayerCard } from "@/components/data/PlayerCard";
import { BackButton } from "@/components/nav/BackButton";
import { getTeamAccent } from "@/lib/data/team-colors";
import { translateRound } from "@/lib/i18n/sv";
import Link from "next/link";

/**
 * Data-sektionens breddning (2026-08-20): flyttad hit från /data/teams
 * (som nu är en lagöversikt-grid över alla 33 lag, se page.tsx i
 * föräldramappen; Fas 14.1 döpte om hela grenen till /lag). `id` i routen
 * är lagets `external_id` (API-Football:s
 * numeriska id) — matchar direkt mot resolveTeam:s redan existerande
 * numeriska matchningsväg (lib/football/resolve-team.ts), ingen ny
 * uppslagslogik behövdes.
 *
 * Fas 14.3 (plans/humble-giggling-biscuit.md): ombyggd med query-param-
 * flikar (Översikt/Matcher/Trupp/Statistik — samma FotMob-inspirerade
 * struktur som användaren efterfrågade), tabellplacering (NY, från den nu
 * dagligen färska `standings`-tabellen) och en "Nästa match"-widget (NY,
 * getNextFixture, Fas 14.0) på Översikt.
 *
 * Fas 14.4: Lag-DNA flyttat till /scout/lag/[id] (byggd samtidigt, se den
 * sidan) — Statistik-fliken här är nu en Scout-CTA istället för det
 * faktiska innehållet.
 *
 * 2026-08-23: säsongsväljaren visar bara lagets EGNA allsvenska år
 * (getTeamSeasons) istället för hela 2016–2026 — annars fick man klicka sig
 * igenom elva år för att hitta att t.ex. Jönköpings Södra bara spelade
 * 2016–2017. Samma uppslag styr vilken säsong sidan öppnas på.
 */

const TABS = [
  { key: "oversikt", label: "Översikt" },
  { key: "matcher", label: "Matcher" },
  { key: "trupp", label: "Trupp" },
  { key: "statistik", label: "Statistik" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

interface TeamFixtureRow {
  id: number;
  kickoff_at: string;
  status: string;
  round: string | null;
  home_score: number | null;
  away_score: number | null;
  home_team_id: number;
  home: { name: string; logo_url: string | null } | null;
  away: { name: string; logo_url: string | null } | null;
}

export default async function TeamProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { season, tab: tabParam } = await searchParams;
  const supabase = await createClient();
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "oversikt";

  // Säsongerna FÖR DET HÄR LAGET, inte alla 2016–2026 (se getTeamSeasons).
  // Måste hämtas före profilen: lagöversikten länkar hit med aktuell säsong i
  // query-strängen (`/lag/764?season=2026`) även för lag som inte spelar i år,
  // och då ska vi landa på lagets senaste allsvenska säsong istället för en
  // tom 2026-vy.
  const seasons = await getAvailableSeasons(supabase);
  const teamSeasons = await getTeamSeasons(supabase, id, seasons);
  const requestedSeason = season ? Number(season) : null;
  const effectiveSeason =
    requestedSeason && teamSeasons.some((s) => s.year === requestedSeason)
      ? requestedSeason
      : teamSeasons[0]?.year;

  let profile: Awaited<ReturnType<typeof getTeamProfile>> | null = null;
  let error: string | null = null;

  try {
    profile = await getTeamProfile(supabase, { team: id, season: effectiveSeason });
  } catch (err) {
    error = err instanceof FootballDataError ? err.message : "Kunde inte hämta laget.";
  }

  const accent = getTeamAccent(profile?.team.externalId);
  const isCurrentSeason = profile?.season !== null && profile?.season === seasons[0]?.year;

  // Tabellplacering — matchad mot standings via external_id (inte lagets
  // interna id, som getTeamProfile aldrig exponerar) — se filhuvudet.
  const standingsRow =
    tab === "oversikt" && profile?.season
      ? (await getStandingsTable(supabase, { season: profile.season })).find(
          (r) => r.team.external_id === profile!.team.externalId
        ) ?? null
      : null;

  // Nästa match — bara meningsfullt när man tittar på AKTUELL säsong, aldrig
  // en påhittad "nästa match" när man bläddrar i historiken.
  const next = tab === "oversikt" && isCurrentSeason ? await getNextFixture(supabase, { team: id }) : null;

  let teamFixtures: TeamFixtureRow[] = [];
  let teamInternalId: number | null = null;
  if (tab === "matcher" && profile?.season) {
    const seasonRow = seasons.find((s) => s.year === profile!.season);
    const resolvedTeam = await resolveTeam(supabase, id);
    teamInternalId = resolvedTeam?.id ?? null;
    if (seasonRow && teamInternalId) {
      const { data } = await supabase
        .from("fixture")
        .select(
          "id, kickoff_at, status, round, home_score, away_score, home_team_id, home:home_team_id(name, logo_url), away:away_team_id(name, logo_url)"
        )
        .eq("season_id", seasonRow.id)
        .or(`home_team_id.eq.${teamInternalId},away_team_id.eq.${teamInternalId}`)
        .order("kickoff_at", { ascending: true })
        .returns<TeamFixtureRow[]>();
      teamFixtures = data ?? [];
    }
  }

  return (
    <div>
      <BackButton href="/lag" label="Alla lag" />

      {error && <p className="mt-6 text-sm text-[#e66767]">{error}</p>}

      {profile && (
        <>
          {/* Hero: logga + namn, stort och luftigt */}
          <div className="mt-4 flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:text-left">
            {profile.team.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- extern logga
              <img src={profile.team.logoUrl} alt="" className="h-20 w-20 sm:h-24 sm:w-24" />
            )}
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{profile.team.name}</h2>
              {profile.facts?.nicknames && profile.facts.nicknames.length > 0 && (
                <p className="mt-1 text-sm text-[#898781]">{profile.facts.nicknames.join(" · ")}</p>
              )}
            </div>
          </div>

          {/* Säsongsväljare — bara lagets egna allsvenska år (getTeamSeasons) */}
          <div className="mt-5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {teamSeasons.map((s) => (
              <Link
                key={s.year}
                href={`/lag/${id}?season=${s.year}${tab !== "oversikt" ? `&tab=${tab}` : ""}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  profile.season === s.year ? "text-white" : "text-[#898781] hover:text-white"
                }`}
                style={profile.season === s.year ? { backgroundColor: `${accent}26` } : undefined}
              >
                {s.year}
              </Link>
            ))}
          </div>

          {/* Flikar */}
          <div className="mt-5 inline-flex gap-1 rounded-full border border-white/10 bg-[#141418] p-1">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/lag/${id}?season=${profile!.season ?? ""}${t.key !== "oversikt" ? `&tab=${t.key}` : ""}`}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.key ? "text-white" : "text-[#c3c2b7] hover:text-white"
                }`}
                style={tab === t.key ? { backgroundColor: `${accent}26` } : undefined}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {tab === "oversikt" && (
            <>
              {/* Tabellplacering + Nästa match — sida vid sida, den nya FotMob-lika "var står vi + vad händer härnäst"-överblicken */}
              {(standingsRow || next?.fixture) && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {standingsRow && (
                    <Link
                      href={`/tabell?season=${profile.season}`}
                      className="rounded-xl border border-white/10 bg-[#141418] p-4 transition-colors hover:border-white/25"
                    >
                      <p className="text-xs uppercase tracking-wide text-[#898781]">Tabellplacering</p>
                      <p className="mt-1 text-2xl font-bold text-white">
                        #{standingsRow.rank} <span className="text-sm font-normal text-[#898781]">av tabellen</span>
                      </p>
                      <p className="mt-0.5 text-xs text-[#898781]">
                        {standingsRow.points} poäng · {standingsRow.played} matcher
                      </p>
                    </Link>
                  )}
                  {next?.fixture && (
                    <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
                      <p className="text-xs uppercase tracking-wide text-[#898781]">Nästa match</p>
                      <p className="mt-1 text-base font-semibold text-white">
                        {next.fixture.home} – {next.fixture.away}
                      </p>
                      <p className="mt-0.5 text-xs text-[#898781]">
                        {new Date(next.fixture.date).toLocaleDateString("sv-SE")}
                        {" · "}
                        {new Date(next.fixture.date).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                        {next.fixture.round ? ` · ${translateRound(next.fixture.round)}` : ""}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Rekord — stora siffror, ingen bård */}
              <div className="mt-8 flex flex-wrap justify-center gap-x-10 gap-y-6 sm:justify-start">
                {[
                  ["Matcher", profile.record.played],
                  ["V-O-F", `${profile.record.wins}-${profile.record.draws}-${profile.record.losses}`],
                  ["Mål för/mot", `${profile.record.goalsFor}-${profile.record.goalsAgainst}`],
                  [
                    "Målskillnad",
                    profile.record.goalsFor - profile.record.goalsAgainst >= 0
                      ? `+${profile.record.goalsFor - profile.record.goalsAgainst}`
                      : `${profile.record.goalsFor - profile.record.goalsAgainst}`,
                  ],
                  ["Poäng", profile.record.points],
                ].map(([label, value]) => (
                  <div key={label as string} className="text-center sm:text-left">
                    <p className="text-3xl font-bold text-white sm:text-4xl">{value}</p>
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-[#898781]">{label}</p>
                  </div>
                ))}
              </div>

              <div className="mx-auto mt-6 max-w-xs sm:mx-0">
                <RecordBar wins={profile.record.wins} draws={profile.record.draws} losses={profile.record.losses} />
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 sm:justify-start">
                <p className="text-xs text-[#898781]">Senaste 5:</p>
                <FormBadges form={profile.record.form} />
              </div>

              {/* Bästa målskytt / assist */}
              {(profile.topScorer || profile.topAssist) && (
                <div className="mt-10 grid gap-3 sm:grid-cols-2">
                  {profile.topScorer && (
                    <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
                      <p className="text-xs uppercase tracking-wide text-[#898781]">Bästa målskytt</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {profile.topScorer.name} <span style={{ color: accent }}>({profile.topScorer.goals} mål)</span>
                      </p>
                    </div>
                  )}
                  {profile.topAssist && (
                    <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
                      <p className="text-xs uppercase tracking-wide text-[#898781]">Bästa passningsläggare</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {profile.topAssist.name}{" "}
                        <span style={{ color: accent }}>({profile.topAssist.assists} assist)</span>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Historik */}
              {profile.facts && (
                <div className="mt-10 mb-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Historik</p>
                  {profile.facts.short_history && (
                    <p className="text-sm leading-relaxed text-[#c3c2b7]">{profile.facts.short_history}</p>
                  )}
                  {profile.facts.team_trophy && profile.facts.team_trophy.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {profile.facts.team_trophy.map((t, i) => (
                        <span key={i} className="rounded-full border border-white/10 bg-[#141418] px-2.5 py-1 text-xs text-[#c3c2b7]">
                          🏆 {t.competition} {t.year}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "matcher" && (
            <div className="mt-6">
              {teamFixtures.length === 0 ? (
                <p className="text-sm text-[#898781]">Inga matcher hittades för säsongen.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {/* Samma hemma–borta-format som /matcher (aldrig "vs"/"@"
                      — en amerikansk sportkonvention som inte hör hemma i
                      svensk fotbollskontext, påpekat av användaren). Det
                      egna laget är alltid fetstilt så man ändå snabbt ser
                      vilken sida som är "vi" utan en extra symbol. */}
                  {teamFixtures.map((f) => {
                    const isHome = f.home_team_id === teamInternalId;
                    return (
                      <Link
                        key={f.id}
                        href={`/matcher/${f.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#1a1a19] px-4 py-2.5 text-sm transition-colors hover:border-white/25 hover:bg-white/[.03]"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {f.home?.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- extern logga
                            <img src={f.home.logo_url} alt="" className="h-5 w-5 shrink-0" />
                          ) : (
                            <div className="h-5 w-5 shrink-0 rounded-full bg-white/5" aria-hidden />
                          )}
                          <span className={`truncate ${isHome ? "font-semibold text-white" : ""}`}>{f.home?.name}</span>
                          {f.status === "FT" && (
                            <span className="shrink-0 tabular-nums text-white">
                              {f.home_score ?? "–"}–{f.away_score ?? "–"}
                            </span>
                          )}
                          <span className={`truncate ${!isHome ? "font-semibold text-white" : ""}`}>{f.away?.name}</span>
                          {f.away?.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- extern logga
                            <img src={f.away.logo_url} alt="" className="h-5 w-5 shrink-0" />
                          ) : (
                            <div className="h-5 w-5 shrink-0 rounded-full bg-white/5" aria-hidden />
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-[#898781]">
                          {f.status !== "FT" && (
                            <span className="rounded-full bg-[#3987e5]/20 px-2 py-0.5 text-[#3987e5]">Kommande</span>
                          )}
                          <span className="whitespace-nowrap">{new Date(f.kickoff_at).toLocaleDateString("sv-SE")}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "trupp" && (
            <div className="mt-6">
              {profile.squad.length === 0 ? (
                <p className="text-sm text-[#898781]">Ingen trupp hittades för säsongen.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {profile.squad.map((p) => (
                    <PlayerCard
                      key={p.id}
                      player={{
                        id: p.id,
                        full_name: p.name,
                        position: p.position,
                        photoUrl: p.photoUrl,
                        teamName: profile!.team.name,
                        teamExternalId: profile!.team.externalId,
                        stat: null,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "statistik" && (
            <div className="mt-6">
              <Link
                href={`/scout/lag/${id}${profile.season ? `?season=${profile.season}` : ""}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#a78bfa]/30 bg-[#a78bfa]/10 p-4 text-sm transition-colors hover:bg-[#a78bfa]/15"
              >
                <span>
                  <span className="font-semibold text-[#a78bfa]">🧬 Se Lag-DNA</span>
                  <span className="ml-1 text-[#c3c2b7]">
                    — bollinnehav, xG, passningssäkerhet m.m. jämfört med ligasnittet, i Scout.
                  </span>
                </span>
                <span className="text-[#a78bfa]">→</span>
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
