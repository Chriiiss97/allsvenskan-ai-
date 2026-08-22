import type { MatchFact } from "./match-preview";

/**
 * Fas 16 (2026-08-22) — deterministisk svensk omformulering av ett urval
 * Sportmonks Match Preview-fakta. Se match-preview.ts:s filhuvud för VARFÖR
 * `natural_language` annars visas på engelska rakt av: en fri översättning
 * av en statistikmening är en verklig felkälla (fel tecken, fel
 * jämförelseriktning) — "gissa aldrig"-principen tillät den inte.
 *
 * Den här filen tar en ANNAN, säkrare väg: den översätter ALDRIG fritext.
 * Varje täckt sportmonks_type_id har en HÅRDKODAD svensk mall vars enda
 * variabler är TALEN som redan finns strukturerat i `data`-kolumnen (SAMMA
 * tal `natural_language` byggdes av på Sportmonks sida) — aldrig omräknade,
 * aldrig gissade. Vissa fakta-familjer saknar ett "senaste N matcher"-tal i
 * `data` (Sportmonks kodar fönstret i VILKET sportmonks_type_id det är, inte
 * i nyttolasten) — då extraheras N mekaniskt ur den redan verifierade
 * engelska meningen med en regex, inte gissat: samma tal Sportmonks redan
 * skrev, bara flyttat till en svensk meningsstruktur.
 *
 * TÄCKNING ÄR MEDVETET BEGRÄNSAD. En körning mot skarp data (2026-08-22)
 * visade 131 distinkta sportmonks_type_id. Den här filen täcker de ~40
 * vanligaste och strukturellt enklaste (vinst/förlust/oavgjort/nollor,
 * mål/hörnor/kort/skott per match, först-till-mål, enkla sviter,
 * ligasnittjämförelser, spelar-toppnoteringar, saknad spelare, m.fl.) —
 * de täcker i praktiken nästan alla de MEST FREKVENTA faktatyperna. Ett
 * otäckt sportmonks_type_id (t.ex. tröskelsviter med flera under/över-nivåer
 * i samma nyttolast, där det INTE går att se säkert vilken nivå den
 * engelska meningen syftar på, eller tränar-h2h/spelarövergångar) ger
 * `null` här — anroparen (matchsidan) faller då tillbaka till den engelska
 * originalmeningen precis som innan, ALDRIG en gissad svensk mening.
 */

function extractWindowFromEnglish(nl: string): number | null {
  const m = nl.match(/\blast (\d+)\b/i) ?? nl.match(/\b(\d+) most recent\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Sportmonks lägger ibland en hemma/borta-kvalificering på SJÄLVA fönstret
 * ("45 most recent AWAY matches", "while playing at home") — inte bara som
 * en sekundär parentes. Läser av det ur den redan verifierade engelska
 * meningen, väljer sedan `data.away`/`data.home` istället för `data.all`. */
export function pickSlice(nl: string): "all" | "home" | "away" {
  if (/\bmost recent away\b/i.test(nl) || /\bplaying away\b/i.test(nl)) return "away";
  if (/\bmost recent home\b/i.test(nl) || /\bplaying at home\b/i.test(nl)) return "home";
  return "all";
}

function fmtNum(n: number, maxDecimals = 2): string {
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(n * factor) / factor;
  return rounded.toString().replace(".", ",");
}

function fmtPct(n: number): string {
  return `${Math.round(n)} %`;
}

export function subjectName(participant: MatchFact["participant"] | "both", home: string, away: string): string | null {
  if (participant === "home") return home;
  if (participant === "away") return away;
  return null;
}

export function opponentName(participant: MatchFact["participant"] | "both", home: string, away: string): string | null {
  if (participant === "home") return away;
  if (participant === "away") return home;
  return null;
}

// --- Datautvinnare: läser bara redan strukturerade tal, aldrig omräknade ---

export function asCountPct(d: unknown): { count: number; percentage: number; home: number | null; away: number | null } | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const src = (o.all as Record<string, unknown> | undefined) ?? o;
  if (typeof src.count !== "number" || typeof src.percentage !== "number") return null;
  const home = o.home as Record<string, unknown> | undefined;
  const away = o.away as Record<string, unknown> | undefined;
  return {
    count: src.count,
    percentage: src.percentage,
    home: typeof home?.count === "number" ? home.count : null,
    away: typeof away?.count === "number" ? away.count : null,
  };
}

export function asStreak(d: unknown, slice: "all" | "home" | "away"): { streak: number; matches: number } | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const src = (o[slice] as Record<string, unknown> | undefined) ?? (o.all as Record<string, unknown> | undefined) ?? o;
  if (typeof src.streak !== "number" || typeof src.matches !== "number") return null;
  return { streak: src.streak, matches: src.matches };
}

export function asAvg(d: unknown): { average: number } | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const src = (o.all as Record<string, unknown> | undefined) ?? o;
  if (typeof src.average !== "number") return null;
  return { average: src.average };
}

function asPlayerTop(d: unknown): { value: number; name: string } | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const player = o.related_player as Record<string, unknown> | undefined;
  if (typeof o.value !== "number" || typeof player?.display_name !== "string") return null;
  return { value: o.value, name: player.display_name };
}

/** typeId → kort etikett för spelar-toppnoteringar (76101/76114/81173), delad
 * med playerTopFact-mallen ovan och MatchKeyPlayers via match-key-players.ts. */
export const PLAYER_STAT_LABELS: Record<number, string> = {
  76101: "xGOT",
  76114: "xG",
  81173: "Betyg",
};

export interface PlayerHighlight {
  key: string;
  name: string;
  value: number;
  statLabel: string;
  subject: string; // laget spelaren tillhör
  isH2H: boolean;
}

/** Strukturerad variant av playerTopFact — samma verifierade fält, men som
 * data istället för en färdig mening, för match-key-players.ts:s kategorisering. */
export function extractPlayerHighlight(fact: MatchFact, home: string, away: string): PlayerHighlight | null {
  const statLabel = PLAYER_STAT_LABELS[fact.sportmonksTypeId];
  if (!statLabel) return null;
  const d = asPlayerTop(fact.data);
  const subject = subjectName(fact.participant, home, away);
  if (!d || !subject) return null;
  return { key: `${fact.sportmonksTypeId}-${fact.participant}-${fact.basis}`, name: d.name, value: d.value, statLabel, subject, isH2H: fact.basis === "h2h" };
}

function asComparison(d: unknown): { value: number; mean: number } | null {
  if (!d || typeof d !== "object") return null;
  const all = (d as Record<string, unknown>).all as Record<string, unknown> | undefined;
  const values = all?.values as Record<string, unknown> | undefined;
  const historic = all?.historic as Record<string, unknown> | undefined;
  if (typeof values?.value !== "number" || typeof historic?.mean !== "number") return null;
  return { value: values.value, mean: historic.mean };
}

/** typeId → kort etikett för ligasnittjämförelser (category="statistic_comparisons"),
 * delad mellan comparisonFact-mallen nedan och MatchLeagueComparisons (bar-vy). */
export const COMPARISON_STAT_LABELS: Record<number, string> = {
  109568: "passningar",
  109572: "förväntade mål (xG)",
  109574: "skott på mål",
  109586: "röda kort",
  109593: "andra gula kort",
  109596: "nyckelpassningar",
  109600: "hörnor",
  109604: "anfall",
  109606: "skott",
};

export interface ComparisonHighlight {
  key: string;
  subject: string;
  statLabel: string;
  value: number;
  mean: number;
  deltaPct: number; // (value - mean) / mean * 100, kan vara negativt
}

/** Strukturerad variant av comparisonFact — samma verifierade fält
 * (value/mean), men som data för MatchLeagueComparisons stapel-vy. */
export function extractComparisonHighlight(fact: MatchFact, home: string, away: string): ComparisonHighlight | null {
  const statLabel = COMPARISON_STAT_LABELS[fact.sportmonksTypeId];
  if (!statLabel) return null;
  const d = asComparison(fact.data);
  const subject = subjectName(fact.participant, home, away);
  if (!d || !subject || d.mean === 0) return null;
  return {
    key: `${fact.sportmonksTypeId}-${fact.participant}`,
    subject,
    statLabel,
    value: d.value,
    mean: d.mean,
    deltaPct: ((d.value - d.mean) / d.mean) * 100,
  };
}

// --- Mallfabriker: EN funktion per fakta-FAMILJ, återanvänd över flera
//     sportmonks_type_id (samma form, bara olika verb/enhet/fönster) ---

type Renderer = (f: MatchFact, home: string, away: string) => string | null;

function countPercentFact(verb: string): Renderer {
  return (f, home, away) => {
    const d = asCountPct(f.data);
    const subject = subjectName(f.participant, home, away);
    if (!d || !subject) return null;
    const window = extractWindowFromEnglish(f.naturalLanguage);
    const pct = fmtPct(d.percentage);
    if (f.basis === "h2h") {
      const opponent = opponentName(f.participant, home, away);
      const scope = window != null ? `de ${window} senaste mötena` : "mötena i Allsvenskan";
      return `${subject} har ${verb} ${d.count} av ${scope} mot ${opponent} (${pct}).`;
    }
    const scope = window != null ? `sina ${window} senaste matcher` : "sina matcher i Allsvenskan";
    return `${subject} har ${verb} ${d.count} av ${scope} (${pct}).`;
  };
}

function streakFact(verb: string): Renderer {
  return (f, home, away) => {
    const slice = pickSlice(f.naturalLanguage);
    const d = asStreak(f.data, slice);
    const subject = subjectName(f.participant, home, away);
    if (!d || !subject) return null;
    const suffix = slice === "home" ? " (hemma)" : slice === "away" ? " (borta)" : "";
    if (f.basis === "h2h") {
      const opponent = opponentName(f.participant, home, away);
      return `${subject} har ${verb} ${d.streak} av de ${d.matches} senaste mötena mot ${opponent}${suffix}.`;
    }
    return `${subject} har ${verb} ${d.streak} av sina ${d.matches} senaste matcher${suffix}.`;
  };
}

function perMatchAvgFact(verb: string, unit: string): Renderer {
  return (f, home, away) => {
    const d = asAvg(f.data);
    const subject = subjectName(f.participant, home, away);
    if (!d || !subject) return null;
    const window = extractWindowFromEnglish(f.naturalLanguage);
    const avg = fmtNum(d.average, 2);
    if (f.basis === "h2h") {
      const opponent = opponentName(f.participant, home, away);
      const scope = window != null ? ` i de ${window} senaste mötena` : "";
      return `${subject} ${verb} i snitt ${avg} ${unit} per match mot ${opponent}${scope}.`;
    }
    const scope = window != null ? ` i sina ${window} senaste matcher` : "";
    return `${subject} ${verb} i snitt ${avg} ${unit} per match${scope}.`;
  };
}

function playerTopFact(statLabel: string): Renderer {
  return (f, home, away) => {
    const d = asPlayerTop(f.data);
    const subject = subjectName(f.participant, home, away);
    if (!d || !subject) return null;
    const window = extractWindowFromEnglish(f.naturalLanguage);
    const val = fmtNum(d.value, 2);
    if (f.basis === "h2h") {
      const opponent = opponentName(f.participant, home, away);
      return `${d.name} har högst snitt-${statLabel} i ${subject}s trupp mot ${opponent} (${val}).`;
    }
    const scope = window != null ? `${window} senaste matcher` : "senaste matcher";
    return `${d.name} har högst snitt-${statLabel} i ${subject}s ${scope} (${val}).`;
  };
}

function comparisonFact(statLabel: string): Renderer {
  return (f, home, away) => {
    const d = asComparison(f.data);
    const subject = subjectName(f.participant, home, away);
    if (!d || !subject) return null;
    const value = fmtNum(d.value, 1);
    const mean = fmtNum(d.mean, 1);
    const more = d.value > d.mean;
    return `${subject} har i snitt ${value} ${statLabel} per match — ${more ? "fler" : "färre"} än Allsvenskans snitt (${mean}).`;
  };
}

const bothTeamsScoredFact: Renderer = (f, home, away) => {
  const d = asCountPct(f.data);
  if (!d || f.basis !== "h2h") return null;
  const window = extractWindowFromEnglish(f.naturalLanguage);
  const scope = window != null ? `de ${window} senaste mötena` : "mötena i Allsvenskan";
  return `Båda lagen har gjort mål i ${d.count} av ${scope} mellan ${home} och ${away} (${fmtPct(d.percentage)}).`;
};

const bothTeamsScoredStreakFact: Renderer = (f, home, away) => {
  const d = asStreak(f.data, "all");
  if (!d || f.basis !== "h2h") return null;
  return `Båda lagen har gjort mål i ${d.streak} av de ${d.matches} senaste mötena mellan ${home} och ${away}.`;
};

const winningMarginFact: Renderer = (f, home, away) => {
  const d = asAvg(f.data);
  if (!d || f.basis !== "h2h") return null;
  const window = extractWindowFromEnglish(f.naturalLanguage);
  const scope = window != null ? `de ${window} senaste mötena` : "mötena i Allsvenskan";
  return `Vinstmarginalen har i snitt varit ${fmtNum(d.average, 2)} mål i ${scope} mellan ${home} och ${away}.`;
};

const missingPlayerFact: Renderer = (f, home, away) => {
  const d = f.data as Record<string, unknown> | null;
  const subject = subjectName(f.participant, home, away);
  if (!d || !Array.isArray(d.players) || !subject) return null;
  const names = (d.players as Array<{ display_name?: string }>).map((p) => p.display_name).filter((n): n is string => !!n);
  if (names.length === 0) return null;
  return `${names.join(", ")} saknas i ${subject}s trupp (skadad eller avstängd).`;
};

function formatSwedishDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const lastMatchDateFact: Renderer = (f, home, away) => {
  const d = f.data as Record<string, unknown> | null;
  const subject = subjectName(f.participant, home, away);
  if (!d || typeof d.date !== "string" || !subject) return null;
  return `${subject}s senaste match i Allsvenskan spelades ${formatSwedishDate(d.date)}.`;
};

const timeSinceMatchFact: Renderer = (f, home, away) => {
  const d = f.data as Record<string, unknown> | null;
  const subject = subjectName(f.participant, home, away);
  if (!d || typeof d.time_since_match !== "string" || !subject) return null;
  const sv = d.time_since_match
    .replace(/\bdays\b/gi, "dagar")
    .replace(/\bday\b/gi, "dag")
    .replace(/\bhours\b/gi, "timmar")
    .replace(/\bhour\b/gi, "timme")
    .replace(/\bminutes\b/gi, "minuter")
    .replace(/\bminute\b/gi, "minut")
    .replace(/\band\b/gi, "och");
  return `Det har gått ${sv} sedan ${subject} senast spelade en Allsvenskan-match.`;
};

const minuteIntervalFact: Renderer = (f, home, away) => {
  const d = f.data as Record<string, unknown> | null;
  const subject = subjectName(f.participant, home, away);
  if (!d || !subject) return null;
  const entries = Object.entries(d).filter((e): e is [string, number] => /^\d+-\d+$/.test(e[0]) && typeof e[1] === "number");
  if (entries.length === 0) return null;
  const max = Math.max(...entries.map(([, v]) => v));
  const topBins = entries.filter(([, v]) => v === max).map(([k]) => k.replace("-", "–"));
  const window = extractWindowFromEnglish(f.naturalLanguage);
  const scope = window != null ? ` i de ${window} senaste matcherna` : "";
  const opponent = f.basis === "h2h" ? opponentName(f.participant, home, away) : null;
  const vs = opponent ? ` mot ${opponent}` : "";
  return `${subject} gör oftast mål mellan minut ${topBins.join(" och ")}${vs}${scope}.`;
};

/** sportmonks_type_id → renderer. Se filhuvudet: bara typer där formen är
 * verifierad mot skarp data (2026-08-22, fixture 3455 Häcken–Halmstad +
 * en heltäckande frekvensgenomgång av alla 131 typer). */
const RENDERERS: Record<number, Renderer> = {
  76088: countPercentFact("vunnit"),
  76089: countPercentFact("förlorat"),
  76090: countPercentFact("hållit nollan i"),
  76105: countPercentFact("spelat oavgjort i"),
  76092: countPercentFact("gjort första målet i"),
  87860: countPercentFact("vunnit"),
  87861: countPercentFact("spelat oavgjort i"),
  87862: countPercentFact("förlorat"),
  87863: countPercentFact("hållit nollan i"),
  87872: countPercentFact("gjort första målet i"),

  76095: streakFact("förlorat"),
  76097: streakFact("varit obesegrat i"),
  76098: streakFact("inte vunnit"),
  76100: streakFact("inte gjort första målet i"),
  76094: streakFact("vunnit"),
  76096: streakFact("spelat oavgjort i"),
  76099: streakFact("gjort första målet i"),
  81171: streakFact("inte gjort ett tidigt mål i"),
  81172: streakFact("inte gjort ett sent mål i"),

  76091: perMatchAvgFact("släpper in", "mål"),
  76106: perMatchAvgFact("gör", "mål"),
  76107: perMatchAvgFact("tar", "hörnor"),
  76109: perMatchAvgFact("får", "gula kort"),
  87864: perMatchAvgFact("gör", "mål"),
  87865: perMatchAvgFact("släpper in", "mål"),
  87866: perMatchAvgFact("tar", "hörnor"),
  87868: perMatchAvgFact("får", "gula kort"),
  87870: perMatchAvgFact("skjuter", "skott"),
  87871: perMatchAvgFact("skjuter", "skott på mål"),
  110624: perMatchAvgFact("skjuter", "skott på mål"),
  110625: perMatchAvgFact("skjuter", "skott"),

  76101: playerTopFact("xGOT"),
  76114: playerTopFact("xG"),
  81173: playerTopFact("betyg"),

  76111: bothTeamsScoredFact,
  87913: bothTeamsScoredFact,
  81175: bothTeamsScoredStreakFact,
  76112: winningMarginFact,
  87914: winningMarginFact,

  81170: missingPlayerFact,
  76104: lastMatchDateFact,
  81174: timeSinceMatchFact,
  76102: minuteIntervalFact,
  87928: minuteIntervalFact,

  109568: comparisonFact(COMPARISON_STAT_LABELS[109568]),
  109572: comparisonFact(COMPARISON_STAT_LABELS[109572]),
  109574: comparisonFact(COMPARISON_STAT_LABELS[109574]),
  109586: comparisonFact(COMPARISON_STAT_LABELS[109586]),
  109593: comparisonFact(COMPARISON_STAT_LABELS[109593]),
  109596: comparisonFact(COMPARISON_STAT_LABELS[109596]),
  109600: comparisonFact(COMPARISON_STAT_LABELS[109600]),
  109604: comparisonFact(COMPARISON_STAT_LABELS[109604]),
  109606: comparisonFact(COMPARISON_STAT_LABELS[109606]),
};

/** Returnerar en säker svensk mening, eller null om typen inte är täckt —
 * anroparen faller då tillbaka till `naturalLanguage` (engelska originalet). */
export function translateMatchFact(fact: MatchFact, homeTeamName: string, awayTeamName: string): string | null {
  const renderer = RENDERERS[fact.sportmonksTypeId];
  if (!renderer) return null;
  try {
    return renderer(fact, homeTeamName, awayTeamName);
  } catch {
    return null;
  }
}
