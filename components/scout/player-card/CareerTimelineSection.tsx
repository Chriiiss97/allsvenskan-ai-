import type { CareerTimelineEntry } from "@/lib/football/career-timeline";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * Fas 15 (Complete Scout Player Card) — Allsvensk karriärtidslinje.
 *
 * VIKTIGT (se undersökningen i konversationen om spelare som spelat
 * utomlands): det här visar UTESLUTANDE Allsvensk historik. Ingen
 * utländsk klubbhistorik finns lagrad i databasen (bekräftat: `league`
 * har 1 rad, `api_raw_response` 0 rader) — footern nedan är därför
 * OBLIGATORISK och ALLTID synlig, inte en valfri fotnot. Gissar aldrig på
 * vad en gles säsong beror på.
 */
export function CareerTimelineSection({ entries }: { entries: CareerTimelineEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <CollapsibleSection title="Allsvensk karriärhistorik" icon="📜" subtitle={`${entries.length} säsonger`}>
      <ol className="space-y-0">
        {entries.map((e, i) => (
          <li
            key={`${e.seasonYear}-${e.teamId}`}
            className={`flex items-center gap-3 py-2.5 text-sm ${i !== entries.length - 1 ? "border-b border-white/5" : ""}`}
          >
            <span className="w-14 shrink-0 font-semibold tabular-nums text-white">{e.seasonYear}</span>
            {e.teamLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild, ingen lokal optimering krävs
              <img src={e.teamLogoUrl} alt="" className="h-5 w-5 shrink-0 object-contain" />
            ) : (
              <span className="h-5 w-5 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate text-[#c3c2b7]">{e.teamName}</span>
            <span className="shrink-0 tabular-nums text-[#898781]">
              {e.appearances} matcher · {e.minutesPlayed} min
              {(e.goals > 0 || e.assists > 0) && ` · ${e.goals} mål, ${e.assists} assist`}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-white/5 pt-3 text-[11px] text-[#5f5e59]">
        Visar bara matcher i Allsvenskan — vi har idag ingen data om eventuellt spel i andra ligor eller länder.
      </p>
    </CollapsibleSection>
  );
}
