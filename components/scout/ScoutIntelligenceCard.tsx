import type { ZScoreResult, AgeBracket } from "@/lib/football/scout/scout-intelligence-zscore";
import type { ConsistencyResult } from "@/lib/football/scout/scout-intelligence-consistency";
import type { RegressionPrediction } from "@/lib/football/scout/scout-intelligence-regression";

/**
 * Scout Intelligence — egen, separat kortsamling (INTE Player Rating/DNA,
 * som förblir helt orörda). Tre kompletterande mått, se respektive
 * lib/football/scout/scout-intelligence-*.ts-fils huvud för exakt formel,
 * peer-pool, minimiunderlag och tolkning. Döljer varje delkort helt om
 * måttet inte är tillgängligt för spelaren — aldrig en tom platshållare.
 */

const CONFIDENCE_COLOR: Record<string, string> = { hög: "#22c55e", medel: "#d9a526", låg: "#e66767" };
const AGE_BRACKET_LABELS: Record<AgeBracket, string> = { youth: "≤21 år", prime: "22–29 år", veteran: "30+ år" };

export function ScoutIntelligenceCard({
  zScore,
  consistency,
  regression,
}: {
  zScore: ZScoreResult | null;
  consistency: ConsistencyResult | null;
  regression: RegressionPrediction | null;
}) {
  const hasAny = zScore?.available || consistency?.available || regression?.available;
  if (!hasAny) return null;

  return (
    <div className="rounded-xl border border-[#a78bfa]/20 bg-[#141117] p-5">
      <h2 className="text-sm font-semibold text-[#a78bfa]">🧠 Scout Intelligence</h2>
      <p className="mt-1 text-xs text-[#7d7c76]">
        Kompletterande statistiska mått, fristående från Player Rating/OVR — se varje måtts egen tolkning nedan.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {zScore?.available && (
          <div>
            <p className="text-xs font-medium text-[#c3c2b7]">Åldersjusterad Z-score</p>
            <p className="mt-1 text-2xl font-bold text-white">
              {zScore.zScore! > 0 ? "+" : ""}
              {zScore.zScore}
            </p>
            <p className="mt-0.5 text-[11px] text-[#898781]">
              vs. {zScore.ageBracket && AGE_BRACKET_LABELS[zScore.ageBracket]} {zScore.positionGroup === "attacker" ? "anfallare" : zScore.positionGroup === "midfielder" ? "mittfältare" : "försvarare"}
            </p>
            <p
              className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: `${CONFIDENCE_COLOR[zScore.confidence!.tier]}22`, color: CONFIDENCE_COLOR[zScore.confidence!.tier] }}
            >
              {zScore.confidence!.tier} underlag ({zScore.confidence!.peerCount} peers)
            </p>
            <p className="mt-2 text-xs text-[#7d7c76]">
              {Math.abs(zScore.zScore!) >= 2
                ? "Mycket ovanlig produktion för ålder/position."
                : Math.abs(zScore.zScore!) >= 1
                  ? "Klart över eller under snittet för ålder/position."
                  : "Nära snittet för ålder/position."}
            </p>
          </div>
        )}

        {consistency?.available && (
          <div>
            <p className="text-xs font-medium text-[#c3c2b7]">Konsistens (per match)</p>
            <p className="mt-1 text-2xl font-bold text-white">{consistency.consistencyPercentile ?? "—"}<span className="text-sm text-[#898781]">e pct</span></p>
            <p className="mt-0.5 text-[11px] text-[#898781]">CV={consistency.cv} · {consistency.matchCount} matcher</p>
            <p
              className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: `${CONFIDENCE_COLOR[consistency.confidence!]}22`, color: CONFIDENCE_COLOR[consistency.confidence!] }}
            >
              {consistency.confidence} underlag
            </p>
            <p className="mt-2 text-xs text-[#7d7c76]">
              {consistency.consistencyPercentile !== null && consistency.consistencyPercentile >= 70
                ? "Jämn, pålitlig presterare match till match."
                : consistency.consistencyPercentile !== null && consistency.consistencyPercentile <= 30
                  ? "”Boom or bust” — stor variation mellan matcher."
                  : "Genomsnittlig jämnhet för positionen."}
            </p>
          </div>
        )}

        {regression?.available && (
          <div>
            <p className="text-xs font-medium text-[#c3c2b7]">Regression mot medelvärdet</p>
            <p className="mt-1 text-2xl font-bold text-white">{regression.predictedNextOvr}</p>
            <p className="mt-0.5 text-[11px] text-[#898781]">
              Nu: {regression.currentOvr} · Karriärsnitt: {regression.careerMeanPriorSeasons} ({regression.priorSeasonCount} säsonger)
            </p>
            <p
              className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: `${CONFIDENCE_COLOR[regression.confidence]}22`, color: CONFIDENCE_COLOR[regression.confidence] }}
            >
              {regression.confidence} underlag
            </p>
            <p className="mt-2 text-xs text-[#7d7c76]">
              {regression.direction === "regression_expected"
                ? "Nuvarande nivå ser ut som en tillfällig topp — statistiskt väntas en nedgång mot spelarens normala nivå."
                : regression.direction === "improvement_expected"
                  ? "Nuvarande nivå ligger under spelarens vanliga standard — statistiskt väntas en uppgång."
                  : "Nuvarande nivå ser ut som spelarens genuina normalläge."}
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 border-t border-white/5 pt-3 text-[10px] text-[#5f5e59]">
        Statistiska projektioner baserat på historisk data i den här ligan — inga validerade prognoser (ingen framtida data
        att testa mot ännu). Ändrar aldrig Player Rating/OVR.
      </p>
    </div>
  );
}
