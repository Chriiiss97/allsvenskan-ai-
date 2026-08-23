"use client";

import type { ReactNode } from "react";
import type { LiveFeed } from "@/lib/football/live-feed";
import { useLiveFeed } from "./useLiveFeed";
import { CommentaryFeed } from "./CommentaryFeed";

/**
 * Fas 21 (2026-08-23) — Rapport-fliken.
 *
 * Två saker under samma rubrik, i den ordning de är intressanta:
 *
 *  1. HELA matchkommentaren. Fakta-fliken visar de fyra senaste raderna med
 *     en "Fullständig rapport"-knapp; det är hit den leder. Texten är
 *     engelsk och oöversatt — se CommentaryFeed och migrationen för varför
 *     det är ett medvetet undantag från svensk-only-regeln.
 *  2. Vår EGNA analys (Snabbanalys, den premiumspärrade Matchrapporten,
 *     Nyckelspelare, ligasnitt) — serverrenderad och inskickad som
 *     `children`, eftersom den bygger på tung data som inte ändras under
 *     matchen och inte ska hämtas om var 20:e sekund.
 *
 * Kommentaren pollar via den delade kanalen, analysen gör det inte. Att ha
 * dem i samma flik betyder alltså inte att de uppdateras lika ofta.
 */
export function RapportTab({
  initial,
  fixtureId,
  children,
}: {
  initial: LiveFeed;
  fixtureId: number;
  children?: ReactNode;
}) {
  const initialMatch = initial.matches.find((m) => m.fixtureId === fixtureId) ?? null;
  const enabled = initialMatch ? initialMatch.phase !== "finished" && initialMatch.phase !== "cancelled" : false;
  const { feed } = useLiveFeed(`/api/live?fixture=${fixtureId}`, initial, enabled);

  const match = feed?.matches.find((m) => m.fixtureId === fixtureId) ?? initialMatch;
  const comments = match?.comments ?? [];

  return (
    <div className="space-y-10">
      {comments.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold">
            <span aria-hidden>📝</span> Matchrapport, minut för minut
          </h2>
          <CommentaryFeed comments={comments} limit={comments.length} />
        </section>
      )}
      {children}
    </div>
  );
}
