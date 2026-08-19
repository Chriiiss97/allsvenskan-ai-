"use client";

import { useRouter } from "next/navigation";
import { PlayerPicker } from "./PlayerPicker";

interface PlayerOption {
  id: number;
  full_name: string;
  current_team: { name: string } | null;
}

/** Två spelarväljare som styr sidans ?a=&b=-querystring vid val. */
export function PlayerCompareControls({
  players,
  idA,
  idB,
}: {
  players: PlayerOption[];
  idA: number | null;
  idB: number | null;
}) {
  const router = useRouter();

  function updateParam(key: "a" | "b", id: number) {
    const params = new URLSearchParams();
    params.set("a", key === "a" ? String(id) : idA ? String(idA) : "");
    params.set("b", key === "b" ? String(id) : idB ? String(idB) : "");
    router.push(`/data/players/compare?${params.toString()}`);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PlayerPicker players={players} label="Spelare A" selectedId={idA} onSelect={(id) => updateParam("a", id)} />
      <PlayerPicker players={players} label="Spelare B" selectedId={idB} onSelect={(id) => updateParam("b", id)} />
    </div>
  );
}
