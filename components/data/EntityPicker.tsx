"use client";

import { useMemo, useState } from "react";

/**
 * Fas 14.2 (plans/humble-giggling-biscuit.md) — EN generisk sökbar väljare
 * istället för PlayerPicker.tsx/TeamPicker.tsx, som auditen bekräftade var
 * nästan identisk kod (TeamPicker.tsx:s egen kommentar sa uttryckligen att
 * den var "modellerad rakt av på PlayerPicker.tsx:s redan etablerade
 * mönster"). Samma dropdown-/sök-/max-8-träffar-beteende, bara parametrisk
 * över vad ett "alternativ" faktiskt är via getId/getLabel/m.fl.
 *
 * NY fil, INTE ännu inkopplad — PlayerPicker/TeamPicker ersätts av den här
 * EN i taget när respektive jämförelsesida ändå byggs om i Fas 14.3/14.4
 * (Scout Compare), inte i en bakåtkompatibel omgång nu.
 */
export function EntityPicker<T>({
  options,
  label,
  selectedId,
  onSelect,
  getId,
  getLabel,
  getSubLabel,
  getLogoUrl,
  placeholder = "Välj...",
  searchPlaceholder = "Sök...",
  maxResults = 8,
}: {
  options: T[];
  label: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
  getId: (option: T) => number;
  getLabel: (option: T) => string;
  /** T.ex. klubbnamn bredvid ett spelarnamn — utelämnad helt om den returnerar null/undefined. */
  getSubLabel?: (option: T) => string | null | undefined;
  getLogoUrl?: (option: T) => string | null | undefined;
  placeholder?: string;
  searchPlaceholder?: string;
  maxResults?: number;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => getId(o) === selectedId);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle ? options.filter((o) => getLabel(o).toLowerCase().includes(needle)) : options;
    return pool.slice(0, maxResults);
    // getLabel är stabil per anropare i praktiken (ren fältaccessor) — att
    // lista den som dep hade gjort filtreringen om vid varje render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, query, maxResults]);

  const selectedLogo = selected && getLogoUrl?.(selected);
  const selectedSub = selected && getSubLabel?.(selected);

  return (
    <div className="relative">
      <label className="mb-1 block text-xs text-[#898781]">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1a1a19] px-3 py-2 text-left text-sm text-white"
      >
        {selectedLogo && (
          // eslint-disable-next-line @next/next/no-img-element -- extern logga
          <img src={selectedLogo} alt="" className="h-5 w-5 shrink-0" />
        )}
        <span className="truncate">
          {selected ? (selectedSub ? `${getLabel(selected)} (${selectedSub})` : getLabel(selected)) : placeholder}
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
            {filtered.map((o) => {
              const id = getId(o);
              const logo = getLogoUrl?.(o);
              const sub = getSubLabel?.(o);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onSelect(id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[#c3c2b7] hover:bg-white/5 hover:text-white"
                >
                  {logo && (
                    // eslint-disable-next-line @next/next/no-img-element -- extern logga
                    <img src={logo} alt="" className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">
                    {getLabel(o)}
                    {sub && <span className="text-xs text-[#898781]"> ({sub})</span>}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="px-2 py-1.5 text-sm text-[#898781]">Ingen träff.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
