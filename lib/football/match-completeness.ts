/**
 * Delad avstämningslogik: är en avslutad matchs mål-events kompletta,
 * jämfört med det riktiga resultatet (fixture.home_score/away_score)?
 *
 * Extraherad ur getMatchReport (tools.ts) i steg 7 så att SAMMA logik
 * används både när en användare öppnar en enskild matchrapport (read-time)
 * och när steg 7:s finalize-match.ts stämmer av i batch (write-time,
 * loggat till ingestion_log) — de kan aldrig komma till olika svar om
 * en match är komplett eller inte.
 *
 * Självmål krediteras MOTSTÅNDARLAGET (den som gjorde självmålet står som
 * `team_id` på event-raden, men målet ska räknas för andra laget) — verifierat
 * mot riktig data i datakvalitetskontrollen 2026-08-20.
 */

export interface EventsCompletenessFixture {
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_team_id: number | null;
}

export interface EventsCompletenessEvent {
  type: string;
  detail: string | null;
  team_id: number | null;
}

export function computeEventsComplete(fixture: EventsCompletenessFixture, events: EventsCompletenessEvent[]): boolean {
  // Bara meningsfullt att stämma av en färdigspelad match med ett riktigt
  // facit — allt annat (kommande/pågående matcher, eller ett okänt
  // resultat) räknas som "komplett" i den här bemärkelsen eftersom det
  // inte finns något att jämföra mot.
  if (fixture.status !== "FT" || fixture.home_score === null || fixture.away_score === null) return true;

  let homeGoals = 0;
  let awayGoals = 0;
  for (const e of events) {
    if (e.type !== "goal" || !e.team_id) continue;
    const scoringIsHome = e.team_id === fixture.home_team_id;
    const creditHome = e.detail === "Own Goal" ? !scoringIsHome : scoringIsHome;
    if (creditHome) homeGoals++;
    else awayGoals++;
  }
  return homeGoals === fixture.home_score && awayGoals === fixture.away_score;
}
