/**
 * Fas 18j (2026-08-23, användarbeslut) — LIGANS STYRKA, en femgradig skala
 * som används av nivåkomponenten i "Mest lyckad efter Allsvenskan"
 * (post-allsvenskan-success.ts).
 *
 * ── Varför en EGEN fil vid sidan av `league-tier.ts` ──────────────────────
 * `league-tier.ts` svarar på en HELT ANNAN fråga: "är det här en riktig,
 * nationellt erkänd toppnivå (tier 1) eller etablerad andradivision
 * (tier 2)?" — den är en KVALIFICERINGSSPÄRR för vem som överhuvudtaget
 * hamnar i Efter Allsvenskan-listan, och den är redan i produktion. Där är
 * Maltas Premier League och Premier League BÅDA tier 1, vilket är helt
 * korrekt för den frågan. Den här filen svarar istället på "hur STARK är
 * ligan?" — en axel som `league-tier.ts` medvetet inte har. Filerna skriver
 * aldrig om varandra: `league-tier.ts` avgör VEM som kommer med,
 * `LEAGUE_STRENGTH` avgör HUR TUNGT en spelad minut väger i nivåkomponenten.
 *
 * ── KÄLLA OCH ÄRLIGHET OM VAD DET HÄR ÄR ─────────────────────────────────
 * Det här är en UTTRYCKLIGEN EXPERTBEDÖMD skala, inte härledd ur vår data.
 * Användaren valde den varianten uttryckligen (2026-08-23) framför både
 * "ingen ligavikt alls" och "europaspel som nivåbevis". Rangordningen följer
 * UEFA:s klubbkoefficient-nivåer för de europeiska förbunden och allmänt
 * vedertagen nivåbedömning för ligor utanför Europa — samma sorts öppet
 * redovisade expertvikt som POSITION_RATING_CONFIG redan bygger på, och den
 * visas för användaren i UI:t (Så räknas "mest lyckad"-vyn) istället för att
 * gömmas. Den är ALLTID diskutabel i marginalen (Danmark 4 vs Norge 3,
 * MLS 3 vs 2) — hör av dig så justeras den.
 *
 * ── DESIGNBESLUT: bara LIGOR har en nivå ─────────────────────────────────
 * Cuper, kontinentala turneringar (Champions/Europa/Conference League) och
 * vänskapsmatcher saknas MEDVETET här och räknas alltså inte in i nivå-
 * snittet. Skälet är konkret: api-footballs Champions League-data innehåller
 * även KVALomgångar, så en färöisk eller isländsk klubb kan ha "Champions
 * League"-minuter — hade turneringen fått nivå 5 skulle den spelaren
 * felaktigt se ut att ha spelat på Europas absoluta toppnivå. Minuterna
 * försvinner inte för det: de räknas fortfarande fullt ut i etablerings-
 * komponenten (total speltid), de bidrar bara inte till NIVÅ-bedömningen.
 *
 * En liga som inte finns i tabellen nedan räknas inte heller in i nivå-
 * snittet (istället för att gissas till en nivå). Tabellen täcker varje id i
 * `league-tier.ts` plus de vanligaste lägre divisionerna i vår data, så det
 * gäller i praktiken bara marginella tävlingar.
 */

/** 5 = Europas fem toppligor, 1 = lägre division. Se LEVEL_LABEL för formuleringarna som visas. */
export type LeagueStrength = 1 | 2 | 3 | 4 | 5;

export const LEAGUE_STRENGTH: Record<number, LeagueStrength> = {
  // ── 5: Europas fem toppligor ────────────────────────────────────────
  39: 5, // England — Premier League
  140: 5, // Spanien — La Liga
  135: 5, // Italien — Serie A
  78: 5, // Tyskland — Bundesliga
  61: 5, // Frankrike — Ligue 1

  // ── 4: etablerade europeiska toppligor + topp-5-ligornas andradivisioner ──
  88: 4, // Nederländerna — Eredivisie
  94: 4, // Portugal — Primeira Liga
  144: 4, // Belgien — Jupiler Pro League
  203: 4, // Turkiet — Süper Lig
  207: 4, // Schweiz — Super League
  218: 4, // Österrike — Bundesliga
  345: 4, // Tjeckien — Czech Liga
  210: 4, // Kroatien — HNL
  197: 4, // Grekland — Super League 1
  179: 4, // Skottland — Premiership
  119: 4, // Danmark — Superliga
  235: 4, // Ryssland — Premier League
  333: 4, // Ukraina — Premier League
  40: 4, // England — Championship
  79: 4, // Tyskland — 2. Bundesliga
  136: 4, // Italien — Serie B
  141: 4, // Spanien — Segunda División
  62: 4, // Frankrike — Ligue 2
  71: 4, // Brasilien — Serie A
  128: 4, // Argentina — Liga Profesional

  // ── 3: starka nationella ligor + starka andradivisioner ─────────────
  103: 3, // Norge — Eliteserien
  106: 3, // Polen — Ekstraklasa
  283: 3, // Rumänien — Liga I
  286: 3, // Serbien — Super Liga
  271: 3, // Ungern — NB I
  172: 3, // Bulgarien — First League
  373: 3, // Slovenien — 1. SNL
  332: 3, // Slovakien — Super Liga
  318: 3, // Cypern — 1. Division
  383: 3, // Israel — Ligat Ha'al
  253: 3, // USA — Major League Soccer
  262: 3, // Mexiko — Liga MX
  98: 3, // Japan — J1 League
  292: 3, // Sydkorea — K League 1
  169: 3, // Kina — Super League
  307: 3, // Saudiarabien — Pro League
  305: 3, // Qatar — Stars League
  265: 3, // Chile — Primera División
  270: 3, // Uruguay — Primera División
  242: 3, // Ecuador — Liga Pro
  89: 3, // Nederländerna — Eerste Divisie
  145: 3, // Belgien — Challenger Pro League
  204: 3, // Turkiet — 1. Lig
  41: 3, // England — League One
  80: 3, // Tyskland — 3. Liga

  // ── 2: mindre nationella toppligor + mellanandradivisioner ──────────
  244: 2, // Finland — Veikkausliiga
  164: 2, // Island — Úrvalsdeild
  367: 2, // Färöarna — Meistaradeildin
  329: 2, // Estland — Meistriliiga
  365: 2, // Lettland — Virsliga
  362: 2, // Litauen — A Lyga
  327: 2, // Georgien — Erovnuli Liga
  342: 2, // Armenien — Premier League
  419: 2, // Azerbajdzjan — Premyer Liqa
  389: 2, // Kazakstan — Premier League
  116: 2, // Belarus — Premier League
  315: 2, // Bosnien — Premijer Liga
  371: 2, // Nordmakedonien — First League
  310: 2, // Albanien — Superliga
  664: 2, // Kosovo — Superliga
  394: 2, // Moldavien — Super Liga
  357: 2, // Irland — Premier Division
  393: 2, // Malta — Premier League
  188: 2, // Australien — A-League
  301: 2, // Förenade Arabemiraten — Pro League
  290: 2, // Iran — Persian Gulf Pro League
  296: 2, // Thailand — Thai League 1
  340: 2, // Vietnam — V.League 1
  278: 2, // Malaysia — Super League
  274: 2, // Indonesien — Liga 1
  233: 2, // Egypten — Premier League
  288: 2, // Sydafrika — Premier Soccer League
  202: 2, // Tunisien — Ligue 1
  186: 2, // Algeriet — Ligue 1
  162: 2, // Costa Rica — Primera División
  479: 2, // Kanada — Canadian Premier League
  281: 2, // Peru — Primera División
  344: 2, // Bolivia — Primera División
  104: 2, // Norge — 1. Division
  120: 2, // Danmark — 1. Division
  95: 2, // Portugal — Segunda Liga
  208: 2, // Schweiz — Challenge League
  219: 2, // Österrike — 2. Liga
  180: 2, // Skottland — Championship
  107: 2, // Polen — I Liga
  236: 2, // Ryssland — First League
  42: 2, // England — League Two
  255: 2, // USA — USL Championship
  99: 2, // Japan — J2 League
  293: 2, // Sydkorea — K League 2
  170: 2, // Kina — League One
  72: 2, // Brasilien — Serie B
  129: 2, // Argentina — Primera Nacional

  // ── 1: lägre divisioner / regionala nivåer ──────────────────────────
  245: 1, // Finland — Ykkönen
  1087: 1, // Finland — Ykkösliiga
  165: 1, // Island — 1. Deild
  474: 1, // Norge — 2. Division
  173: 1, // Bulgarien — Second League
  284: 1, // Rumänien — Liga II
  211: 1, // Kroatien — First NL
  287: 1, // Serbien — Prva Liga
  374: 1, // Slovenien — 2. SNL
  311: 1, // Albanien — 1st Division
  117: 1, // Belarus — 1. Division
  198: 1, // Grekland — Football League
  494: 1, // Grekland — Super League 2
  319: 1, // Cypern — 2. Division
  382: 1, // Israel — Liga Leumit
  358: 1, // Irland — First Division
  43: 1, // England — National League
  492: 1, // Nederländerna — Tweede Divisie
  487: 1, // Belgien — First Amateur Division
  263: 1, // Mexiko — Liga de Expansión MX
  266: 1, // Chile — Primera B
  269: 1, // Uruguay — Segunda División
  131: 1, // Argentina — Primera B Metropolitana
  75: 1, // Brasilien — Serie C
  76: 1, // Brasilien — Serie D
  629: 1, // Brasilien — Mineiro (delstatsmästerskap)
  308: 1, // Saudiarabien — Division 1
  303: 1, // Förenade Arabemiraten — Division 1
  297: 1, // Thailand — Thai League 2
  542: 1, // Irak — Iraqi League
  330: 1, // Kuwait — Premier League
  380: 1, // Hongkong — Premier League
  324: 1, // Indien — I-League
  1056: 1, // Nya Zeeland — National League
  289: 1, // Sydafrika — 1st Division
  386: 1, // Elfenbenskusten — Ligue 1
  1000: 1, // Spanien — Segunda División RFEF (play-offs)
  1006: 1, // Spanien — Primera División RFEF (play-offs)
  977: 1, // Spanien — Tercera División RFEF (play-offs)
  436: 1, // Spanien — Primera División RFEF
  692: 1, // Spanien — Primera División RFEF
  879: 1, // Spanien — Segunda División RFEF
};

/** Poäng 0–100 per nivåsteg — jämnt fördelat, inga dolda kurvor. */
export const LEVEL_SCORE: Record<LeagueStrength, number> = { 5: 100, 4: 80, 3: 60, 2: 40, 1: 20 };

/** Formuleringarna som visas för användaren — aldrig råa siffror som "nivå 4". */
export const LEVEL_LABEL: Record<LeagueStrength, string> = {
  5: "en av Europas fem toppligor",
  4: "en etablerad europeisk toppliga",
  3: "en stark nationell liga",
  2: "en mindre nationell toppliga",
  1: "en lägre division",
};

/** Nivån för en liga, eller null för cup/kontinental/vänskaps/oklassad tävling (räknas inte in i nivåsnittet). */
export function getLeagueStrength(leagueExternalId: number | null): LeagueStrength | null {
  if (leagueExternalId === null) return null;
  return LEAGUE_STRENGTH[leagueExternalId] ?? null;
}
