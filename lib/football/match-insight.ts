import type { MatchFact, MatchPreviewData } from "./match-preview";
import { asStreak, pickSlice, extractPlayerHighlight, type PlayerHighlight } from "./match-preview-sv";

/**
 * Fas 16b (2026-08-22) — "AI:s matchbild": EN kort, deterministisk
 * sammanfattning byggd genom att JÄMFÖRA tal som redan finns i Match
 * Preview-datan (samma `data`-fält som match-preview-sv.ts:s meningar och
 * match-h2h-summary.ts:s sammandrag). Det här är INTE ett LLM-anrop och
 * INGEN fritextgenerering — bara enkla numeriska jämförelser (vilket lags
 * kvot är störst, vilket spelarvärde är högst) insatta i handskrivna
 * mallmeningar. Kan alltså aldrig hitta på information som inte finns i
 * `data` — hittar den inget att jämföra returneras `null`, ALDRIG en tom
 * eller påhittad sammanfattning.
 */

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

interface FormRatio {
  streak: number;
  matches: number;
  ratio: number;
}

function formRatioOfType(form: MatchFact[], participant: "home" | "away", typeId: number): FormRatio | null {
  const fact = form.find((f) => f.sportmonksTypeId === typeId && f.participant === participant && pickSlice(f.naturalLanguage) === "all");
  if (!fact) return null;
  const d = asStreak(fact.data, "all");
  if (!d || d.matches === 0) return null;
  return { streak: d.streak, matches: d.matches, ratio: d.streak / d.matches };
}

/** Lagets EGNA form, senaste matcherna (oavsett hemma/borta), för BÅDA lagen
 * på SAMMA mått — "vunnit"-kvot (76094) om båda lagen har den, annars
 * "obesegrat"-kvot (76097) för båda. ALDRIG en blandning (t.ex. ett lags
 * vinstkvot mot ett annat lags obesegrat-kvot) — obesegrat-kvoten är alltid
 * ≥ vinstkvoten (oavgjort räknas med), så en blandad jämförelse skulle
 * kunna ge en falsk "starkare form"-slutsats bara för att typerna skiljer
 * sig åt, inte för att formen faktiskt gör det. */
function overallFormRatios(form: MatchFact[]): { home: FormRatio; away: FormRatio } | null {
  for (const typeId of [76094, 76097]) {
    const home = formRatioOfType(form, "home", typeId);
    const away = formRatioOfType(form, "away", typeId);
    if (home && away) return { home, away };
  }
  return null;
}

/** Samma sviter, men bara den hemmalags-kvalificerade varianten ("...senaste
 * matcher (hemma)") — läses av precis som playerkortens/sektionernas egna
 * render-logik (pickSlice), inte en ny gissning. */
function homeQualifiedFormRatio(form: MatchFact[]): FormRatio | null {
  const fact = form.find(
    (f) => (f.sportmonksTypeId === 76094 || f.sportmonksTypeId === 76097) && f.participant === "home" && pickSlice(f.naturalLanguage) === "home"
  );
  if (!fact) return null;
  const d = asStreak(fact.data, "home");
  if (!d || d.matches === 0) return null;
  return { streak: d.streak, matches: d.matches, ratio: d.streak / d.matches };
}

/** Högsta xG-värdet över båda lagens spelare — ENDAST xG (76114), aldrig
 * blandat med xGOT (76101): de är olika mått på olika skalor (xG = förväntade
 * mål per match, xGOT = kvalitet på avslut som når mål), att jämföra deras
 * RÅA tal mot varandra för att hitta "störst" skulle vara att jämföra äpplen
 * mot päron, inte en riktig jämförelse. Faller tillbaka till xGOT bara om
 * INGEN xG-uppgift finns alls för matchen (rating uteslutet helt — "målhot"
 * ska bara byggas på faktiska målchans-mått). */
function topAttackingThreat(players: MatchFact[], home: string, away: string): PlayerHighlight | null {
  for (const preferredTypeId of [76114, 76101]) {
    let best: PlayerHighlight | null = null;
    for (const f of players) {
      if (f.sportmonksTypeId !== preferredTypeId) continue;
      const h = extractPlayerHighlight(f, home, away);
      if (h && (!best || h.value > best.value)) best = h;
    }
    if (best) return best;
  }
  return null;
}

export interface MatchInsight {
  headline: string;
  bullets: string[];
  /** Vilket lag den samlade lagklausulen (hemmaövertag/formjämförelse)
   * pekade ut som starkare inför matchen — `null` om ingen tydlig lutning
   * fanns (t.ex. jämn form, ingen hemmaövertag-signal). Används av
   * match-recap.ts för att jämföra förhandsanalysen mot facit — ALDRIG
   * härlett från spelar-klausulen (den säger bara vem som är störst
   * målhot, inte vilket lag som väntades vinna). */
  favoredTeam: "home" | "away" | null;
  /** Bara de lagnivå-skälen (hemmaövertag/form) — inte spelarraden — för
   * match-recap.ts:s "det vi trodde"-sektion. */
  teamReasons: string[];
}

export function buildMatchInsight(preview: MatchPreviewData, home: string, away: string): MatchInsight | null {
  const sentences: string[] = [];
  const bullets: string[] = [];
  const teamReasons: string[] = [];
  let favoredTeam: "home" | "away" | null = null;

  const homeAtHome = homeQualifiedFormRatio(preview.form);
  const overall = overallFormRatios(preview.form);
  const homeOverall = overall?.home ?? null;
  const awayOverall = overall?.away ?? null;

  // Tröskel 0.6 (≥60 %) för "tydligt hemmaövertag" — samma slags gräns som
  // redan används för "hög confidence" på andra håll i projektet, inte ny
  // uppfunnen här. 0.15 (15 procentenheters skillnad) för "märkbart bättre
  // form" — tillräckligt stort för att inte vara brus på en handfull matcher.
  // Klausulerna är OBEROENDE (olika frågor: "är hemmalaget starkt hemma?"
  // vs. "vilket lag är i bäst form totalt sett?") — visas båda om båda
  // stämmer (bundna med "medan", som två sidor av samma bild), annars bara
  // den som faktiskt har underlag.
  const homeAdvClause = homeAtHome && homeAtHome.ratio >= 0.6 ? `${home} har ett tydligt hemmaövertag` : null;
  if (homeAdvClause) {
    teamReasons.push(`${home} hemma: ${homeAtHome!.streak} av ${homeAtHome!.matches} senaste`);
    bullets.push(`${home} hemma: ${homeAtHome!.streak} av ${homeAtHome!.matches} senaste`);
    favoredTeam = "home";
  }

  let formClause: string | null = null;
  if (homeOverall && awayOverall && Math.abs(homeOverall.ratio - awayOverall.ratio) >= 0.15) {
    const homeBetter = homeOverall.ratio > awayOverall.ratio;
    // Hoppar bara över formklausulen om den skulle upprepa EXAKT samma lag
    // och poäng som hemmaövertag-klausulen redan gav — annars är de två
    // olika, båda värda att nämna.
    if (!(homeAdvClause && homeBetter)) {
      const better = homeBetter ? home : away;
      const bf = homeBetter ? homeOverall : awayOverall;
      formClause = `${better} kommer in med starkare form`;
      teamReasons.push(`${better}: ${bf.streak} av ${bf.matches} senaste`);
      bullets.push(`${better}: ${bf.streak} av ${bf.matches} senaste`);
      // Om hemmaövertag redan pekade på ETT lag och formen pekar på det
      // ANDRA laget är bilden delad — ingen tydlig samlad favorit, hellre
      // ärligt `null` än att godtyckligt välja den ena signalen.
      const formFavors = homeBetter ? "home" : "away";
      favoredTeam = favoredTeam === null ? formFavors : favoredTeam === formFavors ? favoredTeam : null;
    }
  }

  if (formClause && homeAdvClause) {
    sentences.push(`${formClause}, medan ${homeAdvClause.charAt(0).toLowerCase()}${homeAdvClause.slice(1)}`);
  } else if (formClause) {
    sentences.push(formClause);
  } else if (homeAdvClause) {
    sentences.push(homeAdvClause);
  }

  const topPlayer = topAttackingThreat(preview.players, home, away);
  if (topPlayer) {
    const lead = sentences.length > 0 ? "samtidigt " : "";
    sentences.push(`${topPlayer.name} sticker ${lead}ut som ${topPlayer.subject}s största målhot (${topPlayer.statLabel} ${fmt(topPlayer.value)} i snitt)`);
    bullets.push(`${topPlayer.name}: ${fmt(topPlayer.value)} ${topPlayer.statLabel} i snitt`);
  }

  if (sentences.length === 0) return null;

  // Högst en lagklausul (hemmaövertag ELLER formjämförelse, aldrig båda —
  // if/else if ovan) plus en valfri spelarklausul ("samtidigt ut...") — två
  // separata meningar, aldrig kommaklistrade.
  const headline = sentences.map(capitalize).join(". ") + ".";

  return { headline, bullets, favoredTeam, teamReasons };
}
