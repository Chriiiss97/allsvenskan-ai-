import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * Player Rating — Level 1 (rådata → säsongsaggregat per spelare).
 *
 * Källa: fixture_player_stats (PER MATCH), inte den säsongsaggregerade
 * `statistics`-tabellen Player DNA använder. Verifierat mot riktig data
 * (2024, minutes_played > 0): passes_accuracy 97,2 % täckning i
 * fixture_player_stats mot 14,7 % i statistics — samma mönster för skott/
 * dueller/dribblingar. En genuin datakvalitetsvinst, till priset av att
 * behöva sidnumrera en större radmängd (~9 584 rader/säsong mot ~460).
 *
 * fixture_player_stats saknar season_id (bekräftat i schemat) — måste
 * alltså hämta fixture-id:n för säsongen FÖRST, samma mönster som
 * team-rollup.ts:s getLeagueSeasonAverages redan använder för
 * fixture_team_stats.
 *
 * VIKTIGT, upptäckt under verifiering av den här filen (2026-08-21):
 * `fixture_player_stats.passes_accuracy` är INTE en procentsats — det är
 * ett RÅTT ANTAL lyckade passningar, trots namnet. Bekräftat mot riktig
 * data: en rad med passes_total=17, passes_accuracy=13 (17 passningar,
 * 13 lyckade = 76 % — inte "13 %", vilket vore orimligt för en match).
 * Samma fältnamn i den SÄSONGSAGGREGERADE `statistics`-tabellen (en annan
 * API-Football-endpoint, /players istället för /fixtures/players) ÄR
 * däremot en riktig procentsats där (bekräftat: värden 40–55 mot
 * passes_total i 1000-talet — rimligt för en hel säsong, skulle vara
 * absurt lågt om det vore ett antal). Samma fältnamn, olika betydelse
 * mellan två olika API-endpoints — inte gissat, verifierat mot riktiga
 * rader i båda tabellerna.
 */

interface FixturePlayerStatsRow {
  player_id: number | null;
  team_id: number;
  minutes_played: number | null;
  shots_total: number | null;
  shots_on_target: number | null;
  goals: number | null;
  goals_conceded: number | null;
  assists: number | null;
  saves: number | null;
  passes_total: number | null;
  passes_key: number | null;
  passes_accuracy: number | null;
  tackles_total: number | null;
  tackles_interceptions: number | null;
  duels_total: number | null;
  duels_won: number | null;
  dribbles_attempts: number | null;
  dribbles_success: number | null;
  /** Scout Engine (2026-08-21): fristående mått, INTE en del av OVR (se lib/football/rating/scout-metrics.ts) — hur ofta spelaren blir dribblad förbi. */
  dribbles_past: number | null;
  fouls_drawn: number | null;
  fouls_committed: number | null;
  player: { position: string | null; current_team_id: number | null; full_name: string; photo_url: string | null; birth_date: string | null } | null;
}

export interface PlayerSeasonAggregate {
  playerId: number;
  fullName: string;
  position: string | null;
  photoUrl: string | null;
  birthDate: string | null;
  teamId: number;
  appearances: number; // antal matcher med minutes_played > 0
  minutesPlayed: number;
  goals: number;
  assists: number;
  shotsTotal: number;
  shotsOnTarget: number;
  passesTotal: number;
  passesKey: number;
  /** sum(passes_accuracy)/sum(passes_total)*100 — se filbeskrivningen om varför passes_accuracy här är ett RÅTT ANTAL, inte en procentsats. null om ingen rad hade passningsdata. */
  passesAccuracyPct: number | null;
  tacklesTotal: number;
  tacklesInterceptions: number;
  duelsTotal: number;
  duelsWon: number;
  dribblesAttempts: number;
  dribblesSuccess: number;
  /**
   * Scout Engine (2026-08-21): fristående mått, INTE en del av OVR. `null`
   * om INGEN rad för spelaren hade fältet satt hela säsongen — skiljer
   * "genuint 0 gånger dribblad förbi" från "aldrig mätt för den här
   * spelaren" (samma princip som passesAccuracyPct). Verifierat nödvändigt:
   * fältet har bara 34 % radtäckning 2024, mot 55–92 % för de mått som
   * redan bygger OVR — utan den här skillnaden hade t.ex. målvakter (som
   * i praktiken aldrig får fältet satt) visats som "0, bäst i ligan"
   * istället för "ingen data".
   */
  dribblesPast: number | null;
  foulsDrawn: number;
  foulsCommitted: number;
  saves: number;
  goalsConceded: number;
  cleanSheetMatches: number; // matcher med goals_conceded=0 OCH minutes_played>=60 (målvakt)
  matchesWithMin60: number; // nämnare för clean-sheet-andel
}

/**
 * Hämtar och summerar HELA ligans säsong i ETT anrop (samma batch-princip
 * som Player DNA:s poolfråga) — ingen N+1-fråga per spelare. Används både
 * av enskild-profil-beräkning och Scout/topplista-batch.
 */
export async function aggregatePlayerSeasonStats(
  supabase: Supabase,
  params: { seasonId: number }
): Promise<Map<number, PlayerSeasonAggregate>> {
  const { data: fixtures, error: fixtureError } = await supabase
    .from("fixture")
    .select("id")
    .eq("season_id", params.seasonId)
    .eq("status", "FT");
  if (fixtureError) throw fixtureError;

  const fixtureIds = (fixtures ?? []).map((f) => f.id);
  if (fixtureIds.length === 0) return new Map();

  // ~9 584 rader/säsong (2024) — långt över Supabases 1000-radstak.
  // Sidnumrerar explicit, samma disciplin som team-rollup.ts/player-dna.ts.
  const rows: FixturePlayerStatsRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from("fixture_player_stats")
      .select(
        "player_id, team_id, minutes_played, shots_total, shots_on_target, goals, goals_conceded, assists, saves, passes_total, passes_key, passes_accuracy, tackles_total, tackles_interceptions, duels_total, duels_won, dribbles_attempts, dribbles_success, dribbles_past, fouls_drawn, fouls_committed, player:player_id(position, current_team_id, full_name, photo_url, birth_date)"
      )
      .in("fixture_id", fixtureIds)
      .gt("minutes_played", 0)
      .range(from, from + PAGE - 1)
      .returns<FixturePlayerStatsRow[]>();
    if (error) throw error;
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const byPlayer = new Map<number, PlayerSeasonAggregate & { passesAccurateSum: number; dribblesPastSum: number; hasDribblesPastData: boolean }>();

  for (const row of rows) {
    if (!row.player_id || !row.player) continue;
    const minutes = row.minutes_played ?? 0;

    let agg = byPlayer.get(row.player_id);
    if (!agg) {
      agg = {
        playerId: row.player_id,
        fullName: row.player.full_name,
        position: row.player.position,
        photoUrl: row.player.photo_url,
        birthDate: row.player.birth_date,
        teamId: row.player.current_team_id ?? row.team_id,
        appearances: 0,
        minutesPlayed: 0,
        goals: 0,
        assists: 0,
        shotsTotal: 0,
        shotsOnTarget: 0,
        passesTotal: 0,
        passesKey: 0,
        passesAccuracyPct: null,
        tacklesTotal: 0,
        tacklesInterceptions: 0,
        duelsTotal: 0,
        duelsWon: 0,
        dribblesAttempts: 0,
        dribblesSuccess: 0,
        dribblesPast: null,
        foulsDrawn: 0,
        foulsCommitted: 0,
        saves: 0,
        goalsConceded: 0,
        cleanSheetMatches: 0,
        matchesWithMin60: 0,
        passesAccurateSum: 0,
        dribblesPastSum: 0,
        hasDribblesPastData: false,
      };
      byPlayer.set(row.player_id, agg);
    }

    // team_id på aggregatet ska spegla laget spelaren FAKTISKT spelade för
    // den här säsongen (senaste matchraden), inte nödvändigtvis dagens
    // current_team_id — samma resonemang som players/page.tsx redan
    // etablerat för säsongsspecifika vyer.
    agg.teamId = row.team_id;
    agg.appearances += 1;
    agg.minutesPlayed += minutes;
    agg.goals += row.goals ?? 0;
    agg.assists += row.assists ?? 0;
    agg.shotsTotal += row.shots_total ?? 0;
    agg.shotsOnTarget += row.shots_on_target ?? 0;
    agg.passesTotal += row.passes_total ?? 0;
    agg.passesKey += row.passes_key ?? 0;
    if (row.passes_accuracy !== null) {
      // passes_accuracy är redan ett RÅTT ANTAL lyckade passningar i den
      // här tabellen (se filbeskrivningen) — inget /100 här.
      agg.passesAccurateSum += row.passes_accuracy;
    }
    agg.tacklesTotal += row.tackles_total ?? 0;
    agg.tacklesInterceptions += row.tackles_interceptions ?? 0;
    agg.duelsTotal += row.duels_total ?? 0;
    agg.duelsWon += row.duels_won ?? 0;
    agg.dribblesAttempts += row.dribbles_attempts ?? 0;
    agg.dribblesSuccess += row.dribbles_success ?? 0;
    if (row.dribbles_past !== null) {
      agg.dribblesPastSum += row.dribbles_past;
      agg.hasDribblesPastData = true;
    }
    agg.foulsDrawn += row.fouls_drawn ?? 0;
    agg.foulsCommitted += row.fouls_committed ?? 0;
    agg.saves += row.saves ?? 0;
    agg.goalsConceded += row.goals_conceded ?? 0;
    if (minutes >= 60) {
      agg.matchesWithMin60 += 1;
      if ((row.goals_conceded ?? 0) === 0) agg.cleanSheetMatches += 1;
    }
  }

  const result = new Map<number, PlayerSeasonAggregate>();
  for (const [playerId, agg] of byPlayer) {
    const { passesAccurateSum, dribblesPastSum, hasDribblesPastData, ...rest } = agg;
    result.set(playerId, {
      ...rest,
      // Volymviktat medel — INTE ett medel av procentsatser (skulle
      // snedvrida mot lågvolymmatcher, se filbeskrivningen).
      passesAccuracyPct: rest.passesTotal > 0 ? Math.round((passesAccurateSum / rest.passesTotal) * 1000) / 10 : null,
      dribblesPast: hasDribblesPastData ? dribblesPastSum : null,
    });
  }
  return result;
}
