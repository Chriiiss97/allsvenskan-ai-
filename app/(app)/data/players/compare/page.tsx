import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { comparePlayers, FootballDataError } from "@/lib/football/tools";
import { PlayerCompareControls } from "@/components/data/PlayerCompareControls";
import { PlayerCompareTable } from "@/components/data/PlayerCompareTable";
import { PlayerCompareRadar } from "@/components/data/PlayerCompareRadar";
import { BackButton } from "@/components/nav/BackButton";

interface PlayerOption {
  id: number;
  full_name: string;
  current_team: { name: string } | null;
}

const SEASONS = [2024, 2023, 2022];

export default async function ComparePlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; season?: string }>;
}) {
  const { a, b, season } = await searchParams;
  const supabase = await createClient();

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

  if (idA && idB) {
    try {
      comparison = await comparePlayers(supabase, {
        playerA: String(idA),
        playerB: String(idB),
        season: seasonYear,
      });
    } catch (err) {
      error = err instanceof FootballDataError ? err.message : "Kunde inte jämföra spelarna.";
    }
  }

  return (
    <div>
      <BackButton href="/data/players" label="Alla spelare" />
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Jämför spelare</h1>

      <div className="mt-4">
        <PlayerCompareControls players={players} idA={idA} idB={idB} />
      </div>

      {idA && idB && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-[#898781]">Säsong:</span>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-[#1a1a19] p-1">
            <Link
              href={`/data/players/compare?a=${idA}&b=${idB}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                !seasonYear ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
              }`}
            >
              Senaste var för sig
            </Link>
            {SEASONS.map((y) => (
              <Link
                key={y}
                href={`/data/players/compare?a=${idA}&b=${idB}&season=${y}`}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  seasonYear === y ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-6 text-sm text-[#e66767]">{error}</p>}

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

      {!comparison && !error && (
        <p className="mt-6 text-sm text-[#898781]">Välj två spelare ovan för att jämföra.</p>
      )}
    </div>
  );
}
