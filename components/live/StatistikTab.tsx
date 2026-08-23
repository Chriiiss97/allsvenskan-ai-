"use client";

import type { LiveFeed } from "@/lib/football/live-feed";
import { useLiveFeed } from "./useLiveFeed";
import { FullStats } from "./LiveStatTable";

/**
 * Fas 21 (2026-08-23) — Statistik-fliken.
 *
 * All live-statistik Sportmonks ger (34 mått under den verifierade matchen),
 * grupperad efter vad en läsare letar efter. Under matchen uppdateras den
 * från samma delade pollingkanal som resten av hubben.
 *
 * `fallback` är matchsidans serverrenderade post-match-statistik
 * (fixture_team_stats, inkl. xG och passningsprocent). Den visas när
 * live-lagret inte har något — alltså för alla matcher spelade före Fas 21,
 * där live aldrig samlades in men efterhandsdatan finns. Så blir fliken
 * meningsfull även i arkivet, inte bara på matchdag.
 */
export function StatistikTab({
  initial,
  fixtureId,
  homeName,
  awayName,
  fallback,
}: {
  initial: LiveFeed;
  fixtureId: number;
  homeName: string;
  awayName: string;
  fallback?: React.ReactNode;
}) {
  const initialMatch = initial.matches.find((m) => m.fixtureId === fixtureId) ?? null;
  const enabled = initialMatch ? initialMatch.phase !== "finished" && initialMatch.phase !== "cancelled" : false;
  const { feed } = useLiveFeed(`/api/live?fixture=${fixtureId}`, initial, enabled);

  const match = feed?.matches.find((m) => m.fixtureId === fixtureId) ?? initialMatch;
  const rows = match?.liveStats ?? [];

  if (rows.length === 0) {
    if (fallback) return <>{fallback}</>;
    return (
      <p className="text-sm text-[#898781]">
        {match?.phase === "upcoming"
          ? "Statistiken fylls på när matchen startat."
          : "Statistik inte tillgänglig för den här matchen."}
      </p>
    );
  }

  return <FullStats rows={rows} homeName={homeName} awayName={awayName} />;
}
