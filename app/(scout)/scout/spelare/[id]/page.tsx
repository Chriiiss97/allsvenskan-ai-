import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfile, FootballDataError } from "@/lib/football/tools";
import { computePlayerDNA } from "@/lib/football/player-dna";
import { computeAdvancedPlayerDNA } from "@/lib/football/advanced-dna";
import { computeRatingForPlayer } from "@/lib/football/rating/compute-rating";
import { getPlayerRatingHistory } from "@/lib/football/rating/rating-store";
import { buildRatingTrendSummary } from "@/lib/football/rating/rating-trend";
import { computeAdvancedDevelopment } from "@/lib/football/rating/advanced-development";
import { PlayerRatingHistory } from "@/components/data/PlayerRatingHistory";
import { AdvancedDevelopment } from "@/components/data/AdvancedDevelopment";
import { getPlayerLineupRoleProfile } from "@/lib/football/lineup-role";
import { calculateAge } from "@/lib/football/age";
import { PlayerRadarChart } from "@/components/data/PlayerRadarChart";
import { PlayerDNA } from "@/components/data/PlayerDNA";
import { AdvancedDNA } from "@/components/data/AdvancedDNA";
import { PlayerRating } from "@/components/data/PlayerRating";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { translatePosition } from "@/lib/i18n/sv";
import { addToShortlist, removeFromShortlist } from "../../shortlist/actions";
import { computeAgeAdjustedZScores } from "@/lib/football/rating/scout-intelligence-zscore";
import { computeConsistencyCoefficients } from "@/lib/football/rating/scout-intelligence-consistency";
import { computeRegressionToMean } from "@/lib/football/rating/scout-intelligence-regression";
import { ScoutIntelligenceCard } from "@/components/scout/ScoutIntelligenceCard";

/**
 * Fas 14.4 (plans/humble-giggling-biscuit.md) — Scouts FULLA spelarprofil.
 * Innehållet här är exakt det som Fas 14.3 tog bort från den gratis
 * /spelare/[id] (samma "flytt, inte kopiering"-princip som Lag-DNA):
 * Player Rating med full kategori-/kontributionsnedbrytning,
 * Utveckling (OVR-historik), "varför" (Fas 12), Player DNA, Advancerad
 * DNA (Sportmonks 2024+) och percentil-radarn. Grundstatistik (bio,
 * hero-siffror, per-90-paneler, roll i laget) stannar KVAR gratis på
 * /spelare/[id] — den sidan länkar hit via en Scout-CTA.
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

  const age = calculateAge(profile.player.birthDate);
  const dna = profile.season ? await computePlayerDNA(supabase, { playerId: profile.player.id, season: profile.season }) : null;
  const advancedDna =
    profile.season && [2024, 2025, 2026].includes(profile.season)
      ? await computeAdvancedPlayerDNA(supabase, { playerId: profile.player.id, season: profile.season })
      : null;
  const advancedDevelopment = await computeAdvancedDevelopment(supabase, { playerId: profile.player.id });
  const rating = profile.season
    ? await computeRatingForPlayer(supabase, {
        playerId: profile.player.id,
        position: profile.player.position,
        season: profile.season,
      })
    : null;
  const ratingHistory = await getPlayerRatingHistory(supabase, profile.player.id);
  const ratingTrend = buildRatingTrendSummary(ratingHistory);

  let lineupRole: Awaited<ReturnType<typeof getPlayerLineupRoleProfile>> = null;
  if (profile.season) {
    const { data: seasonRow } = await supabase.from("season").select("id").eq("year", profile.season).maybeSingle();
    if (seasonRow) {
      lineupRole = await getPlayerLineupRoleProfile(supabase, { playerId: profile.player.id, seasonId: seasonRow.id });
    }
  }
  const heroQuote = dna?.summary ? dna.summary.split(". ")[0].replace(/\.$/, "") + "." : null;

  // Scout Intelligence (separat mini-fas, 2026-08-22) — tre kompletterande
  // mått, se lib/football/rating/scout-intelligence-*.ts. Batch-funktioner
  // (hela ligan i en genomgång) — slår bara upp DEN HÄR spelaren ur
  // resultatet, samma mönster som resten av Scout-lagret (aldrig N+1).
  let zScoreResult = null;
  let consistencyResult = null;
  let regressionResult = null;
  if (profile.season) {
    const { data: seasonForIntelligence } = await supabase.from("season").select("id").eq("year", profile.season).maybeSingle();
    if (seasonForIntelligence) {
      const [zScores, consistencies, regression] = await Promise.all([
        computeAgeAdjustedZScores(supabase, { seasonId: seasonForIntelligence.id, seasonYear: profile.season }),
        computeConsistencyCoefficients(supabase, { seasonId: seasonForIntelligence.id }),
        computeRegressionToMean(supabase, { currentSeasonYear: profile.season }),
      ]);
      zScoreResult = zScores.get(profile.player.id) ?? null;
      consistencyResult = consistencies.get(profile.player.id) ?? null;
      regressionResult = regression.results.get(profile.player.id) ?? null;
    }
  }

  // Shortlist — stjärnmärkt eller inte för den inloggade användaren
  // (RLS-scopad, se migration 20260822120000_scout_shortlist.sql).
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  return (
    <div>
      <Link href="/scout/spelare" className="text-xs text-[#898781] hover:text-white">
        ← Scout
      </Link>

      {/* Bio-kort */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <PlayerAvatar
          name={profile.player.name}
          teamExternalId={profile.player.team?.external_id}
          size={72}
          photoUrl={profile.player.photoUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{profile.player.name}</h1>
            <form action={isShortlisted ? removeFromShortlist : addToShortlist}>
              <input type="hidden" name="playerId" value={profile.player.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                title={isShortlisted ? "Ta bort från shortlist" : "Lägg till i shortlist"}
                className={`text-lg leading-none transition-colors ${isShortlisted ? "text-[#d9a526]" : "text-[#5f5e59] hover:text-[#d9a526]"}`}
              >
                {isShortlisted ? "★" : "☆"}
              </button>
            </form>
          </div>
          <p className="mt-0.5 text-sm text-[#c3c2b7]">
            {profile.player.team?.name ?? "—"}{" "}
            {profile.player.position && `· ${translatePosition(profile.player.position)}`}
            {age !== null && ` · ${age} år`}
            {profile.player.nationality && ` · ${profile.player.nationality}`}
          </p>
          {heroQuote && <p className="mt-1.5 text-sm italic text-[#898781]">&ldquo;{heroQuote}&rdquo;</p>}
          <Link href={`/spelare/${id}`} className="mt-1.5 inline-block text-xs text-[#3987e5] hover:underline">
            Grundstatistik (gratis profil) →
          </Link>
        </div>

        {/* Säsongsväljare */}
        <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          {profile.availableSeasons.map((y) => (
            <Link
              key={y}
              href={`/scout/spelare/${id}?season=${y}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                y === profile.season ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      {rating && profile.season && (
        <div className="mt-4">
          <PlayerRating data={rating} season={profile.season} />
        </div>
      )}

      <div className="mt-4">
        <PlayerRatingHistory history={ratingHistory} trend={ratingTrend} />
      </div>

      {advancedDevelopment.available && (
        <div className="mt-4">
          <AdvancedDevelopment development={advancedDevelopment} />
        </div>
      )}

      <div className="mt-4">
        <ScoutIntelligenceCard zScore={zScoreResult} consistency={consistencyResult} regression={regressionResult} />
      </div>

      {dna && (
        <div className="mt-4">
          <PlayerDNA dna={dna} />
        </div>
      )}

      {advancedDna && (
        <div className="mt-4">
          <AdvancedDNA dna={advancedDna} />
        </div>
      )}

      {lineupRole && (
        <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Roll i laget — {profile.season}</h2>
          <div className="mt-3 flex flex-wrap justify-center gap-x-8 gap-y-3 text-center sm:justify-start sm:text-left">
            <div>
              <p className="text-lg font-semibold text-white">{lineupRole.starts}</p>
              <p className="text-[10px] uppercase tracking-wide text-[#898781]">Startelva</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{lineupRole.substituteListings}</p>
              <p className="text-[10px] uppercase tracking-wide text-[#898781]">Avbytarlistad</p>
            </div>
            {lineupRole.mostCommonFormation && (
              <div>
                <p className="text-lg font-semibold text-white">{lineupRole.mostCommonFormation}</p>
                <p className="text-[10px] uppercase tracking-wide text-[#898781]">Vanligaste formation</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <h2 className="text-sm font-semibold">Jämförelse mot positionssnitt</h2>
        <div className="mt-3">
          <PlayerRadarChart
            per90={profile.per90}
            positionAveragePer90={profile.positionAveragePer90}
            peerGroup={profile.peerGroup}
          />
        </div>
      </div>
    </div>
  );
}
