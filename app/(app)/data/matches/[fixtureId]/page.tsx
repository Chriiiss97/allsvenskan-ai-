import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMatchReport, FootballDataError } from "@/lib/football/tools";
import { MatchTimeline } from "@/components/data/MatchTimeline";
import { BackButton } from "@/components/nav/BackButton";

export default async function MatchReportPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = await params;
  const supabase = await createClient();

  let report;
  try {
    report = await getMatchReport(supabase, Number(fixtureId));
  } catch (err) {
    if (err instanceof FootballDataError) notFound();
    throw err;
  }

  return (
    <div>
      <BackButton href="/data/matches" label="Alla matcher" />

      <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-6 text-center">
        <p className="text-xs text-[#898781]">
          {report.season} · {report.round} · {new Date(report.date).toLocaleDateString("sv-SE")}
        </p>
        <p className="mt-2 text-2xl font-semibold">
          {report.home?.name} {report.homeScore ?? "–"} – {report.awayScore ?? "–"} {report.away?.name}
        </p>
        {report.venue && <p className="mt-1 text-xs text-[#898781]">{report.venue}</p>}
      </div>

      {!report.fullPlayerDetail && report.eventsAvailable && (
        <p className="mt-3 text-xs text-[#898781]">
          Vi har bara importerat spelartrupperna för IFK Göteborg och AIK — händelser för motståndaren
          nedan visas därför med lagnamn men utan spelarnamn.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <h2 className="text-sm font-semibold">Matchhändelser</h2>
        <div className="mt-3">
          <MatchTimeline events={report.events} />
        </div>
      </div>
    </div>
  );
}
