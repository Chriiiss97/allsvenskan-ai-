import { colors } from "@/lib/design/tokens";
import type { RecapVerdict } from "@/lib/football/match-recap";

const VERDICT_META: Record<RecapVerdict, { dot: string; label: string }> = {
  confirmed: { dot: colors.status.result.win, label: "Förhandsanalysen träffade rätt" },
  mixed: { dot: colors.status.confidence.medium, label: "Blandad träffbild" },
  missed: { dot: colors.status.result.loss, label: "Förhandsanalysen hade fel" },
  "no-favorite": { dot: colors.text.faint, label: "Ingen tydlig favorit inför matchen" },
};

const VISIBLE_LINES = 2;

export interface PostMatchNarrative {
  sentences: string[];
  /** Matchens mest talande kontrast (t.ex. "mer boll men färre skott på
   * mål") — se lib/football/match-narrative.ts:s findContrast. Bara satt
   * om en genuin, redan verifierad kontrast faktiskt hittades. */
  deviation: string | null;
}

/**
 * Fas 16g/16h/16i (2026-08-22) — den betalda, långa Matchrapporten. Varje
 * mening från lib/football/match-narrative.ts:s klausul-funktioner renderas
 * som en EGEN rad — bara de första två raderna syns direkt, resten ligger
 * bakom en "Läs mer"-expander (`<details>`, noll extra client-JS). Inför-
 * och efter-delarna expanderas oberoende av varandra.
 */
function NarrativeLines({ sentences }: { sentences: string[] }) {
  const visible = sentences.slice(0, VISIBLE_LINES);
  const rest = sentences.slice(VISIBLE_LINES);

  return (
    <div className="mt-2 space-y-2">
      {visible.map((s, i) => (
        <p key={i} className="text-[15px] leading-[1.7] text-[#e5e4dd]">
          {s}
        </p>
      ))}
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs font-medium text-[#898781] marker:content-none hover:text-[#c3c2b7]">
            Läs mer <span className="text-[#5f5e59] group-open:hidden">▾</span>
            <span className="hidden text-[#5f5e59] group-open:inline">▴</span>
          </summary>
          <div className="mt-2 space-y-2">
            {rest.map((s, i) => (
              <p key={i} className="text-[15px] leading-[1.7] text-[#e5e4dd]">
                {s}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function MatchNarrativeCard({
  preMatch,
  postMatch,
  verdict,
}: {
  preMatch: string[];
  postMatch: PostMatchNarrative | null;
  verdict: RecapVerdict | null;
}) {
  if (preMatch.length === 0 && (!postMatch || postMatch.sentences.length === 0)) return null;

  return (
    <div className="space-y-6">
      {preMatch.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7d7c76]">Inför matchen</p>
          <NarrativeLines sentences={preMatch} />
        </div>
      )}
      {postMatch && postMatch.sentences.length > 0 && (
        <div className={preMatch.length > 0 ? "border-t border-white/5 pt-6" : ""}>
          <div className="flex items-center gap-2">
            {verdict && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: VERDICT_META[verdict].dot }} aria-hidden />}
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7d7c76]">
              Efter matchen{verdict ? ` · ${VERDICT_META[verdict].label}` : ""}
            </p>
          </div>
          <NarrativeLines sentences={postMatch.sentences} />
          {postMatch.deviation && (
            <div className="mt-4 rounded-lg border border-[#d9a526]/25 bg-[#d9a526]/[0.06] p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#d9a526]">⚠️ Matchens avvikelse</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#e5e4dd]">{postMatch.deviation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
