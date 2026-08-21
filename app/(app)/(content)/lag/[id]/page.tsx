import { createClient } from "@/lib/supabase/server";
import { getTeamProfile, FootballDataError } from "@/lib/football/tools";
import { getTeamDNA } from "@/lib/football/team-dna";
import { getAvailableSeasons } from "@/lib/football/catalog";
import { RecordBar } from "@/components/data/RecordBar";
import { FormBadges } from "@/components/data/FormBadges";
import { PlayerCard } from "@/components/data/PlayerCard";
import { StatBar } from "@/components/data/StatBar";
import { BackButton } from "@/components/nav/BackButton";
import { getTeamAccent } from "@/lib/data/team-colors";
import Link from "next/link";

/**
 * Data-sektionens breddning (2026-08-20): flyttad hit från /data/teams
 * (som nu är en lagöversikt-grid över alla 33 lag, se page.tsx i
 * föräldramappen; Fas 14.1 döpte om hela grenen till /lag). `id` i routen
 * är lagets `external_id` (API-Football:s
 * numeriska id) — matchar direkt mot resolveTeam:s redan existerande
 * numeriska matchningsväg (lib/football/resolve-team.ts), ingen ny
 * uppslagslogik behövdes.
 */
export default async function TeamProfilePage({
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
    profile = await getTeamProfile(supabase, {
      team: id,
      season: season ? Number(season) : undefined,
    });
  } catch (err) {
    error = err instanceof FootballDataError ? err.message : "Kunde inte hämta laget.";
  }

  const accent = getTeamAccent(profile?.team.externalId);
  const seasons = await getAvailableSeasons(supabase);
  const teamDNA = profile?.season ? await getTeamDNA(supabase, { team: id, season: profile.season }) : null;

  return (
    <div>
      <BackButton href="/lag" label="Alla lag" />

      {error && <p className="mt-6 text-sm text-[#e66767]">{error}</p>}

      {profile && (
        <>
          {/* Hero: logga + namn, stort och luftigt */}
          <div className="mt-4 flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:text-left">
            {profile.team.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- extern logga
              <img src={profile.team.logoUrl} alt="" className="h-20 w-20 sm:h-24 sm:w-24" />
            )}
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{profile.team.name}</h2>
              {profile.facts?.nicknames && profile.facts.nicknames.length > 0 && (
                <p className="mt-1 text-sm text-[#898781]">{profile.facts.nicknames.join(" · ")}</p>
              )}
            </div>
          </div>

          {/* Säsongsväljare — från getAvailableSeasons (2016–2026), inte hårdkodad */}
          <div className="mt-5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {seasons.map((s) => (
              <Link
                key={s.year}
                href={`/lag/${id}?season=${s.year}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  profile.season === s.year ? "text-white" : "text-[#898781] hover:text-white"
                }`}
                style={profile.season === s.year ? { backgroundColor: `${accent}26` } : undefined}
              >
                {s.year}
              </Link>
            ))}
          </div>

          {/* Rekord — stora siffror, ingen bård */}
          <div className="mt-10 flex flex-wrap justify-center gap-x-10 gap-y-6 sm:justify-start">
            {[
              ["Matcher", profile.record.played],
              ["V-O-F", `${profile.record.wins}-${profile.record.draws}-${profile.record.losses}`],
              ["Mål för/mot", `${profile.record.goalsFor}-${profile.record.goalsAgainst}`],
              [
                "Målskillnad",
                profile.record.goalsFor - profile.record.goalsAgainst >= 0
                  ? `+${profile.record.goalsFor - profile.record.goalsAgainst}`
                  : `${profile.record.goalsFor - profile.record.goalsAgainst}`,
              ],
              ["Poäng", profile.record.points],
            ].map(([label, value]) => (
              <div key={label as string} className="text-center sm:text-left">
                <p className="text-3xl font-bold text-white sm:text-4xl">{value}</p>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-[#898781]">{label}</p>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-6 max-w-xs sm:mx-0">
            <RecordBar wins={profile.record.wins} draws={profile.record.draws} losses={profile.record.losses} />
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 sm:justify-start">
            <p className="text-xs text-[#898781]">Senaste 5:</p>
            <FormBadges form={profile.record.form} />
          </div>

          {/* Lag-DNA — samma princip som Player DNA: aldrig påhittat, alltid
              en ärlig "ej tillgängligt" om lagstatistik saknas för säsongen. */}
          {teamDNA?.available && teamDNA.own && (
            <div className="mt-10 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
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
          )}

          {/* Bästa målskytt / assist */}
          {(profile.topScorer || profile.topAssist) && (
            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              {profile.topScorer && (
                <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
                  <p className="text-xs uppercase tracking-wide text-[#898781]">Bästa målskytt</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {profile.topScorer.name} <span style={{ color: accent }}>({profile.topScorer.goals} mål)</span>
                  </p>
                </div>
              )}
              {profile.topAssist && (
                <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
                  <p className="text-xs uppercase tracking-wide text-[#898781]">Bästa passningsläggare</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {profile.topAssist.name}{" "}
                    <span style={{ color: accent }}>({profile.topAssist.assists} assist)</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Senaste matcher */}
          {profile.recentMatches.length > 0 && (
            <div className="mt-10">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Senaste matcher</p>
              <div className="flex flex-col gap-1.5">
                {profile.recentMatches.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-white/8 bg-[#141418] px-3.5 py-2 text-xs"
                  >
                    <span className="text-[#c3c2b7]">
                      {m.home} <span className="font-semibold text-white">{m.home_score ?? "–"}–{m.away_score ?? "–"}</span> {m.away}
                    </span>
                    <span className="text-[#7d7c76]">{m.round}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trupp */}
          {profile.squad.length > 0 && (
            <div className="mt-10">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">
                Trupp ({profile.squad.length})
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {profile.squad.map((p) => (
                  <PlayerCard
                    key={p.id}
                    player={{
                      id: p.id,
                      full_name: p.name,
                      position: p.position,
                      photoUrl: p.photoUrl,
                      teamName: profile!.team.name,
                      teamExternalId: profile!.team.externalId,
                      stat: null,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Historik */}
          {profile.facts && (
            <div className="mt-10 mb-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Historik</p>
              {profile.facts.short_history && (
                <p className="text-sm leading-relaxed text-[#c3c2b7]">{profile.facts.short_history}</p>
              )}
              {profile.facts.team_trophy && profile.facts.team_trophy.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profile.facts.team_trophy.map((t, i) => (
                    <span key={i} className="rounded-full border border-white/10 bg-[#141418] px-2.5 py-1 text-xs text-[#c3c2b7]">
                      🏆 {t.competition} {t.year}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
