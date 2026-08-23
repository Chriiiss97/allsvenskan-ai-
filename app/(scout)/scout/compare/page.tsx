import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { comparePlayers, getTeamComparison, FootballDataError } from "@/lib/football/tools";
import { computePlayerDNA } from "@/lib/football/player-dna";
import { computeRatingForPlayer } from "@/lib/football/rating/compute-rating";
import { EntityCompareControls } from "@/components/data/EntityCompareControls";
import type { EntityOption } from "@/components/data/EntityPicker";
import { CompareStatGroup, type CompareStat } from "@/components/data/CompareStatRows";
import { VersusHero, VersusHeroSide } from "@/components/data/VersusHero";
import { HeadToHeadMatchList } from "@/components/data/HeadToHeadMatchList";
import { PlayerCompareRadar } from "@/components/data/PlayerCompareRadar";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { FormBadges } from "@/components/data/FormBadges";
import { RecordBar } from "@/components/data/RecordBar";
import { getAvailableSeasons, listTeams } from "@/lib/football/catalog";
import { translatePosition } from "@/lib/i18n/sv";
import { ageAtSeason } from "@/lib/football/age";
import { ovrColor } from "@/lib/football/rating/ovr-color";
import { colors } from "@/lib/design/tokens";

/**
 * Fas 14.4 (plans/humble-giggling-biscuit.md) — Scout Compare. Flyttar
 * f.d. /spelare/compare OCH /lag/compare hit som EN sida med ett
 * spelare/lag-lägesväxel.
 *
 * Fas 19 (användarfeedback: "gör om hela jämför-UI:t på både spelare och lag
 * så den ser mer stilren ut och inte så mycket plotter men mer data att läsa
 * av på ett enkelt sätt") — omdesignad, men på SAMMA data och samma
 * jämförelselogik (comparePlayers/getTeamComparison är orörda). Tre
 * genomgående principer, lika i båda lägena:
 *
 *  1. EN hjälte (VersusHero) högst upp med identitet + huvudsiffran (OVR för
 *     spelare, poäng för lag) — istället för att den informationen låg
 *     utspridd i kortrubriker längre ner.
 *  2. ETT jämförelsespråk för varje mått (CompareStatRows fjärilsrad, ledaren
 *     färgad + fetstilad) — ersätter det tidigare paret "platt tabell för
 *     spelare" + "staplar för lag", som visade samma sak på två sätt.
 *  3. Färre, tätare kort. Player Rating/DNA:s compact-kort (fyra stora kort,
 *     mest tom yta) är borta: OVR, underlagsdisklosyren och spelartypen bor
 *     nu i hjälten, DNA-insikterna i en egen tvåspaltssektion — samma data,
 *     ungefär halva höjden.
 */

interface PlayerInsightStats {
  goals: number;
  assists: number;
  shotsTotal: number | null;
  rating: number | null;
}

function buildPlayerInsights(
  a: { name: string; stats: PlayerInsightStats; ovr: number | null },
  b: { name: string; stats: PlayerInsightStats; ovr: number | null }
): string[] {
  const insights: string[] = [];
  function compareCount(label: string, va: number | null, vb: number | null) {
    if (va === null || vb === null || va === vb) return;
    const [leader, leaderVal, otherVal] = va > vb ? [a, va, vb] : [b, vb, va];
    insights.push(`${leader.name} har fler ${label} (${leaderVal} mot ${otherVal}).`);
  }
  compareCount("mål", a.stats.goals, b.stats.goals);
  compareCount("assist", a.stats.assists, b.stats.assists);
  compareCount("skott", a.stats.shotsTotal, b.stats.shotsTotal);
  if (a.stats.rating !== null && b.stats.rating !== null && a.stats.rating !== b.stats.rating) {
    const leader = a.stats.rating > b.stats.rating ? a : b;
    insights.push(`${leader.name} har högst snittbetyg den här säsongen.`);
  }
  if (a.ovr !== null && b.ovr !== null && a.ovr !== b.ovr) {
    const leader = a.ovr > b.ovr ? a : b;
    insights.push(`${leader.name} har högst Player Rating-OVR (${leader.ovr}).`);
  }
  return insights;
}

function buildTeamInsights(comparison: Awaited<ReturnType<typeof getTeamComparison>>): string[] {
  const { teamA, teamB } = comparison;
  if (teamA.points === teamB.points) return [];
  const leader = teamA.points > teamB.points ? teamA : teamB;
  const other = leader === teamA ? teamB : teamA;
  const insights: string[] = [];
  insights.push(`${leader.name} har ${leader.points - other.points} fler poäng (${leader.points} mot ${other.points}).`);
  if (leader.wins > other.wins) insights.push(`${leader.name} har vunnit ${leader.wins - other.wins} fler matcher.`);
  const gdLeader = leader.goalsFor - leader.goalsAgainst;
  const gdOther = other.goalsFor - other.goalsAgainst;
  if (gdLeader > gdOther) {
    const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    insights.push(`${leader.name} har bättre målskillnad (${fmt(gdLeader)} mot ${fmt(gdOther)}).`);
  }
  const leaderFormWins = leader.form.filter((r) => r === "W").length;
  const otherFormWins = other.form.filter((r) => r === "W").length;
  if (leaderFormWins > otherFormWins) {
    insights.push(`${leader.name} har bättre form just nu (${leaderFormWins} vinster av senaste ${leader.form.length}).`);
  }
  return insights;
}

// ---------------------------------------------------------------------------
// Delade layoutbitar (bara den här sidan — medvetet lokala, de bär ingen
// betydelse utanför jämförelsevyn)
// ---------------------------------------------------------------------------

/** Kortram — EN ytdefinition för sidans alla paneler, istället för samma
 *  border/bg/padding upprepad tio gånger i JSX:en. */
function Panel({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#141418] p-5">
      {title && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7d7c76]">{title}</h2>
          {hint && <span className="shrink-0 text-[10px] text-[#5f5e59]">{hint}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Skillnaderna som en tät tvåspaltslista istället för ett eget stort kort. */
function InsightList({ insights }: { insights: string[] }) {
  if (insights.length === 0) return null;
  return (
    <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {insights.map((line, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-[#c3c2b7]">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#a78bfa]" aria-hidden />
          {line}
        </li>
      ))}
    </ul>
  );
}

/** Säsongsväljare — samma pillrad i båda lägena (lagläget saknade den helt förut). */
function SeasonPills({
  seasons,
  seasonYear,
  hrefFor,
  latestLabel,
}: {
  seasons: { year: number }[];
  seasonYear?: number;
  hrefFor: (year?: number) => string;
  latestLabel: string;
}) {
  const pill = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
    }`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-[#7d7c76]">Säsong</span>
      <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-[#141418] p-1">
        <Link href={hrefFor()} className={pill(!seasonYear)}>
          {latestLabel}
        </Link>
        {seasons.map((s) => (
          <Link key={s.year} href={hrefFor(s.year)} className={pill(seasonYear === s.year)}>
            {s.year}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default async function ScoutComparePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; a?: string; b?: string; season?: string }>;
}) {
  const { mode: modeParam, a, b, season } = await searchParams;
  const mode: "spelare" | "lag" = modeParam === "lag" ? "lag" : "spelare";
  const supabase = await createClient();
  const seasons = await getAvailableSeasons(supabase);
  const seasonYear = season ? Number(season) : undefined;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Jämför</h1>
      <p className="mt-1 text-sm text-[#898781]">
        Två spelare eller två lag sida vid sida — ledaren i varje mått är markerad.
      </p>

      <div className="mt-4 flex gap-1 rounded-lg border border-white/10 bg-[#1a1a19] p-1 text-sm">
        <Link
          href="/scout/compare?mode=spelare"
          className={`flex-1 rounded-md px-3 py-1.5 text-center font-medium transition-colors ${
            mode === "spelare" ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
          }`}
        >
          Spelare
        </Link>
        <Link
          href="/scout/compare?mode=lag"
          className={`flex-1 rounded-md px-3 py-1.5 text-center font-medium transition-colors ${
            mode === "lag" ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
          }`}
        >
          Lag
        </Link>
      </div>

      {mode === "spelare" ? (
        <PlayerCompareSection a={a} b={b} seasonYear={seasonYear} seasons={seasons} supabase={supabase} />
      ) : (
        <TeamCompareSection a={a} b={b} seasonYear={seasonYear} seasons={seasons} supabase={supabase} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spelare
// ---------------------------------------------------------------------------

async function PlayerCompareSection({
  a,
  b,
  seasonYear,
  seasons,
  supabase,
}: {
  a?: string;
  b?: string;
  seasonYear?: number;
  seasons: { year: number }[];
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data: playersData } = await supabase
    .from("player")
    .select("id, full_name, current_team:current_team_id(name)")
    .order("full_name")
    .returns<{ id: number; full_name: string; current_team: { name: string } | null }[]>();
  const players = playersData ?? [];

  const idA = a ? Number(a) : null;
  const idB = b ? Number(b) : null;

  let comparison: Awaited<ReturnType<typeof comparePlayers>> | null = null;
  let error: string | null = null;
  let insights: string[] = [];
  let dnaA: Awaited<ReturnType<typeof computePlayerDNA>> | null = null;
  let dnaB: Awaited<ReturnType<typeof computePlayerDNA>> | null = null;
  let ratingA: Awaited<ReturnType<typeof computeRatingForPlayer>> | null = null;
  let ratingB: Awaited<ReturnType<typeof computeRatingForPlayer>> | null = null;

  if (idA && idB) {
    try {
      comparison = await comparePlayers(supabase, { playerA: String(idA), playerB: String(idB), season: seasonYear });
      [dnaA, dnaB, ratingA, ratingB] = await Promise.all([
        comparison.playerA.season ? computePlayerDNA(supabase, { playerId: comparison.playerA.player.id, season: comparison.playerA.season }) : Promise.resolve(null),
        comparison.playerB.season ? computePlayerDNA(supabase, { playerId: comparison.playerB.player.id, season: comparison.playerB.season }) : Promise.resolve(null),
        comparison.playerA.season ? computeRatingForPlayer(supabase, { playerId: comparison.playerA.player.id, position: comparison.playerA.player.position, season: comparison.playerA.season }) : Promise.resolve(null),
        comparison.playerB.season ? computeRatingForPlayer(supabase, { playerId: comparison.playerB.player.id, position: comparison.playerB.player.position, season: comparison.playerB.season }) : Promise.resolve(null),
      ]);
      insights = buildPlayerInsights(
        { name: comparison.playerA.player.name, stats: comparison.playerA.stats, ovr: ratingA?.rating.ovr ?? null },
        { name: comparison.playerB.player.name, stats: comparison.playerB.stats, ovr: ratingB?.rating.ovr ?? null }
      );
    } catch (err) {
      error = err instanceof FootballDataError ? err.message : "Kunde inte jämföra spelarna.";
    }
  }

  return (
    <>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <EntityCompareControls
          options={players.map((p): EntityOption => ({ id: p.id, label: p.full_name, subLabel: p.current_team?.name }))}
          idA={idA}
          idB={idB}
          basePath="/scout/compare?mode=spelare"
          labelA="Spelare A"
          labelB="Spelare B"
          className="contents"
        />
      </div>

      {idA && idB && (
        <div className="mt-3">
          <SeasonPills
            seasons={seasons}
            seasonYear={seasonYear}
            latestLabel="Senaste var för sig"
            hrefFor={(year) =>
              `/scout/compare?mode=spelare&a=${idA}&b=${idB}${year ? `&season=${year}` : ""}`
            }
          />
        </div>
      )}

      {error && <p className="mt-6 text-sm text-[#e66767]">{error}</p>}

      {comparison && (
        <PlayerCompareBody comparison={comparison} ratingA={ratingA} ratingB={ratingB} dnaA={dnaA} dnaB={dnaB} insights={insights} />
      )}

      {!comparison && !error && (
        <p className="mt-8 text-center text-sm text-[#898781]">Välj två spelare ovan för att jämföra.</p>
      )}
    </>
  );
}

function PlayerHeroSide({
  side,
  player,
  season,
  rating,
  dna,
}: {
  side: "a" | "b";
  player: Awaited<ReturnType<typeof comparePlayers>>["playerA"]["player"];
  season: number | null;
  rating: Awaited<ReturnType<typeof computeRatingForPlayer>> | null;
  dna: Awaited<ReturnType<typeof computePlayerDNA>> | null;
}) {
  const ovr = rating?.rating.available ? rating.rating.ovr : null;
  const confidence = rating?.rating.confidence ?? null;
  const age = season ? ageAtSeason(player.birthDate, season) : null;
  const sub = [translatePosition(player.position), age !== null ? `${age} år` : null, player.displayTeamName]
    .filter(Boolean)
    .join(" · ");

  return (
    <VersusHeroSide
      side={side}
      media={
        <PlayerAvatar
          name={player.name}
          photoUrl={player.photoUrl}
          teamExternalId={player.team?.external_id}
          size={56}
        />
      }
      name={player.name}
      subLabel={sub || undefined}
      headlineValue={ovr ?? "—"}
      headlineLabel={season ? `OVR ${season}` : "OVR"}
      headlineColor={ovr !== null ? ovrColor(ovr) : colors.text.faint}
      badge={
        dna?.available && dna.playerType.label ? (
          <span
            className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#c3c2b7]"
            title={dna.playerType.reason ?? undefined}
          >
            {dna.playerType.label}
          </span>
        ) : undefined
      }
      note={
        confidence
          ? `Bland Allsvenskans ${confidence.peerLabel} · ${confidence.peerCount} jämförda · ${confidence.ownMinutes} egna minuter`
          : undefined
      }
    />
  );
}

function PlayerCompareBody({
  comparison,
  ratingA,
  ratingB,
  dnaA,
  dnaB,
  insights,
}: {
  comparison: NonNullable<Awaited<ReturnType<typeof comparePlayers>>>;
  ratingA: Awaited<ReturnType<typeof computeRatingForPlayer>> | null;
  ratingB: Awaited<ReturnType<typeof computeRatingForPlayer>> | null;
  dnaA: Awaited<ReturnType<typeof computePlayerDNA>> | null;
  dnaB: Awaited<ReturnType<typeof computePlayerDNA>> | null;
  insights: string[];
}) {
  const A = comparison.playerA;
  const B = comparison.playerB;
  const sameSeason = A.season === B.season;

  const key: CompareStat[] = [
    { label: "Mål", a: A.stats.goals, b: B.stats.goals },
    { label: "Assist", a: A.stats.assists, b: B.stats.assists },
    { label: "Snittbetyg", a: A.stats.rating, b: B.stats.rating, decimals: 2 },
    { label: "Spelade minuter", a: A.stats.minutesPlayed, b: B.stats.minutesPlayed },
    { label: "Matcher", a: A.stats.appearances, b: B.stats.appearances, neutral: true },
  ];

  const per90: CompareStat[] = [
    { label: "Mål", a: A.per90.goals, b: B.per90.goals, decimals: 2 },
    { label: "Assist", a: A.per90.assists, b: B.per90.assists, decimals: 2 },
    { label: "Skott", a: A.per90.shotsTotal, b: B.per90.shotsTotal, decimals: 2 },
    { label: "Nyckelpassningar", a: A.per90.passesKey, b: B.per90.passesKey, decimals: 2 },
    { label: "Vunna dueller", a: A.per90.duelsWon, b: B.per90.duelsWon, decimals: 2 },
    { label: "Tacklingar", a: A.per90.tacklesTotal, b: B.per90.tacklesTotal, decimals: 2 },
  ];

  const attack: CompareStat[] = [
    { label: "Skott", a: A.stats.shotsTotal, b: B.stats.shotsTotal },
    { label: "Skott på mål", a: A.stats.shotsOnTarget, b: B.stats.shotsOnTarget },
    { label: "Dribblingsförsök", a: A.stats.dribblesAttempts, b: B.stats.dribblesAttempts, neutral: true },
    { label: "Lyckade dribblingar", a: A.stats.dribblesSuccess, b: B.stats.dribblesSuccess },
  ];

  const passing: CompareStat[] = [
    { label: "Passningar", a: A.stats.passesTotal, b: B.stats.passesTotal },
    { label: "Nyckelpassningar", a: A.stats.passesKey, b: B.stats.passesKey },
    { label: "Passningssäkerhet", a: A.stats.passesAccuracy, b: B.stats.passesAccuracy, suffix: "%" },
  ];

  const defending: CompareStat[] = [
    { label: "Tacklingar", a: A.stats.tacklesTotal, b: B.stats.tacklesTotal },
    { label: "Brytningar", a: A.stats.tacklesInterceptions, b: B.stats.tacklesInterceptions },
    { label: "Blockeringar", a: A.stats.tacklesBlocks, b: B.stats.tacklesBlocks },
    { label: "Vunna dueller", a: A.stats.duelsWon, b: B.stats.duelsWon },
    { label: "Duellprocent", a: A.duelsWinRate, b: B.duelsWinRate, suffix: "%", decimals: 1 },
  ];

  const discipline: CompareStat[] = [
    { label: "Gula kort", a: A.stats.yellowCards, b: B.stats.yellowCards, lowerIsBetter: true },
    { label: "Röda kort", a: A.stats.redCards, b: B.stats.redCards, lowerIsBetter: true },
    { label: "Begångna frisparkar", a: A.stats.foulsCommitted, b: B.stats.foulsCommitted, lowerIsBetter: true },
    { label: "Dragna frisparkar", a: A.stats.foulsDrawn, b: B.stats.foulsDrawn },
  ];

  return (
    <div className="mt-5 space-y-4">
      <VersusHero
        left={<PlayerHeroSide side="a" player={A.player} season={A.season} rating={ratingA} dna={dnaA} />}
        right={<PlayerHeroSide side="b" player={B.player} season={B.season} rating={ratingB} dna={dnaB} />}
        caption={
          sameSeason
            ? `Säsong ${A.season ?? "—"} · all statistik nedan gäller den säsongen`
            : `Olika säsonger: ${A.player.name} ${A.season ?? "—"} mot ${B.player.name} ${B.season ?? "—"} (respektive senast tillgängliga)`
        }
      />

      {insights.length > 0 && (
        <Panel title="Skillnader">
          <InsightList insights={insights} />
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Nyckeltal" hint="ledaren markerad">
          <CompareStatGroup stats={key} />
        </Panel>
        <Panel title="Per 90 minuter" hint="jämförbart oavsett speltid">
          <CompareStatGroup stats={per90} />
        </Panel>
      </div>

      <Panel title="Per 90 minuter, relativt varandra" hint="ledaren på varje axel = 100%">
        <PlayerCompareRadar nameA={A.player.name} nameB={B.player.name} per90A={A.per90} per90B={B.per90} />
      </Panel>

      <Panel title="All statistik" hint="säsongstotaler">
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <CompareStatGroup title="Anfall" stats={attack} />
          <CompareStatGroup title="Passningsspel" stats={passing} />
          <CompareStatGroup title="Försvar & dueller" stats={defending} />
          <CompareStatGroup title="Disciplin" stats={discipline} />
        </div>
      </Panel>

      {(dnaA?.available || dnaB?.available) && (
        <Panel title="Spelarprofil" hint="Player DNA">
          <div className="grid gap-5 sm:grid-cols-2">
            {[
              { name: A.player.name, dna: dnaA, color: colors.compare.a },
              { name: B.player.name, dna: dnaB, color: colors.compare.b },
            ].map(({ name, dna, color }) => (
              <div key={name}>
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                  {name}
                </p>
                {dna?.available ? (
                  <>
                    {dna.summary && <p className="mt-1.5 text-[13px] leading-relaxed text-[#c3c2b7]">{dna.summary}</p>}
                    {dna.insights.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {dna.insights.map((insight, i) => (
                          <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-[#898781]">
                            <span
                              className="mt-1.5 h-1 w-1 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  insight.type === "strength"
                                    ? colors.status.confidence.high
                                    : insight.type === "weakness"
                                      ? colors.status.confidence.low
                                      : insight.type === "unique"
                                        ? colors.accent.football
                                        : colors.accent.admin,
                              }}
                              aria-hidden
                            />
                            {insight.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="mt-1.5 text-[13px] text-[#7d7c76]">{dna?.unavailableReason ?? "Ingen DNA-analys."}</p>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lag
// ---------------------------------------------------------------------------

async function TeamCompareSection({
  a,
  b,
  seasonYear,
  seasons,
  supabase,
}: {
  a?: string;
  b?: string;
  seasonYear?: number;
  seasons: { year: number }[];
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const teams = await listTeams(supabase);

  let comparison: Awaited<ReturnType<typeof getTeamComparison>> | null = null;
  let error: string | null = null;

  try {
    comparison = await getTeamComparison(supabase, { teamA: a ?? "IFK Göteborg", teamB: b ?? "AIK", season: seasonYear });
  } catch (err) {
    error = err instanceof FootballDataError ? err.message : "Kunde inte jämföra lagen.";
  }

  let logos: Record<string, string | null> = {};
  if (comparison) {
    const { data: logoRows } = await supabase
      .from("team")
      .select("name, logo_url")
      .in("name", [comparison.teamA.name, comparison.teamB.name])
      .returns<{ name: string; logo_url: string | null }[]>();
    logos = Object.fromEntries((logoRows ?? []).map((r) => [r.name, r.logo_url]));
  }

  const insights = comparison ? buildTeamInsights(comparison) : [];

  return (
    <>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <EntityCompareControls
          options={teams
            .filter((t) => t.external_id !== null)
            .map((t): EntityOption => ({ id: t.external_id as number, label: t.name, logoUrl: t.logoUrl }))}
          idA={comparison?.teamA.externalId ?? null}
          idB={comparison?.teamB.externalId ?? null}
          basePath="/scout/compare?mode=lag"
          labelA="Lag A"
          labelB="Lag B"
          className="contents"
        />
      </div>

      {comparison && (
        <div className="mt-3">
          <SeasonPills
            seasons={seasons}
            seasonYear={seasonYear}
            latestLabel="Senaste säsongen"
            hrefFor={(year) =>
              `/scout/compare?mode=lag&a=${comparison!.teamA.externalId ?? ""}&b=${comparison!.teamB.externalId ?? ""}${year ? `&season=${year}` : ""}`
            }
          />
        </div>
      )}

      {error && <p className="mt-6 text-sm text-[#e66767]">{error}</p>}

      {comparison && <TeamCompareBody comparison={comparison} logos={logos} insights={insights} />}
    </>
  );
}

function TeamHeroSide({
  side,
  team,
  logoUrl,
}: {
  side: "a" | "b";
  team: Awaited<ReturnType<typeof getTeamComparison>>["teamA"];
  logoUrl: string | null | undefined;
}) {
  return (
    <VersusHeroSide
      side={side}
      media={
        logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- extern logga
          <img src={logoUrl} alt="" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
        ) : undefined
      }
      name={team.name}
      subLabel={`${team.played} matcher · ${team.wins}-${team.draws}-${team.losses}`}
      headlineValue={team.points}
      headlineLabel="Poäng"
      note={`${team.goalsFor} mål gjorda · ${team.goalsAgainst} insläppta`}
    />
  );
}

function TeamCompareBody({
  comparison,
  logos,
  insights,
}: {
  comparison: NonNullable<Awaited<ReturnType<typeof getTeamComparison>>>;
  logos: Record<string, string | null>;
  insights: string[];
}) {
  const A = comparison.teamA;
  const B = comparison.teamB;
  const gdA = A.goalsFor - A.goalsAgainst;
  const gdB = B.goalsFor - B.goalsAgainst;

  const seasonStats: CompareStat[] = [
    { label: "Matcher", a: A.played, b: B.played, neutral: true },
    { label: "Poäng", a: A.points, b: B.points },
    { label: "Poäng per match", a: A.played ? A.points / A.played : null, b: B.played ? B.points / B.played : null, decimals: 2 },
    { label: "Vinster", a: A.wins, b: B.wins },
    { label: "Oavgjorda", a: A.draws, b: B.draws, neutral: true },
    { label: "Förluster", a: A.losses, b: B.losses, lowerIsBetter: true },
    { label: "Mål för", a: A.goalsFor, b: B.goalsFor },
    { label: "Mål mot", a: A.goalsAgainst, b: B.goalsAgainst, lowerIsBetter: true },
    { label: "Målskillnad", a: gdA, b: gdB },
    { label: "Mål per match", a: A.played ? A.goalsFor / A.played : null, b: B.played ? B.goalsFor / B.played : null, decimals: 2 },
  ];

  const h2h = comparison.headToHead;
  const h2hTotal = h2h.record.teamAWins + h2h.record.draws + h2h.record.teamBWins;

  return (
    <div className="mt-5 space-y-4">
      <VersusHero
        left={<TeamHeroSide side="a" team={A} logoUrl={logos[A.name]} />}
        right={<TeamHeroSide side="b" team={B} logoUrl={logos[B.name]} />}
        caption={`Säsong ${comparison.season ?? "—"} · resultatbaserat`}
        footer={
          <div className="grid grid-cols-2 gap-4">
            {[A, B].map((t, i) => (
              <div key={t.name} className={`flex flex-col gap-1.5 ${i === 0 ? "items-start" : "items-end"}`}>
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7d7c76]">
                  Form, senaste 5
                </span>
                <FormBadges form={t.form} />
              </div>
            ))}
          </div>
        }
      />

      {insights.length > 0 && (
        <Panel title="Varför ligger de till som de gör">
          <InsightList insights={insights} />
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Säsongen i siffror" hint="ledaren markerad">
          <CompareStatGroup stats={seasonStats} />
        </Panel>

        <Panel title="Inbördes möten" hint="alla säsonger">
          {h2hTotal > 0 ? (
            <>
              {/* Användarval (2026-08-23): sammanfattningsstapeln kör samma
                  grön/grå/röd som matchlistan under, inte lagparet blå/orange.
                  Grönt/rött är då ett PERSPEKTIV, inte en lagidentitet — därför
                  står det uttryckligen vems perspektiv det är. */}
              <p className="mb-1.5 text-[11px] text-[#7d7c76]">Sett från {A.name}</p>
              <RecordBar
                wins={h2h.record.teamAWins}
                draws={h2h.record.draws}
                losses={h2h.record.teamBWins}
                variant="form"
              />
              <div className="mt-2 flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-semibold" style={{ color: colors.status.result.win }}>
                  {h2h.record.teamAWins} <span className="font-normal text-[#7d7c76]">vinster</span>
                </span>
                <span className="shrink-0 text-[#7d7c76]">{h2h.record.draws} oavgjorda</span>
                <span className="truncate text-right font-semibold" style={{ color: colors.status.result.loss }}>
                  {h2h.record.teamBWins} <span className="font-normal text-[#7d7c76]">förluster</span>
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-[#898781]">Inga avgjorda inbördes möten i vår data.</p>
          )}

          <div className="mt-4 border-t border-white/5 pt-2">
            <p className="mb-1 text-[10px] text-[#5f5e59]">
              <span style={{ color: colors.status.result.win }}>Grönt</span> = vinnare ·{" "}
              <span style={{ color: colors.status.result.loss }}>rött</span> = förlorare ·{" "}
              <span style={{ color: colors.status.result.draw }}>grått</span> = oavgjort
            </p>
            <HeadToHeadMatchList matches={h2h.matches} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
