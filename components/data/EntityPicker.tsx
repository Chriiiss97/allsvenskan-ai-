"use client";

import { useMemo, useState } from "react";

/**
 * Fas 14.2 (plans/humble-giggling-biscuit.md) — EN generisk sökbar väljare
 * istället för PlayerPicker.tsx/TeamPicker.tsx, som auditen bekräftade var
 * nästan identisk kod (TeamPicker.tsx:s egen kommentar sa uttryckligen att
 * den var "modellerad rakt av på PlayerPicker.tsx:s redan etablerade
 * mönster"). Samma dropdown-/sök-/max-8-träffar-beteende.
 *
 * Fas 14.4-fix: bytte från getId/getLabel/m.fl.-ACCESSORFUNKTIONER till ett
 * normaliserat EntityOption[]-dataformat. Första real-användningen
 * (/scout/compare) kraschade med "Functions cannot be passed directly to
 * Client Components" — precis samma klass av bugg som RadarChartBase:s
 * tooltipFormatter fångade i Fas 14.2:s egen verifiering (se
 * components/charts/RadarChartBase.tsx:s filhuvud), men den här missades
 * då eftersom EntityPicker aldrig testades isolerat innan den kopplades in
 * på riktigt. Anroparen (nästan alltid en Server Component, samma mönster
 * som resten av appen) mappar nu sina egna domänobjekt till EntityOption
 * INNAN de skickas hit — bara serialiserbar data korsar klientgränsen.
 */
export interface EntityOption {
  id: number;
  label: string;
  /** T.ex. klubbnamn bredvid ett spelarnamn — utelämnad helt om null/undefined. */
  subLabel?: string | null;
  logoUrl?: string | null;
}

export function EntityPicker({
  options,
  label,
  selectedId,
  onSelect,
  placeholder = "Välj...",
  searchPlaceholder = "Sök...",
  maxResults = 8,
}: {
  options: EntityOption[];
  label: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  maxResults?: number;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.id === selectedId);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
    return pool.slice(0, maxResults);
  }, [options, query, maxResults]);

  return (
    <div className="relative">
      <label className="mb-1 block text-xs text-[#898781]">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1a1a19] px-3 py-2 text-left text-sm text-white"
      >
        {selected?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- extern logga
          <img src={selected.logoUrl} alt="" className="h-5 w-5 shrink-0" />
        )}
        <span className="truncate">
          {selected ? (selected.subLabel ? `${selected.label} (${selected.subLabel})` : selected.label) : placeholder}
        </span>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-white/10 bg-[#1a1a19] p-2 shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="mb-2 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none"
          />
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onSelect(o.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[#c3c2b7] hover:bg-white/5 hover:text-white"
              >
                {o.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- extern logga
                  <img src={o.logoUrl} alt="" className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {o.label}
                  {o.subLabel && <span className="text-xs text-[#898781]"> ({o.subLabel})</span>}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-2 py-1.5 text-sm text-[#898781]">Ingen träff.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
