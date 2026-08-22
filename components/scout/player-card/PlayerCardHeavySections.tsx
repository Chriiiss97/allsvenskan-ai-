import type { getPlayerProfile } from "@/lib/football/tools";
import { getCachedPlayerCardAnalysis } from "@/lib/football/player-card-data";
import { buildRatingTrendSummary } from "@/lib/football/rating/rating-trend";
import { PlayerRatingHistory } from "@/components/data/PlayerRatingHistory";
import { AdvancedDevelopment } from "@/components/data/AdvancedDevelopment";
import { PlayerRadarChart } from "@/components/data/PlayerRadarChart";
import { PlayerDNA } from "@/components/data/PlayerDNA";
import { AdvancedDNA } from "@/components/data/AdvancedDNA";
import { StatBar } from "@/components/data/StatBar";
import { ScoutIntelligenceCard } from "@/components/scout/ScoutIntelligenceCard";
import { CareerTimelineSection } from "./CareerTimelineSection";
import { MatchLogSection } from "./MatchLogSection";
import { ExtraMetricsPanel } from "./ExtraMetricsPanel";
import { ScoutInsightSection, type ScoutInsightItem } from "./ScoutInsightSection";
import { PercentileHighlights, type PercentileHighlightRow } from "./PercentileHighlights";
import { CollapsibleSection } from "./CollapsibleSection";

type PlayerProfile = Awaited<ReturnType<typeof getPlayerProfile>>;

/**
 * Fas 15-prestandafix, del 3 (2026-08-22) — se player-card-data.ts:s
 * filhuvud för hela resonemanget. Denna komponent renderar ALLT som INTE
 * behövs för första, snabba visningen (Header/Snapshot/Context/OVR-kortet
 * rör sig aldrig härifrån — de renderas synkront direkt i page.tsx).
 * Async Server Component, avsedd att monteras inuti en <Suspense> — Next.js
 * streamar in den när `getCachedPlayerCardAnalysis` är klar istället för
 * att blockera HELA sidans första byte.
 */
export async function PlayerCardHeavySections({
  profile,
  isGoalkeeper,
}: {
  profile: PlayerProfile;
  isGoalkeeper: boolean;
}) {
  const analysis = await getCachedPlayerCardAnalysis(
    profile.player.id,
    profile.season,
    profile.player.position,
    isGoalkeeper,
    profile.player.team?.id ?? null
  );
  const {
    dna,
    advancedDna,
    advancedDevelopment,
    ratingHistory,
    careerTimeline,
    regressionResult,
    lineupRole,
    zScoresResult: zScoreResult,
    consistencyResult,
    matchLog,
    extraMetrics,
  } = analysis;

  const ratingTrend = buildRatingTrendSummary(ratingHistory);

  const scoutInsightItems: ScoutInsightItem[] = [
    ...(dna?.insights.map((i) => ({ type: i.type, text: i.text, source: "DNA" as const })) ?? []),
    ...(advancedDna?.insights.map((i) => ({ type: i.type, text: i.text, source: "Advancerad DNA" as const })) ?? []),
  ];

  const allMetrics: PercentileHighlightRow[] = [];
  if (dna?.available) {
    for (const cat of Object.values(dna.categories)) {
      for (const m of cat.metrics) allMetrics.push({ label: m.label, percentile: m.percentile, peerLabel: dna.confidence!.peerLabel });
    }
  }
  if (advancedDna?.available) {
    for (const cat of Object.values(advancedDna.categories)) {
      for (const m of cat.metrics) allMetrics.push({ label: m.label, percentile: m.percentile, peerLabel: `${advancedDna.confidence!.peerLabel} (2024+)` });
    }
  }
  const percentileHighlights = allMetrics.sort((a, b) => Math.abs(b.percentile - 50) - Math.abs(a.percentile - 50)).slice(0, 6);

  return (
    <div className="space-y-4">
      {/* Identity — vad är det här för spelare (DNA + Advancerad DNA, kompakt). */}
      {dna && <PlayerDNA dna={dna} compact />}
      {advancedDna && <AdvancedDNA dna={advancedDna} compact />}

      {/* Rå box score-statistik (per 90) — samma paneler som gratis
          /spelare/[id] redan visar. */}
      {!isGoalkeeper && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
            <h2 className="text-sm font-semibold">Anfall</h2>
            <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = snitt {profile.peerGroup.label}</p>
            <StatBar label="Mål" value={profile.per90.goals} peerAverage={profile.positionAveragePer90.goals} peerLabel={`Snitt ${profile.peerGroup.label}`} />
            <StatBar label="Skott" value={profile.per90.shotsTotal} peerAverage={null} />
            <StatBar label="Skott på mål" value={profile.per90.shotsOnTarget} peerAverage={null} />
          </div>
          <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
            <h2 className="text-sm font-semibold">Skapande</h2>
            <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = snitt {profile.peerGroup.label}</p>
            <StatBar label="Assist" value={profile.per90.assists} peerAverage={profile.positionAveragePer90.assists} peerLabel={`Snitt ${profile.peerGroup.label}`} />
            <StatBar label="Nyckelpassningar" value={profile.per90.passesKey} peerAverage={profile.positionAveragePer90.passesKey} peerLabel={`Snitt ${profile.peerGroup.label}`} />
          </div>
          <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
            <h2 className="text-sm font-semibold">Bollspel</h2>
            <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = snitt {profile.peerGroup.label}</p>
            <StatBar label="Passningar" value={profile.per90.passesTotal} peerAverage={profile.positionAveragePer90.passesTotal} peerLabel={`Snitt ${profile.peerGroup.label}`} />
            <StatBar label="Passningssäkerhet" value={profile.stats.passesAccuracy} peerAverage={null} suffix="%" />
            <StatBar label="Lyckade dribblingar" value={profile.per90.dribblesSuccess} peerAverage={profile.positionAveragePer90.dribblesSuccess} peerLabel={`Snitt ${profile.peerGroup.label}`} />
          </div>
          <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
            <h2 className="text-sm font-semibold">Försvar</h2>
            <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = snitt {profile.peerGroup.label}</p>
            <StatBar label="Tacklingar" value={profile.per90.tacklesTotal} peerAverage={profile.positionAveragePer90.tacklesTotal} peerLabel={`Snitt ${profile.peerGroup.label}`} />
            <StatBar label="Interceptions" value={profile.per90.tacklesInterceptions} peerAverage={profile.positionAveragePer90.tacklesInterceptions} peerLabel={`Snitt ${profile.peerGroup.label}`} />
            <StatBar label="Vinstprocent dueller" value={profile.duelsWinRate} peerAverage={null} suffix="%" />
          </div>
        </div>
      )}

      <ExtraMetricsPanel data={extraMetrics} />

      <ScoutIntelligenceCard zScore={zScoreResult} consistency={consistencyResult} regression={regressionResult} />

      {lineupRole && (
        <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Roll i laget — {profile.season}</h2>
          <div className="mt-3 flex flex-wrap justify-center gap-x-8 gap-y-3 text-center sm:justify-start sm:text-left">
            <div>
              <p className="text-lg font-semibold text-white">{lineupRole.starts}</p>
              <p className="text-[10px] uppercase tracking-wide text-[#898781]">Startelva</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{lineupRole.substituteListings}</p>
              <p className="text-[10px] uppercase tracking-wide text-[#898781]">Avbytarlistad</p>
            </div>
            {lineupRole.mostCommonFormation && (
              <div>
                <p className="text-lg font-semibold text-white">{lineupRole.mostCommonFormation}</p>
                <p className="text-[10px] uppercase tracking-wide text-[#898781]">Vanligaste formation</p>
              </div>
            )}
          </div>
        </div>
      )}

      <MatchLogSection entries={matchLog.entries} isGoalkeeper={matchLog.isGoalkeeper} />

      <CareerTimelineSection entries={careerTimeline} />

      <CollapsibleSection title="Utveckling" icon="📈" defaultOpen>
        <div className="space-y-4">
          <PlayerRatingHistory history={ratingHistory} trend={ratingTrend} />
          {advancedDevelopment.available && <AdvancedDevelopment development={advancedDevelopment} />}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Percentiler" icon="📊" defaultOpen>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <PlayerRadarChart per90={profile.per90} positionAveragePer90={profile.positionAveragePer90} peerGroup={profile.peerGroup} />
          </div>
          <PercentileHighlights rows={percentileHighlights} />
        </div>
      </CollapsibleSection>

      <ScoutInsightSection items={scoutInsightItems} />
    </div>
  );
}
