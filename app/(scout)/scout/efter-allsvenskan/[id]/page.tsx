import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayersWhoLeftAllsvenskan, getAbroadTrophies } from "@/lib/football/post-allsvenskan";
import { computePostAllsvenskanSuccess } from "@/lib/football/post-allsvenskan-success";
import { getCareerJourney } from "@/lib/football/career-journey";
import { translateClubCountry } from "@/lib/i18n/sv";
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
 *
 * Fas 19b (2026-08-23, användarkrav "förbättra design och tydlighet") —
 * designgenomgång, ingen datalogik ändrad:
 *   1. SIFFERFORMAT. Minuter visades råa ("17431") både i totalrutorna och
 *      i klubbnedbrytningen, trots användarens uttryckliga önskemål om
 *      mellanslag som tusentalsavgränsare. Nu "17 431" (sv-SE) överallt.
 *   2. TOTALRUTORNA. Fyra rutor + EN spännande betygsruta gav en sned,
 *      tvåradig layout. Nu fem likvärdiga rutor på en rad (desktop).
 *   3. HEADERN. "Nuvarande klubb" och "Lämnade …" låg som två likadana
 *      textrader; nu är nuläget primärt och historiken sekundär.
 *   4. KLUBBNEDBRYTNINGEN. Radernas siffror trängdes ihop på mobil — nu
 *      ett eget raster som bryter snyggt istället för att radbrytas mitt i.
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

/** Tusentalsavgränsare med mellanslag, enligt användarens uttryckliga önskemål ("17 431", inte "17431"). */
const nf = (n: number) => n.toLocaleString("sv-SE");

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

  // Sekventiellt, inte i Promise.all ovan: trofégränsen ("efter Allsvenskan")
  // är spelarens `firstForeignYear`, som räknas fram i getPlayersWhoLeftAllsvenskan.
  const trophies = await getAbroadTrophies(supabase, player);

  const { ranked } = computePostAllsvenskanSuccess(allPlayers);
  const success = ranked.find((e) => e.player.playerId === playerId) ?? null;

  const statusMeta = STATUS_META[player.status];
  const statusColor = STATUS_COLOR[player.status];
  const isBackHome = player.status === "back_in_allsvenskan" || player.status === "back_in_sweden";

  const totals: { label: string; value: string; accent?: boolean }[] = [
    { label: "Mål", value: nf(player.goals) },
    { label: "Assist", value: nf(player.assists) },
    { label: "Matcher", value: nf(player.appearances) },
    { label: "Minuter", value: nf(player.minutesPlayed) },
    ...(player.avgRating !== null ? [{ label: "Snittbetyg", value: String(player.avgRating), accent: true }] : []),
  ];

  return (
    <div>
      <Link
        href="/scout/efter-allsvenskan"
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#898781] transition-colors hover:border-white/20 hover:text-white"
      >
        ← Efter Allsvenskan
      </Link>

      {/* Header — nuläget primärt, historiken sekundär (fas 19b). */}
      <div className="mt-4 rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        <div className="flex flex-wrap items-start gap-4">
          <PlayerAvatar name={player.playerName} size={64} photoUrl={player.photoUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-white">{player.playerName}</h1>
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ backgroundColor: `${statusColor}1f`, color: statusColor }}
              >
                {statusMeta.icon} {statusMeta.label}
              </span>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#c3c2b7]">
              {player.currentClubLogoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
                <img src={player.currentClubLogoUrl} alt="" className="h-5 w-5 object-contain" />
              )}
              <span>
                <span className="text-[#7d7c76]">{isBackHome ? "Spelar nu i" : "Senast dokumenterad klubb:"}</span>{" "}
                <span className="font-semibold text-white">{player.currentClubName}</span>
                {translateClubCountry(player.currentClubCountry) && ` · ${translateClubCountry(player.currentClubCountry)}`}
              </span>
            </p>
          </div>
          <Link
            href={`/spelare/${player.playerId}`}
            className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#898781] transition-colors hover:border-white/20 hover:text-white"
          >
            Allsvensk profil →
          </Link>
        </div>

        {/* Avgångsraden — den historiska ankarpunkten för allt nedanför. */}
        <p className="mt-4 border-t border-white/5 pt-3 text-xs leading-relaxed text-[#898781]">
          Lämnade <span className="font-medium text-[#c3c2b7]">{player.previousTeamName}</span> {player.leftYear} → spelade senast dokumenterat för{" "}
          <span className="font-medium text-[#c3c2b7]">{player.mostRecentForeignClubName}</span>
          {translateClubCountry(player.mostRecentForeignClubCountry) && ` (${translateClubCountry(player.mostRecentForeignClubCountry)})`}
          {player.departureCount > 1 && ` · har lämnat Allsvenskan ${player.departureCount} gånger`}
        </p>
      </div>

      {/* Total — hela perioden EFTER Allsvenskan, aldrig Allsvensk statistik. */}
      <div className="mt-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {totals.map((t) => (
            <div
              key={t.label}
              className={`rounded-xl border p-4 text-center ${t.accent ? "border-[#d9a526]/25 bg-[#d9a526]/[0.06]" : "border-white/10 bg-[#1a1a19]"}`}
            >
              <p className={`text-2xl font-semibold tabular-nums ${t.accent ? "text-[#d9a526]" : "text-white"}`}>{t.value}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-[#898781]">{t.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[#5f5e59]">
          Total för hela perioden efter att {player.playerName} lämnade Allsvenskan — Allsvensk statistik räknas aldrig med.
        </p>
      </div>

      {/*
        Fas 18l (2026-08-23, användarkrav) — listsidans "🏆 Mest dekorerad
        efter Allsvenskan" visar bara två titlar + "+N till"; klickade man på
        spelaren fanns ingenstans att se VAR resten kom ifrån. Här ligger HELA
        titellistan, grupperad per land, med samma två regler som listan
        (place === "Winner", country !== Sweden) så att antalet aldrig kan
        skilja sig åt. Klubben per titel är HÄRLEDD ur karriärdatan (trofédatan
        saknar klubbkoppling) och visas bara när den blir entydig — se
        getAbroadTrophies i lib/football/post-allsvenskan.ts.
      */}
      {trophies.total > 0 && (
        <section className="mt-8 rounded-xl border border-white/10 border-l-2 border-l-[#d9a526] bg-[#141418] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d9a526]">🏆 Titlar efter Allsvenskan</p>
            <p className="text-xs text-[#898781]">
              <span className="font-semibold tabular-nums text-white">{trophies.total}</span> {trophies.total === 1 ? "titel" : "titlar"} i{" "}
              {trophies.byCountry.length} {trophies.byCountry.length === 1 ? "land" : "länder"}
            </p>
          </div>

          <div className="mt-4 space-y-5">
            {trophies.byCountry.map((g) => (
              <div key={g.country ?? "okant"}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7d7c76]">
                  {translateClubCountry(g.country) ?? "Internationell tävling"} · {g.count} {g.count === 1 ? "titel" : "titlar"}
                </p>
                <ol className="mt-1.5">
                  {g.trophies.map((t, i) => (
                    <li
                      key={`${t.leagueName}-${t.season}-${i}`}
                      className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {t.clubLogoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
                          <img src={t.clubLogoUrl} alt="" className="h-6 w-6 shrink-0 object-contain" />
                        ) : (
                          <span className="shrink-0 text-base" aria-hidden>
                            🏆
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{t.leagueName}</p>
                          {t.clubName ? (
                            <p className="truncate text-[11px] text-[#7d7c76]">
                              med {t.clubName}
                              {t.clubMatch === "country" && <span className="text-[#5f5e59]"> †</span>}
                            </p>
                          ) : (
                            <p className="truncate text-[11px] text-[#5f5e59]">Klubb inte fastställd</p>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-[#898781]">{t.season}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <p className="mt-4 border-t border-white/5 pt-3 text-[10px] leading-relaxed text-[#5f5e59]">
            Bara vunna titlar (place: Winner) utanför Sverige — svenska titlar räknas aldrig som &quot;efter Allsvenskan&quot;. Trofédatan
            (api-football /trophies) innehåller ingen klubbkoppling, så klubben är härledd ur {player.playerName}s importerade karriärdata: samma
            land och samma säsong som titeln, och bara när exakt en klubb matchar.
            {trophies.byCountry.some((g) => g.trophies.some((t) => t.clubMatch === "country")) &&
              " † = härledd enbart på land (spelaren har bara en dokumenterad klubb där, men inte just den säsongen)."}
          </p>
        </section>
      )}

      {/*
        Fas 18j (2026-08-23) — spelarens placering i "Mest lyckad efter
        Allsvenskan" med FULL nedbrytning. Här visas komponenternas
        percentiler, till skillnad från listsidan där användaren uttryckligen
        inte ville se poängtal — men den sammanvägda totalpoängen visas ändå
        aldrig, bara placeringen och vad varje del faktiskt mätte.
      */}
      {success && (
        <section className="mt-8 rounded-xl border border-white/10 border-l-2 border-l-[#d9a526] bg-[#141418] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d9a526]">🏆 Mest lyckad efter Allsvenskan</p>
            <p className="text-xs text-[#898781]">
              Placering <span className="font-semibold tabular-nums text-white">#{success.rank}</span> av {nf(ranked.length)} rankade
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

          <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
            {success.components.map((c) => (
              <div key={c.key}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-semibold text-[#c3c2b7]">
                    {c.label} <span className="font-normal text-[#5f5e59]">· vikt {c.weight} %</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[#898781]">{Math.round(c.score)}/100</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-[#d9a526]/70" style={{ width: `${Math.max(1, Math.min(100, c.score))}%` }} />
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#7d7c76]">{c.detail}</p>
              </div>
            ))}
          </div>

          {success.coverage < 1 && (
            <p className="mt-3 border-t border-white/5 pt-3 text-[10px] leading-relaxed text-[#5f5e59]">
              {Math.round(success.coverage * 100)} % av modellens vikt täcks av verklig data för {player.playerName} — resterande komponenters vikt
              har fördelats ut på de som finns, aldrig räknats som noll.
            </p>
          )}
        </section>
      )}

      {/* Hela karriärresan — samma komponent som /spelare/[id], visar lån/
          permanenta övergångar och Allsvenskan-avgången i sammanhang. */}
      <div className="mt-8">
        <CareerJourneySection journey={journey} />
      </div>

      {/* Per klubb (bara Efter Allsvenskan-perioden — se filhuvudet) */}
      <section className="mt-8">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#898781]">
          <span aria-hidden>🌍</span> Fördelning per klubb
        </p>
        <p className="mb-3 text-xs text-[#5f5e59]">Var {player.playerName}s siffror ovan kommer ifrån — bara klubbar efter Allsvenskan.</p>
        <div className="space-y-2">
          {player.byClub.map((c) => (
            <div key={c.teamName} className="rounded-xl border border-white/5 bg-[#141418]/40 p-4">
              <div className="flex items-center gap-3">
                {c.teamLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- extern lagtröjbild
                  <img src={c.teamLogoUrl} alt="" className="h-8 w-8 shrink-0 object-contain" />
                ) : (
                  <div className="h-8 w-8 shrink-0 rounded-full bg-white/5" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{c.teamName}</p>
                  {translateClubCountry(c.country) && <p className="text-xs text-[#7d7c76]">{translateClubCountry(c.country)}</p>}
                </div>
              </div>
              {/* Fas 19b — eget raster istället för en flex-rad som radbröt
                  mitt i sifferkolumnerna på mobil. */}
              <div className="mt-3 grid grid-cols-4 gap-2 border-t border-white/5 pt-3 sm:grid-cols-5">
                {[
                  { label: "Mål", value: nf(c.goals), accent: false },
                  { label: "Assist", value: nf(c.assists), accent: false },
                  { label: "Matcher", value: nf(c.appearances), accent: false },
                  { label: "Minuter", value: nf(c.minutesPlayed), accent: false },
                  ...(c.avgRating !== null ? [{ label: "Betyg", value: String(c.avgRating), accent: true }] : []),
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className={`text-sm font-semibold tabular-nums ${s.accent ? "text-[#d9a526]" : "text-white"}`}>{s.value}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[#7d7c76]">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-6 text-[10px] leading-relaxed text-[#5f5e59]">
        Bygger på dokumenterad matchstatistik per klubb/säsong (api-football) — kan vara ofullständig för äldre eller mindre väldokumenterade
        perioder.
      </p>
    </div>
  );
}
