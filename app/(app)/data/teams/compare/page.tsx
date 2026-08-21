import { createClient } from "@/lib/supabase/server";
import { getTeamComparison, FootballDataError } from "@/lib/football/tools";
import { listTeams } from "@/lib/football/catalog";
import { FormBadges } from "@/components/data/FormBadges";
import { RecordBar } from "@/components/data/RecordBar";
import { TeamCompareBars } from "@/components/data/TeamCompareBars";
import { TeamCompareControls } from "@/components/data/TeamCompareControls";
import { SectionTabs } from "@/components/data/SectionTabs";
import { BackButton } from "@/components/nav/BackButton";

type Comparison = Awaited<ReturnType<typeof getTeamComparison>>;

/**
 * Bygger en kort "varför ligger X före"-lista av RIKTIGA, härledda
 * jämförelsetal (poäng/vinster/målskillnad/form) — inget påhittat, bara
 * samma siffror som redan finns i `comparison` uttryckta som meningar
 * istället för bara staplar. En rad skrivs bara ut om den faktiskt stämmer.
 */
function buildInsights(comparison: Comparison): string[] {
  const { teamA, teamB } = comparison;
  if (teamA.points === teamB.points) return [];

  const leader = teamA.points > teamB.points ? teamA : teamB;
  const other = leader === teamA ? teamB : teamA;
  const insights: string[] = [];

  insights.push(`${leader.name} har ${leader.points - other.points} fler poäng (${leader.points} mot ${other.points}).`);

  if (leader.wins > other.wins) {
    insights.push(`${leader.name} har vunnit ${leader.wins - other.wins} fler matcher.`);
  }

  const gdLeader = leader.goalsFor - leader.goalsAgainst;
  const gdOther = other.goalsFor - other.goalsAgainst;
  if (gdLeader > gdOther) {
    const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    insights.push(`${leader.name} har bättre målskillnad (${fmt(gdLeader)} mot ${fmt(gdOther)}).`);
  }

  const leaderFormWins = leader.form.filter((r) => r === "W").length;
  const otherFormWins = other.form.filter((r) => r === "W").length;
  if (leaderFormWins > otherFormWins) {
    insights.push(
      `${leader.name} har bättre form just nu (${leaderFormWins} vinster av senaste ${leader.form.length}).`
    );
  }

  return insights;
}

export default async function TeamsComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; season?: string }>;
}) {
  const { a, b, season } = await searchParams;
  const supabase = await createClient();
  const teams = await listTeams(supabase);

  let comparison: Comparison | null = null;
  let error: string | null = null;

  try {
    comparison = await getTeamComparison(supabase, {
      teamA: a ?? "IFK Göteborg",
      teamB: b ?? "AIK",
      season: season ? Number(season) : undefined,
    });
  } catch (err) {
    error = err instanceof FootballDataError ? err.message : "Kunde inte jämföra lagen.";
  }

  let logos: Record<string, string | null> = {};
  if (comparison) {
    const { data: logoRows } = await supabase
      .from("team")
      .select("name, logo_url")
      .in("name", [comparison.teamA.name, comparison.teamB.name])
      .returns<{ name: string; logo_url: string | null }[]>();
    logos = Object.fromEntries((logoRows ?? []).map((r) => [r.name, r.logo_url]));
  }

  const insights = comparison ? buildInsights(comparison) : [];

  return (
    <div>
      <SectionTabs
        tabs={[
          { label: "Alla lag", href: "/data/teams" },
          { label: "Lag vs lag", href: "/data/teams/compare" },
        ]}
      />
      <BackButton href="/data/teams" label="Alla lag" />

      <div className="mt-6">
        <TeamCompareControls
          teams={teams.filter((t): t is typeof t & { external_id: number } => t.external_id !== null).map((t) => ({
            externalId: t.external_id,
            name: t.name,
            logoUrl: t.logoUrl,
          }))}
          externalIdA={comparison?.teamA.externalId ?? null}
          externalIdB={comparison?.teamB.externalId ?? null}
        />
      </div>

      {error && <p className="mt-6 text-sm text-[#e66767]">{error}</p>}

      {comparison && (
        <>
          {/* Hero: VS-header, stort och luftigt istället för en rad med två små rubriker */}
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-5 sm:gap-8">
              {logos[comparison.teamA.name] && (
                // eslint-disable-next-line @next/next/no-img-element -- extern logga
                <img src={logos[comparison.teamA.name]!} alt="" className="h-14 w-14 sm:h-20 sm:w-20" />
              )}
              <span className="text-2xl font-bold text-[#7d7c76] sm:text-3xl">VS</span>
              {logos[comparison.teamB.name] && (
                // eslint-disable-next-line @next/next/no-img-element -- extern logga
                <img src={logos[comparison.teamB.name]!} alt="" className="h-14 w-14 sm:h-20 sm:w-20" />
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
              {comparison.teamA.name} <span className="text-[#7d7c76]">vs</span> {comparison.teamB.name}
            </h1>
            <p className="text-sm text-[#898781]">Säsong {comparison.season} · resultatbaserat</p>
          </div>

          {/* Poäng — huvudjämförelsen, ingen bård, bara stora siffror */}
          <div className="mt-10 flex items-center justify-center gap-8 sm:gap-16">
            <div className="text-center">
              <p className="text-5xl font-bold text-[#3987e5] sm:text-6xl">{comparison.teamA.points}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-[#898781]">Poäng</p>
            </div>
            <div className="text-center">
              <p className="text-5xl font-bold text-[#eab308] sm:text-6xl">{comparison.teamB.points}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-[#898781]">Poäng</p>
            </div>
          </div>

          {/* Insikter — samma siffror som en mening istället för bara staplar */}
          {insights.length > 0 && (
            <div className="mx-auto mt-8 max-w-lg">
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">
                Varför ligger de till som de gör
              </p>
              <ul className="space-y-1.5">
                {insights.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#c3c2b7]">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#3987e5]" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sekundära mått */}
          <div className="mt-10 rounded-2xl border border-white/10 bg-[#141418] p-6">
            <TeamCompareBars
              rows={[
                { label: "Mål för", a: comparison.teamA.goalsFor, b: comparison.teamB.goalsFor },
                { label: "Mål mot", a: comparison.teamA.goalsAgainst, b: comparison.teamB.goalsAgainst },
                {
                  label: "Målskillnad",
                  a: comparison.teamA.goalsFor - comparison.teamA.goalsAgainst,
                  b: comparison.teamB.goalsFor - comparison.teamB.goalsAgainst,
                },
              ]}
            />
          </div>

          {/* Form — direkt jämförbar, sida vid sida */}
          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">Form (senaste 5)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[comparison.teamA, comparison.teamB].map((t) => (
                <div key={t.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#141418] p-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-[#898781]">
                      {t.played} matcher · {t.wins}-{t.draws}-{t.losses}
                    </p>
                  </div>
                  <FormBadges form={t.form} />
                </div>
              ))}
            </div>
          </div>

          {/* Inbördes möten */}
          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">
              Inbördes möten (alla säsonger)
            </p>
            <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
              <RecordBar
                wins={comparison.headToHead.record.teamAWins}
                draws={comparison.headToHead.record.draws}
                losses={comparison.headToHead.record.teamBWins}
                variant="teams"
              />
              <p className="mt-1.5 text-xs text-[#898781]">
                {comparison.teamA.name} {comparison.headToHead.record.teamAWins} —{" "}
                {comparison.headToHead.record.draws} oavgjorda — {comparison.headToHead.record.teamBWins}{" "}
                {comparison.teamB.name}
              </p>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {comparison.headToHead.matches.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-white/8 bg-[#141418] px-3.5 py-2 text-xs"
                >
                  <span className="text-[#c3c2b7]">
                    {m.home} <span className="font-semibold text-white">{m.homeScore ?? "–"}–{m.awayScore ?? "–"}</span> {m.away}
                  </span>
                  <span className="text-[#7d7c76]">
                    {m.season} · {m.round}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
