"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

interface PlayerListRow {
  id: number;
  full_name: string;
  position: string | null;
  photo_url: string | null;
  current_team: { id: number; name: string; logo_url: string | null } | null;
}

export function PlayerSearchList({ players }: { players: PlayerListRow[] }) {
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<number | "all">("all");

  const teams = useMemo(() => {
    const map = new Map<number, { id: number; name: string }>();
    for (const p of players) {
      if (p.current_team) map.set(p.current_team.id, p.current_team);
    }
    return [...map.values()];
  }, [players]);

  const filtered = players.filter((p) => {
    const matchesQuery = p.full_name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesTeam = teamFilter === "all" || p.current_team?.id === teamFilter;
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
              key={t.id}
              onClick={() => setTeamFilter(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                teamFilter === t.id ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((p) => (
          <Link
            key={p.id}
            href={`/data/players/${p.id}`}
            className="rounded-xl border border-white/10 bg-[#1a1a19] p-3 transition-colors hover:border-white/25 hover:bg-white/[.03]"
          >
            <div className="flex items-center gap-2">
              {p.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- extern spelarbild, ingen lokal optimering krävs
                <img src={p.photo_url} alt="" className="h-10 w-10 rounded-full bg-white/5 object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-white/5" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.full_name}</p>
                <p className="truncate text-xs text-[#898781]">
                  {p.current_team?.name ?? "—"} {p.position && `· ${p.position}`}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-8 text-center text-sm text-[#898781]">Ingen spelare matchade sökningen.</p>
      )}
    </div>
  );
}
