import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { removeFromShortlist } from "./actions";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { translatePosition } from "@/lib/i18n/sv";

interface ShortlistRow {
  player_id: number;
  created_at: string;
  player: {
    id: number;
    full_name: string;
    position: string | null;
    photo_url: string | null;
    current_team: { name: string; external_id: number | null } | null;
  } | null;
}

/**
 * Fas 14.4 (plans/humble-giggling-biscuit.md) — Scout Shortlist: "Min Scout
 * Shortlist". RLS gör att frågan nedan automatiskt bara ser den inloggade
 * användarens egna rader (se migration 20260822120000_scout_shortlist.sql),
 * ingen manuell user_id-filtrering behövs i själva select:en — men vi
 * kräver inloggning explicit här ändå, samma mönster som resten av appen.
 */
export default async function ShortlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("scout_shortlist_player")
    .select("player_id, created_at, player:player_id(id, full_name, position, photo_url, current_team:current_team_id(name, external_id))")
    .order("created_at", { ascending: false })
    .returns<ShortlistRow[]>();
  if (error) throw error;

  const rows = data ?? [];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Min bevakningslista</h1>
      <p className="mt-1 text-sm text-[#898781]">
        {rows.length} {rows.length === 1 ? "spelare" : "spelare"} sparade. Stjärnmärk från en spelares fulla profil i Scout.
      </p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-[#1a1a19] p-8 text-center">
          <p className="text-sm text-[#898781]">Din shortlist är tom än.</p>
          <Link href="/scout/spelare" className="mt-3 inline-block text-sm text-[#a78bfa] hover:underline">
            Bläddra bland spelare →
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) =>
            r.player ? (
              <div key={r.player_id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1a1a19] p-3">
                <Link href={`/scout/spelare/${r.player.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <PlayerAvatar name={r.player.full_name} teamExternalId={r.player.current_team?.external_id} size={40} photoUrl={r.player.photo_url} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{r.player.full_name}</p>
                    <p className="truncate text-xs text-[#898781]">
                      {r.player.current_team?.name ?? "—"}
                      {r.player.position && ` · ${translatePosition(r.player.position)}`}
                    </p>
                  </div>
                </Link>
                <form action={removeFromShortlist}>
                  <input type="hidden" name="playerId" value={r.player_id} />
                  <input type="hidden" name="returnTo" value="/scout/shortlist" />
                  <button type="submit" className="shrink-0 rounded-md px-2 py-1 text-xs text-[#7d7c76] hover:text-[#e66767]" title="Ta bort från shortlist">
                    ✕
                  </button>
                </form>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
