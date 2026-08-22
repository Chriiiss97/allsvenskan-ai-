/**
 * ENGÅNGS, READ-ONLY undersökningsscript (Player Intelligence Engine-
 * research, 2026-08-22) — hittar riktiga exempel på stora säsong-till-
 * säsong-OVR-svängningar i den redan persisterade player_season_rating,
 * särskilt de som drivs av lågt underlag (samma mönster som E. Berisha).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface Row {
  player_id: number;
  season_id: number;
  position_group: string;
  ovr: number | null;
  confidence_tier: string | null;
  own_minutes: number;
}

async function main() {
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("player_season_rating")
      .select("player_id, season_id, position_group, ovr, confidence_tier, own_minutes")
      .range(from, from + PAGE - 1)
      .returns<Row[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  console.log(`Totalt player_season_rating-rader: ${rows.length}`);

  const { data: seasons } = await supabase.from("season").select("id, year");
  const yearBySeasonId = new Map((seasons ?? []).map((s) => [s.id, s.year]));
  // Paginerad — player-tabellen har 2305 rader, samma kända Supabase-
  // 1000-radsfallgrop (upptäckt och fixad i player-intelligence-backtest.ts
  // efter att den tyst tappade E. Berisha, ett av de högre player_id-numren,
  // ur en tidigare körning av just den här sortens .select()).
  const allPlayers: { id: number; full_name: string }[] = [];
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from("player").select("id, full_name").range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allPlayers.push(...data);
      if (data.length < PAGE) break;
    }
  }
  const nameByPlayer = new Map(allPlayers.map((p) => [p.id, p.full_name]));

  // Gruppera per spelare, sortera efter år.
  const byPlayer = new Map<number, Row[]>();
  for (const r of rows) {
    if (r.ovr === null) continue;
    const arr = byPlayer.get(r.player_id) ?? [];
    arr.push(r);
    byPlayer.set(r.player_id, arr);
  }

  interface Swing {
    playerId: number;
    name: string;
    positionGroup: string;
    yearA: number;
    ovrA: number;
    minutesA: number;
    tierA: string | null;
    yearB: number;
    ovrB: number;
    minutesB: number;
    tierB: string | null;
    delta: number;
    gapYears: number;
  }
  const swings: Swing[] = [];

  for (const [playerId, playerRows] of byPlayer) {
    const sorted = playerRows
      .map((r) => ({ ...r, year: yearBySeasonId.get(r.season_id)! }))
      .filter((r) => r.year !== undefined)
      .sort((a, b) => a.year - b.year);

    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const delta = b.ovr! - a.ovr!;
      swings.push({
        playerId,
        name: nameByPlayer.get(playerId) ?? String(playerId),
        positionGroup: b.position_group,
        yearA: a.year,
        ovrA: a.ovr!,
        minutesA: a.own_minutes,
        tierA: a.confidence_tier,
        yearB: b.year,
        ovrB: b.ovr!,
        minutesB: b.own_minutes,
        tierB: b.confidence_tier,
        delta,
        gapYears: b.year - a.year,
      });
    }
  }

  console.log(`\n=== TOP 25 STÖRSTA UPPÅT-SVÄNGNINGAR (alla positioner) ===`);
  const up = [...swings].sort((a, b) => b.delta - a.delta).slice(0, 25);
  for (const s of up) {
    console.log(
      `${s.name} (${s.positionGroup}): ${s.yearA}=${s.ovrA} (${s.minutesA}min, ${s.tierA}) -> ${s.yearB}=${s.ovrB} (${s.minutesB}min, ${s.tierB})  Δ=+${s.delta} [gap ${s.gapYears}y]`
    );
  }

  console.log(`\n=== TOP 25 STÖRSTA NEDÅT-SVÄNGNINGAR (alla positioner) ===`);
  const down = [...swings].sort((a, b) => a.delta - b.delta).slice(0, 25);
  for (const s of down) {
    console.log(
      `${s.name} (${s.positionGroup}): ${s.yearA}=${s.ovrA} (${s.minutesA}min, ${s.tierA}) -> ${s.yearB}=${s.ovrB} (${s.minutesB}min, ${s.tierB})  Δ=${s.delta} [gap ${s.gapYears}y]`
    );
  }

  console.log(`\n=== Svängningar >=30p DÄR NYA säsongen har "låg" underlag (Berisha-mönstret) ===`);
  const lowConfSwings = swings.filter((s) => Math.abs(s.delta) >= 30 && s.tierB === "låg");
  console.log(`Antal: ${lowConfSwings.length} av ${swings.length} totala säsongsövergångar`);
  for (const s of lowConfSwings.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 30)) {
    console.log(
      `${s.name} (${s.positionGroup}): ${s.yearA}=${s.ovrA} (${s.minutesA}min) -> ${s.yearB}=${s.ovrB} (${s.minutesB}min, ${s.tierB})  Δ=${s.delta > 0 ? "+" : ""}${s.delta}`
    );
  }

  console.log(`\n=== Fördelning per positionsgrupp bland |Δ|>=30-svängningar ===`);
  const big = swings.filter((s) => Math.abs(s.delta) >= 30);
  const byGroup = new Map<string, number>();
  for (const s of big) byGroup.set(s.positionGroup, (byGroup.get(s.positionGroup) ?? 0) + 1);
  console.log([...byGroup.entries()]);
  console.log(`Totalt |Δ|>=30: ${big.length} av ${swings.length} (${((big.length / swings.length) * 100).toFixed(1)}%)`);

  console.log(`\n=== Korrelation: |Δ| vs minuter i NYA säsongen (grovt) ===`);
  const buckets = [
    { label: "<90min", min: 0, max: 89 },
    { label: "90-449min", min: 90, max: 449 },
    { label: "450-899min", min: 450, max: 899 },
    { label: "900+min", min: 900, max: Infinity },
  ];
  for (const b of buckets) {
    const inBucket = swings.filter((s) => s.minutesB >= b.min && s.minutesB <= b.max);
    if (inBucket.length === 0) continue;
    const avgAbsDelta = inBucket.reduce((a, s) => a + Math.abs(s.delta), 0) / inBucket.length;
    const bigCount = inBucket.filter((s) => Math.abs(s.delta) >= 30).length;
    console.log(`${b.label}: n=${inBucket.length}, snitt|Δ|=${avgAbsDelta.toFixed(1)}, |Δ|>=30: ${bigCount} (${((bigCount / inBucket.length) * 100).toFixed(1)}%)`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
