import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfile, FootballDataError } from "@/lib/football/tools";
import { StatBar } from "@/components/data/StatBar";
import { PlayerRadarChart } from "@/components/data/PlayerRadarChart";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";

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
  const teamIndex = profile.player.team?.external_id === 377 ? 1 : 0;

  return (
    <div>
      <Link href="/data/players" className="text-xs text-[#898781] hover:text-white">
        ← Alla spelare
      </Link>

      {/* Bio-kort */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <PlayerAvatar name={profile.player.name} teamIndex={teamIndex} size={72} />
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

      {/* Hero-siffror */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Mål", profile.stats.goals],
          ["Assist", profile.stats.assists],
          ["Matcher", profile.stats.appearances],
          ["Betyg", profile.stats.rating],
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
            {[
              ["Minuter", profile.stats.minutesPlayed],
              ["Gula", profile.stats.yellowCards],
              ["Röda", profile.stats.redCards],
              ["Skott", profile.stats.shotsTotal],
              ["På mål", profile.stats.shotsOnTarget],
              ["Pass-säkerhet", profile.stats.passesAccuracy],
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

      {/* Per-90-statistik, grupperad i paneler à la analysverktyg */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Anfall</h2>
          <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = ligasnitt</p>
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
        </div>

        <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Passningsspel</h2>
          <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = ligasnitt</p>
          <StatBar
            label="Passningar"
            value={profile.per90.passesTotal}
            leagueAverage={profile.leagueAveragePer90.passesTotal}
          />
          <StatBar label="Passningssäkerhet" value={profile.stats.passesAccuracy} leagueAverage={null} suffix="%" />
        </div>

        <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
          <h2 className="text-sm font-semibold">Duellspel &amp; försvar</h2>
          <p className="mb-2 text-[11px] text-[#898781]">Per 90 min · orange = ligasnitt</p>
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
        </div>
      </div>
    </div>
  );
}
