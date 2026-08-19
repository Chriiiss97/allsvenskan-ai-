/**
 * Manuellt insamlad, strukturerad lagfakta för IFK Göteborg och AIK.
 *
 * Källor: klubbarnas egna sidor + svenska Wikipedia. Fakta är omformulerade
 * till egna korta sammanfattningar (inte rakt kopierade stycken), enligt
 * principen i PROJEKT_BRIEF.md ("Kvalitativ lagdata"). Wikipedia-text är
 * CC BY-SA-licensierad och okej att använda som källa för fakta, men vi
 * citerar den inte direkt.
 *
 * Trofé-år är best-effort och bör dubbelkollas mot klubbarnas officiella
 * historik innan de visas som auktoritativt facit i produkt (samma
 * försiktighetsprincip som för all AI-sammanställd fakta).
 */

export interface TeamFacts {
  externalId: number;
  nicknames: string[];
  shortHistory: string;
  trophies: Array<{ competition: string; year: number }>;
  legends: Array<{ name: string; period?: string; role?: string; description: string }>;
  rivalries: Array<{ rivalExternalId?: number; rivalName: string; description: string }>;
}

export const TEAM_FACTS: TeamFacts[] = [
  {
    externalId: 366, // IFK Göteborg
    nicknames: ["Blåvitt", "Änglarna", "Kamraterna"],
    shortHistory:
      "IFK Göteborg grundades 1904 och är en av Sveriges mest framgångsrika fotbollsklubbar, " +
      "med 18 SM-guld och två Uefacupen-titlar (1982, 1987) — den senare bedriften gjorde " +
      "klubben till det enda svenska laget som vunnit en europeisk klubbturnering. Smeknamnet " +
      "\"Änglarna\" myntades i samband med den europeiska framgången på 1980-talet.",
    trophies: [
      ...[1908, 1910, 1918, 1935, 1942, 1958, 1969, 1982, 1983, 1984, 1987, 1990, 1991, 1993, 1994, 1995, 1996, 2007].map(
        (year) => ({ competition: "SM-guld", year })
      ),
      ...[1979, 1982, 1983, 1991, 2008, 2013, 2015, 2020].map((year) => ({
        competition: "Svenska Cupen",
        year,
      })),
      ...[1982, 1987].map((year) => ({ competition: "Uefacupen", year })),
    ],
    legends: [
      {
        name: "Torbjörn Nilsson",
        period: "1970–1980-talet",
        role: "Anfallare",
        description: "Flerfaldig skyttekung och nyckelspelare i klubbens framgångsrika 1980-tal.",
      },
      {
        name: "Glenn Strömberg",
        period: "1970–1980-talet",
        role: "Mittfältare",
        description: "Central mittfältsprofil under den europeiska guldeperioden.",
      },
      {
        name: "Thomas Wernersson",
        period: "1980-talet",
        role: "Målvakt",
        description: "Ordinarie målvakt under Uefacupen-titlarna 1982 och 1987.",
      },
      {
        name: 'Bertil "Bebben" Johansson',
        period: "1960–1980-talet",
        role: "Spelare/tränare",
        description:
          "Vann SM-guld som spelare 1969 och blev senare en ikonisk tränarprofil i klubben.",
      },
      {
        name: "Sven-Göran Eriksson",
        period: "1979–1982",
        role: "Tränare",
        description: "Tog över som tränare 1979 och byggde grunden för klubbens europeiska framgångar.",
      },
    ],
    rivalries: [
      {
        rivalExternalId: 2170, // Gais
        rivalName: "Gais",
        description: "Göteborgsderbyt — lokalrival från samma stad, ett av Sveriges mest publikdragande derbyn.",
      },
    ],
  },
  {
    externalId: 377, // AIK
    nicknames: ["Gnaget"],
    shortHistory:
      "AIK grundades 1891 och är en av Sveriges mest meriterade fotbollsklubbar med tolv " +
      "SM-guld genom historien. Smeknamnet \"Gnaget\" myntades i slutet av 1920-talet, efter " +
      "att lagets svarta matchtröjor blekts och sett gnagda ut.",
    trophies: [
      ...[1900, 1901, 1911, 1914, 1916, 1923, 1932, 1937, 1992, 1998, 2009, 2018].map((year) => ({
        competition: "SM-guld",
        year,
      })),
      ...[1949, 1950, 1976, 1985, 1996, 1997, 1999, 2009].map((year) => ({
        competition: "Svenska Cupen",
        year,
      })),
    ],
    legends: [
      {
        name: 'Gustav "Gurra" Sjöberg',
        period: "1932–1950",
        role: "Målvakt",
        description: "Spelade 321 allsvenska matcher för AIK — fortfarande klubbrekord.",
      },
      {
        name: "Kurt Hamrin",
        period: "1950-talet",
        role: "Anfallare",
        description:
          "En av Sveriges genom tiderna bästa anfallare, del av en framgångsrik AIK-kedja innan en lysande fortsatt karriär i Italien.",
      },
      {
        name: "Per Kaufeldt",
        role: "Anfallare",
        description: "Gjorde 122 mål för AIK, en av klubbens genom tiderna mest målfarliga spelare.",
      },
      {
        name: 'Sven "Dala" Dahlkvist',
        period: "1980-talet",
        role: "Mittfältare",
        description: "Guldbollen-vinnare och nyckelspelare i AIK under 1980-talet.",
      },
      {
        name: "Derek Boateng",
        period: "2003–2006",
        role: "Mittfältare",
        description:
          "Central profil när AIK tog sig tillbaka till Allsvenskan från Superettan i mitten av 2000-talet.",
      },
    ],
    rivalries: [
      {
        rivalExternalId: 364, // Djurgårdens IF
        rivalName: "Djurgårdens IF",
        description: "Tvillingderbyt/Stockholmsderbyt — Stockholms största och mest historiska fotbollsrivalitet.",
      },
      {
        rivalExternalId: 363, // Hammarby FF
        rivalName: "Hammarby",
        description: "Stockholmsderby mot Hammarby, en av flera lokala rivaliteter i huvudstaden.",
      },
    ],
  },
];
