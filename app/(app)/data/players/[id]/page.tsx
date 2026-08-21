import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfile, FootballDataError } from "@/lib/football/tools";
import { computePlayerDNA } from "@/lib/football/player-dna";
import { computeAdvancedPlayerDNA } from "@/lib/football/advanced-dna";
import { computeRatingForPlayer } from "@/lib/football/rating/compute-rating";
import { getPlayerRatingHistory } from "@/lib/football/rating/rating-store";
import { buildRatingTrendSummary } from "@/lib/football/rating/rating-trend";
import { PlayerRatingHistory } from "@/components/data/PlayerRatingHistory";
import { getPlayerLineupRoleProfile } from "@/lib/football/lineup-role";
import { calculateAge } from "@/lib/football/age";
import { StatBar } from "@/components/data/StatBar";
import { PlayerRadarChart } from "@/components/data/PlayerRadarChart";
import { PlayerDNA } from "@/components/data/PlayerDNA";
import { AdvancedDNA } from "@/components/data/AdvancedDNA";
import { PlayerRating } from "@/components/data/PlayerRating";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { BackButton } from "@/components/nav/BackButton";
import { translatePosition } from "@/lib/i18n/sv";

function na(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value}${suffix}`;
}

export default async function PlayerProfilePage({
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
  // Fas 9 (Sportmonks-integrationen): separat avancerat DNA-lager, bara
  // 2024-2026 — se lib/football/advanced-dna.ts. Komponenten döljer sig
  // själv helt (returnerar null) om spelaren/säsongen saknar täckning.
  const advancedDna =
    profile.season && [2024, 2025, 2026].includes(profile.season)
      ? await computeAdvancedPlayerDNA(supabase, { playerId: profile.player.id, season: profile.season })
      : null;
  // Player Rating (2026-08-21): separat statistisk 0-99-OVR, INTE samma sak
  // som Player DNA (DNA = vilken typ av spelare, Rating = hur bra
  // presterade den här säsongen) — se lib/football/rating/compute-rating.ts.
  const rating = profile.season
    ? await computeRatingForPlayer(supabase, {
        playerId: profile.player.id,
        position: profile.player.position,
        season: profile.season,
      })
    : null;
  // Utveckling (2026-08-21): historik ur player_season_rating-facit, INTE
  // live-beräknat — komplement till (aldrig ersättning för) OVR-kortet ovan
  // som visar spelarens NUVARANDE valda säsong.
  const ratingHistory = await getPlayerRatingHistory(supabase, profile.player.id);
  const ratingTrend = buildRatingTrendSummary(ratingHistory);

  // Steg 9: lineup-härledd rolldata (start/avbytarlistningar, formation) —
  // egen från fixture_lineup_player, oberoende av Player DNA. season.id
  // (inte året) krävs av lib/football/lineup-role.ts, samma uppslag som
  // team-dna.ts redan gör.
  let lineupRole: Awaited<ReturnType<typeof getPlayerLineupRoleProfile>> = null;
  if (profile.season) {
    const { data: seasonRow } = await supabase.from("season").select("id").eq("year", profile.season).maybeSingle();
    if (seasonRow) {
      lineupRole = await getPlayerLineupRoleProfile(supabase, { playerId: profile.player.id, seasonId: seasonRow.id });
    }
  }
  // Bara första meningen i hjälten — hela sammanfattningen visas redan i
  // Player DNA-kortet direkt nedanför, så en full dubblering här vore bara
  // repetition, inte en teaser.
  const heroQuote = dna?.summary ? dna.summary.split(". ")[0].replace(/\.$/, "") + "." : null;

  const grundstatistikRows = (
    [
      ["Minuter", profile.stats.minutesPlayed],
      ["Gula", profile.stats.yellowCards],
      ["Röda", profile.stats.redCards],
      ["Skott", profile.stats.shotsTotal],
      ["På mål", profile.stats.shotsOnTarget],
      ["Pass-säkerhet", profile.stats.passesAccuracy],
    ] as const
  ).filter(([, value]) => value !== null);

  // Paneler döljs helt om alla deras mått saknas — en panel med bara en
  // rubrik och tomma rader ser trasigare ut än att den inte fanns alls.
  const hasAnfall = [
    profile.per90.goals,
    profile.per90.assists,
    profile.per90.passesKey,
    profile.per90.shotsTotal,
    profile.per90.dribblesSuccess,
  ].some((v) => v !== null);
  const hasPassningsspel = profile.per90.passesTotal !== null || profile.stats.passesAccuracy !== null;
  const hasDuellspel = profile.per90.duelsWon !== null || profile.duelsWinRate !== null;
  const hasForsvar = [profile.per90.tacklesTotal, profile.per90.tacklesBlocks, profile.per90.tacklesInterceptions].some(
    (v) => v !== null
  );
  // "Snitt anfallare" i StatBar-tooltips — positionsspecifikt, aldrig ett
  // hårdkodat "ligasnitt" (se lib/football/position-group.ts).
  const peerLabel = `Snitt ${profile.peerGroup.label}`;

  return (
    <div>
      <BackButton href="/data/players" label="Alla spelare" />

      {/* Bio-kort */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <PlayerAvatar
          name={profile.player.name}
          teamExternalId={profile.player.team?.external_id}
          size={72}
          photoUrl={profile.player.photoUrl}
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{profile.player.name}</h1>
          <p className="mt-0.5 text-sm text-[#c3c2b7]">
            {profile.player.team?.name ?? "—"}{" "}
            {profile.player.position && `· ${translatePosition(profile.player.position)}`}
            {age !== null && ` · ${age} år`}
            {profile.player.nationality && ` · ${profile.player.nationality}`}
          </p>
          {/* Öppningsraden i "scoutingrapporten" — första meningen av
              Player DNA:s sammanfattning, som en teaser till kortet
              nedanför. */}
          {heroQuote && <p className="mt-1.5 text-sm italic text-[#898781]">&ldquo;{heroQuote}&rdquo;</p>}
        </div>

        {/* Säsongsväljare */}
        <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          {profile.availableSeasons.map((y) => (
            <Link
              key={y}
              href={`/data/players/${id}?season=${y}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                y === profile.season ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      {/* Player Rating — statistisk 0-99-OVR, ett eget kort SKILT från
          Player DNA (Rating = hur bra presterade säsongen, DNA = vilken typ
          av spelare) för att inte blanda ihop de två frågorna. */}
      {rating && profile.season && (
        <div className="mt-4">
          <PlayerRating data={rating} season={profile.season} />
        </div>
      )}

      {/* Utveckling — historisk OVR/trend/toppsäsong, komplement till
          nuvarande-säsong-kortet ovan, aldrig en ersättning för det. */}
      <div className="mt-4">
        <PlayerRatingHistory history={ratingHistory} trend={ratingTrend} />
      </div>

      {/* Player DNA — flyttad högst upp: det här är analysen, inte en
          detalj längst ner på sidan. */}
      {dna && (
        <div className="mt-4">
          <PlayerDNA dna={dna} />
        </div>
      )}

      {/* Avancerad DNA (Fas 9, Sportmonks 2024+) — döljer sig själv helt om
          spelaren/säsongen saknar täckning, inget villkor behövs här. */}
      {advancedDna && (
        <div className="mt-4">
          <AdvancedDNA dna={advancedDna} />
        </div>
      )}

      {/* Roll i laget — lineup-härledd (steg 9), oberoende av Player DNA:s
          statistikbaserade analys. Visas bara om vi har minst en sparad
          laguppställning för spelaren den säsongen. */}
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

      {/* Hero-siffror */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Mål", profile.stats.goals],
          ["Assist", profile.stats.assists],
          ["Matcher", profile.stats.appearances],
          // "Snittbetyg (matcher)" — API-Football:s egna råa matchbetyg
          // (profile.stats.rating), INTE samma tal som Player Ratings OVR
          // ovan. Namnbytet är avsiktligt (2026-08-21) för att undvika
          // exakt den sammanblandning en ny OVR-siffra annars hade skapat.
          ["Snittbetyg (matcher)", profile.stats.rating],
        ].map(([label, value]) => (
          <div
            key={label as string}
            className="rounded-xl border border-white/10 bg-[#1a1a19] p-4 text-center"
          >
            <p className="text-3xl font-semibold tabular-nums">{na(value as number | null)}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-[#898781]">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Grundstatistik */}
        <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Grundstatistik — {profile.season}</h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {grundstatistikRows.map(([label, value]) => (
              <div key={label}>
                <p className="text-lg font-semibold">{na(value)}</p>
                <p className="text-[10px] text-[#898781]">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Radardiagram */}
        <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
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

      {/* Per-90-statistik, grupperad i paneler à la analysverktyg — stödjande
          detalj under DNA-analysen, en panel visas bara om den faktiskt har
          något mått att visa. */}
      {(hasAnfall || hasPassningsspel || hasDuellspel || hasForsvar) && (
        <div className="mt-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Detaljerad statistik</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {hasAnfall && (
            <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
              <h2 className="text-sm font-semibold">Anfall</h2>
              <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = snitt {profile.peerGroup.label}</p>
              <StatBar
                label="Mål"
                value={profile.per90.goals}
                peerAverage={profile.positionAveragePer90.goals}
                peerLabel={peerLabel}
              />
              <StatBar
                label="Assist"
                value={profile.per90.assists}
                peerAverage={profile.positionAveragePer90.assists}
                peerLabel={peerLabel}
              />
              <StatBar
                label="Nyckelpassningar"
                value={profile.per90.passesKey}
                peerAverage={profile.positionAveragePer90.passesKey}
                peerLabel={peerLabel}
              />
              <StatBar label="Skott" value={profile.per90.shotsTotal} peerAverage={null} />
              <StatBar label="Skott på mål" value={profile.per90.shotsOnTarget} peerAverage={null} />
              <StatBar
                label="Lyckade dribblingar"
                value={profile.per90.dribblesSuccess}
                peerAverage={profile.positionAveragePer90.dribblesSuccess}
                peerLabel={peerLabel}
              />
            </div>
          )}

          {hasPassningsspel && (
            <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
              <h2 className="text-sm font-semibold">Passningsspel</h2>
              <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = snitt {profile.peerGroup.label}</p>
              <StatBar
                label="Passningar"
                value={profile.per90.passesTotal}
                peerAverage={profile.positionAveragePer90.passesTotal}
                peerLabel={peerLabel}
              />
              <StatBar
                label="Passningssäkerhet"
                value={profile.stats.passesAccuracy}
                peerAverage={null}
                suffix="%"
              />
            </div>
          )}

          {hasDuellspel && (
            <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
              <h2 className="text-sm font-semibold">Duellspel</h2>
              <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = snitt {profile.peerGroup.label}</p>
              <StatBar
                label="Vunna dueller"
                value={profile.per90.duelsWon}
                peerAverage={profile.positionAveragePer90.duelsWon}
                peerLabel={peerLabel}
              />
              <StatBar label="Vinstprocent" value={profile.duelsWinRate} peerAverage={null} suffix="%" />
            </div>
          )}

          {hasForsvar && (
            <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
              <h2 className="text-sm font-semibold">Försvar</h2>
              <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = snitt {profile.peerGroup.label}</p>
              <StatBar
                label="Tacklingar"
                value={profile.per90.tacklesTotal}
                peerAverage={profile.positionAveragePer90.tacklesTotal}
                peerLabel={peerLabel}
              />
              <StatBar label="Blockeringar" value={profile.per90.tacklesBlocks} peerAverage={null} />
              <StatBar
                label="Interceptions"
                value={profile.per90.tacklesInterceptions}
                peerAverage={profile.positionAveragePer90.tacklesInterceptions}
                peerLabel={peerLabel}
              />
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
