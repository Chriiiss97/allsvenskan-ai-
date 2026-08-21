/**
 * Subtila klubbfärgsaccenter för alla 33 lag i datalagret (breddad
 * 2026-08-20 — tidigare bara IFK Göteborg/AIK, samma stale begränsning som
 * COMPARABLE_TEAM_EXTERNAL_IDS i tools.ts hade). Används som kant-/text-
 * accenter, aldrig som stora ytor (se designfeedback: "inte så att hela
 * sidan blir färgglad").
 *
 * Källa: klubbarnas välkända, verkliga primärfärg (dräkt/klubbmärke) — inte
 * en exakt varumärkes-hex hämtad ur en officiell grafisk manual (sådana
 * finns inte offentligt för de flesta lag i den här ligan). Flera lag delar
 * medvetet samma närmevärde (t.ex. flera "blå" eller "gula" lag) eftersom
 * det stämmer med verkligheten — det här är INTE en jämförande palett där
 * flera lag visas samtidigt i en legend (då hade delade hues varit ett
 * problem), utan en accent för EN sida i taget.
 *
 * En handfull mindre/historiska lag har jag inte kunnat verifiera med
 * rimlig säkerhet (varken via allmän fotbollskunskap eller sökning) —
 * dessa faller uttryckligen tillbaka på FALLBACK_ACCENT istället för en
 * gissad hex, samma "hellre ärligt osäker än påhittad"-princip som resten
 * av produkten. Markerade med kommentar nedan.
 */
const TEAM_ACCENTS: Record<number, string> = {
  366: "#3987e5", // IFK Göteborg — blå
  377: "#eab308", // AIK — guld/svart
  367: "#f2c419", // BK Häcken — gul ("Gula lejonen")
  2172: "#c0392b", // Degerfors IF — röd/vit
  364: "#1a3e6f", // Djurgårdens IF — (himmels)blå
  812: "#f2c419", // Falkenbergs FF — gul/svart
  2170: "#1a1a1a", // Gais — svart/vit
  373: "#c0392b", // GIF Sundsvall — röd/svart
  766: "#2f6fb3", // Halmstads BK — blå/vit
  363: "#1a7a3c", // Hammarby FF — grön/vit ("Bajen")
  375: "#4fa8dc", // Malmö FF — himmelsblå/vit
  811: "#7a1f2b", // Helsingborgs IF — vinröd/vit
  371: "#2f6fb3", // IF Brommapojkarna — blå/gul
  372: "#f2c419", // IF Elfsborg — gul/svart
  378: "#1a3e6f", // IFK Norrköping — blå/svart
  2163: "#2f6fb3", // IFK Värnamo — blå/gul
  374: "#c0392b", // Kalmar FF — röd/vit
  2240: "#f2c419", // Mjällby AIF — gul/svart
  365: "#1a1a1a", // Örebro SK — svart/vit
  2166: "#2f6fb3", // Örgryte IS — blå
  2174: "#1a7a3c", // Östers IF — grön/vit
  376: "#c0392b", // Östersunds FK — röd/svart
  370: "#2f6fb3", // IK Sirius — blå/gul
  369: "#f2c419", // Trelleborgs FF — gul/blå
  2171: "#1a1a1a", // Varbergs BoIS FC — svart/vit
  // Genuint osäkra — ingen gissad hex, samma neutrala fallback som förut:
  // AFC Eskilstuna (765), Dalkurd FF (368), Gefle IF (813),
  // IK Brage (2175), Jönköpings Södra (764), Landskrona BoIS (2176),
  // Utsikten (6706), Västerås SK FK (2241).
};

const FALLBACK_ACCENT = "#3987e5";

export function getTeamAccent(externalId: number | null | undefined): string {
  if (!externalId) return FALLBACK_ACCENT;
  return TEAM_ACCENTS[externalId] ?? FALLBACK_ACCENT;
}
