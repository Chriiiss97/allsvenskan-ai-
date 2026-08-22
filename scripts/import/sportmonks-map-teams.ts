import { sportmonksGet } from "../../lib/sportmonks/client";
import type { SportmonksTeam } from "../../lib/sportmonks/types";
import { normalize } from "../../lib/football/resolve-team";
import { createAdminClient } from "./admin-client";
import { SPORTMONKS_SEASON_IDS, SPORTMONKS_SEASONS } from "./sportmonks-config";

/**
 * Mappar team.sportmonks_id för de lag som faktiskt förekommit i Allsvenskan
 * 2024–2026 hos Sportmonks — BEKRÄFTAT via riktiga anrop denna session:
 * `GET /football/teams/seasons/{season_id}` ger 16 lag/säsong, unionen över
 * alla tre säsonger är 19 DISTINKTA lag (inte 33 — vår databas har hela
 * 2016–2026-poolen, Sportmonks täcker bara tre av de säsongerna, så färre
 * unika lag är det FÖRVÄNTADE resultatet, inte ett tecken på ett fel).
 *
 * Matchning återanvänder normalize() från resolve-team.ts (samma
 * diakritik-strippning som redan är beprövad för svenska klubbnamn), men
 * bygger en EGEN, striktare kandidat-räknande matchning istället för att
 * återanvända resolveTeam()s "returnera första träff"-beteende — vi vill
 * INTE auto-mappa något som har fler än en möjlig kandidat, även om det
 * skulle råka vara sällsynt med bara 33 rader.
 *
 * Skriver BARA team.sportmonks_id vid en ENTYDIG träff. Allt annat listas i
 * konsolen för manuell granskning (19 rader — görs för hand, ingen
 * automatisk fallback-gissning).
 */

interface Candidate {
  id: number;
  name: string;
  sportmonks_id: number | null;
}

function findCandidates(sportmonksName: string, teams: Candidate[]): Candidate[] {
  const needle = normalize(sportmonksName);

  const exact = teams.filter((t) => normalize(t.name) === needle);
  if (exact.length > 0) return exact;

  // Dubbelriktad delsträngsmatchning: "AIK" (Sportmonks) ska hitta
  // "AIK Stockholm" (vår databas), OCH ett omvänt fall ska också fångas om
  // det någonsin uppstår.
  return teams.filter((t) => {
    const hay = normalize(t.name);
    return hay.includes(needle) || needle.includes(hay);
  });
}

export async function mapSportmonksTeams() {
  const supabase = createAdminClient();

  console.log("Hämtar Sportmonks-lag för Allsvenskan 2024–2026...");
  const bySportmonksId = new Map<number, SportmonksTeam>();
  for (const year of SPORTMONKS_SEASONS) {
    const seasonId = SPORTMONKS_SEASON_IDS[year];
    const { data } = await sportmonksGet<SportmonksTeam[]>(`football/teams/seasons/${seasonId}`);
    for (const t of data) bySportmonksId.set(t.id, t);
  }
  const sportmonksTeams = [...bySportmonksId.values()];
  console.log(`  ${sportmonksTeams.length} distinkta lag hittade (union av 3 säsonger).`);

  const { data: ourTeams, error } = await supabase.from("team").select("id, name, sportmonks_id");
  if (error || !ourTeams) throw error ?? new Error("Kunde inte hämta team-tabellen.");

  let mapped = 0;
  let alreadyMapped = 0;
  const unresolved: { sportmonksId: number; name: string; reason: string }[] = [];

  for (const sm of sportmonksTeams) {
    const candidates = findCandidates(sm.name, ourTeams);

    if (candidates.length === 1) {
      const target = candidates[0];
      if (target.sportmonks_id === sm.id) {
        alreadyMapped++;
        console.log(`  = ${sm.name} (${sm.id}) redan mappad -> team.id=${target.id}`);
        continue;
      }
      if (target.sportmonks_id !== null) {
        unresolved.push({
          sportmonksId: sm.id,
          name: sm.name,
          reason: `team.id=${target.id} har redan ett ANNAT sportmonks_id (${target.sportmonks_id}) — skrivs inte över, granska manuellt.`,
        });
        continue;
      }
      const { error: updateError } = await supabase.from("team").update({ sportmonks_id: sm.id }).eq("id", target.id);
      if (updateError) throw updateError;
      mapped++;
      console.log(`  ✓ ${sm.name} (${sm.id}) -> team.id=${target.id} (${target.name})`);
    } else if (candidates.length === 0) {
      unresolved.push({ sportmonksId: sm.id, name: sm.name, reason: "Ingen kandidat hittad." });
    } else {
      unresolved.push({
        sportmonksId: sm.id,
        name: sm.name,
        reason: `${candidates.length} möjliga kandidater: ${candidates.map((c) => `${c.name} (id=${c.id})`).join(", ")}`,
      });
    }
  }

  console.log(`\n--- Sammanfattning ---`);
  console.log(`Nymappade: ${mapped}`);
  console.log(`Redan mappade (oförändrat): ${alreadyMapped}`);
  console.log(`Ej mappade (kräver manuell granskning): ${unresolved.length}`);
  for (const u of unresolved) {
    console.log(`  ✗ ${u.name} (sportmonks_id=${u.sportmonksId}): ${u.reason}`);
  }
}
