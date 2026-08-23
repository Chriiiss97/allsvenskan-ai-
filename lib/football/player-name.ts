/**
 * Fas 17 (2026-08-22) — `player.full_name` kommer från api-football:s
 * `/players`-endpoints `name`-fält, som för de FLESTA spelare visar sig
 * vara en FÖRKORTNING ("M. Berg") snarare än ett riktigt namn — bekräftat på
 * ett stickprov av databasen (1882 av 2305 spelare har ett förkortat
 * full_name). `player.first_name`/`player.last_name` kommer istället från
 * samma käll-payloads `firstname`/`lastname`-fält.
 *
 * Fas 21 (2026-08-23) — `first_name` innehåller ALLA förnamn, inklusive
 * mellannamn ("Bengt Erik Markus" för Markus Berg), så `first_name +
 * last_name` blir för långt. Nyckeln är att förkortningen i `full_name`
 * pekar ut TILLTALSNAMNET: "M. Berg" + "Bengt Erik Markus" -> Markus, och
 * "J. Larsson" + "Carl Henrik Jordan" -> Jordan. Efternamnsdelen i
 * full_name är api-footballs egen visningsform och är oftare rensad än
 * `last_name` ("E. Hagen" vs last_name "Kristoffersen Hagen"), medan äkta
 * dubbelefternamn ("van Assema", "Karlsson Lagemyr") behålls intakta.
 *
 * Resultatet är alltid "Tilltalsnamn Efternamn" — aldrig mellannamn, aldrig
 * en initial när ett riktigt förnamn finns, aldrig tom sträng.
 */

/** "M. Berg" / "V.  Lundberg" -> [initial, efternamnsdel] */
const ABBREVIATED = /^(\p{L})\s*\.\s*(.+)$/u;

function nameTokens(value: string | null | undefined): string[] {
  return (value ?? "").trim().split(/\s+/).filter(Boolean);
}

/** Jämför begynnelsebokstäver: "é" ~ "E", men svenska "Å" ≠ "A". */
function sameInitial(letter: string, initial: string): boolean {
  return letter.localeCompare(initial, "sv", { sensitivity: "base" }) === 0;
}

export function displayPlayerName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallbackFullName: string | null | undefined
): string {
  const full = nameTokens(fallbackFullName).join(" ");
  const givenNames = nameTokens(firstName);
  const surnames = nameTokens(lastName);

  const abbreviated = full.match(ABBREVIATED);
  if (abbreviated) {
    // Ingen förnamnsdata — då är den förkortade formen det bästa vi har.
    if (givenNames.length === 0) return full;
    const [, initial, surname] = abbreviated;
    const called = givenNames.find((token) => sameInitial(token[0], initial)) ?? givenNames[0];
    return `${called} ${surname.trim()}`;
  }

  if (givenNames.length === 0 || surnames.length === 0) {
    return full || [...givenNames, ...surnames].join(" ");
  }

  // full_name är redan ett riktigt namn: korta bara ned det om för-/efternamn
  // ger färre ord (annars riskerar vi att lägga TILL delar, t.ex.
  // "Amir Al Ammari" + last_name "Aboud Al Ammari").
  const candidate = `${givenNames[0]} ${surnames.join(" ")}`;
  return nameTokens(candidate).length < nameTokens(full).length ? candidate : full;
}
