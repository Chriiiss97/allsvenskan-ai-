import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlayerExplorer, type ExplorerPlayer } from "@/components/data/PlayerExplorer";
import { SectionTabs } from "@/components/data/SectionTabs";
import { colors } from "@/lib/design/tokens";
import { getAvailableSeasons, listTeams } from "@/lib/football/catalog";
import { listPlayers, type PlayerListParams } from "@/lib/football/player-catalog";
import { parseExplorerFilters } from "@/lib/football/player-explorer-params";
import { ARCHETYPES } from "@/lib/football/rating/archetypes";

// Player Rating-batchberäkningen (computeSeasonOvrMap) kostar två
// paginerade fixture_player_stats-läsningar av hela säsongen — samma
// etablerade mönster som league/facts-routen använder för att hålla den
// kostnaden borta från varje enskild sidladdning.
export const revalidate = 3600;

/** Samma tröskel som Scout använder för "konsekvent bra" — EN siffra, inte två, se scout/spelare/page.tsx. */
const CONSISTENCY_OVR_THRESHOLD = 70;

/**
 * Spelardatabasen.
 *
 * Ombyggd 2026-08-23 efter användarfeedback ("nu är det kaos, otydligt och
 * svårt att förstå", "när jag skriver ska spelarlistan uppdateras samtidigt",
 * "/spelare ska vara exakt samma som /scout/spelare i design"). Tre
 * strukturella ändringar:
 *
 *  1. Sidan filtrerar inte längre själv. Den hämtar HELA säsongens
 *     spelarmängd EN gång och lämnar över till
 *     components/data/PlayerExplorer.tsx, som söker/filtrerar/sorterar i
 *     webbläsaren — direkt, utan en serverrundtur per tangenttryck. Ingen
 *     ny datakälla: exakt samma `listPlayers` som förut, bara utan de
 *     filterparametrar som numera hör hemma på klientsidan.
 *     ⚠️ Sidan får därför ALDRIG skicka med q/team/position/ålder/mål/OVR
 *     till listPlayers — då skulle klienten få en redan beskuren mängd och
 *     "rensa filter" skulle inte kunna visa spelarna igen.
 *
 *  2. Kontrollytan är ett sökfält, en säsongsväljare, en filterknapp och en
 *     sorteringsmeny — istället för elva säsongspiller, åtta inline-fält
 *     och åtta sorteringspiller på rad.
 *
 *  3. Samma utforskare och SAMMA uppsättning kontroller som
 *     /scout/spelare (spelartyper, statistiktrösklar, utveckling över tid).
 *     Skillnaden mot Scout är därmed bara två saker, båda avsiktliga: zonens
 *     accentfärg (blå = Fotboll, violett = Scout, se lib/design/tokens.ts)
 *     och att ett klick här går till spelarprofilen istället för att öppna
 *     Scouts premium-detaljpanel.
 */
export default async function PlayersIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const seasons = await getAvailableSeasons(supabase);
  const seasonParam = typeof sp.season === "string" ? Number(sp.season) : undefined;
  const seasonYear = seasonParam && seasons.some((s) => s.year === seasonParam) ? seasonParam : seasons[0]?.year ?? null;
  const compareParam = typeof sp.compareSeason === "string" ? Number(sp.compareSeason) : undefined;
  const compareYear =
    compareParam && seasons.some((s) => s.year === compareParam) && compareParam !== seasonYear ? compareParam : undefined;
  const consistencyMinSeasons =
    typeof sp.consistencyMinSeasons === "string" && /^\d+$/.test(sp.consistencyMinSeasons)
      ? Number(sp.consistencyMinSeasons)
      : undefined;

  const teams = await listTeams(supabase);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const filters = parseExplorerFilters(sp, { defaultSort: "rating" });

  const listParams: PlayerListParams = {
    season: seasonYear ?? 0,
    compareSeason: compareYear,
    consistencyMinSeasons,
    consistencyOvrThreshold: consistencyMinSeasons ? CONSISTENCY_OVR_THRESHOLD : undefined,
    sort: "rating",
    sortDir: "desc",
    page: 0,
    // Hela säsongen i en enda mängd — utforskaren paginerar visuellt i
    // webbläsaren istället (~400 spelare, se player-catalog.ts:s
    // radtaks-resonemang).
    pageSize: Number.MAX_SAFE_INTEGER,
  };

  const result = seasonYear ? await listPlayers(supabase, listParams) : { items: [], total: 0 };

  const players: ExplorerPlayer[] = result.items.map((p) => {
    const team = teamById.get(p.teamId);
    return {
      id: p.id,
      fullName: p.fullName,
      position: p.position,
      photoUrl: p.photoUrl,
      teamName: team?.name ?? null,
      teamExternalId: team?.external_id ?? null,
      age: p.age,
      goals: p.goals,
      assists: p.assists,
      appearances: p.appearances,
      minutesPlayed: p.minutesPlayed,
      goalsPer90: p.goalsPer90,
      rating: p.rating,
      ovrDelta: compareYear ? p.ovrDelta : null,
      archetypeKeys: p.archetypes.map((a) => a.key),
      seasonsAboveThreshold: p.seasonsAboveThreshold,
    };
  });

  return (
    <div>
      <SectionTabs
        tabs={[
          { label: "Scout", href: "/scout/spelare" },
          { label: "Spelare", href: "/spelare" },
          { label: "Jämför spelare", href: "/scout/compare?mode=spelare" },
          { label: "Topplista", href: "/spelare/rankings" },
        ]}
      />

      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3987e5]">Spelardatabas</p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight">Spelare</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-[#898781]">
            {result.total} spelare med minst en spelad match{seasonYear ? ` säsongen ${seasonYear}` : ""}. Sök på namn eller
            klubb — listan uppdateras medan du skriver. Kombinera position, ålder, OVR, statistik och spelartyp under{" "}
            <em className="not-italic text-[#c3c2b7]">Filter</em>.
          </p>
        </div>
        <Link
          href="/scout/compare?mode=spelare"
          className="shrink-0 rounded-full border border-white/10 px-3.5 py-1.5 text-xs font-medium text-[#c3c2b7] transition-colors hover:border-white/25 hover:bg-white/5 hover:text-white"
        >
          Jämför två spelare
        </Link>
      </div>

      <PlayerExplorer
        basePath="/spelare"
        accent={colors.accent.football}
        players={players}
        teams={teams.filter((t) => t.external_id !== null).map((t) => ({ externalId: t.external_id as number, name: t.name }))}
        seasons={seasons.map((s) => s.year)}
        season={seasonYear}
        initialFilters={filters}
        archetypeOptions={ARCHETYPES.map((a) => ({ key: a.key, label: a.label, definition: a.definition }))}
        advanced
        compareSeason={compareYear ?? null}
        consistencyMinSeasons={consistencyMinSeasons ?? null}
        consistencyThreshold={CONSISTENCY_OVR_THRESHOLD}
      />
    </div>
  );
}
