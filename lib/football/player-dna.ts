import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * "Player DNA" — fem kategoriserade betyg (0–100) beräknade som PERCENTIL
 * mot samma spelarpool vi redan använder för ligasnittet (IFK+AIK, samma
 * liga+säsong, minutes_played > 0) — inte ett påhittat "form"-index.
 *
 * Percentil = andelen peers (i procent) med lägre-eller-lika värde på
 * måttet. Kategorins poäng = medelvärdet av de underliggande mått som
 * FAKTISKT finns för spelaren. Saknas ALLA mått i en kategori blir
 * poängen `null` ("Ej tillgängligt") — ALDRIG 0, eftersom 0 skulle
 * påstå "sämst i truppen" när det egentligen betyder "vi vet inte".
 */
export interface PlayerDNACategory {
  score: number | null;
  basis: string[]; // vilka underliggande mått poängen faktiskt bygger på
}

export interface PlayerDNA {
  offensive: PlayerDNACategory;
  creation: PlayerDNACategory;
  passing: PlayerDNACategory;
  duels: PlayerDNACategory;
  defense: PlayerDNACategory;
}

interface PeerStatRow {
  player_id: number;
  minutes_played: number;
  goals: number;
  shots_total: number | null;
  assists: number;
  passes_key: number | null;
  passes_total: number | null;
  passes_accuracy: number | null;
  duels_won: number | null;
  duels_total: number | null;
  tackles_total: number | null;
  tackles_interceptions: number | null;
}

function per90(value: number | null, minutes: number): number | null {
  if (value === null || minutes <= 0) return null;
  return (value / minutes) * 90;
}

function duelsWinRate(row: PeerStatRow): number | null {
  if (!row.duels_total || row.duels_total <= 0 || row.duels_won === null) return null;
  return (row.duels_won / row.duels_total) * 100;
}

function percentile(value: number, peerValues: number[]): number {
  const countLessOrEqual = peerValues.filter((v) => v <= value).length;
  return Math.round((countLessOrEqual / peerValues.length) * 100);
}

function categoryScore(
  metrics: { label: string; playerValue: number | null; peerValues: number[] }[]
): PlayerDNACategory {
  const usable = metrics.filter((m) => m.playerValue !== null && m.peerValues.length > 0);
  if (usable.length === 0) return { score: null, basis: [] };
  const scores = usable.map((m) => percentile(m.playerValue as number, m.peerValues));
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { score: avg, basis: usable.map((m) => m.label) };
}

function emptyDNA(): PlayerDNA {
  const empty: PlayerDNACategory = { score: null, basis: [] };
  return { offensive: empty, creation: empty, passing: empty, duels: empty, defense: empty };
}

export async function computePlayerDNA(
  supabase: Supabase,
  params: { playerId: number; season: number }
): Promise<PlayerDNA> {
  const { data: seasonRow } = await supabase
    .from("season")
    .select("id, league_id")
    .eq("year", params.season)
    .maybeSingle();
  if (!seasonRow) return emptyDNA();

  const { data: rows } = await supabase
    .from("statistics")
    .select(
      "player_id, minutes_played, goals, shots_total, assists, passes_key, passes_total, passes_accuracy, duels_won, duels_total, tackles_total, tackles_interceptions"
    )
    .eq("season_id", seasonRow.id)
    .eq("league_id", seasonRow.league_id)
    .gt("minutes_played", 0)
    .returns<PeerStatRow[]>();

  const allRows = rows ?? [];
  const player = allRows.find((r) => r.player_id === params.playerId);
  if (!player) return emptyDNA();

  // Percentil beräknas mot ÖVRIGA spelare i poolen, inte inklusive
  // spelaren själv.
  const peers = allRows.filter((r) => r.player_id !== params.playerId);

  const peerPer90 = (key: keyof PeerStatRow) =>
    peers.map((p) => per90(p[key] as number | null, p.minutes_played)).filter((v): v is number => v !== null);
  const playerPer90 = (key: keyof PeerStatRow) => per90(player[key] as number | null, player.minutes_played);
  const peerAccuracy = peers.map((p) => p.passes_accuracy).filter((v): v is number => v !== null);
  const peerDuelsWinRate = peers.map(duelsWinRate).filter((v): v is number => v !== null);

  return {
    offensive: categoryScore([
      { label: "Mål", playerValue: playerPer90("goals"), peerValues: peerPer90("goals") },
      { label: "Skott", playerValue: playerPer90("shots_total"), peerValues: peerPer90("shots_total") },
    ]),
    creation: categoryScore([
      { label: "Assist", playerValue: playerPer90("assists"), peerValues: peerPer90("assists") },
      { label: "Nyckelpassningar", playerValue: playerPer90("passes_key"), peerValues: peerPer90("passes_key") },
    ]),
    passing: categoryScore([
      { label: "Passningar", playerValue: playerPer90("passes_total"), peerValues: peerPer90("passes_total") },
      { label: "Passningssäkerhet", playerValue: player.passes_accuracy, peerValues: peerAccuracy },
    ]),
    duels: categoryScore([
      { label: "Vunna dueller", playerValue: playerPer90("duels_won"), peerValues: peerPer90("duels_won") },
      { label: "Vinstprocent", playerValue: duelsWinRate(player), peerValues: peerDuelsWinRate },
    ]),
    defense: categoryScore([
      { label: "Tacklingar", playerValue: playerPer90("tackles_total"), peerValues: peerPer90("tackles_total") },
      {
        label: "Interceptions",
        playerValue: playerPer90("tackles_interceptions"),
        peerValues: peerPer90("tackles_interceptions"),
      },
    ]),
  };
}
