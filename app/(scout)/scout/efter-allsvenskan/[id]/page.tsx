import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayersWhoLeftAllsvenskan } from "@/lib/football/post-allsvenskan";
import { computePostAllsvenskanSuccess } from "@/lib/football/post-allsvenskan-success";
import { getCareerJourney } from "@/lib/football/career-journey";
import { translateNationality } from "@/lib/i18n/sv";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { CareerJourneySection } from "@/components/scout/player-card/CareerJourneySection";
import { colors } from "@/lib/design/tokens";

/**
 * Fas 18e/18f (2026-08-22) — Scouts egen detaljvy per spelare i Efter
 * Allsvenskan (klick i listan stannar i Scout, går INTE till /spelare/[id]
 * — uttryckligt användarkrav). Visar EXAKT var post-Allsvenskan-
 * prestationerna kommer ifrån: mål/assist/minuter/matcher/betyg PER KLUBB,
 * plus en total. All statistik är redan filtrerad till EFTER Allsvensk
 * debut i lib/football/post-allsvenskan.ts — Allsvensk statistik kan
 * alltså aldrig läcka in här.
 *
 * Fas 18f (användarkorrigering) — sidan påstår inte längre att spelaren
 * "spelar för" den senaste STINT-klubben (kan vara flera år gammal om
 * spelaren redan återvänt till Sverige, se T. Sana-fallet). En tydlig
 * status­banner + hela karriärresan (CareerJourneySection, samma
 * komponent som /spelare/[id], redan verifierad mot lån/permanenta
 * övergångar) visar istället VAD SOM FAKTISKT HÄNT, inte bara ett nuläge.
 */
const STATUS_META = {
  back_in_allsvenskan: { icon: "🟢", label: "Tillbaka i Allsvenskan" },
  back_in_sweden: { icon: "🇸🇪", label: "Tillbaka i Sverige (ej Allsvenskan)" },
  abroad: { icon: "🌍", label: "Spelar utomlands" },
  unknown: { icon: "❔", label: "Nuläge inte bekräftat" },
} as const;

const STATUS_COLOR: Record<keyof typeof STATUS_META, string> = {
  back_in_allsvenskan: colors.status.result.win,
  back_in_sweden: colors.text.muted,
  abroad: colors.accent.football,
  unknown: colors.text.faint,
};

export default async function PostAllsvenskanPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  if (Number.isNaN(playerId)) notFound();

  const supabase = await createClient();
  // Hela urvalet behövs ändå: "mest lyckad" är en RELATIV placering, den kan
  // inte räknas fram ur en ensam spelare. Samma bulk-anrop som listan gör,
  // så det kostar inget extra utöver den redan cachade beräkningen.
  const [allPlayers, journey] = await Promise.all([getPlayersWhoLeftAllsvenskan(supabase), getCareerJourney(supabase, { playerId })]);
  const player = allPlayers.find((p) => p.playerId === playerId);
  if (!player) notFound();

  const { ranked } = computePostAllsvenskanSuccess(allPlayers);
  const success = ranked.find((e) => e.player.playerId === playerId) ?? null;

  const statusMeta = STATUS_META[player.status];

  return (
    <div>
      <Link
        href="/scout/efter-allsvenskan"
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#898781] transition-colors hover:border-white/20 hover:text-white"
      >
        ← Efter Allsvenskan
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <PlayerAvatar name={player.playerName} size={64} photoUrl={player.photoUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-white">{player.playerName}</h1>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                backgroundColor: `${STATUS_COLOR[player.status]}1f`,
                color: STATUS_COLOR[player.status],
              }}
            >
              {statusMeta.icon} {statusMeta.label}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-2 text-sm text-[#c3c2b7]">
            {player.currentClubLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
              <img src={player.currentClubLogoUrl} alt="" className="h-4 w-4 object-contain" />
            )}
            Nuvarande klubb: {player.currentClubName}
            {player.currentClubCountry && ` (${translateNationality(player.currentClubCountry) ?? player.currentClubCountry})`}
          </p>
          <p className="mt-1 text-xs text-[#898781]">
            Lämnade {player.previousTeamName} ({player.leftYear}) — spelade senast dokumenterat för {player.mostRecentForeignClubName}
            {player.mostRecentForeignClubCountry && ` (${translateNationality(player.mostRecentForeignClubCountry) ?? player.mostRecentForeignClubCountry})`}
          </p>
        </div>
        <Link
          href={`/spelare/${player.playerId}`}
          className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#898781] transition-colors hover:text-white"
        >
          Allsvensk profil →
        </Link>
      </div>

      {/* Total — hela perioden EFTER Allsvenskan, aldrig Allsvensk statistik. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["⚽ Mål", player.goals],
          ["🎯 Assist", player.assists],
          ["👕 Matcher", player.appearances],
          ["⏱️ Minuter", player.minutesPlayed],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-white/10 bg-[#1a1a19] p-4 text-center">
            <p className="text-3xl font-semibold tabular-nums text-white">{value}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-[#898781]">{label as string}</p>
          </div>
        ))}
        {player.avgRating !== null && (
          <div className="col-span-2 rounded-xl border border-[#d9a526]/25 bg-[#d9a526]/[0.06] p-4 text-center sm:col-span-4">
            <p className="text-2xl font-semibold tabular-nums text-[#d9a526]">⭐ {player.avgRating}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-[#898781]">Snittbetyg efter Allsvenskan</p>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-[#5f5e59]">
        Total för hela perioden efter att {player.playerName} lämnade Allsvenskan — Allsvensk statistik räknas aldrig med.
      </p>

      {/*
        Fas 18j (2026-08-23) — spelarens placering i "Mest lyckad efter
        Allsvenskan" med FULL nedbrytning. Här visas komponenternas
        percentiler, till skillnad från listsidan där användaren uttryckligen
        inte ville se poängtal — men den sammanvägda totalpoängen visas ändå
        aldrig, bara placeringen och vad varje del faktiskt mätte.
      */}
      {success && (
        <div className="mt-8 rounded-xl border border-white/10 border-l-2 border-l-[#d9a526] bg-[#141418] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d9a526]">🏆 Mest lyckad efter Allsvenskan</p>
            <p className="text-xs text-[#898781]">
              Placering <span className="font-semibold tabular-nums text-white">#{success.rank}</span> av {ranked.length} rankade
            </p>
          </div>

          {success.highlights.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-[#c3c2b7]">
              {success.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <span className="text-[#d9a526]" aria-hidden>
                    ·
                  </span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-2.5 border-t border-white/5 pt-4">
            {success.components.map((c) => (
              <div key={c.key}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-semibold text-[#c3c2b7]">
                    {c.label} <span className="font-normal text-[#5f5e59]">· vikt {c.weight} %</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[#898781]">{Math.round(c.score)}/100</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-[#d9a526]/70" style={{ width: `${Math.max(1, Math.min(100, c.score))}%` }} />
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#7d7c76]">{c.detail}</p>
              </div>
            ))}
          </div>

          {success.coverage < 1 && (
            <p className="mt-3 text-[10px] leading-relaxed text-[#5f5e59]">
              {Math.round(success.coverage * 100)} % av modellens vikt täcks av verklig data för {player.playerName} — resterande komponenters vikt
              har fördelats ut på de som finns, aldrig räknats som noll.
            </p>
          )}
        </div>
      )}

      {/* Hela karriärresan — samma komponent som /spelare/[id], visar lån/
          permanenta övergångar och Allsvenskan-avgången i sammanhang. */}
      <div className="mt-8">
        <CareerJourneySection journey={journey} />
      </div>

      {/* Per klubb (bara Efter Allsvenskan-perioden — se filhuvudet) */}
      <div className="mt-8">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
          <span aria-hidden>🌍</span> Fördelning per klubb — Efter Allsvenskan
        </p>
        <div className="space-y-2">
          {player.byClub.map((c) => (
            <div key={c.teamName} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 p-4 sm:flex-nowrap">
              {c.teamLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
                <img src={c.teamLogoUrl} alt="" className="h-8 w-8 shrink-0 object-contain" />
              ) : (
                <div className="h-8 w-8 shrink-0 rounded-full bg-white/5" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{c.teamName}</p>
                {c.country && <p className="text-xs text-[#898781]">{translateNationality(c.country) ?? c.country}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-x-4 gap-y-1 text-right text-xs tabular-nums">
                <div>
                  <p className="font-semibold text-white">{c.goals}</p>
                  <p className="text-[10px] uppercase text-[#7d7c76]">Mål</p>
                </div>
                <div>
                  <p className="font-semibold text-white">{c.assists}</p>
                  <p className="text-[10px] uppercase text-[#7d7c76]">Assist</p>
                </div>
                <div>
                  <p className="font-semibold text-white">{c.minutesPlayed}</p>
                  <p className="text-[10px] uppercase text-[#7d7c76]">Min</p>
                </div>
                <div>
                  <p className="font-semibold text-white">{c.appearances}</p>
                  <p className="text-[10px] uppercase text-[#7d7c76]">Matcher</p>
                </div>
                {c.avgRating !== null && (
                  <div>
                    <p className="font-semibold text-[#d9a526]">{c.avgRating}</p>
                    <p className="text-[10px] uppercase text-[#7d7c76]">Betyg</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-6 text-[10px] text-[#5f5e59]">
        Bygger på dokumenterad matchstatistik per klubb/säsong (api-football) — kan vara ofullständig för äldre eller mindre
        väldokumenterade perioder.
      </p>
    </div>
  );
}
