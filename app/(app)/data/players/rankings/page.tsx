import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionTabs } from "@/components/data/SectionTabs";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { getAvailableSeasons, listTeams } from "@/lib/football/catalog";
import { getRatingLeaderboard, type RatingLeaderboardParams } from "@/lib/football/rating/leaderboard";
import { ovrColor } from "@/lib/football/rating/ovr-color";
import { translatePosition } from "@/lib/i18n/sv";

// Samma motivering som /data/players: computeSeasonOvrMap (via
// getRatingLeaderboard) kostar paginerade fixture_player_stats-läsningar av
// hela säsongen — league/facts-routens etablerade cache-mönster.
export const revalidate = 3600;

const POSITION_GROUPS: NonNullable<RatingLeaderboardParams["positionGroup"]>[] = [
  "goalkeeper",
  "defender",
  "midfielder",
  "attacker",
];
const POSITION_GROUP_LABELS: Record<string, string> = {
  goalkeeper: "Målvakter",
  defender: "Försvarare",
  midfielder: "Mittfältare",
  attacker: "Anfallare",
};

/**
 * Player Rating — Topplista (planens steg 7). Rankad lista över hela
 * ligans OVR för vald säsong, DEFAULT filtrerad på MIN_PEER_MINUTES (450
 * min) — annars dominerar enstaka-match-målvakter (se leaderboard.ts).
 * Explicit "visa alla, inkl. begränsat underlag"-toggle för den som vill
 * se hela bilden ändå, aldrig helt dold.
 */
export default async function PlayerRankingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string;
    position?: string;
    team?: string;
    ageMin?: string;
    ageMax?: string;
    all?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const seasons = await getAvailableSeasons(supabase);
  const seasonYear = sp.season ? Number(sp.season) : seasons[0]?.year;
  const teams = await listTeams(supabase);
  const teamByExternalId = new Map(teams.filter((t) => t.external_id !== null).map((t) => [t.external_id as number, t]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const positionGroup = POSITION_GROUPS.includes(sp.position as never)
    ? (sp.position as RatingLeaderboardParams["positionGroup"])
    : undefined;
  const teamId = sp.team ? teamByExternalId.get(Number(sp.team))?.id : undefined;
  const includeLowSample = sp.all === "1";

  const entries = seasonYear
    ? await getRatingLeaderboard(supabase, {
        season: seasonYear,
        positionGroup,
        teamId,
        ageMin: sp.ageMin ? Number(sp.ageMin) : undefined,
        ageMax: sp.ageMax ? Number(sp.ageMax) : undefined,
        includeLowSample,
      })
    : [];

  function buildHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const next: Record<string, string | undefined> = {
      season: sp.season, position: sp.position, team: sp.team, ageMin: sp.ageMin, ageMax: sp.ageMax, all: sp.all,
      ...overrides,
    };
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/data/players/rankings?${qs}` : "/data/players/rankings";
  }

  return (
    <div>
      <SectionTabs
        tabs={[
          { label: "Spelare", href: "/data/players" },
          { label: "Jämför spelare", href: "/data/players/compare" },
          { label: "Topplista", href: "/data/players/rankings" },
        ]}
      />

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3987e5]">Player Rating</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Topplista</h1>
        <p className="mt-1 text-sm text-[#898781]">
          {entries.length} spelare rankade{seasonYear ? `, säsongen ${seasonYear}` : ""} efter statistisk OVR (0–99).
          {!includeLowSample && " Spelare under 450 minuter är dolda som standard."}
        </p>
      </div>

      {/* Säsongsväljare */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {seasons.map((s) => (
          <Link
            key={s.year}
            href={buildHref({ season: String(s.year) })}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              seasonYear === s.year ? "bg-[#3987e5]/15 text-white" : "text-[#898781] hover:text-white"
            }`}
          >
            {s.year}
          </Link>
        ))}
      </div>

      {/* Filter */}
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-[#1a1a19] p-3">
        <input type="hidden" name="season" value={seasonYear ?? ""} />
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Position
          <select name="position" defaultValue={sp.position ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            {POSITION_GROUPS.map((g) => (
              <option key={g} value={g}>{POSITION_GROUP_LABELS[g]}</option>
            ))}
          </select>
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
          Ålder min
          <input type="number" name="ageMin" defaultValue={sp.ageMin ?? ""} min={15} max={45} className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Ålder max
          <input type="number" name="ageMax" defaultValue={sp.ageMax ?? ""} min={15} max={45} className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-[#898781]">
          <input type="checkbox" name="all" value="1" defaultChecked={includeLowSample} className="h-3.5 w-3.5" />
          Visa alla, inkl. begränsat underlag (&lt;450 min)
        </label>
        <button type="submit" className="rounded-md bg-[#3987e5] px-3 py-1.5 text-sm font-medium text-white">
          Filtrera
        </button>
        {(sp.position || sp.team || sp.ageMin || sp.ageMax || includeLowSample) && (
          <Link
            href={buildHref({ position: undefined, team: undefined, ageMin: undefined, ageMax: undefined, all: undefined })}
            className="text-xs text-[#898781] hover:text-white"
          >
            Rensa filter
          </Link>
        )}
      </form>

      {/* Rankad lista */}
      <div className="mt-4 space-y-1.5">
        {entries.map((e, i) => {
          const team = teamById.get(e.teamId);
          const color = ovrColor(e.ovr);
          return (
            <Link
              key={e.playerId}
              href={`/data/players/${e.playerId}?season=${seasonYear}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1a1a19] p-3 transition-colors hover:border-white/25 hover:bg-white/[.03]"
            >
              <span className="w-6 shrink-0 text-right text-sm font-semibold text-[#7d7c76] tabular-nums">{i + 1}</span>
              <PlayerAvatar name={e.fullName} teamExternalId={team?.external_id} photoUrl={e.photoUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {e.fullName}
                  {e.belowMinutesFloor && (
                    <span className="ml-1.5 rounded bg-[#e66767]/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#e66767]">
                      Begränsat underlag
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs text-[#898781]">
                  {team?.name ?? "—"}
                  {e.position && ` · ${translatePosition(e.position)}`}
                  {e.age !== null && ` · ${e.age} år`}
                  {` · ${e.ownMinutes} min`}
                </p>
              </div>
              <div
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-center"
                style={{ backgroundColor: `${color}1a` }}
              >
                <p className="text-lg font-bold leading-none tabular-nums" style={{ color }}>
                  {e.ovr}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-[#898781]">OVR</p>
              </div>
            </Link>
          );
        })}
      </div>
      {entries.length === 0 && <p className="mt-8 text-center text-sm text-[#898781]">Ingen spelare matchade filtret.</p>}
    </div>
  );
}
