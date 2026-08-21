import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlayerCard, type PlayerCardData, type PlayerSortKey } from "@/components/data/PlayerCard";
import { SectionTabs } from "@/components/data/SectionTabs";
import { getAvailableSeasons, listTeams } from "@/lib/football/catalog";
import { listPlayers, type PlayerListParams } from "@/lib/football/player-catalog";
import { ARCHETYPES } from "@/lib/football/rating/archetypes";
import { translatePosition } from "@/lib/i18n/sv";

// Samma motivering som /data/players/rankings: listPlayers kör
// computeSeasonOvrMap/getRatingTrendComparison, båda i första hand lästa ur
// det persisterade player_season_rating-facit (se rating-store.ts) — snabbt,
// men fortfarande värt sidnivåcache.
export const revalidate = 3600;

const PAGE_SIZE = 30;
const VALID_SORTS: PlayerListParams["sort"][] = [
  "name", "goals", "assists", "appearances", "minutes", "goalsPer90", "age", "rating", "ovrDelta",
];
const POSITIONS: NonNullable<PlayerListParams["position"]>[] = ["Goalkeeper", "Defender", "Midfielder", "Attacker"];
const SORT_OPTIONS: [PlayerListParams["sort"], string][] = [
  ["rating", "OVR"], ["ovrDelta", "OVR-förändring"], ["goals", "Mål"], ["assists", "Assist"],
  ["goalsPer90", "Mål/90"], ["minutes", "Minuter"], ["appearances", "Matcher"], ["age", "Ålder"], ["name", "Namn"],
];

/**
 * Scout — egen huvudsektion i navbaren (2026-08-21), medvetet skild från
 * "Spelare" (den enklare översikten, /data/players). Det här är det stora,
 * kombinerbara sök-/filterverktyget: klubb + position + ålder + OVR +
 * statistik (mål/assist/minuter) + utveckling (OVR-förändring mot en
 * tidigare säsong) i EN vy, byggt för att hitta olika typer av spelare —
 * inte bara bläddra. Fokuserar per definition på NUVARANDE aktiva spelare
 * (samma "senaste säsongen som standard"-princip som resten av appen,
 * se lib/football/catalog.ts:s getAvailableSeasons-ordning), med hela
 * säsongshistoriken tillgänglig via jämförelseväljaren och länken till
 * respektive profil.
 *
 * Byggd ovanpå EXAKT samma lib/football/player-catalog.ts:s listPlayers
 * som /data/players — inget separat datalager, bara fler filter/mått
 * exponerade i UI:t (assistsMin/minutesMin/ovrDelta, nya i denna omgång).
 */
export default async function ScoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string;
    dir?: string;
    season?: string;
    compareSeason?: string;
    team?: string;
    position?: string;
    ageMin?: string;
    ageMax?: string;
    goalsMin?: string;
    assistsMin?: string;
    minutesMin?: string;
    ratingMin?: string;
    ratingMax?: string;
    ovrDeltaMin?: string;
    ovrDeltaMax?: string;
    archetype?: string | string[];
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const selectedArchetypes = sp.archetype ? (Array.isArray(sp.archetype) ? sp.archetype : [sp.archetype]) : [];

  const seasons = await getAvailableSeasons(supabase);
  const seasonYear = sp.season ? Number(sp.season) : seasons[0]?.year;
  const compareYear = sp.compareSeason ? Number(sp.compareSeason) : undefined;
  const teams = await listTeams(supabase);
  const teamByExternalId = new Map(teams.filter((t) => t.external_id !== null).map((t) => [t.external_id as number, t]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const sort = (VALID_SORTS.includes(sp.sort as PlayerListParams["sort"]) ? sp.sort : "rating") as PlayerListParams["sort"];
  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const position = POSITIONS.includes(sp.position as never) ? (sp.position as PlayerListParams["position"]) : undefined;
  const teamId = sp.team ? teamByExternalId.get(Number(sp.team))?.id : undefined;
  const page = sp.page ? Math.max(0, Number(sp.page) - 1) : 0;

  let result = { items: [] as Awaited<ReturnType<typeof listPlayers>>["items"], total: 0 };
  if (seasonYear) {
    result = await listPlayers(supabase, {
      season: seasonYear,
      compareSeason: compareYear,
      teamId,
      position,
      ageMin: sp.ageMin ? Number(sp.ageMin) : undefined,
      ageMax: sp.ageMax ? Number(sp.ageMax) : undefined,
      goalsMin: sp.goalsMin ? Number(sp.goalsMin) : undefined,
      assistsMin: sp.assistsMin ? Number(sp.assistsMin) : undefined,
      minutesMin: sp.minutesMin ? Number(sp.minutesMin) : undefined,
      ratingMin: sp.ratingMin ? Number(sp.ratingMin) : undefined,
      ratingMax: sp.ratingMax ? Number(sp.ratingMax) : undefined,
      ovrDeltaMin: sp.ovrDeltaMin ? Number(sp.ovrDeltaMin) : undefined,
      ovrDeltaMax: sp.ovrDeltaMax ? Number(sp.ovrDeltaMax) : undefined,
      archetypeKeys: selectedArchetypes.length > 0 ? selectedArchetypes : undefined,
      query: sp.q,
      sort,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    });
  }

  const cards: PlayerCardData[] = result.items.map((p) => {
    const team = teamById.get(p.teamId);
    return {
      id: p.id,
      full_name: p.fullName,
      position: p.position,
      photoUrl: p.photoUrl,
      teamName: team?.name ?? null,
      teamExternalId: team?.external_id ?? null,
      age: p.age,
      rating: p.rating,
      ovrDelta: compareYear ? p.ovrDelta : null,
      archetypes: p.archetypes,
      stat: { goals: p.goals, assists: p.assists, appearances: p.appearances, minutesPlayed: p.minutesPlayed, year: seasonYear ?? "all" },
    };
  });

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const currentPage = page + 1;

  function buildHref(overrides: Record<string, string | undefined>, archetypeOverride?: string[]) {
    const params = new URLSearchParams();
    const next: Record<string, string | undefined> = {
      season: sp.season, compareSeason: sp.compareSeason, team: sp.team, position: sp.position,
      ageMin: sp.ageMin, ageMax: sp.ageMax, goalsMin: sp.goalsMin, assistsMin: sp.assistsMin, minutesMin: sp.minutesMin,
      ratingMin: sp.ratingMin, ratingMax: sp.ratingMax, ovrDeltaMin: sp.ovrDeltaMin, ovrDeltaMax: sp.ovrDeltaMax,
      q: sp.q, sort: sp.sort, dir: sp.dir, page: sp.page,
      ...overrides,
    };
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    for (const key of archetypeOverride ?? selectedArchetypes) params.append("archetype", key);
    const qs = params.toString();
    return qs ? `/data/scout?${qs}` : "/data/scout";
  }

  /** Bygger URL:en för att lägga till/ta bort EN arketyp från urvalet, samma "klicka för att växla"-mönster som resten av Scout:s filter. */
  function toggleArchetypeHref(key: string) {
    const next = selectedArchetypes.includes(key) ? selectedArchetypes.filter((k) => k !== key) : [...selectedArchetypes, key];
    return buildHref({ page: undefined }, next);
  }

  const hasFilters =
    sp.team || sp.position || sp.ageMin || sp.ageMax || sp.goalsMin || sp.assistsMin || sp.minutesMin ||
    sp.ratingMin || sp.ratingMax || sp.compareSeason || sp.ovrDeltaMin || sp.ovrDeltaMax || sp.q || selectedArchetypes.length > 0;

  return (
    <div>
      <SectionTabs
        tabs={[
          { label: "Scout", href: "/data/scout" },
          { label: "Spelare", href: "/data/players" },
          { label: "Jämför spelare", href: "/data/players/compare" },
          { label: "Topplista", href: "/data/players/rankings" },
        ]}
      />

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3987e5]">Scout Network</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Scout</h1>
        <p className="mt-1 text-sm text-[#898781]">
          {result.total} spelare matchar filtret{seasonYear ? `, säsongen ${seasonYear}` : ""} — kombinera klubb, position,
          ålder, OVR, statistik och utveckling för att hitta rätt spelartyp bland Allsvenskans nuvarande aktiva trupp.
        </p>
      </div>

      {/* Säsongsväljare */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {seasons.map((s) => (
          <Link
            key={s.year}
            href={buildHref({ season: String(s.year), page: undefined })}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              seasonYear === s.year ? "bg-[#3987e5]/15 text-white" : "text-[#898781] hover:text-white"
            }`}
          >
            {s.year}
          </Link>
        ))}
      </div>

      {/* Filter — Scout:s stora, kombinerbara sökform */}
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-[#1a1a19] p-3">
        <input type="hidden" name="season" value={seasonYear ?? ""} />
        {selectedArchetypes.map((key) => (
          <input key={key} type="hidden" name="archetype" value={key} />
        ))}
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Sök namn
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Spelarnamn..."
            className="w-36 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Klubb
          <select name="team" defaultValue={sp.team ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            {teams.map((t) => (
              <option key={t.id} value={t.external_id ?? ""}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Position
          <select name="position" defaultValue={sp.position ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>{translatePosition(p)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Ålder min
          <input type="number" name="ageMin" defaultValue={sp.ageMin ?? ""} min={15} max={45} className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Ålder max
          <input type="number" name="ageMax" defaultValue={sp.ageMax ?? ""} min={15} max={45} className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Min. mål
          <input type="number" name="goalsMin" defaultValue={sp.goalsMin ?? ""} min={0} className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Min. assist
          <input type="number" name="assistsMin" defaultValue={sp.assistsMin ?? ""} min={0} className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Min. minuter
          <input type="number" name="minutesMin" defaultValue={sp.minutesMin ?? ""} min={0} step={90} className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          OVR min
          <input type="number" name="ratingMin" defaultValue={sp.ratingMin ?? ""} min={0} max={99} title="Player Rating — statistisk 0–99-OVR" className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          OVR max
          <input type="number" name="ratingMax" defaultValue={sp.ratingMax ?? ""} min={0} max={99} title="Player Rating — statistisk 0–99-OVR" className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Utveckling mot
          <select name="compareSeason" defaultValue={sp.compareSeason ?? ""} title="Jämför OVR mot en tidigare säsong" className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Av</option>
            {seasons.filter((s) => s.year !== seasonYear).map((s) => (
              <option key={s.year} value={s.year}>{s.year}</option>
            ))}
          </select>
        </label>
        {compareYear && (
          <>
            <label className="flex flex-col gap-1 text-xs text-[#898781]">
              OVR-förändring min
              <input type="number" name="ovrDeltaMin" defaultValue={sp.ovrDeltaMin ?? ""} className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#898781]">
              OVR-förändring max
              <input type="number" name="ovrDeltaMax" defaultValue={sp.ovrDeltaMax ?? ""} className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
            </label>
          </>
        )}
        <button type="submit" className="rounded-md bg-[#3987e5] px-3 py-1.5 text-sm font-medium text-white">
          Sök
        </button>
        {hasFilters && (
          <Link
            href={buildHref(
              {
                team: undefined, position: undefined, ageMin: undefined, ageMax: undefined, goalsMin: undefined,
                assistsMin: undefined, minutesMin: undefined, ratingMin: undefined, ratingMax: undefined,
                compareSeason: undefined, ovrDeltaMin: undefined, ovrDeltaMax: undefined, q: undefined, page: undefined,
              },
              []
            )}
            className="text-xs text-[#898781] hover:text-white"
          >
            Rensa filter
          </Link>
        )}
      </form>

      {/* Spelartyper — Scout Engine Fas 4:s arketyper (se rating/archetypes.ts).
          Klicka för att lägga till/ta bort, ingen "Sök"-knapp behövs — samma
          "direkt navigering"-mönster som säsongsväljaren ovan. */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs text-[#7d7c76]">
          Spelartyper <span className="text-[#5f5e59]">(regelbaserade, byggda på riktig statistik — inga gissningar)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ARCHETYPES.map((a) => {
            const active = selectedArchetypes.includes(a.key);
            return (
              <Link
                key={a.key}
                href={toggleArchetypeHref(a.key)}
                title={a.definition}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? "bg-[#3987e5]/15 text-white" : "border border-white/10 text-[#898781] hover:text-white"
                }`}
              >
                {a.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Sortering */}
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-[#7d7c76]">Sortera:</span>
        <div className="flex flex-wrap gap-1">
          {SORT_OPTIONS.map(([key, label]) => (
            <Link
              key={key}
              href={buildHref({ sort: key, dir: sort === key && sortDir === "desc" ? "asc" : "desc", page: undefined })}
              className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                sort === key ? "bg-[#3987e5]/15 text-white" : "text-[#898781] hover:text-white"
              }`}
            >
              {label} {sort === key ? (sortDir === "desc" ? "↓" : "↑") : ""}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((p) => (
          <PlayerCard key={p.id} player={p} sort={(["goals", "assists", "appearances", "minutes"] as PlayerSortKey[]).includes(sort as PlayerSortKey) ? (sort as PlayerSortKey) : "goals"} />
        ))}
      </div>
      {cards.length === 0 && <p className="mt-8 text-center text-sm text-[#898781]">Ingen spelare matchade filtret.</p>}

      {/* Paginering */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <Link
            href={buildHref({ page: String(Math.max(1, currentPage - 1)) })}
            className={`rounded-md border border-white/10 px-3 py-1.5 ${currentPage <= 1 ? "pointer-events-none opacity-30" : "hover:bg-white/5"}`}
          >
            ← Föregående
          </Link>
          <span className="text-xs text-[#898781]">
            Sida {currentPage} av {totalPages}
          </span>
          <Link
            href={buildHref({ page: String(Math.min(totalPages, currentPage + 1)) })}
            className={`rounded-md border border-white/10 px-3 py-1.5 ${currentPage >= totalPages ? "pointer-events-none opacity-30" : "hover:bg-white/5"}`}
          >
            Nästa →
          </Link>
        </div>
      )}
    </div>
  );
}
