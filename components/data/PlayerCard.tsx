import Link from "next/link";
import { PlayerAvatar } from "./PlayerAvatar";
import { translatePosition } from "@/lib/i18n/sv";
import { getTeamAccent } from "@/lib/data/team-colors";

export interface PlayerCardStat {
  goals: number;
  assists: number;
  appearances: number;
  minutesPlayed: number;
  year: number;
}

export interface PlayerCardData {
  id: number;
  full_name: string;
  position: string | null;
  photoUrl: string | null;
  teamName: string | null;
  teamIndex: 0 | 1;
  teamExternalId: number | null;
  stat: PlayerCardStat | null;
}

export type PlayerSortKey = "name" | "goals" | "assists" | "appearances" | "minutes";

// Positionsgrupp -> färg. Återanvänder redan etablerade tokens (blå/orange
// från kategorisk-paletten, grönt/gult från status-paletten) istället för
// att introducera nya kulörer bara för det här badget.
const POSITION_COLORS: Record<string, string> = {
  Goalkeeper: "#eab308",
  Defender: "#3987e5",
  Midfielder: "#0ca30c",
  Attacker: "#d95926",
  Forward: "#d95926",
};

function primaryStatFor(stat: PlayerCardStat, sort: PlayerSortKey): { value: number; label: string } | null {
  switch (sort) {
    case "goals":
      return { value: stat.goals, label: `mål ${stat.year}` };
    case "assists":
      return { value: stat.assists, label: `assist ${stat.year}` };
    case "appearances":
      return { value: stat.appearances, label: `matcher ${stat.year}` };
    case "minutes":
      return { value: stat.minutesPlayed, label: `min ${stat.year}` };
    default:
      return { value: stat.goals, label: `mål ${stat.year}` };
  }
}

/**
 * Ett spelarkort — återanvänds av både PlayerSearchList (huvudlistan) och
 * lagprofilens truppsektion, så det bara finns EN kortstil att hålla
 * konsekvent. Positionsbadge + tunn klubbfärgad vänsterkant bryter den
 * annars enformiga "identisk box"-känslan utan att göra varje kort till
 * ett eget litet konstverk.
 */
export function PlayerCard({ player, sort = "name" }: { player: PlayerCardData; sort?: PlayerSortKey }) {
  const accent = getTeamAccent(player.teamExternalId);
  const positionColor = player.position ? POSITION_COLORS[player.position] : undefined;
  const primaryStat = player.stat ? primaryStatFor(player.stat, sort) : null;

  return (
    <Link
      href={`/data/players/${player.id}`}
      className="flex items-center gap-3 rounded-xl border border-white/10 border-l-2 bg-[#1a1a19] p-3 transition-colors hover:border-white/25 hover:bg-white/[.03]"
      style={{ borderLeftColor: accent }}
    >
      <PlayerAvatar name={player.full_name} teamIndex={player.teamIndex} photoUrl={player.photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{player.full_name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate text-xs text-[#898781]">{player.teamName ?? "—"}</span>
          {player.position && (
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: `${positionColor}22`, color: positionColor }}
            >
              {translatePosition(player.position)}
            </span>
          )}
        </div>
      </div>
      {primaryStat && (
        <div className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-right">
          <p className="text-sm font-semibold leading-none">{primaryStat.value}</p>
          <p className="mt-0.5 text-[9px] leading-none text-[#898781]">{primaryStat.label}</p>
        </div>
      )}
    </Link>
  );
}
