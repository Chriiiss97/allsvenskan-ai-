import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlayerExplorer, type ExplorerPlayer } from "@/components/data/PlayerExplorer";
import { ScoutDetailPanel } from "@/components/data/ScoutDetailPanel";
import { SectionTabs } from "@/components/data/SectionTabs";
import { colors } from "@/lib/design/tokens";
import { getCachedSeasons, getCachedTeams, getCachedPlayerList } from "@/lib/football/cached-reads";
import { listPlayers, type PlayerListParams } from "@/lib/football/player-catalog";
import { parseExplorerFilters, type ExplorerFilters } from "@/lib/football/player-explorer-params";
import { ARCHETYPES, archetypesForRating, type MatchedArchetype } from "@/lib/ovr/archetypes";
import { computeScoutMatch, type ScoutMatchCriteria } from "@/lib/football/scout/scout-match";
import { getPlayerProfile, FootballDataError } from "@/lib/football/tools";
import { computePlayerDNA } from "@/lib/football/player-dna";
import { displayHint, getPlayerOvr, getPlayerOvrHistory, type OvrDisplayHint, type PlayerOvr } from "@/lib/ovr/store";
import { buildOvrTrendSummary } from "@/lib/ovr/trend";
import { calculateAge } from "@/lib/football/age";

// Samma motivering som /spelare/rankings: listPlayers kör
// getSeasonOvrMap/getOvrTrend, båda lästa direkt ur
// de persisterade betygen i player_ratings (se lib/ovr/store.ts) — snabbt,
// men fortfarande värt sidnivåcache.
export const revalidate = 3600;

/** Tröskeln "konsekvent bra"-filtret räknar säsonger mot — fast, inte konfigurerbar i UI:t (håller filtret till EN enkel siffra istället för två, samma "inte ett Excel-ark"-princip som resten av Scout). */
const CONSISTENCY_OVR_THRESHOLD = 70;

function toNumber(value: string): number | undefined {
  return value ? Number(value) : undefined;
}

/** Filtren som en `computeScoutMatch`-kriteriemängd — samma översättning som utforskaren gör på klientsidan, så panelen och kortet aldrig visar olika procent. */
function matchCriteriaFrom(filters: ExplorerFilters, consistencyMinSeasons: number | undefined): ScoutMatchCriteria {
  return {
    position: filters.position || undefined,
    teamId: toNumber(filters.team),
    ageMin: toNumber(filters.ageMin),
    ageMax: toNumber(filters.ageMax),
    goalsMin: toNumber(filters.goalsMin),
    assistsMin: toNumber(filters.assistsMin),
    minutesMin: toNumber(filters.minutesMin),
    ratingMin: toNumber(filters.ratingMin),
    ratingMax: toNumber(filters.ratingMax),
    ovrDeltaMin: toNumber(filters.ovrDeltaMin),
    ovrDeltaMax: toNumber(filters.ovrDeltaMax),
    consistencyMinSeasons,
    archetypeKeys: filters.archetypes.length > 0 ? filters.archetypes : undefined,
    query: filters.q || undefined,
  };
}

/**
 * Scout — egen huvudsektion i navbaren (2026-08-21), medvetet skild från
 * "Spelare" (den enklare översikten, /spelare). Det här är det stora,
 * kombinerbara sök-/filterverktyget: klubb + position + ålder + OVR +
 * statistik (mål/assist/minuter) + utveckling (OVR-förändring mot en
 * tidigare säsong) i EN vy, byggt för att hitta olika typer av spelare —
 * inte bara bläddra. Fokuserar per definition på NUVARANDE aktiva spelare
 * (samma "senaste säsongen som standard"-princip som resten av appen),
 * med hela säsongshistoriken tillgänglig via säsongsväljaren.
 *
 * Ombyggt 2026-08-23 (användarfeedback: "kaos, otydligt, svårt att
 * förstå" + "listan ska uppdateras medan jag skriver"). Sidan hämtar HELA
 * säsongens spelarmängd EN gång och lämnar sök/filter/sortering till
 * components/data/PlayerExplorer.tsx, som gör det direkt i webbläsaren.
 * ⚠️ Skicka därför ALDRIG q/team/position/ålder/mål/assist/minuter/OVR till
 * listPlayers härifrån — klienten måste få hela mängden för att kunna
 * ta bort ett filter igen. De tre parametrar som ÄR kvar på servern
 * (säsong, jämförelsesäsong, konsekvent bra) kräver data utanför den
 * mängden och hämtas bara när någon faktiskt ber om dem.
 */
export default async function ScoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [seasons, teams] = await Promise.all([getCachedSeasons(), getCachedTeams()]);
  const seasonParam = typeof sp.season === "string" ? Number(sp.season) : undefined;
  const seasonYear = seasonParam && seasons.some((s) => s.year === seasonParam) ? seasonParam : seasons[0]?.year ?? null;
  const compareParam = typeof sp.compareSeason === "string" ? Number(sp.compareSeason) : undefined;
  const compareYear = compareParam && seasons.some((s) => s.year === compareParam) && compareParam !== seasonYear ? compareParam : undefined;
  const consistencyMinSeasons = typeof sp.consistencyMinSeasons === "string" && /^\d+$/.test(sp.consistencyMinSeasons)
    ? Number(sp.consistencyMinSeasons)
    : undefined;

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
    pageSize: Number.MAX_SAFE_INTEGER,
  };

  let result = { items: [] as Awaited<ReturnType<typeof listPlayers>>["items"], total: 0 };
  if (seasonYear) {
    result = await getCachedPlayerList(listParams);
  }

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

  // Scout Engine Fas 7 — detaljpanelen. Byggd på EXAKT samma funktioner som
  // den fulla profilsidan (getPlayerProfile/getPlayerOvr/
  // computePlayerDNA/getPlayerOvrHistory) — inget parallellt datalager,
  // bara ett annat ställe att visa dem. Arketyper/matchning återanvänds
  // direkt från result.items (spelaren klickades ju precis FRÅN den listan)
  // istället för att räknas om.
  const selectedPlayerId = typeof sp.selected === "string" && /^\d+$/.test(sp.selected) ? Number(sp.selected) : undefined;
  let selectedDetail: {
    player: { id: number; name: string; photoUrl: string | null; position: string | null; teamName: string | null; teamExternalId: number | null; age: number | null; nationality: string | null };
    rating: PlayerOvr | null;
    ratingDisplay: OvrDisplayHint | null;
    dna: Awaited<ReturnType<typeof computePlayerDNA>> | null;
    ratingHistory: Awaited<ReturnType<typeof getPlayerOvrHistory>>;
    ratingTrend: ReturnType<typeof buildOvrTrendSummary> | null;
    archetypes: MatchedArchetype[];
    scoutMatch: ReturnType<typeof computeScoutMatch>;
    unavailableReason: string | null;
  } | null = null;

  if (selectedPlayerId) {
    try {
      const profile = await getPlayerProfile(supabase, { player: String(selectedPlayerId), season: seasonYear ?? undefined });
      const listItem = result.items.find((p) => p.id === selectedPlayerId);

      // Scout Engine Fas 8 (prestanda) — säsongens id behövs oavsett (både
      // för den snabba rating-läsvägen och arketyp-fallbacken nedan),
      // hämtas EN gång, inte två separata frågor som tidigare.
      const seasonId = profile.season
        ? (await supabase.from("season").select("id").eq("year", profile.season).maybeSingle()).data?.id ?? null
        : null;

      const [rating, dna, ratingHistory] = await Promise.all([
        seasonId ? getPlayerOvr(supabase, { playerId: profile.player.id, seasonId }) : Promise.resolve(null),
        profile.season ? computePlayerDNA(supabase, { playerId: profile.player.id, season: profile.season }) : Promise.resolve(null),
        getPlayerOvrHistory(supabase, profile.player.id),
      ]);
      // EN indexerad fråga mot player_ratings. Det finns med flit ingen
      // live-beräkning som reserv: saknas raden visar panelen "ej tillgängligt"
      // i stället för ett tal som räknats fram på ett annat sätt än alla andra.

      // Arketyper: återanvänd redan om spelaren fanns i den aktuella
      // resultatlistan (vanliga fallet — man klickar ju därifrån). Annars
      // (t.ex. en delad länk) räknas de fram separat, samma väg som
      // player-catalog.ts redan gör, ingen ny logik.
      let archetypes: MatchedArchetype[] = listItem?.archetypes ?? [];
      if (!listItem && seasonId) {
        // Delad länk direkt till en spelare som inte finns i den aktuella
        // resultatlistan — hämta hans betyg och härled arketyperna därifrån.
        // En rad, inte hela säsongen.
        if (rating) archetypes = archetypesForRating(rating);
      }
      selectedDetail = {
        player: {
          id: profile.player.id,
          name: profile.player.name,
          photoUrl: profile.player.photoUrl,
          position: profile.player.position,
          teamName: profile.player.team?.name ?? null,
          teamExternalId: profile.player.team?.external_id ?? null,
          age: calculateAge(profile.player.birthDate),
          nationality: profile.player.nationality,
        },
        rating,
        ratingDisplay: rating ? displayHint(rating) : null,
        dna,
        ratingHistory,
        ratingTrend: buildOvrTrendSummary(ratingHistory),
        archetypes,
        scoutMatch: listItem
          ? computeScoutMatch(
              { ...listItem, archetypeKeys: listItem.archetypes.map((a) => a.key) },
              matchCriteriaFrom(filters, consistencyMinSeasons)
            )
          : null,
        unavailableReason: !profile.season ? "Spelaren har ingen registrerad speltid den här säsongen." : null,
      };
    } catch (err) {
      if (!(err instanceof FootballDataError)) throw err;
      // Ogiltigt/okänt spelar-id (t.ex. en trasig delad länk) — visa en
      // ärlig "hittades inte" i panelen, krascha aldrig hela Scout-sidan.
      selectedDetail = null;
    }
  }

  /** Nuvarande URL utan `selected` — panelens stäng-länk. */
  function closeHref() {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (key === "selected" || value === undefined) continue;
      if (Array.isArray(value)) for (const v of value) params.append(key, v);
      else params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/scout/spelare?${qs}` : "/scout/spelare";
  }

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

      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network</p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight">Spelare</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[#898781]">
          {result.total} aktiva spelare{seasonYear ? ` säsongen ${seasonYear}` : ""}. Sök på namn eller klubb — listan
          uppdateras medan du skriver. Kombinera position, ålder, OVR, statistik och spelartyp under <em className="not-italic text-[#c3c2b7]">Filter</em>.
        </p>
      </div>

      <PlayerExplorer
        basePath="/scout/spelare"
        accent={colors.accent.scout}
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
        selectionMode="panel"
        selectedId={selectedPlayerId ?? null}
        sidePanel={
          selectedPlayerId ? (
            selectedDetail ? (
              <ScoutDetailPanel
                player={selectedDetail.player}
                closeHref={closeHref()}
                fullProfileHref={`/scout/spelare/${selectedDetail.player.id}${seasonYear ? `?season=${seasonYear}` : ""}`}
                rating={selectedDetail.rating}
                ratingDisplay={selectedDetail.ratingDisplay}
                dna={selectedDetail.dna}
                ratingHistory={selectedDetail.ratingHistory}
                ratingTrend={selectedDetail.ratingTrend}
                archetypes={selectedDetail.archetypes}
                scoutMatch={selectedDetail.scoutMatch}
                unavailableReason={selectedDetail.unavailableReason}
              />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#141418] p-5">
                <p className="text-sm text-[#898781]">Kunde inte hitta spelaren.</p>
                <Link href={closeHref()} className="mt-2 inline-block text-xs text-[#a78bfa] hover:underline">
                  Stäng
                </Link>
              </div>
            )
          ) : undefined
        }
      />
    </div>
  );
}
