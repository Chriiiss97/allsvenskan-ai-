import { colors } from "@/lib/design/tokens";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * Fas 15 (Complete Scout Player Card) — "Scout Insight". REN AGGREGERING
 * av redan existerande, redan regelbaserade insikts-arrayer (PlayerDNA/
 * AdvancedDNA — se lib/football/player-dna.ts/advanced-dna.ts) — INGEN ny
 * fritext, INGEN AI-genererad sammanfattning. Varje rad kommer redan
 * spårbar till ett konkret mått i sin ursprungliga fil.
 */
export interface ScoutInsightItem {
  type: "strength" | "weakness" | "unique" | "aha";
  text: string;
  source: "DNA" | "Advancerad DNA";
}

const DOT_COLOR: Record<ScoutInsightItem["type"], string> = {
  strength: colors.status.confidence.high,
  weakness: colors.status.confidence.low,
  unique: colors.accent.football,
  aha: colors.status.confidence.medium,
};

export function ScoutInsightSection({ items }: { items: ScoutInsightItem[] }) {
  if (items.length === 0) return null;

  return (
    <CollapsibleSection title="Scout Insight" icon="🔎" subtitle="Spårbart till Player DNA / Advancerad DNA">
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-[#c3c2b7]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: DOT_COLOR[item.type] }} aria-hidden />
            <span>
              {item.text} <span className="text-[11px] text-[#5f5e59]">({item.source})</span>
            </span>
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  );
}
