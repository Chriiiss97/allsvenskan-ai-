"use client";

import { useMemo, useState } from "react";

interface PlayerOption {
  id: number;
  full_name: string;
  current_team: { name: string } | null;
}

export function PlayerPicker({
  players,
  label,
  selectedId,
  onSelect,
}: {
  players: PlayerOption[];
  label: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = players.find((p) => p.id === selectedId);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return players.slice(0, 8);
    return players.filter((p) => p.full_name.toLowerCase().includes(needle)).slice(0, 8);
  }, [players, query]);

  return (
    <div className="relative">
      <label className="mb-1 block text-xs text-[#898781]">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-lg border border-white/10 bg-[#1a1a19] px-3 py-2 text-left text-sm text-white"
      >
        {selected ? `${selected.full_name} (${selected.current_team?.name ?? "—"})` : "Välj spelare..."}
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-white/10 bg-[#1a1a19] p-2 shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök..."
            className="mb-2 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none"
          />
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onSelect(p.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-[#c3c2b7] hover:bg-white/5 hover:text-white"
              >
                {p.full_name} <span className="text-xs text-[#898781]">({p.current_team?.name ?? "—"})</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-[#898781]">Ingen träff.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
