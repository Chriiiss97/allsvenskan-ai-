import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { comparePlayers, FootballDataError } from "@/lib/football/tools";
import { computePlayerDNA } from "@/lib/football/player-dna";
import { computeRatingForPlayer } from "@/lib/football/rating/compute-rating";
import { PlayerCompareControls } from "@/components/data/PlayerCompareControls";
import { PlayerCompareTable } from "@/components/data/PlayerCompareTable";
import { PlayerCompareRadar } from "@/components/data/PlayerCompareRadar";
import { PlayerDNA } from "@/components/data/PlayerDNA";
import { PlayerRating } from "@/components/data/PlayerRating";
import { SectionTabs } from "@/components/data/SectionTabs";
import { getAvailableSeasons } from "@/lib/football/catalog";

interface PlayerOption {
  id: number;
  full_name: string;
  current_team: { name: string } | null;
}

interface ComparableStats {
  goals: number;
  assists: number;
  shotsTotal: number | null;
  rating: number | null;
}

/**
 * Faktabaserade jämförelserader — bara mellan mått där BÅDA spelarna har
 * ett värde (aldrig en gissning om det som saknas), samma princip som
 * insiktslistan på /data/teams/compare.
 */
function buildPlayerInsights(
  a: { name: string; stats: ComparableStats; ovr: number | null },
  b: { name: string; stats: ComparableStats; ovr: number | null }
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

  // Player Rating-OVR — ETT ANNAT tal än snittbetyget ovan, se
  // components/data/PlayerRating.tsx. Bara med när båda faktiskt har en
  // beräknad OVR den här säsongen (aldrig en gissning om det som saknas).
  if (a.ovr !== null && b.ovr !== null && a.ovr !== b.ovr) {
    const leader = a.ovr > b.ovr ? a : b;
    insights.push(`${leader.name} har högst Player Rating-OVR (${leader.ovr}).`);
  }

  return insights;
}

export default async function ComparePlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; season?: string }>;
}) {
  const { a, b, season } = await searchParams;
  const supabase = await createClient();

  const seasons = await getAvailableSeasons(supabase);

  const { data: playersData } = await supabase
    .from("player")
    .select("id, full_name, current_team:current_team_id(name)")
    .order("full_name")
    .returns<PlayerOption[]>();
  const players = playersData ?? [];

  const idA = a ? Number(a) : null;
  const idB = b ? Number(b) : null;
  const seasonYear = season ? Number(season) : undefined;

  let comparison: Awaited<ReturnType<typeof comparePlayers>> | null = null;
  let error: string | null = null;
  let insights: string[] = [];
  let dnaA: Awaited<ReturnType<typeof computePlayerDNA>> | null = null;
  let dnaB: Awaited<ReturnType<typeof computePlayerDNA>> | null = null;
  let ratingA: Awaited<ReturnType<typeof computeRatingForPlayer>> | null = null;
  let ratingB: Awaited<ReturnType<typeof computeRatingForPlayer>> | null = null;

  if (idA && idB) {
    try {
      comparison = await comparePlayers(supabase, {
        playerA: String(idA),
        playerB: String(idB),
        season: seasonYear,
      });
      [dnaA, dnaB, ratingA, ratingB] = await Promise.all([
        comparison.playerA.season
          ? computePlayerDNA(supabase, { playerId: comparison.playerA.player.id, season: comparison.playerA.season })
          : Promise.resolve(null),
        comparison.playerB.season
          ? computePlayerDNA(supabase, { playerId: comparison.playerB.player.id, season: comparison.playerB.season })
          : Promise.resolve(null),
        comparison.playerA.season
          ? computeRatingForPlayer(supabase, {
              playerId: comparison.playerA.player.id,
              position: comparison.playerA.player.position,
              season: comparison.playerA.season,
            })
          : Promise.resolve(null),
        comparison.playerB.season
          ? computeRatingForPlayer(supabase, {
              playerId: comparison.playerB.player.id,
              position: comparison.playerB.player.position,
              season: comparison.playerB.season,
            })
          : Promise.resolve(null),
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
    <div>
      <SectionTabs
        tabs={[
          { label: "Scout", href: "/scout/spelare" },
          { label: "Spelare", href: "/spelare" },
          { label: "Jämför spelare", href: "/spelare/compare" },
          { label: "Topplista", href: "/spelare/rankings" },
        ]}
      />
      <h1 className="text-3xl font-bold tracking-tight">Jämför spelare</h1>

      <div className="mt-4">
        <PlayerCompareControls players={players} idA={idA} idB={idB} />
      </div>

      {idA && idB && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-[#898781]">Säsong:</span>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-[#1a1a19] p-1">
            <Link
              href={`/spelare/compare?a=${idA}&b=${idB}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                !seasonYear ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
              }`}
            >
              Senaste var för sig
            </Link>
            {seasons.map((s) => (
              <Link
                key={s.year}
                href={`/spelare/compare?a=${idA}&b=${idB}&season=${s.year}`}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  seasonYear === s.year ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
                }`}
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
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#3987e5]" aria-hidden />
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
              {comparison.playerA.player.name} ({comparison.playerA.season}) vs{" "}
              {comparison.playerB.player.name} ({comparison.playerB.season})
            </h2>
            {comparison.playerA.season !== comparison.playerB.season && (
              <p className="mt-1 text-xs text-[#898781]">
                Obs: spelarna visas för olika säsonger (deras respektive senast tillgängliga).
              </p>
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

      {!comparison && !error && (
        <p className="mt-6 text-sm text-[#898781]">Välj två spelare ovan för att jämföra.</p>
      )}
    </div>
  );
}
