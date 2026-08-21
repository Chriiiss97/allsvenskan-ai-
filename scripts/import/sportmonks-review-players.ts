import { createAdminClient } from "./admin-client";

/**
 * Listar sportmonks_player_mapping_candidate där status='pending', sorterat
 * lag/confidence, för manuell genomgång. Skriver INGENTING — bara en läsare.
 * Godkännande/avslag görs av en människa (eller av mig, på uttrycklig
 * instruktion), rad för rad, mot verklig kunskap om spelaren — se
 * DEVELOPMENT_GUIDE.md/planens Fas 3-disciplin: ALLA medel/låg-kandidater
 * granskas, inte ett urval.
 */
export async function reviewSportmonksPlayers() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("sportmonks_player_mapping_candidate")
    .select("id, player_id, sportmonks_player_id, sportmonks_name, team_id, match_basis, confidence, score, status")
    .eq("status", "pending")
    .order("team_id")
    .order("confidence");
  if (error) throw error;
  if (!data || data.length === 0) {
    console.log("Granskningskön är tom.");
    return;
  }

  const teamIds = [...new Set(data.map((d) => d.team_id).filter((id): id is number => id !== null))];
  const { data: teams } = await supabase.from("team").select("id, name").in("id", teamIds);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));

  const playerIds = [...new Set(data.map((d) => d.player_id))];
  const { data: players } = await supabase.from("player").select("id, full_name, birth_date").in("id", playerIds);
  const playerById = new Map((players ?? []).map((p) => [p.id, p]));

  console.log(`${data.length} rader i granskningskön:\n`);
  for (const row of data) {
    const ours = playerById.get(row.player_id);
    console.log(
      `[${row.id}] lag=${teamName.get(row.team_id!) ?? "?"} | ${row.confidence}/${row.match_basis} score=${row.score?.toFixed(2)}\n` +
        `    Sportmonks: "${row.sportmonks_name}" (sm_id=${row.sportmonks_player_id})\n` +
        `    Vår:        "${ours?.full_name}" (player.id=${row.player_id}, född ${ours?.birth_date ?? "okänt"})`
    );
  }
}
