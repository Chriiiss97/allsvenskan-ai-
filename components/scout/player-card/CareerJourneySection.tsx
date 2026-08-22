import type { CareerJourney } from "@/lib/football/career-journey";
import { translateTransferType, translateNationality } from "@/lib/i18n/sv";
import { colors } from "@/lib/design/tokens";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * Fas 18 (2026-08-22) — "karriärresan": en sammanhängande visuell tidslinje
 * över spelarens hela dokumenterade karriär, med Allsvenskan-avgången som
 * en tydlig, egen milstolpe. Mobil: vertikal lista (flex-col). Desktop:
 * horisontell rad (md:flex-row) — samma DOM, ingen separat mobil-gren,
 * bara CSS-brytpunkten som ändrar riktning (aldrig en ihoptryckt
 * desktop-layout).
 *
 * "Senast tillgängliga data: {lastKnownYear}" — ALDRIG "karriären
 * avslutad", se lib/football/career-journey.ts:s filhuvud. Vi gissar
 * aldrig på om spelaren fortfarande är aktiv.
 */
function yearLabel(startYear: number, endYear: number): string {
  return startYear === endYear ? String(startYear) : `${startYear}–${endYear}`;
}

export function CareerJourneySection({ journey }: { journey: CareerJourney }) {
  if (journey.steps.length === 0) return null;

  return (
    <CollapsibleSection title="Karriärresan" icon="🌍" subtitle={`${journey.steps.length} steg · senast tillgängliga data: ${journey.lastKnownYear}`}>
      <div className="flex flex-col gap-0 md:flex-row md:items-stretch md:gap-0 md:overflow-x-auto md:pb-2">
        {journey.steps.map((step, i) => {
          const isLeftMilestone = i === journey.leftAllsvenskanAtStepIndex;
          const typeLabel = step.arrivedVia ? translateTransferType(step.arrivedVia.type) : null;

          return (
            <div key={`${step.teamName}-${step.startYear}`} className="flex flex-col md:min-w-[220px] md:flex-1">
              {isLeftMilestone && (
                <div className="mb-2 flex items-center gap-1.5 rounded-md bg-[#3987e5]/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#3987e5] md:mb-2">
                  <span aria-hidden>🇸🇪</span> Lämnade Allsvenskan
                </div>
              )}

              {/* Anslutningslinje mot föregående steg — vertikal på mobil, horisontell på desktop. Inte på första steget. */}
              {i > 0 && !isLeftMilestone && <div className="ml-3.5 h-4 w-px bg-white/10 md:ml-0 md:h-px md:w-4 md:self-center" aria-hidden />}

              <div
                className={`flex items-start gap-3 rounded-xl border p-4 md:flex-col md:items-center md:text-center ${
                  step.isAllsvenskan ? "border-white/10 bg-[#1a1a19]" : "border-[#a78bfa]/15 bg-[#1a1a19]"
                }`}
              >
                {step.teamLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
                  <img src={step.teamLogoUrl} alt="" className="h-10 w-10 shrink-0 object-contain" />
                ) : (
                  <span className="h-10 w-10 shrink-0 rounded-full bg-white/5" aria-hidden />
                )}
                <div className="min-w-0 flex-1 md:flex-none">
                  <p className="truncate text-sm font-semibold text-white">{step.teamName}</p>
                  <p className="text-xs text-[#898781]">
                    {yearLabel(step.startYear, step.endYear)}
                    {!step.isAllsvenskan && step.leagueCountry && ` · ${translateNationality(step.leagueCountry) ?? step.leagueCountry}`}
                  </p>
                  {step.arrivedVia && (
                    <p className="mt-1 text-[11px] text-[#5f5e59]">
                      {step.arrivedVia.fromTeamName ? `Från ${step.arrivedVia.fromTeamName}` : "Övergång"}
                      {typeLabel && ` · ${typeLabel}`}
                    </p>
                  )}
                  <p className="mt-2 text-xs tabular-nums text-[#c3c2b7]">
                    <span className="font-semibold text-white">{step.appearances}</span> M
                    {step.goals > 0 && (
                      <>
                        {" · "}
                        <span className="font-semibold text-white">{step.goals}</span> mål
                      </>
                    )}
                    {step.assists > 0 && (
                      <>
                        {" · "}
                        <span className="font-semibold text-white">{step.assists}</span> ass
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-[#5f5e59]" style={{ color: colors.text.faint }}>
        Senast tillgängliga data: {journey.lastKnownYear}. Vi gissar aldrig på om en spelare fortfarande är aktiv — bara vad
        källorna faktiskt bekräftar.
      </p>
    </CollapsibleSection>
  );
}
