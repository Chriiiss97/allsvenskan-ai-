/**
 * Handskrivna typer som speglar SQL-schemat i /supabase/migrations.
 *
 * När projektet är kopplat till ett riktigt Supabase-projekt kan denna fil
 * ersättas med en genererad version för att garantera 100% träffsäkerhet:
 *
 *   npx supabase gen types typescript --linked > lib/supabase/database.types.ts
 */

export type UserRole = "user" | "admin";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          role: UserRole;
          daily_message_count: number;
          quota_date: string;
          favorite_team_id: number | null;
          onboarding_completed_at: string | null;
          /** Fas 14.5 (redesign) — UI-lagrets premium-flagga, satt manuellt av admin (ingen riktig betalning än). */
          scout_access: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["profiles"]["Row"], "id">> & {
          id: string;
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      league: {
        Row: {
          id: number;
          external_id: number | null;
          name: string;
          country: string | null;
          type: string | null;
          logo_url: string | null;
          founded_year: number | null;
          short_history: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["league"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["league"]["Row"]>;
        Relationships: [];
      };
      league_fact: {
        Row: {
          id: number;
          league_id: number;
          label: string;
          description: string;
          year: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["league_fact"]["Row"]> & {
          league_id: number;
          label: string;
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["league_fact"]["Row"]>;
        Relationships: [];
      };
      season: {
        Row: {
          id: number;
          league_id: number;
          year: number;
          start_date: string | null;
          end_date: string | null;
          is_current: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["season"]["Row"]> & {
          league_id: number;
          year: number;
        };
        Update: Partial<Database["public"]["Tables"]["season"]["Row"]>;
        Relationships: [];
      };
      team: {
        Row: {
          id: number;
          external_id: number | null;
          name: string;
          short_name: string | null;
          logo_url: string | null;
          venue_name: string | null;
          venue_id: number | null;
          founded_year: number | null;
          nicknames: string[];
          short_history: string | null;
          website_url: string | null;
          /** Sportmonks eget lag-id. Sätts bara av scripts/import/sportmonks-map-teams.ts (Fas 1). */
          sportmonks_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["team"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["team"]["Row"]>;
        Relationships: [];
      };
      team_trophy: {
        Row: {
          id: number;
          team_id: number;
          competition: string;
          year: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["team_trophy"]["Row"]> & {
          team_id: number;
          competition: string;
          year: number;
        };
        Update: Partial<Database["public"]["Tables"]["team_trophy"]["Row"]>;
        Relationships: [];
      };
      team_legend: {
        Row: {
          id: number;
          team_id: number;
          name: string;
          period: string | null;
          role: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["team_legend"]["Row"]> & {
          team_id: number;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["team_legend"]["Row"]>;
        Relationships: [];
      };
      team_rivalry: {
        Row: {
          id: number;
          team_id: number;
          rival_team_id: number | null;
          rival_name: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["team_rivalry"]["Row"]> & {
          team_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["team_rivalry"]["Row"]>;
        Relationships: [];
      };
      player: {
        Row: {
          id: number;
          external_id: number | null;
          first_name: string | null;
          last_name: string | null;
          full_name: string;
          birth_date: string | null;
          nationality: string | null;
          position: string | null;
          photo_url: string | null;
          current_team_id: number | null;
          /** Sportmonks eget spelar-id. Sätts BARA från godkända sportmonks_player_mapping_candidate-rader (Fas 3) — aldrig direkt av ett importscript. */
          sportmonks_id: number | null;
          /** Fas 17 — avstämningsflagga för player_career_stint/player_trophy-importen (scripts/import/import-player-career.ts). Null = ännu inte körd. */
          career_synced_at: string | null;
          /** Fas 17b — senaste klubbytet enligt api-football /transfers, sparat i samma import. Jämförs mot current_team_id i UI:t för att flagga "har lämnat" — skriver ALDRIG över current_team_id självt. */
          latest_transfer_date: string | null;
          latest_transfer_team_name: string | null;
          latest_transfer_team_logo_url: string | null;
          latest_transfer_team_external_id: number | null;
          /** Fas 17c — rå transfertyp/-summa från api-football ("Free"/"Loan"/"€ 1.5M"/"N/A"). */
          latest_transfer_type: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["player"]["Row"]> & { full_name: string };
        Update: Partial<Database["public"]["Tables"]["player"]["Row"]>;
        Relationships: [];
      };
      fixture: {
        Row: {
          id: number;
          external_id: number | null;
          league_id: number;
          season_id: number;
          home_team_id: number;
          away_team_id: number;
          round: string | null;
          kickoff_at: string;
          status: string;
          home_score: number | null;
          away_score: number | null;
          venue_name: string | null;
          venue_id: number | null;
          referee_id: number | null;
          events_synced_at: string | null;
          lineups_synced_at: string | null;
          statistics_synced_at: string | null;
          player_stats_synced_at: string | null;
          /** Sportmonks eget fixture-id. Sätts av scripts/import/sportmonks-map-fixtures.ts (Fas 2). */
          sportmonks_id: number | null;
          sportmonks_advanced_stats_synced_at: string | null;
          sportmonks_xg_synced_at: string | null;
          sportmonks_pressure_synced_at: string | null;
          sportmonks_match_facts_synced_at: string | null;
          sportmonks_matchdata_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture"]["Row"]> & {
          league_id: number;
          season_id: number;
          home_team_id: number;
          away_team_id: number;
          kickoff_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["fixture"]["Row"]>;
        Relationships: [];
      };
      event: {
        Row: {
          id: number;
          fixture_id: number;
          team_id: number;
          player_id: number | null;
          assist_player_id: number | null;
          type: string;
          detail: string | null;
          comments: string | null;
          minute: number;
          extra_minute: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["event"]["Row"]> & {
          fixture_id: number;
          team_id: number;
          type: string;
          minute: number;
        };
        Update: Partial<Database["public"]["Tables"]["event"]["Row"]>;
        Relationships: [];
      };
      statistics: {
        Row: {
          id: number;
          player_id: number;
          team_id: number;
          league_id: number;
          season_id: number;
          appearances: number;
          minutes_played: number;
          goals: number;
          assists: number;
          yellow_cards: number;
          red_cards: number;
          shots_total: number | null;
          shots_on_target: number | null;
          rating: number | null;
          passes_total: number | null;
          passes_key: number | null;
          passes_accuracy: number | null;
          tackles_total: number | null;
          tackles_blocks: number | null;
          tackles_interceptions: number | null;
          duels_total: number | null;
          duels_won: number | null;
          dribbles_attempts: number | null;
          dribbles_success: number | null;
          fouls_drawn: number | null;
          fouls_committed: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["statistics"]["Row"]> & {
          player_id: number;
          team_id: number;
          league_id: number;
          season_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["statistics"]["Row"]>;
        Relationships: [];
      };
      venue: {
        Row: {
          id: number;
          external_id: number | null;
          name: string;
          address: string | null;
          city: string | null;
          country: string | null;
          capacity: number | null;
          surface: string | null;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["venue"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["venue"]["Row"]>;
        Relationships: [];
      };
      coach: {
        Row: {
          id: number;
          external_id: number | null;
          full_name: string;
          nationality: string | null;
          birth_date: string | null;
          photo_url: string | null;
          current_team_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["coach"]["Row"]> & { full_name: string };
        Update: Partial<Database["public"]["Tables"]["coach"]["Row"]>;
        Relationships: [];
      };
      referee: {
        Row: {
          id: number;
          full_name: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["referee"]["Row"]> & { full_name: string };
        Update: Partial<Database["public"]["Tables"]["referee"]["Row"]>;
        Relationships: [];
      };
      player_transfer_event: {
        Row: {
          id: number;
          player_id: number;
          transfer_date: string;
          from_team_name: string | null;
          from_team_external_id: number | null;
          from_team_logo_url: string | null;
          to_team_name: string;
          to_team_external_id: number | null;
          to_team_logo_url: string | null;
          transfer_type: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["player_transfer_event"]["Row"]> & {
          player_id: number;
          transfer_date: string;
          to_team_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["player_transfer_event"]["Row"]>;
        Relationships: [];
      };
      player_trophy: {
        Row: {
          id: number;
          player_id: number;
          league_name: string;
          country: string | null;
          season: string;
          place: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["player_trophy"]["Row"]> & {
          player_id: number;
          league_name: string;
          season: string;
          place: string;
        };
        Update: Partial<Database["public"]["Tables"]["player_trophy"]["Row"]>;
        Relationships: [];
      };
      player_career_stint: {
        Row: {
          id: number;
          player_id: number;
          team_name: string;
          team_logo_url: string | null;
          team_external_id: number | null;
          league_name: string;
          league_country: string | null;
          league_logo_url: string | null;
          league_external_id: number;
          season_year: number;
          appearances: number | null;
          lineups: number | null;
          minutes_played: number | null;
          goals: number | null;
          assists: number | null;
          yellow_cards: number | null;
          red_cards: number | null;
          rating: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["player_career_stint"]["Row"]> & {
          player_id: number;
          team_name: string;
          league_name: string;
          league_external_id: number;
          season_year: number;
        };
        Update: Partial<Database["public"]["Tables"]["player_career_stint"]["Row"]>;
        Relationships: [];
      };
      fixture_lineup: {
        Row: {
          id: number;
          fixture_id: number;
          team_id: number;
          coach_id: number | null;
          formation: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_lineup"]["Row"]> & {
          fixture_id: number;
          team_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_lineup"]["Row"]>;
        Relationships: [];
      };
      fixture_lineup_player: {
        Row: {
          id: number;
          fixture_lineup_id: number;
          player_id: number | null;
          is_starter: boolean;
          shirt_number: number | null;
          position: string | null;
          grid: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_lineup_player"]["Row"]> & {
          fixture_lineup_id: number;
          is_starter: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_lineup_player"]["Row"]>;
        Relationships: [];
      };
      fixture_player_stats: {
        Row: {
          id: number;
          fixture_id: number;
          team_id: number;
          player_id: number | null;
          minutes_played: number | null;
          position: string | null;
          shirt_number: number | null;
          rating: number | null;
          is_captain: boolean | null;
          is_substitute: boolean | null;
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
          tackles_blocks: number | null;
          tackles_interceptions: number | null;
          duels_total: number | null;
          duels_won: number | null;
          dribbles_attempts: number | null;
          dribbles_success: number | null;
          dribbles_past: number | null;
          fouls_drawn: number | null;
          fouls_committed: number | null;
          offsides: number | null;
          yellow_cards: number | null;
          red_cards: number | null;
          penalty_won: number | null;
          penalty_committed: number | null;
          penalty_scored: number | null;
          penalty_missed: number | null;
          penalty_saved: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_player_stats"]["Row"]> & {
          fixture_id: number;
          team_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_player_stats"]["Row"]>;
        Relationships: [];
      };
      fixture_team_stats: {
        Row: {
          id: number;
          fixture_id: number;
          team_id: number;
          shots_on_goal: number | null;
          shots_off_goal: number | null;
          shots_total: number | null;
          shots_blocked: number | null;
          shots_inside_box: number | null;
          shots_outside_box: number | null;
          fouls: number | null;
          corners: number | null;
          offsides: number | null;
          possession_pct: number | null;
          yellow_cards: number | null;
          red_cards: number | null;
          goalkeeper_saves: number | null;
          passes_total: number | null;
          passes_accurate: number | null;
          passes_pct: number | null;
          expected_goals: number | null;
          goals_prevented: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_team_stats"]["Row"]> & {
          fixture_id: number;
          team_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_team_stats"]["Row"]>;
        Relationships: [];
      };
      fixture_live_snapshots: {
        Row: {
          id: number;
          fixture_id: number;
          captured_at: string;
          match_minute: number | null;
          home_score: number | null;
          away_score: number | null;
          home_possession_pct: number | null;
          away_possession_pct: number | null;
          home_shots_total: number | null;
          away_shots_total: number | null;
          home_shots_on_target: number | null;
          away_shots_on_target: number | null;
          home_corners: number | null;
          away_corners: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_live_snapshots"]["Row"]> & {
          fixture_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_live_snapshots"]["Row"]>;
        Relationships: [];
      };
      player_injury: {
        Row: {
          id: number;
          player_id: number;
          kind: "sidelined" | "matchstatus";
          type: string | null;
          reason: string | null;
          start_date: string | null;
          end_date: string | null;
          fixture_id: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["player_injury"]["Row"]> & {
          player_id: number;
          kind: "sidelined" | "matchstatus";
        };
        Update: Partial<Database["public"]["Tables"]["player_injury"]["Row"]>;
        Relationships: [];
      };
      standings: {
        Row: {
          id: number;
          season_id: number;
          team_id: number;
          round: string | null;
          rank: number;
          points: number;
          goals_diff: number | null;
          played: number | null;
          win: number | null;
          draw: number | null;
          lose: number | null;
          goals_for: number | null;
          goals_against: number | null;
          home_played: number | null;
          home_win: number | null;
          home_draw: number | null;
          home_lose: number | null;
          home_goals_for: number | null;
          home_goals_against: number | null;
          away_played: number | null;
          away_win: number | null;
          away_draw: number | null;
          away_lose: number | null;
          away_goals_for: number | null;
          away_goals_against: number | null;
          form: string | null;
          captured_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["standings"]["Row"]> & {
          season_id: number;
          team_id: number;
          rank: number;
          points: number;
        };
        Update: Partial<Database["public"]["Tables"]["standings"]["Row"]>;
        Relationships: [];
      };
      api_raw_response: {
        Row: {
          id: number;
          endpoint: string;
          params: Record<string, unknown>;
          fixture_id: number | null;
          response: unknown;
          fetched_at: string;
          /** 'api-football' | 'sportmonks'. Default 'api-football' (befintliga rader). */
          source: string;
        };
        Insert: Partial<Database["public"]["Tables"]["api_raw_response"]["Row"]> & {
          endpoint: string;
          params: Record<string, unknown>;
          response: unknown;
        };
        Update: Partial<Database["public"]["Tables"]["api_raw_response"]["Row"]>;
        Relationships: [];
      };
      ingestion_log: {
        Row: {
          id: number;
          job_name: string;
          endpoint: string;
          params: Record<string, unknown> | null;
          calls_used: number;
          rows_written: number;
          status: "success" | "error" | "partial";
          error_message: string | null;
          started_at: string;
          finished_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ingestion_log"]["Row"]> & {
          job_name: string;
          endpoint: string;
        };
        Update: Partial<Database["public"]["Tables"]["ingestion_log"]["Row"]>;
        Relationships: [];
      };
      unanswered_questions: {
        Row: {
          id: number;
          user_id: string | null;
          question_text: string;
          context: string | null;
          resolved: boolean;
          admin_notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["unanswered_questions"]["Row"]> & {
          question_text: string;
        };
        Update: Partial<Database["public"]["Tables"]["unanswered_questions"]["Row"]>;
        Relationships: [];
      };
      conversation: {
        Row: {
          id: number;
          user_id: string;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["conversation"]["Row"]> & { user_id: string };
        Update: Partial<Database["public"]["Tables"]["conversation"]["Row"]>;
        Relationships: [];
      };
      message: {
        Row: {
          id: number;
          conversation_id: number;
          role: "user" | "assistant";
          content: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["message"]["Row"]> & {
          conversation_id: number;
          role: "user" | "assistant";
          content: string;
        };
        Update: Partial<Database["public"]["Tables"]["message"]["Row"]>;
        Relationships: [];
      };
      message_tool_call: {
        Row: {
          id: number;
          message_id: number;
          tool_name: string;
          team: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["message_tool_call"]["Row"]> & {
          message_id: number;
          tool_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["message_tool_call"]["Row"]>;
        Relationships: [];
      };
      message_usage: {
        Row: {
          id: number;
          message_id: number;
          model: string;
          input_tokens: number;
          output_tokens: number;
          latency_ms: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["message_usage"]["Row"]> & {
          message_id: number;
          model: string;
        };
        Update: Partial<Database["public"]["Tables"]["message_usage"]["Row"]>;
        Relationships: [];
      };
      feature_flag: {
        Row: {
          key: string;
          label: string;
          enabled: boolean;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["feature_flag"]["Row"]> & {
          key: string;
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["feature_flag"]["Row"]>;
        Relationships: [];
      };
      player_season_rating: {
        Row: {
          id: number;
          player_id: number;
          season_id: number;
          position_group: "goalkeeper" | "defender" | "midfielder" | "attacker";
          ovr: number | null;
          confidence_tier: "hög" | "medel" | "låg" | null;
          own_minutes: number;
          computed_at: string;
          /** shooting/passing/dribbling/defending — bara utespelare, null för målvakter. Se position-rating-config.ts. */
          category_scores: Record<string, number> | null;
          /** Per mått: {value, percentile}. Täcker både OVR-mått och fristående Scout-mått (t.ex. dribblesPastPer90) — se lib/football/rating/scout-metrics.ts. */
          metric_values: Record<string, { value: number; percentile: number; peerAverage: number }> | null;
          /** Antal peers confidence-bedömningen byggde på. Se lib/football/rating/rating-store.ts:s snabba läsväg. */
          peer_count: number | null;
        };
        Insert: Partial<Database["public"]["Tables"]["player_season_rating"]["Row"]> & {
          player_id: number;
          season_id: number;
          position_group: "goalkeeper" | "defender" | "midfielder" | "attacker";
        };
        Update: Partial<Database["public"]["Tables"]["player_season_rating"]["Row"]>;
        Relationships: [];
      };
      // --- Sportmonks-integration (Fas 0, 20260821150000_sportmonks_foundation.sql) ---
      sportmonks_type: {
        Row: {
          id: number;
          name: string;
          code: string | null;
          stat_group: string | null;
          raw: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sportmonks_type"]["Row"]> & {
          id: number;
          name: string;
          raw: unknown;
        };
        Update: Partial<Database["public"]["Tables"]["sportmonks_type"]["Row"]>;
        Relationships: [];
      };
      sportmonks_player_mapping_candidate: {
        Row: {
          id: number;
          player_id: number;
          sportmonks_player_id: number;
          sportmonks_name: string;
          team_id: number | null;
          match_basis: "name_and_dob" | "name_only" | "fuzzy_name_and_dob" | "fuzzy_name" | "manual";
          confidence: "high" | "medium" | "low";
          score: number | null;
          status: "pending" | "approved" | "rejected";
          reviewed_by: string | null;
          reviewed_at: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sportmonks_player_mapping_candidate"]["Row"]> & {
          player_id: number;
          sportmonks_player_id: number;
          sportmonks_name: string;
          match_basis: "name_and_dob" | "name_only" | "fuzzy_name_and_dob" | "fuzzy_name" | "manual";
          confidence: "high" | "medium" | "low";
        };
        Update: Partial<Database["public"]["Tables"]["sportmonks_player_mapping_candidate"]["Row"]>;
        Relationships: [];
      };
      fixture_player_advanced_stats: {
        Row: {
          id: number;
          fixture_id: number;
          team_id: number;
          player_id: number | null;
          touches: number | null;
          ball_recovery: number | null;
          possession_lost: number | null;
          turnovers: number | null;
          passes_final_third: number | null;
          backward_passes: number | null;
          total_crosses: number | null;
          accurate_crosses: number | null;
          successful_crosses_pct: number | null;
          aerials_total: number | null;
          aerials_won: number | null;
          aerials_lost: number | null;
          aerials_won_pct: number | null;
          long_balls: number | null;
          long_balls_won: number | null;
          long_balls_won_pct: number | null;
          big_chances_created: number | null;
          big_chances_missed: number | null;
          chances_created: number | null;
          tackles_won: number | null;
          tackles_won_pct: number | null;
          duels_won_pct: number | null;
          passes_accuracy_pct: number | null;
          clearances: number | null;
          clearance_offline: number | null;
          error_lead_to_shot: number | null;
          hit_woodwork: number | null;
          dispossessed: number | null;
          man_of_match: boolean | null;
          gk_good_high_claim: number | null;
          gk_saves_insidebox: number | null;
          gk_punches: number | null;
          xg: number | null;
          xgot: number | null;
          /** Overifierade type_id, {type_id: värde} — se migrationens filhuvud. Konsumeras INTE av analyskod förrän verifierat. */
          raw_types: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_player_advanced_stats"]["Row"]> & {
          fixture_id: number;
          team_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_player_advanced_stats"]["Row"]>;
        Relationships: [];
      };
      fixture_team_advanced_stats: {
        Row: {
          id: number;
          fixture_id: number;
          team_id: number;
          attacks: number | null;
          dangerous_attacks: number | null;
          ball_safe: number | null;
          long_passes: number | null;
          successful_long_passes: number | null;
          successful_long_passes_pct: number | null;
          total_crosses: number | null;
          accurate_crosses: number | null;
          big_chances_created: number | null;
          big_chances_missed: number | null;
          hit_woodwork: number | null;
          injuries: number | null;
          successful_passes_pct: number | null;
          successful_dribbles_pct: number | null;
          raw_types: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_team_advanced_stats"]["Row"]> & {
          fixture_id: number;
          team_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_team_advanced_stats"]["Row"]>;
        Relationships: [];
      };
      fixture_team_xg: {
        Row: {
          id: number;
          fixture_id: number;
          team_id: number;
          xg: number | null;
          xgot: number | null;
          npxg: number | null;
          xg_open_play: number | null;
          xg_set_play: number | null;
          xg_corners: number | null;
          xg_free_kicks: number | null;
          xg_penalties: number | null;
          xg_difference: number | null;
          xg_against: number | null;
          xg_prevented: number | null;
          xpts: number | null;
          /** type_id 9685 "Shooting Performance" — bekräftat befolkad, INNEBÖRD OVERIFIERAD. Får inte användas av analyskod. */
          shooting_performance: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_team_xg"]["Row"]> & {
          fixture_id: number;
          team_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_team_xg"]["Row"]>;
        Relationships: [];
      };
      fixture_pressure_index: {
        Row: {
          id: number;
          fixture_id: number;
          team_id: number;
          minute: number;
          pressure: number;
          sportmonks_row_id: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_pressure_index"]["Row"]> & {
          fixture_id: number;
          team_id: number;
          minute: number;
          pressure: number;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_pressure_index"]["Row"]>;
        Relationships: [];
      };
      fixture_match_facts: {
        Row: {
          id: number;
          fixture_id: number;
          sportmonks_type_id: number;
          team_id: number | null;
          player_id: number | null;
          participant: string | null;
          basis: string | null;
          scope: string | null;
          value_shape: "scalar" | "home_away" | "distribution" | "other";
          data: unknown;
          natural_language: string | null;
          category: string | null;
          sportmonks_row_id: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_match_facts"]["Row"]> & {
          fixture_id: number;
          sportmonks_type_id: number;
          value_shape: "scalar" | "home_away" | "distribution" | "other";
          data: unknown;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_match_facts"]["Row"]>;
        Relationships: [];
      };
      // --- Fas 5b: matchhändelse-/live-lager (20260821160000) ---
      fixture_sportmonks_event: {
        Row: {
          id: number;
          fixture_id: number;
          sportmonks_event_id: number;
          type_id: number;
          sub_type_id: number | null;
          team_id: number | null;
          sportmonks_team_id: number | null;
          player_id: number | null;
          sportmonks_player_id: number | null;
          related_player_id: number | null;
          sportmonks_related_player_id: number | null;
          player_name: string | null;
          related_player_name: string | null;
          result: string | null;
          info: string | null;
          addition: string | null;
          minute: number | null;
          extra_minute: number | null;
          injured: boolean | null;
          on_bench: boolean | null;
          rescinded: boolean | null;
          sort_order: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_sportmonks_event"]["Row"]> & {
          fixture_id: number;
          sportmonks_event_id: number;
          type_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_sportmonks_event"]["Row"]>;
        Relationships: [];
      };
      fixture_stat_trend: {
        Row: {
          id: number;
          fixture_id: number;
          team_id: number | null;
          sportmonks_team_id: number | null;
          type_id: number;
          minute: number;
          value: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_stat_trend"]["Row"]> & {
          fixture_id: number;
          type_id: number;
          minute: number;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_stat_trend"]["Row"]>;
        Relationships: [];
      };
      fixture_weather: {
        Row: {
          id: number;
          fixture_id: number;
          sportmonks_weather_id: number | null;
          temperature_day: number | null;
          temperature_morning: number | null;
          temperature_evening: number | null;
          temperature_night: number | null;
          feels_like_day: number | null;
          wind_speed: number | null;
          wind_direction: number | null;
          humidity_pct: number | null;
          pressure: number | null;
          clouds_pct: number | null;
          description: string | null;
          report_type: string | null;
          raw: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_weather"]["Row"]> & { fixture_id: number; raw: unknown };
        Update: Partial<Database["public"]["Tables"]["fixture_weather"]["Row"]>;
        Relationships: [];
      };
      fixture_sportmonks_metadata: {
        Row: {
          id: number;
          fixture_id: number;
          type_id: number;
          value_type: string | null;
          values: unknown;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fixture_sportmonks_metadata"]["Row"]> & {
          fixture_id: number;
          type_id: number;
          values: unknown;
        };
        Update: Partial<Database["public"]["Tables"]["fixture_sportmonks_metadata"]["Row"]>;
        Relationships: [];
      };
      /** Fas 14.4 (redesign) — /scout/shortlist. RLS-scopad på auth.uid(), ingen delning mellan användare. */
      scout_shortlist_player: {
        Row: {
          id: number;
          user_id: string;
          player_id: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["scout_shortlist_player"]["Row"]> & {
          user_id: string;
          player_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["scout_shortlist_player"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      set_favorite_team: {
        Args: { p_team_id: number | null };
        Returns: undefined;
      };
      /** Fas 14.5 (redesign) — enda skrivvägen till profiles.scout_access, SECURITY DEFINER + is_admin()-koll internt. */
      set_scout_access: {
        Args: { p_user_id: string; p_enabled: boolean };
        Returns: undefined;
      };
      increment_message_quota: {
        Args: { p_daily_limit: number };
        Returns: { allowed: boolean; message_count: number }[];
      };
    };
  };
}
