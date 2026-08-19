// "form" = statusfärger (good/critical, samma som FormBadges.tsx) — rätt när
// vinst/förlust är bra/dåligt ur ETT lags perspektiv (säsongsform).
// "teams" = samma blå/orange lag-konvention som TeamCompareBars/PlayerCompareRadar
// — rätt för inbördes möten, där "vinst" bara betyder "lag A" respektive "lag B",
// inte bra/dåligt.
const PALETTES = {
  form: { wins: "#0ca30c", draws: "#52514e", losses: "#d03b3b" },
  teams: { wins: "#3987e5", draws: "#52514e", losses: "#d95926" },
} as const;

/**
 * Segmenterad V/O/F-stapel — bredden på varje segment är proportionell mot
 * andelen av det totala antalet matcher.
 */
export function RecordBar({
  wins,
  draws,
  losses,
  labelPrefix,
  variant = "form",
}: {
  wins: number;
  draws: number;
  losses: number;
  labelPrefix?: string;
  variant?: "form" | "teams";
}) {
  const total = wins + draws + losses;
  if (total === 0) {
    return <p className="text-xs text-[#898781]">Ingen data</p>;
  }

  const colors = PALETTES[variant];
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div>
      {labelPrefix && (
        <p className="mb-1 text-xs text-[#898781]">
          {labelPrefix}: {wins}V {draws}O {losses}F
        </p>
      )}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/5">
        {wins > 0 && <div style={{ width: pct(wins), backgroundColor: colors.wins }} title={`${wins} vinster`} />}
        {draws > 0 && (
          <div style={{ width: pct(draws), backgroundColor: colors.draws }} title={`${draws} oavgjorda`} />
        )}
        {losses > 0 && (
          <div style={{ width: pct(losses), backgroundColor: colors.losses }} title={`${losses} förluster`} />
        )}
      </div>
    </div>
  );
}
