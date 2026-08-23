import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayersWhoLeftAllsvenskan, getForeignClubSummary, getDirectArrivalsAtClub } from "@/lib/football/post-allsvenskan";
import { translateClubCountry } from "@/lib/i18n/sv";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";

/**
 * Fas 19c (2026-08-23, användarkrav: "man ska kunna trycka på lagen
 * (utländska lagen) i karriärresan när man tryck på en spelare i efter
 * allsvenskan") — klubbvyn man landar på.
 *
 * Frågan sidan svarar på är den enda som är MENINGSFULL för oss att svara
 * på om en utländsk klubb: "vilka f.d. Allsvenska spelare har spelat här,
 * och hur gick det för dem?". Vi bygger medvetet INTE en allmän klubbsida
 * (trupp, tabell, matcher) — den datan har vi inte för utländska ligor, och
 * att låtsas annat vore precis den sortens påhittade innehåll projektet
 * förbjuder.
 *
 * All statistik är redan filtrerad till EFTER Allsvenskan i
 * lib/football/post-allsvenskan.ts, och siffrorna per spelare avser BARA
 * tiden i just den här klubben (`byClub`), inte hela utlandskarriären.
 */

const nf = (n: number) => n.toLocaleString("sv-SE");

export default async function ForeignClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const players = await getPlayersWhoLeftAllsvenskan(supabase);
  const club = getForeignClubSummary(players, slug);
  const directArrivals = getDirectArrivalsAtClub(players, slug);
  const directPlayerIds = new Set(directArrivals.map((a) => a.player.playerId));
  if (!club) notFound();

  const country = translateClubCountry(club.country);

  return (
    <div>
      <Link
        href="/scout/efter-allsvenskan"
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#898781] transition-colors hover:border-white/20 hover:text-white"
      >
        ← Efter Allsvenskan
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        {club.teamLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
          <img src={club.teamLogoUrl} alt="" className="h-14 w-14 shrink-0 object-contain" />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-full bg-white/5" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-white">{club.teamName}</h1>
          <p className="mt-0.5 text-sm text-[#898781]">
            {country ? `${country} · ` : ""}
            {nf(club.players.length)} {club.players.length === 1 ? "spelare" : "spelare"} från Allsvenskan
          </p>
          {/*
            Fas 19e — sidan nås nu från TVÅ håll som räknar olika saker, och
            skillnaden måste stå i klartext i stället för att se ut som en
            motsägelse: destinationsrankingen räknar spelare som värvades
            DIREKT hit från Allsvenskan, medan listan nedan visar alla f.d.
            Allsvenska spelare som spelat här, oavsett vilken väg de tog hit.
          */}
          {directArrivals.length > 0 && directArrivals.length !== club.players.length && (
            <p className="mt-1 text-xs text-[#7d7c76]">
              varav <span className="font-semibold text-[#a78bfa]">{nf(directArrivals.length)}</span> värvades direkt från en Allsvensk klubb
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: "Mål", value: nf(club.totalGoals) },
          { label: "Assist", value: nf(club.totalAssists) },
          { label: "Matcher", value: nf(club.totalAppearances) },
          { label: "Minuter", value: nf(club.totalMinutes) },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-white/10 bg-[#1a1a19] p-4 text-center">
            <p className="text-2xl font-semibold tabular-nums text-white">{t.value}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-[#898781]">{t.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[#5f5e59]">Sammanlagt av alla f.d. Allsvenska spelare, bara deras tid i {club.teamName}.</p>

      <div className="mt-8">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
          <span aria-hidden>🚀</span> Spelare från Allsvenskan
        </p>
        <div className="space-y-1.5">
          {club.players.map(({ player, atClub }) => (
            <Link
              key={player.playerId}
              href={`/scout/efter-allsvenskan/${player.playerId}`}
              className="group flex items-center gap-3 rounded-xl border border-white/5 bg-[#141418]/40 p-3 transition-colors hover:border-white/15 hover:bg-white/[.03] sm:gap-4 sm:p-4"
            >
              <PlayerAvatar name={player.playerName} size={44} photoUrl={player.photoUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-white group-hover:underline">{player.playerName}</p>
                  {directPlayerIds.has(player.playerId) && (
                    <span className="shrink-0 rounded-full bg-[#a78bfa]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#a78bfa]">
                      Direkt från Allsvenskan
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-[#898781]">
                  Lämnade <span className="text-[#c3c2b7]">{player.previousTeamName}</span> {player.leftYear}
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-1 sm:flex">
                {[
                  { label: "Mål", value: nf(atClub.goals) },
                  { label: "Assist", value: nf(atClub.assists) },
                  { label: "Matcher", value: nf(atClub.appearances) },
                  { label: "Minuter", value: nf(atClub.minutesPlayed) },
                ].map((s) => (
                  <div key={s.label} className="w-[4.25rem] py-1.5 text-center">
                    <p className="text-sm font-semibold tabular-nums text-[#c3c2b7]">{s.value}</p>
                    <p className="text-[10px] uppercase tracking-wide text-[#7d7c76]">{s.label}</p>
                  </div>
                ))}
                <div className="w-[3.5rem] text-center">
                  {atClub.avgRating !== null ? (
                    <>
                      <p className="text-sm font-semibold tabular-nums text-[#d9a526]">{atClub.avgRating}</p>
                      <p className="text-[10px] uppercase tracking-wide text-[#7d7c76]">Betyg</p>
                    </>
                  ) : (
                    <p className="text-xs text-[#3d3c39]">—</p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-right sm:hidden">
                <div>
                  <p className="text-sm font-semibold tabular-nums text-white">{nf(atClub.goals)}</p>
                  <p className="text-[10px] uppercase text-[#7d7c76]">Mål</p>
                </div>
                <div>
                  <p className="text-sm font-semibold tabular-nums text-[#c3c2b7]">{nf(atClub.appearances)}</p>
                  <p className="text-[10px] uppercase text-[#7d7c76]">M</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <p className="mt-6 text-[10px] leading-relaxed text-[#5f5e59]">
        Bara spelare som dokumenterat lämnat Allsvenskan och har importerad matchstatistik för {club.teamName} — listan speglar vår karriärdata,
        inte klubbens fullständiga historik.
      </p>
    </div>
  );
}
