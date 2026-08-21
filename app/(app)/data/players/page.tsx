import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlayerCard, type PlayerCardData, type PlayerSortKey } from "@/components/data/PlayerCard";
import { SectionTabs } from "@/components/data/SectionTabs";
import { getAvailableSeasons, listTeams } from "@/lib/football/catalog";
import { listPlayers, type PlayerListParams } from "@/lib/football/player-catalog";
import { translatePosition } from "@/lib/i18n/sv";

// Player Rating-batchberäkningen (computeSeasonOvrMap) kostar två
// paginerade fixture_player_stats-läsningar av hela säsongen — samma
// etablerade mönster som league/facts-routen använder för att hålla den
// kostnaden borta från varje enskild sidladdning.
export const revalidate = 3600;

const PAGE_SIZE = 30;
const VALID_SORTS: PlayerListParams["sort"][] = ["name", "goals", "assists", "appearances", "minutes", "goalsPer90", "age", "rating"];
const POSITIONS: NonNullable<PlayerListParams["position"]>[] = ["Goalkeeper", "Defender", "Midfielder", "Attacker"];

/**
 * Data-sektionens breddning (2026-08-20) — spelarlistan skriven om från en
 * obegränsad dubbel-fetch (hela player-tabellen, 2 305 rader — redan över
 * Supabases 1000-radstak idag, plus hela statistics, 6 377 rader) till
 * riktig server-side sökning/filtrering/sortering/paginering via
 * lib/football/player-catalog.ts:s listPlayers. FIFA-scouting-inspirerade
 * filter: position, ålder-intervall, mål-tröskel.
 */
export default async function PlayersIndexPage({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string;
    dir?: string;
    season?: string;
    team?: string;
    position?: string;
    ageMin?: string;
    ageMax?: string;
    goalsMin?: string;
    ratingMin?: string;
    ratingMax?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const seasons = await getAvailableSeasons(supabase);
  const seasonYear = sp.season ? Number(sp.season) : seasons[0]?.year;
  const teams = await listTeams(supabase);
  const teamByExternalId = new Map(teams.filter((t) => t.external_id !== null).map((t) => [t.external_id as number, t]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const sort = (VALID_SORTS.includes(sp.sort as PlayerListParams["sort"]) ? sp.sort : "goals") as PlayerListParams["sort"];
  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const position = POSITIONS.includes(sp.position as never) ? (sp.position as PlayerListParams["position"]) : undefined;
  const teamId = sp.team ? teamByExternalId.get(Number(sp.team))?.id : undefined;
  const page = sp.page ? Math.max(0, Number(sp.page) - 1) : 0;

  let result = { items: [] as Awaited<ReturnType<typeof listPlayers>>["items"], total: 0 };
  if (seasonYear) {
    result = await listPlayers(supabase, {
      season: seasonYear,
      teamId,
      position,
      ageMin: sp.ageMin ? Number(sp.ageMin) : undefined,
      ageMax: sp.ageMax ? Number(sp.ageMax) : undefined,
      goalsMin: sp.goalsMin ? Number(sp.goalsMin) : undefined,
      ratingMin: sp.ratingMin ? Number(sp.ratingMin) : undefined,
      ratingMax: sp.ratingMax ? Number(sp.ratingMax) : undefined,
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
      stat: { goals: p.goals, assists: p.assists, appearances: p.appearances, minutesPlayed: p.minutesPlayed, year: seasonYear ?? "all" },
      rating: p.rating,
    };
  });

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const currentPage = page + 1;

  function buildHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const next: Record<string, string | undefined> = {
      season: sp.season, team: sp.team, position: sp.position, ageMin: sp.ageMin, ageMax: sp.ageMax,
      goalsMin: sp.goalsMin, ratingMin: sp.ratingMin, ratingMax: sp.ratingMax,
      q: sp.q, sort: sp.sort, dir: sp.dir, page: sp.page,
      ...overrides,
    };
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/data/players?${qs}` : "/data/players";
  }

  return (
    <div>
      <SectionTabs
        tabs={[
          { label: "Spelare", href: "/data/players" },
          { label: "Jämför spelare", href: "/data/players/compare" },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3987e5]">Spelardatabas</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Spelare</h1>
          <p className="mt-1 text-sm text-[#898781]">
            {result.total} spelare i Allsvenskan{seasonYear ? `, säsongen ${seasonYear}` : ""} (som faktiskt spelat minst en match).
          </p>
        </div>
        <Link
          href="/data/players/compare"
          className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-[#c3c2b7] transition-colors hover:bg-white/5 hover:text-white"
        >
          ⚖️ Jämför två spelare
        </Link>
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

      {/* Filter — FIFA-scouting-inspirerat: klubb, position, ålder, mål, fritextsök */}
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-[#1a1a19] p-3">
        <input type="hidden" name="season" value={seasonYear ?? ""} />
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
          OVR min
          <input type="number" name="ratingMin" defaultValue={sp.ratingMin ?? ""} min={0} max={99} title="Player Rating — statistisk 0–99-OVR" className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          OVR max
          <input type="number" name="ratingMax" defaultValue={sp.ratingMax ?? ""} min={0} max={99} title="Player Rating — statistisk 0–99-OVR" className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
        </label>
        <button type="submit" className="rounded-md bg-[#3987e5] px-3 py-1.5 text-sm font-medium text-white">
          Filtrera
        </button>
        {(sp.team || sp.position || sp.ageMin || sp.ageMax || sp.goalsMin || sp.ratingMin || sp.ratingMax || sp.q) && (
          <Link href={buildHref({ team: undefined, position: undefined, ageMin: undefined, ageMax: undefined, goalsMin: undefined, ratingMin: undefined, ratingMax: undefined, q: undefined, page: undefined })} className="text-xs text-[#898781] hover:text-white">
            Rensa filter
          </Link>
        )}
      </form>

      {/* Sortering */}
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-[#7d7c76]">Sortera:</span>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["name", "Namn"], ["goals", "Mål"], ["assists", "Assist"], ["appearances", "Matcher"],
              ["minutes", "Minuter"], ["goalsPer90", "Mål/90"], ["age", "Ålder"], ["rating", "OVR"],
            ] as const
          ).map(([key, label]) => (
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
          <PlayerCard key={p.id} player={p} sort={sort === "goalsPer90" || sort === "age" || sort === "rating" ? "goals" : (sort as PlayerSortKey)} />
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
