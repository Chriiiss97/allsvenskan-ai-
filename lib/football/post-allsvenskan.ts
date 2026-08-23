import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { hasPlayedSeason } from "./active-player";
import { displayPlayerName } from "./player-name";
import { normalizeTeamName } from "./team-name-normalize";
import { getLeagueTier, NON_COMPETITIVE_LEAGUE_IDS } from "./league-tier";
import { getLeagueStrength, type LeagueStrength } from "./post-allsvenskan-level";
import { countryKey } from "@/lib/i18n/sv";

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
   * Fas 18l (2026-08-23) — första säsongen i en kvalificerande utlandsstint,
   * dvs. den ÅRSGRÄNS efter vilken något överhuvudtaget kan vara "efter
   * Allsvenskan". Behövs för trofédatan, som (till skillnad från
   * `player_career_stint`) inte har någon klubb- eller Allsvenskan-koppling
   * och därför inte kan filtreras på annat sätt — se getMostDecoratedAbroad.
   */
  firstForeignYear: number;
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

interface TransferEventRow {
  player_id: number;
  transfer_date: string;
  from_team_name: string | null;
  to_team_name: string | null;
}

/**
 * Fas 19c (2026-08-23, hittat i verifieringen av transferspåret nedan) —
 * api-football använder `1926-01-01` som PLATSHÅLLARE när ett riktigt
 * övergångsdatum saknas. Verifierat: exakt 39 rader i vår `player_transfer_
 * event` har det datumet, och de är uppenbart moderna övergångar ("San Diego
 * → Pafos", "Birmingham Legion → GIF Sundsvall"). Nästa faktiska datum i
 * datan är 1999 — det finns alltså ingen äkta övergång att förlora på att
 * kapa här.
 *
 * Spärren är INTE kosmetisk: en avgång daterad 1926 hade fått ALLT utländskt
 * spel att räknas som "efter Allsvenskan", inklusive hela den tidigare
 * karriären för utländska spelare som KOM till Allsvenskan — precis den
 * falska positiven som transferspåret annars är noga konstruerat för att
 * undvika.
 */
const EARLIEST_PLAUSIBLE_TRANSFER_YEAR = 1990;

export async function getPlayersWhoLeftAllsvenskan(supabase: Supabase): Promise<PostAllsvenskanPlayer[]> {
  const [domesticRows, stintRows, playerRows, transferRows, allsvenskaTeamsResult] = await Promise.all([
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
    // Fas 19c (2026-08-23, VERIFIERAT verkligt fall: T. Sana/Ajax) — hela
    // transferhistoriken. Se `allsvenskanDeparturesByPlayer` nedan för varför
    // den behövs: `statistics` täcker bara 2016+, så en avgång dessförinnan
    // syns ENBART här.
    fetchAllRows<TransferEventRow>(
      supabase.from("player_transfer_event").select("player_id, transfer_date, from_team_name, to_team_name").returns<TransferEventRow[]>()
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

  /**
   * Fas 19c (2026-08-23, VERIFIERAT verkligt fall som avslöjade buggen:
   * T. Sana saknade HELA sin Ajax-period 2012–2014 i "Efter Allsvenskan",
   * trots att den syntes i Karriärresan) — ROTORSAK: `statistics`-tabellen
   * (vår Allsvenska matchdata) täcker bara 2016–2026. Sanas IFK Göteborg-tid
   * låg före det, så hans "första Allsvenska år" räknades till 2016 (Malmö
   * FF) och allt tidigare filtrerades bort som "före Allsvenskan" — fastän
   * `player_transfer_event` innehåller det uttryckliga beviset:
   * "2012-07-27: IFK Goteborg → Ajax (€ 400K)".
   *
   * En övergång FRÅN en Allsvensk klubb bevisar att spelaren var i
   * Allsvenskan vid det datumet. Den bevisningen är lika giltig som en
   * `statistics`-rad och används därför som ett andra, likvärdigt spår för
   * att avgöra hur långt tillbaka "efter Allsvenskan" sträcker sig.
   * Klubbnamnet matchas NORMALISERAT ("IFK Goteborg" i transferdatan vs
   * "IFK Göteborg" i vår `team`-tabell — samma återkommande stavningsglapp
   * som team-name-normalize.ts redan finns till för), och visningsnamnet
   * hämtas från VÅR tabell så att diakritiken blir rätt.
   */
  const allsvenskaTeamByNormalizedName = new Map(
    (allsvenskaTeamsResult.data ?? []).map((t) => [normalizeTeamName(t.name), { name: t.name, logoUrl: t.logo_url }])
  );
  const allsvenskanDeparturesByPlayer = new Map<number, { year: number; teamName: string; teamLogoUrl: string | null; toTeamName: string | null }[]>();
  for (const row of transferRows) {
    if (!row.from_team_name) continue;
    const club = allsvenskaTeamByNormalizedName.get(normalizeTeamName(row.from_team_name));
    if (!club) continue; // övergången utgick inte från en Allsvensk klubb — bevisar inget om Allsvenskan
    const year = new Date(row.transfer_date).getUTCFullYear();
    if (Number.isNaN(year) || year < EARLIEST_PLAUSIBLE_TRANSFER_YEAR) continue;
    const list = allsvenskanDeparturesByPlayer.get(row.player_id) ?? [];
    list.push({ year, teamName: club.name, teamLogoUrl: club.logoUrl, toTeamName: row.to_team_name });
    allsvenskanDeparturesByPlayer.set(row.player_id, list);
  }
  for (const list of allsvenskanDeparturesByPlayer.values()) list.sort((a, b) => a.year - b.year);

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
    // Fas 19c — TVÅ likvärdiga spår för "det här hände efter Allsvenskan"
    // (se allsvenskanDeparturesByPlayer ovan för hela resonemanget och
    // T. Sana/Ajax-fallet som avslöjade att ett spår inte räckte):
    //   a) säsongen ligger efter spelarens första Allsvenska säsong i vår
    //      `statistics`-data (gäller allt från 2016 och framåt), ELLER
    //   b) säsongen ligger vid eller efter en DOKUMENTERAD övergång FRÅN en
    //      Allsvensk klubb (fångar avgångar före 2016, som `statistics`
    //      omöjligt kan känna till).
    // En utländsk spelare som kom TILL Allsvenskan får INTE med sin
    // tidigare utlandskarriär av (b): den kräver en övergång ut FRÅN en
    // Allsvensk klubb, vilket per definition inte finns före ankomsten.
    const departures = allsvenskanDeparturesByPlayer.get(playerId) ?? [];
    const firstAllsvenskanDepartureYear = departures.length > 0 ? departures[0].year : null;
    const stints = (stintsByPlayer.get(playerId) ?? []).filter(
      (s) => s.season_year > firstDomesticYear || (firstAllsvenskanDepartureYear !== null && s.season_year >= firstAllsvenskanDepartureYear)
    );
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

    /**
     * Fas 19c — vilka av avgångarna gick FAKTISKT utomlands?
     *
     * Första försöket jämförde destinationens NAMN mot en lista över kända
     * svenska klubbar, men den listan är för skör: verifierat verkligt fall
     * (D. Hümmet) är "gefle IF → trelleborgs FF", två svenska klubbar som
     * ändå räknades som utlandsflytt eftersom Trelleborg stavas "Trelleborg"
     * i karriärdatan och "trelleborgs FF" i transferdatan.
     *
     * Nu krävs POSITIVT BEVIS i stället: destinationsklubben måste finnas
     * som en verklig UTLÄNDSK klubb i spelarens egen dokumenterade
     * matchdata (`stints` är redan filtrerad till icke-svenska klubbar).
     * Det gör kontrollen oberoende av stavningslistor och matchar hur
     * resten av "Efter Allsvenskan" fungerar — allt bygger på dokumenterade
     * matcher, inte på antaganden.
     */
    const foreignClubNames = new Set(stints.map((s) => normalizeTeamName(s.team_name)));
    const departuresAbroad = departures.filter((d) => d.toTeamName !== null && foreignClubNames.has(normalizeTeamName(d.toTeamName)));

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
    // Fas 19c — samma blinda fläck som stint-filtret hade: en avgång FÖRE
    // 2016 syns inte i årssekvensen ovan, eftersom `statistics` inte har
    // något Allsvenskt år att gå FRÅN. Räkna därför även dokumenterade
    // övergångar som FAKTISKT gick utomlands (`wentAbroad`, se ovan —
    // Sanas lån "IFK Goteborg → Qviding FIF" stannade i Sverige och räknas
    // alltså inte). Deduplicerat på (år, destination): api-football har
    // verkligt förekommande dubbletter, t.ex. D. Hümmets Djurgården →
    // Gamba Osaka registrerad både 2025-03-06 och 2025-03-08.
    const uniqueDeparturesAbroad = new Set(departuresAbroad.map((d) => `${d.year}|${normalizeTeamName(d.teamName)}`)).size;
    // Två signaler med OLIKA styrka, och den starka måste vinna: årssekvensen
    // ovan är en HÄRLEDNING (den ser bara "Allsvenskt år följt av utländskt
    // år") medan `uniqueDeparturesAbroad` är DOKUMENTERADE övergångar med
    // verifierad destination. Att ta Math.max av båda propagerade
    // årssekvensens fel — D. Hümmet blev 4 istället för sina verkliga 3,
    // eftersom hans säsongsmönster gav en extra skenbar övergång. Använd
    // därför transferdatan när den finns, och årssekvensen bara som
    // reservutväg för spelare utan importerad transferhistorik.
    departureCount = uniqueDeparturesAbroad > 0 ? uniqueDeparturesAbroad : Math.max(departureCount, 1);

    const player = playerById.get(playerId);
    if (!player) continue;

    // "Lämnade X (år)" = klubben spelaren var vid strax INNAN den FÖRSTA
    // kvalificerande utlandssäsongen — inte spelarens senaste Allsvenska
    // klubb (som för en återvändare kan vara samma klubb han sitter i
    // just nu, se filhuvudets T. Sana-exempel).
    const firstForeignYear = Math.min(...stints.map((s) => s.season_year));
    const domesticBeforeFirstDeparture = domesticEntries.filter((d) => d.year <= firstForeignYear).sort((a, b) => b.year - a.year)[0];
    // Fas 19c — när `statistics` inte når tillbaka till avgången (T. Sana
    // lämnade IFK Göteborg 2012, vår Allsvenska data börjar 2016) är den
    // DOKUMENTERADE övergången den enda korrekta källan. Prioritetsordning:
    //   1. Allsvensk säsong strax före avgången (mest exakt när den finns)
    //   2. dokumenterad övergång ut från en Allsvensk klubb vid/före avgången
    //   3. spelarens senaste Allsvenska säsong (sista utväg)
    // Utan (2) fick Sana "Lämnade Malmö FF 2017" trots att den avgång som
    // faktiskt inledde hans utlandskarriär var IFK Göteborg → Ajax 2012.
    const departureBeforeFirstForeign = departuresAbroad.filter((d) => d.year <= firstForeignYear).sort((a, b) => b.year - a.year)[0];
    const lastDomestic =
      domesticBeforeFirstDeparture ?? departureBeforeFirstForeign ?? [...domesticEntries].sort((a, b) => b.year - a.year)[0];

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
      firstForeignYear,
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
 * `player_trophy.season` är rå text från api-football: "2019/2020" eller
 * "2019". Titeln avgörs vid säsongens SLUT, så SLUTåret är rätt år att pröva
 * mot "efter Allsvenskan"-gränsen ("2021/2022" för en spelare som lämnade
 * inför 2022 är vunnen utomlands, inte innan). Startåret används däremot vid
 * klubbmatchningen, eftersom `player_career_stint.season_year` är startåret.
 */
function trophySeasonYears(season: string): { startYear: number | null; endYear: number | null } {
  const years = season.match(/\d{4}/g);
  if (!years) return { startYear: null, endYear: null };
  return { startYear: Number(years[0]), endYear: Number(years[years.length - 1]) };
}

/**
 * Fas 18k (2026-08-23, "Mest dekorerad efter Allsvenskan") — troféer VUNNA
 * UTOMLANDS (player_trophy, real data från api-football /trophies, se
 * player-trophies.ts:s filhuvud). Tre regler:
 *   1. Bara `place === "Winner"` (samma regel som PlayerTrophiesSection —
 *      en 2:a-plats är ingen titel).
 *   2. Bara `country !== "Sweden"` — en svensk titel (t.ex. Svenska Cupen
 *      innan avgången, eller en titel efter en eventuell återkomst till
 *      Allsvenskan) räknas inte som "efter Allsvenskan".
 *   3. Fas 18l (2026-08-23, BUGG hittad i verifieringen av den nya
 *      detaljvyn): titeln måste vara vunnen `firstForeignYear` eller senare.
 *      Filhuvudet hävdade tidigare att en icke-svensk titel "per definition
 *      bara kan vinnas medan spelaren spelade utomlands" — det är FALSKT för
 *      alla utländska spelare som kom TILL Allsvenskan med en meritlista.
 *      Verkligt fall: V. Kreida låg #1 på 12 titlar, varav 8 vunna med Flora
 *      Tallinn 2015–2021, alltså INNAN han någonsin lämnade Allsvenskan.
 * Begränsad till spelare som REDAN kvalificerar sig till "Efter
 * Allsvenskan" (samma pool som resten av sidan — se `players`-parametern).
 */
export async function getMostDecoratedAbroad(supabase: Supabase, players: PostAllsvenskanPlayer[], limit = 10): Promise<DecoratedAbroadEntry[]> {
  const rows = await fetchAllRows<TrophyRow>(
    supabase.from("player_trophy").select("player_id, league_name, country, season, place").returns<TrophyRow[]>()
  );

  const playerById = new Map(players.map((p) => [p.playerId, p]));
  const trophiesByPlayer = new Map<number, { leagueName: string; country: string | null; season: string }[]>();
  for (const r of rows) {
    const player = playerById.get(r.player_id);
    if (!player) continue;
    if (!isTrophyAfterAllsvenskan(r, player.firstForeignYear)) continue;
    const list = trophiesByPlayer.get(r.player_id) ?? [];
    list.push({ leagueName: r.league_name, country: r.country, season: r.season });
    trophiesByPlayer.set(r.player_id, list);
  }

  return [...trophiesByPlayer.entries()]
    .map(([playerId, trophies]) => ({
      player: playerById.get(playerId)!,
      winCount: trophies.length,
      trophies: trophies.sort((a, b) => b.season.localeCompare(a.season)),
    }))
    .sort((a, b) => b.winCount - a.winCount)
    .slice(0, limit);
}

/** De tre reglerna ovan, på ETT ställe — listan och detaljvyn får aldrig räkna olika. */
function isTrophyAfterAllsvenskan(row: { country: string | null; season: string; place: string }, firstForeignYear: number): boolean {
  if (row.place !== "Winner") return false;
  if ((row.country ?? "").trim().toLowerCase() === "sweden") return false;
  const { endYear } = trophySeasonYears(row.season);
  // Saknas årtal helt går gränsen inte att pröva — då räknas titeln inte,
  // hellre en titel för lite än en som vanns innan spelaren ens lämnade.
  return endYear !== null && endYear >= firstForeignYear;
}

export interface AbroadTrophy {
  leagueName: string;
  country: string | null;
  season: string;
  /** Klubben spelaren dokumenterat spelade för när titeln vanns — null när den inte går att fastställa ENTYDIGT ur karriärdatan. */
  clubName: string | null;
  clubLogoUrl: string | null;
  /**
   * Hur klubben härleddes: "season" = samma land OCH samma säsong som titeln
   * (starkt), "country" = bara samma land, men spelaren har bara haft en enda
   * dokumenterad klubb där (svagare — markeras separat i UI:t). null när
   * ingen klubb kunde knytas till titeln.
   */
  clubMatch: "season" | "country" | null;
}

export interface AbroadTrophyGroup {
  country: string | null;
  count: number;
  /** Nyaste säsong först. */
  trophies: AbroadTrophy[];
}

export interface AbroadTrophySummary {
  total: number;
  /** Flest titlar först. */
  byCountry: AbroadTrophyGroup[];
}

/**
 * Fas 18l (2026-08-23, användarkrav) — listsidans "🏆 Mest dekorerad efter
 * Allsvenskan" visar bara de två senaste titlarna + "+N till"; klickar man
 * på spelaren gick det inte att se VAR resten kom ifrån. Den här funktionen
 * ger HELA titellistan för EN spelare, genom exakt samma
 * isTrophyAfterAllsvenskan-regel som getMostDecoratedAbroad använder — så att
 * antalet aldrig kan skilja sig mellan listan och detaljvyn.
 *
 * `player_trophy` har INGEN klubbkoppling (api-football /trophies ger bara
 * liga/land/säsong/placering). Klubben härleds därför ur den redan
 * importerade karriärdatan (`player_career_stint`) — och BARA när den blir
 * entydig: exakt en klubb i samma land samma säsong, annars exakt en klubb i
 * landet över hela karriären. Går det inte att avgöra visas ingen klubb alls
 * istället för en gissning.
 */
export async function getAbroadTrophies(supabase: Supabase, player: PostAllsvenskanPlayer): Promise<AbroadTrophySummary> {
  const [trophyResult, stintResult] = await Promise.all([
    supabase.from("player_trophy").select("league_name, country, season, place").eq("player_id", player.playerId),
    supabase.from("player_career_stint").select("team_name, team_logo_url, league_country, season_year").eq("player_id", player.playerId),
  ]);
  // Felresistent av samma skäl som getPlayerTrophies: migrationen/importen
  // kan vara okörd — då finns inga titlar att visa, inte ett fel att kasta.
  if (trophyResult.error) return { total: 0, byCountry: [] };

  const stints = (stintResult.data ?? []) as { team_name: string; team_logo_url: string | null; league_country: string | null; season_year: number }[];

  /** Exakt en distinkt klubb i urvalet → den klubben, annars null (ingen gissning). */
  const soleClub = (rows: typeof stints) => {
    const byName = new Map<string, { name: string; logo: string | null }>();
    for (const r of rows) byName.set(normalizeTeamName(r.team_name), { name: r.team_name, logo: r.team_logo_url });
    return byName.size === 1 ? [...byName.values()][0] : null;
  };

  const resolveClub = (country: string | null, season: string): Pick<AbroadTrophy, "clubName" | "clubLogoUrl" | "clubMatch"> => {
    // Fas 19c — `countryKey` istället för rå lowercase: /trophies och
    // /players stavar samma land olika ("Holland" vs "Netherlands",
    // "Czechia" vs "Czech-Republic"), vilket gjorde att klubben aldrig
    // kunde matchas för de länderna. Verifierat verkligt fall: T. Sanas
    // Eredivisie-titlar 2012/13 + 2013/14, som ligger under "Holland" i
    // trofédatan men "Netherlands" i hans Ajax-säsonger.
    const key = countryKey(country);
    const none = { clubName: null, clubLogoUrl: null, clubMatch: null };
    if (!key) return none;
    const inCountry = stints.filter((s) => countryKey(s.league_country) === key);
    if (inCountry.length === 0) return none;
    const { startYear } = trophySeasonYears(season);
    if (startYear !== null) {
      const sameSeason = soleClub(inCountry.filter((s) => s.season_year === startYear));
      if (sameSeason) return { clubName: sameSeason.name, clubLogoUrl: sameSeason.logo, clubMatch: "season" };
    }
    const anySeason = soleClub(inCountry);
    return anySeason ? { clubName: anySeason.name, clubLogoUrl: anySeason.logo, clubMatch: "country" } : none;
  };

  const trophies: AbroadTrophy[] = (trophyResult.data ?? [])
    .filter((r) => isTrophyAfterAllsvenskan(r, player.firstForeignYear))
    .map((r) => ({ leagueName: r.league_name, country: r.country, season: r.season, ...resolveClub(r.country, r.season) }));

  const groups = new Map<string, AbroadTrophyGroup>();
  for (const t of trophies) {
    const key = t.country ?? "";
    const group = groups.get(key) ?? { country: t.country, count: 0, trophies: [] };
    group.count += 1;
    group.trophies.push(t);
    groups.set(key, group);
  }

  return {
    total: trophies.length,
    byCountry: [...groups.values()]
      .map((g) => ({ ...g, trophies: g.trophies.sort((a, b) => b.season.localeCompare(a.season)) }))
      .sort((a, b) => b.count - a.count || (a.country ?? "").localeCompare(b.country ?? "")),
  };
}

/**
 * Fas 19c (2026-08-23, användarkrav: "man ska kunna trycka på lagen
 * (utländska lagen) i karriärresan") — stabil URL-nyckel för en utländsk
 * klubb. Bygger på samma normalisering som resten av modulen
 * (team-name-normalize.ts), så att "Estac Troyes"/"ESTAC Troyes" hamnar på
 * samma sida oavsett vilken källa stavningen kom ifrån.
 */
export function foreignClubSlug(teamName: string): string {
  return encodeURIComponent(normalizeTeamName(teamName).replace(/\s+/g, "-"));
}

export interface ForeignClubPlayer {
  player: PostAllsvenskanPlayer;
  /** Spelarens siffror FÖR JUST DEN HÄR klubben (inte hela utlandskarriären). */
  atClub: PostAllsvenskanClubBreakdown;
}

export interface ForeignClubSummary {
  teamName: string;
  teamLogoUrl: string | null;
  country: string | null;
  players: ForeignClubPlayer[];
  totalAppearances: number;
  totalMinutes: number;
  totalGoals: number;
  totalAssists: number;
}

/**
 * Alla f.d. Allsvenska spelare som spelat för EN specifik utländsk klubb —
 * grunden för klubbvyn man når genom att klicka på ett lag i karriärresan
 * eller i "Fördelning per klubb". Ren omgruppering av redan beräknad,
 * redan Allsvensk-fritt filtrerad data (`byClub`) — ingen ny fråga, ingen
 * ny statistik. Returnerar null när slugen inte matchar någon klubb.
 */
export function getForeignClubSummary(players: PostAllsvenskanPlayer[], slug: string): ForeignClubSummary | null {
  const matches: ForeignClubPlayer[] = [];
  for (const player of players) {
    for (const club of player.byClub) {
      if (foreignClubSlug(club.teamName) === slug) matches.push({ player, atClub: club });
    }
  }
  if (matches.length === 0) return null;

  // Visningsnamn/logga/land från den post som har MEST speltid — en enstaka
  // cup-rad ska inte få avgöra hur klubben presenteras (samma princip som
  // career-journey.ts redan använder för landsetiketten).
  const representative = [...matches].sort((a, b) => b.atClub.minutesPlayed - a.atClub.minutesPlayed)[0].atClub;

  return {
    teamName: representative.teamName,
    teamLogoUrl: representative.teamLogoUrl,
    country: matches.map((m) => m.atClub.country).find((c) => c !== null) ?? null,
    players: matches.sort((a, b) => b.atClub.goals - a.atClub.goals || b.atClub.appearances - a.atClub.appearances),
    totalAppearances: matches.reduce((sum, m) => sum + m.atClub.appearances, 0),
    totalMinutes: matches.reduce((sum, m) => sum + m.atClub.minutesPlayed, 0),
    totalGoals: matches.reduce((sum, m) => sum + m.atClub.goals, 0),
    totalAssists: matches.reduce((sum, m) => sum + m.atClub.assists, 0),
  };
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
