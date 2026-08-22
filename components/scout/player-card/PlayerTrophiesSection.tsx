import type { PlayerTrophy } from "@/lib/football/player-trophies";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * Fas 17 (2026-08-22) — riktig trofédata (api-football /trophies, se
 * scripts/import/import-player-career.ts). Visas bara om vi faktiskt HAR
 * troféer importerade för spelaren — ingen tom platshållarruta, ingen
 * gissning. `place` från API:t är på engelska ("Winner"/"2nd Place"/
 * "Runner-Up") — översatt vid visning, samma princip som lib/i18n/sv.ts:s
 * övriga translate*-funktioner.
 */
const PLACE_ICON: Record<string, string> = { Winner: "🏆" };

export function PlayerTrophiesSection({ trophies }: { trophies: PlayerTrophy[] }) {
  const winners = trophies.filter((t) => t.place === "Winner");
  if (winners.length === 0) return null;

  return (
    <CollapsibleSection title="Troféer" icon="🏆" subtitle={`${winners.length} titlar`}>
      <ol className="space-y-0">
        {winners.map((t, i) => (
          <li
            key={`${t.leagueName}-${t.season}-${i}`}
            className={`flex items-center justify-between gap-3 py-2.5 text-sm ${i !== winners.length - 1 ? "border-b border-white/5" : ""}`}
          >
            <span className="flex items-center gap-2 text-[#c3c2b7]">
              <span aria-hidden>{PLACE_ICON[t.place] ?? "🥈"}</span>
              {t.leagueName}
              {t.country && t.country !== "Sweden" && <span className="text-[#7d7c76]"> · {t.country}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-[#898781]">{t.season}</span>
          </li>
        ))}
      </ol>
    </CollapsibleSection>
  );
}
