/**
 * OVR v2 — positionsbestämning.
 * =============================================================================
 * RENA FUNKTIONER, som resten av motorn.
 *
 * Problemet: källdatan har bara fyra grova positioner (G/D/M/F) medan motorn
 * behöver sex (GK/CB/FB/CM/AM/ST). Lösningen är `grid` i fixture_lineup_player
 * — API-Footballs "rad:kolumn" i formationen — som är ifylld i ~100 % av
 * startelvaraderna från 2017 och framåt (verifierat mot databasen 2026-08-23).
 *
 * Rad 1 är målvakten, högre rad betyder längre fram i planen. Kolumnen räknas
 * tvärs över raden. Det som gör klassificeringen möjlig är RADENS BREDD: en
 * försvarsrad med fyra spelare har ytterbackar i kolumn 1 och 4, en med tre
 * har inga ytterbackar alls.
 *
 * Positionen bestäms av var spelaren FAKTISKT STARTAT flest minuter de senaste
 * tolv månaderna (specens avsnitt 1), aldrig av player.position — det fältet är
 * statiskt, har bara fyra värden och uppdateras inte när en spelare byter roll.
 */

import { POSITION_GROUPS, SECONDARY_POSITION_MIN_SHARE, type PositionGroup } from "./config";

export interface LineupAppearance {
  /** Laguppställningens id — radbredden räknas alltid inom EN uppställning. */
  lineupId: number;
  playerId: number;
  /** "G" | "D" | "M" | "F" från API-Football. */
  position: string | null;
  /** "rad:kolumn", t.ex. "2:4". null för avbytare. */
  grid: string | null;
  /** Spelade minuter i just den matchen — viktar hur mycket starten räknas. */
  minutes: number;
  kickoffAt: string;
}

interface ParsedGrid {
  row: number;
  col: number;
}

function parseGrid(grid: string | null): ParsedGrid | null {
  if (!grid) return null;
  const [rowRaw, colRaw] = grid.split(":");
  const row = Number.parseInt(rowRaw, 10);
  const col = Number.parseInt(colRaw, 10);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  return { row, col };
}

/**
 * Klassificerar en enskild start till en av de sex grupperna.
 *
 * Reglerna, i den ordning de tillämpas:
 *
 *  G  -> GK.
 *
 *  D  -> radbredd <= 3 ger bara mittbackar (treback har inga ytterbackar).
 *        Bredare rad: ytterkolumnerna är ytterbackar, resten mittbackar.
 *        Femback (2:1–2:5) ger alltså wingbacks i 1 och 5, mittbackar i 2–4.
 *
 *  M  -> Om laget har FLERA mittfältsrader är den främsta raden en offensiv
 *        mittfältsbank (4-2-3-1:s trea) och blir AM rakt av.
 *        Med bara EN mittfältsrad avgör bredden: ytterkolumnerna är ytter (AM),
 *        de centrala är CM.
 *        UNDANTAG: står laget med treback är de breda spelarna i den lägsta
 *        mittfältsraden wingbacks, inte ytter — de blir FB. Det är 3-4-3,
 *        5-4-1, 3-4-2-1, 5-3-2 och 3-5-2, tillsammans ~30 % av
 *        Allsvenskans startuppställningar 2025.
 *
 *  F  -> radbredd 1 eller 2 ger rena anfallare. Bredare rad: ytterkolumnerna
 *        är ytterforwards (AM enligt specens "offensiv mittfältare / ytter"),
 *        de centrala anfallare.
 */
export function classifyStart(params: {
  position: string | null;
  grid: string | null;
  /** Antal spelare i samma rad i samma uppställning. */
  rowWidth: number;
  /** Bredden på lagets försvarsrad (lägsta raden ovanför målvakten). */
  defensiveRowWidth: number;
  /** Alla rader i uppställningen som innehåller mittfältare, stigande. */
  midfieldRows: readonly number[];
}): PositionGroup | null {
  const { position, grid, rowWidth, defensiveRowWidth, midfieldRows } = params;
  if (position === "G") return "GK";

  const parsed = parseGrid(grid);
  if (!parsed) return null;
  const isWide = rowWidth >= 4 && (parsed.col === 1 || parsed.col === rowWidth);

  if (position === "D") {
    if (rowWidth <= 3) return "CB";
    return parsed.col === 1 || parsed.col === rowWidth ? "FB" : "CB";
  }

  if (position === "M") {
    const lowestMidRow = midfieldRows.length > 0 ? midfieldRows[0] : parsed.row;
    const highestMidRow = midfieldRows.length > 0 ? midfieldRows[midfieldRows.length - 1] : parsed.row;

    if (midfieldRows.length > 1 && parsed.row === highestMidRow) return "AM";

    const wideInThisRow = rowWidth >= 4 && (parsed.col === 1 || parsed.col === rowWidth);
    if (wideInThisRow) {
      // Treback bakom -> de breda mittfältarna är wingbacks, inte ytter.
      if (defensiveRowWidth > 0 && defensiveRowWidth <= 3 && parsed.row === lowestMidRow) return "FB";
      return "AM";
    }
    return "CM";
  }

  if (position === "F") {
    if (rowWidth <= 2) return "ST";
    if (rowWidth === 3) return parsed.col === 1 || parsed.col === 3 ? "AM" : "ST";
    return isWide ? "AM" : "ST";
  }

  return null;
}

/**
 * Klassificerar alla starter i EN laguppställning. Radbredder och
 * mittfältsrader måste räknas över hela uppställningen, inte per spelare —
 * därför tar den här funktionen alla elva samtidigt.
 */
export function classifyLineup(appearances: readonly LineupAppearance[]): Map<number, PositionGroup> {
  const rowWidths = new Map<number, number>();
  const midfieldRowSet = new Set<number>();
  let defensiveRowWidth = 0;
  let defensiveRow = Number.POSITIVE_INFINITY;

  for (const a of appearances) {
    const parsed = parseGrid(a.grid);
    if (!parsed) continue;
    rowWidths.set(parsed.row, (rowWidths.get(parsed.row) ?? 0) + 1);
    if (a.position === "M") midfieldRowSet.add(parsed.row);
    if (a.position === "D" && parsed.row < defensiveRow) defensiveRow = parsed.row;
  }
  defensiveRowWidth = Number.isFinite(defensiveRow) ? (rowWidths.get(defensiveRow) ?? 0) : 0;

  const midfieldRows = [...midfieldRowSet].sort((a, b) => a - b);
  const out = new Map<number, PositionGroup>();

  for (const a of appearances) {
    const parsed = parseGrid(a.grid);
    const rowWidth = parsed ? (rowWidths.get(parsed.row) ?? 0) : 0;
    const group = classifyStart({
      position: a.position,
      grid: a.grid,
      rowWidth,
      defensiveRowWidth,
      midfieldRows,
    });
    if (group) out.set(a.playerId, group);
  }
  return out;
}

export interface PositionAssignment {
  primary: PositionGroup;
  secondary: PositionGroup | null;
  /** Andel av startminuterna i fönstret som låg i primärgruppen, 0–1. */
  confidence: number;
  /** Startminuter per grupp — underlaget bakom beslutet, för felsökning. */
  minutesByGroup: Partial<Record<PositionGroup, number>>;
  /** true när ingen start finns i fönstret och player.position fick avgöra. */
  fromFallback: boolean;
}

/** Grov mappning som bara används när spelaren aldrig startat i fönstret. */
const FALLBACK_BY_POSITION: Record<string, PositionGroup> = {
  Goalkeeper: "GK",
  Defender: "CB",
  Midfielder: "CM",
  Attacker: "ST",
  Forward: "ST",
};

/**
 * Väger ihop alla klassificerade starter i tidsfönstret till en primär- och en
 * sekundärposition. Viktas med spelade minuter: en spelare som startade som
 * ytterback och byttes ut efter 20 minuter, men spelat nio hela matcher som
 * mittback, är mittback.
 *
 * Avbytarinhopp räknas inte alls — specen säger uttryckligen "startat", och en
 * inhoppare har ingen grid-position i källdatan att utgå från.
 */
export function assignPosition(
  starts: readonly { group: PositionGroup; minutes: number }[],
  fallbackPosition: string | null
): PositionAssignment {
  const minutesByGroup: Partial<Record<PositionGroup, number>> = {};
  let total = 0;
  for (const s of starts) {
    const minutes = Math.max(0, s.minutes);
    if (minutes <= 0) continue;
    minutesByGroup[s.group] = (minutesByGroup[s.group] ?? 0) + minutes;
    total += minutes;
  }

  if (total <= 0) {
    const primary = FALLBACK_BY_POSITION[fallbackPosition ?? ""] ?? "CM";
    return { primary, secondary: null, confidence: 0, minutesByGroup: {}, fromFallback: true };
  }

  const ranked = (Object.entries(minutesByGroup) as [PositionGroup, number][]).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    // Deterministiskt vid exakt lika minuter — annars kan två körningar på
    // samma data ge olika positionsgrupp, vilket gör betyget oreproducerbart.
    return POSITION_GROUPS.indexOf(a[0]) - POSITION_GROUPS.indexOf(b[0]);
  });

  const [primary, primaryMinutes] = ranked[0];
  const runnerUp = ranked[1];
  const secondary = runnerUp && runnerUp[1] / total >= SECONDARY_POSITION_MIN_SHARE ? runnerUp[0] : null;

  return {
    primary,
    secondary,
    confidence: primaryMinutes / total,
    minutesByGroup,
    fromFallback: false,
  };
}

/** Startdatum för positionsfönstret (specens 12 månader bakåt). */
export function positionWindowStart(reference: Date, months: number): Date {
  const start = new Date(reference.getTime());
  start.setUTCMonth(start.getUTCMonth() - months);
  return start;
}
