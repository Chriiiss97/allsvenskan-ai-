import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPlayersWhoLeftAllsvenskan, aggregateByPreviousClub, computePostAllsvenskanInsights } from "@/lib/football/post-allsvenskan";
import { translateNationality } from "@/lib/i18n/sv";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";

/**
 * Fas 18b (2026-08-22) — "Efter Allsvenskan": en egen Scout-flik (inte
 * gömd inuti enskilda spelarprofiler) som svarar på "vilka spelare har
 * lämnat Allsvenskan, och hur går det för dem?" + "vilka f.d. Allsvenska
 * klubbars spelare har presterat bäst utomlands?". Byggd på
 * lib/football/post-allsvenskan.ts — real data, samma källa som
 * spelarprofilernas Karriärresa (player_career_stint, se den filens
 * research-underlag). Ingen egen "framgångspoäng" — bara riktiga,
 * sorterbara summor (matcher/minuter/mål/assist).
 */

type SortKey = "appearances" | "minutesPlayed" | "goals" | "assists";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "goals", label: "Flest mål" },
  { key: "assists", label: "Flest assist" },
  { key: "appearances", label: "Flest matcher" },
  { key: "minutesPlayed", label: "Mest speltid" },
];

function isValidSort(value: string | undefined): value is SortKey {
  return SORT_OPTIONS.some((o) => o.key === value);
}

export default async function PostAllsvenskanPage({ searchParams }: { searchParams: Promise<{ sort?: string; club?: string }> }) {
  const { sort: sortParam, club: clubFilter } = await searchParams;
  const sort: SortKey = isValidSort(sortParam) ? sortParam : "goals";
  const supabase = await createClient();

  const players = await getPlayersWhoLeftAllsvenskan(supabase);
  const clubAggregates = aggregateByPreviousClub(players);
  const insights = computePostAllsvenskanInsights(players);

  const filtered = clubFilter ? players.filter((p) => p.previousTeamName === clubFilter) : players;
  const sortField: Record<SortKey, (p: (typeof players)[number]) => number> = {
    goals: (p) => p.goals,
    assists: (p) => p.assists,
    appearances: (p) => p.appearances,
    minutesPlayed: (p) => p.minutesPlayed,
  };
  const sorted = [...filtered].sort((a, b) => sortField[sort](b) - sortField[sort](a));

  const clubSortField: Record<SortKey, (c: (typeof clubAggregates)[number]) => number> = {
    goals: (c) => c.totalGoals,
    assists: (c) => c.totalAssists,
    appearances: (c) => c.totalAppearances,
    minutesPlayed: (c) => c.totalMinutes,
  };
  const sortedClubs = [...clubAggregates].sort((a, b) => clubSortField[sort](b) - clubSortField[sort](a));

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Efter Allsvenskan</h1>
      <p className="mt-1 text-sm text-[#898781]">
        {players.length} spelare med ett bekräftat klubbyte ut ur Allsvenskan — real data (transfers + matchstatistik), inte en gissning om
        vilka som &quot;kan ha&quot; lämnat.
      </p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {SORT_OPTIONS.map((o) => (
          <Link
            key={o.key}
            href={`/scout/efter-allsvenskan?sort=${o.key}${clubFilter ? `&club=${encodeURIComponent(clubFilter)}` : ""}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              sort === o.key ? "bg-white text-black" : "bg-white/5 text-[#898781] hover:text-white"
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>

      {/*
        Fas 18h (2026-08-23, användarkrav) — "Efter Allsvenskan i korthet":
        en kompakt redaktionell brief, INTE fyra stora statistikkort (uttryckligt
        krav: "gör det visuellt snyggare än fyra vanliga kort... typ en editorial
        Scout-brief"). Läser bara redan Allsvensk-fritt filtrerade fält (se
        post-allsvenskan.ts:s filhuvud) — mål/assist/minuter kan aldrig läcka in
        Allsvensk statistik. Innehåller MEDVETET INTE "mest sammantagen karriär"
        än — den väntar på godkänd metod (se svaret i chatten 2026-08-23).
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
          </div>
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
      */}
      {insights.longestAbroadStreak && (
        <div className="mt-8">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
            <span aria-hidden>🧭</span> Längst etablerad utomlands
          </p>
          <Link
            href={`/scout/efter-allsvenskan/${insights.longestAbroadStreak.player.playerId}`}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1a1a19] p-4 transition-colors hover:border-white/20"
          >
            <PlayerAvatar name={insights.longestAbroadStreak.player.playerName} size={40} photoUrl={insights.longestAbroadStreak.player.photoUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{insights.longestAbroadStreak.player.playerName}</p>
              <p className="text-xs text-[#898781]">
                {insights.longestAbroadStreak.fromYear}–{insights.longestAbroadStreak.toYear} ·{" "}
                <span className="font-semibold text-[#c3c2b7]">{insights.longestAbroadStreak.years} sammanhängande år utomlands</span>
              </p>
            </div>
          </Link>
          {insights.longestAbroadStreakRunnersUp.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {insights.longestAbroadStreakRunnersUp.map((r) => (
                <Link
                  key={r.player.playerId}
                  href={`/scout/efter-allsvenskan/${r.player.playerId}`}
                  className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs text-[#898781] transition-colors hover:bg-white/[.02] hover:text-white"
                >
                  <span className="truncate">{r.player.playerName}</span>
                  <span className="shrink-0 tabular-nums">
                    {r.fromYear}–{r.toYear} ({r.years} år)
                  </span>
                </Link>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-[#5f5e59]">
            Längsta sammanhängande svit av säsonger utomlands, inte totala tiden sedan avgången — ett uppehåll (t.ex. en period tillbaka i
            Allsvenskan) bryter sviten. Bygger på importerad karriärdata per säsong; enstaka ej hittade säsonger kan dela upp en i verkligheten
            sammanhängande period.
          </p>
        </div>
      )}

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
                        href={`/scout/efter-allsvenskan?sort=${sort}&club=${encodeURIComponent(c.previousTeamName)}`}
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

      {/* Spelarlistan */}
      <div className="mt-8">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
          <span aria-hidden>🚀</span> Spelare
          {clubFilter && (
            <>
              {" "}
              — {clubFilter}{" "}
              <Link href={`/scout/efter-allsvenskan?sort=${sort}`} className="normal-case text-[#3987e5] hover:underline">
                (rensa filter)
              </Link>
            </>
          )}
        </p>

        {sorted.length === 0 ? (
          <p className="text-sm text-[#898781]">Ingen matchande spelare hittad.</p>
        ) : (
          <div className="space-y-1">
            {sorted.map((p) => (
              <Link
                key={p.playerId}
                href={`/scout/efter-allsvenskan/${p.playerId}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 p-3 transition-colors hover:border-white/10 hover:bg-white/[.02] sm:flex-nowrap"
              >
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
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 text-[10px] text-[#5f5e59]">
        Bygger på dokumenterade klubbyten (api-football /transfers) och matchad statistik per klubb/säsong — kan vara
        ofullständig för spelare vars karriärimport inte körts än.
      </p>
    </div>
  );
}
