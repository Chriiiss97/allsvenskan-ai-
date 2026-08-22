import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTeamProfile, FootballDataError } from "@/lib/football/tools";
import { getTeamDNA } from "@/lib/football/team-dna";
import { getAvailableSeasons } from "@/lib/football/catalog";
import { StatBar } from "@/components/data/StatBar";
import { getTeamAccent } from "@/lib/data/team-colors";

/**
 * Fas 14.4 (plans/humble-giggling-biscuit.md) — Lag-DNA, flyttat hit från
 * f.d. /lag/[id]s Statistik-flik (som nu länkar hit istället, se den
 * sidans Scout-CTA). Samma "flytt, inte kopiering"-princip som spelarens
 * DNA-block i Fas 14.3/14.4.
 */
export default async function ScoutTeamProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { id } = await params;
  const { season } = await searchParams;
  const supabase = await createClient();

  let profile: Awaited<ReturnType<typeof getTeamProfile>> | null = null;
  let error: string | null = null;
  try {
    profile = await getTeamProfile(supabase, { team: id, season: season ? Number(season) : undefined });
  } catch (err) {
    error = err instanceof FootballDataError ? err.message : "Kunde inte hämta laget.";
  }

  const accent = getTeamAccent(profile?.team.externalId);
  const seasons = await getAvailableSeasons(supabase);
  const teamDNA = profile?.season ? await getTeamDNA(supabase, { team: id, season: profile.season }) : null;

  return (
    <div>
      <Link href="/scout/lag" className="text-xs text-[#898781] hover:text-white">
        ← Scout Lag
      </Link>

      {error && <p className="mt-6 text-sm text-[#e66767]">{error}</p>}

      {profile && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {profile.team.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- extern logga
              <img src={profile.team.logoUrl} alt="" className="h-16 w-16" />
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{profile.team.name}</h1>
              <Link href={`/lag/${id}`} className="mt-0.5 inline-block text-xs text-[#3987e5] hover:underline">
                Lagöversikt (gratis) →
              </Link>
            </div>
            <div className="ml-auto flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
              {seasons.map((s) => (
                <Link
                  key={s.year}
                  href={`/scout/lag/${id}?season=${s.year}`}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    profile!.season === s.year ? "text-white" : "text-[#898781] hover:text-white"
                  }`}
                  style={profile!.season === s.year ? { backgroundColor: `${accent}26` } : undefined}
                >
                  {s.year}
                </Link>
              ))}
            </div>
          </div>

          {teamDNA?.available && teamDNA.own ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
              <h2 className="text-sm font-semibold">Lag-DNA — {profile.season}</h2>
              <p className="mt-1 text-xs text-[#898781]">
                Snitt över {teamDNA.own.matchesWithStats} matcher, jämfört med ligasnittet den säsongen.
              </p>

              {teamDNA.insights.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-b border-white/10 pb-3">
                  {teamDNA.insights.map((text, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#c3c2b7]">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
                      {text}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3">
                <StatBar label="Bollinnehav" value={teamDNA.own.possessionPct} peerAverage={teamDNA.leagueAverage?.possessionPct ?? null} peerLabel="Ligasnitt" suffix="%" />
                <StatBar label="Skott" value={teamDNA.own.shotsTotal} peerAverage={teamDNA.leagueAverage?.shotsTotal ?? null} peerLabel="Ligasnitt" />
                <StatBar label="Skott på mål" value={teamDNA.own.shotsOnTarget} peerAverage={teamDNA.leagueAverage?.shotsOnTarget ?? null} peerLabel="Ligasnitt" />
                <StatBar label="Hörnor" value={teamDNA.own.corners} peerAverage={teamDNA.leagueAverage?.corners ?? null} peerLabel="Ligasnitt" />
                <StatBar label="Expected goals (xG)" value={teamDNA.own.expectedGoals} peerAverage={teamDNA.leagueAverage?.expectedGoals ?? null} peerLabel="Ligasnitt" />
                <StatBar label="Passningssäkerhet" value={teamDNA.own.passesAccuracyPct} peerAverage={teamDNA.leagueAverage?.passesAccuracyPct ?? null} peerLabel="Ligasnitt" suffix="%" />
              </div>

              {teamDNA.mostCommonFormation && (
                <p className="mt-3 border-t border-white/10 pt-3 text-xs text-[#898781]">
                  Vanligaste formation: <span className="font-medium text-white">{teamDNA.mostCommonFormation}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="mt-6 text-sm text-[#898781]">Ingen lagstatistik tillgänglig för vald säsong.</p>
          )}
        </>
      )}
    </div>
  );
}
