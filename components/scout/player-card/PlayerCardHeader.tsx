import Link from "next/link";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { translatePosition, translateNationality } from "@/lib/i18n/sv";
import { ovrColor } from "@/lib/football/rating/ovr-color";
import type { ConfidenceTier } from "@/lib/football/confidence";
import { colors } from "@/lib/design/tokens";

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
  ovrConfidenceTier,
  ovrConfidenceMinutes,
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
  /**
   * Fas 15-fixning (2026-08-22): Player Rating/GoalkeeperRatings EGNA
   * `confidence.tier` — INTE Player DNA:s (som alltid är null för
   * målvakter, eftersom DNA aldrig byggs för målvakter) och INTE
   * regressionens (ett annat begrepp: antal TIDIGARE säsonger, inte
   * årets speltid). Ett upptäckt verkligt fall: E. Berisha (målvakt),
   * 2026 — 1 match/90 minuter gav OVR 99 (100 % räddningsprocent/clean
   * sheet på ett enda extremfall), men Snapshot/Context visade INGEN
   * varning eftersom de läste dna?.confidence (alltid null för målvakter)
   * istället för själva ratingens confidence. OVR-TALET ändras inte här
   * (skulle kräva att röra goalkeeper-rating.ts/compute-rating.ts, som är
   * skyddade filer) — men badgen byter till samma "låg"-färg som resten av
   * appens confidence-indikatorer använder, istället för en missvisande
   * grön "elit"-färg, så en 1-matchs-99:a aldrig SER trovärdig ut.
   */
  ovrConfidenceTier: ConfidenceTier | null;
  ovrConfidenceMinutes: number | null;
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
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-base font-bold tabular-nums"
                style={
                  ovrConfidenceTier === "låg"
                    ? { backgroundColor: `${colors.status.confidence.low}26`, color: colors.status.confidence.low }
                    : { backgroundColor: `${ovrColor(ovr)}26`, color: ovrColor(ovr) }
                }
                title={
                  ovrConfidenceTier === "låg"
                    ? `Otillräckligt underlag — bara ${ovrConfidenceMinutes ?? 0} minuter denna säsong. Talet kan svänga kraftigt på ett fåtal matcher, tolka försiktigt.`
                    : "Player Rating — statistisk 0–99, se Performance-sektionen för hela nedbrytningen."
                }
              >
                {ovrConfidenceTier === "låg" && <span aria-hidden>⚠</span>}
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
            {nationality && ` · ${translateNationality(nationality)}`}
          </p>

          {ovr !== null && ovrConfidenceTier === "låg" && (
            <p className="mt-1 text-xs font-medium" style={{ color: colors.status.confidence.low }}>
              ⚠ Otillräckligt underlag för OVR {ovr} — bara {ovrConfidenceMinutes ?? 0} minuter denna säsong. Tolka försiktigt.
            </p>
          )}

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
