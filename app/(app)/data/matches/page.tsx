import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

interface FixtureRow {
  id: number;
  kickoff_at: string;
  status: string;
  round: string | null;
  home_score: number | null;
  away_score: number | null;
  events_synced_at: string | null;
  home: { name: string } | null;
  away: { name: string } | null;
  season: { year: number } | null;
}

const SEASONS = [2024, 2023, 2022];

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season } = await searchParams;
  const seasonYear = season ? Number(season) : SEASONS[0];
  const supabase = await createClient();

  const { data: teamRows } = await supabase
    .from("team")
    .select("id")
    .in("external_id", [366, 377]);
  const teamIds = (teamRows ?? []).map((t) => t.id);

  const { data: seasonRow } = await supabase.from("season").select("id").eq("year", seasonYear).maybeSingle();

  let fixtures: FixtureRow[] = [];
  if (seasonRow && teamIds.length > 0) {
    const { data } = await supabase
      .from("fixture")
      .select(
        "id, kickoff_at, status, round, home_score, away_score, events_synced_at, home:home_team_id(name), away:away_team_id(name), season:season_id(year)"
      )
      .eq("season_id", seasonRow.id)
      .or(`home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`)
      .order("kickoff_at", { ascending: false })
      .returns<FixtureRow[]>();
    fixtures = data ?? [];
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Matcher</h1>
      <p className="mt-1 text-sm text-[#898781]">
        IFK Göteborg och AIK:s matcher. Matchrapport (mål/kort/byten) finns bara för de matcher som
        är markerade — resten väntar på import.
      </p>

      <div className="mt-4 flex gap-1 rounded-lg border border-white/10 bg-[#1a1a19] p-1 w-fit">
        {SEASONS.map((y) => (
          <Link
            key={y}
            href={`/data/matches?season=${y}`}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              y === seasonYear ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
            }`}
          >
            {y}
          </Link>
        ))}
      </div>

      <ul className="mt-4 space-y-1.5">
        {fixtures.map((f) => (
          <li key={f.id}>
            <Link
              href={`/data/matches/${f.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#1a1a19] px-4 py-2.5 text-sm transition-colors hover:border-white/25 hover:bg-white/[.03]"
            >
              <span>
                {f.home?.name} {f.home_score ?? "–"}–{f.away_score ?? "–"} {f.away?.name}
              </span>
              <span className="flex items-center gap-2 text-xs text-[#898781]">
                {f.round}
                {f.events_synced_at ? (
                  <span className="rounded-full bg-[#0ca30c]/20 px-2 py-0.5 text-[#0ca30c]">
                    Rapport tillgänglig
                  </span>
                ) : (
                  <span className="rounded-full bg-white/5 px-2 py-0.5">Bara resultat</span>
                )}
              </span>
            </Link>
          </li>
        ))}
        {fixtures.length === 0 && <p className="text-sm text-[#898781]">Inga matcher för {seasonYear}.</p>}
      </ul>
    </div>
  );
}
