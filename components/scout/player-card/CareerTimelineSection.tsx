"use client";

import { useState } from "react";
import type { CareerTimelineEntry } from "@/lib/football/career-timeline";
import type { ForeignCareerStint } from "@/lib/football/career-timeline";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * Fas 17 (2026-08-22) — karriärsektionen om till en riktig FotMob-liknande
 * Klubb/Säsong-vy (tidigare bara en platt Allsvensk lista). Två RIKTIGA
 * källor slås ihop till EN tidslinje:
 *   - Allsvenskan (career-timeline.ts:s getCareerTimeline, samma `statistics`
 *     -tabell som redan var källan) — förblir källan för Allsvenska säsonger.
 *   - Allt annat (getForeignCareerStints — utländska ligor, lägre svenska
 *     divisioner, cupspel), importerat av
 *     scripts/import/import-player-career.ts från riktiga api-football-svar
 *     (/transfers + /players?id&team&season). INGEN gissning — en spelare
 *     utan importerad karriärdata visar bara sin Allsvenska historik plus en
 *     ärlig rad om att övrig karriär inte är utredd än (se längst ner).
 *
 * "Klubb"-fliken grupperar SAMMANHÄNGANDE säsonger vid samma klubb till en
 * period (t.ex. "2022–2024"), summerar matcher/mål/assist över perioden —
 * samma sorts vy som referensbilden. "Säsong"-fliken visar varje
 * (klubb, liga, säsong)-rad för sig, INGEN sammanslagning — man ska kunna
 * se exakt vilken tävling varje siffra kommer från.
 */

interface UnifiedStint {
  seasonYear: number;
  teamName: string;
  teamLogoUrl: string | null;
  leagueName: string;
  leagueCountry: string | null;
  appearances: number;
  goals: number;
  assists: number;
  rating: number | null;
}

function unify(entries: CareerTimelineEntry[], foreign: ForeignCareerStint[]): UnifiedStint[] {
  const domestic: UnifiedStint[] = entries.map((e) => ({
    seasonYear: e.seasonYear,
    teamName: e.teamName,
    teamLogoUrl: e.teamLogoUrl,
    leagueName: "Allsvenskan",
    leagueCountry: "Sverige",
    appearances: e.appearances,
    goals: e.goals,
    assists: e.assists,
    rating: null,
  }));
  const abroad: UnifiedStint[] = foreign.map((f) => ({
    seasonYear: f.seasonYear,
    teamName: f.teamName,
    teamLogoUrl: f.teamLogoUrl,
    leagueName: f.leagueName,
    leagueCountry: f.leagueCountry,
    appearances: f.appearances ?? 0,
    goals: f.goals ?? 0,
    assists: f.assists ?? 0,
    rating: f.rating,
  }));
  return [...domestic, ...abroad].sort((a, b) => b.seasonYear - a.seasonYear || a.teamName.localeCompare(b.teamName));
}

interface ClubPeriod {
  teamName: string;
  teamLogoUrl: string | null;
  startYear: number;
  endYear: number;
  appearances: number;
  goals: number;
  assists: number;
  leagues: Set<string>;
}

/** Grupperar per klubb, delar upp i SAMMANHÄNGANDE årsintervall — ett uppehåll (spelaren lämnade och kom tillbaka) blir två egna rader. */
function groupByClub(stints: UnifiedStint[]): ClubPeriod[] {
  const byTeam = new Map<string, UnifiedStint[]>();
  for (const s of stints) {
    const list = byTeam.get(s.teamName) ?? [];
    list.push(s);
    byTeam.set(s.teamName, list);
  }

  const periods: ClubPeriod[] = [];
  for (const [teamName, list] of byTeam) {
    const years = [...new Set(list.map((s) => s.seasonYear))].sort((a, b) => a - b);
    let runStart = years[0];
    let runPrev = years[0];
    const flushRun = (endYear: number) => {
      const inRun = list.filter((s) => s.seasonYear >= runStart && s.seasonYear <= endYear);
      periods.push({
        teamName,
        teamLogoUrl: inRun[0]?.teamLogoUrl ?? null,
        startYear: runStart,
        endYear,
        appearances: inRun.reduce((sum, s) => sum + s.appearances, 0),
        goals: inRun.reduce((sum, s) => sum + s.goals, 0),
        assists: inRun.reduce((sum, s) => sum + s.assists, 0),
        leagues: new Set(inRun.map((s) => s.leagueName)),
      });
    };
    for (let i = 1; i < years.length; i++) {
      if (years[i] === runPrev + 1) {
        runPrev = years[i];
        continue;
      }
      flushRun(runPrev);
      runStart = years[i];
      runPrev = years[i];
    }
    flushRun(runPrev);
  }

  return periods.sort((a, b) => b.endYear - a.endYear || b.startYear - a.startYear);
}

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-white">{value}</span> <span className="text-[#7d7c76]">{label}</span>
    </span>
  );
}

export function CareerTimelineSection({ entries, foreignStints }: { entries: CareerTimelineEntry[]; foreignStints: ForeignCareerStint[] }) {
  const [tab, setTab] = useState<"klubb" | "sasong">("klubb");
  if (entries.length === 0 && foreignStints.length === 0) return null;

  const unified = unify(entries, foreignStints);
  const clubPeriods = groupByClub(unified);

  return (
    <CollapsibleSection title="Karriär" icon="📜" subtitle={`${clubPeriods.length} klubbar · ${unified.length} säsongsposter`}>
      <div className="mb-3 flex gap-1 rounded-lg bg-black/20 p-1 text-xs font-medium">
        <button
          type="button"
          onClick={() => setTab("klubb")}
          className={`flex-1 rounded-md py-1.5 transition-colors ${tab === "klubb" ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"}`}
        >
          Klubb
        </button>
        <button
          type="button"
          onClick={() => setTab("sasong")}
          className={`flex-1 rounded-md py-1.5 transition-colors ${tab === "sasong" ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"}`}
        >
          Säsong
        </button>
      </div>

      {tab === "klubb" ? (
        <ol className="space-y-0">
          {clubPeriods.map((p, i) => (
            <li
              key={`${p.teamName}-${p.startYear}`}
              className={`flex items-center gap-3 py-2.5 text-sm ${i !== clubPeriods.length - 1 ? "border-b border-white/5" : ""}`}
            >
              {p.teamLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
                <img src={p.teamLogoUrl} alt="" className="h-6 w-6 shrink-0 object-contain" />
              ) : (
                <span className="h-6 w-6 shrink-0" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[#c3c2b7]">{p.teamName}</p>
                <p className="text-[11px] text-[#7d7c76]">{p.startYear === p.endYear ? p.startYear : `${p.startYear}–${p.endYear}`}</p>
              </div>
              <div className="shrink-0 space-x-3 text-right text-xs">
                <StatCell value={p.appearances} label="M" />
                <StatCell value={p.goals} label="Mål" />
                {p.assists > 0 && <StatCell value={p.assists} label="Ass" />}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="space-y-0">
          {unified.map((s, i) => (
            <li
              key={`${s.teamName}-${s.leagueName}-${s.seasonYear}-${i}`}
              className={`flex items-center gap-3 py-2.5 text-sm ${i !== unified.length - 1 ? "border-b border-white/5" : ""}`}
            >
              <span className="w-14 shrink-0 font-semibold tabular-nums text-white">{s.seasonYear}</span>
              {s.teamLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
                <img src={s.teamLogoUrl} alt="" className="h-5 w-5 shrink-0 object-contain" />
              ) : (
                <span className="h-5 w-5 shrink-0" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[#c3c2b7]">{s.teamName}</p>
                <p className="truncate text-[11px] text-[#7d7c76]">
                  {s.leagueName}
                  {s.leagueCountry && s.leagueCountry !== "Sverige" ? ` · ${s.leagueCountry}` : ""}
                </p>
              </div>
              <div className="shrink-0 space-x-3 text-right text-xs">
                <StatCell value={s.appearances} label="M" />
                <StatCell value={s.goals} label="Mål" />
                {s.assists > 0 && <StatCell value={s.assists} label="Ass" />}
                {s.rating !== null && <span className="tabular-nums font-semibold text-[#d9a526]">{s.rating.toFixed(1)}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-3 border-t border-white/5 pt-3 text-[11px] text-[#5f5e59]">
        {foreignStints.length > 0
          ? "Allsvenska säsonger visas alltid. Övrig karriär (andra ligor/länder) bygger på dokumenterade klubbyten och matchad statistik — kan vara ofullständig för äldre eller mindre väldokumenterade perioder."
          : "Visar Allsvensk historik. Övrig karriär (andra ligor/länder) är inte utredd/importerad för den här spelaren än."}
      </p>
    </CollapsibleSection>
  );
}
