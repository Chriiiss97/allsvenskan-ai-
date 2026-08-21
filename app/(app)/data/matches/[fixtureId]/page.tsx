import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMatchReport, FootballDataError } from "@/lib/football/tools";
import { getMatchTeamStatsComparison } from "@/lib/football/team-rollup";
import { MatchTimeline } from "@/components/data/MatchTimeline";
import { BackButton } from "@/components/nav/BackButton";

// Steg 9: "Match DNA" — hemma vs bortalagets lagstatistik (possession/skott/
// hörnor/xG), byggd på steg 8:s getMatchTeamStatsComparison. Bara rader där
// minst en sida faktiskt har ett värde visas — aldrig en rad med två "–".
const MATCH_STAT_ROWS: { label: string; key: "possessionPct" | "shotsTotal" | "shotsOnTarget" | "corners" | "fouls" | "expectedGoals"; suffix?: string }[] = [
  { label: "Bollinnehav", key: "possessionPct", suffix: "%" },
  { label: "Skott", key: "shotsTotal" },
  { label: "Skott på mål", key: "shotsOnTarget" },
  { label: "Hörnor", key: "corners" },
  { label: "Fouls", key: "fouls" },
  { label: "Expected goals (xG)", key: "expectedGoals" },
];

interface LineupPlayerRow {
  is_starter: boolean;
  shirt_number: number | null;
  position: string | null;
  player: { id: number; full_name: string } | null;
}

interface LineupRow {
  team_id: number;
  formation: string | null;
  fixture_lineup_player: LineupPlayerRow[];
}

export default async function MatchReportPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = await params;
  const supabase = await createClient();

  let report;
  try {
    report = await getMatchReport(supabase, Number(fixtureId));
  } catch (err) {
    if (err instanceof FootballDataError) notFound();
    throw err;
  }

  const matchStats = await getMatchTeamStatsComparison(supabase, Number(fixtureId));
  const statRows = MATCH_STAT_ROWS.filter((row) => matchStats.home?.[row.key] != null || matchStats.away?.[row.key] != null);

  // Steg 4 (data-sektionens breddning): startelvor/formation — nedan sedan
  // steg 4 av Ultra-plan-projektet, men aldrig visade i UI:t förrän nu.
  const { data: lineupRows } = await supabase
    .from("fixture_lineup")
    .select("team_id, formation, fixture_lineup_player(is_starter, shirt_number, position, player:player_id(id, full_name))")
    .eq("fixture_id", Number(fixtureId))
    .returns<LineupRow[]>();
  const homeLineup = lineupRows?.find((l) => l.team_id === report.home?.id) ?? null;
  const awayLineup = lineupRows?.find((l) => l.team_id === report.away?.id) ?? null;

  return (
    <div>
      <BackButton href="/data/matches" label="Alla matcher" />

      <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-6 text-center">
        <p className="text-xs text-[#898781]">
          {report.season} · {report.round} · {new Date(report.date).toLocaleDateString("sv-SE")}
        </p>
        <p className="mt-2 text-2xl font-semibold">
          {report.home?.name} {report.homeScore ?? "–"} – {report.awayScore ?? "–"} {report.away?.name}
        </p>
        {report.venue && <p className="mt-1 text-xs text-[#898781]">{report.venue}</p>}
      </div>

      {!report.fullPlayerDetail && report.eventsAvailable && (
        <p className="mt-3 text-xs text-[#898781]">
          Vissa spelare i den här matchens händelser kunde inte kopplas till en spelarprofil —
          händelserna nedan visas då med lagnamn men utan spelarnamn.
        </p>
      )}

      {report.eventsAvailable && !report.eventsComplete && (
        <p className="mt-3 text-xs text-[#898781]">
          Vi har inte fullständig händelsedata för den här matchen — resultatet ovan stämmer, men
          tidslinjen kan sakna händelser (en känd lucka i källdatan för äldre matcher).
        </p>
      )}

      {(homeLineup || awayLineup) && (
        <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Startelvor</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {[
              { team: report.home?.name ?? "Hemma", lineup: homeLineup },
              { team: report.away?.name ?? "Borta", lineup: awayLineup },
            ].map(({ team, lineup }) => (
              <div key={team}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-white">{team}</p>
                  {lineup?.formation && <p className="text-[11px] text-[#898781]">{lineup.formation}</p>}
                </div>
                {lineup ? (
                  <>
                    <ul className="mt-2 space-y-1">
                      {lineup.fixture_lineup_player
                        .filter((p) => p.is_starter)
                        .map((p, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-[#c3c2b7]">
                            {p.shirt_number !== null && <span className="w-4 text-[#7d7c76]">{p.shirt_number}</span>}
                            {p.player ? (
                              <Link href={`/data/players/${p.player.id}`} className="hover:text-white hover:underline">
                                {p.player.full_name}
                              </Link>
                            ) : (
                              <span>Okänd spelare</span>
                            )}
                          </li>
                        ))}
                    </ul>
                    {lineup.fixture_lineup_player.some((p) => !p.is_starter) && (
                      <>
                        <p className="mt-2 text-[10px] uppercase tracking-wide text-[#7d7c76]">Avbytare</p>
                        <ul className="mt-1 space-y-1">
                          {lineup.fixture_lineup_player
                            .filter((p) => !p.is_starter)
                            .map((p, i) => (
                              <li key={i} className="flex items-center gap-2 text-xs text-[#898781]">
                                {p.shirt_number !== null && <span className="w-4 text-[#7d7c76]">{p.shirt_number}</span>}
                                {p.player ? (
                                  <Link href={`/data/players/${p.player.id}`} className="hover:text-white hover:underline">
                                    {p.player.full_name}
                                  </Link>
                                ) : (
                                  <span>Okänd spelare</span>
                                )}
                              </li>
                            ))}
                        </ul>
                      </>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-xs text-[#7d7c76]">Ingen laguppställning sparad för den här matchen.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {statRows.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Lagstatistik</h2>
          <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-wide text-[#7d7c76]">
            <span>{report.home?.name ?? "Hemma"}</span>
            <span>{report.away?.name ?? "Borta"}</span>
          </div>
          <div className="mt-1 divide-y divide-white/5">
            {statRows.map((row) => {
              const home = matchStats.home?.[row.key] ?? null;
              const away = matchStats.away?.[row.key] ?? null;
              return (
                <div key={row.key} className="flex items-center justify-between py-2 text-sm">
                  <span className="w-16 font-medium tabular-nums text-white">
                    {home ?? "–"}
                    {home !== null ? (row.suffix ?? "") : ""}
                  </span>
                  <span className="flex-1 text-center text-xs text-[#898781]">{row.label}</span>
                  <span className="w-16 text-right font-medium tabular-nums text-white">
                    {away ?? "–"}
                    {away !== null ? (row.suffix ?? "") : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <h2 className="text-sm font-semibold">Matchhändelser</h2>
        <div className="mt-3">
          <MatchTimeline events={report.events} />
        </div>
      </div>
    </div>
  );
}
