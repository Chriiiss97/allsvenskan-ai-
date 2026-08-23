/**
 * OVR v2 — sanity check.
 * =============================================================================
 * Räknar fram betygen I MINNET och skriver ut dem. Rör ALDRIG databasen.
 * Poängen är att kunna granska motorns utfall innan något skrivs — och att
 * kunna göra om det efter varje viktjustering utan att först behöva köra en
 * migration.
 *
 *   npx tsx scripts/ovr-sanity.ts [säsong]
 */

import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { createAdminClient } from "./import/admin-client";
import { CONFIG_VERSION, POSITION_GROUPS } from "../lib/ovr/config";
import { computeSeasonRatings, loadOvrDataset } from "../lib/ovr/engine";
import type { PlayerRating } from "../lib/ovr/compute";

function bar(title: string): void {
  console.log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);
}

function fmt(value: number | null, width = 5): string {
  return (value === null ? "—" : value.toFixed(1)).padStart(width);
}

async function main(): Promise<void> {
  const targetYear = Number.parseInt(process.argv[2] ?? "", 10);
  const supabase = createAdminClient();

  console.log(`OVR v2 sanity check — config ${CONFIG_VERSION}`);
  console.log("Läser in datalagret...");
  const dataset = await loadOvrDataset(supabase);
  console.log(
    `  ${dataset.matchRows.length} matchrader · ${dataset.players.size} spelare · ` +
      `${dataset.lineupAppearances.length} starter · ${dataset.careerStints.length} karriärposter`
  );

  const season = Number.isFinite(targetYear)
    ? dataset.seasons.find((s) => s.year === targetYear)
    : dataset.seasons[dataset.seasons.length - 1];
  if (!season) throw new Error("Hittar ingen säsong att räkna på.");

  console.log(`\nRäknar OVR för ${season.year}...`);
  const started = Date.now();
  const [result] = computeSeasonRatings(dataset, [season.year], new Date().toISOString());
  console.log(`  klart på ${((Date.now() - started) / 1000).toFixed(1)}s — ${result.ratings.length} spelare.`);

  const name = (id: number) => dataset.players.get(id)?.full_name ?? `#${id}`;
  const age = (id: number) => {
    const birth = dataset.players.get(id)?.birth_date;
    if (!birth) return null;
    return Math.floor((season.year * 12 - new Date(birth).getUTCFullYear() * 12) / 12);
  };

  const rated = result.ratings.filter((r) => r.ovr !== null);
  const byOvr = [...rated].sort((a, b) => (b.ovr as number) - (a.ovr as number));

  // ---------------------------------------------------------------------------
  bar(`FÖRDELNING — ${season.year}`);
  console.log(`Betygsatta spelare: ${rated.length} av ${result.ratings.length}`);
  const values = byOvr.map((r) => r.ovr as number);
  const q = (p: number) => values[Math.min(values.length - 1, Math.floor((1 - p / 100) * values.length))];
  console.log(
    `  min ${fmt(values[values.length - 1])} · p10 ${fmt(q(10))} · median ${fmt(q(50))} · ` +
      `p90 ${fmt(q(90))} · max ${fmt(values[0])}`
  );
  const buckets = new Map<number, number>();
  for (const v of values) {
    const b = Math.floor(v / 5) * 5;
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  for (const b of [...buckets.keys()].sort((a, z) => a - z)) {
    console.log(`  ${b}–${b + 4}: ${"#".repeat(Math.ceil((buckets.get(b) as number) / 2))} ${buckets.get(b)}`);
  }

  console.log("\nPer positionsgrupp:");
  for (const group of POSITION_GROUPS) {
    const inGroup = rated.filter((r) => r.position_group === group);
    if (inGroup.length === 0) continue;
    const sorted = inGroup.map((r) => r.ovr as number).sort((a, b) => b - a);
    const median = sorted[Math.floor(sorted.length / 2)];
    console.log(
      `  ${group.padEnd(3)} n=${String(inGroup.length).padStart(3)}  ` +
        `median ${fmt(median)}  spann ${fmt(sorted[sorted.length - 1])}–${fmt(sorted[0])}`
    );
  }

  // ---------------------------------------------------------------------------
  bar(`TOPP 20 — ${season.year}`);
  header();
  byOvr.slice(0, 20).forEach((r, i) => row(r, i + 1));

  // ---------------------------------------------------------------------------
  for (const group of POSITION_GROUPS) {
    const inGroup = byOvr.filter((r) => r.position_group === group);
    if (inGroup.length === 0) continue;
    bar(`TOPP 10 ${group} — ${season.year}`);
    header();
    inGroup.slice(0, 10).forEach((r, i) => row(r, i + 1));
  }

  // ---------------------------------------------------------------------------
  bar("BOUDRI — testfallet, utan någon specialregel");
  const boudri = result.ratings.filter((r) => name(r.player_id).toLowerCase().includes("boudri"));
  if (boudri.length === 0) {
    console.log(`Boudri har ingen speltid ${season.year}.`);
    for (const s of [...dataset.seasons].reverse()) {
      const [r] = computeSeasonRatings(dataset, [s.year], new Date().toISOString());
      const found = r.ratings.filter((x) => name(x.player_id).toLowerCase().includes("boudri"));
      if (found.length > 0) {
        console.log(`Senaste säsong med speltid: ${s.year}`);
        header();
        found.forEach((x, i) => row(x, i + 1));
        found.forEach(detail);
        break;
      }
    }
  } else {
    header();
    boudri.forEach((r, i) => row(r, i + 1));
    boudri.forEach(detail);
  }

  // ---------------------------------------------------------------------------
  bar("SPELARE MED FÅ MINUTER (90–450 min) — shrinkage ska bära betyget");
  const few = rated.filter((r) => r.minutes_played >= 90 && r.minutes_played <= 450)
    .sort((a, b) => b.prior_weight - a.prior_weight);
  header();
  few.slice(0, 12).forEach((r, i) => row(r, i + 1));

  // ---------------------------------------------------------------------------
  bar("HÖGST prior_weight — betyg som mest vilar på historik");
  header();
  [...rated].sort((a, b) => b.prior_weight - a.prior_weight).slice(0, 10).forEach((r, i) => row(r, i + 1));

  // ---------------------------------------------------------------------------
  bar("LÄNGST HISTORIK — flest bidragande tidigare säsonger");
  const withHistory = [...rated].sort(
    (a, b) => b.historical_evidence.contributions.length - a.historical_evidence.contributions.length
  );
  header();
  withHistory.slice(0, 10).forEach((r, i) => {
    row(r, i + 1);
    const c = r.historical_evidence.contributions
      .map((x) => `${x.seasonYear} ${x.leagueName ?? "?"} (v=${x.weight})`)
      .join(", ");
    console.log(`      historik: ${c}`);
  });

  // ---------------------------------------------------------------------------
  bar("NYLIGEN BYTT KLUBB — spelare vars första match i klubben kom under säsongen");
  const seasonStart = [...dataset.fixtures.values()]
    .filter((f) => f.seasonYear === season.year)
    .map((f) => f.kickoffAt)
    .sort()[0];
  const switched = rated.filter((r) => {
    const joined = r.historical_evidence.joined_club_date;
    if (!joined || !seasonStart) return false;
    return new Date(joined).getTime() > new Date(seasonStart).getTime() + 45 * 24 * 3600 * 1000;
  }).sort((a, b) => (b.ovr as number) - (a.ovr as number));
  console.log(`${switched.length} spelare med första match i sin klubb mer än 45 dagar in i säsongen.`);
  header();
  switched.slice(0, 12).forEach((r, i) => row(r, i + 1));

  // ---------------------------------------------------------------------------
  bar("UNGA SPELARE (21 år eller yngre)");
  const young = rated.filter((r) => {
    const a = age(r.player_id);
    return a !== null && a <= 21;
  }).sort((a, b) => (b.ovr as number) - (a.ovr as number));
  console.log(`${young.length} spelare 21 år eller yngre med speltid.`);
  header();
  young.slice(0, 12).forEach((r, i) => row(r, i + 1));

  // ---------------------------------------------------------------------------
  bar("MÅLVAKTER — alla");
  header();
  byOvr.filter((r) => r.position_group === "GK").forEach((r, i) => row(r, i + 1));

  // ---------------------------------------------------------------------------
  bar("CONFIDENCE — ytterligheterna");
  console.log("Högst:");
  header();
  [...rated].sort((a, b) => b.confidence - a.confidence).slice(0, 8).forEach((r, i) => row(r, i + 1));
  console.log("\nLägst:");
  header();
  [...rated].sort((a, b) => a.confidence - b.confidence).slice(0, 8).forEach((r, i) => row(r, i + 1));

  const tiers = { låg: 0, medel: 0, hög: 0 };
  for (const r of rated) tiers[r.confidence_tier]++;
  console.log(`\nFördelning: låg ${tiers.låg} · medel ${tiers.medel} · hög ${tiers.hög}`);

  // ---------------------------------------------------------------------------
  bar("POSITIONSBEDÖMNING — hur säker är den?");
  const fallback = result.ratings.filter((r) => r.position_confidence === 0);
  console.log(`${fallback.length} spelare saknade start i 12-månadersfönstret (player.position fick avgöra).`);
  const lowPos = result.ratings.filter((r) => r.position_confidence > 0 && r.position_confidence < 0.6);
  console.log(`${lowPos.length} spelare hade under 60 % av startminuterna i sin primärgrupp (rörliga roller).`);
  const withSecondary = result.ratings.filter((r) => r.secondary_position_group !== null);
  console.log(`${withSecondary.length} spelare fick en sekundärposition.`);

  function header(): void {
    console.log(
      "  #  spelare                        grp  OVR  säsng  hist   pot  form  konf  prior  min   delbetyg (avs/pas/dri/frs/due/mv)"
    );
  }

  function row(r: PlayerRating, rank: number): void {
    const s = r.subscores;
    console.log(
      `${String(rank).padStart(3)}. ${name(r.player_id).slice(0, 28).padEnd(28)} ` +
        `${r.position_group.padEnd(3)} ${fmt(r.ovr)} ${fmt(r.current_season_rating)} ${fmt(r.historical_rating)} ` +
        `${fmt(r.potential)} ${fmt(r.form)} ${r.confidence.toFixed(2)} ${r.prior_weight.toFixed(2)} ` +
        `${String(r.minutes_played).padStart(5)}  ` +
        `${fmt(s.finishing, 4)}/${fmt(s.passing, 4)}/${fmt(s.dribbling, 4)}/${fmt(s.defending, 4)}/${fmt(s.duels, 4)}/${fmt(s.goalkeeping, 4)}`
    );
  }

  function detail(r: PlayerRating): void {
    console.log(`\n  ${name(r.player_id)} — nedbrytning:`);
    console.log(
      `    position ${r.position_group}` +
        (r.secondary_position_group ? ` (sekundär ${r.secondary_position_group})` : "") +
        ` · positionssäkerhet ${(r.position_confidence * 100).toFixed(0)} %`
    );
    console.log(`    minuter ${r.minutes_played} · confidence ${r.confidence.toFixed(2)} (${r.confidence_tier}) · prior_weight ${r.prior_weight.toFixed(2)}`);
    console.log(`    OVR ${fmt(r.ovr)} = säsong ${fmt(r.current_season_rating)} vägt mot historik ${fmt(r.historical_rating)}`);
    console.log("    historikens bidrag:");
    for (const c of r.historical_evidence.contributions) {
      console.log(`      ${c.seasonYear} ${(c.leagueName ?? "?").padEnd(22)} koef ${c.leagueCoefficient.toFixed(2)} · ${String(c.minutes).padStart(4)} min · vikt ${c.weight} · ${c.metrics.length} mått`);
    }
    console.log("    mått (vikt · observerat → prior → justerat, percentiler):");
    for (const m of r.historical_evidence.metrics) {
      console.log(
        `      ${m.label.slice(0, 34).padEnd(34)} ${String(m.weight).padStart(3)}  ` +
          `${fmt(m.observedPercentile)} → ${fmt(m.priorPercentile)} → ${fmt(m.adjustedPercentile)}   k=${String(m.k).padStart(2)} priorandel ${(m.priorShare * 100).toFixed(0)} %`
      );
    }
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
