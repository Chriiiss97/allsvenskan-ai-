/**
 * Fas 16g (2026-08-22) — riktig formationsvisualisering, byggd på RIKTIGA
 * rad:kolumn-koordinater (`fixture_lineup_player.grid`, api-footballs eget
 * fält — verifierat mot skarp data: t.ex. "1:1" för målvakt, "2:1".."2:4"
 * för en fyrbackslinje). Ingen gissning om VAR på planen en spelare stod —
 * bara en visuell gruppering av redan kända rader/positioner, inte påhittad
 * spårningsdata. Om NÅGON startspelare saknar ett tolkningsbart grid-värde
 * returneras `null` — anroparen faller då tillbaka till listvyn, aldrig en
 * ofullständig eller gissad plan.
 */

import { displayPlayerName } from "./player-name";

export interface PitchPlayer {
  key: string;
  id: number | null;
  name: string;
  photoUrl: string | null;
  shirtNumber: number | null;
  row: number;
  col: number;
}

interface StarterInput {
  shirt_number: number | null;
  grid: string | null;
  player: { id: number; full_name: string; first_name: string | null; last_name: string | null; photo_url: string | null } | null;
}

export function buildPitchPlayers(starters: StarterInput[]): PitchPlayer[] | null {
  if (starters.length === 0) return null;
  const players: PitchPlayer[] = [];
  for (const p of starters) {
    const match = p.grid?.match(/^(\d+):(\d+)$/);
    if (!match) return null;
    players.push({
      key: p.player ? String(p.player.id) : `grid-${match[1]}-${match[2]}`,
      id: p.player?.id ?? null,
      name: p.player ? displayPlayerName(p.player.first_name, p.player.last_name, p.player.full_name) : "Okänd spelare",
      photoUrl: p.player?.photo_url ?? null,
      shirtNumber: p.shirt_number,
      row: parseInt(match[1], 10),
      col: parseInt(match[2], 10),
    });
  }
  return players;
}
