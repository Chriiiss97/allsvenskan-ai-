import type { PlayerListItem, PlayerListParams } from "../player-catalog";

/**
 * Scout Engine Fas 6 (2026-08-21) — "scout-matchning": en transparent
 * procentsats för hur väl en spelare (som REDAN klarat alla hårda filter,
 * annars vore de inte i listan) matchar sökningen, plus VARFÖR.
 *
 * En ren klarat/inte klarat-procent vore meningslös här — alla i
 * resultatlistan har per definition redan klarat varje aktivt filter. Det
 * som faktiskt skiljer en 92%-matchning från en 100%-matchning är HUR
 * BRA de klarar det, inte OM. Varje aktivt kriterium klassas därför som
 * "starkt" (klarar med god marginal) eller "svagt" (klarar precis) —
 * ingen svart låda, varje klassning är en enkel, redovisad jämförelse.
 *
 * Trösklarna för "starkt" är INTE nya påhitt — de återanvänder redan
 * etablerade gränser i projektet: 900 minuter = "hög" konfidens-tröskel
 * (lib/football/confidence.ts), ±3 OVR = "uppåtgående/nedåtgående" i
 * rating-trend.ts. Kategoriska kriterier (position/klubb/namn) har ingen
 * naturlig "svag" grad och räknas alltid som starka om de är uppfyllda
 * (spelaren är antingen försvarare eller inte).
 */

export interface MatchCriterion {
  label: string;
  strong: boolean;
}

export interface ScoutMatch {
  percent: number;
  criteria: MatchCriterion[];
}

/** Samma "hög konfidens"-golv som redan styr Player Rating/DNA överallt annars — inte ett nytt tal. */
const STRONG_MINUTES = 900;
/** Samma tröskel som rating-trend.ts:s trend-klassning. */
const MEANINGFUL_OVR_DELTA = 3;

/**
 * Returnerar `null` om inga relevanta kriterier är aktiva — Scout:s
 * standardvy (inga filter satta) ska inte visa en påhittad "100% match".
 */
export function computeScoutMatch(item: PlayerListItem, params: PlayerListParams): ScoutMatch | null {
  const criteria: MatchCriterion[] = [];

  if (params.position) {
    criteria.push({ label: `Position: ${item.position ?? "okänd"}`, strong: true });
  }
  if (params.teamId !== undefined) {
    criteria.push({ label: "Vald klubb", strong: true });
  }
  if (params.ageMin !== undefined || params.ageMax !== undefined) {
    criteria.push({ label: `${item.age ?? "okänd"} år`, strong: true });
  }
  if (params.ratingMin !== undefined && item.rating !== null) {
    criteria.push({ label: `OVR ${item.rating} (minst ${params.ratingMin})`, strong: item.rating >= params.ratingMin + 10 });
  }
  if (params.ratingMax !== undefined && item.rating !== null) {
    criteria.push({ label: `OVR ${item.rating} (högst ${params.ratingMax})`, strong: true });
  }
  if (params.goalsMin !== undefined) {
    criteria.push({ label: `${item.goals} mål (minst ${params.goalsMin})`, strong: item.goals >= params.goalsMin * 1.5 });
  }
  if (params.assistsMin !== undefined) {
    criteria.push({ label: `${item.assists} assist (minst ${params.assistsMin})`, strong: item.assists >= params.assistsMin * 1.5 });
  }
  if (params.minutesMin !== undefined) {
    criteria.push({ label: `${item.minutesPlayed} minuter (minst ${params.minutesMin})`, strong: item.minutesPlayed >= STRONG_MINUTES });
  }
  if ((params.ovrDeltaMin !== undefined || params.ovrDeltaMax !== undefined) && item.ovrDelta !== null) {
    const label = item.ovrDelta > 0 ? `OVR-utveckling +${item.ovrDelta}` : `OVR-utveckling ${item.ovrDelta}`;
    // Starkt = tydligt mer än bara precis över den satta lägstanivån (eller,
    // om bara ett tak är satt, en genuint betydande förändring i sig).
    const margin = params.ovrDeltaMin !== undefined ? params.ovrDeltaMin + MEANINGFUL_OVR_DELTA : MEANINGFUL_OVR_DELTA;
    criteria.push({ label, strong: item.ovrDelta >= margin });
  }
  if (params.consistencyMinSeasons !== undefined) {
    criteria.push({
      label: `${item.seasonsAboveThreshold} konsekvent bra säsonger (minst ${params.consistencyMinSeasons})`,
      strong: item.seasonsAboveThreshold >= params.consistencyMinSeasons + 1,
    });
  }
  if (params.archetypeKeys && params.archetypeKeys.length > 0) {
    const matchedCount = item.archetypes.filter((a) => params.archetypeKeys!.includes(a.key)).length;
    criteria.push({
      label: matchedCount > 1 ? `Matchar ${matchedCount} av de valda spelartyperna` : "Matchar vald spelartyp",
      strong: matchedCount > 1,
    });
  }
  if (params.query) {
    criteria.push({ label: "Namnsökning", strong: true });
  }

  if (criteria.length === 0) return null;

  const strongCount = criteria.filter((c) => c.strong).length;
  return { percent: Math.round((strongCount / criteria.length) * 100), criteria };
}
