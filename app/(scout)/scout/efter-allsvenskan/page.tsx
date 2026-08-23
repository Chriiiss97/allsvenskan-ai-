import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPlayersWhoLeftAllsvenskan, aggregateByPreviousClub, computePostAllsvenskanInsights, getMostDecoratedAbroad } from "@/lib/football/post-allsvenskan";
import {
  computePostAllsvenskanSuccess,
  SUCCESS_MIN_APPEARANCES,
  SUCCESS_MIN_MINUTES,
  SUCCESS_WEIGHTS,
} from "@/lib/football/post-allsvenskan-success";
import { LEVEL_LABEL } from "@/lib/football/post-allsvenskan-level";
import { translateNationality } from "@/lib/i18n/sv";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";

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

export default async function PostAllsvenskanPage({ searchParams }: { searchParams: Promise<{ sort?: string; club?: string; vy?: string }> }) {
  const { sort: sortParam, club: clubFilter, vy } = await searchParams;
  const sort: SortKey = isValidSort(sortParam) ? sortParam : "goals";
  const view: View = vy === "analys" ? "analys" : "spelare";
  const supabase = await createClient();

  const players = await getPlayersWhoLeftAllsvenskan(supabase);
  const clubAggregates = aggregateByPreviousClub(players);
  const insights = computePostAllsvenskanInsights(players);
  const decoratedAbroad = await getMostDecoratedAbroad(supabase, players);
  const maxExportCount = Math.max(1, ...insights.exportsByYear.map((y) => y.count));
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

  /** Bygger en länk som BEHÅLLER allt man inte uttryckligen ändrar (sortering, klubbfilter, vy). */
  const hrefFor = (next: { sort?: SortKey; club?: string | null; view?: View }) => {
    const params = new URLSearchParams();
    params.set("sort", next.sort ?? sort);
    const club = next.club === undefined ? clubFilter : next.club;
    if (club) params.set("club", club);
    if ((next.view ?? view) === "analys") params.set("vy", "analys");
    return `/scout/efter-allsvenskan?${params.toString()}`;
  };

  // "Så räknas mest lyckad" hör hemma i analysvyn — men också i listan när
  // den FAKTISKT är sorterad på "Mest lyckad", annars står placeringarna där
  // helt oförklarade.
  const showMethod = mostSuccessful !== null && (view === "analys" || sort === "success");

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Efter Allsvenskan</h1>
      <p className="mt-1 text-sm text-[#898781]">
        {players.length} spelare med ett bekräftat klubbyte ut ur Allsvenskan — real data (transfers + matchstatistik), inte en gissning om
        vilka som &quot;kan ha&quot; lämnat.
      </p>

      {/* Vyväxlare — medvetet en annan form än sorteringsknapparna nedan
          (segmenterad ram, inte fristående piller) så att det syns att den
          byter SIDINNEHÅLL, inte sortering. */}
      <div className="mt-5 inline-flex rounded-lg border border-white/10 p-0.5">
        {([
          { key: "spelare", label: "🚀 Spelare" },
          { key: "analys", label: "📊 Scoutanalys" },
        ] as const).map((v) => (
          <Link
            key={v.key}
            href={hrefFor({ view: v.key })}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === v.key ? "bg-white text-black" : "text-[#898781] hover:text-white"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>
      {view === "spelare" && (
        <p className="mt-2 text-xs text-[#5f5e59]">
          Mest lyckad export, mest dekorerad, exportkurvan och återvändare ligger under{" "}
          <Link href={hrefFor({ view: "analys" })} className="text-[#a78bfa] hover:underline">
            Scoutanalys
          </Link>
          .
        </p>
      )}

      {view === "spelare" && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {SORT_OPTIONS.map((o) => (
            <Link
              key={o.key}
              href={hrefFor({ sort: o.key })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                sort === o.key ? "bg-white text-black" : "bg-white/5 text-[#898781] hover:text-white"
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>
      )}

      {view === "analys" && (
        <>

      {/*
        Fas 18h (2026-08-23, användarkrav) — "Efter Allsvenskan i korthet":
        en kompakt redaktionell brief, INTE fyra stora statistikkort (uttryckligt
        krav: "gör det visuellt snyggare än fyra vanliga kort... typ en editorial
        Scout-brief"). Läser bara redan Allsvensk-fritt filtrerade fält (se
        post-allsvenskan.ts:s filhuvud) — mål/assist/minuter kan aldrig läcka in
        Allsvensk statistik.
      */}
      {(insights.topGoals || insights.topAssists || insights.topMinutes) && (
        <div className="mt-6 rounded-xl border border-white/10 border-l-2 border-l-[#a78bfa] bg-[#141418] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Efter Allsvenskan i korthet</p>
          <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-[#c3c2b7]">
            {insights.topGoals && (
              <p>
                <Link href={`/scout/efter-allsvenskan/${insights.topGoals.playerId}`} className="font-semibold text-white hover:underline">
                  {insights.topGoals.playerName}
                </Link>{" "}
                har gjort flest mål efter sin flytt från Allsvenskan — <span className="font-semibold text-white">{insights.topGoals.goals} mål</span>.
              </p>
            )}
            {insights.topAssists && (
              <p>
                <Link href={`/scout/efter-allsvenskan/${insights.topAssists.playerId}`} className="font-semibold text-white hover:underline">
                  {insights.topAssists.playerName}
                </Link>{" "}
                har stått för flest assist — <span className="font-semibold text-white">{insights.topAssists.assists} assist</span>.
              </p>
            )}
            {insights.topMinutes && (
              <p>
                <Link href={`/scout/efter-allsvenskan/${insights.topMinutes.playerId}`} className="font-semibold text-white hover:underline">
                  {insights.topMinutes.playerName}
                </Link>{" "}
                har spelat flest minuter efter sin Allsvenska exit —{" "}
                <span className="font-semibold text-white">{insights.topMinutes.minutesPlayed.toLocaleString("sv-SE")} minuter</span>.
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
        </div>
      )}

      {/*
        Fas 18j (2026-08-23, användarkrav 2) — "Scoutens mest lyckade export".
        Uttryckligt användarbeslut: rubrik + motivering, INGET poängtal ("det
        blir mycket mer premium än ett godtyckligt poängtal"). `highlights` är
        genererade ur spelarens VERKLIGA siffror i modellen, aldrig en generisk
        formulering — se post-allsvenskan-success.ts.
      */}
      {mostSuccessful && (
        <div className="mt-4 rounded-xl border border-white/10 border-l-2 border-l-[#d9a526] bg-[#141418] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d9a526]">🏆 Scoutens mest lyckade export</p>
          <Link href={`/scout/efter-allsvenskan/${mostSuccessful.player.playerId}`} className="group mt-3 flex items-center gap-4">
            <PlayerAvatar name={mostSuccessful.player.playerName} size={56} photoUrl={mostSuccessful.player.photoUrl} />
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold tracking-tight text-white group-hover:underline">{mostSuccessful.player.playerName}</p>
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
          {ranked.length > 1 && (
            <div className="mt-4 border-t border-white/5 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7d7c76]">Närmast efter</p>
              <div className="mt-1.5 space-y-0.5">
                {ranked.slice(1, 5).map((e) => (
                  <Link
                    key={e.player.playerId}
                    href={`/scout/efter-allsvenskan/${e.player.playerId}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs text-[#898781] transition-colors hover:bg-white/[.02] hover:text-white"
                  >
                    <span className="truncate">
                      <span className="mr-2 tabular-nums text-[#5f5e59]">#{e.rank}</span>
                      {e.player.playerName}
                    </span>
                    <span className="ml-3 shrink-0 truncate text-right text-[#5f5e59]">{e.highlights[0]}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/*
        Fas 18h (2026-08-23, användarkrav 3+5, sammanslagna) — "Längsta
        utlandskarriär" och "Karriärens längsta utländska period" är SAMMA
        mått: längsta SAMMANHÄNGANDE svit av säsonger utomlands. Uttryckligt
        användarkrav (2026-08-23): får INTE räkna (sista år − första år) om
        spelaren haft flera separata utlandsperioder (exempel: 2015–2018 +
        2021–2026 ska ge 5 år, inte 11) — ett uppehåll (t.ex. en period
        tillbaka i Allsvenskan, verifierat mot T. Sana) bryter sviten.

        Fas 18j (användarkorrigering, 2026-08-23) — samma editorial-form som
        "i korthet"-boxen ovan (lila vänsterkant, #141418, versal etikett)
        istället för den tidigare grå rubrik+kort-varianten.
      */}
      {insights.longestAbroadStreak && (
        <div className="mt-4 rounded-xl border border-white/10 border-l-2 border-l-[#a78bfa] bg-[#141418] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">🧭 Längst etablerad utomlands</p>
          <Link
            href={`/scout/efter-allsvenskan/${insights.longestAbroadStreak.player.playerId}`}
            className="group mt-3 flex items-center gap-3"
          >
            <PlayerAvatar name={insights.longestAbroadStreak.player.playerName} size={40} photoUrl={insights.longestAbroadStreak.player.photoUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white group-hover:underline">{insights.longestAbroadStreak.player.playerName}</p>
              <p className="text-xs text-[#898781]">
                {insights.longestAbroadStreak.fromYear}–{insights.longestAbroadStreak.toYear} ·{" "}
                <span className="font-semibold text-[#c3c2b7]">{insights.longestAbroadStreak.years} sammanhängande år utomlands</span>
              </p>
            </div>
          </Link>
          {insights.longestAbroadStreakRunnersUp.length > 0 && (
            <div className="mt-4 border-t border-white/5 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7d7c76]">Närmast efter</p>
              <div className="mt-1.5 space-y-0.5">
                {insights.longestAbroadStreakRunnersUp.map((r) => (
                  <Link
                    key={r.player.playerId}
                    href={`/scout/efter-allsvenskan/${r.player.playerId}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs text-[#898781] transition-colors hover:bg-white/[.02] hover:text-white"
                  >
                    <span className="truncate">{r.player.playerName}</span>
                    <span className="ml-3 shrink-0 tabular-nums text-[#5f5e59]">
                      {r.fromYear}–{r.toYear} ({r.years} år)
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-[10px] leading-relaxed text-[#5f5e59]">
            Längsta sammanhängande svit av säsonger utomlands, inte totala tiden sedan avgången — ett uppehåll (t.ex. en period tillbaka i
            Allsvenskan) bryter sviten. Bygger på importerad karriärdata per säsong; enstaka ej hittade säsonger kan dela upp en i verkligheten
            sammanhängande period.
          </p>
        </div>
      )}

      {/*
        Fas 18k (2026-08-23, användarkrav "mest dekorerad, exportkurvan och
        återvändarprocent") — real trofédata (player_trophy, /trophies),
        begränsad till titlar VUNNA UTOMLANDS (place===Winner, country!==
        Sweden) — se getMostDecoratedAbroad i post-allsvenskan.ts. Violett
        vänsterkant (som "i korthet"/"längst etablerad") snarare än amber —
        amber är reserverat för den VÄGDA "Mest lyckad"-modellen ovan, det
        här är ren, oviktad räkning av riktiga titlar.
      */}
      {decoratedAbroad.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 border-l-2 border-l-[#a78bfa] bg-[#141418] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">🏆 Mest dekorerad efter Allsvenskan</p>
          <p className="mt-1 text-xs text-[#898781]">
            Titlar (place: Winner) vunna EFTER Allsvenskan — svenska titlar räknas aldrig med. Klicka på en spelare för alla titlar, per land och
            klubb.
          </p>
          <div className="mt-3 space-y-0.5">
            {decoratedAbroad.slice(0, 6).map((e, i) => (
              <Link
                key={e.player.playerId}
                href={`/scout/efter-allsvenskan/${e.player.playerId}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[.02]"
              >
                <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-[#5f5e59]">{i + 1}</span>
                <PlayerAvatar name={e.player.playerName} size={32} photoUrl={e.player.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{e.player.playerName}</p>
                  <p className="truncate text-xs text-[#898781]">
                    {e.trophies
                      .slice(0, 2)
                      .map((t) => `${t.leagueName} (${t.season})`)
                      .join(", ")}
                    {e.trophies.length > 2 && ` +${e.trophies.length - 2} till`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-[#d9a526]">
                  🏆 {e.winCount}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/*
        Fas 18k (2026-08-23) — "Exportkurvan": antal spelare per avgångsår
        (insights.exportsByYear, ren aggregering av `leftYear` — ingen ny
        fråga). Enkel CSS-stapeldiagram i EN kulör (Scout-violett), inga
        dubbla axlar, direktetiketter istället för en förklaring — matchar
        dataviz-principerna utan att dra in Recharts för ett engångsstaplar.
      */}
      {insights.exportsByYear.length > 1 && (
        <div className="mt-4 rounded-xl border border-white/10 border-l-2 border-l-[#a78bfa] bg-[#141418] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">📈 Exportkurvan</p>
          <p className="mt-1 text-xs text-[#898781]">Antal spelare som lämnat Allsvenskan för en tier 1/2-liga, per avgångsår.</p>
          <div className="mt-4 flex items-end gap-1 overflow-x-auto pb-1">
            {insights.exportsByYear.map((y) => (
              <div key={y.year} className="flex min-w-[24px] flex-1 flex-col items-center justify-end gap-1" title={`${y.year}: ${y.count} spelare`}>
                <span className="text-[10px] font-semibold tabular-nums text-[#c3c2b7]">{y.count}</span>
                <div
                  className="w-full rounded-t-sm bg-[#a78bfa]/70"
                  style={{ height: `${Math.max(6, Math.round((y.count / maxExportCount) * 100))}px` }}
                />
                <span className="text-[9px] tabular-nums text-[#7d7c76]">&apos;{String(y.year).slice(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*
        Fas 18k (2026-08-23) — "Återvändarprocent": andel av de som lämnat
        som FAKTISKT är tillbaka i Allsvenskan just nu (insights.returnRate),
        plus en kompakt lista över de mest "pendlande" karriärerna
        (departureCount ≥2 — lämnat, kommit tillbaka, lämnat igen).
      */}
      <div className="mt-4 rounded-xl border border-white/10 border-l-2 border-l-[#a78bfa] bg-[#141418] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">🔁 Återvändare</p>
        <p className="mt-3 text-sm text-[#c3c2b7]">
          <span className="text-2xl font-semibold tabular-nums text-white">{insights.returnRate.percentage}%</span>{" "}
          <span className="text-[#898781]">
            ({insights.returnRate.returned} av {insights.returnRate.total}) är tillbaka i Allsvenskan just nu.
          </span>
        </p>
        {insights.mostCyclingCareers.length > 0 && (
          <div className="mt-4 border-t border-white/5 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7d7c76]">Flest pendlingar</p>
            <div className="mt-1.5 space-y-0.5">
              {insights.mostCyclingCareers.map((c) => (
                <Link
                  key={c.player.playerId}
                  href={`/scout/efter-allsvenskan/${c.player.playerId}`}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs text-[#898781] transition-colors hover:bg-white/[.02] hover:text-white"
                >
                  <span className="truncate">{c.player.playerName}</span>
                  <span className="ml-3 shrink-0 tabular-nums text-[#5f5e59]">{c.departureCount} avgångar</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Vilka f.d. Allsvenska klubbars spelare har presterat bäst utomlands */}
      {sortedClubs.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
            <span aria-hidden>🌍</span> Bäst utomlands — per f.d. klubb
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-[#7d7c76]">
                  <th className="p-3">Klubb</th>
                  <th className="p-3 text-right">Spelare</th>
                  <th className="p-3 text-right">Min / matcher</th>
                  <th className="p-3 text-right">Mål</th>
                  <th className="p-3 text-right">Ass</th>
                </tr>
              </thead>
              <tbody>
                {sortedClubs.slice(0, 16).map((c) => (
                  <tr key={c.previousTeamName} className="border-b border-white/5 last:border-0 hover:bg-white/[.02]">
                    <td className="p-3">
                      <Link
                        href={hrefFor({ club: c.previousTeamName, view: "spelare" })}
                        className="flex items-center gap-2.5 hover:underline"
                      >
                        {c.previousTeamLogoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- extern logga
                          <img src={c.previousTeamLogoUrl} alt="" className="h-5 w-5 shrink-0" />
                        ) : (
                          <div className="h-5 w-5 shrink-0 rounded-full bg-white/5" aria-hidden />
                        )}
                        <span className="truncate font-medium text-white">{c.previousTeamName}</span>
                      </Link>
                    </td>
                    <td className="p-3 text-right tabular-nums text-[#898781]">{c.playerCount}</td>
                    <td className="p-3 text-right tabular-nums text-[#898781]">
                      {c.totalMinutes.toLocaleString("sv-SE")} / {c.totalAppearances.toLocaleString("sv-SE")}
                    </td>
                    <td className="p-3 text-right text-base font-semibold tabular-nums text-white">{c.totalGoals}</td>
                    <td className="p-3 text-right tabular-nums">{c.totalAssists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}

      {/* Spelarlistan */}
      {view === "spelare" && (
      <div className="mt-8">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
          <span aria-hidden>🚀</span> Spelare
          {clubFilter && (
            <>
              {" "}
              — {clubFilter}{" "}
              <Link href={hrefFor({ club: null })} className="normal-case text-[#3987e5] hover:underline">
                (rensa filter)
              </Link>
            </>
          )}
        </p>

        {sorted.length === 0 ? (
          <p className="text-sm text-[#898781]">Ingen matchande spelare hittad.</p>
        ) : (
          <div className="space-y-1">
            {sorted.map((p) => {
              const success = successByPlayerId.get(p.playerId);
              return (
                <Link
                  key={p.playerId}
                  href={`/scout/efter-allsvenskan/${p.playerId}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 p-3 transition-colors hover:border-white/10 hover:bg-white/[.02] sm:flex-nowrap"
                >
                  {/* Placeringen visas bara när listan FAKTISKT är sorterad på
                      den — annars hade "#4" bredvid en mållista sett ut som en
                      rangordning av något helt annat. */}
                  {sort === "success" && (
                    <span className="w-7 shrink-0 text-center text-xs font-semibold tabular-nums text-[#5f5e59]">
                      {success ? `#${success.rank}` : "–"}
                    </span>
                  )}
                  <PlayerAvatar name={p.playerName} size={40} photoUrl={p.photoUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-white">{p.playerName}</p>
                      {p.status === "back_in_allsvenskan" ? (
                        <span className="shrink-0 rounded-full bg-[#0ca30c]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#0ca30c]">
                          🟢 Tillbaka i Allsvenskan
                        </span>
                      ) : p.status === "back_in_sweden" ? (
                        <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#c3c2b7]">
                          🇸🇪 Tillbaka i Sverige
                        </span>
                      ) : p.status === "abroad" ? (
                        <span className="shrink-0 rounded-full bg-[#3987e5]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#3987e5]">🌍 Utomlands</span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-[#898781]">
                      {sort === "success" && success
                        ? success.highlights[0]
                        : sort === "endurance"
                          ? `${p.longestAbroadStreakYears} sammanhängande år utomlands (${p.longestAbroadStreakFromYear}–${p.longestAbroadStreakToYear})`
                          : null}
                      {(sort === "success" && success) || sort === "endurance" ? " · " : null}
                      Lämnade {p.previousTeamName} ({p.leftYear}) — spelade senast för {p.mostRecentForeignClubName}
                      {p.mostRecentForeignClubCountry && ` · ${translateNationality(p.mostRecentForeignClubCountry) ?? p.mostRecentForeignClubCountry}`}
                      {p.status === "back_in_allsvenskan" && `. Idag: ${p.currentClubName}.`}
                      {p.status === "back_in_sweden" && `. Idag: ${p.currentClubName} (Sverige, lägre nivå).`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-4 text-right text-xs tabular-nums">
                    <div>
                      <p className="font-semibold text-white">{p.appearances}</p>
                      <p className="text-[10px] uppercase text-[#7d7c76]">M</p>
                    </div>
                    <div>
                      <p className="font-semibold text-white">{p.goals}</p>
                      <p className="text-[10px] uppercase text-[#7d7c76]">Mål</p>
                    </div>
                    <div>
                      <p className="font-semibold text-white">{p.assists}</p>
                      <p className="text-[10px] uppercase text-[#7d7c76]">Ass</p>
                    </div>
                    {p.avgRating !== null && (
                      <div>
                        <p className="font-semibold text-[#d9a526]">{p.avgRating}</p>
                        <p className="text-[10px] uppercase text-[#7d7c76]">Betyg</p>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/*
        Uttryckligt användarkrav (2026-08-23): "Claude ska inte hitta på 'bäst
        totalt'. Vi behöver definiera exakt hur det räknas." Metoden ligger
        därför öppet på sidan, inte bara i koden.
      */}
      {showMethod && mostSuccessful && (
        <details className="mt-8 rounded-xl border border-white/10 bg-[#141418] p-4 text-sm text-[#898781]">
          <summary className="cursor-pointer font-semibold text-[#c3c2b7]">Så räknas &quot;mest lyckad efter Allsvenskan&quot;</summary>
          <div className="mt-3 space-y-3 leading-relaxed">
            <p>
              Fem komponenter vägs samman. Varje spelare jämförs mot de {ranked.length} andra rankade spelarna — mål och assist bara mot spelare i
              samma positionsgrupp, så att en ytterback inte bedöms mot en anfallare.
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
                <span className="font-semibold text-[#c3c2b7]">Uthållighet {SUCCESS_WEIGHTS.endurance} %</span> — längsta sammanhängande utlandsperiod.
              </li>
            </ul>
            <p>
              Saknad data blir aldrig en nolla: saknas betyg fördelas den komponentens vikt ut på de övriga. För att rankas krävs minst{" "}
              {SUCCESS_MIN_APPEARANCES} matcher eller {SUCCESS_MIN_MINUTES.toLocaleString("sv-SE")} minuter utomlands — {excludedByThreshold} spelare
              ligger under den gränsen och rankas inte (de finns kvar i listan). Cup- och Europaspelsminuter räknas i speltiden men har ingen egen
              liganivå, eftersom Champions League-data även innehåller kvalomgångar.
            </p>
            <p className="text-[11px] text-[#5f5e59]">
              Nivåskalan och vikterna är expertbedömda och medvetet öppna för diskussion — de är inte anpassade mot något facit, för det finns inget
              facit för &quot;lyckad karriär&quot;. Allt annat i modellen är verklig, importerad matchdata.
            </p>
          </div>
        </details>
      )}

      <p className="mt-6 text-[10px] text-[#5f5e59]">
        Bygger på dokumenterade klubbyten (api-football /transfers) och matchad statistik per klubb/säsong — kan vara
        ofullständig för spelare vars karriärimport inte körts än.
      </p>
    </div>
  );
}
