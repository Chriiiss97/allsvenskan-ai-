/**
 * Manuellt insamlad, strukturerad fakta om Allsvenskan (ligan, inte enskilda
 * lag). Samma princip som team-facts-data.ts: omformulerat från källor
 * (svenska Wikipedia), inte rakt kopierat.
 */

export interface LeagueFacts {
  externalId: number;
  foundedYear: number;
  shortHistory: string;
  facts: Array<{ label: string; description: string; year?: number }>;
}

export const LEAGUE_FACTS: LeagueFacts = {
  externalId: 113, // Allsvenskan
  foundedYear: 1924,
  shortHistory:
    "Allsvenskan är Sveriges högsta division i herrfotboll och grundades den 13 januari 1924. " +
    "Sedan 2008 spelar 16 lag i serien, som pågår från vår till höst med 30 omgångar där alla " +
    "möter alla två gånger. De två sistplacerade lagen flyttas ner till Superettan, medan " +
    "trean nedifrån möter Superettans tredje- eller fjärdeplacerade lag i kvalspel.",
  facts: [
    {
      label: "Flest SM-guld",
      description: "Malmö FF är genom tiderna mest framgångsrika klubb med 24 SM-guld.",
    },
    {
      label: "Målrekord i en säsong",
      description:
        'Filip "Svarte-Filip" Johansson (IFK Göteborg) gjorde 39 mål på en säsong 1924/25 — rekordet står sig än idag.',
      year: 1924,
    },
    {
      label: "Publikrekord",
      description:
        "52 194 åskådare såg derbyt IFK Göteborg–Örgryte IS på Ullevi 1959, fortfarande svenskt publikrekord för en fotbollsmatch.",
      year: 1959,
    },
    {
      label: "Publiksnitt",
      description:
        "2023 sågs över 2,4 miljoner besökare totalt under säsongen — första gången snittet passerade 10 000 åskådare/match sedan utökningen till 16 lag 2008.",
      year: 2023,
    },
  ],
};
