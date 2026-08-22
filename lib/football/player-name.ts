/**
 * Fas 17 (2026-08-22) — `player.full_name` kommer från api-football:s
 * `/players`-endpoints `name`-fält, som för de FLESTA spelare visar sig
 * vara en FÖRKORTNING ("R. Ure") snarare än ett riktigt namn — bekräftat på
 * ett stickprov av databasen (913 av 1000 spelare hade ett förkortat
 * full_name). `player.first_name`/`player.last_name` kommer istället från
 * samma käll-payloads `firstname`/`lastname`-fält, som nästan alltid ÄR de
 * riktiga för- och efternamnen. Bygg alltså hellre namnet av de två
 * delarna när båda finns — faller annars tillbaka till full_name (aldrig
 * tomt sträng).
 */
export function displayPlayerName(firstName: string | null, lastName: string | null, fallbackFullName: string): string {
  if (firstName && lastName) return `${firstName} ${lastName}`;
  return fallbackFullName;
}
