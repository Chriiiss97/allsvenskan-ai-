import { apiFootballGet } from "../../lib/api-football/client";
import type { ApiStandingsResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { ALLSVENSKAN_LEAGUE_EXTERNAL_ID, IMPORT_SEASONS } from "./config";

/**
 * Importerar sluttabellen för varje säsong (ett anrop/säsong). Append-only —
 * varje körning lägger till en ny captured_at-snapshot istället för att
 * skriva över, så "tabellposition över tid" blir möjligt senare (se planen).
 * För redan avslutade säsonger (2022–2024) blir det förstås bara EN
 * meningsfull snapshot (sluttabellen) tills vi kör det här upprepat under en
 * pågående säsong.
 */
export async function importStandings() {
  const supabase = createAdminClient();

  const { data: league } = await supabase
    .from("league")
    .select("id")
    .eq("external_id", ALLSVENSKAN_LEAGUE_EXTERNAL_ID)
    .single();
  if (!league) throw new Error("Liga saknas i databasen — kör 'league'-steget först.");

  const { data: teamRows } = await supabase.from("team").select("id, external_id");
  const teamIdByExternal = new Map((teamRows ?? []).map((t) => [t.external_id, t.id]));

  for (const year of IMPORT_SEASONS) {
    const { data: seasonRow } = await supabase
      .from("season")
      .select("id")
      .eq("league_id", league.id)
      .eq("year", year)
      .single();
    if (!seasonRow) {
      console.warn(`! Säsong ${year} saknas i databasen, hoppar över.`);
      continue;
    }

    console.log(`Hämtar tabell: Allsvenskan ${year}...`);
    const { data } = await apiFootballGet<ApiStandingsResponse>("/standings", {
      league: ALLSVENSKAN_LEAGUE_EXTERNAL_ID,
      season: year,
    });
    const rows = data[0]?.league.standings[0] ?? [];

    let saved = 0;
    for (const r of rows) {
      const teamId = teamIdByExternal.get(r.team.id);
      if (!teamId) {
        console.warn(`  ! Okänt lag i tabellen (external_id ${r.team.id}, ${r.team.name}), hoppar över.`);
        continue;
      }

      const { error } = await supabase.from("standings").insert({
        season_id: seasonRow.id,
        team_id: teamId,
        rank: r.rank,
        points: r.points,
        goals_diff: r.goalsDiff,
        played: r.all.played,
        win: r.all.win,
        draw: r.all.draw,
        lose: r.all.lose,
        goals_for: r.all.goals.for,
        goals_against: r.all.goals.against,
        home_played: r.home.played,
        home_win: r.home.win,
        home_draw: r.home.draw,
        home_lose: r.home.lose,
        home_goals_for: r.home.goals.for,
        home_goals_against: r.home.goals.against,
        away_played: r.away.played,
        away_win: r.away.win,
        away_draw: r.away.draw,
        away_lose: r.away.lose,
        away_goals_for: r.away.goals.for,
        away_goals_against: r.away.goals.against,
        form: r.form,
      });
      if (error) throw error;
      saved += 1;
    }

    console.log(`  ✓ ${saved}/${rows.length} lag i tabellen (Allsvenskan ${year})`);
  }
}
