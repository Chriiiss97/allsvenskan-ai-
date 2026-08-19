// Statuspalett (good/critical) från dataviz-skillens referenspalett — draw
// är neutral (grå), inte en status.
const COLORS: Record<"W" | "D" | "L", string> = {
  W: "bg-[#0ca30c] text-white",
  D: "bg-[#52514e] text-white",
  L: "bg-[#d03b3b] text-white",
};

/** Rad av V/O/F-pillar för "senaste 5"-form. */
export function FormBadges({ form }: { form: Array<"W" | "D" | "L"> }) {
  if (form.length === 0) {
    return <span className="text-xs text-[#898781]">Ingen data</span>;
  }
  return (
    <div className="flex gap-1">
      {form.map((result, i) => (
        <span
          key={i}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${COLORS[result]}`}
        >
          {result === "W" ? "V" : result === "D" ? "O" : "F"}
        </span>
      ))}
    </div>
  );
}
