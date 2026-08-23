import Link from "next/link";
import type { ReactNode } from "react";
import type { CareerJourney } from "@/lib/football/career-journey";
import { translateTransferType, translateClubCountry } from "@/lib/i18n/sv";
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

/**
 * Fas 19c (2026-08-23, användarkrav: "man ska kunna trycka på lagen
 * (utländska lagen) i karriärresan när man tryck på en spelare i efter
 * allsvenskan") — `foreignClubHref` gör de UTLÄNDSKA stegen klickbara.
 *
 * Opt-in via prop, inte inbyggt: komponenten används på BÅDE /spelare/[id]
 * (gratis fotbollsprofil) och i Scouts Efter Allsvenskan-vy, och
 * klubbsidan som länken pekar på är en Scout-yta. Utan proppen beter sig
 * komponenten exakt som förut — den fria sidan får alltså ingen länk in i
 * premiumdelen bara för att den råkar återanvända samma komponent.
 * Allsvenska steg länkas aldrig här: de har redan sina egna lagsidor.
 */
export function CareerJourneySection({
  journey,
  foreignClubHref,
}: {
  journey: CareerJourney;
  foreignClubHref?: (teamName: string) => string;
}) {
  if (journey.steps.length === 0) return null;

  return (
    <CollapsibleSection title="Karriärresan" icon="🌍" subtitle={`${journey.steps.length} steg · senast tillgängliga data: ${journey.lastKnownYear}`}>
      <div className="flex flex-col gap-0 md:flex-row md:items-stretch md:gap-0 md:overflow-x-auto md:pb-2">
        {journey.steps.map((step, i) => {
          const isLeftMilestone = i === journey.leftAllsvenskanAtStepIndex;
          const typeLabel = step.arrivedVia ? translateTransferType(step.arrivedVia.type) : null;
          const href = !step.isAllsvenskan && foreignClubHref ? foreignClubHref(step.teamName) : null;
          const cardClassName = `flex items-start gap-3 rounded-xl border p-4 md:flex-col md:items-center md:text-center ${
            step.isAllsvenskan ? "border-white/10 bg-[#1a1a19]" : "border-[#a78bfa]/15 bg-[#1a1a19]"
          }${href ? " transition-colors hover:border-[#a78bfa]/50 hover:bg-white/[.03]" : ""}`;
          // Samma kortinnehåll oavsett om det blir en länk eller inte — en
          // enda kropp, inte två parallella varianter som kan glida isär.
          const card: ReactNode = (
            <>
              {step.teamLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
                <img src={step.teamLogoUrl} alt="" className="h-10 w-10 shrink-0 object-contain" />
              ) : (
                <span className="h-10 w-10 shrink-0 rounded-full bg-white/5" aria-hidden />
              )}
              <div className="min-w-0 flex-1 md:flex-none">
                <p className={`truncate text-sm font-semibold text-white${href ? " group-hover:underline" : ""}`}>{step.teamName}</p>
                <p className="text-xs text-[#898781]">
                  {yearLabel(step.startYear, step.endYear)}
                  {!step.isAllsvenskan && translateClubCountry(step.leagueCountry) && ` · ${translateClubCountry(step.leagueCountry)}`}
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
            </>
          );

          return (
            <div key={`${step.teamName}-${step.startYear}`} className="flex flex-col md:min-w-[220px] md:flex-1">
              {isLeftMilestone && (
                <div className="mb-2 flex items-center gap-1.5 rounded-md bg-[#3987e5]/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#3987e5] md:mb-2">
                  <span aria-hidden>🇸🇪</span> Lämnade Allsvenskan
                </div>
              )}

              {/* Anslutningslinje mot föregående steg — vertikal på mobil, horisontell på desktop. Inte på första steget. */}
              {i > 0 && !isLeftMilestone && <div className="ml-3.5 h-4 w-px bg-white/10 md:ml-0 md:h-px md:w-4 md:self-center" aria-hidden />}

              {href ? (
                <Link href={href} className={`group ${cardClassName}`}>
                  {card}
                </Link>
              ) : (
                <div className={cardClassName}>{card}</div>
              )}
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
