import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAvailableSeasons, listTeams } from "@/lib/football/catalog";

interface FixtureRow {
  id: number;
  kickoff_at: string;
  status: string;
  round: string | null;
  home_score: number | null;
  away_score: number | null;
  events_synced_at: string | null;
  home_team_id: number;
  away_team_id: number;
  home: { name: string } | null;
  away: { name: string } | null;
}

/**
 * Data-sektionens breddning (2026-08-20): Säsong → omgång → matcher för
 * ALLA 33 lag (tidigare hårdkodat till bara IFK Göteborg/AIK). En säsongs
 * hela matchlista är ~200–250 rader — bekräftat säkert under Supabases
 * 1000-radstak, ingen paginering behövs här (till skillnad från
 * spelarlistan, se lib/football/player-catalog.ts).
 */
export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; home?: string; away?: string; team?: string; result?: string; status?: string }>;
}) {
  const { season, home, away, team, result, status } = await searchParams;
  const supabase = await createClient();

  const seasons = await getAvailableSeasons(supabase);
  const seasonYear = season ? Number(season) : seasons[0]?.year;
  const teams = await listTeams(supabase);
  const teamByExternalId = new Map(teams.filter((t) => t.external_id !== null).map((t) => [t.external_id as number, t]));

  const seasonRow = seasonYear ? seasons.find((s) => s.year === seasonYear) : undefined;

  let fixtures: FixtureRow[] = [];
  if (seasonRow) {
    let query = supabase
      .from("fixture")
      .select(
        "id, kickoff_at, status, round, home_score, away_score, events_synced_at, home_team_id, away_team_id, home:home_team_id(name), away:away_team_id(name)"
      )
      .eq("season_id", seasonRow.id);

    const homeTeamId = home ? teamByExternalId.get(Number(home))?.id : undefined;
    const awayTeamId = away ? teamByExternalId.get(Number(away))?.id : undefined;
    const teamId = team ? teamByExternalId.get(Number(team))?.id : undefined;

    if (homeTeamId) query = query.eq("home_team_id", homeTeamId);
    if (awayTeamId) query = query.eq("away_team_id", awayTeamId);
    if (teamId) query = query.or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
    if (status === "finished") query = query.eq("status", "FT");
    else if (status === "upcoming") query = query.neq("status", "FT");

    const { data } = await query.order("kickoff_at", { ascending: true }).returns<FixtureRow[]>();
    fixtures = data ?? [];

    // Resultat-filter (V/O/F) är bara meningsfullt relativt ETT valt lag —
    // beräknas i JS på den redan avgränsade (~200-250 rader) säsongsmängden.
    if (result && teamId) {
      fixtures = fixtures.filter((f) => {
        if (f.status !== "FT" || f.home_score === null || f.away_score === null) return false;
        const isHome = f.home_team_id === teamId;
        const teamScore = isHome ? f.home_score : f.away_score;
        const otherScore = isHome ? f.away_score : f.home_score;
        if (result === "W") return teamScore > otherScore;
        if (result === "D") return teamScore === otherScore;
        if (result === "L") return teamScore < otherScore;
        return true;
      });
    }
  }

  // Gruppera per omgång — frågan är redan sorterad på kickoff_at, så
  // rondordningen blir rätt utan att behöva parsa "Regular Season - N".
  const rounds = new Map<string, FixtureRow[]>();
  for (const f of fixtures) {
    const key = f.round ?? "Okänd omgång";
    const list = rounds.get(key) ?? [];
    list.push(f);
    rounds.set(key, list);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Matcher</h1>
      <p className="mt-1 text-sm text-[#898781]">{fixtures.length} matcher{seasonYear ? ` — säsongen ${seasonYear}` : ""}.</p>

      {/* Säsongsväljare */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {seasons.map((s) => (
          <Link
            key={s.year}
            href={`/matcher?season=${s.year}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              seasonYear === s.year ? "bg-white/10 text-white" : "text-[#898781] hover:text-white"
            }`}
          >
            {s.year}
          </Link>
        ))}
      </div>

      {/* Filter — server-formulär, ingen klient-JS krävs */}
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-[#1a1a19] p-3">
        <input type="hidden" name="season" value={seasonYear ?? ""} />
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Lag
          <select name="team" defaultValue={team ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            {teams.map((t) => (
              <option key={t.id} value={t.external_id ?? ""}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Hemmalag
          <select name="home" defaultValue={home ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            {teams.map((t) => (
              <option key={t.id} value={t.external_id ?? ""}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Bortalag
          <select name="away" defaultValue={away ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            {teams.map((t) => (
              <option key={t.id} value={t.external_id ?? ""}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Resultat {team ? "" : "(kräver valt lag)"}
          <select name="result" defaultValue={result ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            <option value="W">Vinst</option>
            <option value="D">Oavgjort</option>
            <option value="L">Förlust</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#898781]">
          Status
          <select name="status" defaultValue={status ?? ""} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white">
            <option value="">Alla</option>
            <option value="finished">Avslutade</option>
            <option value="upcoming">Kommande</option>
          </select>
        </label>
        <button type="submit" className="rounded-md bg-[#3987e5] px-3 py-1.5 text-sm font-medium text-white">
          Filtrera
        </button>
        {(home || away || team || result || status) && (
          <Link href={`/matcher?season=${seasonYear ?? ""}`} className="text-xs text-[#898781] hover:text-white">
            Rensa filter
          </Link>
        )}
      </form>

      {/* Matcher grupperade per omgång */}
      <div className="mt-6 flex flex-col gap-6">
        {[...rounds.entries()].map(([roundName, roundFixtures]) => (
          <div key={roundName}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d7c76]">{roundName}</p>
            <ul className="space-y-1.5">
              {roundFixtures.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/matcher/${f.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#1a1a19] px-4 py-2.5 text-sm transition-colors hover:border-white/25 hover:bg-white/[.03]"
                  >
                    <span>
                      {f.home?.name} {f.home_score ?? "–"}–{f.away_score ?? "–"} {f.away?.name}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-[#898781]">
                      {new Date(f.kickoff_at).toLocaleDateString("sv-SE")}
                      {f.status !== "FT" ? (
                        // Fas 14.0-fix: en ospelad match visade tidigare
                        // "Bara resultat" (fanns inget resultat alls) —
                        // samma FT/inte-FT-konvention som statusfiltret
                        // ovan i denna fil.
                        <span className="rounded-full bg-[#3987e5]/20 px-2 py-0.5 text-[#3987e5]">Kommande</span>
                      ) : f.events_synced_at ? (
                        <span className="rounded-full bg-[#0ca30c]/20 px-2 py-0.5 text-[#0ca30c]">Rapport tillgänglig</span>
                      ) : (
                        <span className="rounded-full bg-white/5 px-2 py-0.5">Bara resultat</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {fixtures.length === 0 && <p className="text-sm text-[#898781]">Inga matcher matchar filtret.</p>}
      </div>
    </div>
  );
}
