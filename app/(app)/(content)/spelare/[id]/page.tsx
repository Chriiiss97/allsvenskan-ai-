import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfile, FootballDataError } from "@/lib/football/tools";
import { displayHint, getPlayerOvr } from "@/lib/ovr/store";
import { getPlayerLineupRoleProfile } from "@/lib/football/lineup-role";
import { getPlayerMatchLog } from "@/lib/football/player-match-log";
import { getCareerTimeline, getForeignCareerStints } from "@/lib/football/career-timeline";
import { getCareerJourney } from "@/lib/football/career-journey";
import { getPlayerTrophies } from "@/lib/football/player-trophies";
import { buildPlayerSummary } from "@/lib/football/player-summary";
import { calculateAge, ageAtSeason } from "@/lib/football/age";
import { StatBar } from "@/components/data/StatBar";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { PlayerRadarChart } from "@/components/data/PlayerRadarChart";
import { TransferFlagBanner } from "@/components/data/TransferFlagBanner";
import { CareerJourneySection } from "@/components/scout/player-card/CareerJourneySection";
import { CareerTimelineSection } from "@/components/scout/player-card/CareerTimelineSection";
import { PlayerTrophiesSection } from "@/components/scout/player-card/PlayerTrophiesSection";
import { MatchLogSection } from "@/components/scout/player-card/MatchLogSection";
import { BackButton } from "@/components/nav/BackButton";
import { translatePosition, translateNationality } from "@/lib/i18n/sv";
import { ovrColor } from "@/lib/ovr/color";

/**
 * Fas 18c (2026-08-22) — FULL ombyggnad av den fria spelarprofilen, efter
 * ett uttryckligt 22-punktsbrief: "Spelare → [Spelare] ska vara hela
 * spelarens fotbollsliv, inte en liten statistiksida. Scout = avancerad
 * analys av SAMMA spelare, inte en separat profil." Karriärresan/Klubb-
 * Säsong/Troféer/Matchlogg/Radar-tooltip byggdes ALLA ursprungligen för
 * Scout (Fas 15/17/18) — samma komponenter/datafunktioner återanvänds här
 * rakt av (components/scout/player-card/*, trots mappnamnet — de är rena
 * presentationskomponenter utan någon Scout-spärr inbyggd), exakt som
 * "återanvänd befintlig data, bygg inte dubbla system" krävde.
 *
 * KVAR att bygga (inte i denna delfas, se slutrapporten till användaren):
 * Landslag (kräver en NY, ännu overifierad importväg — /players?id&season
 * UTAN team-filter för att hitta nationslagsrader, ett annat mönster än
 * den redan byggda /transfers-baserade klubbimporten) samt Heatmap/
 * Skottkarta (ingen koordinat-nivå skott-/positionsdata i någon källa vi
 * har, bekräftat flera gånger i den här sessionen).
 *
 * DNA/Advancerad DNA/Utveckling/Scout Intelligence/percentil-highlights
 * stannar Scout-exklusiva (uttrycklig regel: "Scout = avancerad analys",
 * inte grundprofilen) — bara den ENKLA OVR-badgen och Spelaregenskaper-
 * radarn (redan byggd på samma per90-data som redan fanns här) är gratis.
 */

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

  const age = profile.season ? ageAtSeason(profile.player.birthDate, profile.season) : calculateAge(profile.player.birthDate);

  const { data: seasonRow } = profile.season ? await supabase.from("season").select("id").eq("year", profile.season).maybeSingle() : { data: null };
  const seasonId = seasonRow?.id ?? null;

  const [rating, lineupRole, matchLog, careerTimeline, foreignCareerStints, careerJourney, trophies] = await Promise.all([
    seasonId ? getPlayerOvr(supabase, { playerId: profile.player.id, seasonId }) : Promise.resolve(null),
    seasonId ? getPlayerLineupRoleProfile(supabase, { playerId: profile.player.id, seasonId }) : Promise.resolve(null),
    seasonId
      ? getPlayerMatchLog(supabase, { playerId: profile.player.id, seasonId, position: profile.player.position })
      : Promise.resolve({ available: false, isGoalkeeper: false, entries: [] }),
    getCareerTimeline(supabase, { playerId: profile.player.id }),
    getForeignCareerStints(supabase, { playerId: profile.player.id }),
    getCareerJourney(supabase, { playerId: profile.player.id }),
    getPlayerTrophies(supabase, { playerId: profile.player.id }),
  ]);

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
  const peerLabel = `Snitt ${profile.peerGroup.label}`;

  const summary = buildPlayerSummary({
    name: profile.player.name,
    position: profile.player.position,
    nationality: profile.player.nationality,
    currentTeamName: profile.player.displayTeamName,
    domesticEntries: careerTimeline,
    foreignStints: foreignCareerStints,
    trophies,
    hasLeftCurrentTeam: profile.player.hasLeftCurrentTeam,
    previousTeamName: profile.player.team?.name ?? null,
    latestTransferTeamName: profile.player.latestTransferTeamName,
  });

  return (
    <div>
      <BackButton href="/spelare" label="Alla spelare" />

      {/* 1 — HEADER */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <PlayerAvatar
          name={profile.player.name}
          teamExternalId={profile.player.team?.external_id}
          size={72}
          photoUrl={profile.player.photoUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{profile.player.name}</h1>
            {/* Fas 22c — har karriären tagit slut? Se lib/football/player-activity.ts
                för de tre spärrarna; statusen är "unknown" (ingen etikett) så fort
                underlaget är för tunt. */}
            {profile.player.activity.status === "retired" && (
              <span
                className="rounded-full bg-[#d9a526]/15 px-2.5 py-0.5 text-xs font-semibold text-[#d9a526]"
                title={`Ingen registrerad säsong sedan ${profile.player.activity.lastActiveYear}.`}
              >
                🏁 Pensionerad
              </span>
            )}
            {rating?.ovr !== null && rating !== null && (
              <span
                className="rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums"
                style={{ backgroundColor: `${ovrColor(rating.ovr)}26`, color: ovrColor(rating.ovr) }}
                title={`OVR ${rating.ovr} — intern allsvensk skala 48–91, inte jämförbar med FIFA. ${displayHint(rating).badge}. Full nedbrytning i Scout.`}
              >
                {rating.ovr.toFixed(0)}
                {displayHint(rating).needsCaveat && <span className="ml-0.5 align-super text-[9px] opacity-70">*</span>}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-[#c3c2b7]">
            {profile.player.displayTeamName ?? "—"}{" "}
            {profile.player.position && `· ${translatePosition(profile.player.position)}`}
            {age !== null && ` · ${age} år`}
            {profile.player.nationality && ` · ${translateNationality(profile.player.nationality)}`}
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          {profile.availableSeasons.map((y) => (
            <Link
              key={y}
              href={`/spelare/${id}?season=${y}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                y === profile.season ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      {profile.player.hasLeftCurrentTeam && (
        <TransferFlagBanner
          previousTeamName={profile.player.team?.name ?? null}
          teamName={profile.player.latestTransferTeamName}
          teamLogoUrl={profile.player.latestTransferTeamLogoUrl}
          transferDate={profile.player.latestTransferDate}
          transferType={profile.player.latestTransferType}
        />
      )}

      {/* 2 — SPELAREGENSKAPER (radar + "?"-förklaring) */}
      {profile.per90.goals !== null && (
        <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Spelaregenskaper</h2>
          <div className="mt-3">
            <PlayerRadarChart per90={profile.per90} positionAveragePer90={profile.positionAveragePer90} peerGroup={profile.peerGroup} />
          </div>
        </div>
      )}

      {/* Roll i laget — lineup-härledd (steg 9). */}
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

      {/* 3 — AKTUELL SÄSONG (stor sammanfattning) */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Mål", profile.stats.goals],
          ["Assist", profile.stats.assists],
          ["Matcher", profile.stats.appearances],
          ["Snittbetyg (matcher)", profile.stats.rating],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-white/10 bg-[#1a1a19] p-4 text-center">
            <p className="text-3xl font-semibold tabular-nums">{na(value as number | null)}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-[#898781]">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <h2 className="text-sm font-semibold">Grundstatistik — {profile.season}</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
          {grundstatistikRows.map(([label, value]) => (
            <div key={label}>
              <p className="text-lg font-semibold">{na(value)}</p>
              <p className="text-[10px] text-[#898781]">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4 — MATCHSTATISTIK */}
      {matchLog.entries.length > 0 && (
        <div className="mt-8">
          <MatchLogSection entries={matchLog.entries} isGoalkeeper={matchLog.isGoalkeeper} />
        </div>
      )}

      {/* 5 — KARRIÄR: resan + Klubb/Säsong */}
      <div className="mt-8 space-y-4">
        <CareerJourneySection journey={careerJourney} />
        <CareerTimelineSection entries={careerTimeline} foreignStints={foreignCareerStints} />
      </div>

      {/* 6 — TROFÉER */}
      <div className="mt-4">
        <PlayerTrophiesSection trophies={trophies} />
      </div>

      {/* 9 — SÄSONGSPRESTATION (per-90, positionsanpassat) */}
      {(hasAnfall || hasPassningsspel || hasDuellspel || hasForsvar) && (
        <div className="mt-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Säsongsprestation — {profile.season}</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {hasAnfall && (
              <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
                <h2 className="text-sm font-semibold">Anfall</h2>
                <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = snitt {profile.peerGroup.label}</p>
                <StatBar label="Mål" value={profile.per90.goals} peerAverage={profile.positionAveragePer90.goals} peerLabel={peerLabel} />
                <StatBar label="Assist" value={profile.per90.assists} peerAverage={profile.positionAveragePer90.assists} peerLabel={peerLabel} />
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
                <StatBar label="Passningssäkerhet" value={profile.stats.passesAccuracy} peerAverage={null} suffix="%" />
              </div>
            )}

            {hasDuellspel && (
              <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
                <h2 className="text-sm font-semibold">Duellspel</h2>
                <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = snitt {profile.peerGroup.label}</p>
                <StatBar label="Vunna dueller" value={profile.per90.duelsWon} peerAverage={profile.positionAveragePer90.duelsWon} peerLabel={peerLabel} />
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

      {/* 10 — OM SPELAREN */}
      {summary.length > 0 && (
        <div className="mt-8 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Om spelaren</h2>
          <div className="mt-3 space-y-2">
            {summary.map((s, i) => (
              <p key={i} className="text-[15px] leading-[1.7] text-[#e5e4dd]">
                {s}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Scout-CTA — den avancerade analysstacken (Player DNA, Advancerad
          DNA, Utveckling, OVR-nedbrytning, Scout Intelligence) — Scout är
          fortsatt AVANCERAD ANALYS av samma spelare, inte grundprofilen. */}
      <Link
        href={`/scout/spelare/${profile.player.id}${profile.season ? `?season=${profile.season}` : ""}`}
        className="mt-8 flex items-center justify-between gap-3 rounded-xl border border-[#a78bfa]/30 bg-[#a78bfa]/10 p-4 text-sm transition-colors hover:bg-[#a78bfa]/15"
      >
        <span>
          <span className="font-semibold text-[#a78bfa]">🧬 Se full scouting-analys</span>
          <span className="ml-1 text-[#c3c2b7]">— DNA, arketyper, percentiler och utveckling i Scout.</span>
        </span>
        <span className="text-[#a78bfa]">→</span>
      </Link>
    </div>
  );
}
