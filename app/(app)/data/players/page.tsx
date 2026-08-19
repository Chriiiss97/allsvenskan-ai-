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

export default async function PlayersIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: rawSort } = await searchParams;
  const sort: PlayerSortKey = VALID_SORTS.includes(rawSort as PlayerSortKey) ? (rawSort as PlayerSortKey) : "name";

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("player")
    .select("id, full_name, position, photo_url, current_team:current_team_id(id, name, external_id)")
    .order("full_name")
    .returns<PlayerListRow[]>();

  const players = data ?? [];

  // Snabbstatistik för korten: senaste säsongens siffror per spelare. 253
  // rader — billigare att hämta en gång och reducera i JS än en fråga per
  // spelare (samma mönster som /stats-sidan).
  const { data: statsData } = await supabase
    .from("statistics")
    .select("player_id, goals, assists, appearances, minutes_played, season:season_id(year)")
    .returns<StatRow[]>();

  const latestStatByPlayer = new Map<
    number,
    { goals: number; assists: number; appearances: number; minutesPlayed: number; year: number }
  >();
  for (const row of statsData ?? []) {
    if (!row.season) continue;
    const existing = latestStatByPlayer.get(row.player_id);
    if (!existing || row.season.year > existing.year) {
      latestStatByPlayer.set(row.player_id, {
        goals: row.goals,
        assists: row.assists,
        appearances: row.appearances,
        minutesPlayed: row.minutes_played,
        year: row.season.year,
      });
    }
  }

  const items: PlayerListItem[] = players.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    position: p.position,
    photoUrl: p.photo_url,
    teamName: p.current_team?.name ?? null,
    // IFK Göteborg (external_id 366) -> accent 0, AIK (377) -> accent 1.
    teamIndex: p.current_team?.external_id === 377 ? 1 : 0,
    teamExternalId: p.current_team?.external_id ?? null,
    stat: latestStatByPlayer.get(p.id) ?? null,
  }));

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
      : [...items].sort((a, b) => (b.stat?.[statKey] ?? -1) - (a.stat?.[statKey] ?? -1));

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
            {players.length} spelare från IFK Göteborg och AIK, 2022–2024.
          </p>
        </div>
        <Link
          href="/data/players/compare"
          className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-[#c3c2b7] transition-colors hover:bg-white/5 hover:text-white"
        >
          ⚖️ Jämför två spelare
        </Link>
      </div>

      {error && <p className="mt-4 text-sm text-[#e66767]">Kunde inte hämta spelare: {error.message}</p>}

      <PlayerSearchList players={sortedItems} sort={sort} />
    </div>
  );
}
