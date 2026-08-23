/**
 * Fas 20 (2026-08-23) — EN sanning för api-footballs matchstatuskoder.
 *
 * Koderna låg tidigare utspridda på tre ställen som inte kände till
 * varandra: `LIVE_FIXTURE_STATUSES` i lib/football/tools.ts (vilka som
 * räknas som pågående), `STATUS_LABELS` i lib/i18n/sv.ts (svensk text — som
 * bara täckte de TERMINALA lägena, aldrig 1H/HT/2H, så en pågående match
 * kunde visa den råa koden "2H" i UI:t), och en implicit "allt som inte är
 * FT är kommande"-regel i matchlistan (app/(app)/(content)/matcher/page.tsx)
 * som visade en LIVE-match som "Kommande".
 *
 * Kodlistan är api-footballs egen, fullständiga uppsättning (fixture.status.
 * short) — inte bara de vi råkar ha i databasen. Mätt 2026-08-23: `fixture`
 * innehåller just nu bara FT (2551) och NS (103), eftersom live-koderna är
 * ÖVERGÅENDE — de existerar bara i de timmar en match faktiskt pågår, och
 * skrivs sen över av live-pipelinens stängningslogik. Att bara hantera de
 * två som "finns" hade alltså garanterat gått sönder på matchdag.
 *
 * En OKÄND kod (api-football lägger till en ny) faller igenom som `unknown`
 * och visas rått — aldrig en gissad översättning, aldrig en gissad fas.
 */

export type MatchPhase =
  /** Inte startad än (inkl. tid ej fastställd). */
  | "upcoming"
  /** Spelet rullar just nu. */
  | "live"
  /** Matchen pågår men bollen ligger stilla (paus/avbrott). */
  | "paused"
  /** Färdigspelad med ett giltigt resultat. */
  | "finished"
  /** Blev aldrig av / räknas inte som spelad. */
  | "cancelled"
  /** Kod vi inte känner igen — visas rått, behandlas aldrig som live. */
  | "unknown";

interface StatusMeta {
  phase: MatchPhase;
  /** Full svensk text, t.ex. i en statusrad. */
  label: string;
  /** Kort text för en badge/pill där utrymmet är litet. Samma text när ingen kortform behövs. */
  short: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  // --- Före avspark ---
  TBD: { phase: "upcoming", label: "Tid ej fastställd", short: "Tid saknas" },
  NS: { phase: "upcoming", label: "Ej startad", short: "Kommande" },

  // --- Pågår ---
  "1H": { phase: "live", label: "1:a halvlek", short: "1:a" },
  "2H": { phase: "live", label: "2:a halvlek", short: "2:a" },
  ET: { phase: "live", label: "Förlängning", short: "Förl." },
  P: { phase: "live", label: "Straffläggning", short: "Straffar" },
  LIVE: { phase: "live", label: "Pågår", short: "Live" },

  // --- Pågår, men bollen ligger stilla ---
  HT: { phase: "paused", label: "Halvtid", short: "Halvtid" },
  BT: { phase: "paused", label: "Paus i förlängningen", short: "Paus" },
  SUSP: { phase: "paused", label: "Uppehåll i matchen", short: "Uppehåll" },
  INT: { phase: "paused", label: "Matchen avbruten tillfälligt", short: "Avbrott" },

  // --- Färdigspelad ---
  FT: { phase: "finished", label: "Slutspelad", short: "Slut" },
  AET: { phase: "finished", label: "Efter förlängning", short: "Efter förl." },
  PEN: { phase: "finished", label: "Efter straffar", short: "Efter straffar" },

  // --- Blev inte av ---
  PST: { phase: "cancelled", label: "Uppskjuten", short: "Uppskjuten" },
  CANC: { phase: "cancelled", label: "Inställd", short: "Inställd" },
  ABD: { phase: "cancelled", label: "Avbruten", short: "Avbruten" },
  AWD: { phase: "cancelled", label: "Walkover", short: "Walkover" },
  WO: { phase: "cancelled", label: "Walkover", short: "Walkover" },
};

/**
 * Koder som betyder "matchen har börjat men är inte klar" — alltså BÅDE
 * `live` och `paused`. Det är den mängd live-pipelinen pollar och som
 * `isFixtureLikelyLive` bygger på. Härledd ur tabellen ovan istället för att
 * upprepas som en egen lista (den gamla dubbleringen var precis hur
 * sv.ts kunde glömma bort halva uppsättningen).
 */
export const IN_PLAY_STATUSES: readonly string[] = Object.entries(STATUS_META)
  .filter(([, meta]) => meta.phase === "live" || meta.phase === "paused")
  .map(([code]) => code);

export function matchPhase(status: string | null): MatchPhase {
  if (!status) return "unknown";
  return STATUS_META[status]?.phase ?? "unknown";
}

/** Full svensk text för en statuskod. Okänd kod returneras rått. */
export function statusLabel(status: string | null): string | null {
  if (!status) return null;
  return STATUS_META[status]?.label ?? status;
}

/** Kort svensk text för en badge. Okänd kod returneras rått. */
export function statusShortLabel(status: string | null): string | null {
  if (!status) return null;
  return STATUS_META[status]?.short ?? status;
}

/** Har matchen börjat men inte blivit klar? (live ELLER paus) */
export function isInPlayStatus(status: string | null): boolean {
  const phase = matchPhase(status);
  return phase === "live" || phase === "paused";
}

/**
 * Vad ska stå i den lilla "minut-pillen" bredvid ställningen?
 *
 * Under en paus är minutsiffran meningslös (api-football fryser `elapsed`
 * på 45 respektive 90) — där vill man läsa "Halvtid", inte "45′". Under
 * spel vill man tvärtom ha siffran, och bara falla tillbaka på ordet om
 * `elapsed` saknas (t.ex. första ticken innan API:t hunnit rapportera).
 */
export function liveClockLabel(status: string | null, minute: number | null): string | null {
  const phase = matchPhase(status);
  if (phase === "paused") return statusShortLabel(status);
  if (phase === "live") return minute != null ? `${minute}′` : statusShortLabel(status);
  return null;
}
