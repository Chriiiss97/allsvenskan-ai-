/**
 * Datakontroll: vilken karriärhistorik finns, och vilken använder OVR-motorn?
 *
 * Läser ENBART. Ändrar ingen kod och skriver inget till databasen. Går via
 * exakt samma väg som motorn (loadOvrDataset + samma urvalsregler), så att
 * svaret gäller den riktiga körningen och inte en förenklad kopia av den.
 *
 *   npx tsx scripts/ovr-history-audit.ts <namnfragment> [säsong]
 */

import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { createAdminClient } from "./import/admin-client";
import { SEASON_WEIGHTS, PRIOR_FULL_WEIGHT_MINUTES, leagueUsability, type MetricKey } from "../lib/ovr/config";
import { computeSeasonRatings, loadOvrDataset, type OvrDataset } from "../lib/ovr/engine";
import { foreignStintMetrics } from "../lib/ovr/metrics";

function bar(t: string): void {
  console.log(`\n${"-".repeat(76)}\n${t}\n${"-".repeat(76)}`);
}

async function main(): Promise<void> {
  const fragment = (process.argv[2] ?? "boudri").toLowerCase();
  const targetYear = Number.parseInt(process.argv[3] ?? "", 10);
  const supabase = createAdminClient();

  const dataset = await loadOvrDataset(supabase);
  const season = Number.isFinite(targetYear)
    ? dataset.seasons.find((s) => s.year === targetYear)
    : dataset.seasons[dataset.seasons.length - 1];
  if (!season) throw new Error("ingen säsong");

  const matches = [...dataset.players.values()].filter((p) => p.full_name.toLowerCase().includes(fragment));
  if (matches.length === 0) {
    console.log(`Ingen spelare matchar "${fragment}".`);
    return;
  }

  const [result] = computeSeasonRatings(dataset, [season.year], new Date().toISOString());

  for (const player of matches) {
    console.log(`\n${"=".repeat(76)}`);
    console.log(`${player.full_name}  (player_id ${player.id}, född ${player.birth_date ?? "okänt"})`);
    console.log(`Betygssäsong: ${season.year}`);
    console.log("=".repeat(76));

    audit(dataset, player.id, season.year);

    const rating = result.ratings.find((r) => r.player_id === player.id);
    bar("5. SLUTLIG PRIOR PER MÄTVÄRDE (efter ligakoefficient och tidsviktning)");
    if (!rating) {
      console.log(`Ingen speltid i Allsvenskan ${season.year} — motorn producerar inget betyg för den säsongen.`);
      continue;
    }
    console.log(
      `OVR ${rating.ovr} · säsong ${rating.current_season_rating} · historik ${rating.historical_rating} · ` +
        `prior_weight ${rating.prior_weight} · confidence ${rating.confidence} (${rating.confidence_tier}) · ` +
        `${rating.minutes_played} min · position ${rating.position_group}`
    );
    console.log("\n  mätvärde                             vikt  observerat    prior   justerat");
    for (const m of rating.historical_evidence.metrics) {
      const f = (x: number | null) => (x === null ? "     —" : x.toFixed(1).padStart(6));
      console.log(
        `  ${m.label.slice(0, 34).padEnd(34)} ${String(m.weight).padStart(4)}  ${f(m.observedPercentile)}   ${f(m.priorPercentile)}   ${f(m.adjustedPercentile)}`
      );
    }
    console.log("\n  Bidragande historik enligt motorn:");
    if (rating.historical_evidence.contributions.length === 0) {
      console.log("    (ingen)");
    }
    for (const c of rating.historical_evidence.contributions) {
      console.log(
        `    ${c.seasonYear}  ${(c.leagueName ?? "?").padEnd(26)} koef ${c.leagueCoefficient.toFixed(2)}  ` +
          `${String(c.minutes).padStart(5)} min  vikt ${c.weight}  ${c.metrics.length} mått`
      );
    }
  }
}

function audit(dataset: OvrDataset, playerId: number, ratingSeason: number): void {
  // ---------------------------------------------------------------------------
  bar("1. ALL HISTORIK SOM FINNS I DATALAGRET");

  console.log("A) Allsvenskan (fixture_player_stats — full statistik):");
  const allsvenskanBySeason = new Map<number, { minutes: number; matches: number; clubs: Set<number> }>();
  for (const row of dataset.matchRows) {
    if (row.player_id !== playerId) continue;
    const fx = dataset.fixtures.get(row.fixture_id);
    if (!fx || (row.minutes_played ?? 0) <= 0) continue;
    const slot = allsvenskanBySeason.get(fx.seasonYear) ?? { minutes: 0, matches: 0, clubs: new Set<number>() };
    slot.minutes += row.minutes_played ?? 0;
    slot.matches += 1;
    slot.clubs.add(row.team_id);
    allsvenskanBySeason.set(fx.seasonYear, slot);
  }
  if (allsvenskanBySeason.size === 0) console.log("   (ingen)");
  for (const year of [...allsvenskanBySeason.keys()].sort()) {
    const s = allsvenskanBySeason.get(year) as { minutes: number; matches: number; clubs: Set<number> };
    console.log(`   ${year}  ${String(s.matches).padStart(2)} matcher  ${String(s.minutes).padStart(5)} min  klubb-id ${[...s.clubs].join(", ")}`);
  }

  console.log("\nB) Utanför Allsvenskan (player_career_stint — bara mål/assist/minuter/kort):");
  const stints = dataset.careerStints
    .filter((s) => s.player_id === playerId)
    .sort((a, b) => a.season_year - b.season_year);
  if (stints.length === 0) console.log("   (ingen)");
  for (const s of stints) {
    console.log(
      `   ${s.season_year}  ${s.league_name.padEnd(32)} liga-id ${String(s.league_external_id).padStart(5)}  ` +
        `${String(s.minutes_played ?? 0).padStart(5)} min  ${s.goals ?? 0} mål  ${s.assists ?? 0} assist`
    );
  }

  // ---------------------------------------------------------------------------
  bar("2 & 3. VAD MOTORN ANVÄNDER — OCH VAD DEN UTESLUTER, MED SKÄL");

  console.log(`Fönstret för prior: säsong ${ratingSeason - SEASON_WEIGHTS.length} till ${ratingSeason - 1}.`);
  console.log(`Tidsvikter: ${SEASON_WEIGHTS.map((w, i) => `${ratingSeason - 1 - i}=${w}`).join("  ")}`);
  console.log(`Minutvikt: full vikt vid ${PRIOR_FULL_WEIGHT_MINUTES} min, linjärt nedskalad under det.\n`);

  console.log("Allsvenskan:");
  for (const year of [...allsvenskanBySeason.keys()].sort()) {
    const s = allsvenskanBySeason.get(year) as { minutes: number };
    const back = ratingSeason - year;
    if (back === 0) {
      console.log(`   ${year}  UTESLUTS ur prior — det ÄR säsongen som betygsätts (observerat, inte historik).`);
    } else if (back < 0) {
      console.log(`   ${year}  UTESLUTS — ligger i framtiden relativt betygssäsongen.`);
    } else if (back > SEASON_WEIGHTS.length) {
      console.log(`   ${year}  UTESLUTS — ${back} säsonger bakåt, äldre än fönstret (max ${SEASON_WEIGHTS.length}).`);
    } else {
      const recency = SEASON_WEIGHTS[back - 1];
      const minuteWeight = Math.min(1, s.minutes / PRIOR_FULL_WEIGHT_MINUTES);
      console.log(
        `   ${year}  ANVÄNDS — tidsvikt ${recency} x minutvikt ${minuteWeight.toFixed(3)} ` +
          `(${s.minutes}/${PRIOR_FULL_WEIGHT_MINUTES}) = ${(recency * minuteWeight).toFixed(3)}`
      );
    }
  }

  console.log("\nUtanför Allsvenskan:");
  for (const s of stints) {
    const back = ratingSeason - s.season_year;
    const usability = leagueUsability(s.league_external_id);
    const coefficient = usability.coefficient ?? 0;
    const label = `   ${s.season_year}  ${s.league_name.slice(0, 30).padEnd(30)}`;

    if (!usability.usable) {
      const why = {
        cup: "cupturnering (blandar divisioner, säger inget om nivå)",
        friendly: "träningsmatch, inte tävlingsspel",
        youth: "ungdoms-/reservserie, en annan population",
        no_coefficient: "seriespel UTAN verifierad ligakoefficient — markerad som ovärderbar, inte gissad",
        unknown_league: "okänt liga-id, finns inte i ligaregistret",
        ok: "",
      }[usability.reason];
      console.log(`${label} UTESLUTS — ${why}.`);
      continue;
    }
    if (back === 0) {
      console.log(`${label} UTESLUTS — SAMMA SÄSONG som betygsätts. Motorn läser bara TIDIGARE säsonger som historik.`);
      continue;
    }
    if (back < 0) {
      console.log(`${label} UTESLUTS — ligger i framtiden relativt betygssäsongen.`);
      continue;
    }
    if (back > SEASON_WEIGHTS.length) {
      console.log(`${label} UTESLUTS — ${back} säsonger bakåt, äldre än fönstret.`);
      continue;
    }
    const metrics = foreignStintMetrics(s);
    const keys = Object.keys(metrics) as MetricKey[];
    if (keys.length === 0) {
      console.log(`${label} UTESLUTS — 0 spelade minuter registrerade, inget att räkna per 90 på.`);
      continue;
    }
    const recency = SEASON_WEIGHTS[back - 1];
    const minuteWeight = Math.min(1, (s.minutes_played ?? 0) / PRIOR_FULL_WEIGHT_MINUTES);
    console.log(
      `${label} ANVÄNDS — koef ${coefficient.toFixed(2)} · tidsvikt ${recency} x minutvikt ${minuteWeight.toFixed(3)} ` +
        `= ${(recency * minuteWeight).toFixed(3)} · täcker ${keys.length} mått (${keys.join(", ")})`
    );
  }

  // ---------------------------------------------------------------------------
  bar("4. TÄCKNINGSGRAD: hur många mått kan en utländsk säsong ens bidra med?");
  console.log("player_career_stint har bara: matcher, startelvor, minuter, mål, assist, kort, betyg.");
  console.log("Det räcker till 4 av motorns 22 mätvärden:");
  console.log("  goals_per90, assists_per90, goal_contributions_per90, cards_per90");
  console.log("Saknas för utländska ligor: dueller, passningar, tacklingar, brytningar, dribblingar,");
  console.log("skott, räddningar. Det är källans gräns (api-football /players?id&team&season),");
  console.log("inte ett importfel — se scripts/import/import-player-career.ts.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
