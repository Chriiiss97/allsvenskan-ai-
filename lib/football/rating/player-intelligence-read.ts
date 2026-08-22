import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { OVR_DISPLAY_CAP } from "./player-intelligence-params";

type Supabase = SupabaseClient<Database>;

/**
 * ============================================================================
 * Player Intelligence Engine — läsväg för UI (shadow mode)
 * ============================================================================
 * Ren läsning av player_intelligence_state/-_history — SKRIVER ALDRIG,
 * ändrar ALDRIG dagens OVR. Om ingen state finns än (migrationen/
 * backfillen inte körd, eller spelaren aldrig haft en kvalificerande
 * match) returneras null — anroparen döljer sektionen helt, aldrig en tom
 * platshållare (samma princip som resten av Scout redan följer).
 */
export interface PlayerIntelligenceSnapshot {
  /** Kalman-mean, avrundad och capad vid 99 för visning (samma cap som dagens OVR). */
  ovr: number;
  /** ± detta, ett genuint statistiskt mått (Kalman-standardavvikelse), inte en kosmetisk badge. */
  uncertaintySd: number;
  /** Senaste enskilda matchens råa Performance (0–100) — "vad visade spelaren NU", skilt från OVR. Null om historikraden saknar ett värde (ska inte kunna hända om state finns, men typad ärligt). */
  latestPerformance: number | null;
  /** Totalt antal minuter motorn faktiskt haft ett Performance-värde för — "evidens". */
  evidenceMinutes: number;
  observationCount: number;
  lastKickoffAt: string | null;
  modelVersion: string;
}

export async function getPlayerIntelligenceSnapshot(supabase: Supabase, playerId: number): Promise<PlayerIntelligenceSnapshot | null> {
  const { data: state, error: stateError } = await supabase
    .from("player_intelligence_state")
    .select("ovr, uncertainty_sd, observation_count, last_kickoff_at, model_version")
    .eq("player_id", playerId)
    .maybeSingle();
  if (stateError) throw stateError;
  if (!state) return null;

  const { data: history, error: historyError } = await supabase
    .from("player_intelligence_history")
    .select("performance, minutes_played, kickoff_at")
    .eq("player_id", playerId)
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (historyError) throw historyError;

  // Evidens: summerad speltid över ALLA matcher motorn haft ett värde för
  // (inte bara den senaste) — paginerad, samma etablerade princip som
  // resten av projektet.
  let evidenceMinutes = 0;
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("player_intelligence_history")
        .select("minutes_played")
        .eq("player_id", playerId)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      evidenceMinutes += data.reduce((a, r) => a + r.minutes_played, 0);
      if (data.length < PAGE) break;
    }
  }

  return {
    ovr: Math.min(OVR_DISPLAY_CAP, Math.round(state.ovr)),
    uncertaintySd: Math.round(state.uncertainty_sd * 10) / 10,
    latestPerformance: history?.performance !== undefined && history?.performance !== null ? Math.round(history.performance) : null,
    evidenceMinutes,
    observationCount: state.observation_count,
    lastKickoffAt: state.last_kickoff_at,
    modelVersion: state.model_version,
  };
}
