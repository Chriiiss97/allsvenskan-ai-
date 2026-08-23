import Link from "next/link";

/**
 * Fas 22 (2026-08-23, användarkrav) — "Värvningar" är EN kategori i Scouts
 * nav, med två riktningar under sig: in i Allsvenskan och ut ur den. De två
 * sidorna byggdes vid olika tillfällen och låg tidigare som orelaterade
 * flikar; den här växlaren är det som gör dem till en enhet.
 *
 * Medvetet samma segmenterade form som sidornas egen vyväxlare
 * (Spelare/Scoutanalys), men placerad ÖVER rubriken och med riktnings-
 * ikoner — man ska se att den byter ANALYS, inte vy inom en analys.
 */
const DIRECTIONS = [
  { key: "in", href: "/scout/varvningar", label: "📥 Till Allsvenskan", hint: "Varifrån klubbarna hämtar spelare — och vilka värvningar som lyckas." },
  { key: "ut", href: "/scout/efter-allsvenskan", label: "📤 Efter Allsvenskan", hint: "Vart spelarna tar vägen efter Allsvenskan — och hur det går för dem." },
] as const;

export type TransferDirection = (typeof DIRECTIONS)[number]["key"];

export function TransferDirectionTabs({ active }: { active: TransferDirection }) {
  const current = DIRECTIONS.find((d) => d.key === active)!;
  return (
    <div className="mt-3">
      <div className="inline-flex rounded-lg border border-[#a78bfa]/25 bg-[#141117] p-0.5">
        {DIRECTIONS.map((d) => (
          <Link
            key={d.key}
            href={d.href}
            aria-current={d.key === active ? "page" : undefined}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              d.key === active ? "bg-[#a78bfa] text-black" : "text-[#898781] hover:text-white"
            }`}
          >
            {d.label}
          </Link>
        ))}
      </div>
      <p className="mt-2 text-xs text-[#5f5e59]">{current.hint}</p>
    </div>
  );
}
