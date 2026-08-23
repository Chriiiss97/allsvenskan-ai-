import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayersWhoLeftAllsvenskan, aggregateDestinationLeagues, getDestinationLeagueArrivals } from "@/lib/football/post-allsvenskan";
import { translateClubCountry } from "@/lib/i18n/sv";
import { DestinationArrivalList } from "@/components/scout/DestinationArrivalList";

/**
 * Fas 19e (2026-08-23, användarkrav) — drill-down från ligarankingen:
 * "vilka spelare gick DIREKT från Allsvenskan till den här ligan?".
 *
 * "Direkt" är hela definitionen (se PostAllsvenskanDeparture): en spelare
 * som gick Allsvenskan → Ajax → Premier League räknas för Eredivisie, INTE
 * för Premier League. Listan dedupliceras per spelare så att antalet alltid
 * är exakt detsamma som rankingens siffra.
 */
export default async function DestinationLeaguePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const players = await getPlayersWhoLeftAllsvenskan(supabase);
  const league = aggregateDestinationLeagues(players).find((l) => l.slug === slug);
  if (!league) notFound();

  const arrivals = getDestinationLeagueArrivals(players, slug);
  const country = translateClubCountry(league.country);

  return (
    <div>
      <Link
        href="/scout/efter-allsvenskan?vy=analys"
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#898781] transition-colors hover:border-white/20 hover:text-white"
      >
        ← Scoutanalys
      </Link>

      <div className="mt-4 rounded-xl border border-white/10 border-l-2 border-l-[#a78bfa] bg-[#141418] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Destinationsliga</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{league.label}</h1>
        <p className="mt-1 text-sm text-[#898781]">
          {country ? `${country} · ` : ""}
          <span className="font-semibold text-[#c3c2b7]">{league.playerCount}</span> spelare värvade direkt från Allsvenskan
        </p>
      </div>

      <DestinationArrivalList arrivals={arrivals} showDestinationClub />

      <p className="mt-6 text-[10px] leading-relaxed text-[#5f5e59]">
        Bara DIREKTA övergångar: spelaren gick från en Allsvensk klubb till en klubb i {league.label}. En spelare som först gick till en annan liga
        och därifrån hit räknas för den första ligan, inte den här.
      </p>
    </div>
  );
}
