/**
 * Färgmekanismen för OVR-badges — flyttad hit från lib/football/scout/
 * ovr-color.ts oförändrad, så att allt som rör OVR bor på ett ställe.
 *
 * Samma princip som lib/data/team-colors.ts redan etablerat för klubbfärger:
 * EN mekanism, inte en per konsument. Fyra breda band. Aldrig FIFA-brandat —
 * skalan är intern och allsvensk, se lib/ovr/config.ts.
 */
export function ovrColor(ovr: number): string {
  if (ovr >= 80) return "#22c55e";
  if (ovr >= 65) return "#3987e5";
  if (ovr >= 50) return "#d9a526";
  return "#e66767";
}

/**
 * Grönt/rött/grått för en OVR-delta (säsong-mot-säsong). Samma ±3-tröskel som
 * trend.ts:s "uppåtgående"/"nedåtgående"/"stabil", så färgen och texten aldrig
 * säger emot varandra.
 */
export function deltaColor(delta: number): string {
  if (delta >= 3) return "#22c55e";
  if (delta <= -3) return "#e66767";
  return "#898781";
}

/**
 * Dämpad färg för ett betyg med svagt underlag. UI:t ska kunna visa ett
 * lågkonfidensbetyg utan att det skriker lika högt som ett väl underbyggt —
 * talet är fortfarande vårt bästa svar, men läsaren ska se skillnaden utan att
 * behöva läsa finstilt.
 */
export function ovrColorForConfidence(ovr: number, tier: "hög" | "medel" | "låg" | null): string {
  const base = ovrColor(ovr);
  return tier === "låg" ? `${base}80` : base;
}
