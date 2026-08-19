import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTeamComparison, FootballDataError } from "@/lib/football/tools";
import { FormBadges } from "@/components/data/FormBadges";
import { RecordBar } from "@/components/data/RecordBar";
import { TeamCompareBars } from "@/components/data/TeamCompareBars";

export default async function TeamsComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; season?: string }>;
}) {
  const { a, b, season } = await searchParams;
  const supabase = await createClient();

  let comparison: Awaited<ReturnType<typeof getTeamComparison>> | null = null;
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

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Lag-vs-lag</h1>
      <p className="mt-1 text-sm text-[#898781]">
        Bara IFK Göteborg och AIK — de enda två lagen vi har fullständig matchhistorik för.
        Resultatbaserat (poäng, form, mål) — riktig matchstatistik (skott, bollinnehav) kräver en
        senare, dyrare import.
      </p>

      {error && <p className="mt-6 text-sm text-[#e66767]">{error}</p>}

      {comparison && (
        <>
          {/* Stapeljämförelse */}
          <div className="mt-6 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold">
              <span className="text-[#3987e5]">{comparison.teamA.name}</span>
              <span className="text-xs font-normal text-[#898781]">Säsong {comparison.season}</span>
              <span className="text-[#d95926]">{comparison.teamB.name}</span>
            </div>
            <TeamCompareBars
              rows={[
                { label: "Poäng", a: comparison.teamA.points, b: comparison.teamB.points },
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

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[comparison.teamA, comparison.teamB].map((t) => (
              <div key={t.name} className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
                <h2 className="text-lg font-semibold">{t.name}</h2>
                <p className="text-xs text-[#898781]">Säsong {comparison!.season}</p>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["Matcher", t.played],
                    ["Poäng", t.points],
                    ["V-O-F", `${t.wins}-${t.draws}-${t.losses}`],
                    ["Mål", `${t.goalsFor}-${t.goalsAgainst}`],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <p className="text-base font-semibold">{value}</p>
                      <p className="text-[10px] text-[#898781]">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <RecordBar wins={t.wins} draws={t.draws} losses={t.losses} labelPrefix="Säsongsform" />
                </div>
                <div className="mt-3">
                  <p className="mb-1 text-xs text-[#898781]">Senaste 5</p>
                  <FormBadges form={t.form} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
            <h2 className="text-sm font-semibold">Inbördes möten (alla säsonger)</h2>
            <div className="mt-2">
              <RecordBar
                wins={comparison.headToHead.record.teamAWins}
                draws={comparison.headToHead.record.draws}
                losses={comparison.headToHead.record.teamBWins}
                variant="teams"
              />
              <p className="mt-1 text-xs text-[#898781]">
                {comparison.teamA.name} {comparison.headToHead.record.teamAWins} —{" "}
                {comparison.headToHead.record.draws} oavgjorda — {comparison.headToHead.record.teamBWins}{" "}
                {comparison.teamB.name}
              </p>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {comparison.headToHead.matches.map((m, i) => (
                <li key={i} className="flex items-center justify-between border-t border-white/5 pt-1.5 text-xs">
                  <span>
                    {m.home} {m.homeScore ?? "–"}–{m.awayScore ?? "–"} {m.away}
                  </span>
                  <span className="text-[#898781]">
                    {m.season} · {m.round}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <p className="mt-4 text-xs text-[#898781]">
        <Link href="/data/players" className="underline hover:text-white">
          ← Tillbaka till spelare
        </Link>
      </p>
    </div>
  );
}
