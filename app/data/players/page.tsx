import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlayerSearchList } from "@/components/data/PlayerSearchList";

interface PlayerListRow {
  id: number;
  full_name: string;
  position: string | null;
  photo_url: string | null;
  current_team: { id: number; name: string; logo_url: string | null } | null;
}

export default async function PlayersIndexPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("player")
    .select("id, full_name, position, photo_url, current_team:current_team_id(id, name, logo_url)")
    .order("full_name")
    .returns<PlayerListRow[]>();

  const players = data ?? [];

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

      <PlayerSearchList players={players} />
    </div>
  );
}
