import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMatchReport, getRecentFormSequence, FootballDataError } from "@/lib/football/tools";
import { getMatchTeamStatsComparison } from "@/lib/football/team-rollup";
import { getMatchPreview, type MatchFact } from "@/lib/football/match-preview";
import { translateMatchFact, extractPlayerHighlight, extractComparisonHighlight } from "@/lib/football/match-preview-sv";
import { buildH2HSummary, buildRealH2HSummary } from "@/lib/football/match-h2h-summary";
import { getStandingsTable } from "@/lib/football/catalog";
import { MatchStandingsSummary } from "@/components/data/MatchStandingsSummary";
import { translateRound } from "@/lib/i18n/sv";
import { buildMatchInsight } from "@/lib/football/match-insight";
import { buildMatchRecap } from "@/lib/football/match-recap";
import { buildKeyPlayerCategories } from "@/lib/football/match-key-players";
import { hasScoutAccess } from "@/lib/auth/premium";
import { getCurrentProfile } from "@/lib/auth/session";
import { PremiumGate } from "@/components/scout/PremiumGate";
import { colors } from "@/lib/design/tokens";
import { MatchTimeline } from "@/components/data/MatchTimeline";
import { BackButton } from "@/components/nav/BackButton";
import { MatchFactGroup, FactRow, type DisplayFact } from "@/components/data/MatchFactGroup";
import { MatchHeadToHeadSummary } from "@/components/data/MatchHeadToHeadSummary";
import { MatchKeyPlayers } from "@/components/data/MatchKeyPlayers";
import { MatchFormSequence } from "@/components/data/MatchFormSequence";
import { MatchLeagueComparisons } from "@/components/data/MatchLeagueComparisons";
import { StatCompareRow } from "@/components/data/StatCompareRow";
import { MatchRecapCard } from "@/components/data/MatchRecapCard";
import { FormationPitch } from "@/components/data/FormationPitch";
import { buildPitchPlayers } from "@/lib/football/formation-pitch";
import { buildPreMatchNarrative, buildPostMatchNarrative } from "@/lib/football/match-narrative";
import { MatchNarrativeCard } from "@/components/data/MatchNarrativeCard";
import { getLiveFeedForFixtures } from "@/lib/football/live-feed";
import { MatchLiveHero } from "@/components/live/MatchLiveHero";
import { LiveMatchTimeline } from "@/components/live/LiveMatchTimeline";
import { LiveMatchStats } from "@/components/live/LiveMatchStats";

// Steg 9: "Match DNA" — hemma vs bortalagets lagstatistik (possession/skott/
// hörnor/xG), byggd på steg 8:s getMatchTeamStatsComparison. Bara rader där
// minst en sida faktiskt har ett värde visas — aldrig en rad med två "–".
const MATCH_STAT_ROWS: { label: string; key: "possessionPct" | "shotsTotal" | "shotsOnTarget" | "corners" | "fouls" | "expectedGoals"; suffix?: string }[] = [
  { label: "Bollinnehav", key: "possessionPct", suffix: "%" },
  { label: "Skott", key: "shotsTotal" },
  { label: "Skott på mål", key: "shotsOnTarget" },
  { label: "Hörnor", key: "corners" },
  { label: "Fouls", key: "fouls" },
  { label: "Expected goals (xG)", key: "expectedGoals" },
];

interface LineupPlayerRow {
  is_starter: boolean;
  shirt_number: number | null;
  position: string | null;
  grid: string | null;
  player: { id: number; full_name: string; photo_url: string | null } | null;
}

interface LineupRow {
  team_id: number;
  formation: string | null;
  fixture_lineup_player: LineupPlayerRow[];
}

/**
 * Fas 16 — bygger visningstexten för en grupp Match Preview-fakta: en säker
 * svensk mening när sportmonks_type_id är täckt (lib/football/match-preview-sv.ts),
 * annars den engelska originalmeningen (aldrig en gissad översättning).
 */
/**
 * Fas 17 (2026-08-22) — "hur många dagar kvar", bara meningsfullt före
 * avspark (status NS). Ren datumaritmetik på kickoff_at, ingen ny data.
 * Rundar till hela dygn (kalenderdagar, inte 24h-block) så "imorgon" känns
 * rätt även om det bara är någon enstaka timme till midnatt.
 */
function daysUntilLabel(kickoffIso: string): string | null {
  const now = new Date();
  const kickoff = new Date(kickoffIso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfKickoffDay = new Date(kickoff.getFullYear(), kickoff.getMonth(), kickoff.getDate());
  const diffDays = Math.round((startOfKickoffDay.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diffDays < 0) return null;
  if (diffDays === 0) return "Idag";
  if (diffDays === 1) return "Imorgon";
  return `Om ${diffDays} dagar`;
}

function toDisplayFacts(facts: MatchFact[], homeName: string, awayName: string): DisplayFact[] {
  return facts.map((f, i) => {
    const sv = translateMatchFact(f, homeName, awayName);
    return { key: `${f.sportmonksTypeId}-${i}`, text: sv ?? f.naturalLanguage, translated: sv !== null };
  });
}

/**
 * Fas 16f — en spelarrad i Startelvor: ansiktsbild när vi har en
 * (photo_url), annars samma tröjnummer-badge som förut — aldrig en stor
 * bild, bara en liten, konsekvent avatar (h-7 w-7). Länken är samma redan
 * säkra fixture_lineup_player.player_id-koppling som fanns innan, oförändrad.
 */
function LineupPlayerRow({
  player,
  shirtNumber,
  dim,
}: {
  player: { id: number; full_name: string; photo_url: string | null } | null;
  shirtNumber: number | null;
  dim?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {player?.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- extern spelarbild
        <img src={player.photo_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/10" />
      ) : (
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ring-1 ${
            dim ? "bg-white/[0.03] text-[#5f5e59] ring-white/5" : "bg-white/5 text-[#898781] ring-white/10"
          }`}
        >
          {shirtNumber ?? "–"}
        </span>
      )}
      {player ? (
        <Link href={`/spelare/${player.id}`} className={`transition-colors hover:text-white hover:underline ${dim ? "text-[#898781]" : "text-[#c3c2b7]"}`}>
          {player.full_name}
        </Link>
      ) : (
        <span className={dim ? "text-[#898781]" : "text-[#c3c2b7]"}>Okänd spelare</span>
      )}
    </li>
  );
}

/**
 * Fas 14.6/16/16b — en titlad grupp Match Preview-fakta, döljer sig själv
 * helt om tom. `summary` (valfri): en visuell sammanfattning (t.ex.
 * MatchHeadToHeadSummary) som visas FÖRE listan — då läggs HELA listan (inte
 * bara det som sticker ut över 6) bakom en enda "Visa detaljer", eftersom
 * sammanfattningen redan gav helhetsbilden.
 */
function FactSection({
  icon,
  title,
  facts,
  homeName,
  awayName,
  summary,
}: {
  icon: string;
  title: string;
  facts: MatchFact[];
  homeName: string;
  awayName: string;
  summary?: ReactNode;
}) {
  if (facts.length === 0) return null;
  const displayFacts = toDisplayFacts(facts, homeName, awayName);
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
        <span aria-hidden>{icon}</span> {title}
      </p>
      {summary ? (
        <>
          {summary}
          <details className="group mt-3">
            <summary className="cursor-pointer list-none text-xs font-medium text-[#898781] marker:content-none hover:text-[#c3c2b7]">
              Visa detaljer ({displayFacts.length}) <span className="text-[#5f5e59] group-open:hidden">▾</span>
              <span className="hidden text-[#5f5e59] group-open:inline">▴</span>
            </summary>
            <ul className="mt-2 divide-y divide-white/5 border-t border-white/5">
              {displayFacts.map((f) => (
                <FactRow key={f.key} fact={f} />
              ))}
            </ul>
          </details>
        </>
      ) : (
        <MatchFactGroup facts={displayFacts} />
      )}
    </div>
  );
}

export default async function MatchReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: fixtureId } = await params;
  const supabase = await createClient();

  let report;
  try {
    report = await getMatchReport(supabase, Number(fixtureId));
  } catch (err) {
    if (err instanceof FootballDataError) notFound();
    throw err;
  }

  const matchStats = await getMatchTeamStatsComparison(supabase, Number(fixtureId));
  const statRows = MATCH_STAT_ROWS.filter((row) => matchStats.home?.[row.key] != null || matchStats.away?.[row.key] != null);

  // Fas 20: live-statistiken byggdes tidigare här, som en serverrenderad
  // engångslista ur report.liveStats. Den stod still under matchen och
  // saknades helt om sidan laddades före avspark. Ansvaret ligger nu på
  // LiveMatchStats (klientkomponent, samma pollingkanal som hero:n) —
  // post-matchstatistiken (fixture_team_stats, inkl. xG) renderas fortsatt
  // på servern eftersom den per definition inte ändrar sig längre.

  // Steg 4 (data-sektionens breddning): startelvor/formation — nedan sedan
  // steg 4 av Ultra-plan-projektet, men aldrig visade i UI:t förrän nu.
  const { data: lineupRows } = await supabase
    .from("fixture_lineup")
    .select("team_id, formation, fixture_lineup_player(is_starter, shirt_number, position, grid, player:player_id(id, full_name, photo_url))")
    .eq("fixture_id", Number(fixtureId))
    .returns<LineupRow[]>();
  const homeLineup = lineupRows?.find((l) => l.team_id === report.home?.id) ?? null;
  const awayLineup = lineupRows?.find((l) => l.team_id === report.away?.id) ?? null;

  // Fas 14.6 — Match Preview (H2H/form/spelarfakta), gated bakom SAMMA
  // entitlement som Scout (planen: "bakom samma entitlement-flagga som
  // Scout men eget visuellt märke") — inte en Scout-yta i sig, se
  // components/scout/PremiumGate.tsx:s title/accentColor-props nedan.
  // Profilen är redan hämtad av app/(app)/layout.tsx — request-lokalt
  // delad via lib/auth/session.ts, alltså inga extra round-trips här.
  const [preview, profile] = await Promise.all([getMatchPreview(supabase, Number(fixtureId)), getCurrentProfile()]);
  const hasPreviewAccess = hasScoutAccess(profile);

  const homeName = report.home?.name ?? "Hemma";
  const awayName = report.away?.name ?? "Borta";

  // Fas 20 — startdata för live-hero/tidslinje. Samma smala flöde som
  // klientens polling sedan hämtar (lib/football/live-feed.ts), så första
  // serverrenderade bilden och första pollade uppdateringen har exakt samma
  // form och aldrig kan visa olika saker för samma läge.
  const liveFeed = await getLiveFeedForFixtures(supabase, [report.id]);
  const liveMatch = liveFeed.matches.find((m) => m.fixtureId === report.id) ?? null;
  // "Går att följa" = matchen är inte avgjord än. MEDVETET bredare än "pågår
  // just nu": öppnar man sidan en kvart före avspark ska tidslinjen och
  // statistiken börja fyllas på av sig själva när matchen väl startar,
  // istället för att stå kvar tomma tills användaren laddar om.
  const isTrackable = liveMatch ? liveMatch.phase !== "finished" && liveMatch.phase !== "cancelled" : false;
  const heroContextLine = [
    report.season,
    translateRound(report.round),
    new Date(report.date).toLocaleDateString("sv-SE"),
    new Date(report.date).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }),
  ]
    .filter(Boolean)
    .join(" · ");

  // Fas 16b — samma tal som redan visas i FactSection nedan, bara
  // omformade till en visuell sammanfattning respektive kort (H2H-stapel,
  // spelarkort) och en kort jämförande textrad ("AI:s matchbild" — se
  // lib/football/match-insight.ts:s filhuvud för varför det INTE är ett
  // AI/LLM-anrop). Ingen ny data, ingen ny beräkning bortom enkla
  // jämförelser av redan verifierade tal.
  // Fas 17 — h2hSummary faller tillbaka till en RIKTIG H2H räknad direkt på
  // vår egen fixture-tabell (buildRealH2HSummary) när Sportmonks facts
  // saknas — vilket de ALLTID gör för en kommande match (se funktionens
  // egen kommentar). Så länge lagen mötts minst en gång i vår data (i
  // princip alla etablerade Allsvenskan-matchupper) finns Inbördes möten nu
  // även före avspark, inte bara efteråt.
  const h2hSummary =
    buildH2HSummary(preview.headToHead) ?? (report.home && report.away ? await buildRealH2HSummary(supabase, report.home.id, report.away.id) : null);
  const matchInsight = preview.available ? buildMatchInsight(preview, homeName, awayName) : null;
  const playerHighlights = preview.players.map((f) => extractPlayerHighlight(f, homeName, awayName)).filter((h): h is NonNullable<typeof h> => h !== null);
  // Sällsynta spelarfakta som inte blir ett kort (t.ex. övergångshistorik,
  // "X har tidigare spelat för Y") — visas ändå, som text, aldrig tyst dolda.
  const uncoveredPlayerFacts = preview.players.filter((f) => extractPlayerHighlight(f, homeName, awayName) === null);
  const leagueComparisons = preview.leagueComparisons
    .map((f) => extractComparisonHighlight(f, homeName, awayName))
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const uncoveredComparisonFacts = preview.leagueComparisons.filter((f) => extractComparisonHighlight(f, homeName, awayName) === null);

  // Fas 16c/17 — "Senaste 5" som en RIKTIG resultatsekvens (W/D/L, kronologisk
  // ordning), byggd på egen matchdata (fixture.home_score/away_score), inte
  // Sportmonks aggregerade sviter — se lib/football/tools.ts:s
  // getRecentFormSequence. Hämtas nu ALLTID (inte bara när preview.available)
  // — riktig data, oberoende av Sportmonks facts, ska synas även före avspark.
  const [homeFormRecord, awayFormRecord] =
    report.home && report.away
      ? await Promise.all([getRecentFormSequence(supabase, report.home.id), getRecentFormSequence(supabase, report.away.id)])
      : [null, null];

  // Fas 17 — tabellplacering just nu, oberoende av Sportmonks facts (samma
  // standings-tabell /tabell redan visar, uppdateras dagligen). Bara hämtad
  // om matchen har en känd säsong (alltid fallet i praktiken).
  const standingsTable = report.season ? await getStandingsTable(supabase, { season: report.season }) : [];
  const homeStanding = report.home ? (standingsTable.find((s) => s.team.id === report.home!.id) ?? null) : null;
  const awayStanding = report.away ? (standingsTable.find((s) => s.team.id === report.away!.id) ?? null) : null;

  // Fas 16d — "Nyckelspelare": grupperar samma playerHighlights-tal efter
  // VILKEN FRÅGA de svarar på (störst målhot/bäst målchans/bäst betyg)
  // istället för en rå grid av alla 12 — se match-key-players.ts:s filhuvud.
  const keyPlayerCategories = buildKeyPlayerCategories(playerHighlights);

  // Fas 16f — "Matchrapport": ställer favoredTeam (redan beräknad ovan,
  // buildMatchInsight) mot facit (report.homeScore/awayScore + samma
  // matchStats som Lagstatistik-sektionen redan visar). Bara meningsfullt
  // för en AVSLUTAD match — en pågående/kommande match har inget facit än.
  const matchRecap = report.status === "FT" ? buildMatchRecap(matchInsight, homeName, awayName, report.homeScore, report.awayScore, matchStats) : null;

  // Fas 16g — den betalda långa Matchrapporten. Inför-delen bygger på samma
  // strukturer som de FRIA sektionerna nedan (H2H/form/nyckelspelare/
  // ligasnitt) redan visar — bara omformade till löpande text istället för
  // separata visuella block. Efter-delen kräver matchRecap (bara satt för
  // en avslutad match).
  const preMatchNarrative = preview.available
    ? buildPreMatchNarrative({
        homeName,
        awayName,
        h2h: h2hSummary,
        homeForm: homeFormRecord,
        awayForm: awayFormRecord,
        insight: matchInsight,
        keyPlayers: keyPlayerCategories,
        leagueComparisons,
      })
    : [];
  const postMatchNarrative =
    matchRecap && report.homeScore != null && report.awayScore != null
      ? buildPostMatchNarrative({
          recap: matchRecap,
          homeName,
          awayName,
          homeScore: report.homeScore,
          awayScore: report.awayScore,
          matchStats,
          keyPlayers: keyPlayerCategories,
          events: report.events,
        })
      : null;

  return (
    <div className="space-y-12">
      <BackButton href="/matcher" label="Alla matcher" />

      {/* LEVEL 1 — HERO / MATCH IDENTITY. Ingen inramning — sidans "omslag",
          bär sin vikt genom typografi och luft, inte ett kort.

          Fas 20: ställning/status/minut renderas av MatchLiveHero, en
          klientkomponent som pollar `/api/live?fixture=X` medan matchen
          pågår (och ingenting alls när den är slutspelad). Markupen är
          densamma — det är bara datakällan som blivit levande. */}
      <div>
        <MatchLiveHero initial={liveFeed} fixtureId={report.id} contextLine={heroContextLine} />

        <p className="mt-4 text-center text-xs text-[#898781]">
          {report.venue}
          {report.referee && <span className="text-[#5f5e59]"> · Domare: {report.referee}</span>}
        </p>
        {report.status === "NS" &&
          (() => {
            const daysLabel = daysUntilLabel(report.date);
            return daysLabel ? (
              <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-[0.1em] text-[#7d7c76]">{daysLabel}</p>
            ) : null;
          })()}

        {((!report.fullPlayerDetail && report.eventsAvailable) || (report.eventsAvailable && !report.eventsComplete)) && (
          <div className="mx-auto mt-5 max-w-md space-y-1 text-[11px] leading-relaxed text-[#7d7c76]">
            {!report.fullPlayerDetail && report.eventsAvailable && (
              <p>Vissa spelare i matchens händelser kunde inte kopplas till en spelarprofil — visas med lagnamn istället.</p>
            )}
            {report.eventsAvailable && !report.eventsComplete && (
              <p>Händelsetidslinjen kan sakna enstaka händelser (känd lucka i äldre källdata) — resultatet ovan stämmer.</p>
            )}
          </div>
        )}
      </div>

      {/* LEVEL 2 — INTELLIGENCE. Två delar med olika åtkomst, per uttrycklig
          produktbeslut: (1) en GRATIS snabbanalys (verdict + bekräftat/
          överraskade) som alla ser, även utan Scout — (2) en BETALD,
          sammanhängande långanalys (Matchrapport). Resten (H2H/form/
          nyckelspelare/ligasnitt) är EGNA fria sektioner nedan, inte längre
          instängda bakom samma spärr som Matchrapporten. */}
      {matchRecap && (
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: colors.accent.matchPreview }}>
            ⚡ Snabbanalys
          </p>
          <div className="mt-5">
            <MatchRecapCard recap={matchRecap} />
          </div>
        </div>
      )}

      {(preMatchNarrative.length > 0 || postMatchNarrative) && (
        <div className={matchRecap ? "border-t border-white/5 pt-10" : ""}>
          <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: colors.accent.matchPreview }}>
            🔮 Matchrapport
          </p>
          <PremiumGate
            hasAccess={hasPreviewAccess}
            title="Matchrapport"
            description="Den fullständiga analysen — inför matchen och (när matchen är spelad) hur den höll mot facit. Kräver ett Scout-medlemskap."
            emoji="🔮"
            accentColor={colors.accent.matchPreview}
            ctaLabel="Lås upp Matchrapport"
          >
            <div className="mt-5">
              <MatchNarrativeCard preMatch={preMatchNarrative} postMatch={postMatchNarrative} verdict={matchRecap?.verdict ?? null} />
            </div>
          </PremiumGate>
        </div>
      )}

      {/* Fas 17 — den här sektionen (tabellplacering/H2H/form/nyckelspelare/
          ligasnitt) visades tidigare BARA när Sportmonks fixture_match_facts
          fanns (preview.available) — vilket ALDRIG är fallet för en kommande
          match (den importen körs bara på redan avslutade matcher, se
          sportmonks-import-match-facts.ts:s filhuvud). Tabellplacering/H2H/
          form är nu byggda på egen, alltid tillgänglig data (standings +
          fixture-tabellen) — så en kommande match får samma "det vi redan
          vet"-sektion som en spelad match, bara utan Nyckelspelare/Ligasnitt
          (de kräver fortfarande Sportmonks per-spelare-fakta). */}
      {(preview.available || homeStanding || awayStanding || h2hSummary || (homeFormRecord && homeFormRecord.played > 0) || (awayFormRecord && awayFormRecord.played > 0)) && (
        <div className={matchRecap || preMatchNarrative.length > 0 ? "space-y-10 border-t border-white/5 pt-10" : "space-y-10"}>
          {(homeStanding || awayStanding) && (
            <div>
              <p className="mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
                <span aria-hidden>🏆</span> Tabellplacering
              </p>
              <MatchStandingsSummary home={homeStanding} away={awayStanding} homeName={homeName} awayName={awayName} />
            </div>
          )}

          {h2hSummary &&
            (preview.headToHead.length > 0 ? (
              <div>
                <FactSection
                  icon="⚔️"
                  title="Inbördes möten"
                  facts={preview.headToHead}
                  homeName={homeName}
                  awayName={awayName}
                  summary={<MatchHeadToHeadSummary summary={h2hSummary} homeName={homeName} awayName={awayName} />}
                />
              </div>
            ) : (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
                  <span aria-hidden>⚔️</span> Inbördes möten
                </p>
                <MatchHeadToHeadSummary summary={h2hSummary} homeName={homeName} awayName={awayName} />
              </div>
            ))}

          {((homeFormRecord && homeFormRecord.played > 0) || (awayFormRecord && awayFormRecord.played > 0) || preview.form.length > 0) && (
            <div>
              <p className="mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
                <span aria-hidden>📈</span> Senaste form
              </p>
              {(homeFormRecord || awayFormRecord) && (
                <div className="grid gap-6 sm:grid-cols-2">
                  {homeFormRecord && homeFormRecord.played > 0 && <MatchFormSequence teamName={homeName} record={homeFormRecord} />}
                  {awayFormRecord && awayFormRecord.played > 0 && <MatchFormSequence teamName={awayName} record={awayFormRecord} />}
                </div>
              )}
              {preview.form.length > 0 && (
                <details className="group mt-4">
                  <summary className="cursor-pointer list-none text-xs font-medium text-[#898781] marker:content-none hover:text-[#c3c2b7]">
                    Visa formdetaljer ({preview.form.length}) <span className="text-[#5f5e59] group-open:hidden">▾</span>
                    <span className="hidden text-[#5f5e59] group-open:inline">▴</span>
                  </summary>
                  <ul className="mt-2 divide-y divide-white/5 border-t border-white/5">
                    {toDisplayFacts(preview.form, homeName, awayName).map((f) => (
                      <FactRow key={f.key} fact={f} />
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {(keyPlayerCategories.length > 0 || uncoveredPlayerFacts.length > 0) && (
            <div>
              <p className="mb-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
                <span aria-hidden>🧠</span> Nyckelspelare
              </p>
              {keyPlayerCategories.length > 0 && <MatchKeyPlayers categories={keyPlayerCategories} />}
              {uncoveredPlayerFacts.length > 0 && (
                <ul className={keyPlayerCategories.length > 0 ? "mt-5 space-y-1.5 border-t border-white/5 pt-4" : ""}>
                  {toDisplayFacts(uncoveredPlayerFacts, homeName, awayName).map((f) => (
                    <FactRow key={f.key} fact={f} />
                  ))}
                </ul>
              )}
            </div>
          )}

          {(leagueComparisons.length > 0 || uncoveredComparisonFacts.length > 0) && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
                <span aria-hidden>📊</span> Jämfört med ligasnittet
              </p>
              {leagueComparisons.length > 0 && <MatchLeagueComparisons comparisons={leagueComparisons} />}
              {uncoveredComparisonFacts.length > 0 && (
                <ul className={leagueComparisons.length > 0 ? "mt-3 space-y-1.5" : ""}>
                  {toDisplayFacts(uncoveredComparisonFacts, homeName, awayName).map((f) => (
                    <FactRow key={f.key} fact={f} />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Bara relevant när något av ovan faktiskt kommer från Sportmonks
              facts — en kommande match utan sådan data (bara tabellplacering/
              riktig H2H/form) ska inte påstå en källa den inte använder. */}
          {preview.available && (
            <p className="text-[10px] text-[#5f5e59]">
              Källa: Sportmonks. Rader märkta <span className="rounded border border-white/10 px-1 py-px">EN</span> kunde inte översättas
              säkert och visas i original.
            </p>
          )}
        </div>
      )}

      {/* LEVEL 3 — DATA. Sektionsdelare (border-t) istället för egna kort —
          samma yta som Intelligence-zonen ovan, bara utan premium-spärren. */}
      {(homeLineup || awayLineup) && (
        <div className="border-t border-white/5 pt-8">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <span aria-hidden>👥</span> Startelvor
          </h2>
          <div className="mt-6 grid gap-8 sm:grid-cols-2">
            {[
              { team: homeName, lineup: homeLineup },
              { team: awayName, lineup: awayLineup },
            ].map(({ team, lineup }) => (
              <div key={team}>
                <div className="flex items-baseline justify-between">
                  <p className="text-base font-bold text-white">{team}</p>
                  {lineup?.formation && <p className="text-xs font-medium tabular-nums text-[#898781]">{lineup.formation}</p>}
                </div>
                {lineup ? (
                  <>
                    {(() => {
                      const starters = lineup.fixture_lineup_player.filter((p) => p.is_starter);
                      const pitchPlayers = buildPitchPlayers(starters);
                      return pitchPlayers ? (
                        <div className="mt-3">
                          <FormationPitch players={pitchPlayers} />
                        </div>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {starters.map((p, i) => (
                            <LineupPlayerRow key={i} player={p.player} shirtNumber={p.shirt_number} />
                          ))}
                        </ul>
                      );
                    })()}
                    {lineup.fixture_lineup_player.some((p) => !p.is_starter) && (
                      <>
                        <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-[#7d7c76]">Avbytare</p>
                        <ul className="space-y-2">
                          {lineup.fixture_lineup_player
                            .filter((p) => !p.is_starter)
                            .map((p, i) => (
                              <LineupPlayerRow key={i} player={p.player} shirtNumber={p.shirt_number} dim />
                            ))}
                        </ul>
                      </>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-xs text-[#7d7c76]">Ingen laguppställning sparad för den här matchen.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {statRows.length > 0 ? (
        <div className="border-t border-white/5 pt-8">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <span aria-hidden>📊</span> Lagstatistik
          </h2>
          <div className="mt-5 flex items-center justify-between text-[11px] uppercase tracking-wide text-[#7d7c76]">
            <span>{report.home?.name ?? "Hemma"}</span>
            <span>{report.away?.name ?? "Borta"}</span>
          </div>
          <div className="mt-1 divide-y divide-white/5">
            {statRows.map((row) => (
              <StatCompareRow
                key={row.key}
                label={row.label}
                home={matchStats.home?.[row.key] ?? null}
                away={matchStats.away?.[row.key] ?? null}
                suffix={row.suffix}
              />
            ))}
          </div>
        </div>
      ) : isTrackable ? (
        // Renderar sin egen sektion (rubrik inkluderad) eller ingenting alls
        // — se komponentens kommentar om varför rubriken bor där.
        <LiveMatchStats initial={liveFeed} fixtureId={report.id} homeName={homeName} awayName={awayName} />
      ) : null}

      <div className="border-t border-white/5 pt-8">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <span aria-hidden>⏱️</span> Matchhändelser
        </h2>
        <div className="mt-5">
          {/* Fas 20: en pågående match får den pollande varianten (samma
              visuella tidslinje, färska händelser). En spelad match
              renderas helt på servern — ingen anledning att starta en
              timer på en sida där inget kan hända. */}
          {isTrackable ? (
            <LiveMatchTimeline initial={liveFeed} fixtureId={report.id} homeName={homeName} awayName={awayName} />
          ) : (
            <MatchTimeline events={report.events} homeName={homeName} awayName={awayName} />
          )}
        </div>
      </div>
    </div>
  );
}
