import { colors } from "@/lib/design/tokens";

/**
 * Fas 19 — EN jämförelserad för både spelare och lag på /scout/compare.
 * Ersätter det tidigare paret PlayerCompareTable (platt 14-radig tabell utan
 * visuell viktning) + TeamCompareBars (staplar utan vinnarmarkering), som var
 * två olika visuella språk för exakt samma sak: "A mot B på ett mått".
 *
 * Formatet är en "fjärilsrad": siffrorna längst ut, etiketten i mitten,
 * och en stapel som växer utåt från mitten (längd = värdets MAGNITUD relativt
 * radens eget max, så negativa tal som målskillnad −5 ritas lika ärligt som
 * +5 — sitt tecken bär de i siffran). Ledaren får full färgstyrka + fetstil,
 * den andra dämpas — två kanaler, aldrig färg ensam.
 */

export interface CompareStat {
  label: string;
  a: number | null;
  b: number | null;
  /** T.ex. "%" eller " min" — utelämnas helt när värdet är null. */
  suffix?: string;
  /** Mål mot, gula/röda kort m.fl. — lägst värde är ledaren. */
  lowerIsBetter?: boolean;
  /** Ingen ledarmarkering alls (t.ex. "Matcher" — fler matcher är inte "bättre"). */
  neutral?: boolean;
  /** Decimaler i utskriften. Default: heltal om båda är heltal, annars 2. */
  decimals?: number;
}

function format(value: number | null, decimals: number | undefined, suffix: string | undefined): string {
  if (value === null) return "—";
  const d = decimals ?? (Number.isInteger(value) ? 0 : 2);
  return `${value.toFixed(d)}${suffix ?? ""}`;
}

function Row({ stat }: { stat: CompareStat }) {
  const { label, a, b, suffix, lowerIsBetter, neutral, decimals } = stat;
  const bothKnown = a !== null && b !== null;
  const aLeads = !neutral && bothKnown && (lowerIsBetter ? a! < b! : a! > b!);
  const bLeads = !neutral && bothKnown && (lowerIsBetter ? b! < a! : b! > a!);

  // Egen skala per rad — poäng, mål och betyg ligger i helt olika intervall.
  const max = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0)) || 1;
  const pctA = (Math.abs(a ?? 0) / max) * 100;
  const pctB = (Math.abs(b ?? 0) / max) * 100;

  return (
    <div className="py-2">
      <div className="flex items-baseline gap-3">
        <span
          className={`w-16 shrink-0 text-right text-sm tabular-nums ${aLeads ? "font-semibold" : ""}`}
          style={{ color: a === null ? colors.text.dim : aLeads ? colors.compare.a : colors.text.secondary }}
        >
          {format(a, decimals, suffix)}
        </span>
        <span className="flex-1 truncate text-center text-[11px] text-[#898781]">{label}</span>
        <span
          className={`w-16 shrink-0 text-sm tabular-nums ${bLeads ? "font-semibold" : ""}`}
          style={{ color: b === null ? colors.text.dim : bLeads ? colors.compare.b : colors.text.secondary }}
        >
          {format(b, decimals, suffix)}
        </span>
      </div>
      <div className="mt-1.5 flex h-1.5 items-center">
        <div className="flex h-full flex-1 justify-end">
          <div
            className="h-full rounded-l-full"
            style={{ width: `${pctA}%`, backgroundColor: colors.compare.a, opacity: bLeads ? 0.35 : 1 }}
          />
        </div>
        <div className="h-2.5 w-px shrink-0 bg-white/15" aria-hidden />
        <div className="flex h-full flex-1">
          <div
            className="h-full rounded-r-full"
            style={{ width: `${pctB}%`, backgroundColor: colors.compare.b, opacity: aLeads ? 0.35 : 1 }}
          />
        </div>
      </div>
    </div>
  );
}

/** En namngiven grupp jämförelserader (t.ex. "Anfall", "Försvar"). */
export function CompareStatGroup({ title, stats }: { title?: string; stats: CompareStat[] }) {
  return (
    <div>
      {title && (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7d7c76]">{title}</p>
      )}
      <div className="divide-y divide-white/5">
        {stats.map((stat) => (
          <Row key={stat.label} stat={stat} />
        ))}
      </div>
    </div>
  );
}

export function CompareStatRows({ stats }: { stats: CompareStat[] }) {
  return <CompareStatGroup stats={stats} />;
}
