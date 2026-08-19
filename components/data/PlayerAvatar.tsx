// Kategorisk slot 1 (blå) / slot 2 (orange) från dataviz-skillens palett —
// samma konvention som PlayerCompareRadar/RecordBar, inte hårdkodade
// klubbfärger, så komponenten håller om fler lag läggs till senare.
const ACCENTS = ["#3987e5", "#d95926"] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Initial-baserad avatar med lagfärgad bakgrund — ersätter <img>-taggar mot
 * externa spelarfoton som ofta saknas/är trasiga för mindre kända spelare.
 * `teamIndex` väljer accentfärg (0 eller 1), matchar ordningen lagen
 * presenteras i (t.ex. IFK=0/AIK=1 i en jämförelse).
 */
export function PlayerAvatar({
  name,
  teamIndex = 0,
  size = 40,
}: {
  name: string;
  teamIndex?: 0 | 1;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: ACCENTS[teamIndex],
        fontSize: size * 0.36,
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
