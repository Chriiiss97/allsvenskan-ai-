import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlayerSearchList, type PlayerListItem } from "@/components/data/PlayerSearchList";

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
  appearances: number;
  season: { year: number } | null;
}

export default async function PlayersIndexPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("player")
    .select("id, full_name, position, photo_url, current_team:current_team_id(id, name, external_id)")
    .order("full_name")
    .returns<PlayerListRow[]>();

  const players = data ?? [];

  // Snabbstatistik för korten: senaste säsongens mål/matcher per spelare.
  // 253 rader — billigare att hämta en gång och reducera i JS än en fråga
  // per spelare (samma mönster som /stats-sidan).
  const { data: statsData } = await supabase
    .from("statistics")
    .select("player_id, goals, appearances, season:season_id(year)")
    .returns<StatRow[]>();

  const latestStatByPlayer = new Map<number, { goals: number; appearances: number; year: number }>();
  for (const row of statsData ?? []) {
    if (!row.season) continue;
    const existing = latestStatByPlayer.get(row.player_id);
    if (!existing || row.season.year > existing.year) {
      latestStatByPlayer.set(row.player_id, {
        goals: row.goals,
        appearances: row.appearances,
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
    stat: latestStatByPlayer.get(p.id) ?? null,
  }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Spelare</h1>
        <Link
          href="/data/players/compare"
          className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-[#c3c2b7] transition-colors hover:bg-white/5 hover:text-white"
        >
          ⚖️ Jämför två spelare
        </Link>
      </div>
      <p className="mt-1 text-sm text-[#898781]">
        {players.length} spelare från IFK Göteborg och AIK, 2022–2024.
      </p>

      {error && <p className="mt-4 text-sm text-[#e66767]">Kunde inte hämta spelare: {error.message}</p>}

      <PlayerSearchList players={items} />
    </div>
  );
}
