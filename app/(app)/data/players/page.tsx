import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlayerSearchList, type PlayerListItem } from "@/components/data/PlayerSearchList";
import type { PlayerSortKey } from "@/components/data/PlayerCard";
import { SectionTabs } from "@/components/data/SectionTabs";

interface PlayerListRow {
  id: number;
  full_name: string;
  position: string | null;
  photo_url: string | null;
  current_team: { id: number; name: string; external_id: number | null } | null;
}

interface StatRow {
  player_id: number;
  goals: number;
  assists: number;
  appearances: number;
  minutes_played: number;
  season: { year: number } | null;
}

const VALID_SORTS: PlayerSortKey[] = ["name", "goals", "assists", "appearances", "minutes"];
const SEASON_OPTIONS = [2024, 2023, 2022] as const;
const TEAM_OPTIONS = ["IFK Göteborg", "AIK Stockholm"] as const;

export default async function PlayersIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; season?: string; team?: string }>;
}) {
  const { sort: rawSort, season: rawSeason, team: rawTeam } = await searchParams;
  const sort: PlayerSortKey = VALID_SORTS.includes(rawSort as PlayerSortKey) ? (rawSort as PlayerSortKey) : "name";
  const seasonNum = Number(rawSeason);
  const seasonFilter: "all" | (typeof SEASON_OPTIONS)[number] = SEASON_OPTIONS.includes(
    seasonNum as (typeof SEASON_OPTIONS)[number]
  )
    ? (seasonNum as (typeof SEASON_OPTIONS)[number])
    : "all";
  const teamFilter: "all" | (typeof TEAM_OPTIONS)[number] = TEAM_OPTIONS.includes(
    rawTeam as (typeof TEAM_OPTIONS)[number]
  )
    ? (rawTeam as (typeof TEAM_OPTIONS)[number])
    : "all";

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("player")
    .select("id, full_name, position, photo_url, current_team:current_team_id(id, name, external_id)")
    .order("full_name")
    .returns<PlayerListRow[]>();

  const allPlayers = data ?? [];
  const players = teamFilter === "all" ? allPlayers : allPlayers.filter((p) => p.current_team?.name === teamFilter);

  // Hämtas alltid i bulk (253 rader) och reduceras i JS — samma mönster
  // som lagprofilen/get_top_scorers, billigare än en fråga per spelare.
  const { data: statsData } = await supabase
    .from("statistics")
    .select("player_id, goals, assists, appearances, minutes_played, season:season_id(year)")
    .returns<StatRow[]>();
  const stats = statsData ?? [];

  let items: PlayerListItem[];

  if (seasonFilter === "all") {
    // "Alla säsonger" = summerat över 2022–2024 per spelare. Spelare utan
    // en enda match under hela perioden (bara registrerade, aldrig spelat)
    // filtreras bort — se kommentar nedan om varför.
    const totals = new Map<
      number,
      { goals: number; assists: number; appearances: number; minutesPlayed: number }
    >();
    for (const row of stats) {
      const existing = totals.get(row.player_id) ?? { goals: 0, assists: 0, appearances: 0, minutesPlayed: 0 };
      existing.goals += row.goals;
      existing.assists += row.assists;
      existing.appearances += row.appearances;
      existing.minutesPlayed += row.minutes_played;
      totals.set(row.player_id, existing);
    }
    items = players
      .filter((p) => (totals.get(p.id)?.appearances ?? 0) > 0)
      .map((p) => ({
        id: p.id,
        full_name: p.full_name,
        position: p.position,
        photoUrl: p.photo_url,
        teamName: p.current_team?.name ?? null,
        teamIndex: p.current_team?.external_id === 377 ? 1 : 0,
        teamExternalId: p.current_team?.external_id ?? null,
        stat: { ...totals.get(p.id)!, year: "all" as const },
      }));
  } else {
    // En specifik säsong: bara spelare som faktiskt SPELADE den säsongen
    // (appearances > 0) visas. API-Football:s statistikrader inkluderar
    // annars alla som var registrerade för klubben det året — inklusive
    // spelare som aldrig kom till en enda match (provspel, reserver,
    // spelare som lämnade innan säsongsstart etc.) — vilket annars
    // uppblåser antalet långt över en verklig truppstorlek (~25–35).
    const statByPlayer = new Map<
      number,
      { goals: number; assists: number; appearances: number; minutesPlayed: number }
    >();
    for (const row of stats) {
      if (row.season?.year !== seasonFilter || row.appearances <= 0) continue;
      statByPlayer.set(row.player_id, {
        goals: row.goals,
        assists: row.assists,
        appearances: row.appearances,
        minutesPlayed: row.minutes_played,
      });
    }
    items = players
      .filter((p) => statByPlayer.has(p.id))
      .map((p) => ({
        id: p.id,
        full_name: p.full_name,
        position: p.position,
        photoUrl: p.photo_url,
        teamName: p.current_team?.name ?? null,
        teamIndex: p.current_team?.external_id === 377 ? 1 : 0,
        teamExternalId: p.current_team?.external_id ?? null,
        stat: { ...statByPlayer.get(p.id)!, year: seasonFilter },
      }));
  }

  const sortKeyMap: Record<PlayerSortKey, keyof NonNullable<PlayerListItem["stat"]> | null> = {
    name: null,
    goals: "goals",
    assists: "assists",
    appearances: "appearances",
    minutes: "minutesPlayed",
  };
  const statKey = sortKeyMap[sort];
  const sortedItems =
    statKey === null
      ? [...items].sort((a, b) => a.full_name.localeCompare(b.full_name, "sv"))
      : [...items].sort((a, b) => {
          const av = a.stat?.[statKey];
          const bv = b.stat?.[statKey];
          return (typeof bv === "number" ? bv : -1) - (typeof av === "number" ? av : -1);
        });

  function buildHref(overrides: { sort?: string; season?: string; team?: string }) {
    const params = new URLSearchParams();
    const next = {
      sort: overrides.sort !== undefined ? overrides.sort : rawSort,
      season: overrides.season !== undefined ? overrides.season : rawSeason,
      team: overrides.team !== undefined ? overrides.team : rawTeam,
    };
    if (next.sort) params.set("sort", next.sort);
    if (next.season) params.set("season", next.season);
    if (next.team) params.set("team", next.team);
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
            {sortedItems.length} spelare {teamFilter === "all" ? "från IFK Göteborg och AIK" : `från ${teamFilter}`}
            {seasonFilter === "all" ? ", 2022–2024" : `, säsongen ${seasonFilter}`}
            {seasonFilter !== "all" ? " (som faktiskt spelade den säsongen)" : ""}.
          </p>
        </div>
        <Link
          href="/data/players/compare"
          className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-[#c3c2b7] transition-colors hover:bg-white/5 hover:text-white"
        >
          ⚖️ Jämför två spelare
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[#7d7c76]">Säsong:</span>
          <div className="flex flex-wrap gap-1">
            {(["all", ...SEASON_OPTIONS] as const).map((s) => (
              <Link
                key={s}
                href={buildHref({ season: s === "all" ? undefined : String(s) })}
                className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                  seasonFilter === s ? "bg-[#3987e5]/15 text-white" : "text-[#898781] hover:text-white"
                }`}
              >
                {s === "all" ? "Alla säsonger" : s}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#7d7c76]">Lag:</span>
          <div className="flex flex-wrap gap-1">
            <Link
              href={buildHref({ team: undefined })}
              className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                teamFilter === "all" ? "bg-[#3987e5]/15 text-white" : "text-[#898781] hover:text-white"
              }`}
            >
              Alla
            </Link>
            {TEAM_OPTIONS.map((t) => (
              <Link
                key={t}
                href={buildHref({ team: t })}
                className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                  teamFilter === t ? "bg-[#3987e5]/15 text-white" : "text-[#898781] hover:text-white"
                }`}
              >
                {t}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-[#e66767]">Kunde inte hämta spelare: {error.message}</p>}

      <PlayerSearchList players={sortedItems} sort={sort} />
    </div>
  );
}
