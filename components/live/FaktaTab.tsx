"use client";

import { useState } from "react";
import type { LiveFeed } from "@/lib/football/live-feed";
import { useLiveFeed } from "./useLiveFeed";
import { CommentaryFeed } from "./CommentaryFeed";
import { MomentumChart } from "./MomentumChart";
import { TopStats } from "./LiveStatTable";
import { useOpenMatchTab } from "./MatchTabs";

/**
 * Fas 21 (2026-08-23) — Fakta-fliken, matchhubbens förstasida.
 *
 * Tre block, i den ordning en läsare vill ha dem under en pågående match:
 * vad hände nyss (kommentaren), vem trycker på (momentum), och hur ser det
 * ut i siffror (toppstatistik). Resten av statistiken bor på Statistik-
 * fliken — kravet var uttryckligen "hellre 8 riktigt bra statistikvärden än
 * 25 halvtomma".
 *
 * Pollar samma delade kanal som hero:n och tidslinjen (useLiveFeed), så en
 * öppen matchsida gör EN hämtning per intervall oavsett hur många av dessa
 * ytor som är monterade samtidigt.
 *
 * Varje block döljer sig självt när det saknar data. En match utan
 * Sportmonks-mappning visar alltså inte tre tomma rutor, utan bara det vi
 * faktiskt har.
 */
export function FaktaTab({
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
  const [showAllComments, setShowAllComments] = useState(false);
  const openTab = useOpenMatchTab();
  const initialMatch = initial.matches.find((m) => m.fixtureId === fixtureId) ?? null;
  const enabled = initialMatch ? initialMatch.phase !== "finished" && initialMatch.phase !== "cancelled" : false;
  const { feed } = useLiveFeed(`/api/live?fixture=${fixtureId}`, initial, enabled);

  const match = feed?.matches.find((m) => m.fixtureId === fixtureId) ?? initialMatch;
  if (!match) return null;

  const hasComments = match.comments.length > 0;
  const hasMomentum = match.momentum.length > 0;
  const hasStats = match.liveStats.length > 0;

  if (!hasComments && !hasMomentum && !hasStats) {
    return (
      <p className="text-sm text-[#898781]">
        {match.phase === "upcoming"
          ? "Matchen har inte startat än. Här dyker matchhändelser, momentum och statistik upp när den är igång."
          : "Ingen livedata för den här matchen ännu."}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {hasComments && (
        <section className="rounded-2xl border border-white/10 bg-[#1a1a19] p-4 sm:p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">Senaste händelserna</h3>
          <CommentaryFeed comments={match.comments} limit={showAllComments ? match.comments.length : 4} />
          {match.comments.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllComments((v) => !v)}
              className="mt-4 w-full border-t border-white/5 pt-4 text-sm font-medium text-[#c3c2b7] transition-colors hover:text-white"
            >
              {showAllComments ? "Visa färre" : `Fullständig rapport (${match.comments.length})`}
            </button>
          )}
        </section>
      )}

      {(hasMomentum || hasStats) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {hasMomentum && (
            <section className="rounded-2xl border border-white/10 bg-[#1a1a19] p-4 sm:p-5">
              <h3 className="mb-4 text-center text-sm font-semibold text-white">Momentum</h3>
              <MomentumChart points={match.momentum} homeName={homeName} awayName={awayName} />
            </section>
          )}

          {hasStats && (
            <section className="rounded-2xl border border-white/10 bg-[#1a1a19] p-4 sm:p-5">
              <h3 className="mb-4 text-center text-sm font-semibold text-white">Toppstatistik</h3>
              <TopStats rows={match.liveStats} homeName={homeName} awayName={awayName} />
              <button
                type="button"
                onClick={() => openTab("statistik")}
                className="mt-4 w-full border-t border-white/5 pt-4 text-sm font-medium text-[#c3c2b7] transition-colors hover:text-white"
              >
                All statistik
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
