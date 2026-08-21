"use client";

import { useMemo, useState } from "react";

interface TeamOption {
  externalId: number;
  name: string;
  logoUrl: string | null;
}

/**
 * Sökbar lagväljare (steg 1, data-sektionens breddning) — modellerad rakt
 * av på PlayerPicker.tsx:s redan etablerade mönster. `externalId` (inte
 * lagets interna `id`) är valutan här — samma numeriska fält resolveTeam
 * redan matchar mot (lib/football/resolve-team.ts), så getTeamComparison
 * kan ta emot värdet oförändrat.
 */
export function TeamPicker({
  teams,
  label,
  selectedExternalId,
  onSelect,
}: {
  teams: TeamOption[];
  label: string;
  selectedExternalId: number | null;
  onSelect: (externalId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = teams.find((t) => t.externalId === selectedExternalId);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return teams.slice(0, 8);
    return teams.filter((t) => t.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [teams, query]);

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
        <span className="truncate">{selected ? selected.name : "Välj lag..."}</span>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-white/10 bg-[#1a1a19] p-2 shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök lag..."
            className="mb-2 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none"
          />
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((t) => (
              <button
                key={t.externalId}
                type="button"
                onClick={() => {
                  onSelect(t.externalId);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[#c3c2b7] hover:bg-white/5 hover:text-white"
              >
                {t.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- extern logga
                  <img src={t.logoUrl} alt="" className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">{t.name}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-2 py-1.5 text-sm text-[#898781]">Ingen träff.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
