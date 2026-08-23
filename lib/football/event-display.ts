/**
 * Fas 20 (2026-08-23) — svensk beskrivning av en matchhändelse, på ETT
 * ställe. Både tidslinjen på matchsidan och de kompakta raderna i
 * matchlistan behöver samma tolkning, och de får inte kunna säga olika.
 *
 * Den viktiga detaljen: api-football lägger MISSAD STRAFF under `type:
 * "Goal"` med `detail: "Missed Penalty"`. Räknar man mål genom att filtrera
 * på type === "goal" (vilket är det naturliga) blir en missad straff ett
 * mål. Samma sak åt andra hållet med självmål, som ska krediteras
 * MOTSTÅNDAREN — därför skiljer `countsAsGoal` på "det här är ett mål" och
 * `creditedSide` på "åt vilket håll".
 *
 * Okänd detalj-sträng får en neutral ikon och visas rått, aldrig en gissad
 * översättning (samma princip som lib/i18n/sv.ts).
 */

export interface EventDisplay {
  icon: string;
  /** Svensk etikett för händelsen, t.ex. "Straffmål". */
  label: string;
  /** Ska den här händelsen ändra ställningen? Falskt för missad straff. */
  countsAsGoal: boolean;
  /** Ett mål/rött kort är "stort" och får synas i en kompakt lista; ett byte inte. */
  major: boolean;
}

function normalize(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function describeEvent(type: string, detail: string | null): EventDisplay {
  const t = normalize(type);
  const d = normalize(detail);

  if (t === "goal") {
    // Missad straff ligger under samma typ som mål — se filhuvudet.
    if (d.includes("missed")) return { icon: "❌", label: "Missad straff", countsAsGoal: false, major: true };
    if (d.includes("own")) return { icon: "⚽", label: "Självmål", countsAsGoal: true, major: true };
    if (d.includes("penalty")) return { icon: "⚽", label: "Straffmål", countsAsGoal: true, major: true };
    return { icon: "⚽", label: "Mål", countsAsGoal: true, major: true };
  }

  if (t === "card") {
    if (d.includes("second yellow")) return { icon: "🟥", label: "Andra gula — utvisad", countsAsGoal: false, major: true };
    if (d.includes("red")) return { icon: "🟥", label: "Rött kort", countsAsGoal: false, major: true };
    if (d.includes("yellow")) return { icon: "🟨", label: "Gult kort", countsAsGoal: false, major: false };
    return { icon: "🟨", label: detail ?? "Kort", countsAsGoal: false, major: false };
  }

  if (t === "subst") return { icon: "🔄", label: "Byte", countsAsGoal: false, major: false };

  if (t === "var") {
    if (d.includes("cancel")) return { icon: "🟢", label: "VAR: mål annullerat", countsAsGoal: false, major: true };
    if (d.includes("penalty confirmed")) return { icon: "🟢", label: "VAR: straff bekräftad", countsAsGoal: false, major: true };
    if (d.includes("goal confirmed")) return { icon: "🟢", label: "VAR: mål bekräftat", countsAsGoal: false, major: true };
    if (d.includes("card")) return { icon: "🟢", label: "VAR: kort ändrat", countsAsGoal: false, major: true };
    return { icon: "🟢", label: detail ? `VAR: ${detail}` : "VAR-granskning", countsAsGoal: false, major: true };
  }

  return { icon: "•", label: detail ?? type, countsAsGoal: false, major: false };
}

/** "45+2′" eller "67′" — samma formatering överallt. */
export function formatMinute(minute: number, extraMinute: number | null): string {
  return `${minute}${extraMinute ? `+${extraMinute}` : ""}′`;
}
