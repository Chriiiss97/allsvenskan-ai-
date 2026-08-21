import Link from "next/link";
import { PlayerAvatar } from "./PlayerAvatar";
import { translatePosition } from "@/lib/i18n/sv";
import { getTeamAccent } from "@/lib/data/team-colors";
import { ovrColor, deltaColor } from "@/lib/football/rating/ovr-color";

export interface PlayerCardStat {
  goals: number;
  assists: number;
  appearances: number;
  minutesPlayed: number;
  // "all" = summerat över alla importerade säsonger (2022–2024), annars ett
  // specifikt säsongsår — se Spelare-sidans säsongsväljare.
  year: number | "all";
}

export interface PlayerCardData {
  id: number;
  full_name: string;
  position: string | null;
  photoUrl: string | null;
  teamName: string | null;
  teamExternalId: number | null;
  stat: PlayerCardStat | null;
  /** Player Rating OVR (0–99) — odefinierad/null döljer badgen helt (t.ex. lagtruppens vy som inte alltid har en säsong att räkna mot). */
  rating?: number | null;
  /** Visas i undertexten om satt (t.ex. Scout) — odefinierad/null döljer den helt, samma mönster som position. */
  age?: number | null;
  /** OVR-förändring mot en jämförelsesäsong (t.ex. Scout:s utvecklingsfilter) — odefinierad/null döljer chippen helt. */
  ovrDelta?: number | null;
  /** Scout Engine Fas 4 — regelbaserade spelartyper (t.ex. "Målskytt"). Odefinierad/tom döljer raden helt. */
  archetypes?: { label: string; definition: string }[];
  /** Scout Engine Fas 6 — hur väl spelaren matchar de aktiva Scout-kriterierna, transparent (se lib/football/rating/scout-match.ts). Odefinierad/null döljer badgen helt (t.ex. inga filter aktiva). */
  scoutMatch?: { percent: number; criteria: { label: string; strong: boolean }[] } | null;
}

export type PlayerSortKey = "name" | "goals" | "assists" | "appearances" | "minutes";

// Positionsgrupp -> färg. Återanvänder redan etablerade tokens (blå/orange
// från kategorisk-paletten, grönt/gult från status-paletten) istället för
// att introducera nya kulörer bara för det här badget.
const POSITION_COLORS: Record<string, string> = {
  Goalkeeper: "#eab308",
  Defender: "#3987e5",
  Midfielder: "#0ca30c",
  Attacker: "#d95926",
  Forward: "#d95926",
};

function primaryStatFor(stat: PlayerCardStat, sort: PlayerSortKey): { value: number; label: string } | null {
  const yearLabel = stat.year === "all" ? "totalt" : String(stat.year);
  switch (sort) {
    case "goals":
      return { value: stat.goals, label: `mål ${yearLabel}` };
    case "assists":
      return { value: stat.assists, label: `assist ${yearLabel}` };
    case "appearances":
      return { value: stat.appearances, label: `matcher ${yearLabel}` };
    case "minutes":
      return { value: stat.minutesPlayed, label: `min ${yearLabel}` };
    default:
      return { value: stat.goals, label: `mål ${yearLabel}` };
  }
}

/**
 * Ett spelarkort — återanvänds av både spelarlistan (/data/players) och
 * lagprofilens truppsektion, så det bara finns EN kortstil att hålla
 * konsekvent. Positionsbadge + tunn klubbfärgad vänsterkant bryter den
 * annars enformiga "identisk box"-känslan utan att göra varje kort till
 * ett eget litet konstverk.
 */
export function PlayerCard({
  player,
  sort = "name",
  href,
  active = false,
}: {
  player: PlayerCardData;
  sort?: PlayerSortKey;
  /** Scout Engine Fas 7 — override av standardmålet (`/data/players/{id}`), t.ex. Scout:s "stanna kvar, öppna detaljpanel"-länk. Odefinierad = oförändrat beteende för alla befintliga anropare. */
  href?: string;
  /** Scout Engine Fas 7 — visuellt markerad som den just nu öppna detaljpanelens spelare. */
  active?: boolean;
}) {
  const accent = getTeamAccent(player.teamExternalId);
  const positionColor = player.position ? POSITION_COLORS[player.position] : undefined;
  const primaryStat = player.stat ? primaryStatFor(player.stat, sort) : null;
  const matchTooltip = player.scoutMatch
    ? player.scoutMatch.criteria.map((c) => `${c.strong ? "✅" : "⚠️"} ${c.label}`).join("\n")
    : undefined;

  return (
    <Link
      href={href ?? `/data/players/${player.id}`}
      className={`flex items-center gap-3 rounded-xl border border-l-2 bg-[#1a1a19] p-3 transition-colors hover:border-white/25 hover:bg-white/[.03] ${
        active ? "border-[#3987e5]/50 bg-white/[.03]" : "border-white/10"
      }`}
      style={{ borderLeftColor: accent }}
    >
      <PlayerAvatar name={player.full_name} teamExternalId={player.teamExternalId} photoUrl={player.photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{player.full_name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate text-xs text-[#898781]">{player.teamName ?? "—"}</span>
          {player.position && (
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: `${positionColor}22`, color: positionColor }}
            >
              {translatePosition(player.position)}
            </span>
          )}
          {player.age != null && <span className="shrink-0 text-xs text-[#898781]">{player.age} år</span>}
          {player.scoutMatch != null && (
            <span
              title={matchTooltip}
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold"
              style={{ backgroundColor: `${ovrColor(player.scoutMatch.percent)}22`, color: ovrColor(player.scoutMatch.percent) }}
            >
              {player.scoutMatch.percent}% match
            </span>
          )}
        </div>
        {player.archetypes && player.archetypes.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {player.archetypes.map((a) => (
              <span
                key={a.label}
                title={a.definition}
                className="rounded bg-[#3987e5]/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#3987e5]"
              >
                {a.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {player.ovrDelta != null && (
        <div
          className="shrink-0 rounded-lg px-1.5 py-1 text-center"
          style={{ backgroundColor: `${deltaColor(player.ovrDelta)}1a` }}
          title="OVR-förändring mot jämförelsesäsongen"
        >
          <p className="text-xs font-bold leading-none tabular-nums" style={{ color: deltaColor(player.ovrDelta) }}>
            {player.ovrDelta > 0 ? "+" : ""}
            {player.ovrDelta}
          </p>
        </div>
      )}
      {player.rating != null && (
        <div
          className="shrink-0 rounded-lg px-2 py-1 text-center"
          style={{ backgroundColor: `${ovrColor(player.rating)}1a` }}
          title="Player Rating — statistisk 0–99-OVR"
        >
          <p className="text-sm font-bold leading-none tabular-nums" style={{ color: ovrColor(player.rating) }}>
            {player.rating}
          </p>
          <p className="mt-0.5 text-[9px] leading-none text-[#898781]">OVR</p>
        </div>
      )}
      {primaryStat && (
        <div className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-right">
          <p className="text-sm font-semibold leading-none">{primaryStat.value}</p>
          <p className="mt-0.5 text-[9px] leading-none text-[#898781]">{primaryStat.label}</p>
        </div>
      )}
    </Link>
  );
}
