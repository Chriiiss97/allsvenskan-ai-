import Link from "next/link";
import type { PitchPlayer } from "@/lib/football/formation-pitch";

/**
 * Fas 16g (2026-08-22) — förenklad planvy byggd på riktiga grid-koordinater
 * (se lib/football/formation-pitch.ts:s filhuvud). Radnumret ökar mot
 * anfall (rad 1 = målvakt) — ritas därför nerifrån och upp, GK längst ner,
 * precis som en riktig taktiktavla. Inom en rad är kolumnordningen redan
 * given av datan, spelarna fördelas jämnt över radens bredd i den ordningen.
 */
export function FormationPitch({ players }: { players: PitchPlayer[] }) {
  const rowNumbers = [...new Set(players.map((p) => p.row))].sort((a, b) => b - a);

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl" style={{ backgroundColor: "#12201a" }}>
      <div className="pointer-events-none absolute inset-3 rounded-md border border-white/[0.08]" aria-hidden />
      <div className="pointer-events-none absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-white/[0.08]" aria-hidden />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.08]"
        aria-hidden
      />

      <div className="relative flex h-full flex-col justify-around py-5">
        {rowNumbers.map((row) => {
          const rowPlayers = players.filter((p) => p.row === row).sort((a, b) => a.col - b.col);
          return (
            <div key={row} className="flex items-start justify-evenly px-1.5">
              {rowPlayers.map((p) => (
                <div key={p.key} className="flex w-16 flex-col items-center gap-1">
                  {p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- extern spelarbild
                    <img src={p.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-black/40" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold tabular-nums text-white ring-2 ring-black/40">
                      {p.shirtNumber ?? "–"}
                    </span>
                  )}
                  {p.id ? (
                    <Link href={`/spelare/${p.id}`} className="max-w-full truncate text-[10px] font-medium text-white hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    <span className="max-w-full truncate text-[10px] font-medium text-white">{p.name}</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
