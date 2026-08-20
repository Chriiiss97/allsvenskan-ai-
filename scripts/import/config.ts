/**
 * Vilken liga, vilka säsonger och vilka lag import-scriptet hämtar.
 *
 * 2016–2026 (2026-08-20: utökat i två steg samma dag — först 2022–2024 till
 * 2022–2026 efter att ha bekräftat att Ultra ger tillgång till 2025 och
 * innevarande 2026-säsong; sedan hela vägen bak till 2016 efter att ha
 * bekräftat att a) API:t inte har NÅGON Allsvenskan-data före 2016
 * (/leagues?id=113 listar 2016 som äldsta säsong, inget gissat), och b) att
 * datan faktiskt är rik så långt bak — spot-checkat lineups/statistik/
 * events på fyra punkter (2016/2017/2019/2021), allt närvarande. Enda kända
 * luckan: /fixtures/players var tom för EN 2016-matchs stickprov — matchar
 * samma typ av gles-täckning-i-äldre-data som redan var känd, inte ett nytt
 * problem.
 *
 * 2026 kommer alltid ha en delmängd NS-matcher (ej spelade än) — förväntat,
 * inte ett importfel; events/lineups/statistik hämtas ändå bara för
 * FT/AET/PEN-matcher, samma filter som alltid.
 *
 * IMPORT_TEAMS listar alla lag som förekommit i Allsvenskan NÅGON av de här
 * elva säsongerna — upptäckt via /teams?league=&season=, inte gissat.
 * import-teams.ts är självförsörjande (hämtar hela ligans lag+arenor per
 * säsong utan att behöva den här listan), men import-players.ts och
 * import-fixtures.ts itererar fortfarande över IMPORT_TEAMS för sina
 * per-lag-scopade anrop.
 */

export const ALLSVENSKAN_LEAGUE_EXTERNAL_ID = 113;

export const IMPORT_SEASONS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026] as const;

export const IMPORT_TEAMS = [
  { externalId: 765, name: "AFC Eskilstuna" },
  { externalId: 377, name: "AIK Stockholm" },
  { externalId: 367, name: "BK Hacken" },
  { externalId: 368, name: "Dalkurd FF" },
  { externalId: 2172, name: "Degerfors IF" },
  { externalId: 364, name: "Djurgardens IF" },
  { externalId: 812, name: "Falkenbergs FF" },
  { externalId: 2170, name: "Gais" },
  { externalId: 813, name: "Gefle IF" },
  { externalId: 373, name: "GIF Sundsvall" },
  { externalId: 766, name: "Halmstad" },
  { externalId: 363, name: "Hammarby FF" },
  { externalId: 811, name: "Helsingborg" },
  { externalId: 371, name: "IF Brommapojkarna" },
  { externalId: 372, name: "IF Elfsborg" },
  { externalId: 366, name: "IFK Goteborg" },
  { externalId: 378, name: "IFK Norrkoping" },
  { externalId: 2163, name: "IFK Varnamo" },
  { externalId: 2175, name: "IK Brage" },
  { externalId: 764, name: "Jonkopings Sodra" },
  { externalId: 374, name: "Kalmar FF" },
  { externalId: 2176, name: "Landskrona BoIS" },
  { externalId: 375, name: "Malmo FF" },
  { externalId: 2240, name: "Mjallby AIF" },
  { externalId: 365, name: "Orebro SK" },
  { externalId: 2166, name: "Orgryte IS" },
  { externalId: 2174, name: "Osters IF" },
  { externalId: 376, name: "Ostersunds FK" },
  { externalId: 370, name: "Sirius" },
  { externalId: 369, name: "Trelleborg" },
  { externalId: 6706, name: "Utsikten" },
  { externalId: 2171, name: "Varbergs BoIS FC" },
  { externalId: 2241, name: "Vasteras SK FK" },
] as const;
