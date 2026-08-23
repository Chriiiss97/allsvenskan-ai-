/**
 * Fas 21 (2026-08-23) — matchfakta: arena, domare, väder.
 *
 * Referensappen har detta som en egen sidopanel. Vår layout är enkolumnig,
 * så panelen ligger i stället sist på Fakta-fliken — samma information,
 * samma "det här är kringfakta, inte matchen"-vikt.
 *
 * VARJE RAD DÖLJER SIG SJÄLV om uppgiften saknas, och hela panelen döljer
 * sig om ingen rad blir kvar. Kravet var uttryckligt: "göm information som
 * saknas, inga tomma kort med N/A överallt". Domaren är det tydligaste
 * fallet — den sattes historiskt bara vid säsongsimporten och saknades
 * därför för hela innevarande säsong tills Fas 20 började fylla den vid
 * matchens statusövergångar.
 */

export interface MatchInfo {
  venueName: string | null;
  venueCity: string | null;
  venueCapacity: number | null;
  venueSurface: string | null;
  referee: string | null;
  weatherDescription: string | null;
  temperature: number | null;
}

/** Sportmonks underlagsvärden är engelska — de tre som förekommer i Allsvenskan. */
const SURFACE_LABELS: Record<string, string> = {
  grass: "Gräs",
  "artificial turf": "Konstgräs",
  hybridgrass: "Hybridgräs",
  "hybrid grass": "Hybridgräs",
};

function surfaceLabel(surface: string | null): string | null {
  if (!surface) return null;
  return SURFACE_LABELS[surface.toLowerCase()] ?? surface;
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="flex shrink-0 items-center gap-2 text-xs text-[#898781]">
        <span aria-hidden>{icon}</span>
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-sm text-[#c3c2b7]">{value}</span>
    </div>
  );
}

export function MatchInfoPanel({ info }: { info: MatchInfo }) {
  const arena = info.venueName ? [info.venueName, info.venueCity].filter(Boolean).join(", ") : null;
  const capacity = info.venueCapacity ? `${info.venueCapacity.toLocaleString("sv-SE")} platser` : null;
  const weather =
    info.temperature != null
      ? `${Math.round(info.temperature)} °C${info.weatherDescription ? ` · ${info.weatherDescription}` : ""}`
      : info.weatherDescription;

  const rows = [
    { icon: "🏟️", label: "Arena", value: arena },
    { icon: "👥", label: "Kapacitet", value: capacity },
    { icon: "🌱", label: "Underlag", value: surfaceLabel(info.venueSurface) },
    { icon: "🧑‍⚖️", label: "Domare", value: info.referee },
    { icon: "🌤️", label: "Väder", value: weather },
  ].filter((r) => r.value);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#1a1a19] p-4 sm:p-5">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">Matchfakta</h3>
      <div className="divide-y divide-white/5">
        {rows.map((r) => (
          <InfoRow key={r.label} icon={r.icon} label={r.label} value={r.value} />
        ))}
      </div>
    </section>
  );
}
