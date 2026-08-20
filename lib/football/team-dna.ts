import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { resolveTeam } from "./resolve-team";
import { getTeamSeasonRollup, getLeagueSeasonAverages, type TeamSeasonRollup, type LeagueSeasonAverages } from "./team-rollup";
import { getTeamMostCommonFormation } from "./lineup-role";

type Supabase = SupabaseClient<Database>;

/**
 * PRODUCT-lager (steg 9): Team DNA — samma grundprincip som Player DNA
 * (lib/football/player-dna.ts): aldrig ett påhittat tal, ett `available: false`
 * med en ärlig anledning istället för nollor när underlag saknas. Byggd
 * ovanpå steg 8:s rena beräkningsfunktioner (team-rollup.ts, lineup-role.ts)
 * — 0 nya API-anrop.
 *
 * Enklare än Player DNA med avsikt: ingen percentil/radar här, bara raka
 * lag-mot-ligasnitt-jämförelser (samma stil som teams/compare-sidans redan
 * etablerade `buildInsights`) — Team DNA:s "peer-pool" är redan hela ligan i
 * en enda siffra (ligasnittet), inte en fördelning att percentilrangordna
 * mot.
 */

export interface TeamDNA {
  available: boolean;
  unavailableReason: string | null;
  team: { id: number; name: string } | null;
  own: TeamSeasonRollup | null;
  leagueAverage: LeagueSeasonAverages | null;
  mostCommonFormation: string | null;
  insights: string[];
}

function unavailable(reason: string): TeamDNA {
  return { available: false, unavailableReason: reason, team: null, own: null, leagueAverage: null, mostCommonFormation: null, insights: [] };
}

// Bara nämn skillnader stora nog att vara meningsfulla, inte brus från ett
// enskilt lags naturliga match-till-match-variation.
const MEANINGFUL_DIFF = {
  possessionPct: 3,
  shotsTotal: 2,
  expectedGoals: 0.3,
};

function buildTeamInsights(teamName: string, own: TeamSeasonRollup, league: LeagueSeasonAverages): string[] {
  const insights: string[] = [];

  if (own.possessionPct !== null && league.possessionPct !== null) {
    const diff = own.possessionPct - league.possessionPct;
    if (Math.abs(diff) >= MEANINGFUL_DIFF.possessionPct) {
      insights.push(
        `${teamName} har ${diff > 0 ? "högre" : "lägre"} bollinnehav än ligasnittet (${own.possessionPct}% mot ${league.possessionPct}%).`
      );
    }
  }

  if (own.expectedGoals !== null && league.expectedGoals !== null) {
    const diff = own.expectedGoals - league.expectedGoals;
    if (Math.abs(diff) >= MEANINGFUL_DIFF.expectedGoals) {
      insights.push(
        `${teamName} skapar ${diff > 0 ? "mer" : "mindre"} målchanser per match än ligasnittet (${own.expectedGoals} xG mot ${league.expectedGoals}).`
      );
    }
  }

  if (own.shotsTotal !== null && league.shotsTotal !== null) {
    const diff = own.shotsTotal - league.shotsTotal;
    if (Math.abs(diff) >= MEANINGFUL_DIFF.shotsTotal) {
      insights.push(
        `${teamName} skjuter ${diff > 0 ? "fler" : "färre"} skott per match än ligasnittet (${own.shotsTotal} mot ${league.shotsTotal}).`
      );
    }
  }

  return insights;
}

export async function getTeamDNA(supabase: Supabase, params: { team: string; season: number }): Promise<TeamDNA> {
  const resolved = await resolveTeam(supabase, params.team);
  if (!resolved) return unavailable(`Okänt lag: "${params.team}".`);

  const { data: seasonRow } = await supabase.from("season").select("id").eq("year", params.season).maybeSingle();
  if (!seasonRow) return unavailable("Ingen data för den säsongen.");

  const own = await getTeamSeasonRollup(supabase, { teamId: resolved.id, seasonId: seasonRow.id });
  if (!own) return unavailable(`Ingen lagstatistik importerad för ${resolved.name} den säsongen.`);

  const leagueAverage = await getLeagueSeasonAverages(supabase, seasonRow.id);
  const mostCommonFormation = await getTeamMostCommonFormation(supabase, { teamId: resolved.id, seasonId: seasonRow.id });
  const insights = leagueAverage ? buildTeamInsights(resolved.name, own, leagueAverage) : [];

  return {
    available: true,
    unavailableReason: null,
    team: { id: resolved.id, name: resolved.name },
    own,
    leagueAverage,
    mostCommonFormation,
    insights,
  };
}
