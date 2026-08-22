import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfile, FootballDataError } from "@/lib/football/tools";
import { computeRatingForPlayer } from "@/lib/football/rating/compute-rating";
import { getPlayerLineupRoleProfile } from "@/lib/football/lineup-role";
import { calculateAge } from "@/lib/football/age";
import { StatBar } from "@/components/data/StatBar";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { BackButton } from "@/components/nav/BackButton";
import { translatePosition } from "@/lib/i18n/sv";
import { ovrColor } from "@/lib/football/rating/ovr-color";

/**
 * Fas 14.3 (plans/humble-giggling-biscuit.md) — TRIMMAD gratisversion.
 * Player DNA, Advancerad DNA, Utveckling ("varför") och Player Ratings
 * fulla kategori-/kontributionsnedbrytning samt percentil-radarn ("Jämförelse
 * mot positionssnitt") flyttas till Scout (/scout/spelare/[id], Fas 14.4) —
 * de är analys/scouting, inte grundläggande fotbollsstatistik. Kvar: bio,
 * en ENKEL OVR-siffra (ingen kategorinedbrytning — beslutat med
 * användaren: en färgkodad badge räcker som gratis "teaser"), hero-
 * statistik, grundstatistik, roll i laget, och de fyra per-90-panelerna
 * (Anfall/Passningsspel/Duellspel/Försvar — vanliga box score-tal, inte
 * proprietär DNA-analys, så de stannar kvar).
 *
 * KÄND LUCKA (inte löst i denna delfas): en riktig match-för-match-
 * matchhistorik för spelaren (efterfrågad i användarens ursprungliga
 * gratissidespec) finns inte än — skulle kräva en ny, overifierad
 * datafråga och byggs bättre som en egen, verifierad liten fas än att
 * hastas in här.
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

  const age = calculateAge(profile.player.birthDate);
  // Player Rating (2026-08-21): bara den enkla 0-99-siffran visas gratis —
  // kategori-/kontributionsnedbrytningen är Scout-innehåll (Fas 14.4).
  const rating = profile.season
    ? await computeRatingForPlayer(supabase, {
        playerId: profile.player.id,
        position: profile.player.position,
        season: profile.season,
      })
    : null;

  // Steg 9: lineup-härledd rolldata (start/avbytarlistningar, formation) —
  // grundläggande fotbollsfakta, inte scouting-analys, stannar kvar gratis.
  let lineupRole: Awaited<ReturnType<typeof getPlayerLineupRoleProfile>> = null;
  if (profile.season) {
    const { data: seasonRow } = await supabase.from("season").select("id").eq("year", profile.season).maybeSingle();
    if (seasonRow) {
      lineupRole = await getPlayerLineupRoleProfile(supabase, { playerId: profile.player.id, seasonId: seasonRow.id });
    }
  }

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
      <BackButton href="/spelare" label="Alla spelare" />

      {/* Bio-kort */}
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
            {rating?.rating.available && rating.rating.ovr !== null && (
              <span
                className="rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums"
                style={{ backgroundColor: `${ovrColor(rating.rating.ovr)}26`, color: ovrColor(rating.rating.ovr) }}
                title="Player Rating — statistisk 0–99. Full uppdelning i Scout."
              >
                {rating.rating.ovr}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-[#c3c2b7]">
            {profile.player.team?.name ?? "—"}{" "}
            {profile.player.position && `· ${translatePosition(profile.player.position)}`}
            {age !== null && ` · ${age} år`}
            {profile.player.nationality && ` · ${profile.player.nationality}`}
          </p>
        </div>

        {/* Säsongsväljare */}
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

      {/* Roll i laget — lineup-härledd (steg 9). Visas bara om vi har minst
          en sparad laguppställning för spelaren den säsongen. */}
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

      {/* Grundstatistik */}
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

      {/* Per-90-statistik, grupperad i paneler — vanliga box score-tal, inte
          proprietär DNA-analys, en panel visas bara om den faktiskt har
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

      {/* Scout-CTA — den fulla analysstacken (Player DNA, Advancerad DNA,
          Utveckling, OVR-nedbrytning) flyttad hit, se /scout/spelare/[id]
          (Fas 14.4). */}
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
