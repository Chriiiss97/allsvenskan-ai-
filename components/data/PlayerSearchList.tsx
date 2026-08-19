"use client";

import { useMemo, useState } from "react";
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

export function PlayerSearchList({ players, sort }: { players: PlayerListItem[]; sort: PlayerSortKey }) {
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<string | "all">("all");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) if (p.teamName) set.add(p.teamName);
    return [...set];
  }, [players]);

  const filtered = players.filter((p) => {
    const matchesQuery = p.full_name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesTeam = teamFilter === "all" || p.teamName === teamFilter;
    return matchesQuery && matchesTeam;
  });

  function sortHref(key: PlayerSortKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "name") params.delete("sort");
    else params.set("sort", key);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sök spelare..."
          className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-[#1a1a19] px-3 py-2 text-sm text-white placeholder:text-[#898781] outline-none focus:border-white/30"
        />
        <div className="flex gap-1 rounded-lg border border-white/10 bg-[#1a1a19] p-1">
          <button
            onClick={() => setTeamFilter("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              teamFilter === "all" ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
            }`}
          >
            Alla
          </button>
          {teams.map((t) => (
            <button
              key={t}
              onClick={() => setTeamFilter(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                teamFilter === t ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
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
