import Link from "next/link";

interface MatchEvent {
  type: string;
  detail: string | null;
  minute: number;
  extraMinute: number | null;
  team: string | null;
  player: string | null;
  playerId?: number | null;
  assist: string | null;
  assistId?: number | null;
}

function eventIcon(event: MatchEvent): string {
  if (event.type === "goal") return "⚽";
  if (event.type === "card") return event.detail?.toLowerCase().includes("red") ? "🟥" : "🟨";
  if (event.type === "subst") return "🔄";
  return "•";
}

/** Klickbar spelarlänk när vi har ett säkert spelar-id, annars vanlig text —
 * gissar ALDRIG ett id från namnet. */
function PlayerLink({ name, id }: { name: string; id: number | null | undefined }) {
  if (id == null) return <span>{name}</span>;
  return (
    <Link href={`/spelare/${id}`} className="text-[#c3c2b7] underline decoration-white/20 underline-offset-2 transition-colors hover:text-white hover:decoration-white/50">
      {name}
    </Link>
  );
}

function EventContent({ event }: { event: MatchEvent }) {
  if (event.type === "goal") {
    const scorer = event.player ? <PlayerLink name={event.player} id={event.playerId} /> : `Mål (${event.team ?? "okänt lag"})`;
    return (
      <>
        {scorer}
        {event.assist && (
          <span className="text-[#898781]">
            {" "}
            (assist: <PlayerLink name={event.assist} id={event.assistId} />)
          </span>
        )}
      </>
    );
  }
  if (event.type === "card") {
    return event.player ? <PlayerLink name={event.player} id={event.playerId} /> : <>Spelare ({event.team ?? "okänt lag"})</>;
  }
  if (event.type === "subst") {
    if (event.player && event.assist) {
      return (
        <>
          <PlayerLink name={event.assist} id={event.assistId} /> <span className="text-[#898781]">→</span> <PlayerLink name={event.player} id={event.playerId} />
        </>
      );
    }
    return <>Byte ({event.team ?? "okänt lag"})</>;
  }
  return <>{event.detail ?? event.type}</>;
}

/**
 * Fas 16e/16f (2026-08-22) — matchhändelser som en riktig tidslinje: hemmalaget
 * till vänster, bortalaget till höger, en genomgående mittlinje med
 * minuten som en "hållplats"-markör där en händelse faktiskt sker.
 *
 * Fas 16f: alla spelarnamn (målskytt/assist/kort/byten) är nu klickbara
 * länkar till /spelare/[id] — men ENDAST när eventet faktiskt har ett
 * player_id kopplat (samma säkra koppling som event-tabellen redan har,
 * ingen ny gissning). Ett event utan kopplat spelar-id (t.ex. motståndarlag
 * vi saknar trupp för) visar namnet som vanlig text, aldrig en trasig länk.
 */
export function MatchTimeline({ events, homeName, awayName }: { events: MatchEvent[]; homeName: string; awayName: string }) {
  if (events.length === 0) {
    return <p className="text-sm text-[#898781]">Inga matchhändelser importerade för den här matchen än.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs font-medium text-[#898781]">
        <span className="truncate">{homeName}</span>
        <span className="truncate text-right">{awayName}</span>
      </div>
      <div className="relative">
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10" aria-hidden />
        {events.map((e, i) => {
          const isHome = e.team === homeName;
          const minuteLabel = `${e.minute}${e.extraMinute ? `+${e.extraMinute}` : ""}'`;
          const content = (
            <span className="inline-flex items-center gap-1.5 text-sm text-[#c3c2b7]">
              {isHome && <span aria-hidden>{eventIcon(e)}</span>}
              <span>
                <EventContent event={e} />
              </span>
              {!isHome && <span aria-hidden>{eventIcon(e)}</span>}
            </span>
          );
          return (
            <div key={i} className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
              <div className="text-right">{isHome && content}</div>
              <span className="z-10 rounded-full bg-[#0d0d0d] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white ring-1 ring-white/10">
                {minuteLabel}
              </span>
              <div>{!isHome && content}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
