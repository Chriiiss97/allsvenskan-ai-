import Link from "next/link";

/**
 * Scout-hubben (/scout). Fas 14.4 — nu med riktiga genvägar till alla fem
 * Scout-sidorna (Spelare/Lag/Search/Compare/Shortlist), som alla finns nu.
 */
const CARDS = [
  { href: "/scout/spelare", emoji: "🔎", title: "Spelare", desc: "Bläddra, filtrera och sortera hela Allsvenskans trupp." },
  { href: "/scout/search", emoji: "🎯", title: "Search", desc: "Kriterie-sökning: mått-trösklar och percentiler kombinerat." },
  { href: "/scout/lag", emoji: "🛡️", title: "Lag", desc: "Lag-DNA — spelstil jämfört med ligasnittet." },
  { href: "/scout/compare", emoji: "⚖️", title: "Compare", desc: "Jämför två spelare eller två lag sida vid sida." },
  // Fas 22 — kategorin "Värvningar" (in i och ut ur Allsvenskan) saknades
  // helt på hubben; Efter Allsvenskan har aldrig legat här.
  { href: "/scout/varvningar", emoji: "📥", title: "Värvningar", desc: "Vilka utlandsvärvningar lyckas — och vart spelarna tar vägen efteråt." },
  { href: "/scout/shortlist", emoji: "⭐", title: "Shortlist", desc: "Dina sparade spelare, samlade på ett ställe." },
];

export default function ScoutHubPage() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Scout</h1>
      <p className="mt-2 max-w-lg text-sm text-[#898781]">
        Den avancerade scoutingplattformen — DNA, arketyper, percentiler, sökning och jämförelse, allt byggt på riktig
        statistik.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-[#a78bfa]/20 bg-[#141117] p-4 transition-colors hover:border-[#a78bfa]/40 hover:bg-[#a78bfa]/5"
          >
            <p className="text-lg">{c.emoji}</p>
            <p className="mt-1 text-sm font-semibold text-white">{c.title}</p>
            <p className="mt-0.5 text-xs text-[#898781]">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
