/**
 * Fas 7 (produktionsverifiering) — läser den FAKTISKT SKRIVNA
 * player_intelligence_history (från run-player-intelligence-engine.ts:s
 * backfill) och räknar om samma nyckeltal som forskningsrapporten
 * (stabilitet, sample-size-beteende, anomali-frekvens) — för att bekräfta
 * att produktionsdatan beter sig som det redan godkända backtestet.
 * Read-only.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface HistoryRow {
  player_id: number;
  position_group: string;
  kickoff_at: string;
  ovr_before: number;
  ovr_after: number;
  uncertainty_after: number;
  anomaly_flag: boolean;
}

async function loadAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1).returns<T[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  console.log("Läser player_intelligence_history (paginerat)...");
  const history = await loadAll<HistoryRow>(
    "player_intelligence_history",
    "player_id, position_group, kickoff_at, ovr_before, ovr_after, uncertainty_after, anomaly_flag"
  );
  console.log(`  ${history.length} rader.\n`);

  const byPlayer = new Map<number, HistoryRow[]>();
  for (const r of history) {
    const arr = byPlayer.get(r.player_id) ?? [];
    arr.push(r);
    byPlayer.set(r.player_id, arr);
  }
  for (const arr of byPlayer.values()) arr.sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());

  // --- 1) STABILITET: match-till-match |Δ| för etablerade spelare (>=15:e matchen och senare). ---
  console.log("=== 1) STABILITET (produktionsdata, >=15:e matchen i sekvensen) ===");
  const deltas: number[] = [];
  for (const arr of byPlayer.values()) {
    for (let i = 14; i < arr.length; i++) {
      deltas.push(Math.abs(arr[i].ovr_after - arr[i].ovr_before));
    }
  }
  deltas.sort((a, b) => a - b);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const p90 = deltas[Math.floor(deltas.length * 0.9)];
  console.log(`  KALMAN (produktion): snitt|Δ|=${mean.toFixed(2)}  p90|Δ|=${p90.toFixed(2)}  (n=${deltas.length})`);
  console.log(`  Forskningsrapportens siffra för samma test: snitt|Δ|=1.34, p90|Δ|=2.87`);
  console.log(`  Dagens system (RAW, ingen historik), för referens: snitt|Δ|=10.68, p90|Δ|=21.82`);

  // --- 2) Sample-size-beteende: osäkerhet vid N:te matchen. ---
  console.log("\n=== 2) SAMPLE-SIZE (produktionsdata) — osäkerhet vid N:te matchen ===");
  for (const n of [1, 2, 5, 10, 20]) {
    const sds: number[] = [];
    for (const arr of byPlayer.values()) {
      if (arr.length >= n) sds.push(arr[n - 1].uncertainty_after);
    }
    const avgSd = sds.reduce((a, b) => a + b, 0) / sds.length;
    console.log(`  match #${n}: snitt-osäkerhet=${avgSd.toFixed(2)}  (n=${sds.length})`);
  }

  // --- 3) Anomali-frekvens per position. ---
  console.log("\n=== 3) ANOMALI-FREKVENS per positionsgrupp ===");
  const byGroup = new Map<string, { total: number; anomalies: number }>();
  for (const r of history) {
    const g = byGroup.get(r.position_group) ?? { total: 0, anomalies: 0 };
    g.total++;
    if (r.anomaly_flag) g.anomalies++;
    byGroup.set(r.position_group, g);
  }
  for (const [g, s] of byGroup) {
    console.log(`  ${g.padEnd(11)}: ${s.anomalies}/${s.total} (${((s.anomalies / s.total) * 100).toFixed(2)}%)`);
  }

  // --- 4) Berisha-jämförelse: dagens OVR-historik vs motorns. ---
  console.log("\n=== 4) E. Berisha — dagens OVR vs Player Intelligence Engine ===");
  const { data: berisha } = await supabase.from("player").select("id").eq("full_name", "E. Berisha").maybeSingle();
  if (berisha) {
    const { data: seasonRatings } = await supabase
      .from("player_season_rating")
      .select("ovr, season:season_id(year)")
      .eq("player_id", berisha.id)
      .returns<{ ovr: number | null; season: { year: number } | null }[]>();
    console.log(`  Dagens (player_season_rating): ${(seasonRatings ?? []).sort((a, b) => (a.season?.year ?? 0) - (b.season?.year ?? 0)).map((r) => `${r.season?.year}=${r.ovr}`).join(", ")}`);
    const arr = byPlayer.get(berisha.id) ?? [];
    console.log(`  Player Intelligence Engine (senaste 3 matcher): ${arr.slice(-3).map((h) => `${h.kickoff_at.slice(0, 10)}: ${h.ovr_before.toFixed(0)}->${h.ovr_after.toFixed(0)}`).join(", ")}`);
    const last = arr[arr.length - 1];
    console.log(`  Nuvarande motor-OVR: ${last.ovr_after.toFixed(1)} ± ${last.uncertainty_after.toFixed(1)}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
