import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeOvrProposalComparison, PROPOSED_ADDITIONS } from "@/lib/football/rating/ovr-proposal";
import { RATING_CATEGORY_LABELS, type RatingCategoryKey } from "@/lib/football/rating/metric-registry";

/**
 * Fas 13 — Player Rating-JÄMFÖRELSEFÖRSLAG. Rent beslutsunderlag åt
 * användaren, admin-scopad (samma auth-mönster som app/(app)/admin/page.tsx).
 * INGENTING på den här sidan skriver till databasen — bara läsning och en
 * ren beräkning (se lib/football/rating/ovr-proposal.ts:s filhuvud för den
 * fullständiga garantin om att inga skyddade filer rörs).
 */

const CATEGORY_KEYS: RatingCategoryKey[] = ["shooting", "passing", "dribbling", "defending"];

export default async function OvrProposalPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { season } = await searchParams;
  const seasonYear = (season ? Number(season) : 2025) as 2024 | 2025 | 2026;
  const validSeason = ([2024, 2025, 2026] as const).includes(seasonYear) ? seasonYear : 2025;

  const rows = await computeOvrProposalComparison(supabase, { seasonYear: validSeason });
  const withBothOvr = rows.filter((r) => r.currentOvr !== null && r.proposedOvr !== null);
  const avgDelta =
    withBothOvr.length > 0 ? withBothOvr.reduce((a, r) => a + (r.delta ?? 0), 0) / withBothOvr.length : 0;
  const bigMovers = withBothOvr.filter((r) => Math.abs(r.delta ?? 0) >= 5);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/admin" className="text-xs text-[#898781] hover:text-white">
        ← Admin
      </Link>

      <div className="mt-3 rounded-xl border border-[#d9a526]/40 bg-[#d9a526]/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#d9a526]">Förslag — inte live</p>
        <p className="mt-1 text-sm text-[#c3c2b7]">
          Det här är ett BESLUTSUNDERLAG, inte en förhandsvisning av en kommande ändring. Ingenting här skrivs till
          databasen eller påverkar den faktiska OVR som visas i produkten. Player Rating-formeln
          (<code className="text-[#e6c15c]">metric-registry.ts</code>/<code className="text-[#e6c15c]">categories.ts</code>/
          <code className="text-[#e6c15c]">position-rating-config.ts</code>) förblir oförändrad tills du explicit
          godkänner en ändring.
        </p>
      </div>

      <h1 className="mt-4 text-lg font-semibold">Player Rating — jämförelseförslag</h1>
      <p className="mt-1 text-sm text-[#898781]">
        Nuvarande OVR-formel jämförd med ett FÖRESLAGET tillägg av tre Sportmonks-mått — samma kategori-vikter
        (attacker/midfielder/defender oförändrade), bara ett nytt mått per kategori inräknat i percentil-snittet:
      </p>
      <ul className="mt-2 space-y-1 text-sm text-[#c3c2b7]">
        {PROPOSED_ADDITIONS.map((a) => (
          <li key={a.key}>
            + <span className="text-white">{a.label}</span> i {RATING_CATEGORY_LABELS[a.category].toLowerCase()}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-2 text-xs">
        {([2024, 2025, 2026] as const).map((y) => (
          <Link
            key={y}
            href={`/admin/ovr-proposal?season=${y}`}
            className={`rounded-lg px-3 py-1.5 ${
              y === validSeason ? "bg-white text-black" : "border border-white/10 text-[#898781] hover:text-white"
            }`}
          >
            {y}
          </Link>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
          <p className="text-2xl font-bold text-white">{withBothOvr.length}</p>
          <p className="mt-0.5 text-xs text-[#898781]">Spelare jämförda</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
          <p className="text-2xl font-bold text-white">{avgDelta.toFixed(2)}</p>
          <p className="mt-0.5 text-xs text-[#898781]">Genomsnittlig förändring</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#141418] p-4">
          <p className="text-2xl font-bold text-white">{bigMovers.length}</p>
          <p className="mt-0.5 text-xs text-[#898781]">Spelare med ≥5 poäng förändring</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-[#7d7c76]">
              <th className="p-3">Spelare</th>
              <th className="p-3">Position</th>
              <th className="p-3 text-right">Nuvarande OVR</th>
              <th className="p-3 text-right">Föreslagen OVR</th>
              <th className="p-3 text-right">Förändring</th>
              {CATEGORY_KEYS.map((k) => (
                <th key={k} className="p-3 text-right">
                  {RATING_CATEGORY_LABELS[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withBothOvr.slice(0, 40).map((r) => (
              <tr key={r.playerId} className="border-b border-white/5">
                <td className="p-3 text-white">{r.fullName}</td>
                <td className="p-3 text-[#898781]">{r.positionGroup}</td>
                <td className="p-3 text-right tabular-nums">{r.currentOvr}</td>
                <td className="p-3 text-right tabular-nums">{r.proposedOvr}</td>
                <td
                  className="p-3 text-right tabular-nums font-medium"
                  style={{ color: (r.delta ?? 0) > 0 ? "#22c55e" : (r.delta ?? 0) < 0 ? "#e66767" : "#7d7c76" }}
                >
                  {(r.delta ?? 0) > 0 ? "+" : ""}
                  {r.delta}
                </td>
                {CATEGORY_KEYS.map((k) => {
                  const current = r.currentResult.contributions.find((c) => c.category === k)?.score;
                  const proposed = r.proposedResult.contributions.find((c) => c.category === k)?.score;
                  return (
                    <td key={k} className="p-3 text-right tabular-nums text-[#898781]">
                      {current ?? "—"} → {proposed ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[#7d7c76]">
        Visar de 40 spelarna med störst absolut förändring, säsongen {validSeason} ({withBothOvr.length} totalt jämförda).
      </p>
    </div>
  );
}
