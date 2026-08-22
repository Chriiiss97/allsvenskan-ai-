import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfile, FootballDataError } from "@/lib/football/tools";
import { buildRatingTrendSummary } from "@/lib/football/rating/rating-trend";
import { computePlayerArchetypes } from "@/lib/football/rating/archetypes";
import { PlayerRatingHistory } from "@/components/data/PlayerRatingHistory";
import { AdvancedDevelopment } from "@/components/data/AdvancedDevelopment";
import { calculateAge } from "@/lib/football/age";
import { PlayerRadarChart } from "@/components/data/PlayerRadarChart";
import { PlayerDNA } from "@/components/data/PlayerDNA";
import { AdvancedDNA } from "@/components/data/AdvancedDNA";
import { PlayerRating } from "@/components/data/PlayerRating";
import { StatBar } from "@/components/data/StatBar";
import { translatePosition } from "@/lib/i18n/sv";
import { addToShortlist, removeFromShortlist } from "../../shortlist/actions";
import { ScoutIntelligenceCard } from "@/components/scout/ScoutIntelligenceCard";
import { getPositionGroup } from "@/lib/football/position-group";
import { getCachedPlayerCardAnalysis } from "@/lib/football/player-card-data";
import { PlayerCardHeader } from "@/components/scout/player-card/PlayerCardHeader";
import { PlayerSnapshot, type SnapshotRow } from "@/components/scout/player-card/PlayerSnapshot";
import { ContextBanner } from "@/components/scout/player-card/ContextBanner";
import { CareerTimelineSection } from "@/components/scout/player-card/CareerTimelineSection";
import { MatchLogSection } from "@/components/scout/player-card/MatchLogSection";
import { ExtraMetricsPanel } from "@/components/scout/player-card/ExtraMetricsPanel";
import { ScoutInsightSection, type ScoutInsightItem } from "@/components/scout/player-card/ScoutInsightSection";
import { PercentileHighlights, type PercentileHighlightRow } from "@/components/scout/player-card/PercentileHighlights";
import { CollapsibleSection } from "@/components/scout/player-card/CollapsibleSection";
import Link from "next/link";

/**
 * Fas 15 (plans/humble-giggling-biscuit.md) — Complete Scout Player Card.
 * Ombyggd från en lodrät kort-stapel (Fas 14.4) till en sammanhållen
 * produkt: Header → Snapshot → Identity → Performance/Context → Career →
 * Development → Percentiler → Scout Insight → Jämför. Anropar SAMMA
 * befintliga analysfunktioner som innan (Player Rating, Player DNA,
 * Advancerad DNA, Advanced Development, Scout Intelligence) plus tre NYA,
 * fristående datakällor (career-timeline.ts, player-match-log.ts,
 * player-card-extra-metrics.ts) — se planen för fullständig
 * datainventering och vad som INTE rörs (OVR-formeln, original-DNA,
 * Allsvensk peer-pool).
 */

function per90SafeLookup(metrics: { label: string; playerValue: number }[] | undefined, label: string): number | null {
  return metrics?.find((m) => m.label === label)?.playerValue ?? null;
}

export default async function ScoutPlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { id } = await params;
  const { season } = await searchParams;
  const supabase = await createClient();

  let profile;
  try {
    profile = await getPlayerProfile(supabase, {
      player: id,
      season: season ? Number(season) : undefined,
    });
  } catch (err) {
    if (err instanceof FootballDataError) notFound();
    throw err;
  }

  const age = calculateAge(profile.player.birthDate);
  const positionGroupInfo = getPositionGroup(profile.player.position);
  const isGoalkeeper = positionGroupInfo?.group === "goalkeeper";

  // ---------------------------------------------------------------------
  // PRESTANDA (2026-08-22): sidan gjorde tidigare ~15 SEKVENTIELLA awaits
  // (varje analysmodul/ny Fas 15-datakälla en efter en) — flera av dem
  // egna fulla säsongsaggregeringar (0,5–3+ sekunder VAR, se profilering i
  // körloggen) — 2–5+ sekunder per sidladdning. Att bara köra dem
  // parallellt (Promise.all) gav bara en delvis förbättring, eftersom
  // Postgres/Supabase själv gör påtagligt arbete per fråga och flera
  // SAMTIDIGA tunga frågor konkurrerar om samma DB-resurser (uppmätt:
  // 7 sådana frågor sekventiellt ~9,5s, parallellt fortfarande ~5s — inte
  // "millisekunder"). Den verkliga fixen: all den här datan är oförändrad
  // mellan importkörningar och ALDRIG användarspecifik (publik läsdata,
  // se DATABASE.md) — cachas därför GLOBALT i
  // lib/football/player-card-data.ts (unstable_cache, 5 min TTL). Ingen
  // beräkningslogik ändrad, bara VAR/HUR OFTA den körs.
  // ---------------------------------------------------------------------
  const [analysis, authResult] = await Promise.all([
    getCachedPlayerCardAnalysis(
      profile.player.id,
      profile.season,
      profile.player.position,
      isGoalkeeper,
      profile.player.team?.id ?? null
    ),
    supabase.auth.getUser(),
  ]);
  const user = authResult.data.user;
  const {
    dna,
    advancedDna,
    advancedDevelopment,
    rating,
    ratingHistory,
    careerTimeline,
    regressionResult,
    standingsTeams,
    lineupRole,
    zScoresResult: zScoreResult,
    consistencyResult,
    storedRatings,
    matchLog,
    extraMetrics,
  } = analysis;

  const ratingTrend = buildRatingTrendSummary(ratingHistory);

  let standingsLabel: string | null = null;
  if (standingsTeams && profile.player.team) {
    const own = standingsTeams.find((t) => t.id === profile.player.team!.id);
    if (own?.rank !== null && own?.rank !== undefined) {
      standingsLabel = `${profile.player.team.name} — ${own.rank}:a (${own.points ?? "—"} p)`;
    }
  }

  let mainArchetypeLabel: string | null = null;
  const ownStoredRating = storedRatings?.find((r) => r.playerId === profile.player.id);
  if (ownStoredRating) {
    const archetypes = computePlayerArchetypes(
      { positionGroup: ownStoredRating.positionGroup, categoryScores: ownStoredRating.categoryScores, metricValues: ownStoredRating.metricValues },
      ownStoredRating.confidenceTier
    );
    mainArchetypeLabel = archetypes[0]?.label ?? null;
  }

  // Shortlist — beror på `user` ovan, så den kan inte vara med i samma våg;
  // ett enda indexerat enradsuppslag, försumbar kostnad som sista steget.
  let isShortlisted = false;
  if (user) {
    const { data: shortlistRow } = await supabase
      .from("scout_shortlist_player")
      .select("player_id")
      .eq("user_id", user.id)
      .eq("player_id", profile.player.id)
      .maybeSingle();
    isShortlisted = !!shortlistRow;
  }
  const returnTo = `/scout/spelare/${id}${profile.season ? `?season=${profile.season}` : ""}`;

  // --- Snapshot (positionsanpassad, se plans/humble-giggling-biscuit.md §4) ---
  const ovrValue = rating?.rating.available ? rating.rating.ovr : null;
  // Fas 15-fixning (2026-08-22): Player Rating/GoalkeeperRatings EGNA
  // confidence — INTE dna?.confidence (alltid null för målvakter, eftersom
  // ingen DNA-profil finns för dem) och INTE regressionens confidence (ett
  // annat begrepp: antal TIDIGARE säsonger, inte årets speltid). Verkligt
  // fall som avslöjade buggen: E. Berisha (målvakt) fick OVR 99 på bara 1
  // match/90 minuter 2026, men ingen varning visades — Snapshot/Context
  // läste dna?.confidence (null, målvakt) och föll tillbaka på
  // regressionens confidence (mäter något helt annat). Se
  // PlayerCardHeader.tsx för samma fix på själva OVR-badgen.
  const ratingConfidenceTier = rating?.rating.available ? (rating.rating.confidence?.tier ?? null) : null;
  const ratingOwnMinutes = rating?.rating.available ? (rating.rating.confidence?.ownMinutes ?? null) : null;
  const snapshotRows: SnapshotRow[] = [];
  if (ovrValue !== null) snapshotRows.push({ label: "OVR", value: String(ovrValue) });
  if (age !== null) snapshotRows.push({ label: "Ålder", value: String(age) });
  snapshotRows.push({ label: "Matcher", value: String(profile.stats.appearances) });
  snapshotRows.push({ label: "Minuter", value: String(profile.stats.minutesPlayed) });

  if (isGoalkeeper && rating?.kind === "goalkeeper" && rating.rating.available) {
    const gk = rating.rating;
    const savePct = gk.metrics.find((m) => m.key === "savePct")?.playerValue;
    const gcPer90 = gk.metrics.find((m) => m.key === "goalsConcededPer90")?.playerValue;
    const csPct = gk.metrics.find((m) => m.key === "cleanSheetPct")?.playerValue;
    if (savePct !== undefined) snapshotRows.push({ label: "Räddningsprocent", value: `${savePct}%` });
    if (gcPer90 !== undefined) snapshotRows.push({ label: "Insläppta/90", value: String(gcPer90) });
    if (csPct !== undefined) snapshotRows.push({ label: "Clean sheet", value: `${csPct}%` });
  } else if (!isGoalkeeper) {
    snapshotRows.push({ label: "Mål", value: String(profile.stats.goals) });
    snapshotRows.push({ label: "Assist", value: String(profile.stats.assists) });
    if (positionGroupInfo?.group === "attacker") {
      const xg = per90SafeLookup(advancedDna?.categories.avslutningskvalitet.metrics, "xG");
      if (xg !== null) snapshotRows.push({ label: "xG/90", value: String(xg) });
    } else if (positionGroupInfo?.group === "midfielder") {
      const recov = per90SafeLookup(advancedDna?.categories.bollatervinning.metrics, "Bollåtervinningar");
      if (recov !== null) snapshotRows.push({ label: "Bollåterv./90", value: String(recov) });
    } else if (positionGroupInfo?.group === "defender") {
      const aerial = advancedDna?.categories.luftspel.metrics.find((m) => m.label === "Luftduellandel")?.playerValue;
      if (aerial !== undefined) snapshotRows.push({ label: "Luftduellandel", value: `${aerial}%` });
    }
  }

  // --- Scout Insight: aggregering av redan regelbaserade insikter ---
  const scoutInsightItems: ScoutInsightItem[] = [
    ...(dna?.insights.map((i) => ({ type: i.type, text: i.text, source: "DNA" as const })) ?? []),
    ...(advancedDna?.insights.map((i) => ({ type: i.type, text: i.text, source: "Advancerad DNA" as const })) ?? []),
  ];

  // --- Percentile-highlights: mest avvikande mått bland DNA + Advancerad DNA ---
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
      <Link href="/scout/spelare" className="text-xs text-[#898781] hover:text-white">
        ← Scout
      </Link>

      <PlayerCardHeader
        name={profile.player.name}
        photoUrl={profile.player.photoUrl}
        teamExternalId={profile.player.team?.external_id}
        teamName={profile.player.team?.name ?? null}
        position={profile.player.position}
        age={age}
        nationality={profile.player.nationality}
        ovr={ovrValue}
        ovrConfidenceTier={ratingConfidenceTier}
        ovrConfidenceMinutes={ratingOwnMinutes}
        mainArchetypeLabel={mainArchetypeLabel}
        isShortlisted={isShortlisted}
        shortlistAction={isShortlisted ? removeFromShortlist : addToShortlist}
        playerId={profile.player.id}
        returnTo={returnTo}
        availableSeasons={profile.availableSeasons}
        season={profile.season}
        freeProfileHref={`/spelare/${id}${profile.season ? `?season=${profile.season}` : ""}`}
      />

      <PlayerSnapshot rows={snapshotRows} confidence={ratingConfidenceTier} />

      <ContextBanner
        confidence={ratingConfidenceTier}
        appearances={profile.stats.appearances}
        minutesPlayed={profile.stats.minutesPlayed}
        season={profile.season}
        standingsLabel={standingsLabel}
      />

      {/* Identity — vad är det här för spelare (DNA + Advancerad DNA, kompakt). */}
      {dna && <PlayerDNA dna={dna} compact />}
      {advancedDna && <AdvancedDNA dna={advancedDna} compact />}

      {/* Performance — Player Rating-nedbrytningen (positionsanpassad redan
          via computeRatingForPlayer/PlayerRating.tsx: målvakt får sin egen
          3-måttsmodell, utespelare shooting/passing/dribbling/defending). */}
      {rating && profile.season && <PlayerRating data={rating} season={profile.season} />}

      {/* Rå box score-statistik (per 90) — samma paneler som gratis
          /spelare/[id] redan visar, men saknades helt i Scout tidigare. */}
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

      {/* Scout Intelligence — Z-score/konsistens/regression (egen fas). */}
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

      {/* Development — OVR-historik + "vad drev det" (2024+), samma
          befintliga komponenter, bara omgrupperade under en gemensam rubrik. */}
      <CollapsibleSection title="Utveckling" icon="📈" defaultOpen>
        <div className="space-y-4">
          <PlayerRatingHistory history={ratingHistory} trend={ratingTrend} />
          {advancedDevelopment.available && <AdvancedDevelopment development={advancedDevelopment} />}
        </div>
      </CollapsibleSection>

      {/* Percentiler — radar + vardagsspråk. */}
      <CollapsibleSection title="Percentiler" icon="📊" defaultOpen>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <PlayerRadarChart per90={profile.per90} positionAveragePer90={profile.positionAveragePer90} peerGroup={profile.peerGroup} />
          </div>
          <PercentileHighlights rows={percentileHighlights} />
        </div>
      </CollapsibleSection>

      <ScoutInsightSection items={scoutInsightItems} />

      <Link
        href={`/scout/compare?mode=spelare&a=${profile.player.id}${profile.season ? `&season=${profile.season}` : ""}`}
        className="flex items-center justify-between gap-3 rounded-xl border border-[#a78bfa]/30 bg-[#a78bfa]/10 p-4 text-sm transition-colors hover:bg-[#a78bfa]/15"
      >
        <span>
          <span className="font-semibold text-[#a78bfa]">🔍 Jämför spelaren</span>
          <span className="ml-1 text-[#c3c2b7]">— välj en annan spelare att jämföra mot.</span>
        </span>
        <span className="text-[#a78bfa]">→</span>
      </Link>

      <p className="pt-1 text-center text-[10px] text-[#5f5e59]">
        {translatePosition(profile.player.position ?? "")} · Player Card visar all verifierad data vi har — se varje sektions
        egen text för underlag och tolkning.
      </p>
    </div>
  );
}
