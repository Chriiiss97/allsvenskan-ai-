/**
 * Fas 21 (2026-08-23) — svenska etiketter för Sportmonks statistik-typer.
 *
 * `sportmonks_type` (1310 rader) har namnen på ENGELSKA ("Shots On Target").
 * Vi kan inte översätta 1310 typer, och ska inte heller — bara de som
 * faktiskt dyker upp i en live-match. Listan nedan är exakt de 34 typer som
 * observerades i ett riktigt `include=statistics`-svar under IFK Göteborg–
 * Elfsborg 2026-08-23, plus xG-familjen från `include=xgfixture` (samma
 * type_id-mappning som sportmonks-import-xg.ts redan verifierat). Inget är
 * gissat ur dokumentationen.
 *
 * En typ som INTE finns här faller tillbaka på Sportmonks engelska namn —
 * samma hållning som lib/i18n/sv.ts har för okända statuskoder och länder:
 * hellre källans ord än en påhittad översättning.
 */

export interface LiveStatMeta {
  label: string;
  /** Enhet som ska hängas på värdet, t.ex. "%". */
  suffix?: string;
  /**
   * Vad ett HÖGRE värde betyder. "good" = bättre för laget (skott, passningar),
   * "bad" = sämre (missade chanser, regelbrott). Styr inget färgval i sig —
   * jämförelsestaplarna är neutrala — men avgör om en rad får sorteras in
   * bland höjdpunkter.
   */
  polarity?: "good" | "bad";
  /** Antal decimaler vid visning. xG behöver två, allt annat är heltal. */
  decimals?: number;
}

export const LIVE_STAT_TYPES: Record<number, LiveStatMeta> = {
  34: { label: "Hörnor", polarity: "good" },
  41: { label: "Skott utanför mål" },
  42: { label: "Skott totalt", polarity: "good" },
  43: { label: "Anfall" },
  44: { label: "Farliga anfall", polarity: "good" },
  45: { label: "Bollinnehav", suffix: "%", polarity: "good" },
  49: { label: "Skott i straffområdet", polarity: "good" },
  50: { label: "Skott utanför straffområdet" },
  51: { label: "Offside", polarity: "bad" },
  52: { label: "Mål", polarity: "good" },
  53: { label: "Inspark" },
  55: { label: "Frisparkar" },
  // "Fouls" behålls som etikett för att matcha den post-match-statistik
  // matchsidan redan visar (MATCH_STAT_ROWS) — samma mått ska inte heta två
  // olika saker på samma sida.
  56: { label: "Fouls", polarity: "bad" },
  57: { label: "Räddningar", polarity: "good" },
  58: { label: "Blockerade skott" },
  60: { label: "Inkast" },
  62: { label: "Långa passningar" },
  78: { label: "Tacklingar", polarity: "good" },
  80: { label: "Passningar", polarity: "good" },
  81: { label: "Lyckade passningar", polarity: "good" },
  82: { label: "Passningssäkerhet", suffix: "%", polarity: "good" },
  84: { label: "Gula kort", polarity: "bad" },
  86: { label: "Skott på mål", polarity: "good" },
  88: { label: "Insläppta mål", polarity: "bad" },
  98: { label: "Inlägg" },
  99: { label: "Lyckade inlägg", polarity: "good" },
  100: { label: "Brytningar", polarity: "good" },
  106: { label: "Vunna dueller", polarity: "good" },
  108: { label: "Dribblingsförsök" },
  109: { label: "Lyckade dribblingar", polarity: "good" },
  117: { label: "Nyckelpassningar", polarity: "good" },
  124: { label: "Djupledspassningar" },
  580: { label: "Stora målchanser", polarity: "good" },
  581: { label: "Missade stora chanser", polarity: "bad" },
  1533: { label: "Inläggsprecision", suffix: "%", polarity: "good" },
  1605: { label: "Dribblingsprecision", suffix: "%", polarity: "good" },
  5304: { label: "Förväntade mål (xG)", polarity: "good", decimals: 2 },
  5305: { label: "xG på mål (xGOT)", polarity: "good", decimals: 2 },
  7943: { label: "xG utan straff", polarity: "good", decimals: 2 },
  7945: { label: "xG öppet spel", polarity: "good", decimals: 2 },
  7944: { label: "xG fasta situationer", polarity: "good", decimals: 2 },
  7942: { label: "xG hörnor", polarity: "good", decimals: 2 },
  7941: { label: "xG frisparkar", polarity: "good", decimals: 2 },
  7940: { label: "xG straffar", polarity: "good", decimals: 2 },
  9687: { label: "xG emot", polarity: "bad", decimals: 2 },
  9686: { label: "xG förhindrat", polarity: "good", decimals: 2 },
  7939: { label: "Förväntade poäng (xP)", polarity: "good", decimals: 2 },
  27264: { label: "Lyckade långa passningar", polarity: "good" },
  27265: { label: "Långpassningsprecision", suffix: "%", polarity: "good" },
};

/**
 * "Toppstatistik" — de få måtten som får synas direkt på Fakta-fliken, i den
 * här ordningen. Resten hör hemma på Statistik-fliken. Urvalet följer
 * användarens uttryckliga önskemål: hellre 8 riktigt bra värden än 25
 * halvtomma. Rader utan data döljs, så en match där Sportmonks inte ger xG
 * visar bara de övriga.
 */
export const TOP_STAT_TYPE_IDS = [45, 5304, 42, 86, 580, 34] as const;

/**
 * Ordningen på Statistik-fliken, grupperad som en läsare tänker: först vad
 * som hände framåt, sedan bollen, sedan dueller/disciplin. Typer som saknas
 * i listan visas sist i type_id-ordning, så en ny Sportmonks-typ syns direkt
 * utan kodändring istället för att tyst försvinna.
 */
export const STAT_GROUPS: { title: string; typeIds: number[] }[] = [
  { title: "Förväntade mål (xG)", typeIds: [5304, 7945, 7944, 7943, 5305, 7942, 7941, 7940, 9687, 9686, 7939] },
  { title: "Anfallsspel", typeIds: [42, 86, 41, 58, 49, 50, 580, 581, 34] },
  { title: "Bollinnehav och passningsspel", typeIds: [45, 80, 81, 82, 117, 98, 99, 1533, 62, 27264, 27265, 124] },
  { title: "Dueller och press", typeIds: [43, 44, 106, 108, 109, 1605, 78, 100, 57] },
  { title: "Disciplin", typeIds: [56, 55, 51, 84, 60, 53] },
];

/**
 * Typer som ALDRIG ska visas, även om Sportmonks skickar dem.
 *
 * 9685 "Shooting Performance": migration 20260821150000 dokumenterar den som
 * "bekräftat befolkad men INNEBÖRD OVERIFIERAD, får inte konsumeras av
 * analyskod än". Utan den här spärren hade den dykt upp under "Övrigt" på
 * Statistik-fliken som ett tal utan känd betydelse — precis det produkten
 * inte får göra.
 * 9684 "xG difference": överflödig, den är skillnaden mellan två värden vi
 * redan visar var för sig.
 */
export const HIDDEN_STAT_TYPE_IDS = new Set([9685, 9684]);

export function liveStatMeta(typeId: number, fallbackName?: string | null): LiveStatMeta {
  return LIVE_STAT_TYPES[typeId] ?? { label: fallbackName ?? `Typ ${typeId}` };
}

/** Formaterar ett statistikvärde enligt typens egna regler (decimaler, enhet). */
export function formatStatValue(value: number | null, meta: LiveStatMeta): string {
  if (value === null) return "–";
  const formatted = meta.decimals ? value.toFixed(meta.decimals).replace(".", ",") : String(Math.round(value));
  return `${formatted}${meta.suffix ?? ""}`;
}
