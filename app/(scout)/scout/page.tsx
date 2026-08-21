import Link from "next/link";

/**
 * Scout-hubben (/scout). Fas 14.1 — bara ett minimalt landningsläge så
 * routen finns och länken från Sidebar.tsx har någonstans naturligt att ta
 * vägen; den riktiga hubben (senaste sökningar, shortlist-genväg,
 * arketyp-highlights m.m., se sitemapen i plans/humble-giggling-biscuit.md)
 * byggs i Fas 14.4 tillsammans med resten av Scout-plattformen. Just nu
 * finns bara /scout/spelare (flyttad hit oförändrad från f.d. /data/scout).
 */
export default function ScoutHubPage() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Scout</h1>
      <p className="mt-2 max-w-lg text-sm text-[#898781]">
        Den fulla scoutingplattformen (sök, jämför, shortlist, lag-DNA) byggs stegvis här. Just nu finns
        spelarsökningen — resten kommer i nästa steg.
      </p>

      <Link
        href="/scout/spelare"
        className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#a78bfa]/30 bg-[#a78bfa]/10 px-4 py-3 text-sm font-medium text-[#a78bfa] transition-colors hover:bg-[#a78bfa]/15"
      >
        🔎 Sök spelare →
      </Link>
    </div>
  );
}
