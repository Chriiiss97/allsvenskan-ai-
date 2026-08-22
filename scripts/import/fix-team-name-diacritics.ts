import { createAdminClient } from "./admin-client";

/**
 * Fas 14.3 (redesign) — API-Football:s `/teams`-endpoint levererar
 * lagnamn UTAN svenska diakritiska tecken (ASCII-transliterering, t.ex.
 * "IFK Goteborg" istället för "IFK Göteborg") — importerat rakt av till
 * `team.name` sedan import-teams.ts:s första körning. Upptäckt av
 * användaren (2026-08-22) under Fas 14.3:s visuella genomgång.
 *
 * Bara å/ä/ö läggs tillbaka på redan existerande `team.name`-strängar —
 * ingen ny suffix/stavning uppfunnen (t.ex. "Örgryte IS" behåller sitt
 * "IS", inte Sportmonks kortare "Örgryte"). Fem av rättningarna
 * (Göteborg/Malmö/Örgryte/Öster/Västerås) verifierade LIVE mot
 * Sportmonks football/teams/{id} samma dag (se plans/humble-giggling-
 * biscuit.md-arbetet) — resten är otvetydiga, väletablerade svenska
 * klubbnamn (ingen gissning, bara redan kända, allmänt vedertagna namn).
 * Lag utan diakritiska tecken i sitt namn (AIK, Kalmar FF, Sirius, m.fl.)
 * listas inte här — inget att ändra.
 */
const CORRECTIONS: { externalId: number; from: string; to: string }[] = [
  { externalId: 367, from: "BK Hacken", to: "BK Häcken" },
  { externalId: 364, from: "Djurgardens IF", to: "Djurgårdens IF" },
  { externalId: 366, from: "IFK Goteborg", to: "IFK Göteborg" },
  { externalId: 378, from: "IFK Norrkoping", to: "IFK Norrköping" },
  { externalId: 2163, from: "IFK Varnamo", to: "IFK Värnamo" },
  { externalId: 764, from: "Jonkopings Sodra", to: "Jönköpings Södra" },
  { externalId: 375, from: "Malmo FF", to: "Malmö FF" },
  { externalId: 2240, from: "Mjallby AIF", to: "Mjällby AIF" },
  { externalId: 365, from: "Orebro SK", to: "Örebro SK" },
  { externalId: 2166, from: "Orgryte IS", to: "Örgryte IS" },
  { externalId: 2174, from: "Osters IF", to: "Östers IF" },
  { externalId: 376, from: "Ostersunds FK", to: "Östersunds FK" },
  { externalId: 2241, from: "Vasteras SK FK", to: "Västerås SK FK" },
];

export async function fixTeamNameDiacritics() {
  const supabase = createAdminClient();

  for (const c of CORRECTIONS) {
    const { data: team } = await supabase
      .from("team")
      .select("id, name")
      .eq("external_id", c.externalId)
      .maybeSingle();
    if (!team) {
      console.warn(`  ! Lag med external_id ${c.externalId} saknas, hoppar över.`);
      continue;
    }
    if (team.name !== c.from) {
      console.warn(`  ! ${c.from} -> ${c.to}: nuvarande namn ("${team.name}") matchar inte förväntat, hoppar över (redan rättat?).`);
      continue;
    }
    const { error } = await supabase.from("team").update({ name: c.to }).eq("id", team.id);
    if (error) throw error;
    console.log(`  ✓ ${c.from} -> ${c.to}`);
  }
}
