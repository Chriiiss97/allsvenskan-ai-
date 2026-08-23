import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPlayerProfile, FootballDataError } from "@/lib/football/tools";
import { PlayerRating } from "@/components/data/PlayerRating";
import { calculateAge, ageAtSeason } from "@/lib/football/age";
import { translatePosition } from "@/lib/i18n/sv";
import { addToShortlist, removeFromShortlist } from "../../shortlist/actions";
import { getPositionGroup } from "@/lib/football/position-group";
import { getFastPlayerCardData } from "@/lib/football/player-card-data";
import { PlayerCardHeader } from "@/components/scout/player-card/PlayerCardHeader";
import { PlayerSnapshot, type SnapshotRow } from "@/components/scout/player-card/PlayerSnapshot";
import { ContextBanner } from "@/components/scout/player-card/ContextBanner";
import { PlayerCardHeavySections } from "@/components/scout/player-card/PlayerCardHeavySections";
import { PlayerCardSkeleton } from "@/components/scout/player-card/PlayerCardSkeleton";
import { TransferFlagBanner } from "@/components/data/TransferFlagBanner";
import Link from "next/link";

/**
 * Fas 15 (plans/humble-giggling-biscuit.md) — Complete Scout Player Card.
 * Ombyggd från en lodrät kort-stapel (Fas 14.4) till en sammanhållen
 * produkt: Header → Snapshot → Identity → Performance/Context → Career →
 * Development → Percentiler → Scout Insight → Jämför.
 *
 * PRESTANDAFIX, del 3 (2026-08-22, se lib/football/player-card-data.ts:s
 * filhuvud för hela resonemanget): sidan hämtar bara den BILLIGA
 * delmängden (OVR, huvudarketyp, tabellplacering — alla <1s) synkront här
 * och renderar Header/Snapshot/Context/OVR-kortet direkt. Allt annat (DNA,
 * Advancerad DNA, Development, Scout Intelligence, matchlogg,
 * karriärtidslinje, percentiler, Scout Insight — de TUNGA modulerna,
 * 0,5–3+ sekunder var) körs i `PlayerCardHeavySections` bakom en
 * `<Suspense>`-gräns och streamas in när de är klara, istället för att
 * blockera hela sidans första byte i flera sekunder.
 */

export default async function ScoutPlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { id } = await params;
  const { season } = await searchParams;
  const supabase = await createClient();

  let profile;
  try {
    profile = await getPlayerProfile(supabase, {
      player: id,
      season: season ? Number(season) : undefined,
    });
  } catch (err) {
    if (err instanceof FootballDataError) notFound();
    throw err;
  }

  // Fas 17 — åldern ska stämma med säsongen man tittar på, inte dagens
  // datum (samma fix som /spelare/[id], se lib/football/age.ts).
  const age = profile.season ? ageAtSeason(profile.player.birthDate, profile.season) : calculateAge(profile.player.birthDate);
  const positionGroupInfo = getPositionGroup(profile.player.position);
  const isGoalkeeper = positionGroupInfo?.group === "goalkeeper";

  const [fastData, authResult] = await Promise.all([
    getFastPlayerCardData(
      profile.player.id,
      profile.season,
      profile.player.position,
      profile.player.team?.id ?? null,
      profile.player.team?.name ?? null
    ),
    // Redan hämtad av app/(scout)/layout.tsx — request-lokalt delad
    // (lib/auth/session.ts), så det här är inte ett andra nätverksanrop.
    getCurrentUser(),
  ]);
  const { rating, mainArchetypeLabel, standingsLabel } = fastData;
  const user = authResult;

  // Shortlist — beror på `user` ovan, så den kan inte vara med i samma våg;
  // ett enda indexerat enradsuppslag, försumbar kostnad som sista steget.
  let isShortlisted = false;
  if (user) {
    const { data: shortlistRow } = await supabase
      .from("scout_shortlist_player")
      .select("player_id")
      .eq("user_id", user.id)
      .eq("player_id", profile.player.id)
      .maybeSingle();
    isShortlisted = !!shortlistRow;
  }
  const returnTo = `/scout/spelare/${id}${profile.season ? `?season=${profile.season}` : ""}`;

  // --- Snapshot (positionsanpassad, se plans/humble-giggling-biscuit.md §4) ---
  const ovrValue = rating?.rating.available ? rating.rating.ovr : null;
  // Fas 15-fixning (2026-08-22): Player Rating/GoalkeeperRatings EGNA
  // confidence — INTE dna?.confidence (alltid null för målvakter, eftersom
  // ingen DNA-profil finns för dem) och INTE regressionens confidence (ett
  // annat begrepp: antal TIDIGARE säsonger, inte årets speltid). Verkligt
  // fall som avslöjade buggen: E. Berisha (målvakt) fick OVR 99 på bara 1
  // match/90 minuter 2026, men ingen varning visades. Se
  // PlayerCardHeader.tsx för samma fix på själva OVR-badgen.
  const ratingConfidenceTier = rating?.rating.available ? (rating.rating.confidence?.tier ?? null) : null;
  const ratingOwnMinutes = rating?.rating.available ? (rating.rating.confidence?.ownMinutes ?? null) : null;
  const snapshotRows: SnapshotRow[] = [];
  if (ovrValue !== null) snapshotRows.push({ label: "OVR", value: String(ovrValue) });
  if (age !== null) snapshotRows.push({ label: "Ålder", value: String(age) });
  snapshotRows.push({ label: "Matcher", value: String(profile.stats.appearances) });
  snapshotRows.push({ label: "Minuter", value: String(profile.stats.minutesPlayed) });

  if (isGoalkeeper && rating?.kind === "goalkeeper" && rating.rating.available) {
    const gk = rating.rating;
    const savePct = gk.metrics.find((m) => m.key === "savePct")?.playerValue;
    const gcPer90 = gk.metrics.find((m) => m.key === "goalsConcededPer90")?.playerValue;
    const csPct = gk.metrics.find((m) => m.key === "cleanSheetPct")?.playerValue;
    if (savePct !== undefined) snapshotRows.push({ label: "Räddningsprocent", value: `${savePct}%` });
    if (gcPer90 !== undefined) snapshotRows.push({ label: "Insläppta/90", value: String(gcPer90) });
    if (csPct !== undefined) snapshotRows.push({ label: "Clean sheet", value: `${csPct}%` });
  } else if (!isGoalkeeper) {
    snapshotRows.push({ label: "Mål", value: String(profile.stats.goals) });
    snapshotRows.push({ label: "Assist", value: String(profile.stats.assists) });
  }

  return (
    <div className="space-y-4">
      <Link href="/scout/spelare" className="text-xs text-[#898781] hover:text-white">
        ← Scout
      </Link>

      <PlayerCardHeader
        name={profile.player.name}
        photoUrl={profile.player.photoUrl}
        teamExternalId={profile.player.team?.external_id}
        teamName={profile.player.displayTeamName}
        position={profile.player.position}
        age={age}
        nationality={profile.player.nationality}
        ovr={ovrValue}
        ovrConfidenceTier={ratingConfidenceTier}
        ovrConfidenceMinutes={ratingOwnMinutes}
        mainArchetypeLabel={mainArchetypeLabel}
        isShortlisted={isShortlisted}
        shortlistAction={isShortlisted ? removeFromShortlist : addToShortlist}
        playerId={profile.player.id}
        returnTo={returnTo}
        availableSeasons={profile.availableSeasons}
        season={profile.season}
        freeProfileHref={`/spelare/${id}${profile.season ? `?season=${profile.season}` : ""}`}
      />

      {profile.player.hasLeftCurrentTeam && (
        <TransferFlagBanner
          previousTeamName={profile.player.team?.name ?? null}
          teamName={profile.player.latestTransferTeamName}
          teamLogoUrl={profile.player.latestTransferTeamLogoUrl}
          transferDate={profile.player.latestTransferDate}
          transferType={profile.player.latestTransferType}
        />
      )}

      <PlayerSnapshot rows={snapshotRows} confidence={ratingConfidenceTier} />

      <ContextBanner
        confidence={ratingConfidenceTier}
        appearances={profile.stats.appearances}
        minutesPlayed={profile.stats.minutesPlayed}
        season={profile.season}
        standingsLabel={standingsLabel}
      />

      {/* Performance — Player Rating-nedbrytningen (positionsanpassad redan
          via computeRatingForPlayer/PlayerRating.tsx: målvakt får sin egen
          3-måttsmodell, utespelare shooting/passing/dribbling/defending).
          Del av den SNABBA datan (redan hämtad ovan), renderas direkt. */}
      {rating && profile.season && <PlayerRating data={rating} season={profile.season} />}

      {/* Allt tungt (DNA/Advancerad DNA/Development/Scout Intelligence/
          matchlogg/karriär/percentiler/Scout Insight) — streamas in när
          klart, blockerar aldrig första sidladdningen. */}
      <Suspense fallback={<PlayerCardSkeleton />}>
        <PlayerCardHeavySections profile={profile} isGoalkeeper={isGoalkeeper} />
      </Suspense>

      <Link
        href={`/scout/compare?mode=spelare&a=${profile.player.id}${profile.season ? `&season=${profile.season}` : ""}`}
        className="flex items-center justify-between gap-3 rounded-xl border border-[#a78bfa]/30 bg-[#a78bfa]/10 p-4 text-sm transition-colors hover:bg-[#a78bfa]/15"
      >
        <span>
          <span className="font-semibold text-[#a78bfa]">🔍 Jämför spelaren</span>
          <span className="ml-1 text-[#c3c2b7]">— välj en annan spelare att jämföra mot.</span>
        </span>
        <span className="text-[#a78bfa]">→</span>
      </Link>

      <p className="pt-1 text-center text-[10px] text-[#5f5e59]">
        {translatePosition(profile.player.position ?? "")} · Player Card visar all verifierad data vi har — se varje sektions
        egen text för underlag och tolkning.
      </p>
    </div>
  );
}
