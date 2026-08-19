import { createClient } from "@/lib/supabase/server";

/**
 * Tillfällig, publik förhandsvisning av den importerade datan (steg 3).
 * Ingen auth-koll här medvetet — bara till för att visuellt verifiera att
 * import-scriptet faktiskt fyllt databasen, innan det riktiga tool-lagret
 * och chat-UI:t (steg 5–7) byggs. Kan tas bort eller byggas om senare.
 */

interface StatRow {
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  appearances: number;
  player: { full_name: string } | null;
  team: { name: string } | null;
  season: { year: number } | null;
}

interface FixtureRow {
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  round: string | null;
  home: { name: string } | null;
  away: { name: string } | null;
  season: { year: number } | null;
}

interface TeamFactsRow {
  name: string;
  nicknames: string[];
  founded_year: number | null;
  short_history: string | null;
  team_trophy: Array<{ competition: string; year: number }>;
  team_legend: Array<{ name: string; period: string | null; role: string | null }>;
  team_rivalry: Array<{ rival_name: string | null; description: string | null }>;
}

export default async function StatsPreviewPage() {
  const supabase = await createClient();

  const { data: statsData, error: statsError } = await supabase
    .from("statistics")
    .select(
      "goals, assists, yellow_cards, red_cards, appearances, player:player_id(full_name), team:team_id(name), season:season_id(year)"
    )
    .order("goals", { ascending: false })
    .returns<StatRow[]>();

  const { data: fixturesData, error: fixturesError } = await supabase
    .from("fixture")
    .select(
      "kickoff_at, status, home_score, away_score, round, home:home_team_id(name), away:away_team_id(name), season:season_id(year)"
    )
    .order("kickoff_at", { ascending: false })
    .limit(8)
    .returns<FixtureRow[]>();

  const { data: factsData, error: factsError } = await supabase
    .from("team")
    .select(
      "name, nicknames, founded_year, short_history, team_trophy(competition, year), team_legend(name, period, role), team_rivalry!team_rivalry_team_id_fkey(rival_name, description)"
    )
    .in("external_id", [366, 377])
    .returns<TeamFactsRow[]>();

  const stats = statsData ?? [];
  const fixtures = fixturesData ?? [];
  const teamFacts = factsData ?? [];

  // Gruppera målskyttar per lag + säsong, topp 5 vardera.
  const groups = new Map<string, StatRow[]>();
  for (const row of stats) {
    if (!row.team || !row.season) continue;
    const key = `${row.team.name} — ${row.season.year}`;
    const list = groups.get(key) ?? [];
    if (list.length < 5) list.push(row);
    groups.set(key, list);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Statistik — förhandsvisning</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Rådata importerad från API-Football (2022–2024, IFK Göteborg &amp; AIK). Ingen
        inloggning krävs för den här sidan — den finns bara för att visa att importen fungerade
        innan chattlagret är byggt.
      </p>

      {(statsError || fixturesError || factsError) && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          Kunde inte hämta data: {statsError?.message ?? fixturesError?.message ?? factsError?.message}
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-medium">Lagfakta</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {teamFacts.map((t) => (
            <div key={t.name} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
              <h3 className="text-sm font-semibold">
                {t.name} {t.founded_year && <span className="font-normal">(grundat {t.founded_year})</span>}
              </h3>
              <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                {t.nicknames.join(" · ")}
              </p>
              <p className="mt-2 text-sm">{t.short_history}</p>
              <p className="mt-3 text-xs text-black/50 dark:text-white/50">
                {t.team_trophy.filter((tr) => tr.competition === "SM-guld").length} SM-guld ·{" "}
                {t.team_trophy.filter((tr) => tr.competition === "Svenska Cupen").length} Svenska
                Cupen
                {t.team_trophy.some((tr) => tr.competition === "Uefacupen") &&
                  ` · ${t.team_trophy.filter((tr) => tr.competition === "Uefacupen").length} Uefacupen`}
              </p>
              <ul className="mt-3 space-y-1 text-xs">
                {t.team_legend.map((l) => (
                  <li key={l.name}>
                    <strong>{l.name}</strong>
                    {l.role && ` — ${l.role}`}
                    {l.period && ` (${l.period})`}
                  </li>
                ))}
              </ul>
              {t.team_rivalry.length > 0 && (
                <p className="mt-3 text-xs text-black/50 dark:text-white/50">
                  Rival: {t.team_rivalry.map((r) => r.rival_name).join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Målskyttar per lag och säsong</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {[...groups.entries()].map(([key, players]) => (
            <div
              key={key}
              className="rounded-lg border border-black/10 p-4 dark:border-white/15"
            >
              <h3 className="text-sm font-semibold">{key}</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {players.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{p.player?.full_name}</span>
                    <span className="text-black/50 dark:text-white/50">
                      {p.goals} mål · {p.assists} assist · {p.yellow_cards}🟨{" "}
                      {p.red_cards > 0 ? `${p.red_cards}🟥` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Senast importerade matcher</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {fixtures.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 border-b border-black/5 pb-2 dark:border-white/10"
            >
              <span>
                {f.home?.name} {f.home_score ?? "–"}–{f.away_score ?? "–"} {f.away?.name}
              </span>
              <span className="text-black/50 dark:text-white/50">
                {f.season?.year} · {f.round} · {f.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
