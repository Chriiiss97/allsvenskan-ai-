import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import type { Database } from "@/lib/supabase/database.types";
import {
  getTopScorers,
  getCards,
  getTeamFacts,
  getFixtures,
  getLeagueFacts,
  getMatchReportForTeams,
  FootballDataError,
} from "./tools";

type Supabase = SupabaseClient<Database>;

interface DispatchContext {
  supabase: Supabase;
  userId: string;
}

/**
 * Kör det verktyg Claude valt (ett tool_use-block) och returnerar en sträng
 * att skicka tillbaka som tool_result. FootballDataError (okänt lag/säsong)
 * fångas och skickas tillbaka som ett vanligt fel-resultat, inte en krasch —
 * Claude hanterar det enligt systemprompten (t.ex. log_unanswered_question).
 */
export async function dispatchTool(
  toolUse: Anthropic.ToolUseBlock,
  context: DispatchContext
): Promise<{ content: string; isError: boolean }> {
  const input = (toolUse.input ?? {}) as Record<string, unknown>;

  try {
    switch (toolUse.name) {
      case "get_top_scorers": {
        const result = await getTopScorers(context.supabase, {
          team: String(input.team ?? ""),
          season: typeof input.season === "number" ? input.season : undefined,
          allSeasons: Boolean(input.all_seasons),
          limit: typeof input.limit === "number" ? input.limit : undefined,
        });
        return { content: JSON.stringify(result), isError: false };
      }
      case "get_cards": {
        const result = await getCards(context.supabase, {
          team: String(input.team ?? ""),
          cardType: input.card_type === "red" ? "red" : "yellow",
          season: typeof input.season === "number" ? input.season : undefined,
          allSeasons: Boolean(input.all_seasons),
          limit: typeof input.limit === "number" ? input.limit : undefined,
        });
        return { content: JSON.stringify(result), isError: false };
      }
      case "get_team_facts": {
        const result = await getTeamFacts(context.supabase, String(input.team ?? ""));
        return { content: JSON.stringify(result), isError: false };
      }
      case "get_fixtures": {
        const result = await getFixtures(context.supabase, {
          team: String(input.team ?? ""),
          season: typeof input.season === "number" ? input.season : undefined,
          opponent: typeof input.opponent === "string" ? input.opponent : undefined,
          limit: typeof input.limit === "number" ? input.limit : undefined,
        });
        return { content: JSON.stringify(result), isError: false };
      }
      case "get_match_report": {
        const result = await getMatchReportForTeams(context.supabase, {
          team: String(input.team ?? ""),
          opponent: typeof input.opponent === "string" ? input.opponent : undefined,
          season: typeof input.season === "number" ? input.season : undefined,
        });
        return { content: JSON.stringify(result), isError: false };
      }
      case "get_league_facts": {
        const result = await getLeagueFacts(context.supabase);
        return { content: JSON.stringify(result), isError: false };
      }
      case "log_unanswered_question": {
        const question = typeof input.question === "string" ? input.question : "";
        const reason = typeof input.reason === "string" ? input.reason : null;
        const { error } = await context.supabase.from("unanswered_questions").insert({
          user_id: context.userId,
          question_text: question,
          context: reason,
        });
        if (error) {
          return { content: `Kunde inte logga frågan: ${error.message}`, isError: true };
        }
        return { content: "Frågan är loggad.", isError: false };
      }
      default:
        return { content: `Okänt verktyg: ${toolUse.name}`, isError: true };
    }
  } catch (err) {
    if (err instanceof FootballDataError) {
      return { content: err.message, isError: true };
    }
    return { content: "Internt fel vid verktygsanrop.", isError: true };
  }
}
