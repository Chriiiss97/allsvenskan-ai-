import type { PlayerHighlight } from "./match-preview-sv";

/**
 * Fas 16d (2026-08-22) — "Nyckelspelare" istället för en rå grid av alla
 * spelar-toppnoteringar ("Spelarfakta"). Samma exakta tal som förut
 * (PlayerHighlight kommer oförändrat från extractPlayerHighlight i
 * match-preview-sv.ts) — det här filtrerar/grupperar/rankar bara om DEM,
 * lägger till EN fast, förklarande bildtext per kategori (aldrig en ny
 * slutsats om matchen, bara en beskrivning av vad talet redan betyder).
 *
 * Tre kategorier, en per mått vi redan har (aldrig blandade mot varandra —
 * xGOT jämförs bara mot xGOT, osv, se match-insight.ts:s samma princip):
 *   🎯 Största målhotet   — xGOT (kvalitet på avslut som når mål)
 *   ⚡ Bästa målchansen    — xG (förväntade mål — flest/bäst chanser)
 *   ⭐ Bäst betyg          — matchbetyg
 * En kategori visas ENDAST om minst en spelare faktiskt har det måttet för
 * den här matchen — ingen tom eller påhittad kategori.
 */

interface CategoryDef {
  statLabel: string;
  icon: string;
  title: string;
  caption: string;
}

const CATEGORY_DEFS: CategoryDef[] = [
  { statLabel: "xGOT", icon: "🎯", title: "Största målhotet", caption: "Högst xGOT bland spelarna i matchanalysen — mest kliniska avslutaren." },
  { statLabel: "xG", icon: "⚡", title: "Bästa målchansen", caption: "Högst xG bland spelarna i matchanalysen — flest eller bäst målchanser." },
  { statLabel: "Betyg", icon: "⭐", title: "Bäst betyg", caption: "Högst snittbetyg bland spelarna i matchanalysen." },
];

export interface KeyPlayerCategory {
  key: string;
  icon: string;
  title: string;
  caption: string;
  unit: string;
  leader: PlayerHighlight;
  /** Sorterade fallande efter värde, EN rad per spelare (samma spelares
   * h2h- och lagvarianter slås ihop till bara det högsta värdet — annars
   * skulle samma namn kunna dyka upp två gånger i jämförelsestapeln, vilket
   * ser ut som ett fel snarare än två olika mätfönster). */
  contenders: PlayerHighlight[];
}

function dedupeByName(list: PlayerHighlight[]): PlayerHighlight[] {
  const byName = new Map<string, PlayerHighlight>();
  for (const h of list) {
    const cur = byName.get(h.name);
    if (!cur || h.value > cur.value) byName.set(h.name, h);
  }
  return [...byName.values()].sort((a, b) => b.value - a.value);
}

const MAX_CONTENDERS = 5;

export function buildKeyPlayerCategories(highlights: PlayerHighlight[]): KeyPlayerCategory[] {
  const categories: KeyPlayerCategory[] = [];
  for (const def of CATEGORY_DEFS) {
    const contenders = dedupeByName(highlights.filter((h) => h.statLabel === def.statLabel)).slice(0, MAX_CONTENDERS);
    if (contenders.length === 0) continue;
    categories.push({ key: def.statLabel, icon: def.icon, title: def.title, caption: def.caption, unit: def.statLabel, leader: contenders[0], contenders });
  }
  return categories;
}
