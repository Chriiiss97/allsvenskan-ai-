import { getRegisteredThroughSeason } from "./player-last-season";

/**
 * Fas 22c (2026-08-23, användarkrav: "vi ska veta om en spelare avslutat sin
 * karriär — som Pontus Wernbloom") — spelarens AKTIVITETSSTATUS.
 *
 * ── VAD KÄLLORNA FAKTISKT GER ────────────────────────────────────────────
 * Undersökt mot båda API:erna innan den här filen skrevs:
 *
 *   · Sportmonks spelarobjekt har INGEN pensionsflagga (verifierat: fälten
 *     är id/namn/position/längd/vikt/födelsedatum — inget mer). Deras
 *     transferrader har ett `career_ended`-fält, men det finns bara för en
 *     delmängd, och Wernbloom har noll transferrader där.
 *   · api-football har heller ingen "retired"-flagga. Däremot svarar
 *     `/players/seasons?player=X` med varje säsong spelaren varit
 *     registrerad, i vilken liga som helst — Wernbloom: 2005–2021, punkt
 *     slut. Det ÄR signalen, och den ligger i player-last-season.ts.
 *
 * Ingen källa PÅSTÅR alltså "pensionerad". Det närmaste som finns är
 * frånvaro. Därför är hela den här filen byggd för att hellre tiga än gissa.
 *
 * ── TRE SPÄRRAR, ALLA INFÖRDA EFTER EN MÄTNING SOM GICK FEL ──────────────
 * Första försöket använde bara VÅR egen data (statistics + career stints +
 * transferhistorik) och flaggade 669 av 2 305 spelare som avslutade.
 * Stickprov mot api-football visade att en stor del fortfarande spelade:
 * Oliver Dovin (24), Casper Widell (23), Pontus Kindberg (23), Agon Muçolli
 * (27), Thomas Rogne (36), Oscar Wendt (41) — de hade bara gått till klubbar
 * i ligor vi inte importerar. Av det följer spärrarna:
 *
 *  1. EN KÄLLA SOM SER ALLA LIGOR. Spelaren måste finnas i
 *     `player-last-season.ts`; utan api-footballs registreringshistorik vet
 *     vi inte om tystnaden betyder "slutat" eller "spelar där vi inte tittar".
 *  2. TVÅ HELA SÄSONGERS FRÅNVARO ({@link RETIREMENT_GRACE_SEASONS}). Inte
 *     bara den pågående — en spelare kan vara skadad eller klubblös ett år.
 *  3. RIMLIG ÅLDER ({@link MIN_RETIREMENT_AGE}). En 23-åring som försvinner
 *     ur registren har nästan alltid gått till en serie utanför bevakningen;
 *     en 35-åring har nästan alltid slutat. Under åldersgränsen säger vi
 *     ingenting alls.
 *
 * Dessutom kombineras alltid api-football-kartan med VÅR FÄRSKA data
 * (max av de två). En gammal generad fil kan därför bara göra oss
 * försiktigare — aldrig få oss att kalla en spelande spelare pensionerad.
 *
 * Utfall med alla spärrar på plats: se scripts/import/build-player-last-season.ts
 * för hur kartan byggs om.
 */

/** Antal HELA säsonger utan registrering som krävs innan vi vågar säga "avslutat". */
export const RETIREMENT_GRACE_SEASONS = 2;

/**
 * Under den här åldern tolkas frånvaro ALDRIG som avslutad karriär. Se
 * spärr 3 ovan — verifierat mot verkliga fall där unga spelare försvann ur
 * registren men fortsatte spela i en liga utanför bevakningen.
 */
export const MIN_RETIREMENT_AGE = 30;

export type PlayerActivityStatus =
  /** Registrerad eller spelad tillräckligt nyligen. */
  | "active"
  /** Alla tre spärrarna passerade — spelaren har med stor sannolikhet slutat. */
  | "retired"
  /** För lite underlag för att uttala sig. Visa ingen etikett. */
  | "unknown";

export interface PlayerActivityInput {
  /** api-footballs spelar-id (`player.external_id`) — nyckeln till registreringshistoriken. */
  externalId: number | null;
  /** Senaste säsong med SPELADE matcher i vår egen data, oavsett liga. */
  lastPlayedSeason: number | null;
  /** År för senaste dokumenterade klubbytet i vår egen data. */
  lastTransferYear: number | null;
  /** Födelsedatum (ISO) — åldersspärren. Saknas det blir svaret "unknown". */
  birthDate: string | null;
}

export interface PlayerActivity {
  status: PlayerActivityStatus;
  /** Sista året vi kan belägga aktivitet. Null när vi inte vet något alls. */
  lastActiveYear: number | null;
}

/**
 * @param currentSeason Årtalet för säsongen som pågår nu (Allsvenskan följer
 *   kalenderår, så det är helt enkelt innevarande år).
 */
export function getPlayerActivity(input: PlayerActivityInput, currentSeason: number): PlayerActivity {
  const registeredThrough = getRegisteredThroughSeason(input.externalId);
  const lastActiveYear =
    Math.max(registeredThrough ?? 0, input.lastPlayedSeason ?? 0, input.lastTransferYear ?? 0) || null;

  if (lastActiveYear === null) return { status: "unknown", lastActiveYear: null };

  // Spärr 2: exempel med currentSeason = 2026 — 2024 eller tidigare betyder
  // att både 2025 och den pågående 2026 gått utan ett enda spår.
  if (lastActiveYear > currentSeason - RETIREMENT_GRACE_SEASONS) return { status: "active", lastActiveYear };

  // Spärr 1: utan api-footballs registreringshistorik kan tystnaden lika
  // gärna betyda att spelaren finns i en liga vi inte importerar.
  if (registeredThrough === null) return { status: "unknown", lastActiveYear };

  // Spärr 3: åldern.
  const birthYear = input.birthDate ? Number(input.birthDate.slice(0, 4)) : null;
  if (!birthYear || !Number.isFinite(birthYear)) return { status: "unknown", lastActiveYear };
  if (currentSeason - birthYear < MIN_RETIREMENT_AGE) return { status: "unknown", lastActiveYear };

  return { status: "retired", lastActiveYear };
}
