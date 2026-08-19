"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlayerAvatar } from "./PlayerAvatar";
import { translatePosition } from "@/lib/i18n/sv";

export interface PlayerListItem {
  id: number;
  full_name: string;
  position: string | null;
  photoUrl: string | null;
  teamName: string | null;
  teamIndex: 0 | 1;
  stat: { goals: number; appearances: number; year: number } | null;
}

export function PlayerSearchList({ players }: { players: PlayerListItem[] }) {
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<string | "all">("all");

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

  return (
    <div>
      <div className="mt-6 flex flex-wrap gap-2">
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

      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <Link
            key={p.id}
            href={`/data/players/${p.id}`}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1a1a19] p-3 transition-colors hover:border-white/25 hover:bg-white/[.03]"
          >
            <PlayerAvatar name={p.full_name} teamIndex={p.teamIndex} photoUrl={p.photoUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.full_name}</p>
              <p className="truncate text-xs text-[#898781]">
                {p.teamName ?? "—"} {p.position && `· ${translatePosition(p.position)}`}
              </p>
            </div>
            {p.stat && (
              <div className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-right">
                <p className="text-sm font-semibold leading-none">{p.stat.goals}</p>
                <p className="mt-0.5 text-[9px] leading-none text-[#898781]">
                  mål {p.stat.year} · {p.stat.appearances}M
                </p>
              </div>
            )}
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-8 text-center text-sm text-[#898781]">Ingen spelare matchade sökningen.</p>
      )}
    </div>
  );
}
