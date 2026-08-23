import Link from "next/link";
import type { ReactNode } from "react";
import { getCachedPostAllsvenskanPlayers, getCachedMostDecoratedAbroad, getCachedIncomingTransfers } from "@/lib/football/cached-reads";
import {
  aggregateByPreviousClub,
  computePostAllsvenskanInsights,
  aggregateDestinationLeagues,
  aggregateDestinationClubs,
} from "@/lib/football/post-allsvenskan";
import {
  computePostAllsvenskanSuccess,
  SUCCESS_MIN_APPEARANCES,
  SUCCESS_MIN_MINUTES,
  SUCCESS_WEIGHTS,
} from "@/lib/football/post-allsvenskan-success";
import { LEVEL_LABEL } from "@/lib/football/post-allsvenskan-level";
import { translateClubCountry } from "@/lib/i18n/sv";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { TransferDirectionTabs } from "@/components/scout/TransferDirectionTabs";
import { YearBars } from "@/components/scout/YearBars";

/**
 * Fas 18b (2026-08-22) — "Efter Allsvenskan": en egen Scout-flik (inte
 * gömd inuti enskilda spelarprofiler) som svarar på "vilka spelare har
 * lämnat Allsvenskan, och hur går det för dem?" + "vilka f.d. Allsvenska
 * klubbars spelare har presterat bäst utomlands?". Byggd på
 * lib/football/post-allsvenskan.ts — real data, samma källa som
 * spelarprofilernas Karriärresa (player_career_stint, se den filens
 * research-underlag).
 *
 * Fas 18j (2026-08-23) — "Mest lyckad efter Allsvenskan" tillkom, med en
 * definierad och öppet redovisad modell (post-allsvenskan-success.ts).
 * Användarbeslut samma dag: den visas som RUBRIK + MOTIVERING med verkliga
 * siffror, aldrig som ett poängtal — poängen finns bara för att kunna
 * sortera. "Så räknas det"-boxen längst ner är inte dekoration: kravet var
 * uttryckligen att metoden ska gå att granska, inte gissas.
 *
 * Fas 19b (2026-08-23, användarkrav "förbättra design och tydlighet på
 * hela efter allsvenskan") — designgenomgång, ingen datalogik ändrad:
 *   1. HIERARKI. Analysvyn var sex kort med IDENTISK form (samma violetta
 *      vänsterkant, samma yta, samma versala etikett) — en sammanfattning
 *      läste alltså lika tungt som ett diagram. Nu: EN hero-brief överst,
 *      resten som tydligt underordnade kort i ett tvåkolumnsraster.
 *   2. SPELARRADERNA. Hela historiken låg i EN trunkerande rad ("Lämnade
 *      X (2016) — spelade senast för Y · Land. Idag: Z." klipptes mitt i
 *      på vanliga skärmbredder). Nu tvåradigt: avgången på en rad, nuläget
 *      på nästa, inget klipps bort.
 *   3. SIFFERFORMAT. Tusentalsavgränsare (mellanslag, sv-SE) överallt —
 *      "17 431" istället för "17431", enligt användarens uttryckliga
 *      önskemål tidigare samma dag. Gällde förut bara klubbtabellen.
 *   4. AKTIV SORTERING syns nu i listan: kolumnen man sorterar på markeras,
 *      så man ser VARFÖR raderna ligger i den ordningen.
 */

type SortKey = "success" | "goals" | "assists" | "appearances" | "minutesPlayed" | "endurance";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "success", label: "🏆 Mest lyckad" },
  { key: "goals", label: "Flest mål" },
  { key: "assists", label: "Flest assist" },
  { key: "appearances", label: "Flest matcher" },
  { key: "minutesPlayed", label: "Mest speltid" },
  { key: "endurance", label: "Längst utomlands" },
];

function isValidSort(value: string | undefined): value is SortKey {
  return SORT_OPTIONS.some((o) => o.key === value);
}

/**
 * Fas 18l (2026-08-23, användarkorrigering) — de redaktionella korten (i
 * korthet / mest lyckad / längst etablerad / mest dekorerad / exportkurvan /
 * återvändare) plus klubbtabellen låg MELLAN sorteringsknapparna och
 * spelarlistan: varje gång man bytte sortering ("Flest mål" → "Flest assist")
 * fick man scrolla förbi hela analysen igen. De ligger nu i en egen vy
 * ("Scoutanalys"), ett klick bort — inte gömda, bara inte i vägen. Vyn är en
 * URL-parameter (`vy`) precis som `sort`/`club`, så den överlever länkning
 * och bakåtknappen.
 */
type View = "spelare" | "analys";

/**
 * PRESTANDA (2026-08-23, uppmätt) — spelarlistan renderade ALLA 928
 * kvalificerande spelare på en gång. Varje rad är ~30 element (avatar,
 * status-bricka, två historikrader, fyra sifferkolumner, mobilvariant), så
 * sidan blev 6 038 kB HTML — varav 3 885 kB enbart React-flightdata,
 * eftersom PlayerAvatar är en klientkomponent och alltså serialiseras en
 * gång per rad. Hela sidan tog 11–12,8 SEKUNDER att svara, och mätningen
 * visade att bara ~1,4s av det var databasen: resten var rendering och
 * serialisering av rader som ändå inte får plats på en skärm.
 *
 * Listan visar därför ett fönster i taget, med "Visa fler" som ökar det via
 * URL:en (`antal`) — samma mönster som `sort`/`club`/`vy` redan använder, så
 * det överlever länkning och bakåtknappen. Ingen data försvinner: totalen
 * står kvar i rubriken, sorteringen sker fortfarande över HELA mängden innan
 * fönstret skärs ut, och "Visa fler" kan öppna hela listan för den som vill.
 */
const PAGE_SIZE = 60;

/** Tusentalsavgränsare med mellanslag, enligt användarens uttryckliga önskemål ("280 878", inte "280878"). */
const nf = (n: number) => n.toLocaleString("sv-SE");

/**
 * Fas 22c (2026-08-23, användarkrav) — "Pensionerad" går FÖRE platsetiketten.
 * Statusraderna nedan svarar på VAR den senaste övergången ledde, vilket blir
 * direkt fel för den som lagt av: Pontus Wernbloom stod som "Tillbaka i
 * Allsvenskan" (IFK Göteborg 2020) trots att han slutade 2021. Se
 * lib/football/player-activity.ts för hur "retired" avgörs — och varför den
 * hellre tiger än gissar.
 */
const RETIRED_BADGE = { label: "🏁 Pensionerad", className: "bg-[#d9a526]/15 text-[#d9a526]" };

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  back_in_allsvenskan: { label: "🟢 Tillbaka i Allsvenskan", className: "bg-[#0ca30c]/15 text-[#0ca30c]" },
  back_in_sweden: { label: "🇸🇪 Tillbaka i Sverige", className: "bg-white/10 text-[#c3c2b7]" },
  abroad: { label: "🌍 Utomlands", className: "bg-[#3987e5]/15 text-[#3987e5]" },
};

/**
 * Gemensam form för analysvyns kort. Fanns förut som sex kopior av samma
 * markup — en delad komponent gör att de garanterat ser lika ut OCH att
 * hero-kortet (`tone="hero"`) kan skilja sig medvetet istället för av
 * misstag.
 */
function AnalysisCard({
  label,
  hint,
  tone = "default",
  children,
  footnote,
}: {
  label: string;
  hint?: string;
  tone?: "hero" | "default" | "gold";
  children: ReactNode;
  footnote?: ReactNode;
}) {
  const accent = tone === "gold" ? "border-l-[#d9a526]" : "border-l-[#a78bfa]";
  const labelColor = tone === "gold" ? "text-[#d9a526]" : "text-[#a78bfa]";
  return (
    <section className={`rounded-xl border border-white/10 border-l-2 ${accent} bg-[#141418] ${tone === "hero" ? "p-6" : "p-5"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${labelColor}`}>{label}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-[#898781]">{hint}</p>}
      <div className={tone === "hero" ? "mt-4" : "mt-3"}>{children}</div>
      {footnote && <p className="mt-4 border-t border-white/5 pt-3 text-[10px] leading-relaxed text-[#5f5e59]">{footnote}</p>}
    </section>
  );
}

/** "Närmast efter"-listorna — tre kopior av samma markup tidigare. */
function RunnerUpList({ title, rows }: { title: string; rows: { href: string; left: ReactNode; right: ReactNode; key: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 border-t border-white/5 pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7d7c76]">{title}</p>
      <div className="mt-1.5 space-y-0.5">
        {rows.map((r) => (
          <Link
            key={r.key}
            href={r.href}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs text-[#898781] transition-colors hover:bg-white/[.03] hover:text-white"
          >
            <span className="min-w-0 truncate">{r.left}</span>
            <span className="shrink-0 tabular-nums text-[#5f5e59]">{r.right}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function PostAllsvenskanPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; club?: string; vy?: string; antal?: string }>;
}) {
  const { sort: sortParam, club: clubFilter, vy, antal } = await searchParams;
  const sort: SortKey = isValidSort(sortParam) ? sortParam : "goals";
  const view: View = vy === "analys" ? "analys" : "spelare";

  const [players, decoratedAbroad, incoming] = await Promise.all([
    getCachedPostAllsvenskanPlayers(),
    getCachedMostDecoratedAbroad(),
    getCachedIncomingTransfers(),
  ]);
  const clubAggregates = aggregateByPreviousClub(players);
  const insights = computePostAllsvenskanInsights(players);
  const destinationLeagues = aggregateDestinationLeagues(players);
  const destinationClubs = aggregateDestinationClubs(players);

  /**
   * Fas 22b — export- och importkurvan på samma axel och samma skala.
   * Importsiffran är en ren årsräkning av de VERIFIERADE värvningarna från
   * incoming-transfers.ts (samma underlag som /scout/varvningar) — ingen ny
   * fråga, ingen egen definition här.
   *
   * Importunderlaget börjar 2015 medan exporten går tillbaka till 2008, och
   * det är en datagräns, inte ett faktum om verkligheten: en värvning räknas
   * först när spelaren FAKTISKT spelat allsvenskt för klubben, och den
   * matchstatistiken finns importerad från säsongen 2016 (övergångsåret kan
   * alltså tidigast vara 2015). Åren dessförinnan visas därför som "–", inte
   * som noll.
   */
  const incomingCountByYear = new Map<number, number>();
  for (const s of incoming) incomingCountByYear.set(s.transferYear, (incomingCountByYear.get(s.transferYear) ?? 0) + 1);
  const firstIncomingYear = incomingCountByYear.size > 0 ? Math.min(...incomingCountByYear.keys()) : null;
  const curveYears = [...new Set([...insights.exportsByYear.map((y) => y.year), ...incomingCountByYear.keys()])].sort((a, b) => a - b);
  const exportRows = curveYears.map((year) => ({ year, count: insights.exportsByYear.find((y) => y.year === year)?.count ?? 0 }));
  const importRows = curveYears.map((year) => ({
    year,
    count: firstIncomingYear !== null && year >= firstIncomingYear ? incomingCountByYear.get(year) ?? 0 : null,
  }));
  const maxCurveCount = Math.max(1, ...exportRows.map((r) => r.count), ...importRows.map((r) => r.count ?? 0));
  const { ranked, excludedByThreshold } = computePostAllsvenskanSuccess(players);
  const successByPlayerId = new Map(ranked.map((e) => [e.player.playerId, e]));
  const mostSuccessful = ranked[0] ?? null;

  const filtered = clubFilter ? players.filter((p) => p.previousTeamName === clubFilter) : players;
  const sortField: Record<SortKey, (p: (typeof players)[number]) => number> = {
    // Orankade spelare (under kvalgränsen) sist, aldrig utblandade i toppen.
    success: (p) => successByPlayerId.get(p.playerId)?.score ?? -1,
    goals: (p) => p.goals,
    assists: (p) => p.assists,
    appearances: (p) => p.appearances,
    minutesPlayed: (p) => p.minutesPlayed,
    endurance: (p) => p.longestAbroadStreakYears,
  };
  const sorted = [...filtered].sort((a, b) => sortField[sort](b) - sortField[sort](a));

  // Sorteringen sker över HELA mängden ovan — fönstret skärs ut först här,
  // så "Flest mål" alltid börjar med den faktiskt bästa målskytten.
  const requestedLimit = Number(antal);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, sorted.length) : PAGE_SIZE;
  const visible = sorted.slice(0, limit);
  const remaining = sorted.length - visible.length;

  // Klubbtabellen har ingen motsvarighet till "mest lyckad"/"längst
  // utomlands" (det är spelarmått, inte klubbsummor) — den faller tillbaka
  // på mål istället för att visa en tom eller påhittad kolumn.
  const clubSortField: Partial<Record<SortKey, (c: (typeof clubAggregates)[number]) => number>> = {
    goals: (c) => c.totalGoals,
    assists: (c) => c.totalAssists,
    appearances: (c) => c.totalAppearances,
    minutesPlayed: (c) => c.totalMinutes,
  };
  const clubSort = clubSortField[sort] ?? ((c: (typeof clubAggregates)[number]) => c.totalGoals);
  const sortedClubs = [...clubAggregates].sort((a, b) => clubSort(b) - clubSort(a));

  /**
   * Bygger en länk som BEHÅLLER allt man inte uttryckligen ändrar (sortering,
   * klubbfilter, vy). `antal` är avsiktligt INTE med i det som behålls: byter
   * man sortering eller filter vill man se toppen av den nya listan, inte
   * fortsätta 600 rader ner i den gamla.
   */
  const hrefFor = (next: { sort?: SortKey; club?: string | null; view?: View; limit?: number }) => {
    const params = new URLSearchParams();
    params.set("sort", next.sort ?? sort);
    const club = next.club === undefined ? clubFilter : next.club;
    if (club) params.set("club", club);
    if ((next.view ?? view) === "analys") params.set("vy", "analys");
    if (next.limit) params.set("antal", String(next.limit));
    return `/scout/efter-allsvenskan?${params.toString()}`;
  };

  // "Så räknas mest lyckad" hör hemma i analysvyn — men också i listan när
  // den FAKTISKT är sorterad på "Mest lyckad", annars står placeringarna där
  // helt oförklarade.
  const showMethod = mostSuccessful !== null && (view === "analys" || sort === "success");

  // Fas 19b — spelarradernas fyra sifferkolumner. Den man sorterar på
  // markeras, så ordningen aldrig ser godtycklig ut.
  const statColumns: { key: SortKey | null; label: string; value: (p: (typeof players)[number]) => string }[] = [
    { key: "goals", label: "Mål", value: (p) => nf(p.goals) },
    { key: "assists", label: "Assist", value: (p) => nf(p.assists) },
    { key: "appearances", label: "Matcher", value: (p) => nf(p.appearances) },
    { key: "minutesPlayed", label: "Minuter", value: (p) => nf(p.minutesPlayed) },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network · Värvningar</p>
      {/* Fas 22 — sidan är numera ena halvan av kategorin "Värvningar"
          (den andra är /scout/varvningar). Växlaren ligger på båda sidorna. */}
      <TransferDirectionTabs active="ut" />
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Efter Allsvenskan</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#898781]">
        <span className="font-semibold text-white">{nf(players.length)} spelare</span> med ett bekräftat klubbyte ut ur Allsvenskan till en
        utländsk toppdivision — real data (transfers + matchstatistik), inte en gissning om vilka som &quot;kan ha&quot; lämnat.
      </p>

      {/* Vyväxlare — medvetet en annan form än sorteringsknapparna nedan
          (segmenterad ram, inte fristående piller) så att det syns att den
          byter SIDINNEHÅLL, inte sortering. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="inline-flex rounded-lg border border-white/10 bg-[#141418] p-0.5">
          {([
            { key: "spelare", label: "🚀 Spelare" },
            { key: "analys", label: "📊 Scoutanalys" },
          ] as const).map((v) => (
            <Link
              key={v.key}
              href={hrefFor({ view: v.key })}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                view === v.key ? "bg-white text-black" : "text-[#898781] hover:text-white"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-[#5f5e59]">
          {view === "spelare" ? "Alla spelare, sorterbara." : "Ledare, trender och titlar — sammanställt."}
        </p>
      </div>

      {view === "analys" && (
        <div className="mt-6 space-y-4">
          {/*
            Fas 18h (2026-08-23, användarkrav) — "Efter Allsvenskan i korthet":
            en kompakt redaktionell brief, INTE fyra stora statistikkort (uttryckligt
            krav: "gör det visuellt snyggare än fyra vanliga kort... typ en editorial
            Scout-brief"). Läser bara redan Allsvensk-fritt filtrerade fält (se
            post-allsvenskan.ts:s filhuvud) — mål/assist/minuter kan aldrig läcka in
            Allsvensk statistik.

            Fas 19b — hero-form (större yta/typografi) så att briefen läser som
            sidans ingress istället för som ännu ett kort i högen.
          */}
          {(insights.topGoals || insights.topAssists || insights.topMinutes) && (
            <AnalysisCard label="Efter Allsvenskan i korthet" tone="hero">
              <div className="space-y-2.5 text-[15px] leading-relaxed text-[#c3c2b7]">
                {insights.topGoals && (
                  <p>
                    <Link href={`/scout/efter-allsvenskan/${insights.topGoals.playerId}`} className="font-semibold text-white hover:underline">
                      {insights.topGoals.playerName}
                    </Link>{" "}
                    har gjort flest mål efter sin flytt från Allsvenskan —{" "}
                    <span className="font-semibold text-white">{nf(insights.topGoals.goals)} mål</span>.
                  </p>
                )}
                {insights.topAssists && (
                  <p>
                    <Link href={`/scout/efter-allsvenskan/${insights.topAssists.playerId}`} className="font-semibold text-white hover:underline">
                      {insights.topAssists.playerName}
                    </Link>{" "}
                    har stått för flest assist — <span className="font-semibold text-white">{nf(insights.topAssists.assists)} assist</span>.
                  </p>
                )}
                {insights.topMinutes && (
                  <p>
                    <Link href={`/scout/efter-allsvenskan/${insights.topMinutes.playerId}`} className="font-semibold text-white hover:underline">
                      {insights.topMinutes.playerName}
                    </Link>{" "}
                    har spelat flest minuter efter sin Allsvenska exit —{" "}
                    <span className="font-semibold text-white">{nf(insights.topMinutes.minutesPlayed)} minuter</span>.
                  </p>
                )}
                {mostSuccessful && (
                  <p>
                    <Link href={`/scout/efter-allsvenskan/${mostSuccessful.player.playerId}`} className="font-semibold text-white hover:underline">
                      {mostSuccessful.player.playerName}
                    </Link>{" "}
                    är den spelare som sammantaget haft den{" "}
                    <span className="font-semibold text-white">starkast dokumenterade karriären</span> efter Allsvenskan.
                  </p>
                )}
              </div>
            </AnalysisCard>
          )}

          {/* Fas 19b — de fyra "ledartavlorna" i ett raster istället för en
              lodrät stapel: de svarar på jämförbara frågor och hör ihop. */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/*
              Fas 18j (2026-08-23, användarkrav 2) — "Scoutens mest lyckade export".
              Uttryckligt användarbeslut: rubrik + motivering, INGET poängtal ("det
              blir mycket mer premium än ett godtyckligt poängtal"). `highlights` är
              genererade ur spelarens VERKLIGA siffror i modellen, aldrig en generisk
              formulering — se post-allsvenskan-success.ts.
            */}
            {mostSuccessful && (
              <AnalysisCard label="🏆 Scoutens mest lyckade export" tone="gold">
                <Link href={`/scout/efter-allsvenskan/${mostSuccessful.player.playerId}`} className="group flex items-center gap-4">
                  <PlayerAvatar name={mostSuccessful.player.playerName} size={56} photoUrl={mostSuccessful.player.photoUrl} />
                  <div className="min-w-0">
                    <p className="truncate text-xl font-semibold tracking-tight text-white group-hover:underline">
                      {mostSuccessful.player.playerName}
                    </p>
                    <p className="text-sm italic text-[#898781]">&quot;Starkast dokumenterad karriär efter Allsvenskan&quot;</p>
                  </div>
                </Link>
                <ul className="mt-4 space-y-1.5 text-sm leading-relaxed text-[#c3c2b7]">
                  {mostSuccessful.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <span className="text-[#d9a526]" aria-hidden>
                        ·
                      </span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <RunnerUpList
                  title="Närmast efter"
                  rows={ranked.slice(1, 5).map((e) => ({
                    key: String(e.player.playerId),
                    href: `/scout/efter-allsvenskan/${e.player.playerId}`,
                    left: (
                      <>
                        <span className="mr-2 tabular-nums text-[#5f5e59]">#{e.rank}</span>
                        {e.player.playerName}
                      </>
                    ),
                    right: <span className="max-w-[11rem] truncate">{e.highlights[0]}</span>,
                  }))}
                />
              </AnalysisCard>
            )}

            {/*
              Fas 18h (2026-08-23, användarkrav 3+5, sammanslagna) — "Längsta
              utlandskarriär" och "Karriärens längsta utländska period" är SAMMA
              mått: längsta SAMMANHÄNGANDE svit av säsonger utomlands. Uttryckligt
              användarkrav (2026-08-23): får INTE räkna (sista år − första år) om
              spelaren haft flera separata utlandsperioder (exempel: 2015–2018 +
              2021–2026 ska ge 5 år, inte 11) — ett uppehåll (t.ex. en period
              tillbaka i Allsvenskan, verifierat mot T. Sana) bryter sviten.
            */}
            {insights.longestAbroadStreak && (
              <AnalysisCard
                label="🧭 Längst etablerad utomlands"
                footnote="Längsta sammanhängande svit av säsonger utomlands, inte totala tiden sedan avgången — ett uppehåll (t.ex. en period tillbaka i Allsvenskan) bryter sviten. Enstaka ej hittade säsonger kan dela upp en i verkligheten sammanhängande period."
              >
                <Link href={`/scout/efter-allsvenskan/${insights.longestAbroadStreak.player.playerId}`} className="group flex items-center gap-3">
                  <PlayerAvatar
                    name={insights.longestAbroadStreak.player.playerName}
                    size={44}
                    photoUrl={insights.longestAbroadStreak.player.photoUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-white group-hover:underline">
                      {insights.longestAbroadStreak.player.playerName}
                    </p>
                    <p className="text-xs text-[#898781]">
                      <span className="text-lg font-semibold tabular-nums text-[#c3c2b7]">{insights.longestAbroadStreak.years}</span> år i rad
                      utomlands · {insights.longestAbroadStreak.fromYear}–{insights.longestAbroadStreak.toYear}
                    </p>
                  </div>
                </Link>
                <RunnerUpList
                  title="Närmast efter"
                  rows={insights.longestAbroadStreakRunnersUp.map((r) => ({
                    key: String(r.player.playerId),
                    href: `/scout/efter-allsvenskan/${r.player.playerId}`,
                    left: r.player.playerName,
                    right: `${r.years} år · ${r.fromYear}–${r.toYear}`,
                  }))}
                />
              </AnalysisCard>
            )}

            {/*
              Fas 18k (2026-08-23, användarkrav "mest dekorerad, exportkurvan och
              återvändarprocent") — real trofédata (player_trophy, /trophies),
              begränsad till titlar VUNNA UTOMLANDS (place===Winner, country!==
              Sweden) — se getMostDecoratedAbroad i post-allsvenskan.ts.
            */}
            {decoratedAbroad.length > 0 && (
              <AnalysisCard
                label="🏆 Mest dekorerad efter Allsvenskan"
                hint="Vunna titlar utanför Sverige. Klicka på en spelare för alla titlar, per land och klubb."
              >
                <div className="space-y-0.5">
                  {decoratedAbroad.slice(0, 6).map((e, i) => (
                    <Link
                      key={e.player.playerId}
                      href={`/scout/efter-allsvenskan/${e.player.playerId}`}
                      className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[.03]"
                    >
                      <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-[#5f5e59]">{i + 1}</span>
                      <PlayerAvatar name={e.player.playerName} size={32} photoUrl={e.player.photoUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white group-hover:underline">{e.player.playerName}</p>
                        <p className="truncate text-xs text-[#7d7c76]">
                          {e.trophies
                            .slice(0, 2)
                            .map((t) => `${t.leagueName} (${t.season})`)
                            .join(", ")}
                          {e.trophies.length > 2 && ` +${e.trophies.length - 2} till`}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#d9a526]/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-[#d9a526]">
                        {e.winCount} 🏆
                      </span>
                    </Link>
                  ))}
                </div>
              </AnalysisCard>
            )}

            {/*
              Fas 18k (2026-08-23) — "Återvändarprocent": andel av de som lämnat
              som FAKTISKT är tillbaka i Allsvenskan just nu (insights.returnRate),
              plus en kompakt lista över de mest "pendlande" karriärerna
              (departureCount ≥2 — lämnat, kommit tillbaka, lämnat igen).
            */}
            <AnalysisCard label="🔁 Återvändare" hint="Hur många av de som lämnat spelar i Allsvenskan igen just nu.">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-semibold tabular-nums leading-none text-white">{insights.returnRate.percentage}%</span>
                <span className="text-sm text-[#898781]">
                  {nf(insights.returnRate.returned)} av {nf(insights.returnRate.total)} spelare
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-[#0ca30c]/70" style={{ width: `${Math.max(1, insights.returnRate.percentage)}%` }} />
              </div>
              <RunnerUpList
                title="Flest pendlingar (lämnat, återvänt, lämnat igen)"
                rows={insights.mostCyclingCareers.map((c) => ({
                  key: String(c.player.playerId),
                  href: `/scout/efter-allsvenskan/${c.player.playerId}`,
                  left: c.player.playerName,
                  right: `${c.departureCount} avgångar`,
                }))}
              />
            </AnalysisCard>
          </div>

          {/*
            Fas 18k (2026-08-23) — "Exportkurvan": antal spelare per avgångsår
            (insights.exportsByYear, ren aggregering av `leftYear` — ingen ny
            fråga). Enkel CSS-stapel i EN kulör (Scout-violett), inga dubbla
            axlar, direktetiketter istället för en förklaring — matchar
            dataviz-principerna utan att dra in Recharts för ett engångsdiagram.
            Full bredd (inte i rastret ovan): ett tidsseriediagram behöver
            horisontellt utrymme för att gå att läsa.
          */}
          {curveYears.length > 1 && (
            <AnalysisCard
              label="📈 Exportkurvan"
              hint="Antal spelare som lämnat Allsvenskan för en utländsk toppdivision, per avgångsår."
              footnote="Innevarande år är ofullständigt — säsongen pågår, och sena övergångar hinner inte med i importerad data."
            >
              <YearBars rows={exportRows} max={maxCurveCount} tone="violet" unit="spelare" />
            </AnalysisCard>
          )}

          {/*
            Fas 22b (2026-08-23, användarkrav "lägg till en importkurva under
            export") — samma fråga åt andra hållet: hur många spelare KÖPS IN
            till Allsvenskan från utlandet, per övergångsår? Datan är exakt de
            värvningar /scout/varvningar bygger på (incoming-transfers.ts, hela
            kvalificeringskedjan i den filens huvud) — inte en ny och lösare
            definition bara för att fylla ett diagram.

            Ligger direkt under exportkurvan och delar dess X-axel och
            höjdskala, så staplarna faktiskt går att jämföra: 2023 var
            rekordåret ut (101), 2025 rekordåret in (110).
          */}
          {firstIncomingYear !== null && curveYears.length > 1 && (
            <AnalysisCard
              label="🛬 Importkurvan"
              hint="Antal spelare som värvats till Allsvenskan från en utländsk klubb, per övergångsår."
              footnote={
                <>
                  Samma år och samma höjdskala som exportkurvan ovan — staplarna går att jämföra rakt av. Åren före {firstIncomingYear} visas som
                  &quot;–&quot;: en värvning räknas först när spelaren faktiskt spelat allsvenskt för klubben, och den matchstatistiken finns
                  importerad från säsongen {firstIncomingYear + 1} — det är en gräns i underlaget, inte ett påstående om att inga spelare värvades
                  tidigare. Innevarande år är ofullständigt.{" "}
                  <Link href="/scout/varvningar?vy=analys" className="font-semibold text-[#a78bfa] hover:underline">
                    Hela värvningsanalysen
                  </Link>
                  .
                </>
              }
            >
              <YearBars rows={importRows} max={maxCurveCount} tone="blue" unit="värvningar" />
            </AnalysisCard>
          )}

          {/*
            Fas 19e (2026-08-23, användarkrav) — DESTINATIONSRANKINGARNA.
            Svarar på scoutfrågorna "vilka ligor/klubbar rekryterar spelare
            från Allsvenskan?". Räknar bara DIREKTA övergångar (Allsvenskan →
            destinationen), inte "har någonsin haft en f.d. Allsvensk spelare"
            — se PostAllsvenskanDeparture. Ligarankingen är per LIGA, inte per
            land, eftersom skillnaden är avgörande: Norge har 151 spelare men
            108 av dem gick till Eliteserien och 43 till 1. Division, och
            England spänner från Premier League till League Two.
          */}
          {destinationLeagues.length > 0 && (
            <AnalysisCard
              label="🌍 Destinationsligor"
              hint="Vilka ligor rekryterar flest spelare direkt från Allsvenskan? Klicka för spelarna bakom siffran."
            >
              <div className="space-y-0.5">
                {destinationLeagues.slice(0, 10).map((l, i) => (
                  <Link
                    key={l.slug}
                    href={`/scout/efter-allsvenskan/liga/${l.slug}`}
                    className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[.03]"
                  >
                    <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-[#5f5e59]">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white group-hover:underline">{l.label}</p>
                      {translateClubCountry(l.country) && <p className="text-[11px] text-[#7d7c76]">{translateClubCountry(l.country)}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white/5 sm:block" aria-hidden>
                        <div
                          className="h-full rounded-full bg-[#a78bfa]/70"
                          style={{ width: `${Math.round((l.playerCount / destinationLeagues[0].playerCount) * 100)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-sm font-semibold tabular-nums text-[#c3c2b7]">{l.playerCount}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </AnalysisCard>
          )}

          {destinationClubs.length > 0 && (
            <AnalysisCard
              label="🏟️ Destinationsklubbar"
              hint="Vilka klubbar har tagit emot flest spelare direkt från Allsvenskan? Klicka för spelarna bakom siffran."
            >
              <div className="space-y-0.5">
                {destinationClubs.slice(0, 10).map((c, i) => (
                  <Link
                    key={c.slug}
                    href={`/scout/efter-allsvenskan/klubb/${c.slug}`}
                    className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[.03]"
                  >
                    <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-[#5f5e59]">{i + 1}</span>
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
                      <img src={c.logoUrl} alt="" className="h-6 w-6 shrink-0 object-contain" />
                    ) : (
                      <span className="h-6 w-6 shrink-0 rounded-full bg-white/5" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white group-hover:underline">{c.label}</p>
                      {translateClubCountry(c.country) && <p className="text-[11px] text-[#7d7c76]">{translateClubCountry(c.country)}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white/5 sm:block" aria-hidden>
                        <div
                          className="h-full rounded-full bg-[#a78bfa]/70"
                          style={{ width: `${Math.round((c.playerCount / destinationClubs[0].playerCount) * 100)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-sm font-semibold tabular-nums text-[#c3c2b7]">{c.playerCount}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </AnalysisCard>
          )}

          {/* Vilka f.d. Allsvenska klubbars spelare har presterat bäst utomlands */}
          {sortedClubs.length > 0 && (
            <AnalysisCard label="🌍 Bäst utomlands — per f.d. klubb" hint="Klicka på en klubb för att filtrera spelarlistan.">
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-[#7d7c76]">
                      <th className="px-2 py-2 font-medium">Klubb</th>
                      <th className="px-2 py-2 text-right font-medium">Spelare</th>
                      <th className="px-2 py-2 text-right font-medium">Minuter</th>
                      <th className="px-2 py-2 text-right font-medium">Matcher</th>
                      <th className="px-2 py-2 text-right font-medium">Mål</th>
                      <th className="px-2 py-2 text-right font-medium">Assist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedClubs.slice(0, 16).map((c) => (
                      <tr key={c.previousTeamName} className="border-b border-white/5 last:border-0 hover:bg-white/[.02]">
                        <td className="px-2 py-2.5">
                          <Link href={hrefFor({ club: c.previousTeamName, view: "spelare" })} className="flex items-center gap-2.5 hover:underline">
                            {c.previousTeamLogoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- extern logga
                              <img src={c.previousTeamLogoUrl} alt="" className="h-5 w-5 shrink-0" />
                            ) : (
                              <div className="h-5 w-5 shrink-0 rounded-full bg-white/5" aria-hidden />
                            )}
                            <span className="truncate font-medium text-white">{c.previousTeamName}</span>
                          </Link>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-[#898781]">{nf(c.playerCount)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-[#898781]">{nf(c.totalMinutes)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-[#898781]">{nf(c.totalAppearances)}</td>
                        <td className="px-2 py-2.5 text-right text-base font-semibold tabular-nums text-white">{nf(c.totalGoals)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-[#c3c2b7]">{nf(c.totalAssists)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AnalysisCard>
          )}
        </div>
      )}

      {view === "spelare" && (
        <>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {SORT_OPTIONS.map((o) => (
              <Link
                key={o.key}
                href={hrefFor({ sort: o.key })}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  sort === o.key ? "bg-white text-black" : "bg-white/5 text-[#898781] hover:bg-white/10 hover:text-white"
                }`}
              >
                {o.label}
              </Link>
            ))}
          </div>

          {clubFilter && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#a78bfa]/25 bg-[#a78bfa]/[0.06] px-3 py-2 text-xs">
              <span className="text-[#c3c2b7]">
                Filtrerat på <span className="font-semibold text-white">{clubFilter}</span> · {nf(sorted.length)} spelare
              </span>
              <Link href={hrefFor({ club: null })} className="font-semibold text-[#a78bfa] hover:underline">
                Rensa filter
              </Link>
            </div>
          )}

          <div className="mt-4">
            {sorted.length === 0 ? (
              <p className="rounded-xl border border-white/10 p-6 text-center text-sm text-[#898781]">Ingen matchande spelare hittad.</p>
            ) : (
              <div className="space-y-1.5">
                {visible.map((p) => {
                  const success = successByPlayerId.get(p.playerId);
                  const badge = p.activity.status === "retired" ? RETIRED_BADGE : STATUS_BADGE[p.status];
                  return (
                    <Link
                      key={p.playerId}
                      href={`/scout/efter-allsvenskan/${p.playerId}`}
                      className="group flex items-center gap-3 rounded-xl border border-white/5 bg-[#141418]/40 p-3 transition-colors hover:border-white/15 hover:bg-white/[.03] sm:gap-4 sm:p-4"
                    >
                      {/* Placeringen visas bara när listan FAKTISKT är sorterad på
                          den — annars hade "#4" bredvid en mållista sett ut som en
                          rangordning av något helt annat. */}
                      {sort === "success" && (
                        <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-[#5f5e59]">
                          {success ? `#${success.rank}` : "–"}
                        </span>
                      )}
                      <PlayerAvatar name={p.playerName} size={44} photoUrl={p.photoUrl} />

                      {/* Fas 19b — historiken låg tidigare i EN trunkerande rad.
                          Nu: avgång på en rad, nuläge på nästa. Inget klipps. */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate text-sm font-semibold text-white group-hover:underline">{p.playerName}</p>
                          {badge && (
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[#898781]">
                          Lämnade <span className="text-[#c3c2b7]">{p.previousTeamName}</span> {p.leftYear} → {p.mostRecentForeignClubName}
                          {translateClubCountry(p.mostRecentForeignClubCountry) && ` · ${translateClubCountry(p.mostRecentForeignClubCountry)}`}
                        </p>
                        {/* Andra raden bär det som är RELEVANT FÖR VALD SORTERING,
                            plus nuläget när spelaren är tillbaka i Sverige. */}
                        <p className="mt-0.5 truncate text-[11px] text-[#5f5e59]">
                          {sort === "success" && success ? (
                            <span className="text-[#d9a526]">{success.highlights[0]}</span>
                          ) : sort === "endurance" ? (
                            <span className="text-[#a78bfa]">
                              {p.longestAbroadStreakYears} år i rad utomlands ({p.longestAbroadStreakFromYear}–{p.longestAbroadStreakToYear})
                            </span>
                          ) : null}
                          {((sort === "success" && success) || sort === "endurance") &&
                          (p.status === "back_in_allsvenskan" || p.status === "back_in_sweden")
                            ? " · "
                            : null}
                          {/* "Idag: X" gäller bara den som fortfarande spelar — för
                              den som lagt av visas sista aktiva året istället. */}
                          {p.activity.status === "retired"
                            ? `Sist aktiv ${p.activity.lastActiveYear}`
                            : p.status === "back_in_allsvenskan"
                              ? `Idag: ${p.currentClubName}`
                              : p.status === "back_in_sweden"
                                ? `Idag: ${p.currentClubName} (Sverige, lägre nivå)`
                                : null}
                        </p>
                      </div>

                      {/* Fas 19b — fasta kolumner med utskrivna etiketter (inte
                          "M"/"Ass"), och den sorterade kolumnen markerad. */}
                      <div className="hidden shrink-0 items-center gap-1 sm:flex">
                        {statColumns.map((col) => {
                          const active = col.key === sort;
                          return (
                            <div
                              key={col.label}
                              className={`w-[4.25rem] rounded-lg py-1.5 text-center ${active ? "bg-white/[.06]" : ""}`}
                            >
                              <p className={`text-sm font-semibold tabular-nums ${active ? "text-white" : "text-[#c3c2b7]"}`}>{col.value(p)}</p>
                              <p className={`text-[10px] uppercase tracking-wide ${active ? "text-[#a78bfa]" : "text-[#7d7c76]"}`}>{col.label}</p>
                            </div>
                          );
                        })}
                        <div className="w-[3.5rem] text-center">
                          {p.avgRating !== null ? (
                            <>
                              <p className="text-sm font-semibold tabular-nums text-[#d9a526]">{p.avgRating}</p>
                              <p className="text-[10px] uppercase tracking-wide text-[#7d7c76]">Betyg</p>
                            </>
                          ) : (
                            <p className="text-xs text-[#3d3c39]">—</p>
                          )}
                        </div>
                      </div>

                      {/* Mobil: bara den sorterade siffran + betyg, resten ryms inte ändå. */}
                      <div className="flex shrink-0 items-center gap-3 text-right sm:hidden">
                        <div>
                          <p className="text-sm font-semibold tabular-nums text-white">
                            {(statColumns.find((c) => c.key === sort) ?? statColumns[0]).value(p)}
                          </p>
                          <p className="text-[10px] uppercase text-[#7d7c76]">{(statColumns.find((c) => c.key === sort) ?? statColumns[0]).label}</p>
                        </div>
                        {p.avgRating !== null && (
                          <div>
                            <p className="text-sm font-semibold tabular-nums text-[#d9a526]">{p.avgRating}</p>
                            <p className="text-[10px] uppercase text-[#7d7c76]">Betyg</p>
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {remaining > 0 && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-xs text-[#5f5e59]">
                  Visar {nf(visible.length)} av {nf(sorted.length)} spelare
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Link
                    href={hrefFor({ limit: limit + PAGE_SIZE })}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-[#a78bfa]/40 hover:bg-[#a78bfa]/10"
                  >
                    Visa {nf(Math.min(PAGE_SIZE, remaining))} till
                  </Link>
                  {remaining > PAGE_SIZE && (
                    <Link
                      href={hrefFor({ limit: sorted.length })}
                      className="rounded-full px-4 py-2 text-xs font-semibold text-[#898781] transition-colors hover:text-white"
                    >
                      Visa alla {nf(sorted.length)}
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/*
        Uttryckligt användarkrav (2026-08-23): "Claude ska inte hitta på 'bäst
        totalt'. Vi behöver definiera exakt hur det räknas." Metoden ligger
        därför öppet på sidan, inte bara i koden.
      */}
      {showMethod && mostSuccessful && (
        <details className="mt-6 rounded-xl border border-white/10 bg-[#141418] p-4 text-sm text-[#898781]">
          <summary className="cursor-pointer font-semibold text-[#c3c2b7]">Så räknas &quot;mest lyckad efter Allsvenskan&quot;</summary>
          <div className="mt-3 space-y-3 leading-relaxed">
            <p>
              Fem komponenter vägs samman. Varje spelare jämförs mot de {nf(ranked.length)} andra rankade spelarna — mål och assist bara mot spelare
              i samma positionsgrupp, så att en ytterback inte bedöms mot en anfallare.
            </p>
            <ul className="space-y-1">
              <li>
                <span className="font-semibold text-[#c3c2b7]">Etablering {SUCCESS_WEIGHTS.establishment} %</span> — total speltid utomlands. Väger
                tyngst: mål kan komma av en kort explosiv period, medan 15 000 minuter visar att spelaren faktiskt fått spela under lång tid.
              </li>
              <li>
                <span className="font-semibold text-[#c3c2b7]">Nivå {SUCCESS_WEIGHTS.level} %</span> — hur stark liga minuterna spelats i, på en
                femgradig skala från {LEVEL_LABEL[1]} till {LEVEL_LABEL[5]}. Räknas som minutviktat snitt plus den högsta nivå spelaren spelat minst
                900 minuter på.
              </li>
              <li>
                <span className="font-semibold text-[#c3c2b7]">Produktion {SUCCESS_WEIGHTS.production} %</span> — mål + assist, jämfört inom
                positionsgruppen. Målvakter bedöms aldrig på det här måttet.
              </li>
              <li>
                <span className="font-semibold text-[#c3c2b7]">Kvalitet {SUCCESS_WEIGHTS.quality} %</span> — snittbetyg där det finns, jämfört inom
                positionsgruppen.
              </li>
              <li>
                <span className="font-semibold text-[#c3c2b7]">Uthållighet {SUCCESS_WEIGHTS.endurance} %</span> — längsta sammanhängande
                utlandsperiod.
              </li>
            </ul>
            <p>
              Saknad data blir aldrig en nolla: saknas betyg fördelas den komponentens vikt ut på de övriga. För att rankas krävs minst{" "}
              {SUCCESS_MIN_APPEARANCES} matcher eller {nf(SUCCESS_MIN_MINUTES)} minuter utomlands — {nf(excludedByThreshold)} spelare ligger under
              den gränsen och rankas inte (de finns kvar i listan). Cup- och Europaspelsminuter räknas i speltiden men har ingen egen liganivå,
              eftersom Champions League-data även innehåller kvalomgångar.
            </p>
            <p className="text-[11px] text-[#5f5e59]">
              Nivåskalan och vikterna är expertbedömda och medvetet öppna för diskussion — de är inte anpassade mot något facit, för det finns inget
              facit för &quot;lyckad karriär&quot;. Allt annat i modellen är verklig, importerad matchdata.
            </p>
          </div>
        </details>
      )}

      <p className="mt-6 text-[10px] leading-relaxed text-[#5f5e59]">
        Bygger på dokumenterade klubbyten (api-football /transfers) och matchad statistik per klubb/säsong — kan vara ofullständig för spelare vars
        karriärimport inte körts än.
      </p>
    </div>
  );
}
