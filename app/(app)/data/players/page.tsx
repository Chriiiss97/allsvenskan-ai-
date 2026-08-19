import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlayerSearchList, type PlayerListItem } from "@/components/data/PlayerSearchList";
import type { PlayerSortKey } from "@/components/data/PlayerCard";
import { SectionTabs } from "@/components/data/SectionTabs";

interface PlayerListRow {
  id: number;
  full_name: string;
  position: string | null;
  photo_url: string | null;
  current_team: { id: number; name: string; external_id: number | null } | null;
}

interface StatRow {
  player_id: number;
  goals: number;
  assists: number;
  appearances: number;
  minutes_played: number;
  season: { year: number } | null;
}

const VALID_SORTS: PlayerSortKey[] = ["name", "goals", "assists", "appearances", "minutes"];
const SEASON_OPTIONS = [2024, 2023, 2022] as const;

export default async function PlayersIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; season?: string }>;
}) {
  const { sort: rawSort, season: rawSeason } = await searchParams;
  const sort: PlayerSortKey = VALID_SORTS.includes(rawSort as PlayerSortKey) ? (rawSort as PlayerSortKey) : "name";
  const seasonNum = Number(rawSeason);
  const seasonFilter: "all" | (typeof SEASON_OPTIONS)[number] = SEASON_OPTIONS.includes(
    seasonNum as (typeof SEASON_OPTIONS)[number]
  )
    ? (seasonNum as (typeof SEASON_OPTIONS)[number])
    : "all";

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("player")
    .select("id, full_name, position, photo_url, current_team:current_team_id(id, name, external_id)")
    .order("full_name")
    .returns<PlayerListRow[]>();

  const players = data ?? [];

  // Hämtas alltid i bulk (253 rader) och reduceras i JS — samma mönster
  // som lagprofilen/get_top_scorers, billigare än en fråga per spelare.
  const { data: statsData } = await supabase
    .from("statistics")
    .select("player_id, goals, assists, appearances, minutes_played, season:season_id(year)")
    .returns<StatRow[]>();
  const stats = statsData ?? [];

  let items: PlayerListItem[];

  if (seasonFilter === "all") {
    // "Alla säsonger" = summerat över 2022–2024 per spelare. Alla spelare
    // visas (var och en har minst en importerad säsong).
    const totals = new Map<
      number,
      { goals: number; assists: number; appearances: number; minutesPlayed: number }
    >();
    for (const row of stats) {
      const existing = totals.get(row.player_id) ?? { goals: 0, assists: 0, appearances: 0, minutesPlayed: 0 };
      existing.goals += row.goals;
      existing.assists += row.assists;
      existing.appearances += row.appearances;
      existing.minutesPlayed += row.minutes_played;
      totals.set(row.player_id, existing);
    }
    items = players.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      position: p.position,
      photoUrl: p.photo_url,
      teamName: p.current_team?.name ?? null,
      teamIndex: p.current_team?.external_id === 377 ? 1 : 0,
      teamExternalId: p.current_team?.external_id ?? null,
      stat: totals.has(p.id) ? { ...totals.get(p.id)!, year: "all" as const } : null,
    }));
  } else {
    // En specifik säsong vald: bara spelare som faktiskt har en statistikrad
    // för DEN säsongen visas — ingen "senaste tillgängliga år"-fallback.
    const statByPlayer = new Map<
      number,
      { goals: number; assists: number; appearances: number; minutesPlayed: number }
    >();
    for (const row of stats) {
      if (row.season?.year !== seasonFilter) continue;
      statByPlayer.set(row.player_id, {
        goals: row.goals,
        assists: row.assists,
        appearances: row.appearances,
        minutesPlayed: row.minutes_played,
      });
    }
    items = players
      .filter((p) => statByPlayer.has(p.id))
      .map((p) => ({
        id: p.id,
        full_name: p.full_name,
        position: p.position,
        photoUrl: p.photo_url,
        teamName: p.current_team?.name ?? null,
        teamIndex: p.current_team?.external_id === 377 ? 1 : 0,
        teamExternalId: p.current_team?.external_id ?? null,
        stat: { ...statByPlayer.get(p.id)!, year: seasonFilter },
      }));
  }

  const sortKeyMap: Record<PlayerSortKey, keyof NonNullable<PlayerListItem["stat"]> | null> = {
    name: null,
    goals: "goals",
    assists: "assists",
    appearances: "appearances",
    minutes: "minutesPlayed",
  };
  const statKey = sortKeyMap[sort];
  const sortedItems =
    statKey === null
      ? [...items].sort((a, b) => a.full_name.localeCompare(b.full_name, "sv"))
      : [...items].sort((a, b) => {
          const av = a.stat?.[statKey];
          const bv = b.stat?.[statKey];
          return (typeof bv === "number" ? bv : -1) - (typeof av === "number" ? av : -1);
        });

  function seasonHref(value: "all" | number) {
    const params = new URLSearchParams();
    if (rawSort) params.set("sort", rawSort);
    if (value !== "all") params.set("season", String(value));
    const qs = params.toString();
    return qs ? `/data/players?${qs}` : "/data/players";
  }

  return (
    <div>
      <SectionTabs
        tabs={[
          { label: "Spelare", href: "/data/players" },
          { label: "Jämför spelare", href: "/data/players/compare" },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3987e5]">Spelardatabas</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Spelare</h1>
          <p className="mt-1 text-sm text-[#898781]">
            {sortedItems.length} spelare från IFK Göteborg och AIK
            {seasonFilter === "all" ? ", 2022–2024" : `, säsongen ${seasonFilter}`}.
          </p>
        </div>
        <Link
          href="/data/players/compare"
          className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-[#c3c2b7] transition-colors hover:bg-white/5 hover:text-white"
        >
          ⚖️ Jämför två spelare
        </Link>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs">
        <span className="text-[#7d7c76]">Säsong:</span>
        <div className="flex flex-wrap gap-1">
          {(["all", ...SEASON_OPTIONS] as const).map((s) => (
            <Link
              key={s}
              href={seasonHref(s)}
              className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                seasonFilter === s ? "bg-[#3987e5]/15 text-white" : "text-[#898781] hover:text-white"
              }`}
            >
              {s === "all" ? "Alla säsonger" : s}
            </Link>
          ))}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-[#e66767]">Kunde inte hämta spelare: {error.message}</p>}

      <PlayerSearchList players={sortedItems} sort={sort} />
    </div>
  );
}
