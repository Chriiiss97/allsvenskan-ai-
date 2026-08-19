import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfile, FootballDataError } from "@/lib/football/tools";
import { StatBar } from "@/components/data/StatBar";
import { PlayerRadarChart } from "@/components/data/PlayerRadarChart";

function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

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

  return (
    <div>
      <Link href="/data/players" className="text-xs text-[#898781] hover:text-white">
        ← Alla spelare
      </Link>

      {/* Bio-kort */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        {profile.player.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- extern spelarbild
          <img
            src={profile.player.photoUrl}
            alt=""
            className="h-20 w-20 rounded-full bg-white/5 object-cover"
          />
        ) : (
          <div className="h-20 w-20 rounded-full bg-white/5" />
        )}
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{profile.player.name}</h1>
          <p className="mt-0.5 text-sm text-[#c3c2b7]">
            {profile.player.team?.name ?? "—"} {profile.player.position && `· ${profile.player.position}`}
            {age !== null && ` · ${age} år`}
            {profile.player.nationality && ` · ${profile.player.nationality}`}
          </p>
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

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/* Grundstatistik */}
        <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Grundstatistik — {profile.season}</h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[
              ["Matcher", profile.stats.appearances],
              ["Minuter", profile.stats.minutesPlayed],
              ["Mål", profile.stats.goals],
              ["Assist", profile.stats.assists],
              ["Gula", profile.stats.yellowCards],
              ["Röda", profile.stats.redCards],
              ["Betyg", profile.stats.rating],
              ["Skott", profile.stats.shotsTotal],
              ["På mål", profile.stats.shotsOnTarget],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-lg font-semibold">{na(value as number | null)}</p>
                <p className="text-[10px] text-[#898781]">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Radardiagram */}
        <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Jämförelse mot ligasnitt</h2>
          <div className="mt-3">
            <PlayerRadarChart per90={profile.per90} leagueAveragePer90={profile.leagueAveragePer90} />
          </div>
        </div>
      </div>

      {/* Avancerad statistik, per 90 minuter mot ligasnitt */}
      <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <h2 className="text-sm font-semibold">Per 90 minuter (blå markör = ligasnitt)</h2>
        <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
          <StatBar label="Mål" value={profile.per90.goals} leagueAverage={profile.leagueAveragePer90.goals} />
          <StatBar
            label="Assist"
            value={profile.per90.assists}
            leagueAverage={profile.leagueAveragePer90.assists}
          />
          <StatBar
            label="Nyckelpassningar"
            value={profile.per90.passesKey}
            leagueAverage={profile.leagueAveragePer90.passesKey}
          />
          <StatBar
            label="Passningar"
            value={profile.per90.passesTotal}
            leagueAverage={profile.leagueAveragePer90.passesTotal}
          />
          <StatBar
            label="Vunna dueller"
            value={profile.per90.duelsWon}
            leagueAverage={profile.leagueAveragePer90.duelsWon}
          />
          <StatBar
            label="Tacklingar"
            value={profile.per90.tacklesTotal}
            leagueAverage={profile.leagueAveragePer90.tacklesTotal}
          />
          <StatBar
            label="Lyckade dribblingar"
            value={profile.per90.dribblesSuccess}
            leagueAverage={profile.leagueAveragePer90.dribblesSuccess}
          />
          <StatBar
            label="Passningssäkerhet"
            value={profile.stats.passesAccuracy}
            leagueAverage={null}
            suffix="%"
          />
        </div>
      </div>
    </div>
  );
}
