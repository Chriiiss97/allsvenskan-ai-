import Link from "next/link";
import type { ReactNode } from "react";
import { getCachedIncomingTransfers } from "@/lib/football/cached-reads";
import {
  aggregateByClub,
  aggregateByCountry,
  aggregateByLeague,
  computeIncomingInsights,
  MAX_ARRIVAL_DELAY_SEASONS,
  MIN_LEAGUE_SIGNINGS,
  MIN_MINUTES_FOR_RATE,
  type IncomingSigning,
} from "@/lib/football/incoming-transfers";
import { getLeagueStrength, LEVEL_LABEL } from "@/lib/football/post-allsvenskan-level";
import { countryKey, translateClubCountry, translatePosition, translateTransferType } from "@/lib/i18n/sv";
import { PlayerAvatar } from "@/components/data/PlayerAvatar";
import { TransferDirectionTabs } from "@/components/scout/TransferDirectionTabs";
import { YearBars } from "@/components/scout/YearBars";

/**
 * Fas 22 (2026-08-23, användarkrav) — "Värvningar till Allsvenskan".
 * Spegelbilden av Efter Allsvenskan, och medvetet byggd med SAMMA
 * gränssnittsgrammatik: riktningsväxlare överst (kategorin "Värvningar"),
 * vyväxlare Spelare/Scoutanalys, sorterbar lista med markerad kolumn,
 * fönstrad rendering med "Visa fler", och en öppen "Så räknas det"-ruta.
 *
 * Datan kommer från lib/football/incoming-transfers.ts — läs den filens
 * huvud för hela kvalificeringskedjan och mätningen som gjordes INNAN
 * sidan byggdes (12 022 transferrader → 817 verifierade värvningar).
 *
 * Sidan hittar aldrig på något: varje siffra nedan är summerad allsvensk
 * matchstatistik för spelaren I DEN KLUBB som värvade hen, från och med
 * ankomstsäsongen. Saknas underlag visas "—", aldrig en nolla.
 */

type SortKey = "points" | "goals" | "assists" | "avgRating" | "pointsPer90" | "minutesPlayed" | "appearances";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "points", label: "🏆 Mest poäng" },
  { key: "goals", label: "Flest mål" },
  { key: "assists", label: "Flest assist" },
  { key: "avgRating", label: "Högst snittbetyg" },
  { key: "pointsPer90", label: "Bäst poäng/90" },
  { key: "minutesPlayed", label: "Mest speltid" },
  { key: "appearances", label: "Flest matcher" },
];

type Origin = "alla" | "nya" | "atervandare";
const ORIGIN_OPTIONS: { key: Origin; label: string }[] = [
  { key: "alla", label: "Alla" },
  { key: "nya", label: "Nya i Allsvenskan" },
  { key: "atervandare", label: "Återvändare" },
];

/**
 * Alla värvningar här kommer från en utländsk klubb. Skillnaden är om
 * spelaren varit i Allsvenskan NÅGON gång tidigare — Isaac Kiese Thelin kom
 * från Anderlecht 2020, men hade spelat för IFK Norrköping och Malmö FF före
 * utlandsflytten, och är alltså en återvändare.
 */
const ORIGIN_HINT: Record<Origin, string> = {
  alla: "Alla värvningar från en utländsk klubb — både spelare som är nya i Allsvenskan och de som varit här förut.",
  nya: "Spelare vars första allsvenska klubb var den här värvningen — de hade aldrig spelat i Allsvenskan tidigare.",
  atervandare: "Spelare som varit i Allsvenskan förut, lämnat landet och sedan värvats hit igen.",
};

type View = "spelare" | "analys";

/** Samma fönsterstorlek som Efter Allsvenskan — se den sidans prestandanot. */
const PAGE_SIZE = 60;

/** Tusentalsavgränsare med mellanslag ("1 816 044"), enligt projektets talformat. */
const nf = (n: number) => n.toLocaleString("sv-SE");
const dec = (n: number, digits = 2) => n.toLocaleString("sv-SE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function isSort(value: string | undefined): value is SortKey {
  return SORT_OPTIONS.some((o) => o.key === value);
}
function isOrigin(value: string | undefined): value is Origin {
  return ORIGIN_OPTIONS.some((o) => o.key === value);
}

/** Samma kortform som Efter Allsvenskan-analysen, så kategorin läser som en produkt. */
function AnalysisCard({
  label,
  hint,
  tone = "default",
  children,
  footnote,
}: {
  label: string;
  hint?: string;
  tone?: "default" | "hero";
  children: ReactNode;
  footnote?: string;
}) {
  const hero = tone === "hero";
  return (
    <section
      className={`rounded-2xl border bg-[#141418]/60 ${
        hero ? "border-[#a78bfa]/30 bg-gradient-to-br from-[#a78bfa]/[0.07] to-transparent p-5 sm:p-6" : "border-white/8 p-4 sm:p-5"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className={`font-semibold ${hero ? "text-base text-white" : "text-[13px] uppercase tracking-wide text-[#a78bfa]"}`}>{label}</h2>
        {hint && <p className="text-xs text-[#7d7c76]">{hint}</p>}
      </div>
      <div className={hero ? "mt-3" : "mt-3"}>{children}</div>
      {footnote && <p className="mt-3 border-t border-white/5 pt-2.5 text-[11px] leading-relaxed text-[#5f5e59]">{footnote}</p>}
    </section>
  );
}

/**
 * Ursprunget på TVÅ rader — vem som värvade vem, och varifrån. Samma
 * lärdom som Efter Allsvenskan drog i fas 19b: pressas hela historiken in
 * i en rad klipps den mitt i klubbnamnet på vanliga skärmbredder, och då
 * är det just den avgörande uppgiften (vilken liga spelaren kom från) som
 * försvinner.
 */
function OriginLines({ signing }: { signing: IncomingSigning }) {
  const country = translateClubCountry(signing.fromCountry) ?? signing.fromCountry;
  return (
    <>
      <p className="mt-0.5 truncate text-xs text-[#898781]">
        <span className="text-[#c3c2b7]">{signing.clubName}</span> värvade från{" "}
        <span className="text-[#c3c2b7]">{signing.fromClubName}</span>
      </p>
      <p className="mt-0.5 truncate text-[11px] text-[#7d7c76]">
        {/* Ligan kan saknas även när landet är verifierat (se
            incoming-transfers.ts) — då skrivs den inte ut alls, hellre än
            som "Okänd liga". */}
        {country}
        {signing.fromLeagueName ? ` · ${signing.fromLeagueName}` : ""} · {signing.transferYear}
      </p>
    </>
  );
}

export default async function IncomingTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; klubb?: string; land?: string; ursprung?: string; vy?: string; antal?: string }>;
}) {
  const { sort: sortParam, klubb, land, ursprung, vy, antal } = await searchParams;
  const sort: SortKey = isSort(sortParam) ? sortParam : "points";
  const origin: Origin = isOrigin(ursprung) ? ursprung : "alla";
  const view: View = vy === "analys" ? "analys" : "spelare";

  const signings = await getCachedIncomingTransfers();
  const insights = computeIncomingInsights(signings);
  const clubs = aggregateByClub(signings);
  const countries = aggregateByCountry(signings);
  const leagues = aggregateByLeague(signings);
  const maxYear = Math.max(1, ...insights.byYear.map((y) => y.signings));
  const maxCountry = Math.max(1, ...countries.slice(0, 10).map((c) => c.signings));

  const clubFilter = klubb ? clubs.find((c) => c.key === klubb) ?? null : null;
  const countryFilter = land ? countries.find((c) => c.key === land) ?? null : null;

  let filtered = signings;
  if (clubFilter) filtered = filtered.filter((s) => String(s.clubId) === clubFilter.key);
  // Jämför på landsNYCKELN, inte på etiketten: api-football stavar samma
  // land olika mellan endpoints ("Saudi-Arabia"/"Saudi Arabia"), och
  // countryKey är redan projektets gemensamma normalisering.
  if (countryFilter) filtered = filtered.filter((s) => countryKey(s.fromCountry) === countryFilter.key);
  if (origin === "nya") filtered = filtered.filter((s) => !s.isReturnee);
  if (origin === "atervandare") filtered = filtered.filter((s) => s.isReturnee);

  /**
   * Värden som kan SAKNAS (betyg, poäng/90 under speltidsgränsen) sorteras
   * alltid sist — aldrig utblandade bland de lägsta värdena, vilket hade
   * fått "för tunt underlag" att se ut som "presterade dåligt".
   */
  const sortValue: Record<SortKey, (s: IncomingSigning) => number | null> = {
    points: (s) => s.points,
    goals: (s) => s.goals,
    assists: (s) => s.assists,
    avgRating: (s) => s.avgRating,
    pointsPer90: (s) => s.pointsPer90,
    minutesPlayed: (s) => s.minutesPlayed,
    appearances: (s) => s.appearances,
  };
  const sorted = [...filtered].sort((a, b) => {
    const va = sortValue[sort](a);
    const vb = sortValue[sort](b);
    if (va === null && vb === null) return b.appearances - a.appearances;
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va || b.appearances - a.appearances;
  });

  const requestedLimit = Number(antal);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, sorted.length) : PAGE_SIZE;
  const visible = sorted.slice(0, limit);
  const remaining = sorted.length - visible.length;

  /** Behåller allt man inte uttryckligen ändrar — `antal` nollställs vid varje byte. */
  const hrefFor = (next: { sort?: SortKey; klubb?: string | null; land?: string | null; origin?: Origin; view?: View; limit?: number }) => {
    const params = new URLSearchParams();
    if ((next.sort ?? sort) !== "points") params.set("sort", next.sort ?? sort);
    const club = next.klubb === undefined ? clubFilter?.key ?? null : next.klubb;
    if (club) params.set("klubb", club);
    const country = next.land === undefined ? countryFilter?.key ?? null : next.land;
    if (country) params.set("land", country);
    if ((next.origin ?? origin) !== "alla") params.set("ursprung", next.origin ?? origin);
    if ((next.view ?? view) === "analys") params.set("vy", "analys");
    if (next.limit) params.set("antal", String(next.limit));
    const qs = params.toString();
    return qs ? `/scout/varvningar?${qs}` : "/scout/varvningar";
  };

  const statColumns: { key: SortKey; label: string; value: (s: IncomingSigning) => string }[] = [
    { key: "points", label: "Poäng", value: (s) => nf(s.points) },
    { key: "goals", label: "Mål", value: (s) => nf(s.goals) },
    { key: "assists", label: "Assist", value: (s) => nf(s.assists) },
    { key: "appearances", label: "Matcher", value: (s) => nf(s.appearances) },
    // Speltiden hade en sorteringsknapp men ingen kolumn, och skrevs i stället
    // ut i klartext på metaraden när man sorterade på den — man kunde alltså
    // inte JÄMFÖRA minuter mellan spelare utan att först sortera om.
    { key: "minutesPlayed", label: "Minuter", value: (s) => nf(s.minutesPlayed) },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">Scout Network · Värvningar</p>
      <TransferDirectionTabs active="in" />
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Värvningar till Allsvenskan</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#898781]">
        <span className="font-semibold text-white">{nf(insights.totalSignings)} värvningar</span> där vi kan bevisa hela kedjan: en dokumenterad
        övergång från en <span className="text-[#c3c2b7]">utländsk klubb</span> till en allsvensk, och allsvenskt spel för den klubben efteråt.
        {insights.firstYear && insights.lastYear && ` ${insights.firstYear}–${insights.lastYear}.`} Inga gissningar, ingen &quot;har spelat
        utomlands någon gång&quot;.
      </p>

      {/* Vyväxlare — samma form som Efter Allsvenskan. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="inline-flex rounded-lg border border-white/10 bg-[#141418] p-0.5">
          {([
            { key: "spelare", label: "🚀 Värvningar" },
            { key: "analys", label: "📊 Scoutanalys" },
          ] as const).map((v) => (
            <Link
              key={v.key}
              href={hrefFor({ view: v.key })}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                view === v.key ? "bg-white text-black" : "text-[#898781] hover:text-white"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-[#5f5e59]">
          {view === "spelare" ? "Alla värvningar, sorterbara." : "Klubbar, länder och ligor — vem värvar bäst, och varifrån?"}
        </p>
      </div>

      {view === "analys" && (
        <div className="mt-6 space-y-4">
          <AnalysisCard label="Värvningarna i korthet" tone="hero">
            <div className="space-y-2.5 text-[15px] leading-relaxed text-[#c3c2b7]">
              {insights.bestSigning && (
                <p>
                  <Link href={`/scout/spelare/${insights.bestSigning.playerId}`} className="font-semibold text-white hover:underline">
                    {insights.bestSigning.playerName}
                  </Link>{" "}
                  är den mest produktiva utlandsvärvningen i underlaget —{" "}
                  <span className="font-semibold text-white">
                    {nf(insights.bestSigning.points)} poäng ({nf(insights.bestSigning.goals)} mål, {nf(insights.bestSigning.assists)} assist)
                  </span>{" "}
                  för {insights.bestSigning.clubName} efter flytten från {insights.bestSigning.fromClubName}.
                </p>
              )}
              {insights.topClub && (
                <p>
                  <span className="font-semibold text-white">{insights.topClub.label}</span> värvar mest utomlands —{" "}
                  <span className="font-semibold text-white">{nf(insights.topClub.signings)} värvningar</span> som tillsammans gjort{" "}
                  {nf(insights.topClub.points)} poäng i Allsvenskan.
                </p>
              )}
              {insights.topLeague && (
                <p>
                  Den enskilt vanligaste avsändarligan är{" "}
                  <span className="font-semibold text-white">
                    {insights.topLeague.label} ({translateClubCountry(insights.topLeague.country) ?? insights.topLeague.country})
                  </span>{" "}
                  med {nf(insights.topLeague.signings)} värvningar.
                </p>
              )}
              {insights.mostEffectiveLeague && insights.mostEffectiveLeague.pointsPer90 != null && (
                <p>
                  Störst utdelning per spelad minut kommer från{" "}
                  <span className="font-semibold text-white">
                    {insights.mostEffectiveLeague.label} (
                    {translateClubCountry(insights.mostEffectiveLeague.country) ?? insights.mostEffectiveLeague.country})
                  </span>{" "}
                  — <span className="font-semibold text-white">{dec(insights.mostEffectiveLeague.pointsPer90, 2)} poäng per 90 minuter</span> över{" "}
                  {nf(insights.mostEffectiveLeague.signings)} värvningar.
                </p>
              )}
              <p>
                {nf(insights.newcomers)} av värvningarna var spelarens <span className="text-white">första</span> allsvenska klubb;{" "}
                {nf(insights.returnees)} var återvändare med allsvenskt spel sedan tidigare.
              </p>
            </div>
          </AnalysisCard>

          {/* Klubbarna — enligt användaren den mest intressanta analysen. */}
          <AnalysisCard
            label="🏟️ Vilka klubbar värvar bäst från utlandet?"
            hint="Klicka på en klubb för att se dess värvningar"
            footnote={`Poäng = mål + assist i Allsvenskan för den värvande klubben, från ankomstsäsongen och framåt. Poäng/90 visas bara för klubbar med minst ${nf(MIN_MINUTES_FOR_RATE)} samlade minuter.`}
          >
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#7d7c76]">
                    <th className="px-1 pb-2 font-medium">Klubb</th>
                    <th className="px-1 pb-2 text-right font-medium">Värvningar</th>
                    <th className="px-1 pb-2 text-right font-medium">Matcher</th>
                    <th className="px-1 pb-2 text-right font-medium">Mål</th>
                    <th className="px-1 pb-2 text-right font-medium">Assist</th>
                    <th className="px-1 pb-2 text-right font-medium">Poäng</th>
                    <th className="px-1 pb-2 text-right font-medium">Poäng/90</th>
                  </tr>
                </thead>
                <tbody>
                  {clubs.map((club) => (
                    <tr key={club.key} className="border-t border-white/5 transition-colors hover:bg-white/[.03]">
                      <td className="px-1 py-2">
                        <Link href={hrefFor({ klubb: club.key, view: "spelare" })} className="flex items-center gap-2 font-medium text-white hover:underline">
                          {club.logoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element -- extern klubblogga
                            <img src={club.logoUrl} alt="" className="h-5 w-5 shrink-0 object-contain" />
                          )}
                          <span className="truncate">{club.label}</span>
                        </Link>
                        {club.best && <p className="mt-0.5 truncate text-[11px] text-[#5f5e59]">Bäst: {club.best.playerName} ({nf(club.best.points)} p)</p>}
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums text-[#c3c2b7]">{nf(club.signings)}</td>
                      <td className="px-1 py-2 text-right tabular-nums text-[#898781]">{nf(club.appearances)}</td>
                      <td className="px-1 py-2 text-right tabular-nums text-[#c3c2b7]">{nf(club.goals)}</td>
                      <td className="px-1 py-2 text-right tabular-nums text-[#c3c2b7]">{nf(club.assists)}</td>
                      <td className="px-1 py-2 text-right font-semibold tabular-nums text-white">{nf(club.points)}</td>
                      <td className="px-1 py-2 text-right tabular-nums text-[#a78bfa]">{club.pointsPer90 != null ? dec(club.pointsPer90, 2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AnalysisCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <AnalysisCard label="🌍 Bästa värvningsländer" hint="Klicka för att filtrera listan">
              <div className="space-y-1.5">
                {countries.slice(0, 10).map((country) => (
                  <Link
                    key={country.key}
                    href={hrefFor({ land: country.key, view: "spelare" })}
                    className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[.04]"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-white">
                        {translateClubCountry(country.country) ?? country.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-[#898781]">
                        {nf(country.signings)} värvningar · {nf(country.goals)} mål · {nf(country.assists)} assist
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-[#a78bfa]/70" style={{ width: `${Math.round((country.signings / maxCountry) * 100)}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
            </AnalysisCard>

            <AnalysisCard
              label="🏆 Bästa värvningsligorna"
              hint={`Minst ${MIN_LEAGUE_SIGNINGS} värvningar`}
              footnote="Sorterat på poäng per 90 spelade minuter i Allsvenskan — hur mycket klubbarna faktiskt fått ut per minut de köpt från ligan, inte hur många spelare som hämtats därifrån."
            >
              <div className="space-y-1.5">
                {leagues
                  .filter((l) => l.signings >= MIN_LEAGUE_SIGNINGS && l.pointsPer90 != null)
                  .sort((a, b) => b.pointsPer90! - a.pointsPer90!)
                  .slice(0, 10)
                  .map((league) => (
                    <div key={league.key} className="flex items-baseline justify-between gap-2 px-2 py-1.5 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-white">{league.label}</span>{" "}
                        <span className="text-[11px] text-[#7d7c76]">{translateClubCountry(league.country) ?? league.country}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[#898781]">
                        <span className="font-semibold text-[#a78bfa]">{dec(league.pointsPer90!, 2)}</span> p/90 · {nf(league.signings)} st
                      </span>
                    </div>
                  ))}
              </div>
            </AnalysisCard>
          </div>

          <AnalysisCard
            label="🌐 Vanligaste avsändarligorna"
            hint="Antal värvningar per liga"
            footnote="Per LIGA, inte per land — skillnaden är avgörande: Norge levererar både Eliteserien och 1. Division, och England spänner från Premier League till Championship."
          >
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#7d7c76]">
                    <th className="px-1 pb-2 font-medium">Liga</th>
                    <th className="px-1 pb-2 font-medium">Nivå</th>
                    <th className="px-1 pb-2 text-right font-medium">Värvningar</th>
                    <th className="px-1 pb-2 text-right font-medium">Poäng</th>
                    <th className="px-1 pb-2 text-right font-medium">Snittbetyg</th>
                  </tr>
                </thead>
                <tbody>
                  {leagues.slice(0, 15).map((league) => {
                    // Alla rader i gruppen delar liga — nyckeln ÄR liga-id:t.
                    const strength = getLeagueStrength(Number(league.key));
                    return (
                      <tr key={league.key} className="border-t border-white/5">
                        <td className="px-1 py-2">
                          <span className="font-medium text-white">{league.label}</span>{" "}
                          <span className="text-[11px] text-[#7d7c76]">{translateClubCountry(league.country) ?? league.country}</span>
                        </td>
                        {/* LEVEL_LABEL är formulerad för att sitta i en mening ("spelade i en
                            stark nationell liga") — i en tabellcell behöver den versal. */}
                        <td className="px-1 py-2 text-[11px] text-[#898781] first-letter:uppercase">{strength ? LEVEL_LABEL[strength] : "—"}</td>
                        <td className="px-1 py-2 text-right tabular-nums text-[#c3c2b7]">{nf(league.signings)}</td>
                        <td className="px-1 py-2 text-right font-semibold tabular-nums text-white">{nf(league.points)}</td>
                        <td className="px-1 py-2 text-right tabular-nums text-[#d9a526]">{league.avgRating != null ? dec(league.avgRating, 2) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </AnalysisCard>

          {insights.byYear.length > 1 && (
            <AnalysisCard
              label="📈 Värvningskurvan"
              hint="Antal verifierade utlandsvärvningar per övergångsår."
              footnote="Innevarande år är ofullständigt — säsongen pågår, och sena övergångar hinner varken spelas eller importeras."
            >
              <YearBars rows={insights.byYear.map((y) => ({ year: y.year, count: y.signings }))} max={maxYear} unit="värvningar" />
            </AnalysisCard>
          )}

          <AnalysisCard label="Så räknas det">
            <ul className="space-y-2 text-[13px] leading-relaxed text-[#898781]">
              <li>
                <span className="font-semibold text-white">Dokumenterad övergång.</span> En verklig transferhändelse där destinationen är en
                allsvensk klubb — aldrig härlett ur att spelaren råkar ha utländsk statistik.
              </li>
              <li>
                <span className="font-semibold text-white">Verifierat utländsk avsändare.</span> Avsändarklubbens land slås upp per klubb ur
                api-footballs egen lagdata — inte gissat ur klubbnamnet. Går landet inte att verifiera räknas övergången inte alls. Svenska
                avsändare exkluderas, vilket också stänger dörren för &quot;utlandet → Superettan → Allsvenskan&quot;. Vilken LIGA klubben
                spelade i är analysdata och får saknas; de värvningarna räknas överallt utom i ligarankingen.
              </li>
              <li>
                <span className="font-semibold text-white">Ny eller återvändare.</span> &quot;Återvändare&quot; betyder att spelaren bevisligen
                var i Allsvenskan redan före övergången — antingen genom allsvenska matcher hos oss, eller genom ett dokumenterat klubbyte
                till eller från en allsvensk klubb tidigare. Övriga räknas som nya i Allsvenskan.{" "}
                <span className="text-[#c3c2b7]">
                  Siffran efter etiketten (×2, ×3 …) är hur många gånger spelaren kommit tillbaka under hela karriären. Den räknas ur
                  spelarens övergångar i kronologisk ordning: en ny sejour börjar varje gång han flyttar till en allsvensk klubb efter att ha
                  varit borta. Ett lån som följs av en permanent övergång till samma klubb är därför EN ankomst, inte två, och klubbyte inom
                  ligan räknas inte som en återkomst.
                </span>
              </li>
              <li>
                <span className="font-semibold text-white">Spelade faktiskt.</span> Spelaren har allsvenskt spel för den värvande klubben efter
                övergången — annars finns inget utfall att bedöma.
              </li>
              <li>
                <span className="font-semibold text-white">Direkt ankomst.</span> Första allsvenska säsongen ska vara övergångsåret eller senast{" "}
                {MAX_ARRIVAL_DELAY_SEASONS} år senare.
              </li>
              <li>
                <span className="font-semibold text-white">Pensionerad.</span> Varken api-football eller Sportmonks har någon pensionsflagga —
                märkningen bygger därför på frånvaro, och kräver tre saker samtidigt: ingen registrerad säsong i api-football (som ser alla
                ligor, inte bara de vi importerar) på två hela säsonger, och att spelaren fyllt 30. Räcker underlaget inte till står det
                ingenting alls.
              </li>
              <li>
                <span className="font-semibold text-white">Takt-mått.</span> Poäng/90 och snittbetyg kräver minst {nf(MIN_MINUTES_FOR_RATE)}{" "}
                spelade minuter respektive minst en betygsatt säsong. Saknas underlag visas &quot;—&quot;, aldrig en nolla.
              </li>
            </ul>
          </AnalysisCard>
        </div>
      )}

      {view === "spelare" && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[11px] uppercase tracking-wide text-[#7d7c76]">Sortera</span>
            {SORT_OPTIONS.map((o) => (
              <Link
                key={o.key}
                href={hrefFor({ sort: o.key })}
                aria-current={sort === o.key ? "true" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  sort === o.key ? "bg-white text-black" : "bg-white/5 text-[#898781] hover:text-white"
                }`}
              >
                {o.label}
              </Link>
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[11px] uppercase tracking-wide text-[#7d7c76]">Ursprung</span>
            {ORIGIN_OPTIONS.map((o) => (
              <Link
                key={o.key}
                href={hrefFor({ origin: o.key })}
                aria-current={origin === o.key ? "true" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  origin === o.key ? "bg-[#a78bfa] text-black" : "bg-white/5 text-[#898781] hover:text-white"
                }`}
              >
                {o.label}
              </Link>
            ))}
          </div>

          {/* Fas 22b (2026-08-23, användarfråga: "vad betyder nya i Allsvenskan
              och återvändare?") — etiketterna förklarade sig inte själva.
              Meningen byts med valet, så den beskriver det man faktiskt ser. */}
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#5f5e59]">{ORIGIN_HINT[origin]}</p>

          {(clubFilter || countryFilter) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#a78bfa]/25 bg-[#a78bfa]/[0.06] px-3 py-2 text-xs">
              <span className="text-[#c3c2b7]">
                Filtrerat på{" "}
                <span className="font-semibold text-white">
                  {clubFilter?.label}
                  {clubFilter && countryFilter ? " · " : ""}
                  {countryFilter ? translateClubCountry(countryFilter.country) ?? countryFilter.label : ""}
                </span>{" "}
                · {nf(sorted.length)} värvningar
              </span>
              <Link href={hrefFor({ klubb: null, land: null })} className="font-semibold text-[#a78bfa] hover:underline">
                Rensa filter
              </Link>
            </div>
          )}

          <div className="mt-4">
            {sorted.length === 0 ? (
              <p className="rounded-xl border border-white/10 p-6 text-center text-sm text-[#898781]">Ingen matchande värvning hittad.</p>
            ) : (
              <div className="space-y-1.5">
                {visible.map((s) => (
                  <Link
                    key={`${s.playerId}-${s.clubId}`}
                    href={`/scout/spelare/${s.playerId}`}
                    className="group flex items-center gap-3 rounded-xl border border-white/5 bg-[#141418]/40 p-3 transition-colors hover:border-white/15 hover:bg-white/[.03] sm:gap-4 sm:p-4"
                  >
                    <PlayerAvatar name={s.playerName} size={44} photoUrl={s.photoUrl} teamExternalId={s.clubExternalId ?? undefined} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-semibold text-white group-hover:underline">{s.playerName}</p>
                        {s.isReturnee ? (
                          // Fas 22d — siffran är antalet gånger spelaren KOMMIT TILLBAKA
                          // till Allsvenskan under hela karriären, inte antalet klubbar
                          // eller utlandsflyttar. En del har pendlat fram och tillbaka
                          // flera gånger; "Återvändare" ensamt dolde det.
                          <span
                            title={`Har återvänt till Allsvenskan ${s.returnCount} ${s.returnCount === 1 ? "gång" : "gånger"}`}
                            className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#c3c2b7]"
                          >
                            🔁 Återvändare <span className="tabular-nums text-white">×{s.returnCount}</span>
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-[#0ca30c]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#0ca30c]">
                            ✨ Ny i Allsvenskan
                          </span>
                        )}
                        {/* Fas 22c — "Pensionerad" står först: har karriären tagit
                            slut är det den viktigaste upplysningen om spelaren. */}
                        {s.activity.status === "retired" && (
                          <span className="shrink-0 rounded-full bg-[#d9a526]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#d9a526]">
                            🏁 Pensionerad
                          </span>
                        )}
                        {s.fromLeagueTier === 1 && (
                          <span className="shrink-0 rounded-full bg-[#a78bfa]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#a78bfa]">
                            Från högsta ligan
                          </span>
                        )}
                      </div>
                      <OriginLines signing={s} />
                      <p className="mt-0.5 truncate text-[11px] text-[#5f5e59]">
                        {s.arrivalSeason === s.lastSeason ? `Säsong ${s.arrivalSeason}` : `${s.arrivalSeason}–${s.lastSeason}`}
                        {translatePosition(s.position) ? ` · ${translatePosition(s.position)}` : ""}
                        {translateTransferType(s.transferType) ? ` · ${translateTransferType(s.transferType)}` : ""}
                        {/* Sorteringens eget mått skrivs ut när det INTE har en egen kolumn.
                            Minuter har numera en kolumn och står därför inte här. */}
                        {sort === "pointsPer90" && s.pointsPer90 != null ? ` · ${dec(s.pointsPer90, 2)} poäng/90` : ""}
                      </p>
                    </div>

                    <div className="hidden shrink-0 items-center gap-1 sm:flex">
                      {statColumns.map((col) => {
                        const active = col.key === sort;
                        return (
                          <div
                            key={col.label}
                            className={`w-[4.25rem] rounded-lg py-1.5 text-center ${active ? "bg-white/[.06]" : ""} ${
                              // Kolumnerna viker undan i tur och ordning så att
                              // ursprungsraden aldrig klipps: Minuter först (nykomlingen,
                              // och den bredaste siffran), sedan Matcher. Den kolumn man
                              // sorterar på är alltid synlig — därför "Mest speltid" alltid
                              // syns när den är vald, oavsett skärmbredd.
                              !active && col.key === "minutesPlayed"
                                ? "hidden xl:block"
                                : !active && col.key === "appearances"
                                  ? "hidden lg:block"
                                  : ""
                            }`}
                          >
                            <p className={`text-sm font-semibold tabular-nums ${active ? "text-white" : "text-[#c3c2b7]"}`}>{col.value(s)}</p>
                            <p className={`text-[10px] uppercase tracking-wide ${active ? "text-[#a78bfa]" : "text-[#7d7c76]"}`}>{col.label}</p>
                          </div>
                        );
                      })}
                      <div className={`w-[3.5rem] rounded-lg py-1.5 text-center ${sort === "avgRating" ? "bg-white/[.06]" : ""}`}>
                        {s.avgRating != null ? (
                          <>
                            <p className="text-sm font-semibold tabular-nums text-[#d9a526]">{dec(s.avgRating, 2)}</p>
                            <p className={`text-[10px] uppercase tracking-wide ${sort === "avgRating" ? "text-[#a78bfa]" : "text-[#7d7c76]"}`}>Betyg</p>
                          </>
                        ) : (
                          <p className="text-xs text-[#3d3c39]">—</p>
                        )}
                      </div>
                    </div>

                    {/* Mobil: den sorterade siffran + betyg, resten ryms inte ändå. */}
                    <div className="flex shrink-0 items-center gap-3 text-right sm:hidden">
                      <div>
                        <p className="text-sm font-semibold tabular-nums text-white">
                          {sort === "avgRating"
                            ? s.avgRating != null
                              ? dec(s.avgRating, 2)
                              : "—"
                            : sort === "pointsPer90"
                              ? s.pointsPer90 != null
                                ? dec(s.pointsPer90, 2)
                                : "—"
                              : nf(sortValue[sort](s) ?? 0)}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-[#7d7c76]">
                          {SORT_OPTIONS.find((o) => o.key === sort)!.label.replace(/^[^\p{L}]+/u, "")}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {remaining > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href={hrefFor({ limit: limit + PAGE_SIZE })}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-[#c3c2b7] transition-colors hover:border-[#a78bfa]/40 hover:text-white"
                >
                  Visa {Math.min(PAGE_SIZE, remaining)} till
                </Link>
                <Link href={hrefFor({ limit: sorted.length })} className="px-2 py-2 text-xs text-[#7d7c76] transition-colors hover:text-white">
                  Visa alla {nf(sorted.length)}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
