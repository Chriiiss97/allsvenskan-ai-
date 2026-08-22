/**
 * Fas 16 (2026-08-22) — enkel, stilren lista över Match Preview-fakta.
 * Ersätter den gamla `max-h-80 overflow-y-auto`-inrutan (en inre
 * scrollfälla, extra klick för att ens se allt) med en flat lista + en
 * `<details>`-baserad "visa fler" för långa listor — samma nollJS-mönster
 * som CollapsibleSection redan använder, ingen ny client-komponent behövs.
 *
 * Varje rad är ANTINGEN en deterministiskt översatt svensk mening
 * (lib/football/match-preview-sv.ts) ELLER, om typen inte är täckt, den
 * engelska originalmeningen med en liten "EN"-markering — ALDRIG en tyst
 * gissad översättning. Ingen lag-pill längre: subjektet står redan i själva
 * meningen (både den svenska och den engelska), en pill bredvid var bara
 * upprepad information.
 */
export interface DisplayFact {
  key: string;
  text: string;
  translated: boolean;
}

const VISIBLE_COUNT = 6;

export function MatchFactGroup({ facts }: { facts: DisplayFact[] }) {
  if (facts.length === 0) return null;
  const visible = facts.slice(0, VISIBLE_COUNT);
  const rest = facts.slice(VISIBLE_COUNT);

  return (
    <ul className="divide-y divide-white/5">
      {visible.map((f) => (
        <FactRow key={f.key} fact={f} />
      ))}
      {rest.length > 0 && (
        <li>
          <details className="group">
            <summary className="cursor-pointer list-none py-2.5 text-xs font-medium text-[#898781] marker:content-none hover:text-[#c3c2b7]">
              Visa {rest.length} till <span className="text-[#5f5e59] group-open:hidden">▾</span>
              <span className="hidden text-[#5f5e59] group-open:inline">▴</span>
            </summary>
            <ul className="divide-y divide-white/5">
              {rest.map((f) => (
                <FactRow key={f.key} fact={f} />
              ))}
            </ul>
          </details>
        </li>
      )}
    </ul>
  );
}

export function FactRow({ fact }: { fact: DisplayFact }) {
  return (
    <li className="flex items-start gap-2 py-2.5 text-sm leading-relaxed text-[#c3c2b7]">
      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/20" aria-hidden />
      <span>
        {fact.text}
        {!fact.translated && (
          <span
            className="ml-1.5 inline-block rounded border border-white/10 px-1 py-px align-middle text-[9px] font-semibold uppercase tracking-wide text-[#5f5e59]"
            title="Kunde inte översättas säkert — visar Sportmonks engelska originaltext."
          >
            EN
          </span>
        )}
      </span>
    </li>
  );
}
