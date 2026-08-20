/**
 * Vilken liga, vilka säsonger och vilka lag import-scriptet hämtar.
 *
 * 2022–2024 (fri- OCH Ultra-planen ger båda tillgång till dessa — bara
 * INNEVARANDE säsong är planbegränsad, verifierat i praktiken). Byt/utöka
 * IMPORT_SEASONS separat den dagen ni vill hämta pågående säsong (kräver ett
 * eget beslut om live-datastrategi, se planen "Allsvenskan Datalager").
 *
 * IMPORT_TEAMS listar alla 23 lag som faktiskt förekommit i Allsvenskan
 * NÅGON av de här tre säsongerna (16 lag/säsong, men relegering/kval gör att
 * unionen över tre år blir fler än 16) — upptäckt via /teams?league=&season=
 * i steg 3 (Ultra-planen), inte gissat. import-teams.ts är numera
 * självförsörjande (hämtar hela ligans lag+arenor per säsong utan att
 * behöva den här listan), men import-players.ts och import-fixtures.ts
 * itererar fortfarande över IMPORT_TEAMS för sina per-lag-scopade anrop.
 */

export const ALLSVENSKAN_LEAGUE_EXTERNAL_ID = 113;

export const IMPORT_SEASONS = [2022, 2023, 2024] as const;

export const IMPORT_TEAMS = [
  { externalId: 377, name: "AIK Stockholm" },
  { externalId: 367, name: "BK Hacken" },
  { externalId: 2172, name: "Degerfors IF" },
  { externalId: 364, name: "Djurgardens IF" },
  { externalId: 2170, name: "Gais" },
  { externalId: 373, name: "GIF Sundsvall" },
  { externalId: 766, name: "Halmstad" },
  { externalId: 363, name: "Hammarby FF" },
  { externalId: 811, name: "Helsingborg" },
  { externalId: 371, name: "IF Brommapojkarna" },
  { externalId: 372, name: "IF Elfsborg" },
  { externalId: 366, name: "IFK Goteborg" },
  { externalId: 378, name: "IFK Norrkoping" },
  { externalId: 2163, name: "IFK Varnamo" },
  { externalId: 374, name: "Kalmar FF" },
  { externalId: 2176, name: "Landskrona BoIS" },
  { externalId: 375, name: "Malmo FF" },
  { externalId: 2240, name: "Mjallby AIF" },
  { externalId: 2174, name: "Osters IF" },
  { externalId: 370, name: "Sirius" },
  { externalId: 6706, name: "Utsikten" },
  { externalId: 2171, name: "Varbergs BoIS FC" },
  { externalId: 2241, name: "Vasteras SK FK" },
] as const;
