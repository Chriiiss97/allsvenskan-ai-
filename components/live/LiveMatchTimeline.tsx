"use client";

import type { LiveFeed } from "@/lib/football/live-feed";
import { MatchTimeline } from "@/components/data/MatchTimeline";
import { useLiveFeed } from "./useLiveFeed";

/**
 * Fas 20 (2026-08-23) — tidslinjen för en match som ännu inte är avgjord.
 *
 * Återanvänder MatchTimeline rakt av (samma visuella tidslinje som en spelad
 * match får) och matar den bara med färska händelser från pollingkanalen
 * istället för en engångsrendering.
 *
 * Används för ALLA matcher som inte är slutspelade, inte bara pågående. Det
 * var ett hål i första versionen: en användare som öppnade matchsidan
 * tjugo minuter före avspark fick en serverrenderad "inga händelser"-vy som
 * aldrig ändrade sig, medan ställningen ovanför började röra på sig. Nu
 * växlar tidslinjen med matchen utan att sidan behöver laddas om.
 *
 * Delar kanal med MatchLiveHero: båda frågar `/api/live?fixture=X`, och
 * useLiveFeed ser till att det blir EN request, inte två (kravet "flera
 * öppna komponenter ska inte polla samma match parallellt").
 */
export function LiveMatchTimeline({
  initial,
  fixtureId,
  homeName,
  awayName,
}: {
  initial: LiveFeed;
  fixtureId: number;
  homeName: string;
  awayName: string;
}) {
  const { feed } = useLiveFeed(`/api/live?fixture=${fixtureId}`, initial, true);
  const match = feed?.matches.find((m) => m.fixtureId === fixtureId) ?? initial.matches.find((m) => m.fixtureId === fixtureId);

  const events = (match?.events ?? []).map((e) => ({
    type: e.type,
    detail: e.detail,
    minute: e.minute,
    extraMinute: e.extraMinute,
    // MatchTimeline placerar hemma/borta genom att jämföra lagnamn.
    // live-feed vet redan vilken sida händelsen hör till (på team_id, som
    // är säkrare än en namnjämförelse) — vi översätter tillbaka till det
    // namn komponenten förväntar sig istället för att ändra dess kontrakt.
    team: e.side === "home" ? homeName : e.side === "away" ? awayName : null,
    player: e.player,
    playerId: e.playerId,
    assist: e.assist,
    assistId: e.assistId,
  }));

  if (events.length === 0) {
    // Tomtillståndet ska säga något SANT om just den här matchen — "matchen
    // har precis börjat" är fel text tjugo minuter före avspark.
    const message =
      match?.phase === "upcoming"
        ? "Matchen har inte startat än. Händelserna dyker upp här allteftersom."
        : "Inga händelser än.";
    return <p className="text-sm text-[#898781]">{message}</p>;
  }

  return <MatchTimeline events={events} homeName={homeName} awayName={awayName} />;
}
