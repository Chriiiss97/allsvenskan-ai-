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
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["league"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["league"]["Row"]>;
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
          founded_year: number | null;
          nicknames: string[];
          short_history: string | null;
          website_url: string | null;
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
          events_synced_at: string | null;
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
    };
    Views: Record<string, never>;
    Functions: {
      set_favorite_team: {
        Args: { p_team_id: number | null };
        Returns: undefined;
      };
    };
  };
}
