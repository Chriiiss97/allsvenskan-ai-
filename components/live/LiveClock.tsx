"use client";

import { useEffect, useState } from "react";
import { computeClock, type MatchClockAnchor } from "@/lib/football/match-clock";

/**
 * Fas 21 (2026-08-23) — den tickande matchklockan.
 *
 * Kravet var att appen ska visa samma minut som matchen faktiskt är på.
 * Uträkningen bor i lib/football/match-clock.ts (ren funktion, testbar, delad
 * med servern) — den här komponenten gör bara två saker: renderar om varje
 * sekund medan klockan går, och slutar när den inte gör det.
 *
 * `anchor` byts ut varje gång pollingen hämtar nytt (var 20:e sekund), så den
 * lokala räkningen aldrig hinner glida — den överbryggar bara glappet mellan
 * två avläsningar. Står klockan (halvtid, avbrott) renderas periodens namn
 * istället, och intervallet stängs av helt.
 *
 * Tiden ligger i state och stegas av intervallet; själva klocktexten RÄKNAS
 * FRAM under renderingen ur ankaret plus den tiden. Date.now() får inte
 * anropas direkt i renderingen — React kräver att renderingen är ren, och
 * regeln fångas av lintern. Det ger också att ett nytt ankare slår igenom
 * direkt, utan en extra renderingsrunda.
 *
 * `suppressHydrationWarning`: servern och klienten renderar per definition
 * olika sekund. Det är avsikten med en klocka, inte ett fel.
 *
 * Ingen klocka alls → komponenten visar `fallback` (API-Footballs
 * heltalsminut). Sämre upplösning, men sant, och matchvyn står aldrig tom
 * bara för att Sportmonks inte gav en timer.
 */
export function LiveClock({
  anchor,
  fallback,
  className,
}: {
  anchor: MatchClockAnchor | null;
  /** Visas när ingen klockdata finns — t.ex. "67′" från API-Football. */
  fallback: string | null;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const display = computeClock(anchor, now);
  const running = display?.running ?? false;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const text = display?.text ?? fallback;
  if (!text) return null;

  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
