import Link from "next/link";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { translatePosition } from "@/lib/i18n/sv";
import { ovrColor } from "@/lib/football/rating/ovr-color";

/**
 * Fas 15 (Complete Scout Player Card) — hero-sektion. Ersätter dagens
 * enkla bio-kort på /scout/spelare/[id]: samma bio-data + OVR-badge som
 * innan, men nu med huvudarketyp och en tydligare, större visuell yta —
 * "det här är spelaren", innan några siffror kommer.
 *
 * Server Component (ingen "use client") — `shortlistAction` skickas som en
 * vanlig serverfunktion mellan Server Components, INTE över en
 * server→klient-gräns (den restriktionen gäller bara när en "use client"-
 * komponent tar emot en funktionsprop, se RadarChartBase/EntityPicker-
 * buggarna tidigare i projektet).
 */
export function PlayerCardHeader({
  name,
  photoUrl,
  teamExternalId,
  teamName,
  position,
  age,
  nationality,
  ovr,
  mainArchetypeLabel,
  isShortlisted,
  shortlistAction,
  playerId,
  returnTo,
  availableSeasons,
  season,
  freeProfileHref,
}: {
  name: string;
  photoUrl: string | null;
  teamExternalId: number | null | undefined;
  teamName: string | null;
  position: string | null;
  age: number | null;
  nationality: string | null;
  ovr: number | null;
  mainArchetypeLabel: string | null;
  isShortlisted: boolean;
  shortlistAction: (formData: FormData) => void | Promise<void>;
  playerId: number;
  returnTo: string;
  availableSeasons: number[];
  season: number | null;
  freeProfileHref: string;
}) {
  return (
    <div className="rounded-2xl border border-[#a78bfa]/20 bg-gradient-to-br from-[#1a1a19] to-[#141117] p-6">
      <div className="flex flex-wrap items-center gap-5">
        <PlayerAvatar name={name} teamExternalId={teamExternalId} size={88} photoUrl={photoUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">{name}</h1>
            {ovr !== null && (
              <span
                className="rounded-full px-3 py-1 text-base font-bold tabular-nums"
                style={{ backgroundColor: `${ovrColor(ovr)}26`, color: ovrColor(ovr) }}
                title="Player Rating — statistisk 0–99, se Performance-sektionen för hela nedbrytningen."
              >
                {ovr}
              </span>
            )}
            <form action={shortlistAction}>
              <input type="hidden" name="playerId" value={playerId} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                title={isShortlisted ? "Ta bort från shortlist" : "Lägg till i shortlist"}
                className={`text-xl leading-none transition-colors ${isShortlisted ? "text-[#d9a526]" : "text-[#5f5e59] hover:text-[#d9a526]"}`}
              >
                {isShortlisted ? "★" : "☆"}
              </button>
            </form>
          </div>

          <p className="mt-1 text-sm text-[#c3c2b7]">
            {teamName ?? "—"}
            {position && ` · ${translatePosition(position)}`}
            {age !== null && ` · ${age} år`}
            {nationality && ` · ${nationality}`}
          </p>

          {mainArchetypeLabel && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#a78bfa]/15 px-2.5 py-1 text-xs font-semibold text-[#a78bfa]">
              🧬 {mainArchetypeLabel}
            </span>
          )}

          <Link href={freeProfileHref} className="mt-2 block text-xs text-[#3987e5] hover:underline">
            ← Grundstatistik (gratis profil)
          </Link>
        </div>

        {availableSeasons.length > 0 && (
          <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
            {availableSeasons.map((y) => (
              <Link
                key={y}
                href={`/scout/spelare/${playerId}?season=${y}`}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  y === season ? "bg-[#a78bfa]/20 text-white" : "text-[#898781] hover:text-white"
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
