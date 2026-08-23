import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { hasPlayedSeason } from "./active-player";
import { displayPlayerName } from "./player-name";
import { normalizeTeamName } from "./team-name-normalize";
import { getLeagueTier, NON_COMPETITIVE_LEAGUE_IDS } from "./league-tier";
import { getLeagueStrength, type LeagueStrength } from "./post-allsvenskan-level";

type Supabase = SupabaseClient<Database>;

/**
 * Fas 18b (2026-08-22) — "Efter Allsvenskan": lista ALLA spelare vi kan
 * bekräfta har lämnat Allsvenskan (real data, se career-journey.ts:s
 * filhuvud för hela research-underlaget), med deras samlade prestation
 * utomlands (matcher/minuter/mål/assist/betyg). Byggd som TVÅ bulk-frågor
 * + JS-aggregering (samma mönster som standings-views.ts) istället för
 * att räkna en full getCareerJourney PER SPELARE — mycket snabbare för en
 * lista över potentiellt hundratals spelare.
 *
 * "Lämnat Allsvenskan" avgörs av: spelaren har MINST EN
 * player_career_stint-rad (icke-Allsvensk, redan garanterat av
 * import-player-career.ts) med season_year STÖRRE än spelarens SENASTE
 * Allsvenska säsong (statistics-tabellen, appearances > 0). Samma
 * klubbnamn-normalisering som career-journey.ts (Svenska Cupen-matcher för
 * samma Allsvenska klubb räknas INTE som "lämnat").
 */

export interface PostAllsvenskanPlayer {
  playerId: number;
  playerName: string;
  photoUrl: string | null;
  previousTeamName: string;
  previousTeamLogoUrl: string | null;
  leftYear: number;
  /**
   * Fas 18f (användarkorrigering, 2026-08-22) — "Efter Allsvenskan" ska
   * beskriva VAD SOM HÄNDE efter att spelaren lämnade, inte påstå att
   * spelaren fortfarande är där. `status` avgörs av det VERKLIGT senaste
   * kända klubbytet (player.latest_transfer_team_external_id, byggt av
   * HELA /transfers-listan i import-player-career.ts) — INTE av vilken
   * player_career_stint-rad som råkar ha högst season_year (den kan vara
   * flera år gammal om spelaren redan hunnit återvända till Sverige, se
   * T. Sana-fallet: senaste STINT var Aarhus 2019, men senaste VERKLIGA
   * övergång var till Örgryte 2024 — utan den här fixen hade sidan påstått
   * att han fortfarande spelade i Danmark).
   * "unknown" = ingen transferhändelse alls hittad — visar då den senaste
   * DOKUMENTERADE utländska klubben utan att påstå något om nuläget.
   *
   * Fas 18h (2026-08-23, VERIFIERAT verkligt fall: 139 spelare) — "abroad"
   * kontrollerade tidigare bara om senaste klubben var en KÄND ALLSVENSK
   * klubb, annars antogs "utomlands" — det missade spelare vars senaste
   * övergång gick till en ANNAN svensk klubb (Superettan/Ettan/lägre, t.ex.
   * "Tvååker"/"Karlberg"). "back_in_sweden" = tillbaka i Sverige, men på en
   * nivå under Allsvenskan.
   */
  status: "back_in_allsvenskan" | "back_in_sweden" | "abroad" | "unknown";
  /** Spelarens VERKLIGA nuvarande klubb (Allsvensk om status=back_in_allsvenskan). */
  currentClubName: string;
  currentClubLogoUrl: string | null;
  /** null när status=back_in_allsvenskan (implicit Sverige). */
  currentClubCountry: string | null;
  /** Senaste DOKUMENTERADE utländska klubben — visas alltid som "vad hände efter Allsvenskan", oavsett om spelaren sedan återvänt. */
  mostRecentForeignClubName: string;
  mostRecentForeignClubLogoUrl: string | null;
  mostRecentForeignClubCountry: string | null;
  appearances: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  /** Snittbetyg över alla utländska stints med ett satt betyg — null om ingen rad hade betyg. */
  avgRating: number | null;
  /**
   * Fas 18h (2026-08-23, användarkrav "Efter Allsvenskan i korthet" m.fl.) —
   * längsta SAMMANHÄNGANDE svit av säsonger utomlands (unika `season_year`
   * i `stints`, som redan bara innehåller icke-Allsvenska rader — ett
   * uppehåll, t.ex. en period tillbaka i Allsvenskan, bryter alltså sviten
   * per konstruktion utan särskild specialhantering). Uttryckligt
   * användarkrav (2026-08-23): "Längsta utlandskarriär" FÅR INTE räkna
   * (sista år − första år) om spelaren haft flera separata utlandsperioder
   * — exempel: 2015–2018 + 2021–2026 ska ge 5 år, inte 11. Verifierat mot
   * T. Sana (Allsvenskan → utland → Allsvenskan → ...).
   */
  longestAbroadStreakFromYear: number;
  longestAbroadStreakToYear: number;
  longestAbroadStreakYears: number;
  /**
   * Fas 18j (2026-08-23, "Återvändarprocent"/"flest pendlingar") — antal
   * gånger spelaren dokumenterat lämnat Allsvenskan (minst 1, per
   * definition — annars hade hen inte kvalificerat sig). ≥2 = en
   * "pendlande" karriär (lämnat, kommit tillbaka, lämnat igen).
   */
  departureCount: number;
  /**
   * Fas 18j (2026-08-23) — spelarens position, rå från `player.position`
   * ("Attacker"/"Midfielder"/"Defender"/"Goalkeeper"/"Forward"). Behövs för
   * att "Mest lyckad efter Allsvenskan" ska kunna jämföra mål/assist INOM
   * positionsgrupp istället för att ställa en ytterback mot en anfallare
   * (samma princip som position-group.ts redan bygger DNA/percentiler på).
   */
  position: string | null;
  /**
   * Fas 18j — speltid per liganivå (se post-allsvenskan-level.ts). Bara
   * LIGA-minuter hamnar här; cup-/kontinental-/oklassade minuter saknar en
   * egen nivå och utelämnas medvetet (de räknas fortfarande i
   * `minutesPlayed`). Summan är alltså normalt MINDRE än `minutesPlayed`.
   */
  minutesByLevel: Record<LeagueStrength, number>;
  /**
   * Högsta nivå spelaren spelat MINST 900 minuter på (~10 matcher) — "nådde
   * faktiskt dit", inte "hoppade in en gång". null om ingen nivå når dit.
   */
  peakLevel: LeagueStrength | null;
  /** Nedbrutet per klubb (grupperat på normaliserat klubbnamn) — grunden för Scouts detaljvy per spelare. */
  byClub: PostAllsvenskanClubBreakdown[];
}

export interface PostAllsvenskanClubBreakdown {
  teamName: string;
  teamLogoUrl: string | null;
  country: string | null;
  appearances: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  avgRating: number | null;
}

interface DomesticRow {
  player_id: number;
  appearances: number;
  team: { name: string; logo_url: string | null } | null;
  season: { year: number } | null;
}

interface StintRow {
  player_id: number;
  team_name: string;
  team_logo_url: string | null;
  team_external_id: number | null;
  league_country: string | null;
  league_external_id: number | null;
  season_year: number;
  appearances: number | null;
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  rating: number | null;
}

/**
 * Fas 18g (bugg hittad i verifieringen: T. Sana saknades helt, och det
 * totala antalet kvalificerande spelare KRYMPTE mellan två körningar trots
 * att fler karriärrader importerats) — Supabase-klientens DEFAULT-tak på
 * 1000 rader per fråga trunkerade tyst både `statistics` (betydligt fler
 * rader totalt) och `player_career_stint` (3500+ rader, växande med
 * importen) UTAN att `error` sattes — exakt samma fälla som redan är
 * dokumenterad i [[verify-tool-bugs-via-live-path]]. Sidnumrerad hämtning
 * (samma mönster som sportmonks-import-match-facts.ts m.fl.) istället för
 * en enda `.select()`.
 */
async function fetchAllRows<T>(query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> }): Promise<T[]> {
  const rows: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function getPlayersWhoLeftAllsvenskan(supabase: Supabase): Promise<PostAllsvenskanPlayer[]> {
  const [domesticRows, stintRows, playerRows, allsvenskaTeamsResult] = await Promise.all([
    fetchAllRows<DomesticRow>(
      supabase.from("statistics").select("player_id, appearances, team:team_id(name, logo_url), season:season_id(year)").returns<DomesticRow[]>()
    ),
    fetchAllRows<StintRow>(
      supabase
        .from("player_career_stint")
        .select(
          "player_id, team_name, team_logo_url, team_external_id, league_country, league_external_id, season_year, appearances, minutes_played, goals, assists, rating"
        )
        .returns<StintRow[]>()
    ),
    fetchAllRows(
      supabase
        .from("player")
        .select(
          "id, full_name, first_name, last_name, photo_url, position, latest_transfer_team_name, latest_transfer_team_external_id, latest_transfer_team_logo_url"
        )
    ),
    // Alla 33 Allsvenska klubbars external_id — grunden för att avgöra om
    // spelarens SENASTE kända övergång gick TILLBAKA till Allsvenskan.
    // (Bara ~33 rader, under 1000-taket — ingen paginering behövd här.)
    supabase.from("team").select("external_id, name, logo_url").not("external_id", "is", null),
  ]);
  if (allsvenskaTeamsResult.error) throw allsvenskaTeamsResult.error;

  const playerById = new Map(playerRows.map((p) => [p.id, p]));
  const allsvenskaTeamByExternalId = new Map((allsvenskaTeamsResult.data ?? []).map((t) => [t.external_id as number, t]));

  // Fas 18h (2026-08-23) — ALLA svenska klubb-external_id vi någonsin sett i
  // importerad karriärdata (Superettan/Ettan/lägre), inte bara de 33
  // Allsvenska. Grunden för att avgöra "back_in_sweden" korrekt istället för
  // att felaktigt anta "abroad" så fort klubben inte råkar vara Allsvensk
  // (verifierat verkligt fall: 139 spelare, t.ex. "Tvååker"/"Karlberg").
  const swedishClubExternalIds = new Set<number>();
  for (const row of stintRows) {
    if (row.team_external_id != null && row.league_country?.trim().toLowerCase() === "sweden") {
      swedishClubExternalIds.add(row.team_external_id);
    }
  }

  // Alla Allsvenska säsonger per spelare (bara riktiga speltillfällen,
  // samma hasPlayedSeason-filter som resten av produkten) — sparas som en
  // FULL lista, inte bara min/max. Fas 18f (användarkorrigering,
  // 2026-08-22, verkligt fall som avslöjade behovet: T. Sana): "Lämnade
  // X (år)" ska beskriva klubben spelaren var vid NÄR HAN FÖRSTA GÅNGEN
  // lämnade — INTE spelarens senaste Allsvenska klubb (som för en
  // återvändare kan RÅKA VARA klubben han sitter i just nu, vilket hade
  // gjort "Lämnade Örgryte IS" missvisande när Örgryte är hans NUVARANDE
  // klubb). Rätt referenspunkt räknas ut nedan, per spelare, EFTER att vi
  // vet vilket år den FÖRSTA kvalificerande utlandssäsongen var.
  const domesticEntriesByPlayer = new Map<number, { year: number; teamName: string; teamLogoUrl: string | null }[]>();
  const firstDomesticYearByPlayer = new Map<number, number>();
  for (const row of domesticRows) {
    if (!hasPlayedSeason(row.appearances) || !row.team || !row.season) continue;
    const list = domesticEntriesByPlayer.get(row.player_id) ?? [];
    list.push({ year: row.season.year, teamName: row.team.name, teamLogoUrl: row.team.logo_url });
    domesticEntriesByPlayer.set(row.player_id, list);
    const firstYear = firstDomesticYearByPlayer.get(row.player_id);
    if (firstYear === undefined || row.season.year < firstYear) {
      firstDomesticYearByPlayer.set(row.player_id, row.season.year);
    }
  }

  // Alla Allsvenska klubbnamn en spelare NÅGONSIN representerat (normaliserat) — en Svenska Cupen-rad för SAMMA klubb ska inte räknas som "utomlands".
  const domesticClubNamesByPlayer = new Map<number, Set<string>>();
  for (const row of domesticRows) {
    if (!row.team) continue;
    const set = domesticClubNamesByPlayer.get(row.player_id) ?? new Set<string>();
    set.add(normalizeTeamName(row.team.name));
    domesticClubNamesByPlayer.set(row.player_id, set);
  }

  const stintsByPlayer = new Map<number, StintRow[]>();
  for (const row of stintRows) {
    const domesticNames = domesticClubNamesByPlayer.get(row.player_id);
    if (domesticNames?.has(normalizeTeamName(row.team_name))) continue; // samma klubb, bara en annan tävling (t.ex. cupen) — inte "utomlands"
    // Fas 18h (2026-08-23, VERIFIERAT verkligt fall: F. Bohman → "Olympic",
    // en riktig svensk Ettan-klubb, `league_country: "Sweden"`) — uttryckligt
    // användarkrav: "Efter Allsvenskan" ska ENDAST räkna en flytt till ett
    // ANNAT LAND, aldrig en flytt till en annan svensk division (Superettan/
    // Ettan m.fl.). Klubbnamn-jämförelsen ovan missar det (Olympic matchar
    // inte spelarens EGNA Allsvenska klubbnamn) — filtrera på land istället.
    if ((row.league_country ?? "").trim().toLowerCase() === "sweden") continue;
    // Fas 18i (2026-08-23) — vänskapsmatcher är aldrig konkurrensmässig
    // statistik, oavsett om spelaren annars kvalificerar sig.
    if (row.league_external_id !== null && NON_COMPETITIVE_LEAGUE_IDS.has(row.league_external_id)) continue;
    const list = stintsByPlayer.get(row.player_id) ?? [];
    list.push(row);
    stintsByPlayer.set(row.player_id, list);
  }

  const results: PostAllsvenskanPlayer[] = [];
  for (const [playerId, domesticEntries] of domesticEntriesByPlayer) {
    const firstDomesticYear = firstDomesticYearByPlayer.get(playerId)!;
    // Räknar ALLA utländska säsonger efter Allsvensk DEBUT (inte bara efter
    // senaste Allsvenska säsongen) — fångar alltså både "lämnade → utland"
    // OCH "lämnade → utland → tillbaka → lämnade igen"-mönstret korrekt.
    const stints = (stintsByPlayer.get(playerId) ?? []).filter((s) => s.season_year > firstDomesticYear);
    if (stints.length === 0) continue; // inget känt klubbyte EFTER Allsvensk debut — inte bekräftat "lämnat"

    // Fas 18i (2026-08-23, uttryckligt användarkrav) — "Efter Allsvenskan"
    // ska INTE bara betyda "spelade utomlands", utan "nådde en etablerad,
    // nationellt erkänd tier 1/2-ligastatus" (se lib/football/league-tier.ts).
    // Cuper/kontinentala turneringar räknas inte som en egen liga (de har
    // ingen egen nivå) — men om spelaren KVALIFICERAR SIG via minst en
    // tier 1/2-säsong räknas all dokumenterad statistik (även cuper) med,
    // se filhuvudet där.
    const hasQualifyingTier = stints.some((s) => getLeagueTier(s.league_external_id) !== null);
    if (!hasQualifyingTier) continue;

    // Fas 18j (2026-08-23, "Återvändarprocent"/"flest pendlingar") — hur
    // många gånger har spelaren FAKTISKT lämnat Allsvenskan (inte bara
    // första gången)? Byggs av samma data vi redan har i minnet — en
    // sammanslagen, kronologisk år-för-år-tidslinje (Allsvensk/utländsk),
    // och räknar varje övergång FRÅN en Allsvensk år TILL ett utländskt år.
    // Ett år med både en Allsvensk och en utländsk rad (byte mitt i
    // säsongen) räknas som Allsvenskt — konservativt, undviker att räkna en
    // extra "avgång" för en enda övergångssäsong.
    const yearIsDomestic = new Map<number, boolean>();
    for (const d of domesticEntries) yearIsDomestic.set(d.year, true);
    for (const s of stints) if (!yearIsDomestic.has(s.season_year)) yearIsDomestic.set(s.season_year, false);
    const chronologicalYears = [...yearIsDomestic.entries()].sort((a, b) => a[0] - b[0]);
    let departureCount = 0;
    for (let i = 1; i < chronologicalYears.length; i++) {
      if (chronologicalYears[i - 1][1] === true && chronologicalYears[i][1] === false) departureCount++;
    }

    const player = playerById.get(playerId);
    if (!player) continue;

    // "Lämnade X (år)" = klubben spelaren var vid strax INNAN den FÖRSTA
    // kvalificerande utlandssäsongen — inte spelarens senaste Allsvenska
    // klubb (som för en återvändare kan vara samma klubb han sitter i
    // just nu, se filhuvudets T. Sana-exempel).
    const firstForeignYear = Math.min(...stints.map((s) => s.season_year));
    const domesticBeforeFirstDeparture = domesticEntries.filter((d) => d.year <= firstForeignYear).sort((a, b) => b.year - a.year)[0];
    const lastDomestic = domesticBeforeFirstDeparture ?? [...domesticEntries].sort((a, b) => b.year - a.year)[0];

    const sortedByYear = [...stints].sort((a, b) => b.season_year - a.season_year);
    const current = sortedByYear[0];

    const ratings = stints.map((s) => s.rating).filter((r): r is number => r !== null);

    // Längsta SAMMANHÄNGANDE utlandssvit — unika år, sorterade, längsta
    // löpande sekvens av på-varandra-följande år. Ett år utan en enda
    // stint-rad (t.ex. en säsong tillbaka i Allsvenskan) bryter sviten.
    const foreignYears = [...new Set(stints.map((s) => s.season_year))].sort((a, b) => a - b);
    let streakBestLen = 1;
    let streakBestFrom = foreignYears[0];
    let streakBestTo = foreignYears[0];
    let streakCurLen = 1;
    let streakCurFrom = foreignYears[0];
    for (let i = 1; i < foreignYears.length; i++) {
      if (foreignYears[i] === foreignYears[i - 1] + 1) {
        streakCurLen++;
      } else {
        streakCurLen = 1;
        streakCurFrom = foreignYears[i];
      }
      if (streakCurLen > streakBestLen) {
        streakBestLen = streakCurLen;
        streakBestFrom = streakCurFrom;
        streakBestTo = foreignYears[i];
      }
    }

    // Fas 18j (2026-08-23) — speltid per LIGANIVÅ, underlaget för nivå-
    // komponenten i "Mest lyckad efter Allsvenskan". Cup-/kontinental-/
    // oklassade rader ger `null` från getLeagueStrength och hoppas över här
    // (de saknar egen nivå — se post-allsvenskan-level.ts:s filhuvud för
    // varför Champions League-kvalminuter aldrig får räknas som nivå 5).
    const minutesByLevel: Record<LeagueStrength, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const s of stints) {
      const level = getLeagueStrength(s.league_external_id);
      if (level === null) continue;
      minutesByLevel[level] += s.minutes_played ?? 0;
    }
    // "Nådde faktiskt dit" = minst ~10 fulla matcher på nivån, inte ett
    // enstaka inhopp. Högsta nivån som klarar gränsen vinner.
    const PEAK_LEVEL_MIN_MINUTES = 900;
    let peakLevel: LeagueStrength | null = null;
    for (const level of [5, 4, 3, 2, 1] as const) {
      if (minutesByLevel[level] >= PEAK_LEVEL_MIN_MINUTES) {
        peakLevel = level;
        break;
      }
    }

    // Nedbrytning per klubb (grupperat på normaliserat namn — samma princip
    // som career-journey.ts — en spelare kan ha flera stint-rader per klubb,
    // t.ex. liga + cup samma säsong). Grunden för Scouts detaljvy per spelare.
    const byClubMap = new Map<string, PostAllsvenskanClubBreakdown & { ratingSum: number; ratingCount: number }>();
    for (const s of stints) {
      const key = normalizeTeamName(s.team_name);
      const existing = byClubMap.get(key) ?? {
        teamName: s.team_name,
        teamLogoUrl: s.team_logo_url,
        country: s.league_country,
        appearances: 0,
        minutesPlayed: 0,
        goals: 0,
        assists: 0,
        avgRating: null,
        ratingSum: 0,
        ratingCount: 0,
      };
      existing.appearances += s.appearances ?? 0;
      existing.minutesPlayed += s.minutes_played ?? 0;
      existing.goals += s.goals ?? 0;
      existing.assists += s.assists ?? 0;
      if (s.rating !== null) {
        existing.ratingSum += s.rating;
        existing.ratingCount += 1;
      }
      byClubMap.set(key, existing);
    }
    const byClub: PostAllsvenskanClubBreakdown[] = [...byClubMap.values()]
      .map((c) => ({
        teamName: c.teamName,
        teamLogoUrl: c.teamLogoUrl,
        country: c.country,
        appearances: c.appearances,
        minutesPlayed: c.minutesPlayed,
        goals: c.goals,
        assists: c.assists,
        avgRating: c.ratingCount > 0 ? Math.round((c.ratingSum / c.ratingCount) * 100) / 100 : null,
      }))
      .sort((a, b) => b.goals - a.goals);

    // Fas 18f — VERKLIG status/nuvarande klubb, byggd på senaste kända
    // övergången (hela /transfers-listan), inte på vilken stint-rad som
    // råkar ha högst season_year. Se interfacets kommentar för varför.
    const latestTransferExternalId = player.latest_transfer_team_external_id;
    const backAtAllsvenskaTeam = latestTransferExternalId != null ? allsvenskaTeamByExternalId.get(latestTransferExternalId) : undefined;
    // Tillbaka i Sverige, men INTE i Allsvenskan (Superettan/Ettan/lägre) —
    // avgörs INNAN "abroad" antas, se filhuvudets kommentar.
    const backAtSwedishNonAllsvenskaClub = !backAtAllsvenskaTeam && latestTransferExternalId != null && swedishClubExternalIds.has(latestTransferExternalId);
    let status: PostAllsvenskanPlayer["status"];
    let currentClubName: string;
    let currentClubLogoUrl: string | null;
    let currentClubCountry: string | null;
    if (backAtAllsvenskaTeam) {
      status = "back_in_allsvenskan";
      currentClubName = backAtAllsvenskaTeam.name;
      currentClubLogoUrl = backAtAllsvenskaTeam.logo_url;
      currentClubCountry = null;
    } else if (backAtSwedishNonAllsvenskaClub) {
      status = "back_in_sweden";
      currentClubName = player.latest_transfer_team_name ?? "Okänd svensk klubb";
      currentClubLogoUrl = player.latest_transfer_team_logo_url;
      currentClubCountry = null; // Sverige — ingen landsetikett behövs, samma princip som back_in_allsvenskan.
    } else if (latestTransferExternalId != null && player.latest_transfer_team_name) {
      status = "abroad";
      currentClubName = player.latest_transfer_team_name;
      currentClubLogoUrl = player.latest_transfer_team_logo_url;
      // player.latest_transfer_* har INGET eget landfält (api-football:s
      // /transfers ger bara lag-id/namn/logga, inte land) — `current.
      // league_country` är bara verifierat korrekt om det FAKTISKT är
      // SAMMA klubb som senaste stint-raden. Verkligt fall som avslöjade
      // buggen: S. Alioum visade "FK Jablonec (Cypern)" — Cypern hörde
      // till en ANNAN klubb (Omonia Nicosia) han redan lämnat. Hellre
      // ingen landsetikett än en felaktig.
      currentClubCountry = normalizeTeamName(current.team_name) === normalizeTeamName(player.latest_transfer_team_name) ? current.league_country : null;
    } else {
      status = "unknown";
      currentClubName = current.team_name;
      currentClubLogoUrl = current.team_logo_url;
      currentClubCountry = current.league_country;
    }

    results.push({
      playerId,
      playerName: displayPlayerName(player.first_name, player.last_name, player.full_name),
      photoUrl: player.photo_url,
      previousTeamName: lastDomestic.teamName,
      previousTeamLogoUrl: lastDomestic.teamLogoUrl,
      leftYear: lastDomestic.year,
      status,
      currentClubName,
      currentClubLogoUrl,
      currentClubCountry,
      mostRecentForeignClubName: current.team_name,
      mostRecentForeignClubLogoUrl: current.team_logo_url,
      mostRecentForeignClubCountry: current.league_country,
      appearances: stints.reduce((sum, s) => sum + (s.appearances ?? 0), 0),
      minutesPlayed: stints.reduce((sum, s) => sum + (s.minutes_played ?? 0), 0),
      goals: stints.reduce((sum, s) => sum + (s.goals ?? 0), 0),
      assists: stints.reduce((sum, s) => sum + (s.assists ?? 0), 0),
      avgRating: ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : null,
      longestAbroadStreakFromYear: streakBestFrom,
      longestAbroadStreakToYear: streakBestTo,
      longestAbroadStreakYears: streakBestLen,
      departureCount,
      position: player.position,
      minutesByLevel,
      peakLevel,
      byClub,
    });
  }

  return results;
}

export interface ClubAbroadPerformance {
  previousTeamName: string;
  previousTeamLogoUrl: string | null;
  playerCount: number;
  totalAppearances: number;
  totalMinutes: number;
  totalGoals: number;
  totalAssists: number;
}

export interface AbroadStreakEntry {
  player: PostAllsvenskanPlayer;
  fromYear: number;
  toYear: number;
  years: number;
}

export interface ExportYearCount {
  year: number;
  count: number;
}

export interface ReturnRateStats {
  returned: number;
  total: number;
  percentage: number;
}

export interface CyclingCareerEntry {
  player: PostAllsvenskanPlayer;
  departureCount: number;
}

export interface PostAllsvenskanInsights {
  /** null bara om ingen spelare i urvalet har >0 mål/assist — teoretiskt möjligt, aldrig krascha. */
  topGoals: PostAllsvenskanPlayer | null;
  topAssists: PostAllsvenskanPlayer | null;
  topMinutes: PostAllsvenskanPlayer | null;
  longestAbroadStreak: AbroadStreakEntry | null;
  /** Nästa 4 efter ledaren, för en kompakt "näst bäst"-lista — inte en hel tabell. */
  longestAbroadStreakRunnersUp: AbroadStreakEntry[];
  /**
   * Fas 18k (2026-08-23, "Exportkurvan") — antal spelare per `leftYear`,
   * stigande år. Rent en aggregering av redan filtrerad data (ingen ny
   * fråga) — visar om exporten ökat/minskat över tid.
   */
  exportsByYear: ExportYearCount[];
  /**
   * Fas 18k — hur stor andel av de som lämnat är FAKTISKT tillbaka i
   * Allsvenskan just nu (status === "back_in_allsvenskan"). En spelare som
   * lämnat, kommit tillbaka och lämnat IGEN räknas inte som "återvänd" här
   * — se `mostCyclingCareers` för den vinkeln istället.
   */
  returnRate: ReturnRateStats;
  /** Spelare med ≥2 dokumenterade avgångar (lämnat-kommit tillbaka-lämnat igen), flest först. Topp 5. */
  mostCyclingCareers: CyclingCareerEntry[];
}

/**
 * Fas 18h (2026-08-23) — "Efter Allsvenskan i korthet" + "Längst etablerad
 * utomlands". Läser UTESLUTANDE redan filtrerade `PostAllsvenskanPlayer`-fält
 * (mål/assist/minuter är per definition redan begränsade till tiden EFTER
 * Allsvensk avgång, se filhuvudet) — ingen risk att Allsvensk statistik
 * läcker in i "i korthet"-boxen.
 *
 * "Mest lyckad efter Allsvenskan" (sammanvägd poäng) är MEDVETET INTE med
 * här ännu — användaren bad uttryckligen att få se och godkänna metoden
 * innan den kodas (2026-08-23).
 */
export function computePostAllsvenskanInsights(players: PostAllsvenskanPlayer[]): PostAllsvenskanInsights {
  const byGoals = [...players].sort((a, b) => b.goals - a.goals);
  const byAssists = [...players].sort((a, b) => b.assists - a.assists);
  const byMinutes = [...players].sort((a, b) => b.minutesPlayed - a.minutesPlayed);
  const byStreak = [...players]
    .map((p) => ({ player: p, fromYear: p.longestAbroadStreakFromYear, toYear: p.longestAbroadStreakToYear, years: p.longestAbroadStreakYears }))
    .sort((a, b) => b.years - a.years);

  // "Exportkurvan" — ren aggregering av `leftYear`, ingen ny beräkning.
  const yearCounts = new Map<number, number>();
  for (const p of players) yearCounts.set(p.leftYear, (yearCounts.get(p.leftYear) ?? 0) + 1);
  const exportsByYear = [...yearCounts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);

  // "Återvändarprocent" — andel med status===back_in_allsvenskan just nu.
  const returned = players.filter((p) => p.status === "back_in_allsvenskan").length;
  const returnRate: ReturnRateStats = {
    returned,
    total: players.length,
    percentage: players.length > 0 ? Math.round((returned / players.length) * 100) : 0,
  };

  const mostCyclingCareers: CyclingCareerEntry[] = [...players]
    .filter((p) => p.departureCount >= 2)
    .sort((a, b) => b.departureCount - a.departureCount)
    .slice(0, 5)
    .map((p) => ({ player: p, departureCount: p.departureCount }));

  return {
    topGoals: byGoals[0]?.goals > 0 ? byGoals[0] : null,
    topAssists: byAssists[0]?.assists > 0 ? byAssists[0] : null,
    topMinutes: byMinutes[0]?.minutesPlayed > 0 ? byMinutes[0] : null,
    longestAbroadStreak: byStreak[0] ?? null,
    longestAbroadStreakRunnersUp: byStreak.slice(1, 5),
    exportsByYear,
    returnRate,
    mostCyclingCareers,
  };
}

export interface DecoratedAbroadEntry {
  player: PostAllsvenskanPlayer;
  winCount: number;
  /** Nyaste säsong först. */
  trophies: { leagueName: string; country: string | null; season: string }[];
}

interface TrophyRow {
  player_id: number;
  league_name: string;
  country: string | null;
  season: string;
  place: string;
}

/**
 * Fas 18k (2026-08-23, "Mest dekorerad efter Allsvenskan") — troféer VUNNA
 * UTOMLANDS (player_trophy, real data från api-football /trophies, se
 * player-trophies.ts:s filhuvud). Samma två regler som resten av "Efter
 * Allsvenskan":
 *   1. Bara `place === "Winner"` (samma regel som PlayerTrophiesSection —
 *      en 2:a-plats är ingen titel).
 *   2. Bara `country !== "Sweden"` — en svensk titel (t.ex. Svenska Cupen
 *      innan avgången, eller en titel efter en eventuell återkomst till
 *      Allsvenskan) räknas inte som "efter Allsvenskan". Till skillnad från
 *      `player_career_stint` har `player_trophy` INGEN klubbkoppling, så en
 *      exakt säsongs-gräns (samma princip som `stints`-filtret) går inte
 *      att sätta — men en icke-svensk titel kan per definition bara vinnas
 *      medan spelaren faktiskt spelade utomlands, så landsfiltret räcker.
 * Begränsad till spelare som REDAN kvalificerar sig till "Efter
 * Allsvenskan" (samma pool som resten av sidan — se `players`-parametern).
 */
export async function getMostDecoratedAbroad(supabase: Supabase, players: PostAllsvenskanPlayer[], limit = 10): Promise<DecoratedAbroadEntry[]> {
  const rows = await fetchAllRows<TrophyRow>(
    supabase.from("player_trophy").select("player_id, league_name, country, season, place").returns<TrophyRow[]>()
  );

  const qualifyingIds = new Set(players.map((p) => p.playerId));
  const trophiesByPlayer = new Map<number, { leagueName: string; country: string | null; season: string }[]>();
  for (const r of rows) {
    if (!qualifyingIds.has(r.player_id)) continue;
    if (r.place !== "Winner") continue;
    if ((r.country ?? "").trim().toLowerCase() === "sweden") continue;
    const list = trophiesByPlayer.get(r.player_id) ?? [];
    list.push({ leagueName: r.league_name, country: r.country, season: r.season });
    trophiesByPlayer.set(r.player_id, list);
  }

  const playerById = new Map(players.map((p) => [p.playerId, p]));
  return [...trophiesByPlayer.entries()]
    .map(([playerId, trophies]) => ({
      player: playerById.get(playerId)!,
      winCount: trophies.length,
      trophies: trophies.sort((a, b) => b.season.localeCompare(a.season)),
    }))
    .sort((a, b) => b.winCount - a.winCount)
    .slice(0, limit);
}

/** "Vilka klubbars spelare har presterat bäst utomlands" — real summering per f.d. Allsvensk klubb, ingen egen 'framgångspoäng'. */
export function aggregateByPreviousClub(players: PostAllsvenskanPlayer[]): ClubAbroadPerformance[] {
  const byClub = new Map<string, ClubAbroadPerformance>();
  for (const p of players) {
    const existing = byClub.get(p.previousTeamName) ?? {
      previousTeamName: p.previousTeamName,
      previousTeamLogoUrl: p.previousTeamLogoUrl,
      playerCount: 0,
      totalAppearances: 0,
      totalMinutes: 0,
      totalGoals: 0,
      totalAssists: 0,
    };
    existing.playerCount += 1;
    existing.totalAppearances += p.appearances;
    existing.totalMinutes += p.minutesPlayed;
    existing.totalGoals += p.goals;
    existing.totalAssists += p.assists;
    byClub.set(p.previousTeamName, existing);
  }
  return [...byClub.values()].sort((a, b) => b.totalGoals - a.totalGoals);
}
