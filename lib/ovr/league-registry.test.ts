/**
 * Permanent skydd mot gissade liga-id.
 *
 * Bakgrunden: i den första versionen av config.ts var tre av tolv uteslutna
 * cup-id skrivna för hand, härledda ur en inventeringsutskrift som visade
 * ANTAL rader, inte id. Två av dem pekade i själva verket på riktiga serier —
 * 290 är Persian Gulf Pro League (Iran) och 169 är Super League (Kina) — som
 * därmed uteslöts ur alla betyg utan att någon märkte det.
 *
 * Testet nedan gör den klassen av fel omöjlig att upprepa: varje id i config.ts
 * jämförs mot lib/ovr/league-registry.ts, som är GENERERAD ur den faktiska
 * datan (scripts/generate-league-registry.ts). Skriver någon in ett id på
 * känsla och gissar fel namn, faller testet.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LEAGUE_COEFFICIENTS, leagueUsability } from "./config";
import { LEAGUE_REGISTRY, lookupLeague } from "./league-registry";

describe("ligaregistret — inga gissade id", () => {
  it("varje konfigurerad koefficient matchar registrets namn", () => {
    for (const c of LEAGUE_COEFFICIENTS) {
      const entry = lookupLeague(c.league_external_id);
      // Allsvenskan (113) finns med flit inte i player_career_stint — importen
      // hoppar över den för att inte dubblera `statistics`.
      if (!entry) {
        assert.equal(c.league_external_id, 113, `id ${c.league_external_id} ("${c.league_name}") finns inte i datan`);
        continue;
      }
      assert.equal(
        entry.name.toLowerCase(),
        c.league_name.toLowerCase(),
        `id ${c.league_external_id}: config säger "${c.league_name}", datan säger "${entry.name}"`
      );
    }
  });

  it("ingen koefficient är satt på en cup, träningsmatch eller ungdomsserie", () => {
    for (const c of LEAGUE_COEFFICIENTS) {
      const entry = lookupLeague(c.league_external_id);
      if (!entry) continue;
      assert.equal(
        entry.kind,
        "league",
        `id ${c.league_external_id} ("${entry.name}") är ${entry.kind} och får inte ha en koefficient`
      );
    }
  });

  it("cuper, träningsmatcher och ungdomsserier är aldrig användbara", () => {
    for (const entry of LEAGUE_REGISTRY) {
      if (entry.kind === "league") continue;
      const usability = leagueUsability(entry.id);
      assert.equal(usability.usable, false, `${entry.name} (${entry.id}, ${entry.kind}) släpptes igenom`);
      assert.equal(usability.coefficient, null);
    }
  });

  it("de två serier som tidigare uteslöts av misstag är användbara igen om de får en koefficient", () => {
    // 290 = Persian Gulf Pro League, 169 = Super League (Kina). Båda är
    // seriespel, inte cuper. De saknar fortfarande verifierad koefficient och
    // är därför oanvändbara — men av RÄTT skäl, och det syns i reason.
    for (const id of [290, 169]) {
      const entry = lookupLeague(id);
      assert.ok(entry, `id ${id} saknas i registret`);
      assert.equal(entry.kind, "league", `id ${id} ("${entry.name}") ska vara seriespel`);
      assert.equal(leagueUsability(id).reason, "no_coefficient");
    }
  });

  it("en serie utan verifierad koefficient blir oanvändbar, inte gissad", () => {
    // League One (41) — 44 518 minuter i vår data, ingen koefficient satt.
    const usability = leagueUsability(41);
    assert.equal(usability.usable, false);
    assert.equal(usability.coefficient, null, "ingen påhittad siffra");
    assert.equal(usability.reason, "no_coefficient");
  });

  it("ett okänt id ger unknown_league i stället för en standardkoefficient", () => {
    const usability = leagueUsability(999999);
    assert.equal(usability.usable, false);
    assert.equal(usability.coefficient, null);
    assert.equal(usability.reason, "unknown_league");
  });

  it("Svenska Cupen — den största posten i datan — är klassad som cup", () => {
    assert.equal(lookupLeague(115)?.kind, "cup");
    assert.equal(leagueUsability(115).reason, "cup");
  });

  it("träningsmatcher är klassade som sådana", () => {
    const friendlies = LEAGUE_REGISTRY.filter((l) => l.kind === "friendly");
    assert.ok(friendlies.length > 0, "registret hittade inga träningsmatcher alls");
    for (const f of friendlies) assert.equal(leagueUsability(f.id).usable, false);
  });

  it("registret har inga dubbletter", () => {
    const ids = new Set<number>();
    for (const entry of LEAGUE_REGISTRY) {
      assert.ok(!ids.has(entry.id), `dubblerat id ${entry.id}`);
      ids.add(entry.id);
    }
  });
});
