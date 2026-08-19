import { apiFootballGetAllPages } from "../../lib/api-football/client";
import type { ApiPlayerResponse } from "../../lib/api-football/types";
import { createAdminClient } from "./admin-client";
import { ALLSVENSKAN_LEAGUE_EXTERNAL_ID, IMPORT_SEASONS, IMPORT_TEAMS } from "./config";

export async function importPlayersAndStatistics() {
  const supabase = createAdminClient();

  const { data: league } = await supabase
    .from("league")
    .select("id")
    .eq("external_id", ALLSVENSKAN_LEAGUE_EXTERNAL_ID)
    .single();
  if (!league) throw new Error("Liga saknas i databasen — kör 'league'-steget först.");

  const { data: teamRows } = await supabase
    .from("team")
    .select("id, external_id")
    .in(
      "external_id",
      IMPORT_TEAMS.map((t) => t.externalId)
    );
  const teamIdByExternal = new Map((teamRows ?? []).map((t) => [t.external_id, t.id]));

  // Säsonger i stigande ordning i YTTRE loop, lag i inre: garanterar att
  // player.current_team_id (bekvämlighetsfält) hamnar på det lag spelaren
  // senast spelade för av de importerade säsongerna, oavsett i vilken
  // ordning lagen står i IMPORT_TEAMS.
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

    for (const team of IMPORT_TEAMS) {
      const teamId = teamIdByExternal.get(team.externalId);
      if (!teamId) {
        console.warn(`! Lag ${team.name} saknas i databasen, hoppar över.`);
        continue;
      }

      console.log(`Hämtar spelare: ${team.name} ${year}...`);
      const players = await apiFootballGetAllPages<ApiPlayerResponse>("/players", {
        team: team.externalId,
        league: ALLSVENSKAN_LEAGUE_EXTERNAL_ID,
        season: year,
      });

      let saved = 0;
      for (const p of players) {
        const stat = p.statistics.find(
          (s) => s.team.id === team.externalId && s.league.id === ALLSVENSKAN_LEAGUE_EXTERNAL_ID
        );
        if (!stat) continue;

        const { data: playerRow, error: playerError } = await supabase
          .from("player")
          .upsert(
            {
              external_id: p.player.id,
              first_name: p.player.firstname,
              last_name: p.player.lastname,
              full_name: p.player.name,
              birth_date: p.player.birth.date,
              nationality: p.player.nationality,
              position: stat.games.position,
              photo_url: p.player.photo,
              current_team_id: teamId,
            },
            { onConflict: "external_id" }
          )
          .select("id")
          .single();
        if (playerError || !playerRow) {
          throw playerError ?? new Error(`Kunde inte spara spelare ${p.player.name}`);
        }

        const { error: statError } = await supabase.from("statistics").upsert(
          {
            player_id: playerRow.id,
            team_id: teamId,
            league_id: league.id,
            season_id: seasonRow.id,
            appearances: stat.games.appearences ?? 0,
            minutes_played: stat.games.minutes ?? 0,
            goals: stat.goals.total ?? 0,
            assists: stat.goals.assists ?? 0,
            yellow_cards: stat.cards.yellow ?? 0,
            red_cards: (stat.cards.red ?? 0) + (stat.cards.yellowred ?? 0),
            shots_total: stat.shots.total,
            shots_on_target: stat.shots.on,
            rating: stat.games.rating ? Number(stat.games.rating) : null,
            passes_total: stat.passes.total,
            passes_key: stat.passes.key,
            passes_accuracy: stat.passes.accuracy,
            tackles_total: stat.tackles.total,
            tackles_blocks: stat.tackles.blocks,
            tackles_interceptions: stat.tackles.interceptions,
            duels_total: stat.duels.total,
            duels_won: stat.duels.won,
            dribbles_attempts: stat.dribbles.attempts,
            dribbles_success: stat.dribbles.success,
            fouls_drawn: stat.fouls.drawn,
            fouls_committed: stat.fouls.committed,
          },
          { onConflict: "player_id,team_id,league_id,season_id" }
        );
        if (statError) throw statError;
        saved += 1;
      }

      console.log(`  ✓ ${saved}/${players.length} spelare sparade (${team.name} ${year})`);
    }
  }
}
