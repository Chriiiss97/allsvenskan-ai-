"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PlayerCard, type PlayerCardData, type PlayerSortKey } from "./PlayerCard";

export type PlayerListItem = PlayerCardData;

const SORT_OPTIONS: { key: PlayerSortKey; label: string }[] = [
  { key: "name", label: "Namn" },
  { key: "goals", label: "Mål" },
  { key: "assists", label: "Assist" },
  { key: "appearances", label: "Matcher" },
  { key: "minutes", label: "Minuter" },
];

// Lag- och säsongsfiltrering sköts server-side av app/(app)/data/players/
// page.tsx (URL-parametrar, samma mönster för alla tre filter) — den här
// komponenten äger bara fritextsökningen (rent klient-lokal, ingen
// server-roundtrip behövs för det) och sorteringsvalet.
export function PlayerSearchList({ players, sort }: { players: PlayerListItem[]; sort: PlayerSortKey }) {
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtered = players.filter((p) => p.full_name.toLowerCase().includes(query.trim().toLowerCase()));

  function sortHref(key: PlayerSortKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "name") params.delete("sort");
    else params.set("sort", key);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div>
      <div className="mt-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sök spelare..."
          className="w-full min-w-[200px] rounded-lg border border-white/10 bg-[#1a1a19] px-3 py-2 text-sm text-white placeholder:text-[#898781] outline-none focus:border-white/30 sm:max-w-sm"
        />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-[#7d7c76]">Sortera:</span>
        <div className="flex flex-wrap gap-1">
          {SORT_OPTIONS.map((opt) => (
            <Link
              key={opt.key}
              href={sortHref(opt.key)}
              className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                sort === opt.key ? "bg-[#3987e5]/15 text-white" : "text-[#898781] hover:text-white"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <PlayerCard key={p.id} player={p} sort={sort} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-8 text-center text-sm text-[#898781]">Ingen spelare matchade sökningen.</p>
      )}
    </div>
  );
}
