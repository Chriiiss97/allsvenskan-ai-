interface MatchEvent {
  type: string;
  detail: string | null;
  minute: number;
  extraMinute: number | null;
  team: string | null;
  player: string | null;
  assist: string | null;
}

function eventIcon(event: MatchEvent): string {
  if (event.type === "goal") return "⚽";
  if (event.type === "card") return event.detail?.toLowerCase().includes("red") ? "🟥" : "🟨";
  if (event.type === "subst") return "🔄";
  return "•";
}

function eventText(event: MatchEvent): string {
  const minute = `${event.minute}${event.extraMinute ? `+${event.extraMinute}` : ""}'`;
  if (event.type === "goal") {
    const scorer = event.player ?? `Mål (${event.team ?? "okänt lag"})`;
    return event.assist ? `${minute} ${scorer} (assist: ${event.assist})` : `${minute} ${scorer}`;
  }
  if (event.type === "card") {
    const who = event.player ?? `Spelare (${event.team ?? "okänt lag"})`;
    return `${minute} ${who}`;
  }
  if (event.type === "subst") {
    if (event.player && event.assist) return `${minute} ${event.assist} → ${event.player}`;
    return `${minute} Byte (${event.team ?? "okänt lag"})`;
  }
  return `${minute} ${event.detail ?? event.type}`;
}

/**
 * Minut-för-minut-lista. Motståndarlag vi inte importerat spelartrupp för
 * (bara IFK/AIK har det) visar lagnamn utan spelarnamn — se eventText()
 * fallback-format ovan. Aldrig ett påhittat namn.
 */
export function MatchTimeline({ events }: { events: MatchEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-[#898781]">Inga matchhändelser importerade för den här matchen än.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {events.map((e, i) => (
        <li key={i} className="flex items-center gap-2 border-t border-white/5 pt-1.5 text-sm">
          <span aria-hidden>{eventIcon(e)}</span>
          <span className="text-[#c3c2b7]">{eventText(e)}</span>
          <span className="ml-auto text-xs text-[#898781]">{e.team}</span>
        </li>
      ))}
    </ul>
  );
}
