import type { PlayerDNA as PlayerDNAData, PlayerDNACategory } from "@/lib/football/player-dna";

const LABELS: { key: keyof PlayerDNAData; label: string }[] = [
  { key: "offensive", label: "Offensiv" },
  { key: "creation", label: "Skapande" },
  { key: "passing", label: "Passning" },
  { key: "duels", label: "Duellspel" },
  { key: "defense", label: "Defensivt arbete" },
];

function CategoryRow({ label, category }: { label: string; category: PlayerDNACategory }) {
  if (category.score === null) {
    return (
      <div className="py-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#c3c2b7]">{label}</span>
          <span className="text-[#7d7c76]">Ej tillgängligt</span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-white/5" />
      </div>
    );
  }

  return (
    <div className="py-1.5" title={`Baserat på: ${category.basis.join(", ")}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#c3c2b7]">{label}</span>
        <span className="font-medium text-white">{category.score}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-[#3987e5]/15">
        <div className="h-2 rounded-full bg-[#3987e5]" style={{ width: `${category.score}%` }} />
      </div>
    </div>
  );
}

/**
 * Fem kategorier, 0–100 — varje siffra är en percentil mot samma spelarpool
 * som ligasnittet (se lib/football/player-dna.ts), inte ett påhittat betyg.
 * En kategori utan underliggande mått visas som "Ej tillgängligt", ALDRIG
 * som 0 — till skillnad från StatBar döljs raden inte helt, eftersom DNA:ns
 * fem kategorier är en fast, namngiven uppsättning: det ska synas TYDLIGT
 * vilken bit som saknas data, inte försvinna tyst.
 */
export function PlayerDNA({ dna }: { dna: PlayerDNAData }) {
  const anyAvailable = LABELS.some(({ key }) => dna[key].score !== null);

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
      <h2 className="text-sm font-semibold">Player DNA</h2>
      <p className="mb-2 text-[11px] text-[#898781]">
        Percentil mot övriga IFK/AIK-spelare samma säsong — 100 = bäst i poolen
      </p>
      {LABELS.map(({ key, label }) => (
        <CategoryRow key={key} label={label} category={dna[key]} />
      ))}
      {!anyAvailable && (
        <p className="mt-2 text-xs text-[#7d7c76]">Ingen kategori har tillräcklig data för den här säsongen.</p>
      )}
    </div>
  );
}
