import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedSeasons, getCachedTeams, getCachedSeasonFixtures } from "@/lib/football/cached-reads";
import { translateRound } from "@/lib/i18n/sv";
import { getLiveFeedForToday } from "@/lib/football/live-feed";
import { matchPhase, statusShortLabel } from "@/lib/football/live-status";
import { TodayMatches } from "@/components/live/TodayMatches";
import { StatusPill } from "@/components/live/LiveIndicator";

interface FixtureRow {
  id: number;
  kickoff_at: string;
  status: string;
  round: string | null;
  home_score: number | null;
  away_score: number | null;
  events_synced_at: string | null;
  home_team_id: number;
  away_team_id: number;
  home: { name: string; logo_url: string | null } | null;
  away: { name: string; logo_url: string | null } | null;
}

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "Alla" },
  { value: "upcoming", label: "Kommande" },
  { value: "finished", label: "Senaste" },
];

/** Antal omgångar som renderas innan "Visa fler". En omgång är 8 matcher. */
const ROUNDS_PAGE_SIZE = 8;

/**
 * Data-sektionens breddning (2026-08-20): Säsong → omgång → matcher för
 * ALLA 33 lag (tidigare hårdkodat till bara IFK Göteborg/AIK). En säsongs
 * hela matchlista är ~200–250 rader — bekräftat säkert under Supabases
 * 1000-radstak, ingen paginering behövs här (till skillnad från
 * spelarlistan, se lib/football/player-catalog.ts).
 */
export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; home?: string; away?: string; team?: string; result?: string; status?: string; antal?: string }>;
}) {
  const { season, home, away, team, result, status, antal } = await searchParams;
  const supabase = await createClient();

  // PRESTANDA (2026-08-23): de tre första hämtningarna berodde inte på
  // varandra men kördes ändå i tur och ordning (live-flöde → säsonger →
  // lag). Nu i samma våg; säsongs- och lagkatalogen är dessutom cachade
  // (lib/football/cached-reads.ts) eftersom de bara ändras vid import.
  //
  // Fas 20: dagens matcher som en egen, live-uppdaterande sektion överst.
  // Ett fel här (t.ex. en miljö där fixture_live_snapshots inte migrerats)
  // ska aldrig sänka hela matcharkivet — sektionen utelämnas bara.
  const [todayFeed, seasons, teams] = await Promise.all([
    getLiveFeedForToday(supabase).catch(() => null),
    getCachedSeasons(),
    getCachedTeams(),
  ]);

  const seasonYear = season ? Number(season) : seasons[0]?.year;
  const teamByExternalId = new Map(teams.filter((t) => t.external_id !== null).map((t) => [t.external_id as number, t]));

  const seasonRow = seasonYear ? seasons.find((s) => s.year === seasonYear) : undefined;

  let fixtures: FixtureRow[] = [];
  if (seasonRow) {
    const homeTeamId = home ? teamByExternalId.get(Number(home))?.id : undefined;
    const awayTeamId = away ? teamByExternalId.get(Number(away))?.id : undefined;
    const teamId = team ? teamByExternalId.get(Number(team))?.id : undefined;

    // PRESTANDA (2026-08-23): matchlistan är publik och ändras bara när en
    // match importeras/avslutas — cachad per filterkombination, se
    // lib/football/cached-reads.ts. Filtreringen och sorteringen är
    // ordagrant densamma som förut, bara flyttad dit.
    fixtures = await getCachedSeasonFixtures({
      seasonId: seasonRow.id,
      homeTeamId,
      awayTeamId,
      teamId,
      status,
    });

    // Resultat-filter (V/O/F) är bara meningsfullt relativt ETT valt lag —
    // beräknas i JS på den redan avgränsade (~200-250 rader) säsongsmängden.
    if (result && teamId) {
      fixtures = fixtures.filter((f) => {
        if (f.status !== "FT" || f.home_score === null || f.away_score === null) return false;
        const isHome = f.home_team_id === teamId;
        const teamScore = isHome ? f.home_score : f.away_score;
        const otherScore = isHome ? f.away_score : f.home_score;
        if (result === "W") return teamScore > otherScore;
        if (result === "D") return teamScore === otherScore;
        if (result === "L") return teamScore < otherScore;
        return true;
      });
    }
  }

  // Gruppera per omgång — frågan är redan sorterad på kickoff_at, så
  // rondordningen blir rätt utan att behöva parsa "Regular Season - N".
  const rounds = new Map<string, FixtureRow[]>();
  for (const f of fixtures) {
    const key = f.round ?? "Okänd omgång";
    const list = rounds.get(key) ?? [];
    list.push(f);
    rounds.set(key, list);
  }

  /**
   * PRESTANDA (2026-08-23, samma åtgärd som på Scouts "Efter Allsvenskan")
   * — sidan renderade hela säsongen på en gång: 244 matcher i ~30 omgångar,
   * två klubblogotyper per rad (488 <img>), 648 kB svar. Uppmätt var den
   * appens långsammaste sida efter cachningen (1,3–1,5s i dev, 341ms i ett
   * produktionsbygge) och kostnaden låg nästan uteslutande i renderingen,
   * inte i databasen.
   *
   * Fönstret räknas i OMGÅNGAR, inte matcher — en halv omgång vore
   * meningslös att visa. Ordningen är ORÖRD: exakt samma sortering som
   * förut (kronologisk, eller nyast först på "Senaste"), så det som ligger
   * överst är detsamma som tidigare — det är bara mängden nedanför som
   * växer på begäran istället för direkt.
   */
  const roundEntries = [...rounds.entries()];
  const requestedRounds = Number(antal);
  const roundLimit =
    Number.isFinite(requestedRounds) && requestedRounds > 0
      ? Math.min(requestedRounds, roundEntries.length)
      : ROUNDS_PAGE_SIZE;
  const visibleRounds = roundEntries.slice(0, roundLimit);
  const remainingRounds = roundEntries.length - visibleRounds.length;
  const visibleFixtureCount = visibleRounds.reduce((sum, [, list]) => sum + list.length, 0);

  /** Behåller alla aktiva filter och ändrar bara hur många omgångar som visas. */
  const roundsHref = (nextLimit: number) =>
    `/matcher?${new URLSearchParams({
      season: String(seasonYear ?? ""),
      ...(home ? { home } : {}),
      ...(away ? { away } : {}),
      ...(team ? { team } : {}),
      ...(result ? { result } : {}),
      ...(status ? { status } : {}),
      antal: String(nextLimit),
    }).toString()}`;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Matcher</h1>
      <p className="mb-8 mt-1 text-sm text-[#898781]">{fixtures.length} matcher{seasonYear ? ` — säsongen ${seasonYear}` : ""}.</p>

      {todayFeed && todayFeed.matches.length > 0 && <TodayMatches initial={todayFeed} />}

      {/* Säsongsväljare */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {seasons.map((s) => (
          <Link
            key={s.year}
            href={`/matcher?season=${s.year}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              seasonYear === s.year ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
            }`}
          >
            {s.year}
          </Link>
        ))}
      </div>

      {/* Kommande/Senaste — den primära, mest FotMob-lika växeln, ovanför
          detaljfiltren istället för nedgrävd i ett formulär. */}
      <div className="mt-4 flex gap-1 rounded-lg border border-white/10 bg-[#1a1a19] p-1 text-sm">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/matcher?${new URLSearchParams({
              season: String(seasonYear ?? ""),
              ...(home ? { home } : {}),
              ...(away ? { away } : {}),
              ...(team ? { team } : {}),
              ...(result ? { result } : {}),
              ...(tab.value ? { status: tab.value } : {}),
            }).toString()}`}
            className={`flex-1 rounded-md px-3 py-1.5 text-center font-medium transition-colors ${
              (status ?? "") === tab.value ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Detaljfilter — server-formulär, ingen klient-JS krävs */}
      <form method="get" className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-[#1a1a19] p-3">
        <input type="hidden" name="season" value={seasonYear ?? ""} />
        <input type="hidden" name="status" value={status ?? ""} />
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Lag
          <select name="team" defaultValue={team ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            {teams.map((t) => (
              <option key={t.id} value={t.external_id ?? ""}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Hemmalag
          <select name="home" defaultValue={home ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            {teams.map((t) => (
              <option key={t.id} value={t.external_id ?? ""}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Bortalag
          <select name="away" defaultValue={away ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            {teams.map((t) => (
              <option key={t.id} value={t.external_id ?? ""}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Resultat {team ? "" : "(kräver valt lag)"}
          <select name="result" defaultValue={result ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            <option value="W">Vinst</option>
            <option value="D">Oavgjort</option>
            <option value="L">Förlust</option>
          </select>
        </label>
        <button type="submit" className="rounded-md bg-[#3987e5] px-3 py-1.5 text-sm font-medium text-white">
          Filtrera
        </button>
        {(home || away || team || result) && (
          <Link
            href={`/matcher?${new URLSearchParams({ season: String(seasonYear ?? ""), ...(status ? { status } : {}) }).toString()}`}
            className="text-xs text-[#898781] hover:text-white"
          >
            Rensa filter
          </Link>
        )}
      </form>

      {/* Matcher grupperade per omgång */}
      <div className="mt-6 flex flex-col gap-6">
        {visibleRounds.map(([roundName, roundFixtures]) => (
          <div key={roundName}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">{translateRound(roundName) ?? roundName}</p>
            <ul className="space-y-1.5">
              {roundFixtures.map((f) => (
                <li key={f.id}>
                  <Link
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
                      <span className="truncate">{f.home?.name}</span>
                      <span className="shrink-0 tabular-nums text-white">
                        {f.home_score ?? "–"}–{f.away_score ?? "–"}
                      </span>
                      <span className="truncate">{f.away?.name}</span>
                      {f.away?.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- extern logga
                        <img src={f.away.logo_url} alt="" className="h-5 w-5 shrink-0" />
                      ) : (
                        <div className="h-5 w-5 shrink-0 rounded-full bg-white/5" aria-hidden />
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-[#898781]">
                      <span className="whitespace-nowrap">
                        {new Date(f.kickoff_at).toLocaleDateString("sv-SE")}
                        {" · "}
                        {new Date(f.kickoff_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {/* Fas 20: badgen utgick tidigare från "allt som inte
                          är FT är kommande", vilket gjorde att en PÅGÅENDE
                          match presenterades som "Kommande". Nu styr
                          matchens faktiska fas (lib/football/live-status.ts).
                          Den här listan är arkivvyn och pollar inte — det
                          gör "Idag"-sektionen överst — men den ska ändå
                          aldrig påstå fel sak om en match som rullar. */}
                      {(() => {
                        const phase = matchPhase(f.status);
                        if (phase === "live" || phase === "paused") {
                          return <StatusPill phase={phase} label={statusShortLabel(f.status)} />;
                        }
                        if (phase === "upcoming") {
                          return <span className="rounded-full bg-[#3987e5]/20 px-2 py-0.5 text-[#3987e5]">Kommande</span>;
                        }
                        if (phase === "cancelled") {
                          return <span className="rounded-full bg-[#d9a526]/15 px-2 py-0.5 text-[#d9a526]">{statusShortLabel(f.status)}</span>;
                        }
                        return f.events_synced_at ? (
                          <span className="rounded-full bg-[#0ca30c]/20 px-2 py-0.5 text-[#0ca30c]">Rapport tillgänglig</span>
                        ) : (
                          <span className="rounded-full bg-white/5 px-2 py-0.5">Bara resultat</span>
                        );
                      })()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {fixtures.length === 0 && <p className="text-sm text-[#898781]">Inga matcher matchar filtret.</p>}
      </div>

      {remainingRounds > 0 && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-xs text-[#5f5e59]">
            Visar {visibleRounds.length} av {roundEntries.length} omgångar · {visibleFixtureCount} av {fixtures.length} matcher
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href={roundsHref(roundLimit + ROUNDS_PAGE_SIZE)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-[#3987e5]/40 hover:bg-[#3987e5]/10"
            >
              Visa {Math.min(ROUNDS_PAGE_SIZE, remainingRounds)} omgångar till
            </Link>
            {remainingRounds > ROUNDS_PAGE_SIZE && (
              <Link
                href={roundsHref(roundEntries.length)}
                className="rounded-full px-4 py-2 text-xs font-semibold text-[#898781] transition-colors hover:text-white"
              >
                Visa hela säsongen
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
