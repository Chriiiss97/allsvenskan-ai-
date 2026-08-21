/**
 * En enda färgmekanism för OVR-badges, delad mellan components/data/
 * PlayerRating.tsx (spelarprofilen) och components/data/PlayerCard.tsx
 * (Scout-listan/topplistan) — samma princip som lib/data/team-colors.ts
 * redan etablerat för klubbfärger: EN mekanism, inte en per konsument.
 * Fyra breda band, samma andor som EA:s egna kort — men aldrig 100, aldrig
 * FIFA-brandat.
 */
export function ovrColor(ovr: number): string {
  if (ovr >= 80) return "#22c55e";
  if (ovr >= 65) return "#3987e5";
  if (ovr >= 50) return "#d9a526";
  return "#e66767";
}

/** Grönt/rött/grått för en OVR-delta (säsong-mot-säsong-förändring) — samma ±3-tröskel som rating-trend.ts:s "uppåtgående"/"nedåtgående"/"stabil", så färgen och texten aldrig säger emot varandra. */
export function deltaColor(delta: number): string {
  if (delta >= 3) return "#22c55e";
  if (delta <= -3) return "#e66767";
  return "#898781";
}
