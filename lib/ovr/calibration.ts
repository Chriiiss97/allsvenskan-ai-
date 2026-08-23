/**
 * OVR v2 — empirisk kontroll av ligakoefficienterna.
 * =============================================================================
 * RENA FUNKTIONER.
 *
 * -----------------------------------------------------------------------------
 * VAD DEN HÄR MODULEN GÖR — OCH INTE GÖR
 * -----------------------------------------------------------------------------
 * Den skattar i vilken ORDNING ligorna ligger i svårighet, genom att titta på
 * spelare som faktiskt spelat i både ligan och Allsvenskan.
 *
 * Den sätter INTE koefficienter. Det är ett medvetet beslut efter att två
 * metoder provats och mätts, inte en lucka som glömts bort. Se avsnittet längst
 * ned. Så länge magnituden inte går att belägga förblir koefficienterna
 * kvalificerade gissningar med calibrated = false — hellre en gissning som är
 * märkt som gissning än en siffra med falskt förtroende.
 *
 * Ordningen räcker ändå långt: den säger vilka av gissningarna som troligen är
 * fel, och det är handlingsbart.
 *
 * -----------------------------------------------------------------------------
 * METODEN
 * -----------------------------------------------------------------------------
 * För varje spelare som har en säsong i liga X och en allsvensk säsong inom
 * MAX_YEAR_GAP år, jämförs api-footballs eget säsongsbetyg på båda sidor:
 *
 *     skillnad = betyg_allsvenskan - betyg_liga
 *
 * Positiv skillnad betyder att spelaren betygsattes högre i Allsvenskan, alltså
 * att liga X är svårare. Medianen över många spelare ger ligans placering.
 *
 * Tre snedvridningar hanteras:
 *
 * 1. UTVECKLING. Bara spelare som är minst MIN_AGE i båda säsongerna, så att
 *    en ung spelares egen förbättring inte läses som en ligaskillnad.
 * 2. URVAL. Den som flyttar upp gjorde ofta en ovanligt bra säsong precis
 *    innan; den som flyttar ned en ovanligt dålig. Felen pekar åt motsatta
 *    håll, så riktningarna skattas separat och rapporteras var för sig.
 * 3. UTSTICKARE. Median, inte medelvärde.
 *
 * -----------------------------------------------------------------------------
 * VARFÖR MAGNITUDEN INTE GÅR ATT SÄTTA — TVÅ MÄTTA ÅTERVÄNDSGRÄNDER
 * -----------------------------------------------------------------------------
 * FÖRSÖK 1: mål + assist per 90. Enda produktionsmåttet som finns för
 * utländska ligor i player_career_stint. Mätt på 1 655 övergångspar gav det
 * ingen signal alls för närliggande nivåer:
 *
 *     Superettan   poolat 0,158 mot 0,158 per 90   kvot 0,998
 *     Eliteserien  poolat 0,236 mot 0,234 per 90   kvot 0,992
 *
 * Måttet är nollinflaterat — de flesta spelare gör nästan inga mål någonstans,
 * så medianen hamnar på noll skillnad oavsett liga. Bara där gapet är extremt
 * syns något (Europa League kvot 1,78). Metoden är alltså inte användbar.
 *
 * FÖRSÖK 2: api-footballs säsongsbetyg. Ger verklig signal och en rimlig
 * ordning (Superettan under Allsvenskan, Champions League högst). Men
 * omräkningen till koefficient kräver en z-enhet, och den enda tillgängliga —
 * spridningen i allsvenska säsongsbetyg, 0,252 — är för komprimerad:
 *
 *     Δ +0,30  ->  koefficient 2,11
 *     Δ +0,40  ->  koefficient 2,70
 *
 * Champions League på 2,70 är inte trovärdigt. Betygsskalan har p10 6,60 och
 * p90 7,20; dess spridning speglar brus inom en liga, inte nivåskillnad mellan
 * ligor. Att dämpa faktorn tills talen "ser rimliga ut" vore att sätta
 * koefficienter på känsla, vilket är precis vad tabellens calibrated-flagga
 * finns för att förhindra.
 *
 * VAD SOM SKULLE LÖSA DET: en oberoende, objektiv mätpunkt på gapet mellan två
 * kända ligor — till exempel hur lag som flyttas upp från Superettan presterar
 * sin första allsvenska säsong. Det kräver att Superettans matcher importeras,
 * vilket de inte är. Med en sådan ankarpunkt går z-enheten att sätta utan
 * cirkelresonemang, och då kan hela ordningen nedan räknas om till riktiga
 * koefficienter.
 */

/** Minsta speltid på BÅDA sidor för att ett par ska räknas. */
export const MIN_MINUTES_PER_SIDE = 450;

/** Största tillåtna lucka i år mellan de två säsongerna. */
export const MAX_YEAR_GAP = 2;

/**
 * Minsta ålder i båda säsongerna. Utvecklingskurvan är brantast före 23, och
 * där går spelarens egen förbättring inte att skilja från ligans svårighet.
 */
export const MIN_AGE = 23;

/**
 * Under så här många spelare rapporteras ingen placering — bruset dominerar.
 *
 * Tröskeln höjdes från 8 till 20 efter en första körning: 1. Division (Cypern)
 * mätte +0,35 på nio spelare, alltså svårare än Ligue 1, och drog med sig
 * fjorton av sjutton flaggade konflikter. Med tjugo spelare försvinner den
 * sortens utfall, och de ligor som blir kvar har underlag värt namnet.
 */
export const MIN_PLAYERS_FOR_ORDERING = 20;

/**
 * Största avvikelse i betygsenheter mellan skattningen från uppflyttningar och
 * den från nedflyttningar innan resultatet flaggas som opålitligt.
 */
export const MAX_DIRECTION_DISAGREEMENT = 0.25;

export interface RatingTransition {
  playerId: number;
  leagueExternalId: number;
  /** api-footballs säsongsbetyg i liga X. */
  foreignRating: number;
  /** api-footballs säsongsbetyg i Allsvenskan. */
  domesticRating: number;
  /** true om den allsvenska säsongen kom EFTER ligasäsongen. */
  movedToAllsvenskan: boolean;
  foreignYear: number;
  domesticYear: number;
}

export interface LeagueDifficultyEstimate {
  leagueExternalId: number;
  players: number;
  /**
   * Median av (allsvenskt betyg - ligabetyg). Positiv = ligan är svårare än
   * Allsvenskan. Enheten är api-footballs betygsskala, INTE en koefficient.
   */
  medianRatingDelta: number;
  deltaFromIncoming: number | null;
  deltaFromOutgoing: number | null;
  incomingPairs: number;
  outgoingPairs: number;
  /** Tillräckligt underlag och samstämmiga riktningar. */
  reliable: boolean;
  unreliableReason: string | null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function estimateLeagueDifficulty(
  leagueExternalId: number,
  transitions: readonly RatingTransition[]
): LeagueDifficultyEstimate {
  const players = new Set(transitions.map((t) => t.playerId)).size;
  const delta = (t: RatingTransition) => t.domesticRating - t.foreignRating;
  const incoming = transitions.filter((t) => t.movedToAllsvenskan);
  const outgoing = transitions.filter((t) => !t.movedToAllsvenskan);

  const medianRatingDelta = median(transitions.map(delta));
  const fromIncoming = incoming.length > 0 ? median(incoming.map(delta)) : null;
  const fromOutgoing = outgoing.length > 0 ? median(outgoing.map(delta)) : null;

  let unreliableReason: string | null = null;
  if (players < MIN_PLAYERS_FOR_ORDERING) {
    unreliableReason = `endast ${players} spelare, kräver ${MIN_PLAYERS_FOR_ORDERING}`;
  } else if (
    fromIncoming !== null &&
    fromOutgoing !== null &&
    incoming.length >= 3 &&
    outgoing.length >= 3 &&
    Math.abs(fromIncoming - fromOutgoing) > MAX_DIRECTION_DISAGREEMENT
  ) {
    unreliableReason = `riktningarna är oense (in ${fromIncoming.toFixed(2)} mot ut ${fromOutgoing.toFixed(2)}) — urvalseffekt dominerar`;
  }

  return {
    leagueExternalId,
    players,
    medianRatingDelta: Math.round(medianRatingDelta * 1000) / 1000,
    deltaFromIncoming: fromIncoming === null ? null : Math.round(fromIncoming * 1000) / 1000,
    deltaFromOutgoing: fromOutgoing === null ? null : Math.round(fromOutgoing * 1000) / 1000,
    incomingPairs: incoming.length,
    outgoingPairs: outgoing.length,
    reliable: unreliableReason === null,
    unreliableReason,
  };
}

export function estimateAll(transitions: readonly RatingTransition[]): LeagueDifficultyEstimate[] {
  const byLeague = new Map<number, RatingTransition[]>();
  for (const t of transitions) {
    const list = byLeague.get(t.leagueExternalId) ?? [];
    list.push(t);
    byLeague.set(t.leagueExternalId, list);
  }
  return [...byLeague.entries()]
    .map(([id, list]) => estimateLeagueDifficulty(id, list))
    .sort((a, b) => b.medianRatingDelta - a.medianRatingDelta);
}

/**
 * Jämför den uppmätta ordningen mot de koefficienter som faktiskt används.
 *
 * Ett par flaggas när de två källorna är oense om vilken av två ligor som är
 * svårast. Det är ordningen som är belagd, inte avståndet — så utfallet ska
 * läsas som "titta på de här två igen", inte som ett facit.
 */
export interface OrderingConflict {
  harderByMeasurement: number;
  easierByMeasurement: number;
  measuredGap: number;
  coefficientOfHarder: number;
  coefficientOfEasier: number;
}

export function findOrderingConflicts(
  estimates: readonly LeagueDifficultyEstimate[],
  coefficients: ReadonlyMap<number, number>,
  /** Minsta uppmätta skillnad för att ett par ska vara värt att flagga. */
  minGap = 0.08
): OrderingConflict[] {
  const usable = estimates.filter((e) => e.reliable && coefficients.has(e.leagueExternalId));
  const conflicts: OrderingConflict[] = [];

  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const harder = usable[i];
      const easier = usable[j];
      const gap = harder.medianRatingDelta - easier.medianRatingDelta;
      if (gap < minGap) continue;

      const coefHarder = coefficients.get(harder.leagueExternalId) as number;
      const coefEasier = coefficients.get(easier.leagueExternalId) as number;
      // Mätningen säger att `harder` är svårare. Koefficienterna säger motsatsen.
      if (coefHarder < coefEasier) {
        conflicts.push({
          harderByMeasurement: harder.leagueExternalId,
          easierByMeasurement: easier.leagueExternalId,
          measuredGap: Math.round(gap * 1000) / 1000,
          coefficientOfHarder: coefHarder,
          coefficientOfEasier: coefEasier,
        });
      }
    }
  }
  return conflicts.sort((a, b) => b.measuredGap - a.measuredGap);
}
