/**
 * Fas 18m (2026-08-23, "Sportmonks-fallback" — se scripts/import/
 * import-player-career-sportmonks.ts) — SAMMA tier 1/2-klassificering som
 * lib/football/league-tier.ts, men matchad på (land, liganamn) istället för
 * api-football:s numeriska `league_external_id`.
 *
 * VARFÖR EN EGEN FIL: Sportmonks och api-football använder HELT OLIKA,
 * inkompatibla numeriska ID-rymder för samma liga (t.ex. är Sportmonks
 * league_id 573 "Allsvenskan", ett tal som råkar vara upptaget av en helt
 * annan tävling i api-football:s numrering). `league-tier.ts` kan alltså
 * INTE återanvändas direkt mot Sportmonks-data. Liganamn+land är däremot
 * källoberoende text — samma verkliga klassificering, bara en annan nyckel.
 *
 * Täcker de länder där vi faktiskt sett Sportmonks-speltid i den research
 * som föregick den här filen (import-player-career-sportmonks.ts:s 88
 * kandidatspelare, som fram tills nu bara importerats via api-football och
 * alltså rimligen rör sig i samma länder som resten av vår export-data) —
 * INTE en fullständig kopia av alla ~150 rader i league-tier.ts. En liga
 * som inte matchar här returnerar null (utesluts) — hellre en spelare för
 * få än en gissad klassificering.
 */

interface CountryTiers {
  country: string;
  tier1: string[];
  tier2: string[];
}

const ENTRIES: CountryTiers[] = [
  { country: "Sweden", tier1: [], tier2: [] }, // Allsvensk data hanteras separat, aldrig via denna klassificerare
  { country: "Norway", tier1: ["Eliteserien"], tier2: ["1. Division", "OBOS-ligaen"] },
  { country: "Denmark", tier1: ["Superliga"], tier2: ["1. Division"] },
  { country: "Finland", tier1: ["Veikkausliiga"], tier2: ["Ykkönen", "Ykkösliiga"] },
  { country: "Iceland", tier1: ["Úrvalsdeild", "Besta deild"], tier2: ["1. Deild"] },
  { country: "Faroe-Islands", tier1: ["Meistaradeildin", "Løgmanssteypid"], tier2: [] },
  { country: "England", tier1: ["Premier League"], tier2: ["Championship"] },
  { country: "Germany", tier1: ["Bundesliga"], tier2: ["2. Bundesliga", "Bundesliga 2"] },
  { country: "France", tier1: ["Ligue 1"], tier2: ["Ligue 2"] },
  { country: "Italy", tier1: ["Serie A"], tier2: ["Serie B"] },
  { country: "Spain", tier1: ["La Liga", "LaLiga"], tier2: ["Segunda División", "LaLiga2", "Segunda"] },
  { country: "Netherlands", tier1: ["Eredivisie"], tier2: ["Eerste Divisie"] },
  { country: "Belgium", tier1: ["Jupiler Pro League", "First Division A"], tier2: ["Challenger Pro League", "First Division B"] },
  { country: "Portugal", tier1: ["Primeira Liga", "Liga Portugal"], tier2: ["Segunda Liga", "Liga Portugal 2"] },
  { country: "Switzerland", tier1: ["Super League"], tier2: ["Challenge League"] },
  { country: "Austria", tier1: ["Bundesliga"], tier2: ["2. Liga"] },
  { country: "Scotland", tier1: ["Premiership"], tier2: ["Championship"] },
  { country: "Poland", tier1: ["Ekstraklasa"], tier2: ["I Liga"] },
  { country: "Turkey", tier1: ["Süper Lig", "Super Lig"], tier2: ["1. Lig"] },
  { country: "Russia", tier1: ["Premier League"], tier2: ["First League"] },
  { country: "Czech-Republic", tier1: ["Czech Liga", "Fortuna Liga"], tier2: [] },
  { country: "Slovakia", tier1: ["Super Liga", "Niké Liga"], tier2: [] },
  { country: "Hungary", tier1: ["NB I", "Nemzeti Bajnokság I"], tier2: [] },
  { country: "Bulgaria", tier1: ["First League"], tier2: ["Second League"] },
  { country: "Romania", tier1: ["Liga I"], tier2: ["Liga II"] },
  { country: "Croatia", tier1: ["HNL"], tier2: ["Prva NL", "First NL"] },
  { country: "Serbia", tier1: ["Super Liga", "SuperLiga"], tier2: ["Prva Liga"] },
  { country: "Slovenia", tier1: ["1. SNL", "PrvaLiga"], tier2: ["2. SNL"] },
  { country: "Bosnia", tier1: ["Premijer Liga"], tier2: [] },
  { country: "Macedonia", tier1: ["First League"], tier2: [] },
  { country: "Albania", tier1: ["Superliga", "Kategoria Superiore"], tier2: ["1st Division", "Kategoria e Parë"] },
  { country: "Kosovo", tier1: ["Superliga"], tier2: [] },
  { country: "Moldova", tier1: ["Super Liga"], tier2: [] },
  { country: "Ukraine", tier1: ["Premier League"], tier2: [] },
  { country: "Belarus", tier1: ["Premier League"], tier2: ["1. Division", "First League"] },
  { country: "Estonia", tier1: ["Meistriliiga"], tier2: [] },
  { country: "Latvia", tier1: ["Virsliga"], tier2: [] },
  { country: "Lithuania", tier1: ["A Lyga"], tier2: [] },
  { country: "Georgia", tier1: ["Erovnuli Liga"], tier2: [] },
  { country: "Armenia", tier1: ["Premier League"], tier2: [] },
  { country: "Azerbaijan", tier1: ["Premyer Liqa"], tier2: [] },
  { country: "Kazakhstan", tier1: ["Premier League"], tier2: [] },
  { country: "Greece", tier1: ["Super League 1", "Super League"], tier2: ["Football League", "Super League 2"] },
  { country: "Cyprus", tier1: ["1. Division"], tier2: ["2. Division"] },
  { country: "Israel", tier1: ["Ligat Ha'al", "Ligat ha'Al"], tier2: ["Liga Leumit"] },
  { country: "Ireland", tier1: ["Premier Division"], tier2: ["First Division"] },
  { country: "Malta", tier1: ["Premier League"], tier2: [] },
  { country: "USA", tier1: ["Major League Soccer", "MLS"], tier2: ["USL Championship"] },
  { country: "Mexico", tier1: ["Liga MX"], tier2: ["Liga de Expansión MX"] },
  { country: "Canada", tier1: ["Canadian Premier League"], tier2: [] },
  { country: "Costa-Rica", tier1: ["Primera División", "Liga Promerica"], tier2: [] },
  { country: "Brazil", tier1: ["Serie A"], tier2: ["Serie B"] },
  { country: "Argentina", tier1: ["Liga Profesional Argentina", "Liga Profesional"], tier2: ["Primera Nacional"] },
  { country: "Chile", tier1: ["Primera División"], tier2: ["Primera B"] },
  { country: "Uruguay", tier1: ["Primera División"], tier2: ["Segunda División"] },
  { country: "Ecuador", tier1: ["Liga Pro", "LigaPro"], tier2: [] },
  { country: "Peru", tier1: ["Primera División", "Liga 1"], tier2: [] },
  { country: "Bolivia", tier1: ["División Profesional", "Primera División"], tier2: [] },
  { country: "Qatar", tier1: ["Stars League"], tier2: [] },
  { country: "Saudi-Arabia", tier1: ["Pro League"], tier2: ["Division 1"] },
  { country: "United-Arab-Emirates", tier1: ["Pro League"], tier2: ["Division 1"] },
  { country: "Japan", tier1: ["J1 League"], tier2: ["J2 League"] },
  { country: "South-Korea", tier1: ["K League 1"], tier2: ["K League 2"] },
  { country: "China", tier1: ["Super League"], tier2: ["League One"] },
  { country: "Thailand", tier1: ["Thai League 1"], tier2: ["Thai League 2"] },
  { country: "Vietnam", tier1: ["V.League 1"], tier2: [] },
  { country: "Malaysia", tier1: ["Super League"], tier2: [] },
  { country: "Indonesia", tier1: ["Liga 1"], tier2: [] },
  { country: "Iran", tier1: ["Persian Gulf Pro League"], tier2: [] },
  { country: "Iraq", tier1: ["Iraqi League"], tier2: [] },
  { country: "Kuwait", tier1: ["Premier League"], tier2: [] },
  { country: "Hong-Kong", tier1: ["Premier League"], tier2: [] },
  { country: "India", tier1: ["Indian Super League"], tier2: ["I-League"] },
  { country: "New-Zealand", tier1: ["National League"], tier2: [] },
  { country: "Egypt", tier1: ["Premier League"], tier2: [] },
  { country: "South-Africa", tier1: ["Premier Soccer League"], tier2: ["1st Division"] },
  { country: "Tunisia", tier1: ["Ligue 1"], tier2: [] },
  { country: "Algeria", tier1: ["Ligue 1"], tier2: [] },
  { country: "Ivory-Coast", tier1: ["Ligue 1"], tier2: [] },
  { country: "Australia", tier1: ["A-League"], tier2: [] },
];

const BY_COUNTRY = new Map(ENTRIES.map((e) => [e.country.trim().toLowerCase(), e]));

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Matchar ett rått Sportmonks-liganamn ("2. Bundesliga", "LaLiga2" osv.) mot
 * en känd tier-lista med en TOLERANT jämförelse (case-insensitive,
 * substräng åt båda hållen) — Sportmonks och den ursprungliga tabellen
 * stavar inte alltid identiskt. Returnerar false hellre än en gissning om
 * det inte finns någon rimlig träff.
 */
function matchesAny(leagueName: string, candidates: string[]): boolean {
  const norm = normalize(leagueName);
  return candidates.some((c) => {
    const cNorm = normalize(c);
    return norm === cNorm || norm.includes(cNorm) || cNorm.includes(norm);
  });
}

/** Samma tier 1/2-betydelse som getLeagueTier i league-tier.ts, men källoberoende (namn+land). null = tier 3+/cup/okänd. */
export function getLeagueTierByName(countryName: string | null, leagueName: string | null): 1 | 2 | null {
  if (!countryName || !leagueName) return null;
  const entry = BY_COUNTRY.get(normalize(countryName));
  if (!entry) return null;
  if (matchesAny(leagueName, entry.tier1)) return 1;
  if (matchesAny(leagueName, entry.tier2)) return 2;
  return null;
}
