import type { PositionGroupKey } from "../position-group";

/**
 * ============================================================================
 * Player Intelligence Engine — empiriskt härledda parametrar (2026-08-22)
 * ============================================================================
 * INGA nya tal påhittade här. Varje konstant är kopierad rakt av från
 * research-fasen (research/player-intelligence-engine, PR #1,
 * scripts/research/player-intelligence-analyze.ts's fullständiga-datasetet-
 * körning, verifierad mot en separat läckagefri pre-cutoff-omkalibrering
 * som gav <2,4 % avvikelse — se rapporten). Om dessa någonsin justeras:
 * gör det i ett nytt backtest i scripts/research/, dokumentera varför här,
 * ändra ALDRIG bara en siffra "på känn".
 *
 * MODEL_VERSION höjs varje gång matematiken (inte bara en kalibrerad
 * konstant) ändras — se player_intelligence_history.model_version
 * (rapportens punkt P, modellversionering).
 */
export const MODEL_VERSION = "kalman-v1";

/** Percentilskalans mittpunkt (0–100) — cold-start-priorn för en spelare utan någon tidigare state. Samma "50 = ligasnitt"-tolkning som Performance-percentilen redan har. */
export const LEAGUE_PRIOR_MEAN = 50;

/**
 * Global observationsvarians (alla positioner, en hel match) — grunden för
 * priorVar (cold-start-osäkerheten innan vi ens vet positionen). Beräknad
 * från 36 773 helmatchobservationer (>=85 min), 2016–2026.
 */
const OBS_VAR_GLOBAL = 143.1;

/** Cold-start-prior-varians: 4× den globala observationsvariansen — en medveten, dokumenterad (inte tillpassad mot facit) hög-osäkerhet-startpunkt, positionsoberoende eftersom vi vid en spelares allra första observation ibland ännu inte vet exakt vilken kategori av positionsgrupp som kommer dominera. */
export const PRIOR_VARIANCE = OBS_VAR_GLOBAL * 4;

/**
 * Positionsspecifik observationsvarians — EN helmatchs "brus" i Performance-
 * måttet, per positionsgrupp. Målvakters är 6–8× utespelarnas (bara tre
 * mått: räddningsprocent/insläppta mål/clean sheet-andel, mot en liten
 * peer-pool — ofta 0/100 på clean sheet) — den centrala, empiriskt
 * verifierade anledningen till att motorn behöver EN Kalman-ekvation men
 * OLIKA brusparametrar per position, inte fyra separata motorer.
 */
export const OBS_VARIANCE_BY_GROUP: Record<PositionGroupKey, number> = {
  attacker: 78.8,
  midfielder: 67.0,
  defender: 96.3,
  goalkeeper: 580.0,
};

/**
 * Processbrus (Q) per dag mellan observationer — hur mycket osäkerheten
 * växer per dag en spelare INTE observerats (skada, säsongsuppehåll,
 * bänkad). Kalibrerat så att ett ~90-dagars uppehåll lägger till ungefär
 * EN "medel underlag"-matchs (1/5 av en fantom-match, se CUMULATIVE-
 * baslinjen i forskningen) värde av extra osäkerhet — INTE en gissning,
 * en direkt konsekvens av samma 900/450-minuters-konvention (10/5 matcher)
 * som redan etablerad i lib/football/confidence.ts.
 */
export const Q_PER_DAY_BY_GROUP: Record<PositionGroupKey, number> = {
  attacker: OBS_VARIANCE_BY_GROUP.attacker / 5 / 90,
  midfielder: OBS_VARIANCE_BY_GROUP.midfielder / 5 / 90,
  defender: OBS_VARIANCE_BY_GROUP.defender / 5 / 90,
  goalkeeper: OBS_VARIANCE_BY_GROUP.goalkeeper / 5 / 90,
};

/** OVR visas historiskt aldrig över 99 (samma cap som befintliga compute-rating.ts/goalkeeper-rating.ts) — tillämpas bara vid VISNING, aldrig på det interna Kalman-tillståndet (som får vara obegränsat internt så matematiken förblir korrekt). */
export const OVR_DISPLAY_CAP = 99;

/**
 * Anomali-tröskel (rapportens punkt O): en förändring flaggas om den är
 * större än detta antal standardavvikelser av POSITIONENS EGEN
 * observationsbrus — ren diagnostik, ändrar aldrig resultatet. 2σ är en
 * vanlig, konservativ konvention (fångar ungefär de mest extrema ~5 % av
 * ren brus-driven variation vid en normalfördelning) — inte anpassad mot
 * något specifikt fall.
 */
export const ANOMALY_SIGMA_THRESHOLD = 2;
