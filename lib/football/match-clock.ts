/**
 * Fas 21 (2026-08-23) — matchklockan.
 *
 * KRAVET: appen ska visa samma minut som matchen faktiskt är på. Fas 20 tog
 * minuten från API-Footballs `status.elapsed`, ett HELTAL som bara ändras när
 * vi pollar — mellan två pollningar stod klockan still, och pollade vi var
 * 30:e sekund kunde den ligga en minut fel.
 *
 * LÖSNINGEN är inte att gissa. Sportmonks `periods` ger halvlekens verkliga
 * starttidpunkt som unix-tidsstämpel (`started`), plus `ticking` (går klockan
 * just nu?) och en färsk `minutes`/`seconds`-avläsning. Verifierat mot en
 * pågående match: `{ started: 1787486426, minutes: 22, seconds: 39,
 * ticking: true, counts_from: 0, period_length: 45 }`.
 *
 * Med ett ANKARE (serverns senast kända sekund + när den lästes) kan
 * klienten räkna sekunder mellan pollningarna med ren aritmetik på
 * väggklockan. Det är samma sak som en stoppursvisare — inte en uppskattning
 * av matchdata, utan en uträkning från en verklig tidsstämpel. Varje ny
 * pollning sätter om ankaret, så avdriften aldrig kan byggas upp.
 *
 * TRE SÄKERHETSSPÄRRAR, eftersom en klocka som räknar fritt är farligare än
 * en som står still:
 *   1. `ticking = false` → klockan står. Halvtid, avbrott, VAR-granskning.
 *      Vi räknar INTE vidare, vi visar periodens namn.
 *   2. Klockan stannar vid periodens slut (45/90) och går över till
 *      tilläggstid ENDAST om Sportmonks rapporterat `time_added`. Utan den
 *      uppgiften visas "45+" utan siffra istället för en påhittad "45+3".
 *   3. Saknas ankaret helt (migrationen inte körd, eller Sportmonks utan
 *      timer) faller vi tillbaka på API-Footballs heltalsminut — sämre, men
 *      sant.
 */

export interface MatchClockAnchor {
  /** Periodens namn hos Sportmonks: '1st-half', '2nd-half', 'extra-time', … */
  description: string | null;
  /** Minuten perioden räknar FRÅN (0 för första halvlek, 45 för andra). */
  countsFrom: number;
  /** Periodens nominella längd i minuter (45, eller 15 i förlängning). */
  periodLength: number | null;
  /** Domarens signalerade tilläggstid, om den rapporterats. */
  timeAdded: number | null;
  /** Går klockan just nu? */
  ticking: boolean;
  /** Sportmonks senaste avläsning. */
  minutes: number | null;
  seconds: number | null;
  /** När avläsningen gjordes (ISO) — ankaret klienten räknar vidare från. */
  readAt: string;
}

export interface MatchClockDisplay {
  /** Vad som ska stå i klockan: "67:12", "45+2", "Halvtid". */
  text: string;
  /** Hela minuter, för ytor som bara vill ha "67′". */
  minute: number | null;
  /** Ska UI:t räkna vidare själv (dvs. rendera om varje sekund)? */
  running: boolean;
}

/** Periodens svenska namn — används när klockan står stilla. */
const PERIOD_LABELS: Record<string, string> = {
  "1st-half": "1:a halvlek",
  "2nd-half": "2:a halvlek",
  "extra-time": "Förlängning",
  "1st-extra-time": "Förlängning, 1:a",
  "2nd-extra-time": "Förlängning, 2:a",
  penalties: "Straffar",
};

export function periodLabel(description: string | null): string | null {
  if (!description) return null;
  return PERIOD_LABELS[description] ?? null;
}

/**
 * Räknar fram vad klockan ska visa NU, givet serverns ankare och den aktuella
 * tidpunkten. Ren funktion utan sidoeffekter — samma anrop på server och
 * klient ger samma svar, så den serverrenderade första bilden aldrig hoppar
 * när klienten tar över.
 *
 * @param now Millisekunder sedan epoch. Skickas in (istället för Date.now()
 *            internt) så den går att testa och så server/klient kan använda
 *            exakt samma tidpunkt vid hydrering.
 */
export function computeClock(anchor: MatchClockAnchor | null, now: number): MatchClockDisplay | null {
  if (!anchor) return null;

  const anchorSeconds = (anchor.minutes ?? 0) * 60 + (anchor.seconds ?? 0);

  // Klockan står: halvtid, avbrott, eller en period som inte startat.
  if (!anchor.ticking) {
    const label = periodLabel(anchor.description);
    return {
      text: label ?? formatClock(anchorSeconds),
      minute: anchor.minutes,
      running: false,
    };
  }

  const elapsedSinceRead = Math.max(0, (now - new Date(anchor.readAt).getTime()) / 1000);
  const liveSeconds = anchorSeconds + elapsedSinceRead;

  // Spärr 2: bortom periodens nominella slut visar vi tilläggstid, inte en
  // klocka som fortsätter till 47:33. Så gör en matchapp, och det är också
  // det ärliga: efter 45:00 är den exakta tiden domarens ensak.
  const limit = anchor.countsFrom + (anchor.periodLength ?? 45);
  const liveMinutes = Math.floor(liveSeconds / 60);
  if (liveMinutes >= limit) {
    const extra = Math.max(0, liveMinutes - limit) + 1;
    // Har domaren signalerat tilläggstid vet vi taket och kan visa "45+2".
    // Annars visas "45+" utan siffra — hellre ofullständigt än påhittat.
    if (anchor.timeAdded != null) {
      return { text: `${limit}+${Math.min(extra, anchor.timeAdded)}`, minute: limit, running: true };
    }
    return { text: `${limit}+`, minute: limit, running: true };
  }

  return { text: formatClock(liveSeconds), minute: liveMinutes, running: true };
}

/** "67:04" — alltid två siffror på sekunderna. */
function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
