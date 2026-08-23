import Link from "next/link";
import type { PitchPlayer } from "@/lib/football/formation-pitch";

/**
 * Fas 21 (2026-08-23) — båda lagen på EN plan.
 *
 * FormationPitch (Fas 16g) ritar ETT lag på en stående plan, och Lag-fliken
 * visade därför två separata planer sida vid sida. Det gör det omöjligt att
 * läsa matchbilden — vilken ytterback som möter vilken ytter — som är hela
 * poängen med en uppställningsvy.
 *
 * Här ligger lagen på samma liggande plan: hemmalaget från vänster (målvakt
 * ytterst till vänster, anfall mot mitten), bortalaget speglat från höger.
 * Samma riktiga grid-koordinater som förut (fixture_lineup_player.grid) —
 * ingen ny gissning om var någon stod, bara en annan projektion.
 *
 * Saknar någon startspelare ett tolkningsbart grid-värde returnerar
 * buildPitchPlayers null, och anroparen faller tillbaka på listvyn. Den här
 * komponenten ritar alltså aldrig en halv uppställning.
 */

function PlayerMarker({ player }: { player: PitchPlayer }) {
  const body = (
    <>
      {player.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- extern spelarbild
        <img src={player.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-black/40 sm:h-9 sm:w-9" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold tabular-nums text-white ring-2 ring-black/40 sm:h-9 sm:w-9">
          {player.shirtNumber ?? "–"}
        </span>
      )}
      <span className="max-w-full truncate text-[9px] font-medium leading-tight text-white sm:text-[10px]">
        {player.shirtNumber != null && <span className="tabular-nums text-white/60">{player.shirtNumber} </span>}
        {player.name}
      </span>
    </>
  );

  return (
    <div className="flex w-[4.5rem] flex-col items-center gap-1 sm:w-20">
      {player.id ? (
        <Link href={`/spelare/${player.id}`} className="flex flex-col items-center gap-1 hover:underline">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

/** En lagsida: formationens rader som kolumner, målvakten längst ut. */
function TeamHalf({ players, side }: { players: PitchPlayer[]; side: "home" | "away" }) {
  // Rad 1 = målvakt. Hemmalaget läses vänster→höger (GK ytterst till
  // vänster); bortalaget speglas, så deras GK hamnar ytterst till höger.
  const rows = [...new Set(players.map((p) => p.row))].sort((a, b) => (side === "home" ? a - b : b - a));

  return (
    <div className="flex flex-1 justify-around">
      {rows.map((row) => {
        const rowPlayers = players.filter((p) => p.row === row).sort((a, b) => a.col - b.col);
        return (
          <div key={row} className="flex flex-col items-center justify-around py-2">
            {rowPlayers.map((p) => (
              <PlayerMarker key={p.key} player={p} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function MatchPitch({
  home,
  away,
  homeFormation,
  awayFormation,
  homeName,
  awayName,
  homeCoach,
  awayCoach,
}: {
  home: PitchPlayer[];
  away: PitchPlayer[];
  homeFormation: string | null;
  awayFormation: string | null;
  homeName: string;
  awayName: string;
  homeCoach: string | null;
  awayCoach: string | null;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-semibold text-white">{homeName}</span>
          {homeFormation && <span className="shrink-0 text-xs tabular-nums text-[#898781]">{homeFormation}</span>}
        </span>
        <span className="flex min-w-0 items-baseline justify-end gap-2">
          {awayFormation && <span className="shrink-0 text-xs tabular-nums text-[#898781]">{awayFormation}</span>}
          <span className="truncate font-semibold text-white">{awayName}</span>
        </span>
      </div>

      {/* Planen scrollar i sin EGEN behållare på små skärmar — elva spelare
          per lag får inte plats på 390px utan att namnen blir oläsliga. */}
      <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
        <div
          className="relative flex min-w-[680px] items-stretch overflow-hidden rounded-xl"
          style={{ backgroundColor: "#12201a", aspectRatio: "16 / 9" }}
        >
          {/* Planmarkeringar — återhållsamma, de är kontext och inte data. */}
          <div className="pointer-events-none absolute inset-3 rounded-md border border-white/[0.08]" aria-hidden />
          <div className="pointer-events-none absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-white/[0.08]" aria-hidden />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.08]"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-y-1/4 left-3 w-16 border border-white/[0.08]" aria-hidden />
          <div className="pointer-events-none absolute inset-y-1/4 right-3 w-16 border border-white/[0.08]" aria-hidden />

          <TeamHalf players={home} side="home" />
          <TeamHalf players={away} side="away" />
        </div>
      </div>

      {(homeCoach || awayCoach) && (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#898781]">
          <span className="truncate">{homeCoach}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.15em] text-[#5f5e59]">Tränare</span>
          <span className="truncate text-right">{awayCoach}</span>
        </div>
      )}
    </div>
  );
}
