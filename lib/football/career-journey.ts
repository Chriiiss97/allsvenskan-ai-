import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getCareerTimeline, getForeignCareerStints } from "./career-timeline";
import { normalizeTeamName } from "./team-name-normalize";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 18 (2026-08-22) — "karriärresan": EN sammanhängande kronologisk
 * tidslinje över en spelares HELA dokumenterade karriär (Allsvenskan +
 * allt därefter/innan), med en tydlig milstolpe för när spelaren lämnade
 * Allsvenskan. Bygger UTESLUTANDE på redan hämtad, riktig data:
 *   - getCareerTimeline (Allsvenskan, `statistics`-tabellen)
 *   - getForeignCareerStints (allt annat, `player_career_stint`)
 *   - player_transfer_event (VARJE övergångshändelse, inte bara den
 *     senaste — se migration 20260822160000) för att annotera VILKEN
 *     övergång som förde spelaren till varje klubbperiod, med riktig
 *     typ/summa när den finns.
 *
 * Klubbperioder byggs av SAMMANHÄNGANDE säsonger vid samma klubb (samma
 * grupperingsprincip som CareerTimelineSection.tsx:s "Klubb"-flik) — ett
 * uppehåll (spelaren lämnade och kom tillbaka, se J. Bager-exemplet i
 * research-underlaget) blir alltså två separata steg i resan, korrekt.
 *
 * "leftAllsvenskan": den FÖRSTA icke-Allsvenska perioden som kommer
 * kronologiskt EFTER en Allsvensk period — null om spelaren aldrig lämnat
 * (eller om vi bara har Allsvensk data importerad för hen).
 */

export interface TransferInfo {
  date: string;
  type: string | null;
  fromTeamName: string | null;
}

export interface CareerJourneyStep {
  teamName: string;
  teamLogoUrl: string | null;
  /** null = Allsvenskan (implicit Sverige). Satt för allt annat. */
  leagueCountry: string | null;
  isAllsvenskan: boolean;
  startYear: number;
  endYear: number;
  appearances: number;
  goals: number;
  assists: number;
  /** Övergången som förde spelaren TILL den här klubben — null för den allra första kända klubben (ingen tidigare övergång registrerad). */
  arrivedVia: TransferInfo | null;
}

export interface CareerJourney {
  steps: CareerJourneyStep[]; // kronologisk ordning, äldst först
  /** Index i `steps` för den FÖRSTA perioden efter Allsvenskan — null om spelaren aldrig lämnat (vad vi vet). */
  leftAllsvenskanAtStepIndex: number | null;
  /** Senaste kända säsong/år med data överhuvudtaget — ALDRIG tolkat som "karriären slut", bara "det här är vad vi har". */
  lastKnownYear: number | null;
}

interface UnifiedStint {
  seasonYear: number;
  teamName: string;
  teamLogoUrl: string | null;
  teamExternalId: number | null;
  leagueCountry: string | null;
  isAllsvenskan: boolean;
  appearances: number;
  goals: number;
  assists: number;
}

interface TransferEventRow {
  transfer_date: string;
  from_team_name: string | null;
  to_team_external_id: number | null;
  transfer_type: string | null;
}


export async function getCareerJourney(supabase: Supabase, params: { playerId: number }): Promise<CareerJourney> {
  const [domesticEntries, foreignStints, transferEventsResult] = await Promise.all([
    getCareerTimeline(supabase, { playerId: params.playerId }),
    getForeignCareerStints(supabase, { playerId: params.playerId }),
    // Felresistent (samma skäl som övriga Fas 17/18-frågor): migration
    // 20260822160000 kan vara okörd, eller spelaren ännu inte omimporterad
    // sedan tabellen skapades — en tom lista här, aldrig ett krasch.
    supabase
      .from("player_transfer_event")
      .select("transfer_date, from_team_name, to_team_external_id, transfer_type")
      .eq("player_id", params.playerId)
      .order("transfer_date", { ascending: true })
      .returns<TransferEventRow[]>()
      .then(
        (r) => r.data ?? [],
        () => []
      ),
  ]);

  // "Fortfarande vid en Allsvensk klubb" avgörs av KLUBBIDENTITET (normaliserat
  // namn), INTE av vilken tävling raden kom ifrån — annars ser Svenska
  // Cupen-matcher för samma Allsvenska klubb ut som att spelaren lämnat.
  const allsvenskaClubNames = new Set(domesticEntries.map((e) => normalizeTeamName(e.teamName)));

  const unified: UnifiedStint[] = [
    ...domesticEntries.map((e) => ({
      seasonYear: e.seasonYear,
      teamName: e.teamName,
      teamLogoUrl: e.teamLogoUrl,
      teamExternalId: e.teamExternalId,
      leagueCountry: null,
      isAllsvenskan: true,
      appearances: e.appearances,
      goals: e.goals,
      assists: e.assists,
    })),
    ...foreignStints.map((f) => ({
      seasonYear: f.seasonYear,
      teamName: f.teamName,
      teamLogoUrl: f.teamLogoUrl,
      teamExternalId: f.teamExternalId,
      leagueCountry: f.leagueCountry,
      isAllsvenskan: allsvenskaClubNames.has(normalizeTeamName(f.teamName)),
      appearances: f.appearances ?? 0,
      goals: f.goals ?? 0,
      assists: f.assists ?? 0,
    })),
  ].sort((a, b) => a.seasonYear - b.seasonYear);

  if (unified.length === 0) return { steps: [], leftAllsvenskanAtStepIndex: null, lastKnownYear: null };

  // Gruppera per (klubb-IDENTITET, sammanhängande årsintervall) — samma
  // princip som CareerTimelineSection.tsx:s groupByClub, men nu EN
  // gemensam kronologisk lista över hela karriären istället för två
  // separata flikar, och grupperat på NORMALISERAT namn (se ovan).
  const steps: CareerJourneyStep[] = [];
  let i = 0;
  while (i < unified.length) {
    const teamKey = normalizeTeamName(unified[i].teamName);
    const displayTeam = unified[i]; // första posten avgör visningsnamn/logga — de är samma klubb ändå
    let j = i;
    let endYear = unified[i].seasonYear;
    let appearances = 0;
    let goals = 0;
    let assists = 0;
    let teamExternalId: number | null = null;
    // Representativ land-etikett: föredra den posten med FLEST matcher —
    // en enstaka "Friendlies Clubs"-rad (land="World") ska inte få styra
    // etiketten om samma grupp också har riktiga ligamatcher.
    let bestCountryEntry: UnifiedStint = unified[i];
    while (j < unified.length && normalizeTeamName(unified[j].teamName) === teamKey && unified[j].seasonYear <= endYear + 1) {
      endYear = unified[j].seasonYear;
      appearances += unified[j].appearances;
      goals += unified[j].goals;
      assists += unified[j].assists;
      teamExternalId = unified[j].teamExternalId ?? teamExternalId;
      if (unified[j].appearances > bestCountryEntry.appearances) bestCountryEntry = unified[j];
      j++;
    }
    const startYear = unified[i].seasonYear;

    const arrivingTransfer = teamExternalId
      ? transferEventsResult.find((t) => t.to_team_external_id === teamExternalId && new Date(t.transfer_date).getUTCFullYear() <= startYear + 1)
      : undefined;

    steps.push({
      teamName: displayTeam.teamName,
      teamLogoUrl: displayTeam.teamLogoUrl,
      leagueCountry: bestCountryEntry.leagueCountry,
      isAllsvenskan: unified[i].isAllsvenskan,
      startYear,
      endYear,
      appearances,
      goals,
      assists,
      arrivedVia: arrivingTransfer
        ? { date: arrivingTransfer.transfer_date, type: arrivingTransfer.transfer_type, fromTeamName: arrivingTransfer.from_team_name }
        : null,
    });
    i = j;
  }

  const firstForeignIndex = steps.findIndex((s, idx) => !s.isAllsvenskan && idx > 0 && steps[idx - 1].isAllsvenskan);
  const leftAllsvenskanAtStepIndex = firstForeignIndex >= 0 ? firstForeignIndex : steps.some((s) => !s.isAllsvenskan) && !steps[0].isAllsvenskan ? -1 : null;

  return {
    steps,
    // -1 (spelaren har BARA icke-Allsvensk data importerad, ingen känd
    // Allsvensk period före den) visas inte som en "lämnade"-milstolpe i
    // UI:t — bara en genuin Allsvenskan→utland-övergång räknas.
    leftAllsvenskanAtStepIndex: leftAllsvenskanAtStepIndex === -1 ? null : leftAllsvenskanAtStepIndex,
    lastKnownYear: Math.max(...steps.map((s) => s.endYear)),
  };
}
