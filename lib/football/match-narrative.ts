import type { H2HSummary } from "./match-h2h-summary";
import type { FormRecord } from "@/components/data/MatchFormSequence";
import type { MatchInsight } from "./match-insight";
import type { KeyPlayerCategory } from "./match-key-players";
import type { ComparisonHighlight } from "./match-preview-sv";
import type { MatchRecap } from "./match-recap";
import type { MatchTeamStatsComparison } from "./team-rollup";

interface MatchEventLite {
  type: string;
  player: string | null;
}

/**
 * Fas 16i (2026-08-22) — Matchrapportens analytiska text, både inför och
 * efter matchen. Fortfarande INGET LLM-anrop: varje mening kommer från en
 * deterministisk klausul-funktion byggd på redan verifierade tal. Skillnad
 * mot tidigare version: klausulerna producerar nu OBSERVATION + RELATION +
 * TOLKNING i sammanhängande meningar istället för en kort "led"-mening
 * följt av en isolerad sifferrad ("Hammarby hade mer boll." / "53%–47%.").
 * Antalet meningar är INTE ett mål i sig — en match med tunt underlag ska
 * ge en kort, ärlig rapport, inte utfyllnad. Se magnitude*-hjälparna nedan:
 * ordvalet ("litet"/"tydligt"/"stort" övertag osv.) är alltid en ren
 * tröskelklassificering av samma tal meningen redan visar, aldrig en egen
 * bedömning utöver det. Ingen mening påstår ORSAK ("kollapsade eftersom")
 * — bara SAMBAND ("sammanföll med").
 */

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}

/** Svensk uppräkning: "a", "a och b", "a, b och c" — aldrig "a och b och c". */
function svenskLista(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} och ${parts[parts.length - 1]}`;
}

// --- Magnitude-klassificerare: samma tröskeltänk återanvänt överallt ------

/** H2H-övertag: andelen av alla möten som skiljer segrarna åt. */
function h2hMarginTier(homeWins: number, awayWins: number, total: number): "jämn" | "litet" | "tydligt" | "stort" {
  const pct = total > 0 ? (Math.abs(homeWins - awayWins) / total) * 100 : 0;
  if (pct < 8) return "jämn";
  if (pct < 20) return "litet";
  if (pct < 35) return "tydligt";
  return "stort";
}

/** Formgap: skillnad i antal vinster över samma fönster (t.ex. 5 matcher). */
function formGapTier(winDiff: number): "jämn" | "signal" {
  return winDiff >= 2 ? "signal" : "jämn";
}

/** Kvoten mellan två snittvärden (mål/match, xG osv.) — hur mycket "vassare" är det högre talet. */
function ratioTier(higher: number, lower: number): "jämn" | "liten" | "tydlig" {
  const ratio = higher / Math.max(lower, 0.01);
  if (ratio < 1.1) return "jämn";
  if (ratio < 1.3) return "liten";
  return "tydlig";
}

function magnitudeWord(absPct: number): "marginellt" | "något" | "tydligt" | "betydligt" {
  if (absPct >= 40) return "betydligt";
  if (absPct >= 20) return "tydligt";
  if (absPct >= 8) return "något";
  return "marginellt";
}

// --- Inför matchen ---------------------------------------------------------

interface Analysis {
  sentence: string;
  favors: "home" | "away" | null;
  strong: boolean;
}

function h2hAnalysis(h2h: H2HSummary, home: string, away: string): Analysis {
  const tier = h2hMarginTier(h2h.homeWins, h2h.awayWins, h2h.totalMatches);
  const leader = h2h.homeWins === h2h.awayWins ? null : h2h.homeWins > h2h.awayWins ? home : away;
  const trailer = leader === home ? away : home;
  const leaderWins = leader === home ? h2h.homeWins : h2h.awayWins;
  const trailerWins = leader === home ? h2h.awayWins : h2h.homeWins;

  if (!leader) {
    return {
      sentence: `Historiken mellan lagen är mycket jämn — ${h2h.homeWins} segrar vardera på ${h2h.totalMatches} möten (${h2h.draws} oavgjorda) ger inget lag ett statistiskt övertag.`,
      favors: null,
      strong: false,
    };
  }
  const tierWord = tier === "stort" ? "ett stort" : tier === "tydligt" ? "ett tydligt" : "ett litet";
  let sentence = `${leader} har haft ${tierWord} historiskt övertag i mötena, med ${leaderWins} segrar på de ${h2h.totalMatches} senaste matcherna mot ${trailer}s ${trailerWins}${h2h.draws > 0 ? ` (${h2h.draws} oavgjorda)` : ""}.`;
  if (tier === "litet" || tier === "jämn") {
    sentence += ` Marginalen är dock liten och räcker inte ensam för att göra ${leader} till en tydlig favorit.`;
  }
  return { sentence, favors: leader === home ? "home" : "away", strong: tier === "tydligt" || tier === "stort" };
}

function homeRecordAnalysis(h2h: H2HSummary, home: string): Analysis | null {
  if (h2h.homeWinsAtHome == null || h2h.homeWins === 0) return null;
  const share = h2h.homeWinsAtHome / h2h.homeWins;
  if (share >= 0.6 && h2h.homeWinsAtHome >= 2) {
    return {
      sentence: `${home}s övertag i matchupen blir tydligare på hemmaplan, där laget vunnit ${h2h.homeWinsAtHome} av sina ${h2h.homeWins} tidigare segrar — det gör hemmafördelen till en relevant del av förhandsbilden.`,
      favors: "home",
      strong: true,
    };
  }
  return null;
}

function goalsAnalysis(h2h: H2HSummary, home: string, away: string): Analysis | null {
  if (h2h.homeGoalsPerMatch == null || h2h.awayGoalsPerMatch == null) return null;
  const homeHigher = h2h.homeGoalsPerMatch >= h2h.awayGoalsPerMatch;
  const higher = homeHigher ? h2h.homeGoalsPerMatch : h2h.awayGoalsPerMatch;
  const lower = homeHigher ? h2h.awayGoalsPerMatch : h2h.homeGoalsPerMatch;
  const tier = ratioTier(higher, lower);
  if (tier === "jämn") return null;
  const leader = homeHigher ? home : away;
  const trailer = homeHigher ? away : home;
  const tail = tier === "tydlig" ? `Skillnaden är tillräckligt stor för att ge ${leader} ett offensivt övertag i den historiska statistiken.` : `Övertaget är dock litet och väger inte tungt på egen hand.`;
  return {
    sentence: `${leader} har historiskt gjort mer mål i den här matchupen, ${fmt(higher)} per möte jämfört med ${trailer}s ${fmt(lower)}. ${tail}`,
    favors: leader === home ? "home" : "away",
    strong: tier === "tydlig",
  };
}

function formAnalysis(homeForm: FormRecord | null, awayForm: FormRecord | null, home: string, away: string): Analysis | null {
  if (!homeForm || !awayForm || homeForm.played === 0 || awayForm.played === 0) return null;
  const winDiff = homeForm.wins - awayForm.wins;
  const tier = formGapTier(Math.abs(winDiff));
  if (tier === "jämn") {
    return { sentence: "Formkurvorna inför matchen är relativt jämna och ger därför inget starkt statistiskt stöd åt något av lagen.", favors: null, strong: false };
  }
  const leader = winDiff > 0 ? home : away;
  const leaderForm = winDiff > 0 ? homeForm : awayForm;
  const trailer = winDiff > 0 ? away : home;
  const trailerForm = winDiff > 0 ? awayForm : homeForm;
  return {
    sentence: `${leader} kommer in i matchen med ${leaderForm.wins} segrar på de ${leaderForm.played} senaste matcherna, vilket pekar på en stabil aktuell formkurva. ${trailer} har samtidigt bara ${trailerForm.wins} ${trailerForm.wins === 1 ? "seger" : "segrar"} under motsvarande period, vilket ger ${leader} ett tydligare momentum inför mötet.`,
    favors: leader === home ? "home" : "away",
    strong: true,
  };
}

// Indefinit, possessiv-vänlig form av kategorinamnen — kategorititlarna
// ("Bästa målchansen") är skrivna för egna rubriker (bestämd form), inte
// för att klistras in mitt i en mening efter "Lagets" ("Lagets bästa
// målchansen" är fel svenska) — därför en egen, liten uppsättning här.
const NARRATIVE_LABEL: Record<string, string> = { xGOT: "tydligaste målhot", xG: "främsta offensiva hot" };

function primaryKeyPlayerCategory(categories: KeyPlayerCategory[]): KeyPlayerCategory | null {
  return categories.find((c) => c.key === "xG") ?? categories.find((c) => c.key === "xGOT") ?? categories[0] ?? null;
}

/** Nyckelspelarklausulen: kombinerar roll + underliggande siffra i EN
 * mening, och slår ihop med betygsklausulen till EN mening om det råkar
 * vara SAMMA spelare som toppar båda måtten (annars två separata namn). */
function keyPlayerClauses(categories: KeyPlayerCategory[]): string[] {
  const primary = primaryKeyPlayerCategory(categories);
  if (!primary) return [];
  const label = NARRATIVE_LABEL[primary.key] ?? primary.title.toLowerCase();
  const ratingCat = categories.find((c) => c.key === "Betyg");
  const sameName = ratingCat && ratingCat.leader.name === primary.leader.name;

  const first = sameName
    ? `${primary.leader.name} kombinerar hög chansproduktion med starka matchbetyg, med ett ${primary.unit}-snitt på ${fmt(primary.leader.value)} och högst snittbetyg bland de spelare som lyfts fram i analysen — det gör honom till en spelare motståndarens försvar behöver hålla särskild koll på.`
    : `${primary.leader.name} sticker ut som ${primary.leader.subject}s ${label} i det tillgängliga underlaget, med ett ${primary.unit}-snitt på ${fmt(primary.leader.value)} per match.`;

  const clauses = [first];

  if (!sameName && ratingCat) {
    clauses.push(`${ratingCat.leader.name} har samtidigt levererat högst snittbetyg bland de spelare som lyfts fram i analysen, vilket gör ${ratingCat.leader.subject === primary.leader.subject ? "laget" : "honom"} till ett namn värt att bevaka.`);
  }

  const otherThreat = categories.find((c) => c.key !== primary.key && c.key !== "Betyg" && c.leader.subject !== primary.leader.subject);
  if (otherThreat) {
    const otherLabel = NARRATIVE_LABEL[otherThreat.key] ?? otherThreat.title.toLowerCase();
    clauses.push(`På andra sidan är ${otherThreat.leader.name} ${otherThreat.leader.subject}s ${otherLabel}, med ${fmt(otherThreat.leader.value)} ${otherThreat.unit} i snitt.`);
  }

  return clauses;
}

/** Tolkning av VAD en viss ligasnitt-jämförelse betyder — samma sorts
 * "volym, inte kvalitet"-försiktighet konsekvent, aldrig en ny slutsats om
 * matchresultatet. Bara de mått som faktiskt kan bli en comparisonHighlight
 * (se COMPARISON_STAT_LABELS i match-preview-sv.ts) behöver täckas här. */
/** Två varianter per mått — ATT LIGGA ÖVER snittet betyder inte motsatsen
 * till ATT LIGGA UNDER det (t.ex. "under snittet i hörnor" är INTE "visst
 * tryck", det är motsatsen). Bar tidigare en enda sträng som applicerades
 * oavsett riktning — gav en bakvänd tolkning för alla "under"-fall. */
const STAT_MEANING: Record<string, { over: string; under: string }> = {
  passningar: {
    over: "ett mer kontrollerat spel med mycket bollinnehav, utan att det i sig säger något om hur farligt spelet var",
    under: "ett mindre bollinnehav-orienterat spel än ett genomsnittligt lag",
  },
  "förväntade mål (xG)": {
    over: "chanser av högre kvalitet än ligasnittet",
    under: "chanser av lägre kvalitet än ligasnittet",
  },
  "skott på mål": {
    over: "en förmåga att sätta press på målvakten oftare än ett genomsnittligt lag",
    under: "färre målvaktsträffar än ett genomsnittligt lag",
  },
  hörnor: {
    over: "ett visst tryck i den sista tredjedelen",
    under: "mindre tryck i den sista tredjedelen än ett genomsnittligt lag",
  },
  nyckelpassningar: {
    over: "att laget oftare skapar situationer som kan leda till avslut, även om statistiken inte i sig säger något om kvaliteten på chanserna",
    under: "att laget mer sällan skapar direkta avslutslägen via passningar",
  },
  skott: {
    over: "en offensivt aktiv approach, utan att det säger något om avslutens kvalitet",
    under: "en mer återhållsam offensiv approach än ett genomsnittligt lag",
  },
  anfall: {
    over: "ett högre anfallstempo",
    under: "ett lägre anfallstempo än ett genomsnittligt lag",
  },
  "röda kort": {
    over: "en avvikande disciplintrend",
    under: "en stabilare disciplintrend än ligasnittet",
  },
  "andra gula kort": {
    over: "en avvikande disciplintrend",
    under: "en stabilare disciplintrend än ligasnittet",
  },
};

/** Utesluter sällantalsmått (röda kort, andra gula kort — ligasnitt ofta
 * <1) från urvalet: en procentandel räknad på ett nästan-noll-snitt kan
 * bli stor utan att vara ett verkligt mönster. */
function meaningfulComparisons(comparisons: ComparisonHighlight[]): ComparisonHighlight[] {
  const meaningful = comparisons.filter((c) => c.mean >= 1);
  return (meaningful.length > 0 ? meaningful : comparisons).sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
}

function comparisonClause(c: ComparisonHighlight): string | null {
  const absPct = Math.abs(c.deltaPct);
  if (absPct < 8) return null; // marginellt — inte värt en egen mening
  const isOver = c.deltaPct >= 0;
  const direction = isOver ? "över" : "under";
  const meaning = STAT_MEANING[c.statLabel]?.[isOver ? "over" : "under"];
  const base = `${c.subject} ligger ${magnitudeWord(absPct)} ${direction} ligasnittet i ${c.statLabel}, ${fmt(c.value)} mot ${fmt(c.mean)}.`;
  return meaning ? `${base} Det pekar på ${meaning}.` : base;
}

export function buildPreMatchNarrative(input: {
  homeName: string;
  awayName: string;
  h2h: H2HSummary | null;
  homeForm: FormRecord | null;
  awayForm: FormRecord | null;
  insight: MatchInsight | null;
  keyPlayers: KeyPlayerCategory[];
  leagueComparisons: ComparisonHighlight[];
}): string[] {
  const { homeName: home, awayName: away } = input;
  const analyses: Analysis[] = [];
  if (input.h2h) analyses.push(h2hAnalysis(input.h2h, home, away));
  const homeRecord = input.h2h ? homeRecordAnalysis(input.h2h, home) : null;
  if (homeRecord) analyses.push(homeRecord);
  const goals = input.h2h ? goalsAnalysis(input.h2h, home, away) : null;
  if (goals) analyses.push(goals);
  const form = formAnalysis(input.homeForm, input.awayForm, home, away);
  if (form) analyses.push(form);

  // Öppningsmeningen byggs EFTER analyserna ovan, av samma skäl som
  // stödjer den (inte en ny, egen gissning) — insight.favoredTeam avgör
  // VEM, de starka analyserna som pekar åt samma håll avgör VARFÖR.
  const opening: string[] = [];
  if (input.insight?.favoredTeam) {
    const favored = input.insight.favoredTeam === "home" ? home : away;
    const reasons = analyses.filter((a) => a.strong && a.favors === input.insight!.favoredTeam);
    const reasonPhrases: string[] = [];
    if (reasons.some((r) => r === form)) reasonPhrases.push("lagets starkare form");
    if (reasons.some((r) => r === homeRecord)) reasonPhrases.push("hemmafördelen");
    if (reasons.some((r) => r === goals)) reasonPhrases.push("historiskt starkare målproduktion");
    const suffix = reasonPhrases.length > 0 ? `, framför allt tack vare ${svenskLista(reasonPhrases)}` : "";
    opening.push(`Statistiken ger ${favored} ett tydligt utgångsläge inför matchen${suffix}.`);
  } else if (analyses.length > 0) {
    opening.push(`Det tillgängliga underlaget pekar inte ut någon tydlig favorit inför matchen — de olika signalerna drar åt olika håll eller är för jämna för en stark slutsats.`);
  }

  const sortedComparisons = meaningfulComparisons(input.leagueComparisons);
  const comparisonSentences = [comparisonClause(sortedComparisons[0]), sortedComparisons[1] ? comparisonClause(sortedComparisons[1]) : null].filter(
    (c): c is string => c !== null
  );

  // Sammanfattande slutsats — bygger bara på ANALYSER som redan visats
  // ovan, aldrig en ny egen bedömning. Uteblir om ingen favorit pekats ut.
  const closing: string[] = [];
  if (input.insight?.favoredTeam) {
    const favored = input.insight.favoredTeam === "home" ? home : away;
    const other = input.insight.favoredTeam === "home" ? away : home;
    const anyStrong = analyses.some((a) => a.strong && a.favors === input.insight!.favoredTeam);
    const oneSided = analyses.filter((a) => a.favors && a.favors !== input.insight!.favoredTeam).length === 0 && analyses.filter((a) => a.strong).length >= 2;
    closing.push(
      `Sammantaget pekar förhandsdatan mot ett övertag för ${favored}${anyStrong ? "" : ", men underlaget är inte starkt"}. ${
        oneSided ? `Skillnaderna mot ${other} är tillräckligt genomgående för att beskriva ${favored} som en tydlig favorit.` : `Skillnaderna är dock inte tillräckligt stora för att beskriva matchen som ensidig.`
      }`
    );
  }

  const sentences = [
    ...opening,
    ...analyses.map((a) => a.sentence),
    ...keyPlayerClauses(input.keyPlayers),
    ...comparisonSentences,
    ...closing,
  ];
  return sentences;
}

// --- Efter matchen -----------------------------------------------------

interface StatPair {
  label: string;
  home: number;
  away: number;
  suffix: string;
  isShare?: boolean;
}

function statPairs(matchStats: MatchTeamStatsComparison): StatPair[] {
  const h = matchStats.home;
  const a = matchStats.away;
  if (!h || !a) return [];
  const pairs: StatPair[] = [];
  if (h.possessionPct != null && a.possessionPct != null)
    pairs.push({ label: "bollinnehavet", home: h.possessionPct, away: a.possessionPct, suffix: "%", isShare: true });
  if (h.shotsTotal != null && a.shotsTotal != null) pairs.push({ label: "skott", home: h.shotsTotal, away: a.shotsTotal, suffix: "" });
  if (h.shotsOnTarget != null && a.shotsOnTarget != null) pairs.push({ label: "skott på mål", home: h.shotsOnTarget, away: a.shotsOnTarget, suffix: "" });
  if (h.corners != null && a.corners != null) pairs.push({ label: "hörnor", home: h.corners, away: a.corners, suffix: "" });
  if (h.expectedGoals != null && a.expectedGoals != null) pairs.push({ label: "xG", home: h.expectedGoals, away: a.expectedGoals, suffix: "" });
  return pairs;
}

interface StatRead {
  pair: StatPair;
  leader: "home" | "away" | null;
  tier: "jämn" | "liten" | "klar";
}

function readStat(pair: StatPair): StatRead {
  if (pair.home === pair.away) return { pair, leader: null, tier: "jämn" };
  const leader: "home" | "away" = pair.home > pair.away ? "home" : "away";
  const hi = Math.max(pair.home, pair.away);
  const lo = Math.max(Math.min(pair.home, pair.away), 0.01);
  const ratio = hi / lo;
  const absDiff = Math.abs(pair.home - pair.away);
  const tier = ratio >= 1.5 && absDiff >= 3 ? "klar" : ratio >= 1.15 ? "liten" : "jämn";
  return { pair, leader, tier };
}

/** Formulerar en enskild matchmåtts observation + relation i EN mening —
 * aldrig en isolerad sifferrad ("Siffrorna slutade X–Y") som en egen
 * mening; talen vävs in i observationsmeningen istället. */
function statSentence(read: StatRead, homeName: string, awayName: string): string {
  const { pair, leader, tier } = read;
  const fmtVal = (n: number) => `${fmt(n)}${pair.suffix}`;
  if (pair.isShare) {
    if (leader === null) return `${homeName} och ${awayName} delade bollinnehavet jämnt, ${fmtVal(pair.home)}–${fmtVal(pair.away)}.`;
    const leaderName = leader === "home" ? homeName : awayName;
    const leaderVal = leader === "home" ? pair.home : pair.away;
    const otherVal = leader === "home" ? pair.away : pair.home;
    const qualifier = tier === "klar" ? "ett tydligt övertag i bollinnehavet" : "ett övertag snarare än total kontroll";
    return `${leaderName} hade ${fmtVal(leaderVal)} av bollinnehavet mot ${fmtVal(otherVal)}. Det pekar på ${qualifier}.`;
  }
  if (leader === null) return `${homeName} och ${awayName} låg jämnt i ${pair.label}, ${fmtVal(pair.home)}–${fmtVal(pair.away)}.`;
  const leaderName = leader === "home" ? homeName : awayName;
  const leaderVal = leader === "home" ? pair.home : pair.away;
  const otherVal = leader === "home" ? pair.away : pair.home;
  const verb = tier === "klar" ? "klart fler" : "något fler";
  return `${leaderName} hade ${verb} ${pair.label}, ${fmtVal(leaderVal)}–${fmtVal(otherVal)}.`;
}

/** Letar efter en INTRESSANT KONTRAST mellan två matchmått — t.ex. "mer
 * boll men färre skott", "fler skott på mål trots mindre possession". Bara
 * de mest talande, redan definierade kombinationerna prövas — ingen egen,
 * ny gissning om vad som "borde" hänga ihop, bara kända, vanliga
 * fotbollskontraster mellan mått vi faktiskt har. */
function findContrast(reads: StatRead[], homeName: string, awayName: string): string | null {
  const byLabel = new Map(reads.map((r) => [r.pair.label, r]));
  const possession = byLabel.get("bollinnehavet");
  const shotsOnTarget = byLabel.get("skott på mål");
  const shots = byLabel.get("skott");
  const corners = byLabel.get("hörnor");

  // Mer boll men färre/inte fler skott på mål än motståndaren.
  if (possession && shotsOnTarget && possession.leader && shotsOnTarget.leader && possession.leader !== shotsOnTarget.leader && possession.tier !== "jämn") {
    const possLeader = possession.leader === "home" ? homeName : awayName;
    const sotLeader = shotsOnTarget.leader === "home" ? homeName : awayName;
    return `Trots ${possLeader}s större bollinnehav hade ${sotLeader} fler skott på mål, ${fmt(Math.max(shotsOnTarget.pair.home, shotsOnTarget.pair.away))}–${fmt(
      Math.min(shotsOnTarget.pair.home, shotsOnTarget.pair.away)
    )}. Det visar att ${sotLeader} skapade farligare avslut än bollinnehavet ensamt antydde.`;
  }
  // Fler skott men inte fler skott på mål (dålig konvertering till farliga avslut).
  if (shots && shotsOnTarget && shots.leader && shots.tier !== "jämn" && shotsOnTarget.leader !== shots.leader) {
    const shotsLeader = shots.leader === "home" ? homeName : awayName;
    return `${shotsLeader} hade fler skott totalt sett, men det gav inte fler skott på mål — en signal om att kvantitet inte alltid slog igenom som kvalitet.`;
  }
  // Fler hörnor men mindre offensiv produktion (skott).
  if (corners && shots && corners.leader && shots.leader && corners.leader !== shots.leader && corners.tier !== "jämn") {
    const cornersLeader = corners.leader === "home" ? homeName : awayName;
    return `${cornersLeader} vann fler hörnor men det omsattes inte i fler skott totalt sett — hörnorna gav alltså inget tydligt genomslag i den övriga statistiken.`;
  }
  return null;
}

/** Egen öppningsmening för långanalysen, medvetet skild ordagrant från
 * recap.summary (som redan visas i den fria Snabbanalysen precis ovanför)
 * — samma sakuppgifter (favorit + resultat), men inte samma mening. */
function outcomeOpeningClause(recap: MatchRecap, homeName: string, awayName: string): string {
  if (!recap.favoredTeamName) {
    return `Ingen tydlig favorit pekades ut inför matchen, som slutade ${recap.scoreLine} (${homeName}–${awayName}).`;
  }
  if (recap.favoredTeamWon) {
    return `${recap.favoredTeamName} vann med ${recap.scoreLine}, vilket bekräftade förhandsanalysens grundläggande riktning.`;
  }
  return `${recap.favoredTeamName} var vårt statistiska favoritlag inför matchen, men matchen slutade ${recap.scoreLine} (${homeName}–${awayName}) — en avvikelse från förhandsbilden.`;
}

/** Går från resultatet till MATCHBILDEN: bekräftade den faktiska
 * spelstatistiken (inte bara slutresultatet) förhandsbilden, eller var
 * matchen jämnare/annorlunda än resultatet antyder? Återanvänder samma
 * confirmingPoints/surprisingPoints som match-recap.ts redan räknat fram
 * (se den filens dokumenterade tröskel) istället för att räkna om — de har
 * redan resultatposten borträknad korrekt. */
function pictureConfirmationClause(recap: MatchRecap, reads: StatRead[]): string | null {
  if (!recap.favoredTeamName || reads.length === 0) return null;
  const favoredLeads = recap.favoredTeamWon ? recap.confirmingPoints.length - 1 : recap.confirmingPoints.length;
  const favoredTrails = recap.favoredTeamWon === false ? recap.surprisingPoints.length - 1 : recap.surprisingPoints.length;

  if (recap.favoredTeamWon && favoredTrails === 0) {
    return `Även den övriga matchstatistiken bekräftade bilden — ${recap.favoredTeamName} vann inte bara resultatmässigt utan var också det statistiskt starkare laget under matchens gång.`;
  }
  if (recap.favoredTeamWon && favoredTrails > 0) {
    return `Matchstatistiken visar dock att matchen var jämnare än ${recap.scoreLine} antyder — resultatet bekräftade övertaget, men inte i alla delar av spelet.`;
  }
  if (!recap.favoredTeamWon && favoredLeads > 0) {
    return `Matchstatistiken pekade ändå åt ${recap.favoredTeamName}s håll i flera delar av spelet, vilket gör resultatet till en tydligare avvikelse från förhandsbilden än enbart siffrorna på pappret.`;
  }
  return null;
}

function keyPlayerOutcomeClause(categories: KeyPlayerCategory[], events: MatchEventLite[]): string | null {
  const threat = categories.find((c) => c.key === "xG" || c.key === "xGOT");
  if (!threat) return null;
  const scored = events.some((e) => e.type === "goal" && e.player === threat.leader.name);
  if (!scored) return null;
  return `Det väntade målhotet ${threat.leader.name} levererade också själv ett mål i matchen, vilket stämmer väl med förhandsanalysens bild av spelaren.`;
}

export function buildPostMatchNarrative(input: {
  recap: MatchRecap;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  matchStats: MatchTeamStatsComparison;
  keyPlayers: KeyPlayerCategory[];
  events: MatchEventLite[];
}): { sentences: string[]; deviation: string | null } {
  const pairs = statPairs(input.matchStats);
  const reads = pairs.map(readStat);
  const contrast = findContrast(reads, input.homeName, input.awayName);

  const sentences = [
    outcomeOpeningClause(input.recap, input.homeName, input.awayName),
    ...reads.map((r) => statSentence(r, input.homeName, input.awayName)),
    pictureConfirmationClause(input.recap, reads),
    keyPlayerOutcomeClause(input.keyPlayers, input.events),
  ].filter((c): c is string => c !== null);

  return { sentences, deviation: contrast };
}
