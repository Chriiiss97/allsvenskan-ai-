"use client";

import type { LiveFeed, LiveFeedMatch } from "@/lib/football/live-feed";
import { statusLabel } from "@/lib/football/live-status";
import { timeAgo } from "@/lib/admin/format";
import { useLiveFeed } from "./useLiveFeed";
import { LiveDot } from "./LiveIndicator";
import { LiveClock } from "./LiveClock";

/**
 * Fas 20 (2026-08-23) — matchvyns hero, nu levande.
 *
 * Var tidigare helt serverrenderad: ställningen uppdaterades bara om
 * användaren själv laddade om sidan. Kombinerat med att pipelinen i
 * praktiken bara läste av matchen var 22:a minut (mätt) kunde en användare
 * sitta med en 40 minuter gammal ställning framför sig utan att något i
 * gränssnittet antydde det.
 *
 * Nu: samma markup, men ställning/status/minut kommer från den delade
 * pollingkanalen (useLiveFeed). Serverns rendering är fortfarande första
 * bilden — ingen spinner, ingen tom ruta — och pollingen tar vid först
 * därefter. Är matchen slutspelad pollas ingenting alls.
 *
 * "Uppdaterad X" står kvar och är medvetet ärlig: den visar hur gammal
 * DATAN är, inte när sidan senast frågade. En användare ska kunna se att
 * något hakat upp sig istället för att luras av ett gränssnitt som ser
 * färskt ut.
 */

interface HeroProps {
  initial: LiveFeed;
  fixtureId: number;
  /** Serverrenderad kontextrad för en match som inte pågår (säsong · omgång · datum). */
  contextLine: string;
}

function TeamSide({
  team,
  align,
}: {
  team: LiveFeedMatch["home"];
  align: "home" | "away";
}) {
  const logo = team?.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- extern logga
    <img src={team.logoUrl} alt="" className="h-9 w-9 sm:h-12 sm:w-12" />
  ) : null;
  const name = <span className="text-base font-bold leading-tight sm:text-2xl">{team?.name ?? "Okänt lag"}</span>;

  return (
    <div className={`flex flex-1 flex-col items-center gap-2 sm:flex-row ${align === "home" ? "sm:justify-end" : "sm:justify-start"}`}>
      {align === "home" ? (
        <>
          {logo}
          {name}
        </>
      ) : (
        <>
          {name}
          {logo}
        </>
      )}
    </div>
  );
}

export function MatchLiveHero({ initial, fixtureId, contextLine }: HeroProps) {
  const initialMatch = initial.matches.find((m) => m.fixtureId === fixtureId) ?? initial.matches[0] ?? null;
  const enabled = initialMatch ? initialMatch.phase !== "finished" && initialMatch.phase !== "cancelled" : false;
  const { feed, stale } = useLiveFeed(`/api/live?fixture=${fixtureId}`, initial, enabled);

  const match = feed?.matches.find((m) => m.fixtureId === fixtureId) ?? initialMatch;
  if (!match) return null;

  const inPlay = match.phase === "live" || match.phase === "paused";
  const started = match.phase !== "upcoming";

  return (
    <div className="text-center">
      {inPlay ? (
        <div className="flex items-center justify-center gap-2">
          <LiveDot phase={match.phase} />
          {/* Fas 21: riktig matchklocka med sekunder, räknad från Sportmonks
              periodstart (lib/football/match-clock.ts). Saknas klockan faller
              vi tillbaka på API-Footballs heltalsminut — sämre upplösning,
              men sant. I paus visar klockan periodens namn, aldrig en fryst
              45:a som ser ut som att tiden går. */}
          <LiveClock
            anchor={match.clockAnchor}
            fallback={match.clock ?? statusLabel(match.status)}
            className="text-[11px] font-semibold uppercase tracking-[0.25em] tabular-nums text-[#e0645f]"
          />
        </div>
      ) : (
        <p className="text-[11px] uppercase tracking-[0.25em] text-[#7d7c76]">{contextLine}</p>
      )}

      <div className="mt-6 flex items-center justify-center gap-4 sm:gap-8">
        <TeamSide team={match.home} align="home" />
        <div className="shrink-0 text-4xl font-black tabular-nums tracking-tight sm:text-6xl">
          {started ? `${match.homeScore ?? 0}–${match.awayScore ?? 0}` : "–"}
        </div>
        <TeamSide team={match.away} align="away" />
      </div>

      {!inPlay && match.statusLabel && (
        <p className="mt-4">
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7d7c76]">
            {statusLabel(match.status)}
          </span>
        </p>
      )}

      {inPlay && match.lastUpdated && (
        <p className="mt-2 text-[11px] text-[#5f5e59]">
          Uppdaterad {timeAgo(match.lastUpdated)}
          {stale && " · kunde inte hämta senaste läget"}
        </p>
      )}
    </div>
  );
}
