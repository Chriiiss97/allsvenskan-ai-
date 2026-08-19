/**
 * Manuellt insamlad, strukturerad lagfakta för IFK Göteborg och AIK.
 *
 * Källor: klubbarnas egna officiella hemsidor (ifkgoteborg.se, aikfotboll.se)
 * + svenska Wikipedia som komplement. Fakta är omformulerade till egna korta
 * sammanfattningar (inte rakt kopierade stycken) enligt principen i
 * PROJEKT_BRIEF.md ("Kvalitativ lagdata") — gäller extra strikt för
 * klubbarnas egen webbtext, som är upphovsrättsskyddad (till skillnad från
 * Wikipedias CC BY-SA-text).
 *
 * Trofé-år för IFK Göteborg är bekräftade mot klubbens egen historiebeskrivning
 * (ifkgoteborg.se). AIK:s SM-guld/Svenska Cupen-år är bekräftade av
 * projektägaren mot klubbens egen sida (aikfotboll.se).
 */

export interface TeamFacts {
  externalId: number;
  nicknames: string[];
  shortHistory: string;
  websiteUrl: string;
  trophies: Array<{ competition: string; year: number }>;
  legends: Array<{ name: string; period?: string; role?: string; description: string }>;
  rivalries: Array<{ rivalExternalId?: number; rivalName: string; description: string }>;
}

export const TEAM_FACTS: TeamFacts[] = [
  {
    externalId: 366, // IFK Göteborg
    nicknames: ["Blåvitt", "Änglarna", "Kamraterna"],
    websiteUrl: "https://ifkgoteborg.se",
    shortHistory:
      "IFK Göteborg grundades den 4 oktober 1904 av en grupp göteborgare, däribland Arthur " +
      "Wingren och John Säwström, som samlades på Café Olivedal. Klubben är en av Sveriges mest " +
      "framgångsrika med 18 SM-guld, åtta Svenska Cupen-titlar och två Uefacupen-titlar (1982, " +
      "1987) — den enda svenska klubb som vunnit en europeisk cupturnering. IFK Göteborg har " +
      "även tagit sig till Champions League-gruppspel fyra gånger (1992/93, 1994/95, 1996/97, " +
      "1997/98), med en kvartsfinal mot Bayern München 1994/95 som bästa resultat. Smeknamnet " +
      '"Änglarna" myntades i samband med den europeiska framgången på 1980-talet.',
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
        description: "Guldbollen 1982, flerfaldig skyttekung och nyckelspelare i 1980-talets europeiska framgångar.",
      },
      {
        name: 'Gunnar "Il Professore" Gren',
        period: "1941–1949",
        role: "Anfallare",
        description:
          "En av Sveriges genom tiderna största spelare, del av SM-guldlaget 1942 innan en lysande fortsatt karriär i Italien.",
      },
      {
        name: 'Filip "Svarte-Filip" Johansson',
        period: "1920-talet",
        role: "Anfallare",
        description:
          "Blev Allsvenskans första skyttekung 1924 med 39 mål — ett rekord som fortfarande står sig.",
      },
      {
        name: 'Bertil "Bebben" Johansson',
        period: "1958–1980-talet",
        role: "Spelare/tränare",
        description:
          "Allsvensk skyttekung 1958 och SM-guld som spelare 1969, blev senare en ikonisk tränarprofil i klubben.",
      },
      {
        name: "Sven-Göran Eriksson",
        period: "1979–1982",
        role: "Tränare",
        description: "Tog över som tränare 1979 och ledde klubben till Uefacupen-titeln 1982.",
      },
      {
        name: "Glenn Strömberg",
        period: "1970–1980-talet",
        role: "Mittfältare",
        description: "Central mittfältsprofil under den europeiska guldeperioden.",
      },
    ],
    rivalries: [
      {
        rivalExternalId: 2170, // Gais
        rivalName: "Gais",
        description: "Göteborgsderbyt — lokalrival från samma stad, ett av Sveriges mest publikdragande derbyn.",
      },
      {
        rivalName: "Örgryte IS",
        description:
          "Historisk stadsrival — derbyt mot Örgryte på Ullevi 1959 drog 52 194 åskådare, fortfarande svenskt publikrekord.",
      },
    ],
  },
  {
    externalId: 377, // AIK
    nicknames: ["Gnaget"],
    websiteUrl: "https://www.aikfotboll.se",
    shortHistory:
      "AIK grundades 1891 och är en av Sveriges mest meriterade fotbollsklubbar med tolv " +
      "SM-guld och åtta Svenska Cupen-titlar. Klubben har spelat 92 säsonger i Allsvenskan och " +
      "har tagit sig till Champions League/Europacupen för mästare två gånger, 1993 och 1999. " +
      'Smeknamnet "Gnaget" myntades i slutet av 1920-talet, efter att lagets svarta matchtröjor ' +
      "blekts och sett gnagda ut.",
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
