import { sportmonksGet } from "../../lib/sportmonks/client";
import { normalize } from "../../lib/football/resolve-team";
import { playerNameSimilarity } from "../../lib/football/fuzzy-name";
import { createAdminClient } from "./admin-client";
import { SPORTMONKS_SEASON_IDS, SPORTMONKS_SEASONS } from "./sportmonks-config";

/**
 * Fas 3 — den mest riskabla mappningen: fel spelaridentitet skulle blanda
 * in FEL persons statistik i Rating/DNA. Skriver ALDRIG player.sportmonks_id
 * direkt. Allt går via sportmonks_player_mapping_candidate, och BARA en
 * entydig, namn+födelsedatum-bekräftad ("hög") träff auto-godkänns. Allt
 * annat (medel/låg) hamnar som 'pending' — granskas manuellt separat, se
 * scripts/import/sportmonks-review-players.ts.
 *
 * `GET /football/squads/seasons/{season_id}/teams/{team_id}?include=player`
 * (BEKRÄFTAT denna session) ger namn + `date_of_birth` i samma anrop — ingen
 * extra spelar-hämtning behövs.
 *
 * Matchning är SCOPAD PER LAG (bara mot våra spelare som faktiskt spelat
 * för det redan Fas 1-mappade laget 2024–2026, via `statistics`) — inte en
 * global namnsökning över alla 2305 spelare i databasen. Det eliminerar de
 * flesta namnkollisionsrisker på egen hand.
 */

const FUZZY_NAME_THRESHOLD = 0.8;

interface SportmonksSquadPlayer {
  id: number;
  common_name: string;
  firstname: string;
  lastname: string;
  name: string;
  date_of_birth: string | null;
}

interface OurPlayerCandidate {
  id: number;
  full_name: string;
  birth_date: string | null;
  sportmonks_id: number | null;
}

type MatchBasis = "name_and_dob" | "name_only" | "fuzzy_name_and_dob" | "fuzzy_name";
type Confidence = "high" | "medium" | "low";

const BASIS_TO_CONFIDENCE: Record<MatchBasis, Confidence> = {
  name_and_dob: "high",
  name_only: "medium",
  fuzzy_name_and_dob: "medium",
  fuzzy_name: "low",
};

function classify(sm: SportmonksSquadPlayer, ours: OurPlayerCandidate): { basis: MatchBasis; score: number } | null {
  const nameExact = normalize(sm.name) === normalize(ours.full_name);
  const dobMatch = !!sm.date_of_birth && !!ours.birth_date && sm.date_of_birth === ours.birth_date;
  const sim = playerNameSimilarity(ours.full_name, sm);

  if (nameExact && dobMatch) return { basis: "name_and_dob", score: 1 };
  if (nameExact) return { basis: "name_only", score: 0.9 };
  if (sim >= FUZZY_NAME_THRESHOLD && dobMatch) return { basis: "fuzzy_name_and_dob", score: sim };
  if (sim >= FUZZY_NAME_THRESHOLD) return { basis: "fuzzy_name", score: sim };
  return null;
}

export async function mapSportmonksPlayers() {
  const supabase = createAdminClient();

  const { data: teams } = await supabase.from("team").select("id, name, sportmonks_id").not("sportmonks_id", "is", null);
  if (!teams || teams.length === 0) throw new Error("Inga lag har sportmonks_id — kör Fas 1 (sportmonks-map-teams) först.");

  const { data: seasons } = await supabase.from("season").select("id, year").in("year", [2024, 2025, 2026]);
  const seasonIds = (seasons ?? []).map((s) => s.id);

  // BUG UPPTÄCKT vid skarp körning (Fas 5-verifiering, 2026-08-21): ett
  // omkört map-players skrev tidigare BLINT över redan avgjorda rader
  // (approved/rejected) med status='pending' via upsert — 64 tidigare
  // godkända granskningsrader återgick till 'pending' (ingen faktisk
  // player.sportmonks_id skadades, den skrivvägen är oberoende, men
  // GRANSKNINGSHISTORIKEN gick förlorad). Skydd: hämta redan BESLUTADE par
  // en gång i förväg, hoppa över dem helt — en människa har redan avgjort,
  // rör aldrig den raden igen.
  const { data: decidedRows } = await supabase
    .from("sportmonks_player_mapping_candidate")
    .select("player_id, sportmonks_player_id")
    .in("status", ["approved", "rejected"]);
  const decidedPairs = new Set((decidedRows ?? []).map((r) => `${r.player_id}:${r.sportmonks_player_id}`));

  let totalAutoApproved = 0;
  let totalPending = 0;
  let totalNoCandidate = 0;
  let totalConflict = 0;

  for (const team of teams) {
    console.log(`\n=== ${team.name} (sportmonks_id=${team.sportmonks_id}) ===`);

    // Kandidatpool: BARA våra spelare som spelat för DET HÄR laget 2024–2026.
    const { data: statsRows } = await supabase
      .from("statistics")
      .select("player_id")
      .eq("team_id", team.id)
      .in("season_id", seasonIds)
      .gt("appearances", 0);
    const candidatePlayerIds = [...new Set((statsRows ?? []).map((r) => r.player_id))];
    if (candidatePlayerIds.length === 0) {
      console.log("  Inga aktiva spelare 2024–2026 för laget i vår databas, hoppar över.");
      continue;
    }
    const { data: candidates } = await supabase
      .from("player")
      .select("id, full_name, birth_date, sportmonks_id")
      .in("id", candidatePlayerIds);
    const ourCandidates = (candidates ?? []) as OurPlayerCandidate[];

    // Sportmonks trupp för laget, unionerad över de tre säsongerna.
    const smPlayers = new Map<number, SportmonksSquadPlayer>();
    for (const year of SPORTMONKS_SEASONS) {
      const seasonId = SPORTMONKS_SEASON_IDS[year];
      const { data } = await sportmonksGet<{ player: SportmonksSquadPlayer | null }[]>(
        `football/squads/seasons/${seasonId}/teams/${team.sportmonks_id}`,
        { include: "player" }
      );
      for (const row of data) {
        if (row.player) smPlayers.set(row.player.id, row.player);
      }
    }
    console.log(`  Sportmonks-trupp (union 3 säsonger): ${smPlayers.size}. Våra kandidater: ${ourCandidates.length}.`);

    for (const sm of smPlayers.values()) {
      const matches = ourCandidates
        .map((c) => {
          const result = classify(sm, c);
          return result ? { candidate: c, ...result } : null;
        })
        .filter((m): m is { candidate: OurPlayerCandidate; basis: MatchBasis; score: number } => m !== null);

      if (matches.length === 0) {
        totalNoCandidate++;
        continue;
      }

      // Bästa tillgängliga tier bland kandidaterna för DEN HÄR Sportmonks-spelaren.
      const bestBasis = (["name_and_dob", "name_only", "fuzzy_name_and_dob", "fuzzy_name"] as MatchBasis[]).find(
        (b) => matches.some((m) => m.basis === b)
      )!;
      const topMatches = matches.filter((m) => m.basis === bestBasis);
      const confidence = BASIS_TO_CONFIDENCE[bestBasis];
      const autoApprove = bestBasis === "name_and_dob" && topMatches.length === 1;

      for (const m of topMatches) {
        if (decidedPairs.has(`${m.candidate.id}:${sm.id}`)) continue; // redan avgjort av en manniska, rör inte

        if (m.candidate.sportmonks_id !== null && m.candidate.sportmonks_id !== sm.id) {
          console.log(
            `    ⚠ KONFLIKT: ${m.candidate.full_name} (player.id=${m.candidate.id}) har redan sportmonks_id=${m.candidate.sportmonks_id}, kan inte mappa till ${sm.id} (${sm.name}).`
          );
          totalConflict++;
          continue;
        }
        const { error: insertError } = await supabase.from("sportmonks_player_mapping_candidate").upsert(
          {
            player_id: m.candidate.id,
            sportmonks_player_id: sm.id,
            sportmonks_name: sm.name,
            team_id: team.id,
            match_basis: m.basis,
            confidence,
            score: m.score,
            status: autoApprove && topMatches.length === 1 ? "approved" : "pending",
            reviewed_by: autoApprove && topMatches.length === 1 ? "auto" : null,
            reviewed_at: autoApprove && topMatches.length === 1 ? new Date().toISOString() : null,
          },
          { onConflict: "player_id,sportmonks_player_id" }
        );
        if (insertError) throw insertError;

        if (autoApprove && topMatches.length === 1) {
          const { error: updateError } = await supabase
            .from("player")
            .update({ sportmonks_id: sm.id })
            .eq("id", m.candidate.id);
          if (updateError) throw updateError;
          totalAutoApproved++;
          console.log(`    ✓ ${sm.name} (${sm.date_of_birth}) -> ${m.candidate.full_name} (player.id=${m.candidate.id}) [hög, auto]`);
        } else {
          totalPending++;
          console.log(
            `    ? ${sm.name} (${sm.date_of_birth}) ~ ${m.candidate.full_name} (${m.candidate.birth_date}, player.id=${m.candidate.id}) [${m.basis}, ${confidence}] score=${m.score.toFixed(2)}`
          );
        }
      }
    }
  }

  console.log(`\n--- Sammanfattning ---`);
  console.log(`Auto-godkända (hög, entydig): ${totalAutoApproved}`);
  console.log(`I granskningskö (medel/låg eller flertydig hög): ${totalPending}`);
  console.log(`Ingen kandidat alls: ${totalNoCandidate}`);
  console.log(`Konflikter (spelare redan mappad till ANNAT sportmonks_id): ${totalConflict}`);
  console.log(`\nKör 'npm run import sportmonks-review-players' för att lista granskningskön.`);
}
