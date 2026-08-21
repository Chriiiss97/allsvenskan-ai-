import { sportmonksGet } from "../../lib/sportmonks/client";
import { createAdminClient } from "./admin-client";
import { SPORTMONKS_SEASON_IDS, SPORTMONKS_SEASONS } from "./sportmonks-config";

/**
 * Mappar fixture.sportmonks_id för 2024–2026-matcher, scopat till lag som
 * redan är mappade i Fas 1 (team.sportmonks_id).
 *
 * `GET /football/schedules/seasons/{id}` returnerar (BEKRÄFTAT denna
 * session, INGET include behövs — endpointen tillåter "0 nested includes")
 * redan fulla fixture-objekt med en inbäddad `participants`-array
 * (`meta.location` = 'home'/'away', lag-id + namn) OCH en `scores`-array
 * (type_id 1525 = "CURRENT", slutresultat) — allt i ETT anrop per säsong,
 * ingen per-match-hämtning behövs för själva mappningen.
 *
 * Matchning: exakt samma lagpar (hemma=hemma, borta=borta — INTE en
 * ospecificerad ihopparning) OCH kickoff inom ±90 minuter (tolerans för
 * mindre tidsskillnader mellan källorna). 0 eller >1 kandidat -> loggas för
 * granskning, skrivs inte.
 */

const TIME_TOLERANCE_MS = 90 * 60 * 1000;
const CURRENT_SCORE_TYPE_ID = 1525;

interface SportmonksScheduleFixture {
  id: number;
  starting_at: string;
  state_id: number;
  participants?: {
    id: number;
    name: string;
    meta?: { location?: "home" | "away" };
  }[];
  scores?: {
    type_id: number;
    participant_id: number;
    score: { goals: number; participant: "home" | "away" };
    description: string;
  }[];
}

function collectFixtures(node: unknown, out: SportmonksScheduleFixture[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) collectFixtures(n, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.starting_at && obj.state_id !== undefined && obj.id) {
    out.push(obj as unknown as SportmonksScheduleFixture);
  }
  for (const key of Object.keys(obj)) {
    if (key === "id" || key === "starting_at") continue;
    if (typeof obj[key] === "object") collectFixtures(obj[key], out);
  }
}

function extractTeams(f: SportmonksScheduleFixture): { homeId: number; awayId: number } | null {
  const home = f.participants?.find((p) => p.meta?.location === "home");
  const away = f.participants?.find((p) => p.meta?.location === "away");
  if (!home || !away) return null;
  return { homeId: home.id, awayId: away.id };
}

function extractCurrentScore(f: SportmonksScheduleFixture): { home: number | null; away: number | null } {
  const rows = (f.scores ?? []).filter((s) => s.type_id === CURRENT_SCORE_TYPE_ID);
  const home = rows.find((r) => r.score.participant === "home")?.score.goals ?? null;
  const away = rows.find((r) => r.score.participant === "away")?.score.goals ?? null;
  return { home, away };
}

export async function mapSportmonksFixtures() {
  const supabase = createAdminClient();

  console.log("Hämtar Sportmonks-scheman för 2024–2026...");
  const smFixtures: SportmonksScheduleFixture[] = [];
  for (const year of SPORTMONKS_SEASONS) {
    const seasonId = SPORTMONKS_SEASON_IDS[year];
    const { data } = await sportmonksGet<unknown>(`football/schedules/seasons/${seasonId}`);
    const out: SportmonksScheduleFixture[] = [];
    collectFixtures(data, out);
    console.log(`  ${year}: ${out.length} matcher`);
    smFixtures.push(...out);
  }

  // Season.id -> year, för att filtrera våra fixtures till 2024-2026.
  const { data: seasons } = await supabase.from("season").select("id, year").in("year", [2024, 2025, 2026]);
  const seasonIds = (seasons ?? []).map((s) => s.id);

  const { data: ourFixtures, error } = await supabase
    .from("fixture")
    .select("id, season_id, kickoff_at, status, home_score, away_score, sportmonks_id, home_team_id, away_team_id")
    .in("season_id", seasonIds);
  if (error || !ourFixtures) throw error ?? new Error("Kunde inte hämta fixture-tabellen.");

  const { data: teams } = await supabase.from("team").select("id, name, sportmonks_id");
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));

  let mapped = 0;
  let alreadyMapped = 0;
  const unresolved: { fixtureId: number; reason: string }[] = [];
  const mappedSamples: {
    ours: { id: number; kickoff: string; home: string; away: string; score: string };
    sm: { id: number; kickoff: string; score: string };
  }[] = [];

  for (const f of ourFixtures) {
    if (f.sportmonks_id !== null) {
      alreadyMapped++;
      continue;
    }
    const homeTeam = teamById.get(f.home_team_id);
    const awayTeam = teamById.get(f.away_team_id);
    if (!homeTeam?.sportmonks_id || !awayTeam?.sportmonks_id) {
      unresolved.push({ fixtureId: f.id, reason: "Ett eller båda lagen saknar sportmonks_id (Fas 1)." });
      continue;
    }

    const kickoff = new Date(f.kickoff_at).getTime();
    const candidates = smFixtures.filter((sm) => {
      const teamsMatch = extractTeams(sm);
      if (!teamsMatch) return false;
      if (teamsMatch.homeId !== homeTeam.sportmonks_id || teamsMatch.awayId !== awayTeam.sportmonks_id) return false;
      const smKickoff = new Date(sm.starting_at.replace(" ", "T") + "Z").getTime();
      return Math.abs(smKickoff - kickoff) <= TIME_TOLERANCE_MS;
    });

    if (candidates.length === 1) {
      const sm = candidates[0];
      const { error: updateError } = await supabase.from("fixture").update({ sportmonks_id: sm.id }).eq("id", f.id);
      if (updateError) throw updateError;
      mapped++;
      if (mappedSamples.length < 20) {
        const smScore = extractCurrentScore(sm);
        mappedSamples.push({
          ours: {
            id: f.id,
            kickoff: f.kickoff_at,
            home: homeTeam.name,
            away: awayTeam.name,
            score: `${f.home_score ?? "?"}-${f.away_score ?? "?"}`,
          },
          sm: { id: sm.id, kickoff: sm.starting_at, score: `${smScore.home ?? "?"}-${smScore.away ?? "?"}` },
        });
      }
    } else if (candidates.length === 0) {
      unresolved.push({ fixtureId: f.id, reason: `Ingen Sportmonks-matchning (${homeTeam.name} vs ${awayTeam.name}, ${f.kickoff_at}).` });
    } else {
      unresolved.push({
        fixtureId: f.id,
        reason: `${candidates.length} kandidater (${homeTeam.name} vs ${awayTeam.name}, ${f.kickoff_at}): ${candidates.map((c) => `sm_id=${c.id}@${c.starting_at}`).join(", ")}`,
      });
    }
  }

  console.log(`\n--- Sammanfattning ---`);
  console.log(`Nymappade: ${mapped}`);
  console.log(`Redan mappade (oförändrat): ${alreadyMapped}`);
  console.log(`Ej mappade: ${unresolved.length}`);
  console.log(`\n--- Stickprov för manuell granskning (${mappedSamples.length} st) ---`);
  for (const s of mappedSamples) {
    console.log(
      `  Vår: #${s.ours.id} ${s.ours.home} vs ${s.ours.away} @ ${s.ours.kickoff} — resultat ${s.ours.score}`
    );
    console.log(`  SM:  #${s.sm.id} @ ${s.sm.kickoff} — resultat ${s.sm.score}\n`);
  }
  if (unresolved.length > 0) {
    console.log(`--- Ej mappade (${unresolved.length}) ---`);
    for (const u of unresolved.slice(0, 30)) {
      console.log(`  ✗ fixture #${u.fixtureId}: ${u.reason}`);
    }
    if (unresolved.length > 30) console.log(`  ... och ${unresolved.length - 30} till.`);
  }
}
