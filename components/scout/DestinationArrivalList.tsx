import Link from "next/link";
import type { DestinationArrival } from "@/lib/football/post-allsvenskan";
import { foreignClubSlug } from "@/lib/football/post-allsvenskan";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";

/**
 * Fas 19e (2026-08-23) — spelarlistan bakom en destinationssiffra, delad av
 * både liga- och klubbvyn så att de två drill-downerna alltid ser likadana
 * ut och visar samma fält. Varje rad beskriver ÖVERGÅNGEN (från vilken
 * Allsvensk klubb, vilket år, till vilken klubb), inte spelarens hela
 * karriär — det är övergången rankingen räknar.
 */
export function DestinationArrivalList({
  arrivals,
  showDestinationClub = false,
}: {
  arrivals: DestinationArrival[];
  /** På ligasidan är destinationsklubben olika per rad och måste visas; på klubbsidan är den redan given av rubriken. */
  showDestinationClub?: boolean;
}) {
  if (arrivals.length === 0) return <p className="mt-6 text-sm text-[#898781]">Ingen dokumenterad direktövergång hittad.</p>;

  return (
    <div className="mt-6 space-y-1.5">
      {arrivals.map(({ player, departure, moveCount }) => (
        <Link
          key={player.playerId}
          href={`/scout/efter-allsvenskan/${player.playerId}`}
          className="group flex items-center gap-3 rounded-xl border border-white/5 bg-[#141418]/40 p-3 transition-colors hover:border-white/15 hover:bg-white/[.03] sm:gap-4 sm:p-4"
        >
          <PlayerAvatar name={player.playerName} size={44} photoUrl={player.photoUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-white group-hover:underline">{player.playerName}</p>
              {moveCount > 1 && (
                <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#c3c2b7]">
                  {moveCount} gånger
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-[#898781]">
              <span className="text-[#c3c2b7]">{departure.fromTeamName}</span>
              <span className="mx-1.5 text-[#5f5e59]">→</span>
              {showDestinationClub ? <span className="text-[#c3c2b7]">{departure.toTeamName}</span> : <span className="text-[#c3c2b7]">utomlands</span>}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-white">{departure.year}</p>
            <p className="text-[10px] uppercase tracking-wide text-[#7d7c76]">År</p>
          </div>
          {showDestinationClub && departure.toTeamLogoUrl && (
            <span className="hidden shrink-0 sm:block" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild */}
              <img src={departure.toTeamLogoUrl} alt="" className="h-8 w-8 object-contain" />
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

export const destinationClubHref = (teamName: string) => `/scout/efter-allsvenskan/klubb/${foreignClubSlug(teamName)}`;
