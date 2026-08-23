/**
 * Tester för den empiriska ligakontrollen.
 *
 * Poängen med modulen är att den ska VÄGRA uttala sig när underlaget är tunt
 * eller motsägelsefullt. De flesta testerna nedan handlar därför om att den
 * håller tyst i rätt lägen, inte om att den räknar rätt när allt är perfekt.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  estimateAll,
  estimateLeagueDifficulty,
  findOrderingConflicts,
  MIN_PLAYERS_FOR_ORDERING,
  type RatingTransition,
} from "./calibration";

function transition(overrides: Partial<RatingTransition> & { playerId: number }): RatingTransition {
  return {
    leagueExternalId: 1,
    foreignRating: 7.0,
    domesticRating: 7.0,
    movedToAllsvenskan: true,
    foreignYear: 2023,
    domesticYear: 2024,
    ...overrides,
  };
}

/** n spelare där alla betygsattes `delta` högre i Allsvenskan. */
function cohort(n: number, delta: number, options: { league?: number; split?: boolean } = {}): RatingTransition[] {
  return [...Array(n)].map((_, i) =>
    transition({
      playerId: i,
      leagueExternalId: options.league ?? 1,
      foreignRating: 7.0,
      domesticRating: 7.0 + delta,
      movedToAllsvenskan: options.split ? i % 2 === 0 : true,
    })
  );
}

describe("estimateLeagueDifficulty", () => {
  it("mäter en svårare liga som positiv skillnad", () => {
    const result = estimateLeagueDifficulty(1, cohort(30, 0.2));
    assert.equal(result.medianRatingDelta, 0.2);
    assert.equal(result.reliable, true);
  });

  it("mäter en lättare liga som negativ skillnad", () => {
    const result = estimateLeagueDifficulty(1, cohort(30, -0.25));
    assert.equal(result.medianRatingDelta, -0.25);
    assert.equal(result.reliable, true);
  });

  it("vägrar uttala sig om för få spelare", () => {
    const result = estimateLeagueDifficulty(1, cohort(MIN_PLAYERS_FOR_ORDERING - 1, 0.35));
    assert.equal(result.reliable, false);
    assert.match(result.unreliableReason ?? "", /spelare/);
  });

  it("räknar spelare, inte par — samma spelare två gånger räcker inte", () => {
    const many = [...Array(40)].map(() => transition({ playerId: 7, domesticRating: 7.3 }));
    const result = estimateLeagueDifficulty(1, many);
    assert.equal(result.players, 1);
    assert.equal(result.reliable, false);
  });

  it("underkänner när uppflyttningar och nedflyttningar säger olika saker", () => {
    // Den som flyttade IN mäts som +0,40, den som flyttade UT som -0,10.
    const mixed: RatingTransition[] = [
      ...[...Array(15)].map((_, i) => transition({ playerId: i, domesticRating: 7.4, movedToAllsvenskan: true })),
      ...[...Array(15)].map((_, i) => transition({ playerId: 100 + i, domesticRating: 6.9, movedToAllsvenskan: false })),
    ];
    const result = estimateLeagueDifficulty(1, mixed);
    assert.equal(result.reliable, false);
    assert.match(result.unreliableReason ?? "", /oense/);
  });

  it("godkänner när riktningarna är överens", () => {
    const result = estimateLeagueDifficulty(1, cohort(30, 0.2, { split: true }));
    assert.equal(result.reliable, true);
    assert.equal(result.deltaFromIncoming, result.deltaFromOutgoing);
  });

  it("använder median, så en enstaka utstickare flyttar inget", () => {
    const withOutlier = [...cohort(29, 0.1), transition({ playerId: 999, domesticRating: 20 })];
    assert.equal(estimateLeagueDifficulty(1, withOutlier).medianRatingDelta, 0.1);
  });

  it("redovisar antalet par i varje riktning", () => {
    const result = estimateLeagueDifficulty(1, cohort(30, 0.2, { split: true }));
    assert.equal(result.incomingPairs + result.outgoingPairs, 30);
    assert.ok(result.incomingPairs > 0 && result.outgoingPairs > 0);
  });
});

describe("estimateAll", () => {
  it("delar upp per liga och sorterar svårast först", () => {
    const results = estimateAll([
      ...cohort(25, 0.3, { league: 10 }),
      ...cohort(25, -0.2, { league: 20 }),
      ...cohort(25, 0.05, { league: 30 }),
    ]);
    assert.deepEqual(results.map((r) => r.leagueExternalId), [10, 30, 20]);
  });
});

describe("findOrderingConflicts", () => {
  it("flaggar när koefficienterna motsäger mätningen", () => {
    const estimates = estimateAll([
      ...cohort(25, 0.3, { league: 10 }), // uppmätt svårare
      ...cohort(25, 0.0, { league: 20 }), // uppmätt lättare
    ]);
    // ...men koefficienterna säger tvärtom.
    const conflicts = findOrderingConflicts(estimates, new Map([[10, 0.8], [20, 1.3]]));
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].harderByMeasurement, 10);
    assert.equal(conflicts[0].easierByMeasurement, 20);
  });

  it("flaggar inget när ordningen stämmer", () => {
    const estimates = estimateAll([...cohort(25, 0.3, { league: 10 }), ...cohort(25, 0.0, { league: 20 })]);
    assert.equal(findOrderingConflicts(estimates, new Map([[10, 1.3], [20, 0.8]])).length, 0);
  });

  it("ignorerar skillnader under brusgolvet", () => {
    const estimates = estimateAll([...cohort(25, 0.02, { league: 10 }), ...cohort(25, 0.0, { league: 20 })]);
    assert.equal(findOrderingConflicts(estimates, new Map([[10, 0.8], [20, 1.3]])).length, 0);
  });

  it("ignorerar ligor vars mätning underkänts", () => {
    const estimates = estimateAll([...cohort(3, 0.5, { league: 10 }), ...cohort(25, 0.0, { league: 20 })]);
    assert.equal(findOrderingConflicts(estimates, new Map([[10, 0.8], [20, 1.3]])).length, 0);
  });
});
