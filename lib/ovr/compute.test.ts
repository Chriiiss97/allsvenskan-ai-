/**
 * Enhetstester för OVR v2:s rena beräkningslager.
 *
 * Körs med `npm run test:ovr` (tsx --test). Ingen databas, ingen nätverk —
 * hela poängen med att compute.ts/metrics.ts/position.ts är rena.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ageAdjustment,
  anchorToOvr,
  buildPrior,
  blendObservedPercentile,
  buildCompositeReference,
  buildReferenceDistributions,
  computeRatings,
  preparePlayer,
  rankAgainstReference,
  compositeScore,
  computeConfidence,
  leagueAdjustPercentile,
  metricPercentile,
  normalCdf,
  normalQuantile,
  orientValue,
  ovrToPercentile,
  percentileOf,
  priorShare,
  rankComposites,
  shrinkToPrior,
  type HistorySeason,
  type PlayerSeasonInput,
} from "./compute";
import { OVR_CAP, OVR_FLOOR, SCALE_ANCHORS, STABILISATION, type MetricKey, type PositionGroup } from "./config";
import { accumulateTotals, toMetricValues, type PlayerMatchRow } from "./metrics";
import { assignPosition, classifyLineup, classifyStart, type LineupAppearance } from "./position";

// =============================================================================
// Ankarmappningen
// =============================================================================

describe("anchorToOvr — ankarmappningen", () => {
  it("träffar varje ankarpunkt exakt", () => {
    for (const anchor of SCALE_ANCHORS) {
      assert.equal(anchorToOvr(anchor.percentile), anchor.ovr, `p${anchor.percentile} ska ge ${anchor.ovr}`);
    }
  });

  it("ger den avsedda känslan: medianspelaren 68, toppspelaren i 80-talet", () => {
    assert.equal(anchorToOvr(50), 68);
    assert.equal(anchorToOvr(90), 79);
    assert.equal(anchorToOvr(97), 84);
  });

  it("interpolerar linjärt mellan ankarpunkter", () => {
    // Mitt emellan p50 (68) och p75 (74) ligger p62,5 -> 71.
    assert.equal(anchorToOvr(62.5), 71);
    // Mitt emellan p10 (60) och p25 (64) ligger p17,5 -> 62.
    assert.equal(anchorToOvr(17.5), 62);
  });

  it("är monoton över hela spannet", () => {
    let previous = -Infinity;
    for (let p = 0; p <= 100; p += 0.25) {
      const ovr = anchorToOvr(p);
      assert.ok(ovr >= previous, `mappningen backade vid p${p}: ${ovr} < ${previous}`);
      previous = ovr;
    }
  });

  it("respekterar golv och tak", () => {
    assert.equal(anchorToOvr(0), OVR_FLOOR);
    assert.equal(anchorToOvr(100), OVR_CAP);
    assert.equal(anchorToOvr(-50), OVR_FLOOR);
    assert.equal(anchorToOvr(150), OVR_CAP);
  });

  it("ovrToPercentile är inversen av anchorToOvr", () => {
    for (let p = 0.5; p < 100; p += 0.5) {
      const roundTrip = ovrToPercentile(anchorToOvr(p));
      assert.ok(Math.abs(roundTrip - p) < 0.6, `p${p} -> OVR -> p${roundTrip.toFixed(2)} avviker för mycket`);
    }
  });

  it("den realistiska toppen i en grupp om 60 landar strax under 88", () => {
    // Med mittrang kan den bäste av 60 som mest nå (60 - 0,5) / 60 = 99,17 %.
    const bestOf60 = ((60 - 0.5) / 60) * 100;
    const ovr = anchorToOvr(bestOf60);
    assert.ok(ovr > 86 && ovr < 88, `bäste av 60 fick ${ovr}, förväntat 86–88`);
  });
});

// =============================================================================
// Shrinkage
// =============================================================================

describe("shrinkToPrior — bayesiansk shrinkage", () => {
  it("följer formeln (observerat * n + prior * k) / (n + k)", () => {
    assert.equal(shrinkToPrior(90, 50, 10, 10), 70);
    assert.equal(shrinkToPrior(80, 40, 30, 10), 70);
    assert.equal(shrinkToPrior(100, 0, 5, 15), 25);
  });

  it("drar hårt mot prior när underlaget är litet", () => {
    // Boudri-fallet: 4 matcher (n = 4) på ett mått med k = 15.
    const result = shrinkToPrior(95, 60, 4, STABILISATION.shooting);
    assert.ok(result !== null);
    // 4/19 av vikten på det observerade -> nära prior, inte nära 95.
    assert.ok(Math.abs((result as number) - 67.4) < 0.1, `fick ${result}`);
  });

  it("närmar sig det observerade när underlaget växer", () => {
    const many = shrinkToPrior(95, 60, 200, STABILISATION.shooting);
    assert.ok((many as number) > 92, `fick ${many}, förväntat nära 95`);
  });

  it("returnerar det observerade när prior saknas", () => {
    assert.equal(shrinkToPrior(72, null, 5, 10), 72);
  });

  it("returnerar prior när observationen saknas", () => {
    assert.equal(shrinkToPrior(null, 64, 5, 10), 64);
  });

  it("returnerar null när ingendera finns", () => {
    assert.equal(shrinkToPrior(null, null, 5, 10), null);
  });

  it("är stabil vid n = 0 — då är betyget helt och hållet prior", () => {
    assert.equal(shrinkToPrior(80, 55, 0, 12), 55);
  });

  it("priorShare speglar shrinkagens tyngd", () => {
    assert.equal(priorShare(0, 15), 1);
    assert.equal(priorShare(15, 15), 0.5);
    assert.ok(priorShare(200, 15) < 0.08);
  });

  it("målskytte stabiliserar långsammare än passningar — därför högre k", () => {
    assert.ok(STABILISATION.shooting > STABILISATION.passing);
    const n90 = 5;
    assert.ok(priorShare(n90, STABILISATION.shooting) > priorShare(n90, STABILISATION.passing));
  });
});

// =============================================================================
// Percentiler
// =============================================================================

describe("percentileOf — percentilrang med mittrang", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("ger mittrang för den bäste i stället för 100", () => {
    assert.equal(percentileOf(values, 10), 95);
  });

  it("ger mittrang för den sämste i stället för 0", () => {
    assert.equal(percentileOf(values, 1), 5);
  });

  it("hanterar lika värden med mittrang", () => {
    // Fyra ettor: below = 0, equal = 4 -> (0 + 2) / 4 = 50.
    assert.equal(percentileOf([1, 1, 1, 1], 1), 50);
  });

  it("placerar ett värde utanför fördelningen i rätt ände", () => {
    assert.equal(percentileOf(values, 999), 100);
    assert.equal(percentileOf(values, -999), 0);
  });

  it("returnerar null för tom fördelning", () => {
    assert.equal(percentileOf([], 5), null);
  });
});

describe("orientValue — inverterade mått", () => {
  it("lämnar mått där högre är bättre orörda", () => {
    assert.equal(orientValue("goals_per90", 0.8), 0.8);
  });

  it("negerar mått där lägre är bättre", () => {
    assert.equal(orientValue("cards_per90", 0.4), -0.4);
    assert.equal(orientValue("goals_conceded_per90", 1.2), -1.2);
  });

  it("ger den som får minst kort högst percentil", () => {
    const peers = [{ positionGroup: "CB" as PositionGroup, metrics: { cards_per90: 0.1 } },
      { positionGroup: "CB" as PositionGroup, metrics: { cards_per90: 0.5 } },
      { positionGroup: "CB" as PositionGroup, metrics: { cards_per90: 0.9 } }];
    // Fyll upp till MIN_PEERS_PER_GROUP.
    const padded = [...Array(12)].map((_, i) => ({
      positionGroup: "CB" as PositionGroup,
      metrics: { cards_per90: 0.1 + i * 0.1 },
    }));
    const dist = buildReferenceDistributions([...peers, ...padded]);
    const clean = metricPercentile(dist, "CB", "cards_per90", 0.1);
    const dirty = metricPercentile(dist, "CB", "cards_per90", 1.2);
    assert.ok(clean !== null && dirty !== null);
    assert.ok((clean as number) > (dirty as number), "färre kort ska ge högre percentil");
  });
});

// =============================================================================
// Normalfördelning och ligakoefficienter
// =============================================================================

describe("normalfördelningens hjälpfunktioner", () => {
  it("normalCdf ger kända värden", () => {
    assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
    assert.ok(Math.abs(normalCdf(1.6449) - 0.95) < 1e-3);
    assert.ok(Math.abs(normalCdf(-1.6449) - 0.05) < 1e-3);
  });

  it("normalQuantile är inversen", () => {
    for (const p of [0.05, 0.25, 0.5, 0.75, 0.9, 0.99]) {
      assert.ok(Math.abs(normalCdf(normalQuantile(p)) - p) < 1e-3, `p=${p}`);
    }
  });
});

describe("leagueAdjustPercentile", () => {
  it("lämnar allsvensk statistik orörd", () => {
    assert.equal(leagueAdjustPercentile(70, 1), 70);
  });

  it("höjer en prestation från en starkare liga", () => {
    const adjusted = leagueAdjustPercentile(50, 1.55);
    assert.ok(adjusted > 70 && adjusted < 82, `Premier League p50 gav p${adjusted.toFixed(1)}`);
  });

  it("sänker en prestation från en svagare liga", () => {
    const adjusted = leagueAdjustPercentile(90, 0.7);
    assert.ok(adjusted > 68 && adjusted < 82, `Superettan p90 gav p${adjusted.toFixed(1)}`);
  });

  it("är monoton i koefficienten", () => {
    const weak = leagueAdjustPercentile(60, 0.7);
    const mid = leagueAdjustPercentile(60, 1.0);
    const strong = leagueAdjustPercentile(60, 1.5);
    assert.ok(weak < mid && mid < strong);
  });

  it("håller sig inom 0–100", () => {
    assert.ok(leagueAdjustPercentile(99.9, 1.55) <= 100);
    assert.ok(leagueAdjustPercentile(0.1, 0.45) >= 0);
  });
});

// =============================================================================
// Ålderskurvan
// =============================================================================

describe("ageAdjustment", () => {
  it("är noll under toppåldern 26–28", () => {
    assert.equal(ageAdjustment(26), 0);
    assert.equal(ageAdjustment(27), 0);
    assert.equal(ageAdjustment(28), 0);
  });

  it("lyfter unga spelare och sänker äldre", () => {
    assert.ok(ageAdjustment(19) > 0);
    assert.ok(ageAdjustment(34) < 0);
  });

  it("överskrider aldrig specens tak på ±4 OVR", () => {
    for (let age = 14; age <= 45; age++) {
      assert.ok(Math.abs(ageAdjustment(age)) <= 4, `ålder ${age} gav ${ageAdjustment(age)}`);
    }
  });

  it("är monotont avtagande med åldern", () => {
    let previous = Infinity;
    for (let age = 16; age <= 40; age += 0.5) {
      const adj = ageAdjustment(age);
      assert.ok(adj <= previous + 1e-9, `kurvan steg vid ålder ${age}`);
      previous = adj;
    }
  });

  it("hanterar okänd ålder som ingen justering", () => {
    assert.equal(ageAdjustment(null), 0);
  });
});

// =============================================================================
// Prior
// =============================================================================

describe("buildPrior", () => {
  const distributions = buildReferenceDistributions(
    [...Array(30)].map((_, i) => ({
      positionGroup: "ST" as PositionGroup,
      metrics: { goals_per90: i * 0.05 },
    }))
  );

  it("viktar senaste säsongen tyngst", () => {
    const history: HistorySeason[] = [
      { seasonYear: 2025, minutes: 2000, source: "allsvenskan", leagueCoefficient: 1, percentiles: { goals_per90: 90 } },
      { seasonYear: 2024, minutes: 2000, source: "allsvenskan", leagueCoefficient: 1, percentiles: { goals_per90: 30 } },
    ];
    const prior = buildPrior(history, 2026, distributions, "ST");
    const value = prior.percentiles.goals_per90 as number;
    // Vikter 1,0 och 0,55 -> (90 + 0,55 * 30) / 1,55 = 68,7.
    assert.ok(Math.abs(value - 68.7) < 0.2, `fick ${value}`);
  });

  it("ignorerar säsonger äldre än fyra år tillbaka", () => {
    const history: HistorySeason[] = [
      { seasonYear: 2018, minutes: 3000, source: "allsvenskan", leagueCoefficient: 1, percentiles: { goals_per90: 99 } },
    ];
    const prior = buildPrior(history, 2026, distributions, "ST");
    assert.equal(prior.percentiles.goals_per90, undefined);
  });

  it("skalar ned en säsong med få minuter", () => {
    const many: HistorySeason[] = [
      { seasonYear: 2025, minutes: 2000, source: "allsvenskan", leagueCoefficient: 1, percentiles: { goals_per90: 80 } },
    ];
    const few: HistorySeason[] = [
      { seasonYear: 2025, minutes: 90, source: "allsvenskan", leagueCoefficient: 1, percentiles: { goals_per90: 80 } },
    ];
    const priorMany = buildPrior(many, 2026, distributions, "ST");
    const priorFew = buildPrior(few, 2026, distributions, "ST");
    // Percentilen är densamma, men vikten bakom den är mycket lägre.
    assert.equal(priorMany.percentiles.goals_per90, priorFew.percentiles.goals_per90);
    assert.ok((priorMany.weightByMetric.goals_per90 as number) > (priorFew.weightByMetric.goals_per90 as number) * 5);
  });

  it("översätter utländsk statistik via ligakoefficienten", () => {
    const history: HistorySeason[] = [
      { seasonYear: 2025, minutes: 2000, source: "foreign", leagueCoefficient: 1.2, leagueName: "Eredivisie", rawPer90: { goals_per90: 0.5 } },
    ];
    const prior = buildPrior(history, 2026, distributions, "ST");
    const value = prior.percentiles.goals_per90;
    assert.ok(value !== undefined, "utländsk säsong ska bidra till prior");
    assert.ok((value as number) > 0 && (value as number) <= 100);
  });

  it("redovisar vad som bidrog", () => {
    const history: HistorySeason[] = [
      { seasonYear: 2025, minutes: 1800, source: "allsvenskan", leagueCoefficient: 1, leagueName: "Allsvenskan", percentiles: { goals_per90: 70 } },
      { seasonYear: 2024, minutes: 900, source: "foreign", leagueCoefficient: 0.7, leagueName: "Superettan", rawPer90: { goals_per90: 0.6 } },
    ];
    const prior = buildPrior(history, 2026, distributions, "ST");
    assert.equal(prior.contributions.length, 2);
    assert.equal(prior.contributions[0].leagueName, "Allsvenskan");
    assert.equal(prior.contributions[1].leagueName, "Superettan");
  });

  it("ger tom prior utan historik", () => {
    const prior = buildPrior([], 2026, distributions, "ST");
    assert.deepEqual(prior.percentiles, {});
    assert.equal(prior.contributions.length, 0);
  });
});

// =============================================================================
// Hopviktning och omrankning
// =============================================================================

describe("compositeScore", () => {
  it("viktar enligt vikttabellen", () => {
    const result = compositeScore({ goals_per90: 100, assists_per90: 0 }, { goals_per90: 75, assists_per90: 25 });
    assert.equal(result.score, 75);
    assert.equal(result.coverage, 1);
  });

  it("omfördelar vikten för mått utan underlag i stället för att räkna dem som noll", () => {
    const result = compositeScore({ goals_per90: 80, assists_per90: null }, { goals_per90: 50, assists_per90: 50 });
    assert.equal(result.score, 80, "det saknade måttet ska inte dra ned betyget");
    assert.equal(result.coverage, 0.5, "men täckningsgraden ska visa att halva vikten saknades");
  });

  it("returnerar null när inget mått har underlag", () => {
    const result = compositeScore({ goals_per90: null }, { goals_per90: 100 });
    assert.equal(result.score, null);
  });
});

describe("rankComposites — omrankningen som räddar spridningen", () => {
  it("förvandlar ihopklumpade kompositer till en full percentilspridning", () => {
    // Verklighetsnära: viktade medelvärden klumpar ihop sig runt mitten.
    const scores = [46, 48, 49, 50, 50, 51, 52, 54, 55, 56, 58, 60, 62, 65];
    const entries = scores.map((score, i) => ({ key: i, group: "CM" as PositionGroup, score, isPeer: true }));
    const ranked = rankComposites(entries);

    const lowest = ranked.get(0) as number;
    const highest = ranked.get(scores.length - 1) as number;
    assert.ok(lowest < 5, `lägsta blev p${lowest}`);
    assert.ok(highest > 95, `högsta blev p${highest}`);

    // Utan omrankning hade spannet 46–65 gett OVR 67,5–70,8: hela ligan inom
    // tre OVR-steg. Med omrankning täcks nästan hela skalan.
    const spreadWithout = anchorToOvr(65) - anchorToOvr(46);
    const spreadWith = anchorToOvr(highest) - anchorToOvr(lowest);
    assert.ok(spreadWith > spreadWithout * 4, `omrankningen gav bara ${spreadWith} mot ${spreadWithout}`);
  });

  it("rankar bara mot peers men betygsätter alla", () => {
    const entries = [
      ...[...Array(20)].map((_, i) => ({ key: `peer${i}`, group: "ST" as PositionGroup, score: 40 + i, isPeer: true })),
      { key: "nykomling", group: "ST" as PositionGroup, score: 50, isPeer: false },
    ];
    const ranked = rankComposites(entries);
    assert.ok((ranked.get("nykomling") as number) > 0, "en icke-peer ska ändå få en percentil");
  });

  it("låter aldrig en icke-peer skjuta förbi hela peer-poolen", () => {
    // Regressionstest: en målvakt med 90 minuter fick 91,0 (taket) eftersom
    // hans nästan rena prior-komposit hamnade utanför fördelningen.
    const entries = [
      ...[...Array(20)].map((_, i) => ({ key: `peer${i}`, group: "GK" as PositionGroup, score: 40 + i, isPeer: true })),
      { key: "tunn-underlag", group: "GK" as PositionGroup, score: 999, isPeer: false },
      { key: "usel-underlag", group: "GK" as PositionGroup, score: -999, isPeer: false },
    ];
    const ranked = rankComposites(entries);
    const bestPeer = ranked.get("peer19") as number;
    const worstPeer = ranked.get("peer0") as number;
    assert.equal(ranked.get("tunn-underlag"), bestPeer, "kan som mest matcha den bäste peeren");
    assert.equal(ranked.get("usel-underlag"), worstPeer, "kan som mest matcha den sämste peeren");
    assert.ok((ranked.get("tunn-underlag") as number) < 100, "ska aldrig nå taket");
    assert.ok(anchorToOvr(ranked.get("tunn-underlag") as number) < OVR_CAP);
  });

  it("ger null när gruppen är för liten för att betyda något", () => {
    const entries = [
      { key: "a", group: "GK" as PositionGroup, score: 50, isPeer: true },
      { key: "b", group: "GK" as PositionGroup, score: 60, isPeer: true },
    ];
    assert.equal(rankComposites(entries).get("a"), null);
  });

  it("håller grupperna åtskilda", () => {
    const entries = [
      ...[...Array(15)].map((_, i) => ({ key: `st${i}`, group: "ST" as PositionGroup, score: i, isPeer: true })),
      ...[...Array(15)].map((_, i) => ({ key: `cb${i}`, group: "CB" as PositionGroup, score: 100 + i, isPeer: true })),
    ];
    const ranked = rankComposites(entries);
    // Bästa anfallaren och bästa mittbacken ska båda nå toppen av SIN grupp,
    // trots att mittbackarnas råa kompositer är mycket högre.
    assert.equal(ranked.get("st14"), ranked.get("cb14"));
  });
});

// =============================================================================
// Confidence
// =============================================================================

describe("computeConfidence", () => {
  it("växer med speltiden", () => {
    const weights = { goals_per90: 100 } as Partial<Record<MetricKey, number>>;
    const few = computeConfidence(2, weights, 1);
    const many = computeConfidence(30, weights, 1);
    assert.ok(few < many);
    assert.ok(few < 0.4, "två matcher ska ge låg konfidens");
    assert.ok(many > 0.6);
  });

  it("straffas av dålig täckning", () => {
    const weights = { goals_per90: 100 } as Partial<Record<MetricKey, number>>;
    assert.ok(computeConfidence(30, weights, 0.5) < computeConfidence(30, weights, 1));
  });

  it("håller sig inom 0–1", () => {
    const weights = { goals_per90: 100 } as Partial<Record<MetricKey, number>>;
    assert.ok(computeConfidence(0, weights, 1) >= 0);
    assert.ok(computeConfidence(10000, weights, 1) <= 1);
  });

  it("når hög konfidens senare för anfallare än för mittbackar", () => {
    // Samma speltid, olika k: anfallarens mått stabiliserar långsammare.
    const striker = computeConfidence(15, { goals_per90: 100 }, 1);
    const centreBack = computeConfidence(15, { duels_won_pct: 100 }, 1);
    assert.ok(striker < centreBack, "vi vet mindre om anfallaren efter lika många matcher");
  });
});

// =============================================================================
// Mätvärden och källdatans egenheter
// =============================================================================

function matchRow(overrides: Partial<PlayerMatchRow> = {}): PlayerMatchRow {
  return {
    fixture_id: 1, player_id: 1, team_id: 1, minutes_played: 90, position: "M",
    goals: null, assists: null, shots_on_target: null, passes_total: null, passes_accuracy: null,
    passes_key: null, tackles_total: null, tackles_blocks: null, tackles_interceptions: null,
    duels_total: null, duels_won: null, dribbles_attempts: null, dribbles_success: null,
    fouls_drawn: null, fouls_committed: null, offsides: null, yellow_cards: null, red_cards: null,
    saves: null, goals_conceded: null, penalty_saved: null,
    ...overrides,
  };
}

describe("metrics — källdatans kända egenheter", () => {
  it("behandlar null som noll för räknefält (verifierat mot lagstatistiken)", () => {
    const totals = accumulateTotals([matchRow({ goals: 1 }), matchRow({ goals: null })], 2025);
    assert.equal(totals.goals, 1);
    assert.equal(totals.minutes, 180);
  });

  it("hoppar över matcher utan speltid", () => {
    const totals = accumulateTotals([matchRow({ minutes_played: 0 }), matchRow({ minutes_played: null })], 2025);
    assert.equal(totals.matches, 0);
    assert.equal(totals.minutes, 0);
  });

  it("tolkar passes_accuracy som ANTAL från 2021", () => {
    const totals = accumulateTotals([matchRow({ passes_total: 100, passes_accuracy: 80 })], 2025);
    const metrics = toMetricValues(totals, 2025, false);
    assert.equal(metrics.pass_pct, 0.8, "80 av 100 träffsäkra ska ge 80 %");
  });

  it("tolkar passes_accuracy som PROCENT till och med 2019", () => {
    const totals = accumulateTotals([matchRow({ passes_total: 100, passes_accuracy: 80 })], 2019);
    const metrics = toMetricValues(totals, 2019, false);
    assert.equal(metrics.pass_pct, 0.8, "fältet ÄR procenten det året");
  });

  it("vägrar tolka passes_accuracy 2020 — fältet byter betydelse mitt i säsongen", () => {
    const totals = accumulateTotals([matchRow({ passes_total: 500, passes_accuracy: 80 })], 2020);
    const metrics = toMetricValues(totals, 2020, false);
    assert.equal(metrics.pass_pct, null);
  });

  it("räknar konvertering på skott PÅ MÅL, inte på skott totalt", () => {
    const totals = accumulateTotals([matchRow({ goals: 4, shots_on_target: 10 })], 2025);
    const metrics = toMetricValues(totals, 2025, false);
    assert.equal(metrics.conversion, 0.4);
  });

  it("ger null för offsides före 2020 i stället för att belöna en datalucka", () => {
    const totals = accumulateTotals([matchRow({ offsides: null })], 2019);
    assert.equal(toMetricValues(totals, 2019, false).offsides_per90, null);
    const totals2025 = accumulateTotals([matchRow({ offsides: null })], 2025);
    assert.equal(toMetricValues(totals2025, 2025, false).offsides_per90, 0);
  });

  it("kräver en rimlig nämnare innan en kvot får räknas", () => {
    const thin = accumulateTotals([matchRow({ duels_total: 5, duels_won: 5 })], 2025);
    assert.equal(toMetricValues(thin, 2025, false).duels_won_pct, null, "5 av 5 dueller är ingen duellprocent");

    const solid = accumulateTotals(
      [...Array(10)].map(() => matchRow({ duels_total: 10, duels_won: 6 })),
      2025
    );
    assert.equal(toMetricValues(solid, 2025, false).duels_won_pct, 0.6);
  });

  it("räknar per 90 korrekt", () => {
    const totals = accumulateTotals([matchRow({ minutes_played: 45, goals: 1 })], 2025);
    assert.equal(toMetricValues(totals, 2025, false).goals_per90, 2);
  });

  it("väger rött kort dubbelt mot gult", () => {
    const totals = accumulateTotals([matchRow({ yellow_cards: 1, red_cards: 1 })], 2025);
    assert.equal(toMetricValues(totals, 2025, false).cards_per90, 3);
  });

  it("ger utespelare null på målvaktsmåtten", () => {
    const metrics = toMetricValues(accumulateTotals([matchRow()], 2025), 2025, false);
    assert.equal(metrics.save_pct, null);
    assert.equal(metrics.clean_sheet_rate, null);
  });

  it("räknar räddningsprocent och hållna nollor för målvakter", () => {
    const rows = [...Array(5)].map((_, i) =>
      matchRow({ fixture_id: i, position: "G", saves: 4, goals_conceded: i === 0 ? 0 : 1 })
    );
    const metrics = toMetricValues(accumulateTotals(rows, 2025), 2025, true);
    assert.equal(metrics.save_pct, 20 / 24);
    assert.equal(metrics.clean_sheet_rate, 1 / 5);
  });

  it("ger inte en inhoppande målvakt en hållen nolla på två minuter", () => {
    const rows = [matchRow({ position: "G", minutes_played: 2, goals_conceded: 0 })];
    assert.equal(accumulateTotals(rows, 2025).goalkeeperMatches, 0);
  });
});

// =============================================================================
// Positionsklassificering
// =============================================================================

describe("classifyStart — sex grupper ur fyra positioner plus grid", () => {
  const base = { defensiveRowWidth: 4, midfieldRows: [3] };

  it("målvakt", () => {
    assert.equal(classifyStart({ ...base, position: "G", grid: "1:1", rowWidth: 1 }), "GK");
  });

  it("fyrbackslinje ger ytterbackar i kanterna och mittbackar i mitten", () => {
    assert.equal(classifyStart({ ...base, position: "D", grid: "2:1", rowWidth: 4 }), "FB");
    assert.equal(classifyStart({ ...base, position: "D", grid: "2:2", rowWidth: 4 }), "CB");
    assert.equal(classifyStart({ ...base, position: "D", grid: "2:3", rowWidth: 4 }), "CB");
    assert.equal(classifyStart({ ...base, position: "D", grid: "2:4", rowWidth: 4 }), "FB");
  });

  it("treback ger bara mittbackar", () => {
    for (let col = 1; col <= 3; col++) {
      assert.equal(classifyStart({ ...base, position: "D", grid: `2:${col}`, rowWidth: 3 }), "CB");
    }
  });

  it("femback ger wingbacks ytterst", () => {
    assert.equal(classifyStart({ ...base, position: "D", grid: "2:1", rowWidth: 5 }), "FB");
    assert.equal(classifyStart({ ...base, position: "D", grid: "2:3", rowWidth: 5 }), "CB");
    assert.equal(classifyStart({ ...base, position: "D", grid: "2:5", rowWidth: 5 }), "FB");
  });

  it("den främre mittfältsraden i 4-2-3-1 är offensiva mittfältare", () => {
    const params = { defensiveRowWidth: 4, midfieldRows: [3, 4] };
    assert.equal(classifyStart({ ...params, position: "M", grid: "3:1", rowWidth: 2 }), "CM");
    assert.equal(classifyStart({ ...params, position: "M", grid: "4:1", rowWidth: 3 }), "AM");
    assert.equal(classifyStart({ ...params, position: "M", grid: "4:2", rowWidth: 3 }), "AM");
  });

  it("yttermittfältare i 4-4-2 blir AM, centrala blir CM", () => {
    assert.equal(classifyStart({ ...base, position: "M", grid: "3:1", rowWidth: 4 }), "AM");
    assert.equal(classifyStart({ ...base, position: "M", grid: "3:2", rowWidth: 4 }), "CM");
    assert.equal(classifyStart({ ...base, position: "M", grid: "3:4", rowWidth: 4 }), "AM");
  });

  it("de breda mittfältarna bakom en treback är wingbacks, inte ytter", () => {
    // 3-4-3: försvarsrad 3, mittfältsrad 4 -> kolumn 1 och 4 är wingbacks.
    const params = { defensiveRowWidth: 3, midfieldRows: [3] };
    assert.equal(classifyStart({ ...params, position: "M", grid: "3:1", rowWidth: 4 }), "FB");
    assert.equal(classifyStart({ ...params, position: "M", grid: "3:2", rowWidth: 4 }), "CM");
    assert.equal(classifyStart({ ...params, position: "M", grid: "3:4", rowWidth: 4 }), "FB");
  });

  it("ensam anfallare blir ST", () => {
    assert.equal(classifyStart({ ...base, position: "F", grid: "5:1", rowWidth: 1 }), "ST");
  });

  it("anfallstrio ger ytterforwards på kanterna och anfallare i mitten", () => {
    assert.equal(classifyStart({ ...base, position: "F", grid: "4:1", rowWidth: 3 }), "AM");
    assert.equal(classifyStart({ ...base, position: "F", grid: "4:2", rowWidth: 3 }), "ST");
    assert.equal(classifyStart({ ...base, position: "F", grid: "4:3", rowWidth: 3 }), "AM");
  });

  it("två anfallare är båda ST", () => {
    assert.equal(classifyStart({ ...base, position: "F", grid: "5:1", rowWidth: 2 }), "ST");
    assert.equal(classifyStart({ ...base, position: "F", grid: "5:2", rowWidth: 2 }), "ST");
  });

  it("returnerar null utan grid — en avbytare har ingen formationsposition", () => {
    assert.equal(classifyStart({ ...base, position: "M", grid: null, rowWidth: 0 }), null);
  });
});

describe("classifyLineup — hela uppställningen på en gång", () => {
  function appearance(playerId: number, position: string, grid: string): LineupAppearance {
    return { lineupId: 1, playerId, position, grid, minutes: 90, kickoffAt: "2025-05-01T00:00:00Z" };
  }

  it("klassificerar en 4-3-3 korrekt", () => {
    const lineup = [
      appearance(1, "G", "1:1"),
      appearance(2, "D", "2:1"), appearance(3, "D", "2:2"), appearance(4, "D", "2:3"), appearance(5, "D", "2:4"),
      appearance(6, "M", "3:1"), appearance(7, "M", "3:2"), appearance(8, "M", "3:3"),
      appearance(9, "F", "4:1"), appearance(10, "F", "4:2"), appearance(11, "F", "4:3"),
    ];
    const result = classifyLineup(lineup);
    assert.equal(result.get(1), "GK");
    assert.equal(result.get(2), "FB");
    assert.equal(result.get(3), "CB");
    assert.equal(result.get(4), "CB");
    assert.equal(result.get(5), "FB");
    assert.equal(result.get(6), "CM");
    assert.equal(result.get(7), "CM");
    assert.equal(result.get(8), "CM");
    assert.equal(result.get(9), "AM");
    assert.equal(result.get(10), "ST");
    assert.equal(result.get(11), "AM");
  });

  it("klassificerar en 3-4-3 med wingbacks korrekt", () => {
    const lineup = [
      appearance(1, "G", "1:1"),
      appearance(2, "D", "2:1"), appearance(3, "D", "2:2"), appearance(4, "D", "2:3"),
      appearance(5, "M", "3:1"), appearance(6, "M", "3:2"), appearance(7, "M", "3:3"), appearance(8, "M", "3:4"),
      appearance(9, "F", "4:1"), appearance(10, "F", "4:2"), appearance(11, "F", "4:3"),
    ];
    const result = classifyLineup(lineup);
    assert.equal(result.get(2), "CB");
    assert.equal(result.get(5), "FB", "wingback, inte ytter");
    assert.equal(result.get(6), "CM");
    assert.equal(result.get(8), "FB");
  });
});

describe("assignPosition — primär och sekundär position", () => {
  it("väljer gruppen med flest startminuter", () => {
    const result = assignPosition(
      [{ group: "CB", minutes: 900 }, { group: "FB", minutes: 180 }],
      "Defender"
    );
    assert.equal(result.primary, "CB");
    assert.ok(result.confidence > 0.8);
  });

  it("sparar sekundärposition när den är tillräckligt stor", () => {
    const result = assignPosition(
      [{ group: "CM", minutes: 600 }, { group: "AM", minutes: 400 }],
      "Midfielder"
    );
    assert.equal(result.primary, "CM");
    assert.equal(result.secondary, "AM");
  });

  it("ignorerar en enstaka nödlösning som sekundärposition", () => {
    const result = assignPosition(
      [{ group: "ST", minutes: 2000 }, { group: "CB", minutes: 20 }],
      "Attacker"
    );
    assert.equal(result.secondary, null);
  });

  it("faller tillbaka på player.position när ingen start finns", () => {
    const result = assignPosition([], "Goalkeeper");
    assert.equal(result.primary, "GK");
    assert.equal(result.confidence, 0);
    assert.equal(result.fromFallback, true);
  });

  it("är deterministisk vid exakt lika minuter", () => {
    const a = assignPosition([{ group: "AM", minutes: 500 }, { group: "CM", minutes: 500 }], null);
    const b = assignPosition([{ group: "CM", minutes: 500 }, { group: "AM", minutes: 500 }], null);
    assert.equal(a.primary, b.primary, "samma data ska alltid ge samma grupp");
  });
});

// =============================================================================
// Punkt 1: innevarande säsong utanför Allsvenskan
// =============================================================================

describe("blendObservedPercentile — samma säsong utanför Allsvenskan", () => {
  // Referensfördelning: 30 anfallare, mål/90 från 0.00 till 1.45.
  const dist = buildReferenceDistributions(
    [...Array(30)].map((_, i) => ({
      positionGroup: "ST" as PositionGroup,
      metrics: { goals_per90: i * 0.05 },
    }))
  );

  it("ger samma svar som tidigare när ingen utländsk speltid finns", () => {
    const blended = blendObservedPercentile(dist, "ST", "goals_per90", 0.5, 900, []);
    assert.equal(blended.percentile, metricPercentile(dist, "ST", "goals_per90", 0.5));
    assert.equal(blended.minutes, 900);
  });

  it("väger allsvenskt och utländskt rent på MINUTER — ingen bonus för samma säsong", () => {
    const external = [
      { leagueExternalId: 113, leagueName: "Testliga", leagueCoefficient: 1, minutes: 900, per90: { goals_per90: 0.0 } },
    ];
    const blended = blendObservedPercentile(dist, "ST", "goals_per90", 1.45, 900, external);
    const high = metricPercentile(dist, "ST", "goals_per90", 1.45) as number;
    const low = metricPercentile(dist, "ST", "goals_per90", 0.0) as number;
    // Lika många minuter i vardera -> exakt mittemellan.
    assert.ok(Math.abs((blended.percentile as number) - (high + low) / 2) < 1e-9);
    assert.equal(blended.minutes, 1800);
  });

  it("låter fler minuter väga tyngre", () => {
    const few = blendObservedPercentile(dist, "ST", "goals_per90", 1.45, 1800, [
      { leagueExternalId: 1, leagueName: "X", leagueCoefficient: 1, minutes: 90, per90: { goals_per90: 0 } },
    ]);
    const many = blendObservedPercentile(dist, "ST", "goals_per90", 1.45, 90, [
      { leagueExternalId: 1, leagueName: "X", leagueCoefficient: 1, minutes: 1800, per90: { goals_per90: 0 } },
    ]);
    assert.ok((few.percentile as number) > (many.percentile as number));
  });

  it("ligajusterar den utländska delen", () => {
    const strong = blendObservedPercentile(dist, "ST", "goals_per90", null, 0, [
      { leagueExternalId: 39, leagueName: "Premier League", leagueCoefficient: 1.55, minutes: 900, per90: { goals_per90: 0.5 } },
    ]);
    const weak = blendObservedPercentile(dist, "ST", "goals_per90", null, 0, [
      { leagueExternalId: 114, leagueName: "Superettan", leagueCoefficient: 0.7, minutes: 900, per90: { goals_per90: 0.5 } },
    ]);
    assert.ok((strong.percentile as number) > (weak.percentile as number), "samma måltakt ska väga tyngre från en starkare liga");
  });

  it("bidrar bara till de mått den utländska källan faktiskt täcker", () => {
    const external = [
      { leagueExternalId: 1, leagueName: "X", leagueCoefficient: 1, minutes: 900, per90: { goals_per90: 0.5 } },
    ];
    // duels_won_pct finns inte i player_career_stint -> bara allsvenska minuter.
    const duels = blendObservedPercentile(dist, "ST", "duels_won_pct", null, 450, external);
    assert.equal(duels.percentile, null, "inget påhittat värde för ett mått källan saknar");
    assert.equal(duels.minutes, 0);
  });

  it("klarar en spelare helt utan allsvenska minuter", () => {
    const blended = blendObservedPercentile(dist, "ST", "goals_per90", null, 0, [
      { leagueExternalId: 1, leagueName: "X", leagueCoefficient: 1, minutes: 600, per90: { goals_per90: 0.75 } },
    ]);
    assert.ok(blended.percentile !== null);
    assert.equal(blended.minutes, 600);
  });

  it("ignorerar sejourer utan speltid", () => {
    const blended = blendObservedPercentile(dist, "ST", "goals_per90", 0.5, 900, [
      { leagueExternalId: 1, leagueName: "X", leagueCoefficient: 1, minutes: 0, per90: { goals_per90: 9 } },
    ]);
    assert.equal(blended.minutes, 900);
  });
});

// =============================================================================
// Punkt 2: ovr, säsongsbetyg och historik på samma måttstock
// =============================================================================

describe("computeRatings — ovr ligger mellan säsongsbetyg och historik", () => {
  const ST_METRICS: MetricKey[] = [
    "goals_per90", "shots_on_target_per90", "conversion",
    "duels_won_pct", "goal_contributions_per90", "offsides_per90",
  ];

  /** Bygger en syntetisk liga där varje spelare har full täckning på ST-vikterna. */
  function buildLeague(count: number) {
    const peers = [...Array(count)].map((_, i) => ({
      positionGroup: "ST" as PositionGroup,
      metrics: {
        goals_per90: i * 0.03,
        shots_on_target_per90: 0.2 + i * 0.05,
        conversion: 0.1 + i * 0.01,
        duels_won_pct: 0.3 + i * 0.008,
        goal_contributions_per90: i * 0.04,
        offsides_per90: 1 - i * 0.02,
      } as Partial<Record<MetricKey, number | null>>,
    }));
    const distributions = buildReferenceDistributions(peers);

    const inputs: PlayerSeasonInput[] = peers.map((peer, i) => ({
      playerId: i,
      seasonYear: 2025,
      clubId: 1,
      minutes: 1800,
      birthDate: "1998-01-01",
      positionGroup: "ST" as PositionGroup,
      secondaryPositionGroup: null,
      positionConfidence: 1,
      metrics: peer.metrics,
      currentSeasonExternal: [],
      unratedStints: [],
      // Historiken vänds med flit BAKLÄNGES mot det observerade, så att
      // säsongsbetyg och historik drar åt olika håll för varje spelare.
      history: [
        {
          seasonYear: 2024,
          minutes: 1800,
          source: "allsvenskan" as const,
          leagueCoefficient: 1,
          percentiles: Object.fromEntries(
            ST_METRICS.map((k) => [k, ((count - 1 - i) / count) * 100])
          ) as Partial<Record<MetricKey, number | null>>,
        },
      ],
      recentFormMetrics: null,
      joinedClubDate: null,
    }));

    const prepared = inputs.map((input) =>
      preparePlayer(input, distributions, 270, new Date("2025-11-01T00:00:00Z"))
    );
    return computeRatings(prepared, "2026-01-01T00:00:00Z");
  }

  it("håller ovr inom spannet [säsongsbetyg, historik]", () => {
    const ratings = buildLeague(40);
    let checked = 0;
    for (const r of ratings) {
      if (r.ovr === null || r.current_season_rating === null || r.historical_rating === null) continue;
      const lo = Math.min(r.current_season_rating, r.historical_rating);
      const hi = Math.max(r.current_season_rating, r.historical_rating);
      assert.ok(
        r.ovr >= lo - 1e-6 && r.ovr <= hi + 1e-6,
        `spelare ${r.player_id}: ovr ${r.ovr} ligger utanför [${lo}, ${hi}]`
      );
      checked++;
    }
    assert.ok(checked > 20, `för få spelare kontrollerade (${checked})`);
  });

  it("avvikelsen är liten även när mätvärdena har olika k", () => {
    // Med olika stabiliseringskonstanter kan blandningsvikten skilja sig mellan
    // mätvärden, och då kan kompositen hamna strax utanför spannet. Det är en
    // känd och accepterad egenskap — men den ska förbli LITEN. Slår det här
    // testet har något i shrinkagen gått sönder, inte bara flyttat sig.
    //
    // ST-vikterna blandar shooting (k=15), duels (k=8) och creation (k=12).
    const ratings = buildLeague(40);
    let worst = 0;
    for (const r of ratings) {
      if (r.ovr === null || r.current_season_rating === null || r.historical_rating === null) continue;
      const lo = Math.min(r.current_season_rating, r.historical_rating);
      const hi = Math.max(r.current_season_rating, r.historical_rating);
      worst = Math.max(worst, lo - r.ovr, r.ovr - hi);
    }
    assert.ok(worst < 4, `största avvikelse ${worst.toFixed(1)} OVR — förväntat under 4`);
  });

  it("ger alla tre betygen på samma skala — inget hamnar i taket av misstag", () => {
    const ratings = buildLeague(40);
    for (const r of ratings) {
      for (const value of [r.ovr, r.current_season_rating, r.historical_rating]) {
        if (value === null) continue;
        assert.ok(value >= OVR_FLOOR && value <= OVR_CAP, `${value} utanför skalan`);
      }
    }
  });

  it("rankar samma poäng till samma percentil oavsett vilken storhet den gäller", () => {
    const reference = buildCompositeReference([
      ...[...Array(20)].map((_, i) => ({ group: "ST" as PositionGroup, score: 30 + i * 2, isPeer: true })),
    ]);
    const a = rankAgainstReference(reference, [{ key: "a", group: "ST", score: 55 }]).get("a");
    const b = rankAgainstReference(reference, [{ key: "b", group: "ST", score: 55 }]).get("b");
    assert.equal(a, b);
  });
});
