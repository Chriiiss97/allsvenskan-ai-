/**
 * Fas 18i (2026-08-23, användarspecifikation) — vilka UTLÄNDSKA ligor som
 * räknas som en "riktig" internationell karriärnivå för "Efter Allsvenskan".
 *
 * Uttryckligt användarkrav: "Efter Allsvenskan" ska inte bara betyda
 * "spelade i ett annat land" (se [[Sweden-country-fix]], fas 18h) — det ska
 * betyda "nådde en etablerad, nationellt erkänd toppnivå" (tier 1 = högsta
 * divisionen, tier 2 = en etablerad, nationellt erkänd andradivision).
 * Tier 3 eller lägre (regionala serier, RFEF-nivåer i Spanien, delstats-
 * mästerskap i Brasilien, reservlag-serier som MLS Next Pro, semi-
 * proffs-/amatörnivåer) räknas INTE.
 *
 * KÄLLA: användarens egen research-tabell (UEFA:s 55 medlemsförbund +
 * CONMEBOL/CONCACAF, 2026-08-23) — matchad mot VARJE distinkt liga som
 * FAKTISKT förekommer i vår importerade `player_career_stint`-data (298
 * distinkta icke-svenska ligor, verifierat med en engångs
 * research-inventering innan den här filen skrevs). Ligor utanför Europa/
 * Amerika (Asien/Mellanöstern/Afrika/Oceanien) täcktes inte av användarens
 * tabell — de välkända, otvetydiga förstadivisionerna i stora fotbolls-
 * länder (Qatar, Saudiarabien, Japan, Sydkorea, Kina, Förenade Arabemiraten,
 * Australien m.fl.) är tillagda separat med samma "otvetydig nationell
 * toppnivå"-princip, tydligt märkt nedan — INTE gissade, men heller inte
 * hämtade direkt ur användarens tabell. Hör av dig om någon av dem ska
 * korrigeras.
 *
 * DESIGNBESLUT — cuper/kontinentala turneringar/vänskapsmatcher tier-
 * klassificeras INTE individuellt (de har ingen egen "nivå", ett
 * cupspel görs av klubbar på alla nivåer). Istället: en spelare
 * KVALIFICERAR SIG till "Efter Allsvenskan" om hen har MINST EN
 * dokumenterad säsong i en tier 1/2-LIGA (denna fil). När en spelare väl
 * kvalificerat sig räknas ALL dokumenterad utländsk statistik (ligan +
 * cuper + kontinentala turneringar den säsongen) in i totalen, precis som
 * idag — annars hade en spelares Champions League-mål "försvunnit" bara
 * för att en enskild cup-rad inte har en egen tier. Se
 * `NON_COMPETITIVE_LEAGUE_IDS` för det enda undantaget (vänskapsmatcher,
 * räknas ALDRIG, oavsett kvalificering).
 */

export const LEAGUE_TIER: Record<number, 1 | 2> = {
  // ── Norden ──────────────────────────────────────────────────────────
  103: 1, // Norge — Eliteserien
  104: 2, // Norge — 1. Division
  119: 1, // Danmark — Superliga
  120: 2, // Danmark — 1. Division
  244: 1, // Finland — Veikkausliiga
  245: 2, // Finland — Ykkönen (äldre namn på tvåan)
  1087: 2, // Finland — Ykkösliiga (nytt namn, samma nivå som Ykkönen)
  164: 1, // Island — Úrvalsdeild (Besta deild)
  165: 2, // Island — 1. Deild
  367: 1, // Färöarna — Meistaradeildin
  491: 1, // Färöarna — Løgmanssteypid (äldre sponsornamn, samma liga)

  // ── Stora Europa ────────────────────────────────────────────────────
  39: 1, // England — Premier League
  40: 2, // England — Championship
  78: 1, // Tyskland — Bundesliga
  79: 2, // Tyskland — 2. Bundesliga
  61: 1, // Frankrike — Ligue 1
  62: 2, // Frankrike — Ligue 2
  135: 1, // Italien — Serie A
  136: 2, // Italien — Serie B
  140: 1, // Spanien — La Liga
  141: 2, // Spanien — Segunda División
  88: 1, // Nederländerna — Eredivisie
  89: 2, // Nederländerna — Eerste Divisie
  144: 1, // Belgien — Jupiler Pro League
  145: 2, // Belgien — Challenger Pro League
  94: 1, // Portugal — Primeira Liga
  95: 2, // Portugal — Segunda Liga
  207: 1, // Schweiz — Super League
  208: 2, // Schweiz — Challenge League
  218: 1, // Österrike — Bundesliga
  219: 2, // Österrike — 2. Liga
  179: 1, // Skottland — Premiership
  180: 2, // Skottland — Championship

  // ── Östeuropa / Balkan / Baltikum / Kaukasus ───────────────────────
  106: 1, // Polen — Ekstraklasa
  107: 2, // Polen — I Liga
  203: 1, // Turkiet — Süper Lig
  204: 2, // Turkiet — 1. Lig
  235: 1, // Ryssland — Premier League
  236: 2, // Ryssland — First League
  345: 1, // Tjeckien — Czech Liga
  332: 1, // Slovakien — Super Liga (Niké Liga)
  271: 1, // Ungern — NB I
  172: 1, // Bulgarien — First League
  173: 2, // Bulgarien — Second League
  283: 1, // Rumänien — Liga I
  284: 2, // Rumänien — Liga II
  210: 1, // Kroatien — HNL
  211: 2, // Kroatien — First NL (Prva NL)
  286: 1, // Serbien — Super Liga
  287: 2, // Serbien — Prva Liga
  373: 1, // Slovenien — 1. SNL
  374: 2, // Slovenien — 2. SNL
  315: 1, // Bosnien — Premijer Liga
  371: 1, // Nordmakedonien — First League
  310: 1, // Albanien — Superliga (Kategoria Superiore)
  311: 2, // Albanien — 1st Division (Kategoria e Parë)
  664: 1, // Kosovo — Superliga
  394: 1, // Moldavien — Super Liga
  333: 1, // Ukraina — Premier League
  116: 1, // Belarus — Premier League
  117: 2, // Belarus — 1. Division (First League)
  329: 1, // Estland — Meistriliiga
  365: 1, // Lettland — Virsliga
  362: 1, // Litauen — A Lyga
  327: 1, // Georgien — Erovnuli Liga
  342: 1, // Armenien — Premier League
  419: 1, // Azerbajdzjan — Premyer Liqa
  389: 1, // Kazakstan — Premier League

  // ── Medelhavet / mindre europeiska ligor ───────────────────────────
  197: 1, // Grekland — Super League 1
  198: 2, // Grekland — Football League (äldre namn på tvåan)
  494: 2, // Grekland — Super League 2 (nytt namn, samma nivå)
  318: 1, // Cypern — 1. Division
  319: 2, // Cypern — 2. Division
  383: 1, // Israel — Ligat Ha'al
  382: 2, // Israel — Liga Leumit
  357: 1, // Irland — Premier Division
  358: 2, // Irland — First Division
  393: 1, // Malta — Premier League

  // ── Nordamerika ─────────────────────────────────────────────────────
  253: 1, // USA — Major League Soccer
  255: 2, // USA — USL Championship (Union Omaha/USL League One ska INTE räknas — se filhuvudet)
  262: 1, // Mexiko — Liga MX
  263: 2, // Mexiko — Liga de Expansión MX
  479: 1, // Kanada — Canadian Premier League
  162: 1, // Costa Rica — Primera División

  // ── Sydamerika ──────────────────────────────────────────────────────
  71: 1, // Brasilien — Serie A
  72: 2, // Brasilien — Serie B
  128: 1, // Argentina — Liga Profesional Argentina
  129: 2, // Argentina — Primera Nacional
  265: 1, // Chile — Primera División
  266: 2, // Chile — Primera B
  270: 1, // Uruguay — Primera División
  269: 2, // Uruguay — Segunda División
  242: 1, // Ecuador — Liga Pro
  281: 1, // Peru — Primera División
  344: 1, // Bolivia — Primera División

  // ── Asien / Mellanöstern (utökat utöver användarens Europa/Amerika-
  //    tabell — otvetydiga, allmänt kända förstadivisioner, se filhuvudet) ──
  305: 1, // Qatar — Stars League
  307: 1, // Saudiarabien — Pro League
  308: 2, // Saudiarabien — Division 1
  301: 1, // Förenade Arabemiraten — Pro League
  303: 2, // Förenade Arabemiraten — Division 1
  98: 1, // Japan — J1 League
  99: 2, // Japan — J2 League
  292: 1, // Sydkorea — K League 1
  293: 2, // Sydkorea — K League 2
  169: 1, // Kina — Super League
  170: 2, // Kina — League One
  296: 1, // Thailand — Thai League 1
  297: 2, // Thailand — Thai League 2
  340: 1, // Vietnam — V.League 1
  278: 1, // Malaysia — Super League
  274: 1, // Indonesien — Liga 1
  290: 1, // Iran — Persian Gulf Pro League
  542: 1, // Irak — Iraqi League
  330: 1, // Kuwait — Premier League
  380: 1, // Hongkong — Premier League
  324: 2, // Indien — I-League (nationell tvåa efter Indian Super League)
  1056: 1, // Nya Zeeland — National League

  // ── Afrika ──────────────────────────────────────────────────────────
  233: 1, // Egypten — Premier League
  288: 1, // Sydafrika — Premier Soccer League
  289: 2, // Sydafrika — 1st Division
  202: 1, // Tunisien — Ligue 1
  186: 1, // Algeriet — Ligue 1
  386: 1, // Elfenbenskusten — Ligue 1

  // ── Oceanien ────────────────────────────────────────────────────────
  188: 1, // Australien — A-League
};

/**
 * Rader som ALDRIG räknas, oavsett om spelaren annars kvalificerar sig —
 * vänskapsmatcher är inte konkurrensmässig statistik. (Import-skriptet
 * filtrerar redan bort `/friendl/i`-matchande tävlingsnamn vid import, men
 * "Friendlies Clubs" (id 667) finns i data importerad innan det filtret
 * fanns — exkluderas här som ett extra skyddsnät.)
 */
export const NON_COMPETITIVE_LEAGUE_IDS = new Set<number>([667]);

/** Tier 1/2 om ligan är klassificerad, annars null (cup/kontinental/tier 3+/okänd). */
export function getLeagueTier(leagueExternalId: number | null): 1 | 2 | null {
  if (leagueExternalId === null) return null;
  return LEAGUE_TIER[leagueExternalId] ?? null;
}
