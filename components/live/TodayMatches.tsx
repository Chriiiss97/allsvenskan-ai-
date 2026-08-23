"use client";

import Link from "next/link";
import type { LiveFeed, LiveFeedMatch } from "@/lib/football/live-feed";
import { describeEvent, formatMinute } from "@/lib/football/event-display";
import { useLiveFeed } from "./useLiveFeed";
import { StatusPill } from "./LiveIndicator";

/**
 * Fas 20 (2026-08-23) — "Idag" högst upp i matchlistan.
 *
 * Problemet den löser: /matcher var byggd som ett säsongsarkiv (säsong →
 * omgång → matcher) och hade ingen aning om att en match kunde pågå just
 * nu. Regeln `status !== "FT" ? "Kommande"` gjorde att en match i 67:e
 * minuten presenterades som "IFK Göteborg –––– Elfsborg · Kommande" —
 * på matchdag det mest missvisande i hela produkten.
 *
 * Sektionen visas bara när dagen faktiskt har matcher. Ingen tom
 * platshållarrubrik en tisdag i november.
 */

function scoreLine(match: LiveFeedMatch): string {
  const started = match.phase !== "upcoming";
  if (!started) {
    return new Date(match.kickoff).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  }
  return `${match.homeScore ?? 0}–${match.awayScore ?? 0}`;
}

/**
 * Målskyttar (och utvisningar) som en kompakt rad under ställningen — det
 * en läsare vill veta direkt efter siffrorna. Byten och gula kort utelämnas
 * medvetet: de hör hemma i matchvyns tidslinje, inte i en lista som ska gå
 * att skumma. Missad straff räknas INTE som mål, se event-display.ts.
 */
function KeyEvents({ match }: { match: LiveFeedMatch }) {
  const highlights = match.events.filter((e) => {
    const display = describeEvent(e.type, e.detail);
    return display.countsAsGoal || display.icon === "🟥";
  });
  if (highlights.length === 0) return null;

  return (
    <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/5 pt-2.5 text-[11px] text-[#898781]">
      {highlights.map((e, i) => {
        const display = describeEvent(e.type, e.detail);
        return (
          <li key={i} className="flex items-center gap-1.5">
            <span aria-hidden>{display.icon}</span>
            <span className="text-[#c3c2b7]">{e.player ?? display.label}</span>
            <span className="tabular-nums text-[#5f5e59]">{formatMinute(e.minute, e.extraMinute)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function MatchRow({ match }: { match: LiveFeedMatch }) {
  const started = match.phase !== "upcoming";
  // Under spel är klockan det intressanta ("67′"); annars statustexten.
  const pillLabel = match.clock ?? match.statusLabel;

  return (
    <li>
      <Link
        href={`/matcher/${match.fixtureId}`}
        className="block rounded-2xl border border-white/10 bg-[#1a1a19] px-4 py-3.5 transition-colors hover:border-white/25 hover:bg-white/[.03] sm:px-5"
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {[match.home, match.away].map((team, index) => {
              const score = index === 0 ? match.homeScore : match.awayScore;
              // En avslutad match ska ha vinnaren framhävd; under spel är
              // båda lika viktiga.
              const isWinner =
                match.phase === "finished" && match.homeScore != null && match.awayScore != null
                  ? index === 0
                    ? match.homeScore > match.awayScore
                    : match.awayScore > match.homeScore
                  : false;
              return (
                <div key={index} className="flex items-center gap-2.5">
                  {team?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- extern logga
                    <img src={team.logoUrl} alt="" className="h-6 w-6 shrink-0" />
                  ) : (
                    <div className="h-6 w-6 shrink-0 rounded-full bg-white/5" aria-hidden />
                  )}
                  <span
                    className={`truncate text-sm ${
                      match.phase === "finished" && !isWinner ? "font-medium text-[#898781]" : "font-semibold text-white"
                    }`}
                  >
                    {team?.name ?? "Okänt lag"}
                  </span>
                  {started && (
                    <span className="ml-auto shrink-0 text-lg font-bold tabular-nums text-white">{score ?? 0}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5 self-stretch justify-center border-l border-white/5 pl-3 sm:pl-4">
            {!started && <span className="text-base font-semibold tabular-nums text-white">{scoreLine(match)}</span>}
            <StatusPill phase={match.phase} label={pillLabel} />
          </div>
        </div>

        <KeyEvents match={match} />
      </Link>
    </li>
  );
}

export function TodayMatches({ initial }: { initial: LiveFeed }) {
  // Pollingen stängs av helt när dagens matcher är färdigspelade — det
  // finns då inget att följa, och en öppen flik ska inte fortsätta fråga.
  const enabled = initial.matches.some((m) => m.phase !== "finished" && m.phase !== "cancelled");
  const { feed, stale } = useLiveFeed("/api/live", initial, enabled);
  const matches = feed?.matches ?? initial.matches;

  if (matches.length === 0) return null;

  const anyInPlay = matches.some((m) => m.phase === "live" || m.phase === "paused");

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#898781]">Idag</h2>
        {/* Ärlig färskhetsmarkering: hellre säga att uppdateringen hakat upp
            sig än att visa gammal data som om den vore ny. */}
        {stale && anyInPlay && <span className="text-[11px] text-[#5f5e59]">Kunde inte uppdatera — visar senast kända läge</span>}
      </div>
      <ul className="space-y-2">
        {matches.map((match) => (
          <MatchRow key={match.fixtureId} match={match} />
        ))}
      </ul>
    </section>
  );
}
