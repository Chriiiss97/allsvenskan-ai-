import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { comparePlayers, getTeamComparison, FootballDataError } from "@/lib/football/tools";
import { computePlayerDNA } from "@/lib/football/player-dna";
import { computeRatingForPlayer } from "@/lib/football/rating/compute-rating";
import { EntityCompareControls } from "@/components/data/EntityCompareControls";
import type { EntityOption } from "@/components/data/EntityPicker";
import { PlayerCompareTable } from "@/components/data/PlayerCompareTable";
import { PlayerCompareRadar } from "@/components/data/PlayerCompareRadar";
import { PlayerDNA } from "@/components/data/PlayerDNA";
import { PlayerRating } from "@/components/data/PlayerRating";
import { TeamCompareBars } from "@/components/data/TeamCompareBars";
import { FormBadges } from "@/components/data/FormBadges";
import { RecordBar } from "@/components/data/RecordBar";
import { getAvailableSeasons, listTeams } from "@/lib/football/catalog";
import { translateRound } from "@/lib/i18n/sv";

/**
 * Fas 14.4 (plans/humble-giggling-biscuit.md) — Scout Compare. Flyttar
 * f.d. /spelare/compare OCH /lag/compare hit som EN sida med ett
 * spelare/lag-lägesväxel (samma "två lägen, delade filter, en sida"-mönster
 * som redan finns på /spelare/rankings) istället för två separata rutter.
 * Byggd på EntityPicker/EntityCompareControls (Fas 14.2) istället för de
 * gamla PlayerPicker/TeamPicker+PlayerCompareControls/TeamCompareControls-
 * paren — precis den migrering 14.2 förberedde för, tillämpad nu när
 * sidan ändå byggdes om. Resten av jämförelselogiken (comparePlayers/
 * getTeamComparison, PlayerCompareTable/Radar, TeamCompareBars m.fl.) är
 * OFÖRÄNDRAD, bara flyttad hit.
 */

interface PlayerInsightStats {
  goals: number;
  assists: number;
  shotsTotal: number | null;
  rating: number | null;
}

function buildPlayerInsights(
  a: { name: string; stats: PlayerInsightStats; ovr: number | null },
  b: { name: string; stats: PlayerInsightStats; ovr: number | null }
): string[] {
  const insights: string[] = [];
  function compareCount(label: string, va: number | null, vb: number | null) {
    if (va === null || vb === null || va === vb) return;
    const [leader, leaderVal, otherVal] = va > vb ? [a, va, vb] : [b, vb, va];
    insights.push(`${leader.name} har fler ${label} (${leaderVal} mot ${otherVal}).`);
  }
  compareCount("mål", a.stats.goals, b.stats.goals);
  compareCount("assist", a.stats.assists, b.stats.assists);
  compareCount("skott", a.stats.shotsTotal, b.stats.shotsTotal);
  if (a.stats.rating !== null && b.stats.rating !== null && a.stats.rating !== b.stats.rating) {
    const leader = a.stats.rating > b.stats.rating ? a : b;
    insights.push(`${leader.name} har högst snittbetyg den här säsongen.`);
  }
  if (a.ovr !== null && b.ovr !== null && a.ovr !== b.ovr) {
    const leader = a.ovr > b.ovr ? a : b;
    insights.push(`${leader.name} har högst Player Rating-OVR (${leader.ovr}).`);
  }
  return insights;
}

function buildTeamInsights(comparison: Awaited<ReturnType<typeof getTeamComparison>>): string[] {
  const { teamA, teamB } = comparison;
  if (teamA.points === teamB.points) return [];
  const leader = teamA.points > teamB.points ? teamA : teamB;
  const other = leader === teamA ? teamB : teamA;
  const insights: string[] = [];
  insights.push(`${leader.name} har ${leader.points - other.points} fler poäng (${leader.points} mot ${other.points}).`);
  if (leader.wins > other.wins) insights.push(`${leader.name} har vunnit ${leader.wins - other.wins} fler matcher.`);
  const gdLeader = leader.goalsFor - leader.goalsAgainst;
  const gdOther = other.goalsFor - other.goalsAgainst;
  if (gdLeader > gdOther) {
    const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    insights.push(`${leader.name} har bättre målskillnad (${fmt(gdLeader)} mot ${fmt(gdOther)}).`);
  }
  const leaderFormWins = leader.form.filter((r) => r === "W").length;
  const otherFormWins = other.form.filter((r) => r === "W").length;
  if (leaderFormWins > otherFormWins) {
    insights.push(`${leader.name} har bättre form just nu (${leaderFormWins} vinster av senaste ${leader.form.length}).`);
  }
  return insights;
}

export default async function ScoutComparePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; a?: string; b?: string; season?: string }>;
}) {
  const { mode: modeParam, a, b, season } = await searchParams;
  const mode: "spelare" | "lag" = modeParam === "lag" ? "lag" : "spelare";
  const supabase = await createClient();
  const seasons = await getAvailableSeasons(supabase);
  const seasonYear = season ? Number(season) : undefined;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Jämför</h1>

      <div className="mt-4 flex gap-1 rounded-lg border border-white/10 bg-[#1a1a19] p-1 text-sm">
        <Link
          href="/scout/compare?mode=spelare"
          className={`flex-1 rounded-md px-3 py-1.5 text-center font-medium transition-colors ${
            mode === "spelare" ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
          }`}
        >
          Spelare
        </Link>
        <Link
          href="/scout/compare?mode=lag"
          className={`flex-1 rounded-md px-3 py-1.5 text-center font-medium transition-colors ${
            mode === "lag" ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
          }`}
        >
          Lag
        </Link>
      </div>

      {mode === "spelare" ? (
        <PlayerCompareSection a={a} b={b} seasonYear={seasonYear} seasons={seasons} supabase={supabase} />
      ) : (
        <TeamCompareSection a={a} b={b} seasonYear={seasonYear} supabase={supabase} />
      )}
    </div>
  );
}

async function PlayerCompareSection({
  a,
  b,
  seasonYear,
  seasons,
  supabase,
}: {
  a?: string;
  b?: string;
  seasonYear?: number;
  seasons: { year: number }[];
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data: playersData } = await supabase
    .from("player")
    .select("id, full_name, current_team:current_team_id(name)")
    .order("full_name")
    .returns<{ id: number; full_name: string; current_team: { name: string } | null }[]>();
  const players = playersData ?? [];

  const idA = a ? Number(a) : null;
  const idB = b ? Number(b) : null;

  let comparison: Awaited<ReturnType<typeof comparePlayers>> | null = null;
  let error: string | null = null;
  let insights: string[] = [];
  let dnaA: Awaited<ReturnType<typeof computePlayerDNA>> | null = null;
  let dnaB: Awaited<ReturnType<typeof computePlayerDNA>> | null = null;
  let ratingA: Awaited<ReturnType<typeof computeRatingForPlayer>> | null = null;
  let ratingB: Awaited<ReturnType<typeof computeRatingForPlayer>> | null = null;

  if (idA && idB) {
    try {
      comparison = await comparePlayers(supabase, { playerA: String(idA), playerB: String(idB), season: seasonYear });
      [dnaA, dnaB, ratingA, ratingB] = await Promise.all([
        comparison.playerA.season ? computePlayerDNA(supabase, { playerId: comparison.playerA.player.id, season: comparison.playerA.season }) : Promise.resolve(null),
        comparison.playerB.season ? computePlayerDNA(supabase, { playerId: comparison.playerB.player.id, season: comparison.playerB.season }) : Promise.resolve(null),
        comparison.playerA.season ? computeRatingForPlayer(supabase, { playerId: comparison.playerA.player.id, position: comparison.playerA.player.position, season: comparison.playerA.season }) : Promise.resolve(null),
        comparison.playerB.season ? computeRatingForPlayer(supabase, { playerId: comparison.playerB.player.id, position: comparison.playerB.player.position, season: comparison.playerB.season }) : Promise.resolve(null),
      ]);
      insights = buildPlayerInsights(
        { name: comparison.playerA.player.name, stats: comparison.playerA.stats, ovr: ratingA?.rating.ovr ?? null },
        { name: comparison.playerB.player.name, stats: comparison.playerB.stats, ovr: ratingB?.rating.ovr ?? null }
      );
    } catch (err) {
      error = err instanceof FootballDataError ? err.message : "Kunde inte jämföra spelarna.";
    }
  }

  return (
    <>
      <div className="mt-4">
        <EntityCompareControls
          options={players.map((p): EntityOption => ({ id: p.id, label: p.full_name, subLabel: p.current_team?.name }))}
          idA={idA}
          idB={idB}
          basePath="/scout/compare?mode=spelare"
          labelA="Spelare A"
          labelB="Spelare B"
        />
      </div>

      {idA && idB && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-[#898781]">Säsong:</span>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-[#1a1a19] p-1">
            <Link
              href={`/scout/compare?mode=spelare&a=${idA}&b=${idB}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${!seasonYear ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"}`}
            >
              Senaste var för sig
            </Link>
            {seasons.map((s) => (
              <Link
                key={s.year}
                href={`/scout/compare?mode=spelare&a=${idA}&b=${idB}&season=${s.year}`}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${seasonYear === s.year ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"}`}
              >
                {s.year}
              </Link>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-6 text-sm text-[#e66767]">{error}</p>}

      {insights.length > 0 && (
        <div className="mt-6 rounded-xl border border-white/10 bg-[#141418] p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Skillnader</p>
          <ul className="space-y-1.5">
            {insights.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#c3c2b7]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#a78bfa]" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {comparison && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
            <h2 className="text-sm font-semibold">
              {comparison.playerA.player.name} ({comparison.playerA.season}) vs {comparison.playerB.player.name} ({comparison.playerB.season})
            </h2>
            {comparison.playerA.season !== comparison.playerB.season && (
              <p className="mt-1 text-xs text-[#898781]">Obs: spelarna visas för olika säsonger (deras respektive senast tillgängliga).</p>
            )}
            <div className="mt-3">
              <PlayerCompareTable
                nameA={comparison.playerA.player.name}
                nameB={comparison.playerB.player.name}
                statsA={comparison.playerA.stats}
                statsB={comparison.playerB.stats}
              />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
            <h2 className="text-sm font-semibold">Per 90 minuter, relativt</h2>
            <div className="mt-3">
              <PlayerCompareRadar
                nameA={comparison.playerA.player.name}
                nameB={comparison.playerB.player.name}
                per90A={comparison.playerA.per90}
                per90B={comparison.playerB.per90}
              />
            </div>
          </div>
        </div>
      )}

      {comparison && ratingA && ratingB && comparison.playerA.season && comparison.playerB.season && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-[#c3c2b7]">{comparison.playerA.player.name}</p>
            <PlayerRating data={ratingA} season={comparison.playerA.season} compact />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-[#c3c2b7]">{comparison.playerB.player.name}</p>
            <PlayerRating data={ratingB} season={comparison.playerB.season} compact />
          </div>
        </div>
      )}

      {comparison && dnaA && dnaB && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-[#c3c2b7]">{comparison.playerA.player.name}</p>
            <PlayerDNA dna={dnaA} compact />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-[#c3c2b7]">{comparison.playerB.player.name}</p>
            <PlayerDNA dna={dnaB} compact />
          </div>
        </div>
      )}

      {!comparison && !error && <p className="mt-6 text-sm text-[#898781]">Välj två spelare ovan för att jämföra.</p>}
    </>
  );
}

async function TeamCompareSection({
  a,
  b,
  seasonYear,
  supabase,
}: {
  a?: string;
  b?: string;
  seasonYear?: number;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const teams = await listTeams(supabase);

  let comparison: Awaited<ReturnType<typeof getTeamComparison>> | null = null;
  let error: string | null = null;

  try {
    comparison = await getTeamComparison(supabase, { teamA: a ?? "IFK Göteborg", teamB: b ?? "AIK", season: seasonYear });
  } catch (err) {
    error = err instanceof FootballDataError ? err.message : "Kunde inte jämföra lagen.";
  }

  let logos: Record<string, string | null> = {};
  if (comparison) {
    const { data: logoRows } = await supabase
      .from("team")
      .select("name, logo_url")
      .in("name", [comparison.teamA.name, comparison.teamB.name])
      .returns<{ name: string; logo_url: string | null }[]>();
    logos = Object.fromEntries((logoRows ?? []).map((r) => [r.name, r.logo_url]));
  }

  const insights = comparison ? buildTeamInsights(comparison) : [];

  return (
    <>
      <div className="mt-4">
        <EntityCompareControls
          options={teams
            .filter((t) => t.external_id !== null)
            .map((t): EntityOption => ({ id: t.external_id as number, label: t.name, logoUrl: t.logoUrl }))}
          idA={comparison?.teamA.externalId ?? null}
          idB={comparison?.teamB.externalId ?? null}
          basePath="/scout/compare?mode=lag"
          labelA="Lag A"
          labelB="Lag B"
          className="mx-auto grid max-w-lg gap-4 sm:grid-cols-2"
        />
      </div>

      {error && <p className="mt-6 text-sm text-[#e66767]">{error}</p>}

      {comparison && (
        <>
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-5 sm:gap-8">
              {logos[comparison.teamA.name] && (
                // eslint-disable-next-line @next/next/no-img-element -- extern logga
                <img src={logos[comparison.teamA.name]!} alt="" className="h-14 w-14 sm:h-20 sm:w-20" />
              )}
              <span className="text-2xl font-bold text-[#7d7c76] sm:text-3xl">VS</span>
              {logos[comparison.teamB.name] && (
                // eslint-disable-next-line @next/next/no-img-element -- extern logga
                <img src={logos[comparison.teamB.name]!} alt="" className="h-14 w-14 sm:h-20 sm:w-20" />
              )}
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-4xl">
              {comparison.teamA.name} <span className="text-[#7d7c76]">vs</span> {comparison.teamB.name}
            </h2>
            <p className="text-sm text-[#898781]">Säsong {comparison.season} · resultatbaserat</p>
          </div>

          <div className="mt-10 flex items-center justify-center gap-8 sm:gap-16">
            <div className="text-center">
              <p className="text-5xl font-bold text-[#3987e5] sm:text-6xl">{comparison.teamA.points}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-[#898781]">Poäng</p>
            </div>
            <div className="text-center">
              <p className="text-5xl font-bold text-[#eab308] sm:text-6xl">{comparison.teamB.points}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-[#898781]">Poäng</p>
            </div>
          </div>

          {insights.length > 0 && (
            <div className="mx-auto mt-8 max-w-lg">
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Varför ligger de till som de gör</p>
              <ul className="space-y-1.5">
                {insights.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#c3c2b7]">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#a78bfa]" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-10 rounded-2xl border border-white/10 bg-[#141418] p-6">
            <TeamCompareBars
              rows={[
                { label: "Mål för", a: comparison.teamA.goalsFor, b: comparison.teamB.goalsFor },
                { label: "Mål mot", a: comparison.teamA.goalsAgainst, b: comparison.teamB.goalsAgainst },
                { label: "Målskillnad", a: comparison.teamA.goalsFor - comparison.teamA.goalsAgainst, b: comparison.teamB.goalsFor - comparison.teamB.goalsAgainst },
              ]}
            />
          </div>

          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Form (senaste 5)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[comparison.teamA, comparison.teamB].map((t) => (
                <div key={t.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#141418] p-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-[#898781]">{t.played} matcher · {t.wins}-{t.draws}-{t.losses}</p>
                  </div>
                  <FormBadges form={t.form} />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Inbördes möten (alla säsonger)</p>
            <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
              <RecordBar
                wins={comparison.headToHead.record.teamAWins}
                draws={comparison.headToHead.record.draws}
                losses={comparison.headToHead.record.teamBWins}
                variant="teams"
              />
              <p className="mt-1.5 text-xs text-[#898781]">
                {comparison.teamA.name} {comparison.headToHead.record.teamAWins} — {comparison.headToHead.record.draws} oavgjorda — {comparison.headToHead.record.teamBWins} {comparison.teamB.name}
              </p>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {comparison.headToHead.matches.map((m, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-white/8 bg-[#141418] px-3.5 py-2 text-xs">
                  <span className="text-[#c3c2b7]">
                    {m.home} <span className="font-semibold text-white">{m.homeScore ?? "–"}–{m.awayScore ?? "–"}</span> {m.away}
                  </span>
                  <span className="text-[#7d7c76]">{m.season} · {translateRound(m.round)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
