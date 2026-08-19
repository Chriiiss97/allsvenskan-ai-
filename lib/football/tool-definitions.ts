import type Anthropic from "@anthropic-ai/sdk";

/**
 * Verktygen Claude får tillgång till (tool-calling, se PROJEKT_BRIEF.md
 * "Generellt flöde"). `team`-parametern är begränsad till de två lag vi
 * faktiskt har statistik för (IFK Göteborg, AIK) — Claude förstår redan
 * smeknamn som "Blåvitt"/"Gnaget" och normaliserar dem till rätt värde här,
 * lib/football/resolve-team.ts hanterar sen stavning/diakritik.
 */
export const FOOTBALL_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_top_scorers",
    description:
      "Hämta målskyttar för IFK Göteborg eller AIK, rankade efter antal mål. " +
      "Utan 'season'/'all_seasons' ges senaste tillgängliga säsong.",
    input_schema: {
      type: "object",
      properties: {
        team: { type: "string", enum: ["IFK Göteborg", "AIK"] },
        season: { type: "integer", description: "Specifikt säsongsår, t.ex. 2024." },
        all_seasons: {
          type: "boolean",
          description: "Summera mål över alla importerade säsonger istället för en specifik.",
        },
        limit: { type: "integer", description: "Max antal spelare i svaret (default 10)." },
      },
      required: ["team"],
    },
  },
  {
    name: "get_cards",
    description: "Hämta gula/röda kort för spelare i IFK Göteborg eller AIK, rankade.",
    input_schema: {
      type: "object",
      properties: {
        team: { type: "string", enum: ["IFK Göteborg", "AIK"] },
        card_type: { type: "string", enum: ["yellow", "red"], description: "Default 'yellow'." },
        season: { type: "integer" },
        all_seasons: { type: "boolean" },
        limit: { type: "integer" },
      },
      required: ["team"],
    },
  },
  {
    name: "get_team_facts",
    description:
      "Hämta kvalitativ lagfakta: smeknamn, grundat år, kort historia, troféer, " +
      "klubblegendarer och rivaliteter för IFK Göteborg eller AIK.",
    input_schema: {
      type: "object",
      properties: {
        team: { type: "string", enum: ["IFK Göteborg", "AIK"] },
      },
      required: ["team"],
    },
  },
  {
    name: "get_fixtures",
    description:
      "Hämta senaste matcher/resultat för IFK Göteborg eller AIK. Ange 'opponent' för att " +
      "bara se inbördes möten mellan de två lagen (t.ex. matchhistorik i derbyt).",
    input_schema: {
      type: "object",
      properties: {
        team: { type: "string", enum: ["IFK Göteborg", "AIK"] },
        season: { type: "integer" },
        opponent: { type: "string", description: "Motståndarlagets namn, t.ex. \"AIK\"." },
        limit: { type: "integer" },
      },
      required: ["team"],
    },
  },
  {
    name: "get_league_facts",
    description: "Hämta fakta om Allsvenskan som liga: grundat år, format, historiska rekord.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "log_unanswered_question",
    description:
      "Logga en fråga du INTE kunde besvara med de andra verktygen (t.ex. om ett lag/en " +
      "säsong som inte finns i databasen). Använd den här ISTÄLLET för att gissa ett svar. " +
      "Efter att ha loggat: svara användaren ärligt att du inte har informationen än.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "Användarens fråga, i sin helhet." },
        reason: { type: "string", description: "Kort varför den inte kunde besvaras." },
      },
      required: ["question"],
    },
  },
];
