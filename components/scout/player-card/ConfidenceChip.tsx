import type { ConfidenceTier } from "@/lib/football/confidence";
import { colors } from "@/lib/design/tokens";

/**
 * Fas 15 (Complete Scout Player Card) — delad underlags-badge. Samma
 * `colors.status.confidence`-tokens som redan används i PlayerDNA/
 * AdvancedDNA/PlayerRating, bara en gemensam liten komponent så Snapshot/
 * Context/Performance alltid renderar EXAKT samma badge istället för fyra
 * lätt olika kopior. Aldrig färg utan text (samma regel som
 * lib/design/tokens.ts dokumenterar).
 */
const TIER_DOT: Record<ConfidenceTier, string> = { hög: "🟢", medel: "🟡", låg: "🔴" };
const TIER_LABEL: Record<ConfidenceTier, string> = { hög: "Bra underlag", medel: "Medelbra underlag", låg: "Begränsat underlag" };
const TIER_COLOR: Record<ConfidenceTier, string> = {
  hög: colors.status.confidence.high,
  medel: colors.status.confidence.medium,
  låg: colors.status.confidence.low,
};

export function ConfidenceChip({ tier, title }: { tier: ConfidenceTier; title?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: `${TIER_COLOR[tier]}22`, color: TIER_COLOR[tier] }}
      title={title}
    >
      <span aria-hidden>{TIER_DOT[tier]}</span>
      {TIER_LABEL[tier]}
    </span>
  );
}
